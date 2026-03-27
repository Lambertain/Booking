const express = require('express');
const https = require('https');
const { requireAuth } = require('../auth');

const router = express.Router();
const BOT_TOKEN = process.env.BOT_TOKEN;
// Use a private storage chat — bot's own updates channel or the APKA chat
const STORAGE_CHAT = process.env.TG_APKA_CHAT_ID;

// Forward file to Telegram, get file_id back, return CDN-ready info
async function uploadToTelegram(base64data, mimeType, fileName) {
  // Determine Telegram method
  const isImage = mimeType.startsWith('image/');
  const isVideo = mimeType.startsWith('video/');
  const method = isImage ? 'sendPhoto' : isVideo ? 'sendVideo' : 'sendDocument';
  const fieldName = isImage ? 'photo' : isVideo ? 'video' : 'document';

  const buf = Buffer.from(base64data, 'base64');

  // Build multipart manually
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
  const parts = [];
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${STORAGE_CHAT}`
  );
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`
  );

  const header = Buffer.from(parts.join('\r\n') + '\r\n', 'utf8');
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([header, buf, footer]);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        const j = JSON.parse(raw);
        if (!j.ok) return reject(new Error(j.description));
        const msg = j.result;
        const fileObj = msg.photo
          ? msg.photo[msg.photo.length - 1]
          : msg.video || msg.document;
        resolve({ file_id: fileObj.file_id, file_unique_id: fileObj.file_unique_id });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getTgFileUrl(file_id) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/getFile?file_id=${file_id}`,
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        const j = JSON.parse(raw);
        if (!j.ok) return reject(new Error(j.description));
        resolve(`https://api.telegram.org/file/bot${BOT_TOKEN}/${j.result.file_path}`);
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// POST /api/media/upload
// body: { data: base64, mimeType, fileName }
router.post('/upload', requireAuth(), async (req, res) => {
  try {
    const { data, mimeType, fileName } = req.body;
    if (!data || !mimeType) return res.status(400).json({ error: 'data and mimeType required' });

    const { file_id } = await uploadToTelegram(data, mimeType, fileName || 'file');
    const url = await getTgFileUrl(file_id);
    res.json({ url, file_id, mimeType, fileName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/media/refresh/:file_id — get fresh URL for expired Telegram file
router.get('/refresh/:file_id', requireAuth(), async (req, res) => {
  try {
    const url = await getTgFileUrl(req.params.file_id);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
