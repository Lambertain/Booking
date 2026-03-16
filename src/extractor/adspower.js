const { chromium } = require('playwright');

const API_BASE = process.env.ADSPOWER_API_BASE || 'http://local.adspower.net:50325';

async function apiGet(route, params = {}) {
  const apiKey = process.env.ADSPOWER_API_KEY;
  if (!apiKey) throw new Error('Missing ADSPOWER_API_KEY env');
  const url = new URL(route, API_BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`AdsPower returned non-JSON: ${text}`);
  }
}

async function startProfile(profileId) {
  const result = await apiGet('/api/v1/browser/start', { user_id: profileId });
  if (result.code !== 0) throw new Error(`AdsPower start failed: ${result.msg || 'unknown'}`);
  return result.data || {};
}

async function stopProfile(profileId) {
  try {
    await apiGet('/api/v1/browser/stop', { user_id: profileId });
  } catch {}
}

function pickCdpEndpoint(data) {
  const ws = data.ws || {};
  return ws.puppeteer || ws.playwright || ws.chrome || null;
}

async function openPage(profileId) {
  const data = await startProfile(profileId);
  const cdp = pickCdpEndpoint(data);
  if (!cdp) throw new Error('No CDP endpoint from AdsPower');
  const browser = await chromium.connectOverCDP(cdp, { timeout: 120000 });
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages()[0] || await context.newPage();

  async function close() {
    // Keep one tab per site, close the rest
    try {
      const pages = context.pages();
      const siteUrls = new Set();
      const toKeep = [];
      const toClose = [];

      for (const p of pages) {
        try {
          const url = p.url();
          const host = new URL(url).hostname;
          if (!siteUrls.has(host) && url !== 'about:blank') {
            siteUrls.add(host);
            toKeep.push(p);
          } else {
            toClose.push(p);
          }
        } catch { toClose.push(p); }
      }

      for (const p of toClose) {
        try { await p.close(); } catch {}
      }
    } catch {}
    try { await browser.close(); } catch {}
    await stopProfile(profileId);
  }

  return { browser, context, page, close };
}

module.exports = { openPage, startProfile, stopProfile };
