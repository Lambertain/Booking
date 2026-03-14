require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { Bot } = require('grammy');
const { formatApprovalCard, buildApprovalKeyboard, collectPhotographerImages } = require('./messages');
const { chat: agentChat } = require('../ai/agent');

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const MODEL_INFO_CARD = `📋 Для добавления модели мне нужны данные:

1️⃣ Имя модели
2️⃣ AdsPower Profile ID
3️⃣ Сайты: model-kartei / adultfolio / modelmayhem
4️⃣ Adultfolio username
5️⃣ ModelMayhem profile ID`;

// Error handler
bot.catch((err) => {
  console.error('Bot error:', err.message || err);
});

// Approval queue and state
const approvalQueue = [];
let currentApproval = null;
let currentMessageId = null;
const editMode = new Map();
const editMedia = new Map();    // approvalId -> [file paths]
const callbacks = new Map();

// Media buffer for deferred sending
const mediaBuffer = [];         // [{ localPath, type, timestamp }]

// --- Send approval to chat ---

async function sendPhotographerPhotos(item) {
  const images = collectPhotographerImages(item.messages);
  if (images.length === 0) return;
  // Send up to 5 photos
  for (const url of images.slice(0, 5)) {
    try {
      await bot.api.sendPhoto(CHAT_ID, url, {
        caption: `📷 Фото от ${item.photographer}`
      });
    } catch (err) {
      // Photo URL might be invalid or blocked, skip silently
      console.error(`Failed to send photographer photo: ${err.message}`);
    }
  }
}

async function sendNextApproval() {
  if (currentApproval) return;
  if (approvalQueue.length === 0) return;

  const item = approvalQueue.shift();
  currentApproval = item;

  const text = formatApprovalCard(item);
  const keyboard = buildApprovalKeyboard(item.approvalId);

  try {
    const msg = await bot.api.sendMessage(CHAT_ID, text, {
      parse_mode: 'MarkdownV2',
      reply_markup: keyboard
    });
    currentMessageId = msg.message_id;
    // Send photographer's photos if any
    await sendPhotographerPhotos(item);
  } catch (err) {
    console.error('MarkdownV2 failed, trying plain text:', err.message);
    try {
      const plain = [
        `📸 ${item.photographer} | ${item.siteLabel} | ${item.model}`,
        '',
        `💬 INCOMING:`,
        item.lastIncoming || '(empty)',
        '',
        `✏️ DRAFT:`,
        item.draft || '(no draft)',
      ].join('\n');
      const msg = await bot.api.sendMessage(CHAT_ID, plain, { reply_markup: keyboard });
      currentMessageId = msg.message_id;
    } catch (err2) {
      console.error('Plain text also failed:', err2.message);
      const cb = callbacks.get(item.approvalId);
      if (cb) {
        callbacks.delete(item.approvalId);
        cb.resolve({ action: 'skip', text: null, item: cb.item });
      }
      currentApproval = null;
      sendNextApproval();
    }
  }
}

function queueApproval(item) {
  return new Promise((resolve) => {
    const approvalId = item.approvalId || `${item.site}-${Date.now()}`;
    item.approvalId = approvalId;
    callbacks.set(approvalId, { resolve, item });
    approvalQueue.push(item);
    sendNextApproval();
  });
}

// --- Callback query handlers ---

bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const [action, ...idParts] = data.split(':');
  const approvalId = idParts.join(':');

  if (!currentApproval || currentApproval.approvalId !== approvalId) {
    await ctx.answerCallbackQuery({ text: 'Этот элемент уже не активен' });
    return;
  }

  const cb = callbacks.get(approvalId);

  if (action === 'approve') {
    await ctx.answerCallbackQuery({ text: '✅ Одобрено!' });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    if (cb) {
      callbacks.delete(approvalId);
      cb.resolve({
        action: 'approve',
        text: currentApproval.draft,
        media: editMedia.get(approvalId) || [],
        item: cb.item
      });
    }
    editMedia.delete(approvalId);
    currentApproval = null;
    currentMessageId = null;
    sendNextApproval();
  } else if (action === 'edit') {
    editMode.set(approvalId, true);
    editMedia.set(approvalId, []);
    await ctx.answerCallbackQuery({ text: '✏️ Отправьте исправленный текст' });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    await bot.api.sendMessage(CHAT_ID, '✏️ Отправьте исправленный текст ответа.\nМожно прикрепить фото/файлы — они будут отправлены фотографу.');
  } else if (action === 'skip') {
    await ctx.answerCallbackQuery({ text: '⏭ Пропущено' });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    if (cb) {
      callbacks.delete(approvalId);
      cb.resolve({ action: 'skip', text: null, media: [], item: cb.item });
    }
    editMode.delete(approvalId);
    editMedia.delete(approvalId);
    currentApproval = null;
    currentMessageId = null;
    sendNextApproval();
  }
});

// --- Text message handler ---

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();

  // EDIT mode: text goes to photographer
  if (currentApproval && editMode.has(currentApproval.approvalId)) {
    const approvalId = currentApproval.approvalId;
    editMode.delete(approvalId);

    const cb = callbacks.get(approvalId);
    if (cb) {
      callbacks.delete(approvalId);
      cb.resolve({
        action: 'edit',
        text,
        media: editMedia.get(approvalId) || [],
        item: cb.item
      });
    }
    editMedia.delete(approvalId);

    await ctx.reply('✅ Текст принят');
    currentApproval = null;
    currentMessageId = null;
    sendNextApproval();
    return;
  }

  // Agent mode: chat with Grok
  try {
    await ctx.replyWithChatAction('typing');
    const reply = await agentChat(text);
    if (reply) {
      if (reply.includes('REQUEST_MODEL_INFO')) {
        const cleanReply = reply.replace(/REQUEST_MODEL_INFO/g, '').trim();
        if (cleanReply) await ctx.reply(cleanReply);
        await bot.api.sendMessage(CHAT_ID, MODEL_INFO_CARD);
      } else if (reply.includes('SEND_MEDIA:')) {
        await processSendMediaCommand(reply, ctx);
      } else {
        await ctx.reply(reply);
      }
    }
  } catch (err) {
    console.error('[agent] Chat error:', err.message);
    await ctx.reply('⚠️ Ошибка агента: ' + err.message);
  }
});

