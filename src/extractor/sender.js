const { openPage } = require('./adspower');

async function sendAdultfolioReply(profileId, siteConfig, url, message, mediaFiles = []) {
  const session = await openPage(profileId);
  // Open new tab to avoid conflicts with existing tabs
  const page = await session.context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    const rf = siteConfig.replyForm;
    const formExists = await page.locator(rf.formSelector).count();
    if (!formExists) throw new Error('Reply form not found on page');

    // Fill text only if provided
    if (message && message.trim()) {
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
    } // end if (message)

    if (mediaFiles.length > 0) {
      const fs = require('fs');
      const existing = mediaFiles.filter(f => fs.existsSync(f));
      console.log(`[sender] Media files: ${mediaFiles.length} total, ${existing.length} exist`);
      if (existing.length > 0) {
        // Click into editor first
        await page.locator(rf.editorSelector).first().click();
        await page.waitForTimeout(1000);

        // Paste images via clipboard — adultfolio uploads them to their server
        for (const filePath of existing) {
          const b64 = fs.readFileSync(filePath).toString('base64');
          await page.evaluate(async (b64) => {
            const byteString = atob(b64);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
            const blob = new Blob([ab], { type: 'image/jpeg' });
            const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
            const dt = new DataTransfer();
            dt.items.add(file);
            const editor = document.querySelector('div.note-editable.panel-body');
            editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
          }, b64);
          await page.waitForTimeout(3000); // wait for adultfolio to upload
        }

        const imgCount = await page.evaluate((sel) => {
          return document.querySelector(sel)?.querySelectorAll('img').length || 0;
        }, rf.editorSelector);
        console.log(`[sender] ${imgCount} images uploaded via paste`);
      }
    }

    // Don't submit if nothing to send
    const hasText = message && message.trim();
    const hasMedia = mediaFiles.length > 0 && require('fs').existsSync(mediaFiles[0]);
    if (!hasText && !hasMedia) {
      console.error('[sender] Nothing to send — skipping submit');
      return { ok: false, url, reason: 'empty message and no media' };
    }

    await page.locator(rf.submitSelector).click();
    await page.waitForTimeout(6000);

    return { ok: true, url };
  } finally {
    await session.close();
  }
}

async function sendModelMayhemReply(profileId, siteConfig, url, message) {
  const session = await openPage(profileId);
  const page = await session.context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // Fill reply textarea
    const textarea = page.locator('textarea#AreaReplyMessage');
    if (await textarea.count() === 0) throw new Error('Reply textarea not found');
    await textarea.fill(message);
    await page.waitForTimeout(500);

    // Click Reply button
    const replyBtn = page.locator('input[type="submit"][value="Reply"]');
    if (await replyBtn.count() === 0) throw new Error('Reply button not found');
    await replyBtn.click();
    await page.waitForTimeout(5000);

    return { ok: true, url };
  } finally {
    await session.close();
  }
}

async function sendModelKarteiReply(profileId, siteConfig, url, message) {
  const session = await openPage(profileId);
  const page = await session.context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    const textarea = page.locator('textarea#pnTextpost');
    if (await textarea.count() === 0) throw new Error('Reply textarea not found');
    await textarea.fill(message);
    await page.waitForTimeout(500);

    const sendBtn = page.locator('form#pnSendForm button[type="submit"]');
    if (await sendBtn.count() === 0) throw new Error('Send button not found');
    await sendBtn.click();
    await page.waitForTimeout(5000);

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
  if (siteId === 'modelmayhem') {
    return sendModelMayhemReply(profileId, siteConfig, url, message);
  }
  if (siteId === 'model-kartei') {
    return sendModelKarteiReply(profileId, siteConfig, url, message);
  }
  throw new Error(`Sending not yet implemented for site: ${siteId}`);
}

module.exports = { sendReply };
