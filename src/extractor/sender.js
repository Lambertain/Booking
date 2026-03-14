const { openPage } = require('./adspower');

async function sendAdultfolioReply(profileId, siteConfig, url, message, mediaFiles = []) {
  const session = await openPage(profileId);
  const { page } = session;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    const rf = siteConfig.replyForm;
    const formExists = await page.locator(rf.formSelector).count();
    if (!formExists) throw new Error('Reply form not found on page');

    const editor = page.locator(rf.editorSelector).first();
    await editor.click();
    await page.evaluate(({ message, editorSel, textareaSel }) => {
      const editor = document.querySelector(editorSel);
      if (editor) {
        editor.innerHTML = '';
        message.split('\n').forEach(line => {
          const div = document.createElement('div');
          div.textContent = line;
          editor.appendChild(div);
        });
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const ta = document.querySelector(textareaSel);
      if (ta) {
        ta.value = message;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, { message, editorSel: rf.editorSelector, textareaSel: rf.textareaSelector });

    if (mediaFiles.length > 0) {
      const fileInput = page.locator(rf.fileInputSelector);
      await fileInput.setInputFiles(mediaFiles);
      await page.waitForTimeout(5000);
    }

    await page.locator(rf.submitSelector).click();
    await page.waitForTimeout(6000);

    return { ok: true, url };
  } finally {
    await session.close();
  }
}

async function sendReply(profileId, siteConfig, url, message, mediaFiles = []) {
  const siteId = siteConfig.id;
  if (siteId === 'adultfolio') {
    return sendAdultfolioReply(profileId, siteConfig, url, message, mediaFiles);
  }
  throw new Error(`Sending not yet implemented for site: ${siteId}`);
}

module.exports = { sendReply };
