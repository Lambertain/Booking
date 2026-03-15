думай на русском
читай редми и поддерживай его актуальность
делай комит и пуш в гит

# Booking AI — Virtual Booker

## Стек
- Node.js (CommonJS) + Playwright + Grammy (Telegram) + xAI Grok API
- Файловое хранилище (JSON в data/)
- AdsPower для управления браузерными профилями моделей

## Структура
- `src/` — исходный код
- `models/` — конфиги и профили моделей (в git)
- `data/` — рантайм данные (gitignored)

## Переменные окружения
- TELEGRAM_BOT_TOKEN — токен Telegram бота
- TELEGRAM_CHAT_ID — ID чата Booking
- XAI_API_KEY — ключ xAI API (Grok)
- ADSPOWER_API_KEY — ключ AdsPower API
- ADSPOWER_API_BASE — база AdsPower API (default: http://local.adspower.net:50325)
- SCAN_INTERVAL_MIN — интервал сканирования в минутах (default: 15)

## GitHub
- Repo: https://github.com/Lambertain/Booking.git
- Коміти українською

## Railway (production)
- Token: `6f04a384-b4bd-4c8a-be9b-3d8286850c8d`
- Project ID: `fa436ed5-e85a-4d2d-891f-6c3497f26a20`
- Project name: balanced-nurturing
- Service ID: `9678ec11-ea11-40de-bdf9-52aed3245d31` (Booking)
- Environment ID: `ba41c9a4-4eb4-4553-adfe-60821c7a4e16` (production)
- API: `https://backboard.railway.app/graphql/v2`
- Auth: `Authorization: Bearer <Token>`

## Airtable
- Base ID: `apptpDSywL3IuQqNW`
- Таблицы: Трекер съемок, Фотографы, Сайты
