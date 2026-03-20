const fs = require('fs');
const path = require('path');

const API_URL = 'https://api.x.ai/v1/chat/completions';
const MODEL = 'grok-3-mini-fast';
const DATA_DIR = path.resolve(__dirname, '../../data');
const MAX_EXAMPLES = 5;

function loadProfile(modelDir) {
  const files = ['reply-engine.md', 'rules.md', 'style.md', 'templates.md'];
  return files
    .map(f => {
      const fp = path.join(modelDir, 'profile', f);
      return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : '';
    })
    .filter(Boolean)
    .join('\n\n---\n\n');
}

function loadAllEntries(modelSlug) {
  const logPath = path.join(DATA_DIR, modelSlug || '', 'training', 'approved-responses.jsonl');
  if (!fs.existsSync(logPath)) return [];
  try {
    return fs.readFileSync(logPath, 'utf8').trim().split('\n')
      .filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

function loadTrainingExamples(modelSlug) {
  const entries = loadAllEntries(modelSlug);
  const examples = entries.filter(e => e.action === 'edit').slice(-MAX_EXAMPLES);
  if (examples.length === 0) return '';
  return '\n\nMANAGER CORRECTIONS (learn from these):\n' +
    examples.map((e, i) => `Example ${i + 1}:\nPhotographer: ${e.lastIncoming}\nCorrected reply: ${e.finalText}`).join('\n\n');
}

function findCachedResponse(modelSlug, photographerMessage) {
  const entries = loadAllEntries(modelSlug);
  if (entries.length === 0) return null;

  const normalized = photographerMessage.toLowerCase().trim().replace(/[?!.,]+/g, '');

  for (const e of entries.reverse()) {
    if (e.action !== 'approve' && e.action !== 'edit') continue;
    const entryNorm = (e.lastIncoming || '').toLowerCase().trim().replace(/[?!.,]+/g, '');
    if (!entryNorm) continue;

    // Exact match on non-booking-specific questions (rates, availability general)
    if (entryNorm === normalized) return { text: e.finalText, exact: true };

    // Same type of question — use as style template
    const rateQ = /rate|price|honorar|kosten|fee|budget/i;
    const schedQ = /date|time|when|available|duration/i;
    if (rateQ.test(normalized) && rateQ.test(entryNorm)) {
      return { template: e.finalText, exact: false };
    }
    if (schedQ.test(normalized) && schedQ.test(entryNorm)) {
      return { template: e.finalText, exact: false };
    }
  }
  return null;
}

function buildSystemPrompt(profile, modelName) {
  return `You are ${modelName}, a professional photo model. Your task is to draft a reply to a photographer's message.

Follow these guidelines strictly:
${profile}

IMPORTANT RULES:
- Reply in the photographer's language
- Keep it short (2-6 sentences)
- Be polite and businesslike
- If booking details are missing, ask for: date, time, duration, shooting level, location
- Do NOT invent availability, rates, or promises
- Sign off with "Best regards, ${modelName.split(' ')[0]}" or equivalent in their language
- Output ONLY the reply text, nothing else

`;
}

function buildUserPrompt(messages, lastIncoming, photographer, language) {
  const history = messages
    .map(m => `[${m.role === 'self' ? 'ME' : 'PHOTOGRAPHER'}]: ${m.text}`)
    .join('\n');

  return `Photographer: ${photographer}
Language: ${language}

Conversation:
${history}

Draft a reply to the photographer's last message.`;
}

async function generateDraft(modelDir, modelName, messages, lastIncoming, photographer, language) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('Missing XAI_API_KEY env');

  const profile = loadProfile(modelDir);
  const modelSlug = path.basename(modelDir);

  // Check cache — exact non-date match can be reused
  const cached = findCachedResponse(modelSlug, lastIncoming);
  if (cached?.exact) {
    console.log('[grok] Cache hit:', lastIncoming.slice(0, 50));
    return cached.text;
  }

  const trainingExamples = loadTrainingExamples(modelSlug);
  const styleHint = cached?.template
    ? `\n\nSTYLE TEMPLATE (manager previously replied to similar question like this):\n${cached.template}\nFollow this style but adapt to current context.`
    : '';
  const systemPrompt = buildSystemPrompt(profile, modelName) + trainingExamples;
  const userPrompt = buildUserPrompt(messages, lastIncoming, photographer, language) + styleHint;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 500
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Grok API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

async function qualifyDialog(messages, photographer, site) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('Missing XAI_API_KEY env');

  const history = messages
    .map(m => `[${m.role === 'self' ? 'MODEL' : 'PHOTOGRAPHER'}]: ${m.text}`)
    .join('\n');

  const systemPrompt = `You are an assistant that analyzes conversations between a photo model and photographers.
Your task: determine if the photographer is genuinely interested in booking a paid photo shoot.

QUALIFIED means the photographer:
- Wants to book or discuss a paid shoot
- Asks about rates, dates, location, shooting level
- Shows real intent to collaborate for money
- Proposes concrete shooting details (genre, duration, city, dates)
- Says they are ready/interested/available for a shoot
- Responds positively to the model's offer (even briefly like "ok", "ready", "interested", "let's do it")

NOT QUALIFIED means:
- Explicit refusal ("not interested", "no time", "can't afford", "stopped shooting")
- Only wants TFP/free work and the model does paid work
- Has budget problems or financial issues
- Is promoting their own service/portal instead of booking
- Is unavailable during the proposed dates
- Polite rejection wrapped in nice words ("wish you luck", "keep you in mind", "maybe next time")
- Generic dead-end with no intent to continue
- The conversation is clearly over with no next step

Respond with EXACTLY one line in this format:
QUALIFIED: <reason>
or
NOT_QUALIFIED: <reason>

IMPORTANT: When in doubt, mark as QUALIFIED — it's better to show a dialog to the manager than to miss a potential booking.`;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Site: ${site}\nPhotographer: ${photographer}\n\nConversation:\n${history}\n\nIs this photographer qualified for a booking?` }
      ],
      temperature: 0.1,
      max_tokens: 100
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Grok qualify error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const answer = (data.choices?.[0]?.message?.content || '').trim();

  const isQualified = answer.toUpperCase().startsWith('QUALIFIED');
  const reason = answer.replace(/^(NOT_)?QUALIFIED:\s*/i, '').trim();

  return { qualified: isQualified, reason, raw: answer };
}

function loadTemplates(modelDir) {
  const fp = path.join(modelDir, 'profile', 'templates.md');
  if (!fs.existsSync(fp)) return '';
  return fs.readFileSync(fp, 'utf8');
}

async function classifyDraft(modelDir, draft, messages, photographer) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('Missing XAI_API_KEY env');

  const templates = loadTemplates(modelDir);
  const history = messages
    .map(m => `[${m.role === 'self' ? 'MODEL' : 'PHOTOGRAPHER'}]: ${m.text}`)
    .join('\n');

  const systemPrompt = `You classify model reply drafts as STANDARD or CUSTOM.

Here are the model's STANDARD reply templates:
${templates}

A draft is STANDARD if it follows the same pattern as one of these templates:
- Asking for date/time/duration/level/location
- Confirming availability with rate
- Clarifying conditions
- Asking for next step details
- Short confirmation
- Budget negotiation (offering reduced scope)
- Travel/pickup coordination

A draft is CUSTOM if it handles a non-standard situation:
- Unusual requests or questions
- Complex negotiations beyond simple rate/schedule
- Situations not covered by any template
- Creative or situation-specific responses
- Discussing specific content types or boundaries

Respond with EXACTLY one word: STANDARD or CUSTOM`;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Photographer: ${photographer}\n\nConversation:\n${history}\n\nDraft reply:\n${draft}\n\nIs this STANDARD or CUSTOM?` }
      ],
      temperature: 0.0,
      max_tokens: 10
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Grok classify error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const answer = (data.choices?.[0]?.message?.content || '').trim().toUpperCase();
  return answer.startsWith('STANDARD') ? 'standard' : 'custom';
}

