const fs = require('fs');
const path = require('path');

const API_URL = 'https://api.x.ai/v1/chat/completions';
const MODEL = 'grok-3-mini-fast';

const MODELS_DIR = path.resolve(__dirname, '../../models');
const DATA_DIR = path.resolve(__dirname, '../../data');

const chatHistory = [];
const MAX_HISTORY = 30;

// Pending destructive operations requiring confirmation
let pendingRemove = null; // { slug, expiresAt }

// Allowed fields for CONFIG_SET (prevents arbitrary config writes)
const CONFIG_SET_ALLOWED_SITE_FIELDS = new Set([
  'selfProfilePattern', 'selfProfileId', 'selfName'
]);
const CONFIG_SET_ALLOWED_AIRTABLE_FIELDS = new Set([
  'baseId', 'tableId'
]);

// --- Model management ---

const SITE_TEMPLATES = {
  'model-kartei': {
    id: 'model-kartei',
    label: 'Model-Kartei',
    baseUrl: 'https://www.model-kartei.de/',
    messageUrl: 'https://www.model-kartei.de/pn/',
    unreadUrl: 'https://www.model-kartei.de/pn/unread/',
    selectors: {
      dialogItem: '.lWrapper',
      dialogOpenTarget: "a[href*='/pn/']",
      messageRow: '.mailWrapper',
      messageText: '.mailContent p',
      messageAuthorSelf: '.mailWrapper.sedcard1',
      messageAuthorOther: '.mailWrapper.sedcard2'
    }
  },
  'adultfolio': {
    id: 'adultfolio',
    label: 'adultfolio.com',
    baseUrl: 'https://adultfolio.com/',
    messageUrl: 'https://adultfolio.com/messaging.php',
    selfProfilePattern: '',
    replyForm: {
      formSelector: 'form#Reply',
      editorSelector: 'div.note-editable.panel-body',
      textareaSelector: 'textarea#message',
      submitSelector: 'form#Reply .message_button_class',
      fileInputSelector: "form#Reply input[type=file][name='files']"
    }
  },
  'modelmayhem': {
    id: 'modelmayhem',
    label: 'Model Mayhem',
    baseUrl: 'https://www.modelmayhem.com/',
    messageUrl: 'https://www.modelmayhem.com/mystuff#/inbox',
    selfProfileId: ''
  },
  'purpleport': {
    id: 'purpleport',
    label: 'PurplePort',
    baseUrl: 'https://purpleport.com/',
    messageUrl: 'https://purpleport.com/account/messages/',
    selfProfilePattern: ''
  }
};

const PROFILE_TEMPLATE = {
  'reply-engine.md': (name) => `# ${name} reply engine

## Core instruction
Reply as ${name}.

## Language
- Use the interlocutor's language

## Tone
- Polite
- Businesslike
- Calm

## Length
- Short but natural
- Usually 2-6 sentences

## Reply order
1. Answer the direct question
2. Add availability / rate / conditions if relevant
3. Ask only the necessary follow-up question(s)
4. End with a brief professional sign-off

## Do not
- flirt by default
- add emotional fluff
- invent availability or discounts
- paste long boilerplate when a short answer is enough
`,
  'rules.md': (name) => `# ${name} rules

## Default reply policy
- Reply in the interlocutor's language
- Keep tone polite and businesslike
- For ambiguous cases: prepare draft, do not auto-send

## When discussing bookings
Ask for: date, time, duration, level/style, location, travel coverage

## Inbox qualification rule
Draft a reply only when the photographer shows real interest.
`,
  'style.md': (name) => `# ${name} style

## Core voice
- Polite, businesslike, direct
- Friendly but not chatty
- Short practical replies in ongoing logistics
`,
  'templates.md': (name) => `# ${name} templates

## 1. Clarifying conditions
Hello [Name],
Yes, that could work.
Please confirm the date, start time, duration, shooting level, and address.
Best regards,
${name.split(' ')[0]}

## 2. Short confirmation
Hello [Name],
Yes, great. That works for me.
See you on [date/time].
Best regards,
${name.split(' ')[0]}

## 3. Soft decline
Hello [Name],
Not this time, but feel free to contact me again later.
Best regards,
${name.split(' ')[0]}
`
};

