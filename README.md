# Booking AI — Віртуальний букер

AI-букер для фотомоделей. Автоматично обробляє вхідні повідомлення на сайтах (Model-Kartei, adultfolio, Model Mayhem), знаходить зацікавлених фотографів, генерує відповіді через Grok AI та надсилає їх на затвердження менеджеру в Telegram.

## Архітектура

```
┌─────────────┐     ┌──────────────┐     ┌───────────┐
│  AdsPower    │────▶│  Екстрактори │────▶│  Qualify   │
│  (браузер)   │     │  3 сайти     │     │  (фільтр) │
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
├── index.js              # Entry point
├── scanner.js            # Ручний запуск сканування
├── ai/
│   └── grok.js           # Grok API для генерації відповідей
├── bot/
│   ├── index.js          # Telegram бот (grammy)
│   └── messages.js       # Форматування повідомлень
├── extractor/
│   ├── adspower.js       # AdsPower клієнт
│   ├── qualify.js        # Логіка кваліфікації
│   ├── model-kartei.js   # Екстрактор Model-Kartei
│   ├── adultfolio.js     # Екстрактор adultfolio
│   ├── modelmayhem.js    # Екстрактор Model Mayhem
│   └── sender.js         # Відправка відповідей через браузер
├── pipeline/
│   └── index.js          # Оркестрація: extract → qualify → draft → approve → send
└── scheduler/
    └── index.js          # Cron планувальник (кожні 15 хв)

models/
└── ana-v/
    ├── config.json       # Конфігурація моделі
    └── profile/          # Стиль, правила, шаблони для AI
```

## Потік роботи

1. **Scheduler** кожні 15 хв запускає pipeline для наступної моделі (round-robin)
2. **Екстрактори** через AdsPower відкривають сайти та витягують діалоги
3. **Qualify** фільтрує діалоги — залишає тільки зацікавлених фотографів
4. **Grok AI** генерує чернетку відповіді на основі профілю моделі
5. **Telegram Bot** надсилає карточку в чат з кнопками OK / EDIT / SKIP
6. Менеджер затверджує або коригує відповідь
7. Затверджена відповідь відправляється фотографу через AdsPower

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

## Деплой (Railway)

```bash
# Railway автодеплой з GitHub
railway up
```

Потрібні змінні оточення в Railway dashboard.
