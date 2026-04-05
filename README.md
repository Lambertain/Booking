# Booking AI — Віртуальний букер

AI-букер для фотомоделей. Автоматично обробляє вхідні повідомлення на сайтах (Model-Kartei, adultfolio, Model Mayhem, PurplePort), знаходить зацікавлених фотографів, генерує відповіді через Grok AI та надсилає їх на затвердження менеджеру в Telegram.

## Моделі

| Slug | Модель | AdsPower Profile | Сайти |
|------|--------|-----------------|-------|
| `ana-v` | Ana V | k123o21g | Model-Kartei, adultfolio, Model Mayhem |
| `kisa` | Kisa | k14q5tpw | Model-Kartei, adultfolio, Model Mayhem, PurplePort |
| `victoria-polly` | Victoria Polly | k1a43fq1 | Model-Kartei |
| `violet-spes` | Violet Spes | k1a43egx | Model-Kartei |

## Архітектура

```
┌─────────────┐     ┌──────────────┐     ┌───────────┐
│  AdsPower    │────▶│  Екстрактори │────▶│  Qualify   │
│  (браузер)   │     │  4 сайти     │     │  (фільтр) │
└─────────────┘     └──────────────┘     └─────┬─────┘
                                               │
                                         ┌─────▼─────┐
                                         │  Grok AI   │
                                         │  (драфт)   │
                                         └─────┬─────┘
                                               │
                    ┌──────────────┐     ┌─────▼─────┐
                    │  AdsPower    │◀────│  Telegram  │
                    │  (відправка) │     │  Bot       │
                    └──────────────┘     │  OK/EDIT/  │
                                        │  SKIP      │
                                        └────────────┘
```

## Структура проекту

```
src/
├── index.js              # Entry point + crash handlers (TG alert on crash)
├── scanner.js            # Ручний запуск сканування
├── ai/
│   ├── grok.js           # Grok API для генерації відповідей
│   └── agent.js          # Telegram chat agent
├── bot/
│   ├── index.js          # Telegram бот (grammy)
│   └── messages.js       # Форматування повідомлень
├── extractor/
│   ├── adspower.js       # AdsPower клієнт
│   ├── qualify.js        # Логіка кваліфікації
│   ├── model-kartei.js   # Екстрактор Model-Kartei
│   ├── adultfolio.js     # Екстрактор adultfolio
│   ├── modelmayhem.js    # Екстрактор Model Mayhem
│   ├── purpleport.js     # Екстрактор PurplePort
│   └── sender.js         # Відправка відповідей через браузер
├── pipeline/
│   ├── index.js          # Оркестрація: extract → qualify → draft → approve → send
│   ├── queue.js          # Черга затвердження (approval-queue.json)
│   └── send-queue.js     # Черга відправки (send-queue.json)
├── scheduler/
│   └── index.js          # Cron планувальник (кожні 15 хв, round-robin по моделях)
├── db/
│   └── index.js          # SQLite (booking.db): таблиця dialogs
└── airtable/
    └── index.js          # Запис знімань в Airtable

models/
├── ana-v/
├── kisa/
├── victoria-polly/
└── violet-spes/
    ├── config.json       # AdsPower profileId, sites, airtable baseId
    └── profile/          # reply-engine.md, rules.md, style.md, templates.md
```

## Потік роботи

1. **Scheduler** кожні 15 хв запускає pipeline для наступної моделі (round-robin)
2. **Екстрактори** через AdsPower відкривають сайти та витягують діалоги
3. Активні діалоги (status=queued/sent в БД) перевіряються першими по URL
4. **Qualify** (Grok AI) фільтрує нові діалоги — залишає тільки зацікавлених фотографів
5. **Grok AI** генерує чернетку відповіді на основі профілю моделі
6. **Telegram Bot** надсилає карточку в чат з кнопками OK / EDIT / SKIP
7. Менеджер затверджує або коригує відповідь
8. Затверджена відповідь відправляється фотографу через AdsPower браузер

## Налаштування

```bash
cp .env.example .env
# Заповнити змінні в .env
npm install
npm start
```

### Змінні оточення