function createModel(slug, modelName, adspowerProfileId, siteIds) {
  const modelDir = path.join(MODELS_DIR, slug);
  if (fs.existsSync(modelDir)) {
    return { ok: false, error: `Модель ${slug} уже существует` };
  }

  fs.mkdirSync(path.join(modelDir, 'profile'), { recursive: true });

  // config.json
  const sites = siteIds
    .map(id => SITE_TEMPLATES[id])
    .filter(Boolean)
    .map(s => ({ ...s }));

  const config = {
    modelName,
    adspower: { profileId: adspowerProfileId },
    sites
  };
  fs.writeFileSync(path.join(modelDir, 'config.json'), JSON.stringify(config, null, 2), 'utf8');

  // Profile files
  for (const [file, template] of Object.entries(PROFILE_TEMPLATE)) {
    fs.writeFileSync(path.join(modelDir, 'profile', file), template(modelName), 'utf8');
  }

  return { ok: true, slug, modelName };
}

function removeModel(slug) {
  const modelDir = path.join(MODELS_DIR, slug);
  if (!fs.existsSync(modelDir)) {
    return { ok: false, error: `Модель ${slug} не найдена` };
  }
  fs.rmSync(modelDir, { recursive: true, force: true });

  // Also remove data
  const dataDir = path.join(DATA_DIR, slug);
  if (fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  return { ok: true, slug };
}

function listModels() {
  try {
    return fs.readdirSync(MODELS_DIR)
      .filter(f => fs.existsSync(path.join(MODELS_DIR, f, 'config.json')))
      .map(slug => {
        const config = JSON.parse(fs.readFileSync(path.join(MODELS_DIR, slug, 'config.json'), 'utf8'));
        return { slug, name: config.modelName, sites: config.sites.map(s => s.label) };
      });
  } catch { return []; }
}

// --- Profile loading ---

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

// --- System prompt ---

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
${modelSections || '(нет моделей)'}

ЧТО ТЫ МОЖЕШЬ:
1. Отвечать на вопросы о моделях, расценках, доступности, предпочтениях
2. Запоминать новую информацию (ставки, правила, нюансы)
3. Давать советы по переговорам с фотографами
4. Добавлять и удалять модели из пайплайна

СОХРАНЕНИЕ ИНФОРМАЦИИ О МОДЕЛИ:
Если менеджер сообщает факт, ответь с командой на отдельной строке:
SAVE:<slug>:<ключ>:<значение>

УПРАВЛЕНИЕ МОДЕЛЯМИ:
Для добавления модели нужны ВСЕ данные:
- Имя модели
- AdsPower profile ID
- Сайты (model-kartei, adultfolio, modelmayhem, purpleport)
- selfProfilePattern для adultfolio (имя в URL профиля)
- selfProfileId для modelmayhem (числовой ID)
- selfProfilePattern для purpleport (имя в URL профиля)

Если менеджер просит добавить модель но НЕ указал все данные — запроси их через:
REQUEST_MODEL_INFO

Если ВСЕ данные есть — создай модель:
ADD_MODEL:<slug>:<Имя Фамилия>:<adspower_profile_id>:<site1,site2,...>

Для удаления:
REMOVE_MODEL:<slug>

Обновление config модели (selfProfilePattern, selfProfileId и т.д.):
CONFIG_SET:<slug>:<json_path>:<value>

Примеры:
- "добавь модель" без деталей → запроси данные через REQUEST_MODEL_INFO
- "добавь модель Katya S, adspower xyz123, сайты model-kartei и adultfolio, adultfolio username Katya_S"
  → ADD_MODEL:katya-s:Katya S:xyz123:model-kartei,adultfolio
  → CONFIG_SET:katya-s:sites.adultfolio.selfProfilePattern:Katya_S
- "удали модель katya-s"
  → REMOVE_MODEL:katya-s
- "modelmayhem id для Katya 9876543"
  → CONFIG_SET:katya-s:sites.modelmayhem.selfProfileId:9876543
- "airtable для Katya https://airtable.com/appABC123/tblXYZ"
  → CONFIG_SET:katya-s:airtable.baseId:appABC123
  (витягуй Base ID з посилання — це частина після airtable.com/ що починається з "app")

ОТПРАВКА МЕДИА ФОТОГРАФУ:
Когда менеджер просит отправить фото/файлы фотографу из буфера:
SEND_MEDIA:<фотограф>:<сайт>:<сопроводительный текст>
Это отправит все файлы из буфера указанному фотографу.

Команды пиши на ОТДЕЛЬНОЙ строке в конце ответа.
ЯЗЫК: отвечай на русском. Будь кратким.`;
}

// --- Chat ---

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

  // Process commands
  const actions = [];
  const lines = reply.split('\n');
  const displayLines = [];

  for (const line of lines) {
    // SAVE
    const saveMatch = line.match(/^SAVE:([^:]+):([^:]+):(.+)$/);
    if (saveMatch) {
      const [, slug, key, value] = saveMatch;
      actions.push({ type: 'save', slug: slug.trim(), key: key.trim(), value: value.trim() });
      continue;
    }
    // ADD_MODEL
    const addMatch = line.match(/^ADD_MODEL:([^:]+):([^:]+):([^:]+):(.+)$/);
    if (addMatch) {
      const [, slug, name, profileId, sitesStr] = addMatch;
      const siteIds = sitesStr.trim().split(',').map(s => s.trim());
      actions.push({ type: 'add_model', slug: slug.trim(), name: name.trim(), profileId: profileId.trim(), siteIds });
      continue;
    }
    // REMOVE_MODEL
    const removeMatch = line.match(/^REMOVE_MODEL:(.+)$/);
    if (removeMatch) {
      actions.push({ type: 'remove_model', slug: removeMatch[1].trim() });
      continue;
    }
    // CONFIG_SET
    const configMatch = line.match(/^CONFIG_SET:([^:]+):([^:]+):(.+)$/);
    if (configMatch) {
      actions.push({ type: 'config_set', slug: configMatch[1].trim(), path: configMatch[2].trim(), value: configMatch[3].trim() });
      continue;
    }
    // REQUEST_MODEL_INFO — pass through to display
    if (line.trim() === 'REQUEST_MODEL_INFO') {
      displayLines.push(line);
      continue;
    }
    displayLines.push(line);
  }

  // Execute actions
  const actionResults = [];
  for (const a of actions) {
    try {
      if (a.type === 'save') {
        const models = loadAllModelProfiles();
        const model = models.find(m => m.slug === a.slug);
        if (model) {
          model.notes[a.key] = a.value;
          saveModelNotes(a.slug, model.notes);
          actionResults.push(`💾 ${a.key}: ${a.value}`);
        }
      } else if (a.type === 'add_model') {
        const result = createModel(a.slug, a.name, a.profileId, a.siteIds);
        if (result.ok) {
          actionResults.push(`✅ Модель ${a.name} (${a.slug}) добавлена`);
        } else {
          actionResults.push(`⚠️ ${result.error}`);
        }
      } else if (a.type === 'remove_model') {
        // Require confirmation: same command within 60s
        if (pendingRemove && pendingRemove.slug === a.slug && Date.now() < pendingRemove.expiresAt) {
          pendingRemove = null;
          const result = removeModel(a.slug);
          if (result.ok) {
            actionResults.push(`🗑 Модель ${a.slug} видалена`);
          } else {
            actionResults.push(`⚠️ ${result.error}`);
          }
        } else {
          pendingRemove = { slug: a.slug, expiresAt: Date.now() + 60000 };
          actionResults.push(`⚠️ Видалення ${a.slug} — повторіть команду протягом 60с для підтвердження`);
        }
      } else if (a.type === 'config_set') {
        const configPath = path.join(MODELS_DIR, a.slug, 'config.json');
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          const parts = a.path.split('.');
          if (parts[0] === 'sites' && parts.length === 3) {
            if (!CONFIG_SET_ALLOWED_SITE_FIELDS.has(parts[2])) {
              actionResults.push(`⚠️ CONFIG_SET: поле "${parts[2]}" не дозволено`);
            } else {
              const site = config.sites.find(s => s.id === parts[1]);
              if (site) {
                site[parts[2]] = a.value;
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
                actionResults.push(`⚙️ ${a.slug}: ${parts[1]}.${parts[2]} = ${a.value}`);
              } else {
                actionResults.push(`⚠️ Сайт ${parts[1]} не знайдено у ${a.slug}`);
              }
            }
          } else if (parts[0] === 'airtable' && parts.length === 2) {
            if (!CONFIG_SET_ALLOWED_AIRTABLE_FIELDS.has(parts[1])) {
              actionResults.push(`⚠️ CONFIG_SET: поле "airtable.${parts[1]}" не дозволено`);
            } else {
              if (!config.airtable) config.airtable = {};
              config.airtable[parts[1]] = a.value;
              fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
              actionResults.push(`⚙️ ${a.slug}: airtable.${parts[1]} = ${a.value.slice(0, 20)}...`);
            }
          } else {
            actionResults.push(`⚠️ Невідомий шлях: ${a.path}`);
          }
        } else {
          actionResults.push(`⚠️ Модель ${a.slug} не знайдена`);
        }
      }
    } catch (err) {
      console.error(`[agent] Action failed: ${err.message}`);
      actionResults.push(`⚠️ Ошибка: ${err.message}`);
    }
  }

  const displayText = displayLines.join('\n').trim();
  const actionsInfo = actionResults.length > 0
    ? '\n\n' + actionResults.join('\n')
    : '';

  return displayText + actionsInfo;
}

module.exports = { chat, listModels };
