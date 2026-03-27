думай на русском
читай редми и поддерживай его актуальность
делай комит и пуш в гит

# Booking AI — Virtual Booker

## Стек (booking bot)
- Node.js (CommonJS) + Playwright + Grammy (Telegram) + xAI Grok API
- Файловое хранилище (JSON в data/)
- AdsPower для управления браузерными профилями моделей

## Структура
- `src/` — исходный код
- `models/` — конфиги и профили моделей (в git)
- `data/` — рантайм данные (gitignored)
- `app/` — мини-апп (Express API + React frontend)

## Переменные окружения (booking bot)
- TELEGRAM_BOT_TOKEN — токен Telegram бота (@lambertain_bot)
- TELEGRAM_CHAT_ID — ID чата БУКИНГ (-5132805901)
- TELEGRAM_CHAT_APKA_ID — ID чата АПКА (-1002425111120)
- XAI_API_KEY — ключ xAI API (Grok)
- ADSPOWER_API_KEY — ключ AdsPower API
- ADSPOWER_API_BASE — база AdsPower API (default: http://local.adspower.net:50325)
- SCAN_INTERVAL_MIN — интервал сканирования в минутах (default: 15)
- APP_API_URL — URL Railway мини-апп API (для sync endpoint)
- APP_API_SECRET — секрет для авторизации sync запросов

## GitHub
- Repo: https://github.com/Lambertain/Booking.git
- Коміти українською

## Production Server (AdsPower + Booking)
- IP: 185.203.242.10
- OS: Windows Server
- SSH: `Administrator` / `<пароль в .env або захищених нотатках>`
- SSH підключення: тільки через paramiko (Python), не ssh команду
- AdsPower: http://local.adspower.net:50325 (тільки localhost)
- AdsPower headless: `"C:\Program Files\AdsPower Global\AdsPower Global.exe" --headless=true --api-key=<KEY>`
- Додаток: `C:\Booking`
- Процес: pm2 (ім'я: booking)

## Cloudflare (info@lambertain.agency)
- Account ID: 6905c5c480b1d43eefdc36b074fdc4e8
- Zero Trust team: lambertain
- Пароль: `<пароль в .env або захищених нотатках>`

---

# Мини-апп — план реализации

## Концепция
Telegram Mini App (TWA) + веб-интерфейс, заменяющий Airtable (трекер съёмок) и SendPulse (коммуникация с моделями).
Деплой: Railway (Express API + React + PostgreSQL).
Интеграция: booking bot на Windows Server синхронизирует подтверждённые съёмки через HTTP POST.

## Роли
| Роль    | Кто                          | Доступ                                                        |
|---------|------------------------------|---------------------------------------------------------------|
| admin   | владелец агентства           | всё — модели, съёмки, клиенты, пользователи, настройки       |
| manager | менеджер букинга             | назначенные модели: съёмки, клиенты, переписка с клиентами    |
| model   | агентская модель (4 шт.)     | свои съёмки, календарь, чат с менеджером/админом              |
| client  | фрилансер / букер агентства  | свои заказы рассылок, шаблоны, чат с менеджером              |

## Telegram чаты
- **БУКИНГ** (-5132805901): AI ↔ фотографы, апрув менеджером + уведомления от моделей из апки
- **АПКА** (-1002425111120): входящие из апки (клиенты/модели) → AI → апрув менеджером → ответ в апку

## Схема БД (PostgreSQL, Railway)

```sql
-- Пользователи
users: id, role (admin|manager|model|client), name, email, password_hash,
       telegram_id, telegram_username, is_active, created_at

-- Назначение менеджер → модели
manager_models: manager_id → model_id

-- Агентские модели (расширение users где role=model)
agency_models: id, user_id, slug, display_name, portfolio_url, commission_pct, notes

-- Съёмки (заменяет Airtable)
shoots: id, model_id, photographer_name, photographer_site, dialog_url,
        shoot_date, location, rate, currency, status (negotiating|confirmed|done|cancelled),
        notes, created_at, synced_from_bot_at

-- Клиенты (расширение users где role=client)
clients: id, user_id, company_name, contact_person, notes

-- Заказы рассылок (для клиентов)
mailing_orders: id, client_id, template_name, target_sites, target_regions,
                target_genres, volume, status (new|in_progress|done|cancelled),
                price, notes, created_at

-- Шаблоны рассылок
mailing_templates: id, name, content, sites, created_by, created_at

-- Диалоги (чаты внутри апки, заменяет SendPulse)
conversations: id, type (model_internal|client_support), participant_a_id,
               participant_b_id, created_at, last_message_at

-- Сообщения
messages: id, conversation_id, sender_id, text, is_read, created_at,
          tg_message_id (ссылка на апрув в Telegram), approved_at
```

## Стек мини-апп (app/)
- **Backend**: Node.js + Express (CommonJS, как и бот)
- **Frontend**: React + Vite (собирается в app/dist/, раздаётся Express)
- **DB**: PostgreSQL (Railway managed) + pg / postgres.js
- **Auth**: JWT (httpOnly cookie) + Telegram initData (для модели/клиента через TWA)
- **Realtime**: SSE (Server-Sent Events) для новых сообщений (без WebSocket для простоты)
- **UI**: без тяжёлых UI-библиотек, plain CSS + минимальные компоненты

## Структура app/
```
app/
├── server/
│   ├── index.js          — Express entry, static serve, CORS
│   ├── db.js             — pg pool, migrate()
│   ├── migrations/       — SQL файлы 001_init.sql, 002_... и т.д.
│   ├── auth.js           — JWT helpers, Telegram initData verify
│   ├── routes/
│   │   ├── auth.js       — POST /api/auth/login, /api/auth/tg
│   │   ├── shoots.js     — CRUD съёмок
│   │   ├── conversations.js — диалоги + SSE /api/conversations/:id/events
│   │   ├── messages.js   — отправка/получение сообщений
│   │   ├── clients.js    — CRUD клиентов
│   │   ├── orders.js     — CRUD заказов рассылок
│   │   ├── templates.js  — CRUD шаблонов
│   │   ├── users.js      — управление пользователями (admin)
│   │   └── sync.js       — POST /api/sync/shoot (вызывается booking ботом)
│   └── bot-notify.js     — отправка уведомлений в Telegram через Bot API
├── client/
│   ├── index.html
│   ├── main.jsx
│   ├── App.jsx           — роутинг по роли
│   ├── api.js            — fetch wrapper
│   ├── auth.jsx          — login page, Telegram auth
│   └── pages/
│       ├── admin/        — Dashboard, Models, Users, Settings
│       ├── manager/      — Shoots, Clients, Orders, Conversations
│       ├── model/        — MyShoot, Calendar, Chat
│       └── client/       — Orders, Templates, Chat
├── package.json
├── vite.config.js
└── Dockerfile (для Railway)
```

## Railway (мини-апп) — IDs та credentials
- API Token: `6f04a384-b4bd-4c8a-be9b-3d8286850c8d`
- Project ID: `700e9228-90e0-4904-91a5-37a1800dd8d6`
- Environment ID: `dadc52ef-2262-43e2-9908-adee83e0dde5`
- App Service ID: `c3eddc3e-e497-4efc-8e97-db2b89e26f74`
- Postgres Service ID: `3e9366a4-a6ec-4a5b-ad73-a567f284cd79`
- App URL: `https://booking-production-ab66.up.railway.app`
- DATABASE_PUBLIC_URL: `postgresql://postgres:KeJNFQKcKihncBIEllYUwNZUMwtfPpKC@gondola.proxy.rlwy.net:27793/railway`
- DATABASE_URL (internal): `postgresql://postgres:KeJNFQKcKihncBIEllYUwNZUMwtfPpKC@postgres.railway.internal:5432/railway`

### GraphQL API для змінних:
```js
// node --input-type=module
const TOKEN = '6f04a384-b4bd-4c8a-be9b-3d8286850c8d'
await fetch('https://backboard.railway.app/graphql/v2', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, variables })
})
```

## Переменные окружения (Railway)
- DATABASE_URL — internal PostgreSQL URL (встановлено)
- JWT_SECRET — встановлено
- SYNC_SECRET — секрет для /api/sync/shoot (встановлено)
- BOT_TOKEN — @lambertain_bot (встановлено)
- TG_BOOKING_CHAT_ID — -5132805901 (встановлено)
- TG_APKA_CHAT_ID — -1002425111120 (встановлено)
- PORT — 3001 (встановлено)

## API sync (Windows Server → Railway)
Когда бот апрувит съёмку:
```
POST /api/sync/shoot
Authorization: Bearer <SYNC_SECRET>
{
  modelSlug, photographerName, photographerSite, dialogUrl,
  shootDate, location, rate, currency, notes
}
```
Booking бот вызывает этот endpoint в `onDeliveryResult()` при успешной отправке.

## Чат АПКА — логика
1. Клиент/модель пишет в апке → сохраняется в messages
2. bot-notify.js отправляет карточку в чат АПКА (-1002425111120)
3. AI (Grok) генерирует черновик ответа с учётом контекста диалога
4. Менеджер апрувит или редактирует в Telegram (как в БУКИНГ)
5. После апрува → ответ сохраняется в messages, SSE толкает клиенту

## Чат БУКИНГ — новые уведомления
Когда модель пишет в апке (type=model_internal):
- bot-notify.js отправляет **тихое уведомление** в БУКИНГ (без кнопок, просто инфо)
- Менеджер/букер видит что написала модель, отвечает прямо в апке

## Поэтапный план разработки

### Этап 1 — Scaffold + БД
- [ ] Создать Railway проект + PostgreSQL сервис
- [ ] `app/` директория, package.json, Express entry
- [ ] migrations/001_init.sql — все таблицы
- [ ] db.js с автомиграцией при старте
- [ ] Seed: создать admin пользователя, 4 модели

### Этап 2 — Auth
- [ ] POST /api/auth/login (email + password → JWT)
- [ ] POST /api/auth/tg (Telegram initData → JWT для модели/клиента)
- [ ] Middleware checkAuth(roles[])
- [ ] Login page (React)

### Этап 3 — Shoots (замена Airtable)
- [ ] CRUD /api/shoots (фильтр по model_id, статус)
- [ ] Страница Manager: таблица съёмок, фильтры, статус
- [ ] Страница Model: свои съёмки + календарь
- [ ] POST /api/sync/shoot — sync endpoint для бота
- [ ] Вызов sync из booking бота (onDeliveryResult)

### Этап 4 — Conversations (замена SendPulse)
- [ ] CRUD /api/conversations, /api/messages
- [ ] SSE /api/conversations/:id/events
- [ ] Страница чата (Manager + Model + Client)
- [ ] bot-notify.js — отправка в чат АПКА при новом сообщении
- [ ] Grammy handler в booking боте — апрув ответов из чата АПКА
- [ ] Уведомления от моделей → чат БУКИНГ (без апрува)

### Этап 5 — Clients + Orders (замена Airtable клиентов)
- [ ] CRUD /api/clients, /api/orders, /api/templates
- [ ] Страница Manager: клиенты, заказы рассылок
- [ ] Страница Client: свои заказы + шаблоны

### Этап 6 — Admin panel
- [ ] Управление пользователями (создать/заблокировать)
- [ ] Назначение менеджер → модели
- [ ] Просмотр всех данных

### Этап 7 — Деплой + интеграция
- [ ] Dockerfile для Railway
- [ ] Railway environment variables
- [ ] Обновить booking бот: добавить вызов /api/sync/shoot
- [ ] Тест полного флоу: съёмка апрувится → появляется в апке
- [ ] Тест чата: клиент пишет → приходит в АПКА → апрув → ответ в апке

### Этап 8 — Telegram Mini App (TWA)
- [ ] Добавить Telegram Web App SDK в React
- [ ] initData авторизация (модели и клиенты входят через Telegram)
- [ ] Кнопка в @lambertain_bot открывает апку
- [ ] Адаптивный mobile UI

## Миграция данных
- Airtable → shoots: экспорт CSV → import script
- SendPulse → conversations: API даёт только subscriber list (имя, telegram_id, переменные) — история диалогов недоступна, начинаем с нуля
