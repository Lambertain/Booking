const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../../data');
const SEND_FILE = path.join(DATA_DIR, 'send-queue.json');

function loadSendQueue() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
  if (!fs.existsSync(SEND_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(SEND_FILE, 'utf8')); } catch { return []; }
}

function saveSendQueue(queue) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
  const tmp = SEND_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(queue, null, 2), 'utf8');
  fs.renameSync(tmp, SEND_FILE);
}

function addToSendQueue(item) {
  const queue = loadSendQueue();
  queue.push({ ...item, queuedAt: new Date().toISOString() });
  saveSendQueue(queue);
}

// Read first item without removing (safe — item survives a crash)
function peekSendNext() {
  const queue = loadSendQueue();
  return queue.length > 0 ? queue[0] : null;
}

// Remove first item — call only after successful send
function removeSendFirst() {
  const queue = loadSendQueue();
  if (queue.length === 0) return;
  queue.shift();
  saveSendQueue(queue);
}

// Update fields on first item (e.g. _retryCount) without removing it
function updateSendFirst(updates) {
  const queue = loadSendQueue();
  if (queue.length === 0) return;
  Object.assign(queue[0], updates);
  saveSendQueue(queue);
}

// Legacy: remove-on-read (kept for external callers if any)
function takeSendNext() {
  const queue = loadSendQueue();
  if (queue.length === 0) return null;
  const item = queue.shift();
  saveSendQueue(queue);
  return item;
}

function sendQueueLength() {
  return loadSendQueue().length;
}

module.exports = {
  addToSendQueue, takeSendNext, sendQueueLength, loadSendQueue,
  peekSendNext, removeSendFirst, updateSendFirst
};
