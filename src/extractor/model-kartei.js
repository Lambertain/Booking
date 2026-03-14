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

  // Try unread first, then all messages
  const pagesToTry = [site.unreadUrl, site.messageUrl].filter(Boolean);

  for (const url of pagesToTry) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    // Primary: find links inside .lWrapper containers
    let urls = await page.evaluate(({ itemSel, linkSel }) => {
      const rows = [...document.querySelectorAll(itemSel)];
      return [...new Set(rows.map(r => r.querySelector(linkSel)?.href).filter(Boolean))];
    }, { itemSel: sel.dialogItem, linkSel: sel.dialogOpenTarget });

    // Fallback: find all dialog links by pattern /pn/\d+/
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
      console.log(`  model-kartei: found ${urls.length} dialog URLs from ${url}`);
      return urls.slice(0, 22);
    }
  }

  console.log('  model-kartei: no dialog URLs found on any page');
  return [];
}

async function extractSingleDialog(page, sel, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const messages = await page.evaluate(({ rowSel, textSel, selfSel }) => {
    return [...document.querySelectorAll(rowSel)].map(row => {
      const text = (row.querySelector(textSel)?.innerText || '').trim();
      const isSelf = row.matches(selfSel) || row.className.includes('sedcard1');
      return { role: isSelf ? 'self' : 'interlocutor', text };
    });
  }, { rowSel: sel.messageRow, textSel: sel.messageText, selfSel: sel.messageAuthorSelf });

  const photographer = await page.evaluate(() => {
    for (const s of ['.mailContent .username', '.username', 'h1', 'h2']) {
      const v = document.querySelector(s)?.textContent?.trim();
      if (v) return v;
    }
    return '';
  });

  return { url, photographer, messages };
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
