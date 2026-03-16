require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { Bot } = require('grammy');
const { formatApprovalCard, buildApprovalKeyboard, collectPhotographerImages } = require('./messages');
const { chat: agentChat } = require('../ai/agent');
const { takeNext, queueLength } = require('../pipeline/queue');
const { addToSendQueue } = require('../pipeline/send-queue');
const { recordShoot } = require('../airtable/index');
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

// --- Approval state: ONE at a time ---
let currentApproval = null;
let waitingForEdit = false;
let queueLock = false;

// --- Queue processor: check file queue every 10s ---
function startQueueProcessor() {
  setInterval(async () => {
    if (currentApproval || queueLock) return;
    const len = queueLength();
    if (len === 0) return;

    queueLock = true;
    const item = takeNext();
    if (!item) { queueLock = false; return; }

    currentApproval = item;
    currentApproval.approvalId = `${item.site}-${Date.now()}`;
    waitingForEdit = false;
    queueLock = false;

    console.log(`[bot] Sending approval: ${item.photographer} (${item.siteLabel}). Queue: ${len - 1} remaining`);

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

// --- Handle approval result ---
async function handleApprovalResult(action, text) {
  const item = currentApproval;
  if (!item) return;

  const modelSlug = item.modelSlug || 'ana-v';

  if (action === 'approve' || action === 'edit') {
    const finalText = action === 'edit' ? text : item.draft;

    // Queue for sending via scheduler's browser session
    addToSendQueue({
      modelSlug,
      site: item.site,
      photographer: item.photographer,
      url: item.url,
      text: finalText
    });
    console.log(`[bot] Queued reply for ${item.photographer}`);

    // Log for training
    const logDir = path.join(DATA_DIR, modelSlug, 'training');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'approved-responses.jsonl'), JSON.stringify({
      timestamp: new Date().toISOString(),
      site: item.site, photographer: item.photographer, url: item.url,
      language: item.language, messages: item.messages,
      lastIncoming: item.lastIncoming, aiDraft: item.draft,
      finalText, action, draftType: item.draftType
    }) + '\n', 'utf8');

    // Record shoot in Airtable
    try {
      const details = await extractShootDetails(item.messages, item.photographer, item.siteLabel);
      if (details) await recordShoot({ ...details, photographer: item.photographer, siteName: item.siteLabel });
    } catch {}

    console.log(`[bot] ${action === 'approve' ? '✅' : '✏️'} ${item.photographer} done`);
  } else {
    console.log(`[bot] ⏭ Skipped: ${item.photographer}`);
  }

  currentApproval = null;
  waitingForEdit = false;
  // Next item will be picked up by interval
}

// --- Callback handlers ---
bot.on('callback_query:data', async (ctx) => {
  const [action, ...idParts] = ctx.callbackQuery.data.split(':');
  const approvalId = idParts.join(':');

  if (!currentApproval || currentApproval.approvalId !== approvalId) {
    await ctx.answerCallbackQuery({ text: 'Этот элемент уже не активен' });
    return;
  }

  if (action === 'approve') {
    await ctx.answerCallbackQuery({ text: '✅ Одобрено!' });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    await handleApprovalResult('approve', null);
  } else if (action === 'edit') {
    waitingForEdit = true;
    await ctx.answerCallbackQuery({ text: '✏️ Отправьте исправленный текст' });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    await bot.api.sendMessage(CHAT_ID, '✏️ Отправьте исправленный текст ответа:');
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
    await ctx.reply('✅ Текст принят');
    await handleApprovalResult('edit', text);
    return;
  }

  // Agent chat
  try {
    await ctx.replyWithChatAction('typing');
    const reply = await agentChat(text);
    if (reply) {
      if (reply.includes('REQUEST_MODEL_INFO')) {
        const clean = reply.replace(/REQUEST_MODEL_INFO/g, '').trim();
        if (clean) await ctx.reply(clean);
        await bot.api.sendMessage(CHAT_ID, `📋 Для добавления модели мне нужны данные:\n\n1️⃣ Имя модели\n2️⃣ AdsPower Profile ID\n3️⃣ Сайты: model-kartei / adultfolio / modelmayhem\n4️⃣ Adultfolio username\n5️⃣ ModelMayhem profile ID`);
      } else if (reply.includes('SEND_MEDIA:')) {
        await ctx.reply(reply.replace(/SEND_MEDIA:[^\n]+/g, '').trim() || 'Медиа в очереди');
      } else {
        await ctx.reply(reply);
      }
    }
  } catch (err) {
    console.error('[agent] Chat error:', err.message);
    await ctx.reply('⚠️ Ошибка агента: ' + err.message);
  }
});

// --- Media handler ---
bot.on('message:photo', async (ctx) => {
  if (currentApproval && waitingForEdit) {
    await ctx.reply('📎 Фото получено. Отправьте текст ответа.');
    return;
  }
  const caption = ctx.message.caption || '';
  if (caption) {
    try {
      await ctx.replyWithChatAction('typing');
      const reply = await agentChat(`[Фото] ${caption}`);
      if (reply) await ctx.reply(reply);
    } catch {}
  }
});

bot.on('message:document', async (ctx) => {
  if (currentApproval && waitingForEdit) {
    await ctx.reply('📎 Файл получен. Отправьте текст ответа.');
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

module.exports = { bot, startBot, stopBot };