| Змінна | Опис |
|--------|------|
| `TELEGRAM_BOT_TOKEN` | Токен Telegram бота |
| `TELEGRAM_CHAT_ID` | ID чату Booking |
| `XAI_API_KEY` | Ключ xAI API (Grok) |
| `ADSPOWER_API_KEY` | Ключ AdsPower API |
| `ADSPOWER_API_BASE` | URL AdsPower API (default: http://local.adspower.net:50325) |
| `SCAN_INTERVAL_MIN` | Інтервал сканування в хвилинах (default: 15) |

## Додавання нової моделі

1. Створити `models/<slug>/config.json` з конфігурацією AdsPower профілю та сайтів
2. Додати файли профілю в `models/<slug>/profile/` (reply-engine.md, rules.md, style.md, templates.md)
3. Модель автоматично підхопиться scheduler'ом

## Продакшн сервер (бот)

- **IP**: 185.203.242.10 (Windows Server)
- **Директорія**: `C:\Booking`
- **Процес**: node.exe (запускається через watchdog)
- **Авто-рестарт**: Task Scheduler — `BookingAI-Watchdog` кожну хвилину + `BookingAI-Startup` при завантаженні
- **Watchdog**: `C:\Booking\watchdog.ps1` — перевіряє чи жива node.exe, якщо ні — запускає і шле TG alert
- **Краш-алерти**: при падінні процес надсилає помилку в Telegram-чат перед виходом
- **Логи**: `C:\Booking\data\output.log`, `C:\Booking\data\error.log`
- **AdsPower**: http://local.adspower.net:50325 (тільки localhost)
- **SSH**: `Administrator` / `7ow1s82cM41L` (тільки через paramiko Python)

---

# Мини-апп (app/)

Telegram Mini App + веб-інтерфейс, що замінює Airtable (трекер зйомок) і SendPulse (комунікація з моделями та клієнтами).

## Деплой

- **URL**: https://booking-production-ab66.up.railway.app
- **Хостинг**: Railway (Express API + React + PostgreSQL)
- **Автодеплой**: push до `main` → Railway rebuild

## Ролі

| Роль | Доступ |
|------|--------|
| `admin` | все — моделі, зйомки, клієнти, користувачі, налаштування |
| `manager` | призначені моделі: зйомки, клієнти, переписка |
| `model` | свої зйомки, календар, тури, чат з менеджером |
| `client` | свої замовлення розсилок, шаблони, чат з менеджером |

## Telegram чати

- **БУКИНГ** (-5132805901): AI ↔ фотографи, апрув менеджером. При апруві надсилаються **2 повідомлення**: переписка (до 4000 символів) + чернетка з кнопками OK/EDIT/SKIP
- **АПКА** (-1002425111120): повідомлення з апки (клієнти/моделі) → Grok AI → апрув → відповідь в апку

## Структура app/

```
app/
├── server/
│   ├── index.js              # Express entry, автоміграція БД, планувальник нагадувань
│   ├── db.js                 # pg pool
│   ├── migrations/           # SQL міграції (001–027)
│   ├── bot-notify.js         # Telegram сповіщення + генерація AI чернетки (Grok)
│   └── routes/
│       ├── auth.js           # POST /api/auth/login, /tg
│       ├── shoots.js         # CRUD зйомок
│       ├── conversations.js  # Діалоги + SSE + POST /with-manager
│       ├── messages.js       # Відправка/отримання повідомлень + медіа
│       ├── orders.js         # CRUD замовлень розсилок
│       ├── templates.js      # CRUD шаблонів розсилок
│       ├── users.js          # Управління користувачами (admin)
│       ├── broadcast.js      # Розсилки через Telegram бот
│       ├── bot.js            # Webhook апрув відповідей з чату АПКА
│       ├── analytics.js      # Статистика розсилок
│       └── sync.js           # POST /api/sync/shoot (від бота)
├── client/
│   ├── App.jsx               # Роутинг по ролі
│   ├── i18n/                 # Локалізація: uk.js, ru.js, en.js
│   ├── screens/              # AnalyticsScreen, ChatsScreen, ClientsScreen,
│   │                         # ModelDetail, ModelsScreen, SettingsScreen, ShootsList
│   └── components/           # OrderSheet, TemplateSheet, ReminderConfig, ShootSheet, ...
└── Dockerfile
```

## БД (PostgreSQL, Railway)

Ключові таблиці: `users`, `agency_models`, `shoots`, `conversations`, `messages`, `mailing_orders`, `mailing_templates`, `clients`, `manager_models`, `subscribers`, `broadcast_logs`, `broadcast_message_templates`

## Функціонал мини-апп

- **Зйомки**: трекер зйомок по моделях, статуси, календар, sync з ботом
- **Моделі**: профілі, сайти, стилі, тури. При додаванні туру — авто-створення карток розсилок по кожному сайту
- **Клієнти**: замовлення розсилок та шаблони з детальними полями (deal, CRM, статистика сайтів, дедлайн, нагадування)
- **Чати**: внутрішній чат моделі/клієнта з менеджером через SSE, апрув відповідей через Telegram
- **Аналітика**: графіки розсилок (день/тиждень/місяць/рік), статистика по моделях
- **Розсилки**: broadcast підписникам з тегами, шаблони повідомлень
- **Нагадування**: автоматичні нагадування клієнтам перед дедлайном (налаштовуються в картці)
- **Налаштування**: управління користувачами, мова (uk/ru/en), тема, impersonation
