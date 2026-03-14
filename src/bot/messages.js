function formatApprovalCard(item) {
  const lines = [
    `📸 *${escapeMarkdown(item.photographer || 'Unknown')}*`,
    `🌐 ${escapeMarkdown(item.siteLabel)}`,
    `👤 ${escapeMarkdown(item.model)}`,
    '',
    '💬 *Incoming:*',
    escapeMarkdown(truncate(item.lastIncoming, 500)),
    '',
    '✏️ *Draft:*',
    escapeMarkdown(truncate(item.draft, 800))
  ];
  return lines.join('\n');
}

function buildApprovalKeyboard(approvalId, url) {
  const buttons = [];
  if (url) {
    buttons.push([{ text: '🔗 OPEN', url }]);
  }
  buttons.push([
    { text: '✅ OK', callback_data: `approve:${approvalId}` },
    { text: '✏️ EDIT', callback_data: `edit:${approvalId}` },
    { text: '⏭ SKIP', callback_data: `skip:${approvalId}` }
  ]);
  return { inline_keyboard: buttons };
}

function escapeMarkdown(text) {
  return (text || '').replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function truncate(text, max) {
  if (!text) return '(empty)';
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

module.exports = { formatApprovalCard, buildApprovalKeyboard, escapeMarkdown };
