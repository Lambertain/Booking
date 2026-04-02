const fs = require('fs');
const { openPage } = require('./adspower');

async function sendAdultfolioReply(profileId, siteConfig, url, message, mediaFiles = []) {
  const session = await openPage(profileId);
  try {
    const page = await session.context.newPage();
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
    }

    if (mediaFiles.length > 0) {
      const existing = mediaFiles.filter(f => fs.existsSync(f));
      console.log(`[sender] Media files: ${mediaFiles.length} total, ${existing.length} exist`);
      if (existing.length > 0) {
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
          await page.waitForTimeout(3000);
        }

        const imgCount = await page.evaluate((sel) => {
          return document.querySelector(sel)?.querySelectorAll('img').length || 0;
        }, rf.editorSelector);
        console.log(`[sender] ${imgCount} images uploaded via paste`);
      }
    }

    const hasText = message && message.trim();
    const hasMedia = mediaFiles.length > 0 && fs.existsSync(mediaFiles[0]);
    if (!hasText && !hasMedia) {
      console.error('[sender] Nothing to send — skipping submit');
      return { ok: false, url, reason: 'empty message and no media' };
    }

    await page.locator(rf.submitSelector).click();
    await page.waitForTimeout(6000);

    // Reload page and check if our text appears in the conversation
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    const sent = await page.evaluate((msg) => {
      const texts = [...document.querySelectorAll('[id^="message-content-"]')].map(el => el.innerText || '');
      return texts.some(t => t.includes(msg.slice(0, 30)));
    }, message);
    if (!sent) throw new Error('Повідомлення не знайдено в розмові після відправки (adultfolio)');

    return { ok: true, url };
  } finally {
    await session.close();
  }
}

async function sendModelMayhemReply(profileId, siteConfig, url, message) {
  const session = await openPage(profileId);
  try {
    const page = await session.context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    const textarea = page.locator('textarea#AreaReplyMessage');
    if (await textarea.count() === 0) throw new Error('Reply textarea not found');
    await textarea.fill(message);
    await page.waitForTimeout(500);

    const replyBtn = page.locator('input[type="submit"][value="Reply"]');
    if (await replyBtn.count() === 0) throw new Error('Reply button not found');
    await replyBtn.click();
    await page.waitForTimeout(5000);

    return { ok: true, url };
  } finally {
    await session.close();
  }
}

async function sendModelKarteiReply(profileId, siteConfig, url, message, mediaFiles = []) {
  const session = await openPage(profileId);
  try {
    const page = await session.context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    const textarea = page.locator('textarea#pnTextpost');
    if (await textarea.count() === 0) throw new Error('Reply textarea not found');
    await textarea.fill(message);
    await page.waitForTimeout(500);

    // Attach media files via file input if available
    if (mediaFiles.length > 0) {
      const existing = mediaFiles.filter(f => fs.existsSync(f));
      if (existing.length > 0) {
        const fileInput = page.locator('input#pnMsgFile');
        if (await fileInput.count() > 0) {
          // Model-Kartei accepts one file at a time, use the first one
          await fileInput.setInputFiles(existing[0]);
          console.log(`[sender] Model-Kartei: attached file ${existing[0]}`);
          await page.waitForTimeout(1000);
        }
      }
    }

    const sendBtn = page.locator('form#pnSendForm button[type="submit"]');
    if (await sendBtn.count() === 0) throw new Error('Send button not found');

    // Count self-messages before sending (to verify after)
    const selfCountBefore = await page.evaluate(() =>
      document.querySelectorAll('.sedcard1').length
    );
    console.log(`[sender] Model-Kartei self-messages before: ${selfCountBefore}`);

    await sendBtn.click();
    await page.waitForTimeout(5000);

    // Reload page and verify new self-message appeared
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    const selfCountAfter = await page.evaluate(() =>
      document.querySelectorAll('.sedcard1').length
    );
    console.log(`[sender] Model-Kartei self-messages after: ${selfCountAfter}`);
    if (selfCountAfter <= selfCountBefore) throw new Error('Повідомлення не з\'явилось у розмові після відправки (model-kartei)');

    return { ok: true, url };
  } finally {
    await session.close();
  }
}

