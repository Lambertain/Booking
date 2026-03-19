const { detectLanguage } = require('./qualify');

async function collectInboxLinks(page) {
  await page.goto('https://www.modelmayhem.com/mystuff#/inbox', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  // Click settings gear and set Sort by: Unread
  try {
    const gear = page.locator('.settings-icon, [class*="settings"], [class*="gear"], svg[class*="cog"]').first();
    if (await gear.count() > 0) {
      await gear.click();
      await page.waitForTimeout(1000);
      // Select "Unread" in sort dropdown
      const sortSelect = page.locator('select').filter({ hasText: 'Unread' }).first();
      if (await sortSelect.count() > 0) {
        await sortSelect.selectOption('unread');
        await page.waitForTimeout(3000);
      }
    }
  } catch {}

  // Try to change sort via URL parameter on old interface
  await page.goto('https://www.modelmayhem.com/msg/inbox', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Click Sort by dropdown and select Unread
  try {
    const sortDropdown = page.locator('select:near(:text("Sort by"))').first();
    if (await sortDropdown.count() > 0) {
      await sortDropdown.selectOption({ label: 'Unread' });
      await page.waitForTimeout(3000);
    } else {
      // Try direct select by text content
      const allSelects = page.locator('select');
      const count = await allSelects.count();
      for (let i = 0; i < count; i++) {
        const options = await allSelects.nth(i).evaluate(el => [...el.options].map(o => o.text));
        if (options.some(o => o.toLowerCase().includes('unread'))) {
          await allSelects.nth(i).selectOption({ label: options.find(o => o.toLowerCase().includes('unread')) });
          await page.waitForTimeout(3000);
          break;
        }
      }
    }
  } catch {}

  // Collect links from whatever page we're on
  let urls = await page.evaluate(() => {
    // Old interface
    const oldLinks = [...document.querySelectorAll('a[href*="/msg/read/"]')];
    if (oldLinks.length > 0) {
      return oldLinks.slice(0, 22).map(a => {
        const row = a.closest('tr');
        const cells = row ? [...row.querySelectorAll('td')] : [];
        const photographer = cells[0]?.innerText?.trim()?.replace(/\[\+\]/, '').trim() || '';
        const subject = (a.textContent || '').trim();
        // Convert old URL to SPA URL
        const msgId = a.href.match(/\/msg\/read\/(\d+)/)?.[1];
        const href = msgId ? `https://www.modelmayhem.com/mystuff#/read/${msgId}` : a.href;
        return { href, subject, photographer };
      });
    }
    // SPA interface
    return [...document.querySelectorAll('a[href*="#/read/"]')].slice(0, 22).map(a => ({
      href: a.href,
      subject: (a.textContent || '').trim(),
      photographer: (() => {
        const wrap = a.closest('.MessagesSection') || a.closest('div')?.parentElement || a.parentElement;
        const lines = (wrap?.innerText || '').split('\n').map(x => x.trim()).filter(Boolean);
        return lines[0] && lines[0] !== (a.textContent || '').trim() ? lines[0] : '';
      })()
    }));
  });

  urls = urls.filter(x => x.href);
  console.log(`  modelmayhem: found ${urls.length} inbox links`);
  return urls;
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
