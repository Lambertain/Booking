const fs = require('fs');
const path = require('path');

const API_URL = 'https://api.x.ai/v1/chat/completions';
const MODEL = 'grok-3-mini-fast';

const MODELS_DIR = path.resolve(__dirname, '../../models');
const DATA_DIR = path.resolve(__dirname, '../../data');

// Per-chat conversation history (last N messages)
const chatHistory = [];
const MAX_HISTORY = 30;

function loadAllModelProfiles() {
  const slugs = fs.readdirSync(MODELS_DIR).filter(f =>
    fs.existsSync(path.join(MODELS_DIR, f, 'config.json'))
  );

  return slugs.map(slug => {
    const config = JSON.parse(fs.readFileSync(path.join(MODELS_DIR, slug, 'config.json'), 'utf8'));
    const notesPath = path.join(DATA_DIR, slug, 'agent-notes.json');
    let notes = {};
    if (fs.existsSync(notesPath)) {
      try { notes = JSON.parse(fs.readFileSync(notesPath, 'utf8')); } catch {}
    }
    return { slug, config, notes };
  });
}

function saveModelNotes(slug, notes) {
  const dir = path.join(DATA_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'agent-notes.json'), JSON.stringify(notes, null, 2), 'utf8');
}

function buildSystemPrompt() {
  const models = loadAllModelProfiles();

  const modelSections = models.map(m => {
    const notes = m.notes;
    const notesList = Object.entries(notes).map(([k, v]) => `  - ${k}: ${v}`).join('\n');
    return `Model: ${m.config.modelName} (${m.slug})
  Sites: ${m.config.sites.map(s => s.label).join(', ')}
  AdsPower profile: ${m.config.adspower.profileId}
${notesList ? '  Notes:\n' + notesList : '  Notes: (none)'}`;
  }).join('\n\n');

  return `Ты — AI-агент букер для фотомоделей. Ты помогаешь менеджеру управлять моделями и съёмками.

МОДЕЛИ:
${modelSections}

ЧТО ТЫ МОЖЕШЬ:
1. Отвечать на вопросы о моделях, их расценках, доступности, предпочтениях
2. Запоминать новую информацию о моделях (ставки, правила, нюансы)
3. Давать советы по переговорам с фотографами
4. Обсуждать стратегию

КОГДА МЕНЕДЖЕР СООБЩАЕТ НОВУЮ ИНФОРМАЦИЮ О МОДЕЛИ:
Если менеджер сообщает факт о модели (ставки, правила, доступность, предпочтения), ты ДОЛЖЕН ответить в формате:
SAVE:<slug>:<ключ>:<значение>

Примеры:
- "ставка Аны за ню 180€/ч" → SAVE:ana-v:rate_nude:180€/h
- "Ана не работает с TFP" → SAVE:ana-v:no_tfp:true
- "Ана доступна в Бельгии 13-18 мая" → SAVE:ana-v:availability_may:Belgium 13-18 May

Формат SAVE должен быть на ОТДЕЛЬНОЙ строке в конце твоего ответа.
Можно несколько SAVE подряд.
Если нечего сохранять — не пиши SAVE.

ЯЗЫК: отвечай на русском.
Будь кратким и по делу.`;
}

async function chat(userMessage) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('Missing XAI_API_KEY env');

  chatHistory.push({ role: 'user', content: userMessage });
  if (chatHistory.length > MAX_HISTORY) {
    chatHistory.splice(0, chatHistory.length - MAX_HISTORY);
  }

  const systemPrompt = buildSystemPrompt();

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
        ...chatHistory
      ],
      temperature: 0.5,
      max_tokens: 800
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Grok agent error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const reply = (data.choices?.[0]?.message?.content || '').trim();

  chatHistory.push({ role: 'assistant', content: reply });

  // Process SAVE commands
  const saves = [];
  const lines = reply.split('\n');
  const displayLines = [];

  for (const line of lines) {
    const saveMatch = line.match(/^SAVE:([^:]+):([^:]+):(.+)$/);
    if (saveMatch) {
      const [, slug, key, value] = saveMatch;
      saves.push({ slug: slug.trim(), key: key.trim(), value: value.trim() });
    } else {
      displayLines.push(line);
    }
  }

  // Execute saves
  for (const s of saves) {
    try {
      const models = loadAllModelProfiles();
      const model = models.find(m => m.slug === s.slug);
      if (model) {
        model.notes[s.key] = s.value;
        saveModelNotes(s.slug, model.notes);
        console.log(`[agent] Saved ${s.slug}: ${s.key} = ${s.value}`);
      }
    } catch (err) {
      console.error(`[agent] Save failed: ${err.message}`);
    }
  }

  const displayText = displayLines.join('\n').trim();
  const savedInfo = saves.length > 0
    ? '\n\n💾 ' + saves.map(s => `${s.key}: ${s.value}`).join(', ')
    : '';

  return displayText + savedInfo;
}

module.exports = { chat };
