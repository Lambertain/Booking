require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { Bot } = require('grammy');
const { formatApprovalCard, buildApprovalKeyboard, collectPhotographerImages } = require('./messages');
const { chat: agentChat } = require('../ai/agent');
const { takeNext, queueLength } = require('../pipeline/queue');
const { addToSendQueue } = require('../pipeline/send-queue');
const db = require('../db/index');
const { recordShoot, setAirtableBase } = require('../airtable/index');
const { extractShootDetails } = require('../ai/grok');

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MODELS_DIR = path.resolve(__dirname, '../../models');
const DATA_DIR = path.resolve(__dirname, '../../data');

async function fetchWithTimeout(url, ms = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

bot.catch((err) => {
  const msg = err?.error?.message || err?.message || String(err);
  if (msg.includes('409') || msg.includes('Conflict')) return;
  console.error('Bot error:', msg);
});

// --- State ---
let currentApproval = null;
let waitingForEdit = false;
let waitingForDelivery = false;  // blocks queue until delivery confirmed
let queueLock = false;
let editMediaFiles = [];  // collected media during EDIT mode

// АПКА pending edits: chatId → { msgId }
const apkaPendingEdits = new Map();

// Deliver approved reply from АПКА to Railway app
async function apkaDeliver(msgId, text) {
  const appUrl = process.env.APP_API_URL;
  const secret = process.env.APP_API_SECRET;
  if (!appUrl || !secret) return false;
  try {
    const res = await fetch(`${appUrl}/api/sync/deliver-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ msgId, text }),
    });
    return res.ok;
  } catch (err) {
    console.error('[apka deliver]', err.message);
    return false;
  }
}

// --- Called by scheduler after delivery attempt ---
function onDeliveryResult(success, photographer, site, error, url) {
  if (success) {
    bot.api.sendMessage(CHAT_ID, `✅ Відповідь доставлена: ${photographer} (${site})`).catch(() => {});
    // Update DB: dialog is now 'sent' (awaiting photographer's response)
    if (url) db.updateStatus(site, url, 'sent');
    waitingForDelivery = false;
    // Queue processor will pick next in 10s
  } else {
    bot.api.sendMessage(CHAT_ID, `❌ Не вдалося доставити: ${photographer} (${site})\nПомилка: ${error}\n\nВідправку призупинено. Напишіть "resume" щоб відновити.`).catch(() => {});
    // Keep waitingForDelivery = true — blocks queue
  }
}

// --- Queue processor: check every 10s ---
function startQueueProcessor() {
  setInterval(async () => {
    if (currentApproval || queueLock || waitingForDelivery) return;
    const len = queueLength();
    if (len === 0) return;

    queueLock = true;
    const item = takeNext();
    if (!item) { queueLock = false; return; }

    // Skip stale items: already sent with same message, or still queued but in send queue
    const existing = db.getDialog(item.site, item.url);
    if (existing && existing.last_incoming === item.lastIncoming) {
      if (existing.status === 'sent') {
        console.log(`[bot] Пропускаю вже відправлений: ${item.photographer} (${item.siteLabel})`);
        queueLock = false;
        return;
      }
      if (existing.status === 'queued') {
        const { loadSendQueue } = require('../pipeline/send-queue');
        if (loadSendQueue().some(q => q.site === item.site && q.url === item.url)) {
          console.log(`[bot] Пропускаю — вже у черзі відправки: ${item.photographer} (${item.siteLabel})`);
          queueLock = false;
          return;
        }
      }
    }

    currentApproval = item;
    currentApproval.approvalId = `${item.site}-${Date.now()}`;
    waitingForEdit = false;
    editMediaFiles = [];
    queueLock = false;

    console.log(`[bot] Надсилаю на апрув: ${item.photographer} (${item.siteLabel}). Черга: ${len - 1}`);

    const text = formatApprovalCard(item);
    const keyboard = buildApprovalKeyboard(item.approvalId);

    try {
      await bot.api.sendMessage(CHAT_ID, text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
    } catch {
      try {
        const plain = `📸 ${item.photographer} | ${item.siteLabel} | ${item.model}\n\n💬 INCOMING:\n${item.lastIncoming}\n\n✏️ DRAFT:\n${item.draft}`;
        await bot.api.sendMessage(CHAT_ID, plain, { reply_markup: keyboard });
      } catch (err2) {
        console.error('Failed to send card:', err2.message);
        currentApproval = null;
      }
    }

    // Send photographer photos
    const images = collectPhotographerImages(item.messages);
    for (const url of images.slice(0, 5)) {
      try { await bot.api.sendPhoto(CHAT_ID, url, { caption: `📷 Фото від ${item.photographer}` }); } catch {}
    }
  }, 10000);
}

// --- Handle approval ---
async function handleApprovalResult(action, text) {
  const item = currentApproval;
  if (!item) return;

  const modelSlug = item.modelSlug;
  if (!modelSlug) {
    console.error('[bot] item.modelSlug відсутній:', item.photographer, item.site);
    currentApproval = null;
    waitingForEdit = false;
    editMediaFiles = [];
    return;
  }

  if (action === 'approve' || action === 'edit') {
    const finalText = action === 'edit' ? text : item.draft;

    // Queue for sending with media
    addToSendQueue({
      modelSlug,
      site: item.site,
      photographer: item.photographer,
      url: item.url,
      text: finalText,
      action: action === 'edit' ? 'edited' : 'approved',
      mediaFiles: editMediaFiles.length > 0 ? editMediaFiles : undefined
    });

    // Block queue until delivery confirmed
    waitingForDelivery = true;
    currentApproval = null;
    waitingForEdit = false;
    editMediaFiles = [];

    // Trigger immediate send + reset scan timer
    try {
      const { triggerSend } = require('../scheduler/index');
      triggerSend();
    } catch {}

    // Log for training
    try {
      const logDir = path.join(DATA_DIR, modelSlug, 'training');
      fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(path.join(logDir, 'approved-responses.jsonl'), JSON.stringify({
        timestamp: new Date().toISOString(),
        site: item.site, photographer: item.photographer, url: item.url,
        language: item.language, messages: item.messages,
        lastIncoming: item.lastIncoming, aiDraft: item.draft,
        finalText, action, draftType: item.draftType
      }) + '\n', 'utf8');
    } catch {}

    // Extract shoot details (used for both Airtable and app sync)
    let shootDetails = null;
    try {
      shootDetails = await extractShootDetails(item.messages, item.photographer, item.siteLabel);
    } catch (e) { console.error('[bot] extractShootDetails failed:', e.message); }

    // Record in Airtable (fallback)
    try {
      const config = JSON.parse(fs.readFileSync(path.join(MODELS_DIR, modelSlug, 'config.json'), 'utf8'));
      if (config.airtable?.baseId && shootDetails) {
        setAirtableBase(config.airtable.baseId);
        await recordShoot({ ...shootDetails, photographer: item.photographer, siteName: item.siteLabel });
      }
    } catch {}

    // Record in app (primary)
    try {
      const appUrl = process.env.APP_API_URL;
      const secret = process.env.APP_API_SECRET;
      if (appUrl && secret) {
        const location = [shootDetails?.city, shootDetails?.location].filter(Boolean).join(', ') || null;
        const payload = {
          modelSlug,
          photographerName: item.photographer,
          photographerSite: item.siteLabel || null,
          photographerEmail: shootDetails?.photographer_email || null,
          photographerPhone: shootDetails?.photographer_phone || null,
          photographerTelegram: shootDetails?.photographer_telegram || null,
          dialogUrl: item.url || null,
          shootDate: shootDetails?.startTime || null,
          location,
          rate: shootDetails?.budget || null,
          currency: shootDetails?.currency || 'EUR',
          notes: [shootDetails?.style, shootDetails?.notes].filter(Boolean).join(' | ') || null,
          status: shootDetails?.status === 'Подтверждено' ? 'confirmed' : 'negotiating',
        };
        const syncRes = await fetch(`${appUrl}/api/sync/shoot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${secret}` },
          body: JSON.stringify(payload),
        });
        if (syncRes.ok) console.log(`[bot] ✓ Shoot synced to app: ${item.photographer}`);
        else console.error(`[bot] App sync failed: ${syncRes.status} ${await syncRes.text()}`);
      }
    } catch (e) { console.error('[bot] App sync error:', e.message); }

    console.log(`[bot] ${action === 'approve' ? '✅' : '✏️'} ${item.photographer} — чекаємо доставку`);
  } else {
    console.log(`[bot] ⏭ Пропущено: ${item.photographer}`);
    // Mark as rejected so pipeline won't re-queue on next scan
    db.updateStatus(item.site, item.url, 'rejected');
    currentApproval = null;
    waitingForEdit = false;
    editMediaFiles = [];
  }
}

// --- Callbacks ---
bot.on('callback_query:data', async (ctx) => {
  const [action, ...idParts] = ctx.callbackQuery.data.split(':');
  const approvalId = idParts.join(':');

  // --- АПКА callbacks ---
  if (action === 'apka_ok' || action === 'apka_edit' || action === 'apka_skip') {
    const msgId = parseInt(idParts[0]);
    const tgChatId = String(ctx.callbackQuery.message.chat.id);

    if (action === 'apka_ok') {
      // Get AI draft from Railway
      const appUrl = process.env.APP_API_URL;
      const secret = process.env.APP_API_SECRET;
      let draftText = null;
      try {
        const r = await fetch(`${appUrl}/api/sync/ai-draft/${msgId}`, {
          headers: { Authorization: `Bearer ${secret}` },
        });
        if (r.ok) { const d = await r.json(); draftText = d.ai_draft; }
      } catch {}

      if (!draftText) {
        await ctx.answerCallbackQuery({ text: 'Чернетка не знайдена' });
        return;
      }
      const ok = await apkaDeliver(msgId, draftText);
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.answerCallbackQuery({ text: ok ? '✅ Відправлено' : '❌ Помилка' });

    } else if (action === 'apka_edit') {
      apkaPendingEdits.set(tgChatId, { msgId, tgMsgId: ctx.callbackQuery.message.message_id });
      await ctx.answerCallbackQuery({ text: 'Введіть текст' });
      await bot.api.sendMessage(tgChatId, '✏️ Надішліть відредагований текст відповіді:');

    } else if (action === 'apka_skip') {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.answerCallbackQuery({ text: '⏭ Пропущено' });
    }
    return;
  }

  if (!currentApproval || currentApproval.approvalId !== approvalId) {
    await ctx.answerCallbackQuery({ text: 'Цей елемент вже не активний' });
    return;
  }

  if (action === 'approve') {
    await ctx.answerCallbackQuery({ text: '✅ Схвалено!' });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    await handleApprovalResult('approve', null);
  } else if (action === 'edit') {
    waitingForEdit = true;
    editMediaFiles = [];
    await ctx.answerCallbackQuery({ text: '✏️ Надішліть виправлений текст' });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    await bot.api.sendMessage(CHAT_ID, '✏️ Надішліть виправлений текст відповіді.\nМожна додати фото — вони будуть відправлені фотографу.');
  } else if (action === 'skip') {
    await ctx.answerCallbackQuery({ text: '⏭ Пропущено' });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    await handleApprovalResult('skip', null);
  }
});

// --- Text handler ---
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  const tgChatId = String(ctx.message.chat.id);

  // АПКА edit mode
  if (apkaPendingEdits.has(tgChatId)) {
    const { msgId, tgMsgId } = apkaPendingEdits.get(tgChatId);
    apkaPendingEdits.delete(tgChatId);
    const ok = await apkaDeliver(msgId, text);
    // Remove buttons from draft message
    try {
      await bot.api.editMessageReplyMarkup(tgChatId, tgMsgId, { reply_markup: undefined });
    } catch {}
    await ctx.reply(ok ? '✅ Відправлено' : '❌ Помилка доставки');
    return;
  }

  // Edit mode — text goes to photographer
  if (currentApproval && waitingForEdit) {
    waitingForEdit = false;
    await ctx.reply('✅ Текст прийнято');
    await handleApprovalResult('edit', text);
    return;
  }

  // Resume sending
  if (text.toLowerCase() === 'resume') {
    try {
      const sched = require('../scheduler/index');
      if (sched.resumeSending) sched.resumeSending();
      waitingForDelivery = false;
      await ctx.reply('▶️ Відправку відновлено');
    } catch {}
    return;
  }

  // Agent chat
  try {
    await ctx.replyWithChatAction('typing');
    const reply = await agentChat(text);
    if (reply) {
      if (reply.includes('REQUEST_MODEL_INFO')) {
        await bot.api.sendMessage(CHAT_ID, `📋 Для додавання моделі потрібні дані:\n\n1️⃣ Ім'я моделі\n2️⃣ AdsPower Profile ID\n3️⃣ Сайти: model-kartei / adultfolio / modelmayhem\n4️⃣ Adultfolio username\n5️⃣ ModelMayhem profile ID\n6️⃣ Прайс моделі\n7️⃣ Посилання на Airtable базу моделі`);
      } else if (reply.includes('SEND_MEDIA:')) {
        await ctx.reply(reply.replace(/SEND_MEDIA:[^\n]+/g, '').trim() || 'Медіа в черзі');
      } else {
        await ctx.reply(reply);
      }
    }
  } catch (err) {
    console.error('[agent] Chat error:', err.message);
    await ctx.reply('⚠️ Помилка агента: ' + err.message);
  }
});

