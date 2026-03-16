const fs = require('fs');
const path = require('path');
const { openPage } = require('../extractor/adspower');
const modelKartei = require('../extractor/model-kartei');
const adultfolio = require('../extractor/adultfolio');
const modelmayhem = require('../extractor/modelmayhem');
const { generateDraft, qualifyDialog, classifyDraft, extractShootDetails } = require('../ai/grok');
const { addToQueue } = require('./queue');
const { sendReply } = require('../extractor/sender');
const { recordShoot } = require('../airtable/index');

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

// processedIds: { dialogId: { msgCount, lastIncoming, timestamp } }
function loadProcessed(modelSlug) {
  const fp = getProcessedPath(modelSlug);
  if (!fs.existsSync(fp)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    // Migration: old format was array of strings
    if (Array.isArray(data)) {
      const obj = {};
      for (const id of data) obj[id] = { msgCount: 0, lastIncoming: '', timestamp: new Date().toISOString() };
      return obj;
    }
    return data;
  } catch { return {}; }
}

function saveProcessed(modelSlug, processed) {
  fs.writeFileSync(getProcessedPath(modelSlug), JSON.stringify(processed, null, 2), 'utf8');
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

  // 2. Filter: new dialogs OR dialogs with new messages from photographer
  const processed = loadProcessed(modelSlug);
  const newItems = allDialogs.filter(item => {
    const id = makeDialogId(item);
    const prev = processed[id];
    if (!prev) return true; // never seen

    // Check if photographer sent new messages
    const lastIncoming = item.lastIncoming || '';
    const msgCount = (item.messages || []).filter(m => m.role === 'interlocutor').length;

    if (lastIncoming !== prev.lastIncoming || msgCount > prev.msgCount) {
      console.log(`[pipeline] 🔄 Нове повідомлення від ${item.photographer}: "${lastIncoming.slice(0, 60)}"`);
      return true;
    }
    return false;
  });

  if (newItems.length === 0) {
    console.log(`[pipeline] Немає нових діалогів для ${modelName}`);
    return;
  }

  console.log(`[pipeline] ${newItems.length} діалогів для обробки (${modelName})`);

  // 3. Qualify → draft → approve/send
  for (const item of newItems) {
    try {
      // Qualify with Grok AI
      const q = await qualifyDialog(item.messages, item.photographer, item.siteLabel);
      item.qualified = q.qualified;
      item.qualificationReason = q.reason;

      if (!q.qualified) {
        console.log(`[pipeline] ❌ ${item.photographer} (${item.siteLabel}): ${q.reason}`);
        processed[makeDialogId(item)] = {
          msgCount: (item.messages || []).filter(m => m.role === 'interlocutor').length,
          lastIncoming: item.lastIncoming || '',
          timestamp: new Date().toISOString()
        };
        saveProcessed(modelSlug, processed);
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

      // Add to approval queue (bot will process one at a time)
      item.modelSlug = modelSlug;
      const added = addToQueue(item);
      if (added) {
        console.log(`[pipeline] 📋 Queued: ${item.photographer} (${item.siteLabel}) — ${item.draftType}`);
      } else {
        console.log(`[pipeline] Already in queue: ${item.photographer}`);
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

async function tryRecordShoot(item) {
  try {
    const details = await extractShootDetails(item.messages, item.photographer, item.siteLabel);
    if (!details) {
      console.log(`[pipeline] No shoot details extracted for ${item.photographer}`);
      return;
    }
    await recordShoot({
      ...details,
      photographer: item.photographer,
      siteName: item.siteLabel
    });
  } catch (err) {
    console.error(`[pipeline] Airtable record failed for ${item.photographer}: ${err.message}`);
  }
}

module.exports = { runPipelineForModel };
