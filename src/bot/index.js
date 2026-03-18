require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { Bot } = require('grammy');
const { formatApprovalCard, buildApprovalKeyboard, collectPhotographerImages } = require('./messages');
const { chat: agentChat } = require('../ai/agent');
const { takeNext, queueLength } = require('../pipeline/queue');
const { addToSendQueue } = require('../pipeline/send-queue');
const { recordShoot, setAirtableBase } = require('../airtable/index');
const { extractShootDetails } = require('../ai/grok');

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MODELS_DIR = path.resolve(__dirname, '../../models');
const DATA_DIR = path.resolve(__dirname, '../../data');

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

// --- Called by scheduler after delivery attempt ---
function onDeliveryResult(success, photographer, site, error) {
  if (success) {
    bot.api.sendMessage(CHAT_ID, `✅ Відповідь доставлена: ${photographer} (${site})`).catch(() => {});
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

  const modelSlug = item.modelSlug || 'ana-v';

  if (action === 'approve' || action === 'edit') {
    const finalText = action === 'edit' ? text : item.draft;

    // Queue for sending with media
    addToSendQueue({
      modelSlug,
      site: item.site,
      photographer: item.photographer,
      url: item.url,
      text: finalText,
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

    // Record shoot in Airtable (per-model credentials)
    try {
      const config = JSON.parse(fs.readFileSync(path.join(MODELS_DIR, modelSlug, 'config.json'), 'utf8'));
      if (config.airtable?.baseId) {
        setAirtableBase(config.airtable.baseId);
        const details = await extractShootDetails(item.messages, item.photographer, item.siteLabel);
        if (details) await recordShoot({ ...details, photographer: item.photographer, siteName: item.siteLabel });
      }
    } catch {}

    console.log(`[bot] ${action === 'approve' ? '✅' : '✏️'} ${item.photographer} — чекаємо доставку`);
  } else {
    console.log(`[bot] ⏭ Пропущено: ${item.photographer}`);
    currentApproval = null;
    waitingForEdit = false;
    editMediaFiles = [];
  }
}

// --- Callbacks ---
bot.on('callback_query:data', async (ctx) => {
  const [action, ...idParts] = ctx.callbackQuery.data.split(':');
  const approvalId = idParts.join(':');

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
      const res = await fetch(downloadUrl);
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
        const res = await fetch(downloadUrl);
        fs.writeFileSync(localPath, Buffer.from(await res.arrayBuffer()));

        // Find URL from processed dialogs, active dialogs, or training log
        let url = '';
        // 1. Processed IDs
        try {
          const processed = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'ana-v', 'processed', 'processed-ids.json'), 'utf8'));
          for (const key of Object.keys(processed)) {
            if (key.includes(photographer) && key.startsWith(site)) { url = key.split('::')[2] || ''; break; }
          }
        } catch {}
        // 2. Active dialogs
        if (!url) {
          try {
            const active = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'ana-v', 'processed', 'active-dialogs.json'), 'utf8'));
            const found = active.find(d => d.photographer === photographer && d.site === site);
            if (found) url = found.url;
          } catch {}
        }
        // 3. Training log
        if (!url) {
          try {
            const lines = fs.readFileSync(path.join(DATA_DIR, 'ana-v', 'training', 'approved-responses.jsonl'), 'utf8').trim().split('\n');
            for (const line of lines.reverse()) {
              const e = JSON.parse(line);
              if (e.photographer === photographer && e.site === site && e.url) { url = e.url; break; }
            }
          } catch {}
        }

        if (url) {
          const messageText = (sendMatch[3] || '').trim();
          addToSendQueue({
            modelSlug: 'ana-v',
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
      const res = await fetch(downloadUrl);
      fs.writeFileSync(localPath, Buffer.from(await res.arrayBuffer()));
      editMediaFiles.push(localPath);
      await ctx.reply(`📎 Файл додано (${editMediaFiles.length}). Можна додати ще або надіслати текст відповіді.`);
    } catch (err) {
      await ctx.reply('⚠️ Не вдалося зберегти файл: ' + err.message);
    }
    return;
  }
});

// --- Lifecycle ---
async function startBot() {
  console.log('Telegram bot starting...');
  await bot.api.deleteWebhook({ drop_pending_updates: true });
  await new Promise(r => setTimeout(r, 2000));
  startQueueProcessor();
  const startPolling = () => {
    bot.start({ onStart: () => console.log('Telegram bot started'), drop_pending_updates: true })
      .catch(err => {
        if (String(err?.message || '').includes('409')) {
          console.log('Polling conflict, retrying in 5s...');
          setTimeout(startPolling, 5000);
        } else { console.error('Bot start error:', err?.message); }
      });
  };
  startPolling();
}

function stopBot() { bot.stop(); }

module.exports = { bot, startBot, stopBot, onDeliveryResult };