// --- Media handler ---
bot.on('message:photo', async (ctx) => {
  console.log(`[bot] Photo received. Caption: "${ctx.message.caption || '(none)'}"`);
  if (currentApproval && waitingForEdit) {
    // Download and save photo for sending to photographer
    try {
      const photos = ctx.message.photo;
      const fileId = photos[photos.length - 1].file_id;
      const file = await ctx.api.getFile(fileId);
      const downloadUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      const tmpDir = path.resolve(__dirname, '../../data/tmp');
      fs.mkdirSync(tmpDir, { recursive: true });
      const ext = path.extname(file.file_path) || '.jpg';
      const localPath = path.join(tmpDir, `edit-${Date.now()}${ext}`);
      const res = await fetchWithTimeout(downloadUrl);
      fs.writeFileSync(localPath, Buffer.from(await res.arrayBuffer()));
      editMediaFiles.push(localPath);
      await ctx.reply(`📎 Фото додано (${editMediaFiles.length}). Можна додати ще або надіслати текст відповіді.`);
    } catch (err) {
      await ctx.reply('⚠️ Не вдалося зберегти фото: ' + err.message);
    }
    return;
  }
  // Photo with caption — check if it's "send to photographer" command
  const caption = ctx.message.caption || '';
  if (caption) {
    // Parse caption: various formats
    // "BenjHDF adultfolio" or "📸 BenjHDF\n🌐 adultfolio.com" or "BenjHDF on adultfolio\ntext"
    const cleanCaption = caption.replace(/📸\s*/g, '').replace(/🌐\s*/g, '').replace(/\.com/g, '').trim();
    const lines = cleanCaption.split('\n').map(l => l.trim()).filter(Boolean);

    let sendMatch = null;
    if (lines.length >= 2) {
      // Multi-line: first line = photographer, second = site, rest = message
      const siteMatch = lines[1].match(/^(adultfolio|model-kartei|modelmayhem|model kartei|model mayhem)$/i);
      if (siteMatch) {
        sendMatch = [null, lines[0], siteMatch[1], lines.slice(2).join('\n')];
      }
    }
    if (!sendMatch) {
      // Single line: "photographer site" or "photographer on/на site"
      const m = cleanCaption.match(/^(.+?)\s+(adultfolio|model-kartei|modelmayhem|model kartei|model mayhem)(?:\s*\n([\s\S]*))?$/i) ||
        cleanCaption.match(/^(.+?)\s+(?:on|на)\s+(adultfolio|model-kartei|modelmayhem|model kartei|model mayhem)(?:\s*\n([\s\S]*))?$/i);
      if (m) sendMatch = m;
    }

    if (sendMatch) {
      const photographer = sendMatch[1].trim();
      let site = sendMatch[2].trim().toLowerCase().replace(/\s+/g, '');
      if (site === 'modelkartei') site = 'model-kartei';
      if (site === 'modelmayhem') site = 'modelmayhem';

      try {
        const photos = ctx.message.photo;
        const fileId = photos[photos.length - 1].file_id;
        const file = await ctx.api.getFile(fileId);
        const downloadUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
        const tmpDir = path.resolve(__dirname, '../../data/tmp');
        fs.mkdirSync(tmpDir, { recursive: true });
        const ext = path.extname(file.file_path) || '.jpg';
        const localPath = path.join(tmpDir, `direct-${Date.now()}${ext}`);
        const res = await fetchWithTimeout(downloadUrl);
        fs.writeFileSync(localPath, Buffer.from(await res.arrayBuffer()));

        // Find dialog URL + model slug — search DB then training logs across all models
        let url = '';
        let foundSlug = '';
        const modelSlugs = fs.readdirSync(MODELS_DIR)
          .filter(f => fs.existsSync(path.join(MODELS_DIR, f, 'config.json')));

        // 1. DB (most reliable)
        try {
          const row = db.db.prepare(
            "SELECT url, model_slug FROM dialogs WHERE photographer = ? AND site = ? ORDER BY updated_at DESC LIMIT 1"
          ).get(photographer, site);
          if (row) { url = row.url; foundSlug = row.model_slug; }
        } catch {}
        // 2. Training logs across all models
        if (!url) {
          for (const slug of modelSlugs) {
            if (url) break;
            try {
              const lines = fs.readFileSync(path.join(DATA_DIR, slug, 'training', 'approved-responses.jsonl'), 'utf8').trim().split('\n');
              for (const line of lines.reverse()) {
                const e = JSON.parse(line);
                if (e.photographer === photographer && e.site === site && e.url) { url = e.url; foundSlug = slug; break; }
              }
            } catch {}
          }
        }

        if (url) {
          const messageText = (sendMatch[3] || '').trim();
          addToSendQueue({
            modelSlug: foundSlug || modelSlugs[0],
            site,
            photographer,
            url,
            text: messageText,
            mediaFiles: [localPath]
          });
          const { triggerSend } = require('../scheduler/index');
          triggerSend();
          await ctx.reply(`📤 Фото для ${photographer} (${site}) в черзі на відправку`);
        } else {
          await ctx.reply(`⚠️ Не знайдено діалог з ${photographer} на ${site}`);
        }
      } catch (err) {
        await ctx.reply('⚠️ Помилка: ' + err.message);
      }
      return;
    }

    // Regular photo with caption — agent chat
    try {
      await ctx.replyWithChatAction('typing');
      const reply = await agentChat(`[Фото] ${caption}`);
      if (reply) await ctx.reply(reply);
    } catch {}
  }
});

