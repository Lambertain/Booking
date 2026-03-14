const fs = require('fs');
const path = require('path');
const { openPage } = require('../extractor/adspower');
const modelKartei = require('../extractor/model-kartei');
const adultfolio = require('../extractor/adultfolio');
const modelmayhem = require('../extractor/modelmayhem');
const { generateDraft, qualifyDialog, classifyDraft } = require('../ai/grok');
const { queueApproval } = require('../bot/index');
const { sendReply } = require('../extractor/sender');

const MODELS_DIR = path.resolve(__dirname, '../../models');
const DATA_DIR = path.resolve(__dirname, '../../data');

// Training mode: all replies go through approval
// Set to false when manager confirms AI writes well enough
const TRAINING_MODE = true;

const extractors = {
  'model-kartei': modelKartei,
  'adultfolio': adultfolio,
  'modelmayhem': modelmayhem
};

function loadModelConfig(modelSlug) {
  const configPath = path.join(MODELS_DIR, modelSlug, 'config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function getModelDir(modelSlug) {
  return path.join(MODELS_DIR, modelSlug);
}

function getDataDir(modelSlug) {
  const dir = path.join(DATA_DIR, modelSlug);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getProcessedPath(modelSlug) {
  const dir = path.join(getDataDir(modelSlug), 'processed');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'processed-ids.json');
}

function loadProcessedIds(modelSlug) {
  const fp = getProcessedPath(modelSlug);
  if (!fs.existsSync(fp)) return new Set();
  try {
    return new Set(JSON.parse(fs.readFileSync(fp, 'utf8')));
  } catch {
    return new Set();
  }
}

function saveProcessedIds(modelSlug, ids) {
  fs.writeFileSync(getProcessedPath(modelSlug), JSON.stringify([...ids], null, 2), 'utf8');
}

// Approved responses log — builds training data
function getApprovedLogPath(modelSlug) {
  const dir = path.join(getDataDir(modelSlug), 'training');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'approved-responses.jsonl');
}

function logApprovedResponse(modelSlug, item, finalText, action) {
  const logPath = getApprovedLogPath(modelSlug);
  const entry = {
    timestamp: new Date().toISOString(),
    site: item.site,
    photographer: item.photographer,
    url: item.url,
    language: item.language,
    messages: item.messages,
    lastIncoming: item.lastIncoming,
    aiDraft: item.draft,
    finalText,
    action, // 'approve' (AI was good) or 'edit' (AI needed correction)
    draftType: item.draftType || 'unknown'
  };
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
}

function makeDialogId(item) {
  return `${item.site}::${item.photographer}::${item.url}`;
}

// Date/time mentions in draft = always needs approval (model needs to plan travel)
function mentionsDateTime(text) {
  return /\b\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?\b/.test(text) ||
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text) ||
    /\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/i.test(text) ||
    /\b(понедельник|вторник|сред[аы]|четверг|пятниц[аы]|суббот[аы]|воскресень[ея])\b/i.test(text) ||
    /\b\d{1,2}:\d{2}\b/.test(text) ||
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(text) ||
    /\b(januar|februar|mä?rz|april|mai|juni|juli|august|september|oktober|november|dezember)\b/i.test(text);
}

