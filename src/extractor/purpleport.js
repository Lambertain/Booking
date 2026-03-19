const { detectLanguage } = require('./qualify');

async function collectInboxLinks(page, siteConfig) {
  await page.goto(siteConfig.messageUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const urls = await page.evaluate(() => {
    return [...new Set(
      [...document.querySelectorAll('a[href*="viewmessage.asp"]')]
        .map(a => a.href)
        .filter(Boolean)
    )].slice(0, 22);
  });

  console.log(`  purpleport: found ${urls.length} inbox links`);
  return urls;
}

async function extract(page, siteConfig, modelName) {
  const inboxUrls = await collectInboxLinks(page, siteConfig);
  const selfPattern = siteConfig.selfProfilePattern || '';
  const results = [];

  for (const url of inboxUrls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      const dialog = await page.evaluate((selfPat) => {
        // Each message is a div.content inside div.message
        const contentBlocks = [...document.querySelectorAll('div.message div.content')];
        let photographer = '';

        const messages = contentBlocks.map(block => {
          const authorLink = block.querySelector('a.portlink');
          const authorHref = authorLink?.getAttribute('href') || '';
          const authorName = (authorLink?.textContent || '').trim();
          const textDiv = block.querySelector('div');
          const text = (textDiv?.innerText || '').trim();

          // Self = "Me" text or selfProfilePattern in href
          const isSelf = authorName === 'Me' ||
            (selfPat && authorHref.toLowerCase().includes(selfPat.toLowerCase()));

          if (!isSelf && !photographer && authorName) {
            photographer = authorName;
          }

          return { role: isSelf ? 'self' : 'interlocutor', text };
        }).filter(m => m.text);

        return { messages, photographer };
      }, selfPattern);

      if (dialog.messages.length === 0) continue;
      const lastIncoming = [...dialog.messages].reverse().find(m => m.role === 'interlocutor');
      if (!lastIncoming) continue;

      results.push({
        site: 'purpleport',
        siteLabel: 'PurplePort',
        model: modelName,
        photographer: dialog.photographer || 'Unknown',
        url,
        language: detectLanguage(lastIncoming.text),
        messages: dialog.messages,
        lastIncoming: lastIncoming.text
      });
    } catch (err) {
      console.error(`purpleport extract error for ${url}: ${err.message}`);
    }
  }

  return results;
}

module.exports = { extract };
