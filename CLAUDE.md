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

## Railway — удалён, деплой на свой сервер

## Airtable
- Base ID: `apptpDSywL3IuQqNW`
- Таблицы: Трекер съемок, Фотографы, Сайты

## Production Server (AdsPower + Booking)
- IP: 185.203.242.10
- OS: Windows Server
- SSH: `Administrator` / `7ow1s82cM41L`
- SSH подключение: только через paramiko (Python), не ssh команду
- AdsPower: http://local.adspower.net:50325 (только localhost)
- AdsPower headless: `"C:\Program Files\AdsPower Global\AdsPower Global.exe" --headless=true --api-key=<KEY>`
- Приложение: `C:\Booking`
- Процесс: pm2 (имя: booking)

## Cloudflare (info@lambertain.agency)
- Account ID: 6905c5c480b1d43eefdc36b074fdc4e8
- Zero Trust team: lambertain
- Пароль: bkC^)D34s8)J3
