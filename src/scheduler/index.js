const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { runPipelineForModel } = require('../pipeline/index');

const MODELS_DIR = path.resolve(__dirname, '../../models');

function getModelSlugs() {
  return fs.readdirSync(MODELS_DIR)
    .filter(f => {
      const configPath = path.join(MODELS_DIR, f, 'config.json');
      return fs.existsSync(configPath);
    });
}

let currentModelIndex = 0;
let isRunning = false;

async function runNext() {
  if (isRunning) {
    console.log('[scheduler] Previous scan still running, skipping');
    return;
  }

  const models = getModelSlugs();
  if (models.length === 0) {
    console.log('[scheduler] No models configured');
    return;
  }

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
  console.log(`[scheduler] Scanning every ${intervalMin} minutes`);
  console.log(`[scheduler] Models: ${getModelSlugs().join(', ')}`);

  // Run immediately on start
  runNext();

  // Then on schedule
  cron.schedule(`*/${intervalMin} * * * *`, runNext);
}

module.exports = { startScheduler, runNext };
