const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { runPipelineForModel } = require('../pipeline/index');

const MODELS_DIR = path.resolve(__dirname, '../../models');

function getModelSlugs() {
  return fs.readdirSync(MODELS_DIR)
    .filter(f => fs.existsSync(path.join(MODELS_DIR, f, 'config.json')));
}

function isWorkingHours() {
  // Kyiv = UTC+2 (winter) / UTC+3 (summer)
  const now = new Date();
  const kyivHour = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' })).getHours();
  return kyivHour >= 8 && kyivHour < 22;
}

let currentModelIndex = 0;
let isRunning = false;

async function runNext() {
  if (isRunning) return;
  if (!isWorkingHours()) {
    console.log('[scheduler] Outside working hours (8:00-22:00 Kyiv), skipping');
    return;
  }

  const models = getModelSlugs();
  if (models.length === 0) return;

  const modelSlug = models[currentModelIndex % models.length];
  currentModelIndex = (currentModelIndex + 1) % models.length;

  isRunning = true;
  try {
    await runPipelineForModel(modelSlug);
  } catch (err) {
    console.error(`[scheduler] Pipeline failed for ${modelSlug}: ${err.message}`);
  } finally {
    isRunning = false;
  }
}

function startScheduler() {
  const intervalMin = parseInt(process.env.SCAN_INTERVAL_MIN || '15', 10);
  console.log(`[scheduler] Scanning every ${intervalMin} min, 8:00-22:00 Kyiv`);
  console.log(`[scheduler] Models: ${getModelSlugs().join(', ')}`);

  if (isWorkingHours()) runNext();

  cron.schedule(`*/${intervalMin} * * * *`, runNext);
}

module.exports = { startScheduler, runNext };
