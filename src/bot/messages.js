// Message 1: conversation history (no buttons), up to 4000 chars
function formatConversationHistory(item) {
  const header = [
    `📸 *${escapeMarkdown(item.photographer || 'Unknown')}*`,
    `🌐 ${escapeMarkdown(item.siteLabel)}`,
    `👤 ${escapeMarkdown(item.model)}`,
    '',
    '💬 *Переписка:*',
  ].join('\n');

  const LIMIT = 3900;
  const messages = item.messages || [];

  // Build formatted lines (chronological order)
  const lines = [];
  for (const m of messages) {
    const who = m.role === 'self' ? '▶' : '◀';
    const text = (m.text || '').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) continue;
    lines.push(`${who} ${text}`);
  }

  if (lines.length === 0) {
    return header + '\n\n' + escapeMarkdown('(немає повідомлень)');
  }

  const available = LIMIT - header.length - 2;

  // Last message always goes in full (it may be from photographer or model)
  // Then prepend older messages while they fit; if one doesn't fit fully — take its tail with "..."
  let body = lines[lines.length - 1];
  for (let i = lines.length - 2; i >= 0; i--) {
    const sep = '\n\n';
    const full = lines[i] + sep + body;
    if (full.length <= available) {
      body = full;
    } else {
      // Take as much of this message as fits, prefixed with "..."
      const room = available - sep.length - body.length - 3; // 3 for "..."
      if (room > 10) {
        const partial = '...' + lines[i].slice(lines[i].length - room);
        body = partial + sep + body;
      }
      break;
    }
  }

  return header + '\n\n' + escapeMarkdown(body);
}

// Message 2: draft with approve buttons
function formatDraftCard(item) {
  const lines = [];

  if (item.lastIncomingEn && item.lastIncomingEn !== item.lastIncoming) {
    lines.push(
      `🌐 _Переклад \\(${escapeMarkdown(item.language || '?')}\\):_`,
      escapeMarkdown(truncate(item.lastIncomingEn, 600)),
      ''
    );
  }

  lines.push('✏️ *Draft:*', escapeMarkdown(truncate(item.draft, 800)));
  return lines.join('\n');
}

// Legacy single-card format (kept as fallback plain text)
function formatApprovalCardPlain(item) {
  return `📸 ${item.photographer} | ${item.siteLabel} | ${item.model}\n\n💬 INCOMING:\n${item.lastIncoming}\n\n✏️ DRAFT:\n${item.draft}`;
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

module.exports = { formatConversationHistory, formatDraftCard, formatApprovalCardPlain, buildApprovalKeyboard, escapeMarkdown, collectPhotographerImages };