bot.on('message:document', async (ctx) => {
  if (currentApproval && waitingForEdit) {
    try {
      const fileId = ctx.message.document.file_id;
      const file = await ctx.api.getFile(fileId);
      const downloadUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      const tmpDir = path.resolve(__dirname, '../../data/tmp');
      fs.mkdirSync(tmpDir, { recursive: true });
      const ext = path.extname(file.file_path) || '';
      const localPath = path.join(tmpDir, `edit-${Date.now()}${ext}`);
      const res = await fetchWithTimeout(downloadUrl);
      fs.writeFileSync(localPath, Buffer.from(await res.arrayBuffer()));
      editMediaFiles.push(localPath);
      await ctx.reply(`📎 Файл додано (${editMediaFiles.length}). Можна додати ще або надіслати текст відповіді.`);
    } catch (err) {
      await ctx.reply('⚠️ Не вдалося зберегти файл: ' + err.message);
    }
    return;
  }
});

// --- HTTP server to receive forwarded updates from Railway webhook ---
function startUpdateServer() {
  const http = require('http');
  const port = parseInt(process.env.BOT_WEBHOOK_PORT || '3456');

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/update') {
      res.writeHead(404); res.end(); return;
    }
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      res.writeHead(200); res.end('ok');
      try {
        const update = JSON.parse(body);
        bot.handleUpdate(update).catch(e => console.error('[update]', e.message));
      } catch (e) {
        console.error('[update parse]', e.message);
      }
    });
  });

  server.listen(port, () => console.log(`[bot] Update server on port ${port}`));
}