async function runPipelineForModel(modelSlug) {
  const config = loadModelConfig(modelSlug);
  const modelName = config.modelName;
  const profileId = config.adspower.profileId;
  const modelDir = getModelDir(modelSlug);

  console.log(`[pipeline] Starting scan for ${modelName}...`);

  // 1. Extract dialogs from all sites — open browser, extract, close
  let session;
  try {
    session = await openPage(profileId);
  } catch (err) {
    console.error(`[pipeline] Failed to open AdsPower for ${modelName}: ${err.message}`);
    return;
  }

  const allDialogs = [];

  try {
    for (const siteConfig of config.sites) {
      const extractor = extractors[siteConfig.id];
      if (!extractor) continue;

      try {
        console.log(`[pipeline] Extracting from ${siteConfig.label}...`);
        const dialogs = await extractor.extract(session.page, siteConfig, modelName);
        console.log(`[pipeline] ${siteConfig.label}: ${dialogs.length} dialogs extracted`);
        allDialogs.push(...dialogs);
      } catch (err) {
        console.error(`[pipeline] ${siteConfig.label} extraction failed: ${err.message}`);
      }
    }
  } finally {
    await session.close();
  }

  // 2. Filter already processed
  const processedIds = loadProcessedIds(modelSlug);
  const newItems = allDialogs.filter(item => !processedIds.has(makeDialogId(item)));

  if (newItems.length === 0) {
    console.log(`[pipeline] No new dialogs for ${modelName}`);
    return;
  }

  console.log(`[pipeline] ${newItems.length} new dialogs to qualify for ${modelName}`);

  // 3. Qualify → draft → approve/send
  for (const item of newItems) {
    try {
      // Qualify with Grok AI
      const q = await qualifyDialog(item.messages, item.photographer, item.siteLabel);
      item.qualified = q.qualified;
      item.qualificationReason = q.reason;

      if (!q.qualified) {
        console.log(`[pipeline] ❌ ${item.photographer} (${item.siteLabel}): ${q.reason}`);
        processedIds.add(makeDialogId(item));
        saveProcessedIds(modelSlug, processedIds);
        continue;
      }

      console.log(`[pipeline] ✅ ${item.photographer} (${item.siteLabel}): ${q.reason}`);

      // Generate draft with Grok
      const draft = await generateDraft(
        modelDir, modelName,
        item.messages, item.lastIncoming,
        item.photographer, item.language
      );
      item.draft = draft;

      // Classify draft type
      const draftType = await classifyDraft(modelDir, draft, item.messages, item.photographer);
      item.draftType = draftType;

      // Determine if approval is needed
      const needsApproval = TRAINING_MODE ||
        draftType === 'custom' ||
        mentionsDateTime(draft);

      if (needsApproval) {
        const reason = TRAINING_MODE ? 'training mode' :
          mentionsDateTime(draft) ? 'mentions date/time' : 'custom response';
        console.log(`[pipeline] 🔔 ${item.photographer} → approval (${reason})`);

        const result = await queueApproval(item);

        if (result.action === 'approve' || result.action === 'edit') {
          const finalText = result.action === 'edit' ? result.text : (result.text || draft);
          await trySendReply(config, item, finalText);
          logApprovedResponse(modelSlug, item, finalText, result.action);
          console.log(`[pipeline] ${result.action === 'approve' ? '✅' : '✏️'} ${item.photographer}: reply sent`);
        } else {
          console.log(`[pipeline] ⏭ Skipped: ${item.photographer}`);
        }
      } else {
        // Auto-send (only when TRAINING_MODE is false)
        console.log(`[pipeline] 📤 Auto-sending to ${item.photographer}`);
        await trySendReply(config, item, draft);
        logApprovedResponse(modelSlug, item, draft, 'auto');
        try {
          const { bot } = require('../bot/index');
          await bot.api.sendMessage(process.env.TELEGRAM_CHAT_ID,
            `📤 Auto-sent to ${item.photographer} (${item.siteLabel}):\n\n${draft}`
          );
        } catch {}
      }

      processedIds.add(makeDialogId(item));
      saveProcessedIds(modelSlug, processedIds);
    } catch (err) {
      console.error(`[pipeline] Error processing ${item.photographer}: ${err.message}`);
    }
  }
}

async function trySendReply(config, item, text) {
  if (!text) return;
  const siteConfig = config.sites.find(s => s.id === item.site);
  if (!siteConfig) {
    console.error(`[pipeline] No site config for ${item.site}`);
    return;
  }
  try {
    await sendReply(config.adspower.profileId, siteConfig, item.url, text);
    console.log(`[pipeline] Reply sent to ${item.photographer} on ${item.siteLabel}`);
  } catch (err) {
    console.error(`[pipeline] Failed to send reply to ${item.photographer}: ${err.message}`);
  }
}

module.exports = { runPipelineForModel };
