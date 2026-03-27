// Simple SSE (Server-Sent Events) registry
// Maps conversationId → Set of response objects

const clients = new Map();

function add(convId, res) {
  if (!clients.has(convId)) clients.set(convId, new Set());
  clients.get(convId).add(res);
}

function remove(convId, res) {
  clients.get(convId)?.delete(res);
}

function push(convId, data) {
  const conns = clients.get(convId);
  if (!conns || conns.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of conns) {
    try { res.write(payload); } catch {}
  }
}

module.exports = { sseClients: { add, remove, push } };
