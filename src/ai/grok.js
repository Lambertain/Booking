const fs = require('fs');
const path = require('path');

const API_URL = 'https://api.x.ai/v1/chat/completions';
const MODEL = 'grok-3-mini-fast';

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
- Output ONLY the reply text, nothing else`;
}

function buildUserPrompt(messages, lastIncoming, photographer, language) {
  const history = messages
    .slice(-10)
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
  const systemPrompt = buildSystemPrompt(profile, modelName);
  const userPrompt = buildUserPrompt(messages, lastIncoming, photographer, language);

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

module.exports = { generateDraft };
