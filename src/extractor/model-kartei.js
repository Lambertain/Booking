const { detectLanguage } = require('./qualify');

function isUiNoise(text) {
  if (!text || !text.trim()) return true;
  if (/^\d+\s*\/\s*5\.000$/i.test(text.trim())) return true;
  if (/^select (default message|file)$/i.test(text.trim())) return true;
  if (/^пожаловаться$/i.test(text.trim())) return true;
  return false;
}

async function discoverDialogUrls(page, site) {
  const sel = site.selectors;

  // If unread URL is configured, use it exclusively — don't fall back to all messages
  // Falling back to /pn/ (all messages) causes old answered conversations to be re-processed
  if (site.unreadUrl) {
    await page.goto(site.unreadUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    let urls = await page.evaluate(({ itemSel, linkSel }) => {
      const rows = [...document.querySelectorAll(itemSel)];
      return [...new Set(rows.map(r => r.querySelector(linkSel)?.href).filter(Boolean))];
    }, { itemSel: sel.dialogItem, linkSel: sel.dialogOpenTarget });

    if (urls.length === 0) {
      urls = await page.evaluate(() => {
        return [...new Set(
          [...document.querySelectorAll('a[href*="/pn/"]')]
            .map(a => a.href)
            .filter(href => /\/pn\/\d+\/?$/.test(href))
        )];
      });
    }

    if (urls.length > 0) {
      console.log(`  model-kartei: found ${urls.length} unread dialog URLs`);
      return urls.slice(0, 22);
    }

    console.log('  model-kartei: no unread dialogs');
    return [];
  }

  // No unread URL — use all messages page
  await page.goto(site.messageUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  let urls = await page.evaluate(({ itemSel, linkSel }) => {
    const rows = [...document.querySelectorAll(itemSel)];
    return [...new Set(rows.map(r => r.querySelector(linkSel)?.href).filter(Boolean))];
  }, { itemSel: sel.dialogItem, linkSel: sel.dialogOpenTarget });

  if (urls.length === 0) {
    urls = await page.evaluate(() => {
      return [...new Set(
        [...document.querySelectorAll('a[href*="/pn/"]')]
          .map(a => a.href)
          .filter(href => /\/pn\/\d+\/?$/.test(href))
      )];
    });
  }

  if (urls.length > 0) {
    console.log(`  model-kartei: found ${urls.length} dialog URLs`);
    return urls.slice(0, 22);
  }

  console.log('  model-kartei: no dialog URLs found');
  return [];
}

async function extractSingleDialog(page, sel, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const result = await page.evaluate(({ rowSel, textSel, selfSel, otherSel }) => {
    const rows = [...document.querySelectorAll(rowSel)];
    const messages = rows.map(row => {
      const text = (row.querySelector(textSel)?.innerText || '').trim();
      const isSelf = row.matches(selfSel) || row.className.includes('sedcard1');
      return { role: isSelf ? 'self' : 'interlocutor', text };
    });
    // Photographer name from the interlocutor's message block (sedcard2)
    const otherBlock = document.querySelector(otherSel);
    const photographer = otherBlock?.querySelector('.username')?.textContent?.trim() || '';
    return { messages, photographer };
  }, { rowSel: sel.messageRow, textSel: sel.messageText, selfSel: sel.messageAuthorSelf, otherSel: sel.messageAuthorOther });

  return { url, photographer: result.photographer, messages: result.messages };
}

async function extract(page, siteConfig, modelName) {
  const sel = siteConfig.selectors;
  const urls = await discoverDialogUrls(page, siteConfig);
  const results = [];

  for (const url of urls) {
    try {
      const dialog = await extractSingleDialog(page, sel, url);
      const seen = new Set();
      const messages = dialog.messages
        .map(m => ({ role: m.role, text: (m.text || '').trim() }))
        .filter(m => !isUiNoise(m.text))
        .filter(m => {
          const key = `${m.role}:::${m.text}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      if (messages.length === 0) continue;
      const lastIncoming = [...messages].reverse().find(m => m.role === 'interlocutor');
      if (!lastIncoming) continue;

      results.push({
        site: 'model-kartei',
        siteLabel: 'Model-Kartei',
        model: modelName,
        photographer: dialog.photographer,
        url: dialog.url,
        language: detectLanguage(lastIncoming.text),
        messages,
        lastIncoming: lastIncoming.text
      });
    } catch (err) {
      console.error(`model-kartei extract error for ${url}: ${err.message}`);
    }
  }

  return results;
}

module.exports = { extract };
