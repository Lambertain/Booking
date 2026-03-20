const fs = require('fs');
const path = require('path');
const { runPipelineForModel } = require('../pipeline/index');
const { takeSendNext, sendQueueLength } = require('../pipeline/send-queue');
const { sendReply } = require('../extractor/sender');

const MODELS_DIR = path.resolve(__dirname, '../../models');
const SCAN_INTERVAL = parseInt(process.env.SCAN_INTERVAL_MIN || '15', 10) * 60 * 1000;

function getModelSlugs() {
  return fs.readdirSync(MODELS_DIR)
    .filter(f => fs.existsSync(path.join(MODELS_DIR, f, 'config.json')));
}

function isWorkingHours() {
  const now = new Date();
  const kyivHour = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' })).getHours();
  return kyivHour >= 8 && kyivHour < 22;
}

let currentModelIndex = 0;
let isRunning = false;
let sendPaused = false;
let scanTimer = null;

// --- Send queue: open browser, send, close ---
async function processSendQueue() {
  if (sendPaused || sendQueueLength() === 0) return;

  const toSend = takeSendNext();
  if (!toSend) return;

  try {
    const configPath = path.join(MODELS_DIR, toSend.modelSlug, 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const siteConfig = config.sites.find(s => s.id === toSend.site);
    if (!siteConfig) throw new Error(`Site config not found: ${toSend.site}`);

    await sendReply(config.adspower.profileId, siteConfig, toSend.url, toSend.text, toSend.mediaFiles || []);
    console.log(`[scheduler] ✅ Надіслано: ${toSend.photographer} (${toSend.site})`);
    const { onDeliveryResult } = require('../bot/index');
    onDeliveryResult(true, toSend.photographer, toSend.site, null, toSend.url);
  } catch (err) {
    console.error(`[scheduler] ❌ Помилка відправки ${toSend.photographer}: ${err.message}`);
    // Auto-retry once after 30s before pausing
    const retryCount = toSend._retryCount || 0;
    if (retryCount < 1) {
      console.log(`[scheduler] 🔄 Авто-retry через 30с...`);
      toSend._retryCount = retryCount + 1;
      const { addToSendQueue } = require('../pipeline/send-queue');
      addToSendQueue(toSend);
      const { onDeliveryResult } = require('../bot/index');
      onDeliveryResult(false, toSend.photographer, toSend.site, `${err.message} (retry через 30с)`);
      await new Promise(r => setTimeout(r, 30000));
      // Try again immediately
      try { await processSendQueue(); } catch {}
    } else {
      const { onDeliveryResult } = require('../bot/index');
      onDeliveryResult(false, toSend.photographer, toSend.site, err.message);
      const { addToSendQueue } = require('../pipeline/send-queue');
      addToSendQueue(toSend);
      sendPaused = true;
    }
  }
}

let isSending = false;

// --- Triggered by bot after approve/edit: send + full scan ---
async function triggerSend() {
  // Send queue always works, even if pipeline is running
  if (!isSending) {
    isSending = true;
    try { await processSendQueue(); } finally { isSending = false; }
  }

  // Wait for AdsPower to settle after sender closed it
  await new Promise(r => setTimeout(r, 3000));

  // Full scan only if pipeline not running
  if (isRunning) return;
  isRunning = true;
  try {
    // Full scan — photographer may have replied
    if (isWorkingHours()) {
      const models = getModelSlugs();
      if (models.length > 0) {
        for (const modelSlug of models) {
          try { await runPipelineForModel(modelSlug); } catch {}
        }
      }
    }
    // Reset timer — next scan in 15 min from now
    resetScanTimer();
  } catch (err) {
    console.error(`[scheduler] triggerSend error: ${err.message}`);
  } finally {
    isRunning = false;
  }
}

// --- Full scan: send queue + extract from sites ---
async function runFullScan() {
  if (isRunning) return;
  isRunning = true;
  try {
    await processSendQueue();

    if (!isWorkingHours()) return;

    const models = getModelSlugs();
    if (models.length === 0) return;

    const modelSlug = models[currentModelIndex % models.length];
    currentModelIndex = (currentModelIndex + 1) % models.length;

    await runPipelineForModel(modelSlug);
  } catch (err) {
    console.error(`[scheduler] Scan error: ${err.message}`);
  } finally {
    isRunning = false;
  }
}

// --- Timer management ---
function resetScanTimer() {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    runFullScan();
    startScanLoop();
  }, SCAN_INTERVAL);
}

function startScanLoop() {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(async () => {
    await runFullScan();
    startScanLoop();
  }, SCAN_INTERVAL);
}

function startScheduler() {
  console.log(`[scheduler] Скан кожні ${SCAN_INTERVAL / 60000} хв, 8:00-22:00 Київ`);
  console.log(`[scheduler] Моделі: ${getModelSlugs().join(', ')}`);

  // Run immediately
  runFullScan();
  startScanLoop();
}

function resumeSending() {
  sendPaused = false;
  console.log('[scheduler] Відправку відновлено');
  // Immediately try to send instead of waiting for next scan
  setTimeout(() => triggerSend(), 1000);
}

module.exports = { startScheduler, triggerSend, resumeSending };