async function extractShootDetails(messages, photographer, site) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('Missing XAI_API_KEY env');

  const history = messages
    .map(m => `[${m.role === 'self' ? 'MODEL' : 'PHOTOGRAPHER'}]: ${m.text}`)
    .join('\n');

  const systemPrompt = `You extract photo shoot booking details from conversations between a model and a photographer.
Extract whatever details are available. If a detail is not mentioned, set it to null.
For dates, use ISO 8601 format (e.g. "2026-05-15T10:00:00.000Z"). If only date without time, use T00:00:00.000Z.
For budget, extract the number only (e.g. 150, not "150€").
For duration, extract hours as a number (e.g. 3).

Respond with ONLY a valid JSON object, no markdown, no explanation:
{
  "city": "city and/or country" or null,
  "location": "specific studio/address" or null,
  "startTime": "ISO 8601 datetime" or null,
  "durationHours": number or null,
  "budget": number or null,
  "expenses": number or null,
  "style": "shooting style/level description" or null,
  "notes": "any other relevant details" or null,
  "status": "Резерв" or "Подтверждено"
}`;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Site: ${site}\nPhotographer: ${photographer}\n\nConversation:\n${history}\n\nExtract shoot details:` }
      ],
      temperature: 0.0,
      max_tokens: 300
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Grok extract error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const raw = (data.choices?.[0]?.message?.content || '').trim();

  try {
    // Strip markdown code fences if present
    const json = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
    return JSON.parse(json);
  } catch {
    console.error('[grok] Failed to parse shoot details JSON:', raw);
    return null;
  }
}

module.exports = { generateDraft, qualifyDialog, classifyDraft, extractShootDetails };
