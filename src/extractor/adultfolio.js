const { detectLanguage } = require('./qualify');

async function extract(page, siteConfig, modelName) {
  const selfPattern = siteConfig.selfProfilePattern || 'Ana_Voloshina';

  await page.goto(siteConfig.messageUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Collect inbox items — get their URLs directly via href instead of clicking
  const inboxItems = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.message-list-template-unread, .message-list-template')];
    return rows.slice(0, 22).map(el => {
      const link = el.querySelector('a[href*="message.php"]');
      const href = link?.href || '';
      const photographer = (el.querySelector('.col-lg-7')?.textContent || '').trim();
      return { href, photographer };
    }).filter(x => x.href);
  });

  const results = [];

  for (const item of inboxItems) {
    try {
      await page.goto(item.href, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      const dialog = await page.evaluate((selfPat) => {
        const url = location.href;
        const photographer = (document.querySelector('.itemWell.internalPadding .thumbnailPic[href^="/"]')?.getAttribute('href') || '').replace(/^\//, '') ||
          (document.querySelector('.itemWell.internalPadding')?.innerText || '').split('\n')[0].trim();

        const messages = [...document.querySelectorAll('.messageContainer')].map(el => {
          const profileHref = el.querySelector('.thumbnailPic')?.getAttribute('href') || '';
          const role = new RegExp(selfPat, 'i').test(profileHref) ? 'self' : 'interlocutor';
          const text = (el.querySelector('[id^="message-content-"]')?.innerText || '').trim();
          return { role, text };
        }).filter(m => m.text);

        return { url, photographer, messages };
      }, selfPattern);

      if (dialog.messages.length === 0) continue;
      const lastIncoming = [...dialog.messages].reverse().find(m => m.role === 'interlocutor');
      if (!lastIncoming) continue;

      results.push({
        site: 'adultfolio',
        siteLabel: 'adultfolio.com',
        model: modelName,
        photographer: dialog.photographer || item.photographer,
        url: dialog.url,
        language: detectLanguage(lastIncoming.text),
        messages: dialog.messages,
        lastIncoming: lastIncoming.text
      });
    } catch (err) {
      console.error(`adultfolio extract error: ${err.message}`);
    }
  }

  return results;
}

module.exports = { extract };
