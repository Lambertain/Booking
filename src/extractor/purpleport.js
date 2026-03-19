const { detectLanguage } = require('./qualify');

async function collectInboxLinks(page, siteConfig) {
  await page.goto(siteConfig.messageUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const urls = await page.evaluate(() => {
    // Find message thread links
    const links = [...document.querySelectorAll('a[href*="/account/messages/"], a[href*="/message/"]')]
      .map(a => ({ href: a.href, text: (a.textContent || '').trim() }))
      .filter(x => x.href && !x.href.endsWith('/messages/'));
    // Deduplicate
    const seen = new Set();
    return links.filter(x => { if (seen.has(x.href)) return false; seen.add(x.href); return true; }).slice(0, 22);
  });

  console.log(`  purpleport: found ${urls.length} inbox links`);
  return urls;
}

async function extract(page, siteConfig, modelName) {
  const inboxLinks = await collectInboxLinks(page, siteConfig);
  const selfPattern = siteConfig.selfProfilePattern || modelName;
  const results = [];

  for (const link of inboxLinks) {
    try {
      await page.goto(link.href, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      const dialog = await page.evaluate((selfPat) => {
        // Generic extraction: find message containers
        // Will be refined after DOM dump
        const messages = [];
        const photographer = '';

        // Try common patterns for message threads
        const containers = document.querySelectorAll(
          '.message, .msg, [class*="message"], [class*="thread"] > div, .conversation-message'
        );

        for (const el of containers) {
          const text = (el.innerText || '').trim();
          if (!text || text.length < 5) continue;

          // Try to detect self vs interlocutor
          const isSelf = el.classList.contains('sent') ||
            el.classList.contains('outgoing') ||
            el.classList.contains('mine') ||
            (el.querySelector('a[href]')?.textContent || '').toLowerCase().includes(selfPat.toLowerCase());

          messages.push({ role: isSelf ? 'self' : 'interlocutor', text: text.slice(0, 2000) });
        }

        return { messages, photographer, url: location.href };
      }, selfPattern);

      if (dialog.messages.length === 0) continue;
      const lastIncoming = [...dialog.messages].reverse().find(m => m.role === 'interlocutor');
      if (!lastIncoming) continue;

      results.push({
        site: 'purpleport',
        siteLabel: 'PurplePort',
        model: modelName,
        photographer: dialog.photographer || link.text || 'Unknown',
        url: link.href,
        language: detectLanguage(lastIncoming.text),
        messages: dialog.messages,
        lastIncoming: lastIncoming.text
      });
    } catch (err) {
      console.error(`purpleport extract error for ${link.href}: ${err.message}`);
    }
  }

  return results;
}

module.exports = { extract };
