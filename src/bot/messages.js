function formatApprovalCard(item) {
  const lines = [
    `📸 *${escapeMarkdown(item.photographer || 'Unknown')}*`,
    `🌐 ${escapeMarkdown(item.siteLabel)}`,
    `👤 ${escapeMarkdown(item.model)}`,
    ''
  ];

  // Show translated incoming if available, original below
  if (item.lastIncomingEn && item.lastIncomingEn !== item.lastIncoming) {
    lines.push(
      '💬 *Incoming \\(translated\\):*',
      escapeMarkdown(truncate(item.lastIncomingEn, 500)),
      '',
      `_Original \\(${escapeMarkdown(item.language || '?')}\\):_`,
      `_${escapeMarkdown(truncate(item.lastIncoming, 300))}_`
    );
  } else {
    lines.push(
      '💬 *Incoming:*',
      escapeMarkdown(truncate(item.lastIncoming, 500))
    );
  }

  lines.push('', '✏️ *Draft:*', escapeMarkdown(truncate(item.draft, 800)));
  return lines.join('\n');
}

function buildApprovalKeyboard(approvalId) {
  return {
    inline_keyboard: [[
      { text: '✅ OK', callback_data: `approve:${approvalId}` },
      { text: '✏️ EDIT', callback_data: `edit:${approvalId}` },
      { text: '⏭ SKIP', callback_data: `skip:${approvalId}` }
    ]]
  };
}

function escapeMarkdown(text) {
  return (text || '').replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function truncate(text, max) {
  if (!text) return '(empty)';
  // Collapse 3+ consecutive newlines into 2 (one blank line max)
  const clean = text.replace(/\n{3,}/g, '\n\n').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max) + '...';
}

function collectPhotographerImages(messages) {
  const images = [];
  for (const m of messages || []) {
    if (m.role === 'interlocutor' && m.images && m.images.length > 0) {
      images.push(...m.images);
    }
  }
  return images;
}

module.exports = { formatApprovalCard, buildApprovalKeyboard, escapeMarkdown, collectPhotographerImages };