// --- Media handler (photos, documents) ---

bot.on('message:photo', async (ctx) => {
  await handleMedia(ctx, 'photo');
});

bot.on('message:document', async (ctx) => {
  await handleMedia(ctx, 'document');
});

async function handleMedia(ctx, type) {
  // In EDIT mode: collect media for photographer
  if (currentApproval && editMode.has(currentApproval.approvalId)) {
    const approvalId = currentApproval.approvalId;
    const files = editMedia.get(approvalId) || [];

    let fileId;
    if (type === 'photo') {
      // Get highest resolution
      const photos = ctx.message.photo;
      fileId = photos[photos.length - 1].file_id;
    } else {
      fileId = ctx.message.document.file_id;
    }

    // Download file
    const file = await ctx.api.getFile(fileId);
    const filePath = file.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;

    // Save to temp
    const fs = require('fs');
    const path = require('path');
    const tmpDir = path.resolve(__dirname, '../../data/tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const ext = path.extname(filePath) || (type === 'photo' ? '.jpg' : '');
    const localPath = path.join(tmpDir, `${approvalId}-${files.length}${ext}`);

    const res = await fetch(downloadUrl);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(localPath, buffer);

    files.push(localPath);
    editMedia.set(approvalId, files);

    const caption = ctx.message.caption || '';
    await ctx.reply(`📎 Файл добавлен (${files.length}). ${caption ? 'Отправьте текст ответа.' : 'Можно добавить ещё или отправить текст ответа.'}`);
    return;
  }

  // Outside EDIT mode: save to buffer for deferred sending
  const localPath = await downloadTelegramFile(ctx, type);
  if (localPath) {
    mediaBuffer.push({ localPath, type, timestamp: Date.now() });
    const caption = ctx.message.caption || '';
    const bufCount = mediaBuffer.length;
    const msg = caption
      ? `📎 Файл сохранён (${bufCount} в буфере). ${caption}`
      : `📎 Файл сохранён (${bufCount} в буфере). Скажите кому отправить или добавьте ещё.`;

    // If there's a caption, also pass to agent
    if (caption) {
      try {
        await ctx.replyWithChatAction('typing');
        const reply = await agentChat(`[Сохранено ${type === 'photo' ? 'фото' : 'файл'}, ${bufCount} в буфере] ${caption}`);
        if (reply) {
          // Check for SEND_MEDIA command
          if (reply.includes('SEND_MEDIA:')) {
            await processSendMediaCommand(reply, ctx);
          } else {
            await ctx.reply(reply);
          }
        }
      } catch (err) {
        console.error('[agent] Media chat error:', err.message);
        await ctx.reply(msg);
      }
    } else {
      await ctx.reply(msg);
    }
  }
}

async function downloadTelegramFile(ctx, type) {
  try {
    let fileId;
    if (type === 'photo') {
      const photos = ctx.message.photo;
      fileId = photos[photos.length - 1].file_id;
    } else {
      fileId = ctx.message.document.file_id;
    }

    const file = await ctx.api.getFile(fileId);
    const filePath = file.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;

    const fs = require('fs');
    const pathMod = require('path');
    const tmpDir = pathMod.resolve(__dirname, '../../data/tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const ext = pathMod.extname(filePath) || (type === 'photo' ? '.jpg' : '');
    const localPath = pathMod.join(tmpDir, `media-${Date.now()}${ext}`);

    const res = await fetch(downloadUrl);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(localPath, buffer);
    return localPath;
  } catch (err) {
    console.error('Download file error:', err.message);
    return null;
  }
}

async function processSendMediaCommand(reply, ctx) {
  const lines = reply.split('\n');
  const displayLines = [];
  for (const line of lines) {
    const match = line.match(/^SEND_MEDIA:([^:]+):([^:]+):(.+)$/);
    if (match) {
      const [, photographer, site, message] = match;
      if (mediaBuffer.length === 0) {
        displayLines.push('⚠️ Буфер медиа пуст');
        continue;
      }
      const files = mediaBuffer.splice(0, mediaBuffer.length).map(m => m.localPath);
      // Queue media send
      pendingMediaSends.push({
        photographer: photographer.trim(),
        site: site.trim(),
        message: message.trim(),
        files
      });
      displayLines.push(`📤 Медиа (${files.length} файлов) будет отправлено ${photographer.trim()} на ${site.trim()}`);
    } else {
      displayLines.push(line);
    }
  }
  const text = displayLines.join('\n').trim();
  if (text) await ctx.reply(text);
}

// Pending media sends — processed by pipeline when AdsPower opens
const pendingMediaSends = [];

// --- Bot lifecycle ---

async function startBot() {
  console.log('Telegram bot starting...');
  await bot.api.deleteWebhook({ drop_pending_updates: true });
  await new Promise(r => setTimeout(r, 1000));

  bot.start({
    onStart: () => console.log('Telegram bot started'),
    drop_pending_updates: true,
  });
}

function stopBot() {
  bot.stop();
}

module.exports = { bot, startBot, stopBot, queueApproval, sendNextApproval, pendingMediaSends };
