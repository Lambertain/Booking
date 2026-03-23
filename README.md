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

## Продакшн сервер

- **IP**: 185.203.242.10 (Windows Server)
- **Директорія**: `C:\Booking`
- **Процес**: node.exe (запускається через watchdog)
- **Авто-рестарт**: Task Scheduler — `BookingAI-Watchdog` кожну хвилину + `BookingAI-Startup` при завантаженні
- **Watchdog**: `C:\Booking\watchdog.ps1` — перевіряє чи жива node.exe, якщо ні — запускає і шле TG alert
- **Краш-алерти**: при падінні процес надсилає помилку в Telegram-чат перед виходом
- **Логи**: `C:\Booking\data\output.log`, `C:\Booking\data\error.log`
- **AdsPower**: http://local.adspower.net:50325 (тільки localhost)
- **SSH**: `Administrator` / `7ow1s82cM41L` (тільки через paramiko Python)