async function sendPurplePortReply(profileId, siteConfig, url, message) {
  const session = await openPage(profileId);
  try {
    const page = await session.context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // Check login — PurplePort redirects to /login if session expired
    const currentUrl = page.url();
    console.log(`[sender] PurplePort page URL: ${currentUrl}`);
    if (currentUrl.includes('/login') || currentUrl.includes('/signin')) {
      throw new Error(`Сесія PurplePort закінчилась — потрібно перелогінитись (${currentUrl})`);
    }

    // PurplePort uses TinyMCE editor
    const formExists = await page.locator('form#message').count();
    if (!formExists) {
      const pageTitle = await page.title().catch(() => '');
      const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '').catch(() => '');
      throw new Error(`Reply form #message not found. Title: "${pageTitle}". Page: ${bodyText.replace(/\n/g, ' ')}`);
    }

    // Count self-messages before sending (to verify after)
    const selfCountBefore = await page.evaluate(() => {
      return [...document.querySelectorAll('div.message div.content')]
        .filter(block => {
          const author = block.querySelector('a.portlink');
          return !author || (author.textContent || '').trim() === 'Me';
        }).length;
    });
    console.log(`[sender] PurplePort self-messages before: ${selfCountBefore}`);

    // Input text directly into TinyMCE iframe — most reliable, simulates real user
    let inputMethod = 'none';
    const tinyFrame = page.frameLocator('iframe#content_ifr, iframe[id$="_ifr"]').first();
    const tinyBody = tinyFrame.locator('body');
    const tinyFrameCount = await tinyBody.count().catch(() => 0);

    if (tinyFrameCount > 0) {
      // Click into TinyMCE body, select all, type new message
      await tinyBody.click();
      await page.waitForTimeout(300);
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Delete');
      await page.waitForTimeout(200);
      await tinyBody.type(message, { delay: 15 });
      // Sync TinyMCE content back to textarea before submit
      await page.evaluate(() => {
        if (typeof tinymce !== 'undefined' && tinymce.activeEditor) {
          tinymce.activeEditor.save();
        }
      });
      inputMethod = 'tinymce-iframe';
    } else {
      // Fallback: fill textarea directly
      const ta = page.locator('textarea#content, textarea[name="content"]').first();
      if (await ta.count() === 0) throw new Error('Could not find TinyMCE iframe or textarea to input message');
      await ta.fill(message);
      inputMethod = 'textarea';
    }
    console.log(`[sender] PurplePort message input via ${inputMethod}`);
    await page.waitForTimeout(500);

    // PurplePort uses <a id="replybutton" onclick="sendReply()"> — AJAX, no page navigation
    const replyBtn = page.locator('a#replybutton');
    if (await replyBtn.count() === 0) throw new Error('Reply button (a#replybutton) not found on page');

    // Wait for network request after click (AJAX send)
    const responsePromise = page.waitForResponse(
      res => res.url().includes('purpleport.com') && res.request().method() === 'POST',
      { timeout: 15000 }
    ).catch(() => null);
    await replyBtn.click();
    const response = await responsePromise;
    if (response) {
      console.log(`[sender] PurplePort AJAX response: ${response.status()} ${response.url()}`);
    }
    await page.waitForTimeout(3000);

    // Verify login not lost
    const finalUrl = page.url();
    console.log(`[sender] PurplePort after submit URL: ${finalUrl}`);
    if (finalUrl.includes('/login') || finalUrl.includes('/signin')) {
      throw new Error(`Сесія PurplePort закінчилась під час відправки`);
    }

    // Navigate back to conversation to count self-messages after send
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const selfCountAfter = await page.evaluate(() => {
      return [...document.querySelectorAll('div.message div.content')]
        .filter(block => {
          const author = block.querySelector('a.portlink');
          return !author || (author.textContent || '').trim() === 'Me';
        }).length;
    });
    console.log(`[sender] PurplePort self-messages after: ${selfCountAfter}`);

    if (selfCountAfter <= selfCountBefore) {
      // Grab any visible error on page
      const errorText = await page.evaluate(() => {
        const selectors = ['.error', '.alert-danger', '.flash-error', 'p.error', '.errormsg'];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && el.textContent.trim()) return el.textContent.trim();
        }
        return null;
      });
      throw new Error(`Повідомлення не з'явилось у розмові після відправки${errorText ? ` — помилка: ${errorText}` : ' — можливо пустий контент або CSRF'}`);
    }

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
    return sendModelKarteiReply(profileId, siteConfig, url, message, mediaFiles);
  }
  if (siteId === 'purpleport') {
    return sendPurplePortReply(profileId, siteConfig, url, message);
  }
  throw new Error(`Sending not yet implemented for site: ${siteId}`);
}

module.exports = { sendReply };
