const { qualifiesInterest, detectLanguage } = require('./qualify');

function isUiNoise(text) {
  if (!text || !text.trim()) return true;
  if (/^\d+\s*\/\s*5\.000$/i.test(text.trim())) return true;
  if (/^select (default message|file)$/i.test(text.trim())) return true;
  if (/^пожаловаться$/i.test(text.trim())) return true;
  return false;
}

async function discoverDialogUrls(page, site) {
  const sel = site.selectors;
  await page.goto(site.unreadUrl || site.messageUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  let urls = await page.evaluate(({ itemSel, linkSel }) => {
    const rows = [...document.querySelectorAll(itemSel)];
    return [...new Set(rows.map(r => r.querySelector(linkSel)?.href).filter(Boolean))];
  }, { itemSel: sel.dialogItem, linkSel: sel.dialogOpenTarget });

  return urls.slice(0, 22);
}

async function extractSingleDialog(page, sel, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const messages = await page.evaluate(({ rowSel, textSel, selfSel, otherSel }) => {
    return [...document.querySelectorAll(rowSel)].map(row => {
      const text = (row.querySelector(textSel)?.innerText || '').trim();
      const isSelf = row.matches(selfSel) || row.className.includes('sedcard1');
      const role = isSelf ? 'self' : 'interlocutor';
      return { role, text };
    });
  }, { rowSel: sel.messageRow, textSel: sel.messageText, selfSel: sel.messageAuthorSelf, otherSel: sel.messageAuthorOther });

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
      const q = qualifiesInterest(messages, lastIncoming?.text || '');
      if (!q.qualified) continue;

      const language = detectLanguage(lastIncoming?.text || '');
      results.push({
        site: 'model-kartei',
        siteLabel: 'Model-Kartei',
        model: modelName,
        photographer: dialog.photographer,
        url: dialog.url,
        language,
        messages,
        lastIncoming: lastIncoming?.text || '',
        qualificationReason: q.reason
      });
    } catch (err) {
      console.error(`model-kartei extract error for ${url}: ${err.message}`);
    }
  }

  return results;
}

module.exports = { extract };
