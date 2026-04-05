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
  const CHAT_ID = process.env.TG_BOOKING_CHAT_ID;

  function tgSend(text) {
    if (!BOT_TOKEN || !CHAT_ID) return;
    const data = JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => { res.resume(); });
    req.on('error', () => {});
    req.write(data);
    req.end();
  }

  async function checkDeadlines() {
    try {
      // Check mailing orders: deadline within next 2 days, not yet reminded
      const orders = await all(
        `SELECT id, template_name, contact_name, responsible,
                COALESCE(deadline, rental_end + INTERVAL '28 days') as eff_deadline
         FROM mailing_orders
         WHERE status NOT IN ('done','cancelled')
           AND deadline_reminded_at IS NULL
           AND COALESCE(deadline, rental_end + INTERVAL '28 days') IS NOT NULL
           AND COALESCE(deadline, rental_end + INTERVAL '28 days') BETWEEN NOW() AND NOW() + INTERVAL '2 days'`,
        []
      );
      for (const o of orders) {
        const d = new Date(o.eff_deadline).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const name = o.template_name || o.contact_name || `#${o.id}`;
        tgSend(`⏰ <b>Термін по розсилці закінчується!</b>\n📋 ${name}\n👤 ${o.responsible || '—'}\n📅 Термін: ${d}`);
        await query(`UPDATE mailing_orders SET deadline_reminded_at = NOW() WHERE id = $1`, [o.id]);
      }

      // Check mailing templates
      const templates = await all(
        `SELECT id, name, responsible,
                COALESCE(deadline, rental_end + INTERVAL '28 days') as eff_deadline
         FROM mailing_templates
         WHERE deal_step NOT IN ('Готово','Удалить')
           AND deadline_reminded_at IS NULL
           AND COALESCE(deadline, rental_end + INTERVAL '28 days') IS NOT NULL
           AND COALESCE(deadline, rental_end + INTERVAL '28 days') BETWEEN NOW() AND NOW() + INTERVAL '2 days'`,
        []
      );
      for (const tpl of templates) {
        const d = new Date(tpl.eff_deadline).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
        tgSend(`⏰ <b>Термін по шаблону закінчується!</b>\n📄 ${tpl.name || `#${tpl.id}`}\n👤 ${tpl.responsible || '—'}\n📅 Термін: ${d}`);
        await query(`UPDATE mailing_templates SET deadline_reminded_at = NOW() WHERE id = $1`, [tpl.id]);
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
