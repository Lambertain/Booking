require('dotenv').config();
const { startBot } = require('./bot/index');
const { startScheduler } = require('./scheduler/index');

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
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
