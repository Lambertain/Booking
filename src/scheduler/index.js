const fs = require('fs');
const path = require('path');
const { runPipelineForModel } = require('../pipeline/index');
const { peekSendNext, removeSendFirst, updateSendFirst, sendQueueLength } = require('../pipeline/send-queue');
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

  // Peek — item stays in queue until send succeeds (survives crash)
  const toSend = peekSendNext();
  if (!toSend) return;

  try {
    const configPath = path.join(MODELS_DIR, toSend.modelSlug, 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const siteConfig = config.sites.find(s => s.id === toSend.site);
    if (!siteConfig) throw new Error(`Site config not found: ${toSend.site}`);

    await sendReply(config.adspower.profileId, siteConfig, toSend.url, toSend.text, toSend.mediaFiles || []);
    // Remove from queue only after successful send
    removeSendFirst();
    // Clean up temp media files
    if (toSend.mediaFiles && toSend.mediaFiles.length > 0) {
      for (const f of toSend.mediaFiles) {
        try { fs.unlinkSync(f); } catch {}
      }
    }
    console.log(`[scheduler] ✅ Надіслано: ${toSend.photographer} (${toSend.site})`);
    const { onDeliveryResult } = require('../bot/index');
    onDeliveryResult(true, toSend.photographer, toSend.site, null, toSend.url);
  } catch (err) {
    console.error(`[scheduler] ❌ Помилка відправки ${toSend.photographer}: ${err.message}`);

    // Browser crash — stop profile, wait, retry without counting
    const isBrowserCrash = err.message.includes('Target page, context or browser has been closed')
      || err.message.includes('ERR_ABORTED')
      || err.message.includes('No CDP endpoint')
      || err.message.includes('Browser closed')
      || err.message.includes('browserType.connectOverCDP');

    if (isBrowserCrash) {
      const crashCount = (toSend._crashCount || 0) + 1;
      console.log(`[scheduler] 🔄 Browser crash #${crashCount} — restarting AdsPower profile...`);

      // After 3 browser crashes for the same item — treat as hard failure
      if (crashCount >= 3) {
        console.error(`[scheduler] ❌ ${crashCount} browser crashes — giving up on this item`);
        const { onDeliveryResult } = require('../bot/index');
        onDeliveryResult(false, toSend.photographer, toSend.site, `Browser crashed ${crashCount} times: ${err.message}`);
        sendPaused = true;
        return;
      }

      try {
        const { stopProfile } = require('../extractor/adspower');
        const configPath = path.join(MODELS_DIR, toSend.modelSlug, 'config.json');
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        await stopProfile(cfg.adspower.profileId);
        console.log('[scheduler] AdsPower profile stopped');
      } catch (stopErr) {
        console.error('[scheduler] stopProfile error:', stopErr.message);
      }
      console.log('[scheduler] Waiting 10s before retry...');
      await new Promise(r => setTimeout(r, 10000));
      updateSendFirst({ _crashCount: crashCount, _retryCount: 0 });
      try { await processSendQueue(); } catch {}
      return;
    }

    // Regular error — auto-retry once after 30s, then pause
    const retryCount = toSend._retryCount || 0;
    if (retryCount < 1) {
      console.log(`[scheduler] 🔄 Авто-retry через 30с...`);
      updateSendFirst({ _retryCount: retryCount + 1 });
      const { onDeliveryResult } = require('../bot/index');
      onDeliveryResult(false, toSend.photographer, toSend.site, `${err.message} (retry через 30с)`);
      await new Promise(r => setTimeout(r, 30000));
      try { await processSendQueue(); } catch {}
    } else {
      const { onDeliveryResult } = require('../bot/index');
      onDeliveryResult(false, toSend.photographer, toSend.site, err.message);
      sendPaused = true; // Item stays in queue, manual resume required
    }
  }
}

let isSending = false;

// --- Triggered by bot after approve/edit: send + full scan ---
async function triggerSend() {
  // Send queue always works, even if pipeline is running
  if (!isSending) {
    isSending = true;
    try {
      await processSendQueue();
      // Wait for AdsPower to settle after sender closed it (inside lock)
      await new Promise(r => setTimeout(r, 3000));
    } finally {
      isSending = false;
    }
  }

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
