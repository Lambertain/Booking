const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { runPipelineForModel } = require('../pipeline/index');
const { takeSendNext, sendQueueLength } = require('../pipeline/send-queue');
const { sendReply } = require('../extractor/sender');
const { openPage } = require('../extractor/adspower');

const MODELS_DIR = path.resolve(__dirname, '../../models');

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

async function notifyTelegram(text) {
  try {
    const { bot } = require('../bot/index');
    await bot.api.sendMessage(process.env.TELEGRAM_CHAT_ID, text);
  } catch {}
}

async function processSendQueue() {
  if (sendPaused) return;

  while (sendQueueLength() > 0) {
    const toSend = takeSendNext();
    if (!toSend) break;

    try {
      const configPath = path.join(MODELS_DIR, toSend.modelSlug, 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const siteConfig = config.sites.find(s => s.id === toSend.site);
      if (!siteConfig) throw new Error(`Site config not found: ${toSend.site}`);

      await sendReply(config.adspower.profileId, siteConfig, toSend.url, toSend.text);
      console.log(`[scheduler] ✅ Sent reply to ${toSend.photographer} on ${toSend.site}`);
      await notifyTelegram(`✅ Відповідь доставлена: ${toSend.photographer} (${toSend.site})`);
    } catch (err) {
      console.error(`[scheduler] Send failed for ${toSend.photographer}: ${err.message}`);
      // Put back in queue and pause
      const { addToSendQueue } = require('../pipeline/send-queue');
      addToSendQueue(toSend);
      sendPaused = true;
      await notifyTelegram(`❌ Не вдалося доставити: ${toSend.photographer} (${toSend.site})\nПомилка: ${err.message}\n\nВідправка призупинена. Напишіть "resume" щоб відновити.`);
      break;
    }
  }
}

async function runNext() {
  if (isRunning) return;

  isRunning = true;
  try {
    // Always process send queue, even outside working hours
    await processSendQueue();

    if (!isWorkingHours()) {
      return;
    }

    const models = getModelSlugs();
    if (models.length === 0) return;

    const modelSlug = models[currentModelIndex % models.length];
    currentModelIndex = (currentModelIndex + 1) % models.length;

    await runPipelineForModel(modelSlug);
  } catch (err) {
    console.error(`[scheduler] Error: ${err.message}`);
  } finally {
    isRunning = false;
  }
}

function startScheduler() {
  const intervalMin = parseInt(process.env.SCAN_INTERVAL_MIN || '15', 10);
  console.log(`[scheduler] Scanning every ${intervalMin} min, 8:00-22:00 Kyiv`);
  console.log(`[scheduler] Models: ${getModelSlugs().join(', ')}`);

  runNext();
  cron.schedule(`*/${intervalMin} * * * *`, runNext);
}

function resumeSending() {
  sendPaused = false;
  console.log('[scheduler] Sending resumed');
}

module.exports = { startScheduler, runNext, resumeSending };
