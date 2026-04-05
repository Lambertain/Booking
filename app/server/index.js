require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const { migrate } = require('./db');

const app = express();
const PORT = process.env.APP_PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// API routes
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/shoots',        require('./routes/shoots'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/sync',          require('./routes/sync'));
app.use('/api/media',         require('./routes/media'));
app.use('/api/orders',        require('./routes/orders'));
app.use('/api/templates',     require('./routes/templates'));
app.use('/api/bot',           require('./routes/bot').router);
app.use('/api/broadcast',     require('./routes/broadcast'));
app.use('/api/analytics',    require('./routes/analytics'));

// Serve React build in production
const distDir = path.join(__dirname, '../dist');
if (require('fs').existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

async function startDeadlineReminder() {
  const { all, query } = require('./db');
  const https = require('https');
  const BOT_TOKEN = process.env.BOT_TOKEN;

  // Send message to a specific Telegram chat_id
  function tgSend(chatId, text) {
    if (!BOT_TOKEN || !chatId) return Promise.resolve();
    return new Promise(resolve => {
      const data = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
      const req = https.request({
        hostname: 'api.telegram.org',
        path: `/bot${BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      }, res => { res.resume(); resolve(); });
      req.on('error', () => resolve());
      req.write(data);
      req.end();
    });
  }

  // Format date string for display
  function fmtDate(d) {
    return new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // Process reminder_config for a given record (order or template)
  async function processReminder(record, tableName, effDeadline) {
    const cfg = record.reminder_config;
    if (!cfg || !cfg.days_before || !cfg.message || !effDeadline) return;
    if (record.reminder_sent_at) return;

    const deadlineDate = new Date(effDeadline);
    const reminderDate = new Date(deadlineDate);
    reminderDate.setDate(reminderDate.getDate() - cfg.days_before);

    const now = new Date();
    // Fire if today is on or past reminderDate but before deadline
    if (now < reminderDate || now > deadlineDate) return;

    const dateStr = fmtDate(deadlineDate);
    const messageText = cfg.message
      .replace(/{date}/g, dateStr)
      .replace(/{name}/g, record.template_name || record.name || record.contact_name || '');

    // Send to each configured recipient (subscriber by id)
    const recipientIds = Array.isArray(cfg.recipient_ids) ? cfg.recipient_ids : [];
    if (recipientIds.length === 0) return;

    const placeholders = recipientIds.map((_, i) => `$${i + 1}`).join(',');
    const subscribers = await all(
      `SELECT id, telegram_id FROM subscribers WHERE id IN (${placeholders}) AND telegram_id::bigint > 0`,
      recipientIds
    );

    for (const sub of subscribers) {
      await tgSend(sub.telegram_id, messageText);
      await new Promise(r => setTimeout(r, 150));
    }

    // Mark as sent
    await query(`UPDATE ${tableName} SET reminder_sent_at = NOW() WHERE id = $1`, [record.id]);
    console.log(`[reminder] Sent to ${subscribers.length} recipients for ${tableName}#${record.id}`);
  }

  async function checkDeadlines() {
    try {
      const orders = await all(
        `SELECT id, template_name, contact_name, rental_end, deadline, reminder_config, reminder_sent_at
         FROM mailing_orders
         WHERE status NOT IN ('done','cancelled')
           AND reminder_config IS NOT NULL
           AND reminder_config != '{}'::jsonb
           AND reminder_sent_at IS NULL
           AND COALESCE(deadline, rental_end + INTERVAL '28 days') IS NOT NULL`,
        []
      );
      for (const o of orders) {
        const eff = o.deadline || (o.rental_end ? new Date(new Date(o.rental_end).getTime() + 28 * 86400000) : null);
        await processReminder(o, 'mailing_orders', eff);
      }

      const templates = await all(
        `SELECT id, name, rental_end, deadline, reminder_config, reminder_sent_at
         FROM mailing_templates
         WHERE deal_step NOT IN ('Готово','Удалить')
           AND reminder_config IS NOT NULL
           AND reminder_config != '{}'::jsonb
           AND reminder_sent_at IS NULL
           AND COALESCE(deadline, rental_end + INTERVAL '28 days') IS NOT NULL`,
        []
      );
      for (const tpl of templates) {
        const eff = tpl.deadline || (tpl.rental_end ? new Date(new Date(tpl.rental_end).getTime() + 28 * 86400000) : null);
        await processReminder(tpl, 'mailing_templates', eff);
      }
    } catch (err) {
      console.error('[reminder]', err.message);
    }
  }

  // Run once on startup (after 1 min) then every hour
  setTimeout(() => {
    checkDeadlines();
    setInterval(checkDeadlines, 60 * 60 * 1000);
  }, 60 * 1000);
}

async function start() {
  await migrate();
  app.listen(PORT, () => {
    console.log(`[app] Server running on port ${PORT}`);
  });
  startDeadlineReminder();
  // Register webhook for mini-app bot (separate token from booking bot on Windows Server)
  const { registerWebhook } = require('./routes/bot');
  const appUrl = process.env.APP_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null);
  if (appUrl) {
    registerWebhook(appUrl.replace(/\/$/, ''));
  }
}

start().catch(err => {
  console.error('[app] Fatal:', err.message);
  process.exit(1);
});
