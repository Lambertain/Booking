require('dotenv').config();
const https = require('https');
const { startBot } = require('./bot/index');
const { startScheduler } = require('./scheduler/index');

// --- Telegram alert helper (works before bot is initialized) ---
function sendTgAlert(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
  const req = https.request({
    hostname: 'api.telegram.org',
    path: `/bot${token}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  });
  req.on('error', () => {});
  req.write(body);
  req.end();
}

// --- Crash handlers ---
process.on('uncaughtException', (err) => {
  const msg = `🔴 <b>Booking AI — uncaughtException</b>\n<code>${err.stack || err.message}</code>`;
  console.error('[crash] uncaughtException:', err);
  sendTgAlert(msg);
  setTimeout(() => process.exit(1), 2000);
});

process.on('unhandledRejection', (reason) => {
  const text = reason instanceof Error ? reason.stack || reason.message : String(reason);
  const msg = `🔴 <b>Booking AI — unhandledRejection</b>\n<code>${text}</code>`;
  console.error('[crash] unhandledRejection:', reason);
  sendTgAlert(msg);
  setTimeout(() => process.exit(1), 2000);
});

async function main() {
  console.log('=== Booking AI starting ===');

  // Validate required env vars
  const required = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'XAI_API_KEY', 'ADSPOWER_API_KEY'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing env vars: ${missing.join(', ')}`);
    console.error('Copy .env.example to .env and fill in the values');
    process.exit(1);
  }

  // Start Telegram bot (long polling)
  await startBot();

  // Start scheduler (cron)
  startScheduler();

  sendTgAlert('✅ <b>Booking AI запущен</b>');
}

main().catch(err => {
  console.error('Fatal:', err);
  sendTgAlert(`🔴 <b>Booking AI — fatal crash</b>\n<code>${err.stack || err.message}</code>`);
  setTimeout(() => process.exit(1), 2000);
});
