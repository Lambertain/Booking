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
