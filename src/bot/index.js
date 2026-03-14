require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { Bot, InlineKeyboard } = require('grammy');
const { formatApprovalCard, buildApprovalKeyboard } = require('./messages');

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Approval queue and state
const approvalQueue = [];         // items waiting to be sent
let currentApproval = null;       // item currently shown to manager
let currentMessageId = null;      // telegram message id of current card
const editMode = new Map();       // approvalId -> true (waiting for edited text)
const callbacks = new Map();      // approvalId -> { resolve, item }

// --- Send approval to chat ---

async function sendNextApproval() {
  if (currentApproval) return;
  if (approvalQueue.length === 0) return;

  const item = approvalQueue.shift();
  currentApproval = item;

  const text = formatApprovalCard(item);
  const keyboard = buildApprovalKeyboard(item.approvalId, item.url);

  try {
    const msg = await bot.api.sendMessage(CHAT_ID, text, {
      parse_mode: 'MarkdownV2',
      reply_markup: keyboard
    });
    currentMessageId = msg.message_id;
  } catch (err) {
    console.error('Failed to send approval card:', err.message);
    // Try plain text fallback
    try {
      const plain = `📸 ${item.photographer} | ${item.siteLabel} | ${item.model}\n\nINCOMING:\n${item.lastIncoming}\n\nDRAFT:\n${item.draft}`;
      const keyboard = buildApprovalKeyboard(item.approvalId, item.url);
      const msg = await bot.api.sendMessage(CHAT_ID, plain, { reply_markup: keyboard });
      currentMessageId = msg.message_id;
    } catch (err2) {
      console.error('Failed plain text fallback:', err2.message);
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
    await ctx.answerCallbackQuery({ text: 'This item is no longer active' });
    return;
  }

  const cb = callbacks.get(approvalId);

  if (action === 'approve') {
    await ctx.answerCallbackQuery({ text: '✅ Approved!' });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    if (cb) {
      callbacks.delete(approvalId);
      cb.resolve({ action: 'approve', text: currentApproval.draft, item: cb.item });
    }
    currentApproval = null;
    currentMessageId = null;
    sendNextApproval();
  } else if (action === 'edit') {
    editMode.set(approvalId, true);
    await ctx.answerCallbackQuery({ text: '✏️ Send the corrected text' });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    await bot.api.sendMessage(CHAT_ID, '✏️ Надішліть виправлений текст відповіді:');
  } else if (action === 'skip') {
    await ctx.answerCallbackQuery({ text: '⏭ Skipped' });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    if (cb) {
      callbacks.delete(approvalId);
      cb.resolve({ action: 'skip', text: null, item: cb.item });
    }
    editMode.delete(approvalId);
    currentApproval = null;
    currentMessageId = null;
    sendNextApproval();
  }
});

// --- Text message handler (for EDIT mode) ---

bot.on('message:text', async (ctx) => {
  if (!currentApproval) return;
  const approvalId = currentApproval.approvalId;
  if (!editMode.has(approvalId)) return;

  const editedText = ctx.message.text.trim();
  editMode.delete(approvalId);

  const cb = callbacks.get(approvalId);
  if (cb) {
    callbacks.delete(approvalId);
    cb.resolve({ action: 'edit', text: editedText, item: cb.item });
  }

  await ctx.reply('✅ Текст прийнято');
  currentApproval = null;
  currentMessageId = null;
  sendNextApproval();
});

// --- Bot lifecycle ---

async function startBot() {
  console.log('Telegram bot starting...');
  bot.start({
    onStart: () => console.log('Telegram bot started'),
  });
}

function stopBot() {
  bot.stop();
}

module.exports = { bot, startBot, stopBot, queueApproval, sendNextApproval };
