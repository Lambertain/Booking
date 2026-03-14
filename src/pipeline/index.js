const fs = require('fs');
const path = require('path');
const { openPage } = require('../extractor/adspower');
const modelKartei = require('../extractor/model-kartei');
const adultfolio = require('../extractor/adultfolio');
const modelmayhem = require('../extractor/modelmayhem');
const { generateDraft } = require('../ai/grok');
const { queueApproval } = require('../bot/index');
const { sendReply } = require('../extractor/sender');

const MODELS_DIR = path.resolve(__dirname, '../../models');
const DATA_DIR = path.resolve(__dirname, '../../data');

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

function makeDialogId(item) {
  return `${item.site}::${item.photographer}::${item.url}`;
}

async function runPipelineForModel(modelSlug) {
  const config = loadModelConfig(modelSlug);
  const modelName = config.modelName;
  const profileId = config.adspower.profileId;
  const modelDir = getModelDir(modelSlug);

  console.log(`[pipeline] Starting scan for ${modelName}...`);

  let browser, page;
  try {
    ({ browser, page } = await openPage(profileId));
  } catch (err) {
    console.error(`[pipeline] Failed to open AdsPower for ${modelName}: ${err.message}`);
    return;
  }

  const allQualified = [];

  for (const siteConfig of config.sites) {
    const extractor = extractors[siteConfig.id];
    if (!extractor) {
      console.log(`[pipeline] No extractor for ${siteConfig.id}, skipping`);
      continue;
    }

    try {
      console.log(`[pipeline] Extracting from ${siteConfig.label}...`);
      const qualified = await extractor.extract(page, siteConfig, modelName);
      console.log(`[pipeline] ${siteConfig.label}: ${qualified.length} qualified dialogs`);
      allQualified.push(...qualified);
    } catch (err) {
      console.error(`[pipeline] ${siteConfig.label} extraction failed: ${err.message}`);
    }
  }

  await browser.close();

  // Filter out already processed
  const processedIds = loadProcessedIds(modelSlug);
  const newItems = allQualified.filter(item => !processedIds.has(makeDialogId(item)));

  if (newItems.length === 0) {
    console.log(`[pipeline] No new qualified dialogs for ${modelName}`);
    return;
  }

  console.log(`[pipeline] ${newItems.length} new items to process for ${modelName}`);

  // Generate drafts with Grok and queue for approval
  for (const item of newItems) {
    try {
      const draft = await generateDraft(
        modelDir, modelName,
        item.messages, item.lastIncoming,
        item.photographer, item.language
      );
      item.draft = draft;
    } catch (err) {
      console.error(`[pipeline] Grok draft failed for ${item.photographer}: ${err.message}`);
      item.draft = `Hello ${item.photographer},\nthank you for your message. Please send me the date, time, duration, shooting level, and location so I can confirm.\nBest regards,\n${modelName.split(' ')[0]}`;
    }

    // Queue for Telegram approval
    const result = await queueApproval(item);

    if (result.action === 'approve') {
      console.log(`[pipeline] Approved: ${item.photographer} (${item.siteLabel})`);
      await trySendReply(config, item, result.text);
    } else if (result.action === 'edit') {
      console.log(`[pipeline] Edited: ${item.photographer} (${item.siteLabel})`);
      await trySendReply(config, item, result.text);
    } else {
      console.log(`[pipeline] Skipped: ${item.photographer} (${item.siteLabel})`);
    }

    // Mark as processed regardless of action
    processedIds.add(makeDialogId(item));
    saveProcessedIds(modelSlug, processedIds);
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
