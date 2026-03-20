const fs = require('fs');
const path = require('path');
const { openPage } = require('../extractor/adspower');
const modelKartei = require('../extractor/model-kartei');
const adultfolio = require('../extractor/adultfolio');
const modelmayhem = require('../extractor/modelmayhem');
const purpleport = require('../extractor/purpleport');
const { generateDraft, qualifyDialog, classifyDraft, extractShootDetails, translateToEnglish } = require('../ai/grok');
const { addToQueue } = require('./queue');
const { sendReply } = require('../extractor/sender');
const { recordShoot } = require('../airtable/index');
const db = require('../db/index');

const MODELS_DIR = path.resolve(__dirname, '../../models');
const DATA_DIR = path.resolve(__dirname, '../../data');

// Training mode: all replies go through approval
// Set to false when manager confirms AI writes well enough
const TRAINING_MODE = true;

const extractors = {
  'model-kartei': modelKartei,
  'adultfolio': adultfolio,
  'modelmayhem': modelmayhem,
  'purpleport': purpleport
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

const { detectLanguage } = require('../extractor/qualify');

async function extractSingleDialogByUrl(page, active, siteConfig, modelName) {
  await page.goto(active.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  if (active.site === 'model-kartei') {
    const sel = siteConfig.selectors;
    const messages = await page.evaluate(({ rowSel, textSel, selfSel }) => {
      return [...document.querySelectorAll(rowSel)].map(row => {
        const text = (row.querySelector(textSel)?.innerText || '').trim();
        const isSelf = row.matches(selfSel) || row.className.includes('sedcard1');
        return { role: isSelf ? 'self' : 'interlocutor', text };
      }).filter(m => m.text);
    }, { rowSel: sel.messageRow, textSel: sel.messageText, selfSel: sel.messageAuthorSelf });

    // Model-Kartei shows messages newest-first, reverse to chronological order
    messages.reverse();

    if (messages.length === 0) return null;
    const lastIncoming = [...messages].reverse().find(m => m.role === 'interlocutor');
    if (!lastIncoming) return null;

    return {
      site: 'model-kartei', siteLabel: 'Model-Kartei', model: modelName,
      photographer: active.photographer, url: active.url,
      language: detectLanguage(lastIncoming.text), messages, lastIncoming: lastIncoming.text
    };
  }

  if (active.site === 'adultfolio') {
    const selfPattern = siteConfig.selfProfilePattern || 'Ana_Voloshina';
    const dialog = await page.evaluate((selfPat) => {
      const messages = [...document.querySelectorAll('.messageContainer')].map(el => {
        const profileHref = el.querySelector('.thumbnailPic')?.getAttribute('href') || '';
        const role = new RegExp(selfPat, 'i').test(profileHref) ? 'self' : 'interlocutor';
        const text = (el.querySelector('[id^="message-content-"]')?.innerText || '').trim();
        return { role, text };
      }).filter(m => m.text);
      return { url: location.href, messages };
    }, selfPattern);

    if (dialog.messages.length === 0) return null;
    const lastIncoming = [...dialog.messages].reverse().find(m => m.role === 'interlocutor');
    if (!lastIncoming) return null;

    return {
      site: 'adultfolio', siteLabel: 'adultfolio.com', model: modelName,
      photographer: active.photographer, url: active.url,
      language: detectLanguage(lastIncoming.text), messages: dialog.messages, lastIncoming: lastIncoming.text
    };
  }

  if (active.site === 'modelmayhem') {
    const selfProfileId = siteConfig.selfProfileId || '';
    const dialog = await page.evaluate(({ selfProfileId, selfName }) => {
      const senderBoxes = [...document.querySelectorAll('.SenderBox')];
      const textNodes = [...document.querySelectorAll('.MessagesSection .text')];
      const messages = senderBoxes.map((sb, i) => {
        const link = sb.querySelector('a[href^="/"]')?.getAttribute('href') || '';
        const name = (sb.innerText || '').split('\n').map(x => x.trim()).filter(Boolean)[0] || '';
        const text = (textNodes[i]?.innerText || '').trim();
        const isSelf = link.includes('/' + selfProfileId) || name.toLowerCase() === selfName.toLowerCase();
        return { role: isSelf ? 'self' : 'interlocutor', text };
      }).filter(m => m.text);
      return { url: location.href, messages };
    }, { selfProfileId, selfName: modelName });

    if (dialog.messages.length === 0) return null;
    const lastIncoming = [...dialog.messages].reverse().find(m => m.role === 'interlocutor');
    if (!lastIncoming) return null;

    return {
      site: 'modelmayhem', siteLabel: 'Model Mayhem', model: modelName,
      photographer: active.photographer, url: active.url,
      language: detectLanguage(lastIncoming.text), messages: dialog.messages, lastIncoming: lastIncoming.text
    };
  }

  if (active.site === 'purpleport') {
    const selfPattern = siteConfig.selfProfilePattern || '';
    const dialog = await page.evaluate((selfPat) => {
      const contentBlocks = [...document.querySelectorAll('div.message div.content')];
      const messages = contentBlocks.map(block => {
        const authorLink = block.querySelector('a.portlink');
        const authorName = (authorLink?.textContent || '').trim();
        const authorHref = authorLink?.getAttribute('href') || '';
        const textDiv = block.querySelector('div');
        const text = (textDiv?.innerText || '').trim();
        const isSelf = authorName === 'Me' ||
          (selfPat && authorHref.toLowerCase().includes(selfPat.toLowerCase()));
        return { role: isSelf ? 'self' : 'interlocutor', text };
      }).filter(m => m.text);
      return { messages };
    }, selfPattern);

    if (dialog.messages.length === 0) return null;
    const lastIncoming = [...dialog.messages].reverse().find(m => m.role === 'interlocutor');
    if (!lastIncoming) return null;

    return {
      site: 'purpleport', siteLabel: 'PurplePort', model: modelName,
      photographer: active.photographer, url: active.url,
      language: detectLanguage(lastIncoming.text), messages: dialog.messages, lastIncoming: lastIncoming.text
    };
  }

  return null;
}

async function runPipelineForModel(modelSlug) {
  const config = loadModelConfig(modelSlug);
  const modelName = config.modelName;
  const profileId = config.adspower.profileId;
  const modelDir = getModelDir(modelSlug);

  // Migrate JSON → DB on first run (one-time)
  db.migrateFromJson(modelSlug);

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
    // Extract from inbox (recent/unread dialogs)
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

    // Also check active dialogs from DB (queued/sent — may have left inbox)
    const activeDialogs = db.getActiveDialogs(modelSlug);
    const existingUrls = new Set(allDialogs.map(d => d.url));

    for (const active of activeDialogs) {
      if (existingUrls.has(active.url)) continue; // already in inbox results

      const siteConfig = config.sites.find(s => s.id === active.site);
      if (!siteConfig) continue;

      try {
        console.log(`[pipeline] 🔍 Перевіряю активний діалог: ${active.photographer} (${active.site})`);
        const dialog = await extractSingleDialogByUrl(session.page, active, siteConfig, modelName);
        if (dialog) allDialogs.push(dialog);
      } catch (err) {
        console.error(`[pipeline] Active dialog check failed for ${active.photographer}: ${err.message}`);
      }
    }
  } finally {
    await session.close();
  }

  // 2. Filter: only dialogs where last message is from photographer (not us)
  //    AND either never seen or photographer sent new messages
  const newItems = allDialogs.filter(item => {
    const msgs = item.messages || [];
    if (msgs.length === 0) return false;

    // Skip if last message is ours — we already replied
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg.role === 'self') {
      // Update status to 'sent' if it was 'queued'
      const existing = db.getDialog(item.site, item.url);
      if (existing && existing.status === 'queued') {
        db.updateStatus(item.site, item.url, 'sent');
      }
      console.log(`[pipeline] ⏩ ${item.photographer}: останнє смс наше, скіп`);
      return false;
    }

    const lastIncoming = item.lastIncoming || '';
    const msgCount = msgs.filter(m => m.role === 'interlocutor').length;

    // Check DB for previous state
    const prev = db.getDialog(item.site, item.url);

    if (!prev) return true; // never seen — new dialog

    // Update photographer name if it changed (extraction improvements)
    if (item.photographer && item.photographer !== prev.photographer) {
      db.updatePhotographer(item.site, item.url, item.photographer);
    }

    // Check if photographer sent new messages since we last processed
    if (lastIncoming !== prev.last_incoming || msgCount > prev.msg_count) {
      console.log(`[pipeline] 🔄 Нове повідомлення від ${item.photographer}: "${lastIncoming.slice(0, 60)}"`);
      return true;
    }

    // Recover lost queued dialogs — if status is 'queued' but not in approval queue,
    // it was lost during a restart. Re-process it.
    if (prev.status === 'queued') {
      const { loadQueue } = require('./queue');
      const queue = loadQueue();
      const inQueue = queue.some(q => q.site === item.site && q.url === item.url);
      if (!inQueue) {
        console.log(`[pipeline] 🔁 Відновлюю втрачений діалог: ${item.photographer} (${item.siteLabel})`);
        return true;
      }
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
      // Check if this is an active dialog (we already replied before)
      const existing = db.getDialog(item.site, item.url);
      const isActive = existing && (existing.status === 'sent' || existing.status === 'queued');

      if (isActive) {
        // Active dialog — skip Grok qualification, go straight to draft
        console.log(`[pipeline] 🔄 Активний діалог: ${item.photographer} (${item.siteLabel})`);
        item.qualified = true;
        item.qualificationReason = 'active dialog';
      } else {
        // New dialog — qualify with Grok AI
        const q = await qualifyDialog(item.messages, item.photographer, item.siteLabel);
        item.qualified = q.qualified;
        item.qualificationReason = q.reason;

        if (!q.qualified) {
          console.log(`[pipeline] ❌ ${item.photographer} (${item.siteLabel}): ${q.reason}`);
          db.upsertDialog({
            site: item.site, url: item.url,
            photographer: item.photographer, modelSlug,
            status: 'rejected',
            lastIncoming: item.lastIncoming || '',
            msgCount: (item.messages || []).filter(m => m.role === 'interlocutor').length
          });
          continue;
        }

        console.log(`[pipeline] ✅ ${item.photographer} (${item.siteLabel}): ${q.reason}`);
      }

      // Generate draft with Grok
      const draft = await generateDraft(
        modelDir, modelName,
        item.messages, item.lastIncoming,
        item.photographer, item.language
      );
      item.draft = draft;

      // Translate incoming to English if needed
      if (item.language && item.language !== 'en') {
        const translated = await translateToEnglish(item.lastIncoming);
        if (translated) item.lastIncomingEn = translated;
      }

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

      // Save to DB — status 'queued' (active, will be checked every scan)
      db.upsertDialog({
        site: item.site, url: item.url,
        photographer: item.photographer, modelSlug,
        status: 'queued',
        lastIncoming: item.lastIncoming || '',
        msgCount: (item.messages || []).filter(m => m.role === 'interlocutor').length
      });
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
