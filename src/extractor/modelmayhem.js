const { detectLanguage } = require('./qualify');

async function collectInboxLinks(page) {
  await page.goto('https://www.modelmayhem.com/mystuff#/inbox', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  return await page.evaluate(() => {
    return [...document.querySelectorAll('a[href*="#/read/"]')].slice(0, 22).map(a => ({
      href: a.href,
      subject: (a.textContent || '').trim(),
      photographer: (() => {
        const wrap = a.closest('.MessagesSection') || a.closest('div')?.parentElement || a.parentElement;
        const lines = (wrap?.innerText || '').split('\n').map(x => x.trim()).filter(Boolean);
        return lines[0] && lines[0] !== (a.textContent || '').trim() ? lines[0] : '';
      })()
    })).filter(x => x.href);
  });
}

async function extractDialog(page, href, selfProfileId, selfName) {
  await page.goto(href, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  return await page.evaluate(({ selfProfileId, selfName }) => {
    const senderBoxes = [...document.querySelectorAll('.SenderBox')];
    const textNodes = [...document.querySelectorAll('.MessagesSection .text')];

    const messages = senderBoxes.map((senderBox, i) => {
      const senderLink = senderBox.querySelector('a[href^="/"]')?.getAttribute('href') || '';
      const senderName = (senderBox.innerText || '').split('\n').map(x => x.trim()).filter(Boolean)[0] || '';
      const text = (textNodes[i]?.innerText || textNodes[i]?.textContent || '').trim();
      const isSelf = senderLink.includes(`/${selfProfileId}`) || senderName.toLowerCase() === selfName.toLowerCase();
      return { role: isSelf ? 'self' : 'interlocutor', senderName, text };
    }).filter(m => m.text);

    const photographer = messages.find(m => m.role === 'interlocutor')?.senderName || '';
    return { url: location.href, photographer, messages };
  }, { selfProfileId, selfName });
}

async function extract(page, siteConfig, modelName) {
  const selfProfileId = siteConfig.selfProfileId || '';
  const inbox = await collectInboxLinks(page);
  const results = [];

  for (const item of inbox) {
    try {
      const dialog = await extractDialog(page, item.href, selfProfileId, modelName);
      if (dialog.messages.length === 0) continue;

      const lastIncoming = [...dialog.messages].reverse().find(m => m.role === 'interlocutor');
      if (!lastIncoming) continue;

      results.push({
        site: 'modelmayhem',
        siteLabel: 'Model Mayhem',
        model: modelName,
        photographer: dialog.photographer || item.photographer,
        url: dialog.url,
        language: detectLanguage(lastIncoming.text),
        messages: dialog.messages,
        lastIncoming: lastIncoming.text
      });
    } catch (err) {
      console.error(`modelmayhem extract error: ${err.message}`);
    }
  }

  return results;
}

module.exports = { extract };