// --- Lifecycle ---
async function startBot() {
  console.log('Telegram bot starting...');

  // Set persistent Menu Button (web_app) for all private chats
  const appUrl = process.env.APP_API_URL || 'https://booking-production-ab66.up.railway.app';
  bot.api.setChatMenuButton({
    menu_button: { type: 'web_app', text: '📱 Відкрити апку', web_app: { url: appUrl } },
  }).then(() => console.log('[bot] Menu button set:', appUrl)).catch(e => console.error('[bot] setChatMenuButton failed:', e.message));

  startQueueProcessor();

  // Clean up tmp media files older than 24h (every hour)
  setInterval(() => {
    const tmpDir = path.resolve(__dirname, '../../data/tmp');
    if (!fs.existsSync(tmpDir)) return;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    try {
      for (const f of fs.readdirSync(tmpDir)) {
        const full = path.join(tmpDir, f);
        try { if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full); } catch {}
      }
    } catch {}
  }, 60 * 60 * 1000);

  // Must initialize before handling any updates (grammY requirement)
  await bot.init();
  console.log('[bot] grammY initialized:', bot.botInfo.username);

  startUpdateServer();
  console.log('Telegram bot started (webhook mode via Railway)');
}

function stopBot() { bot.stop(); }

module.exports = { bot, startBot, stopBot, onDeliveryResult };
