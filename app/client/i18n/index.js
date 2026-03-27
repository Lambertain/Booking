import uk from './uk.js';
import ru from './ru.js';
import en from './en.js';

const LOCALES = { uk, ru, en };
const STORAGE_KEY = 'lang';

function detectLang() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && LOCALES[saved]) return saved;

  // Telegram Web App locale
  const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  if (tgLang) {
    if (tgLang.startsWith('uk')) return 'uk';
    if (tgLang.startsWith('ru')) return 'ru';
  }

  // Browser locale
  const nav = navigator.language || 'uk';
  if (nav.startsWith('uk')) return 'uk';
  if (nav.startsWith('ru')) return 'ru';
  return 'en';
}

let currentLang = detectLang();
let listeners = [];

export function getLang() { return currentLang; }

export function setLang(lang) {
  if (!LOCALES[lang]) return;
  currentLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  listeners.forEach(fn => fn(lang));
}

export function onLangChange(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

// t('shoots.title') → string
export function t(key) {
  const parts = key.split('.');
  let val = LOCALES[currentLang];
  for (const p of parts) {
    val = val?.[p];
    if (val === undefined) break;
  }
  if (val === undefined) {
    // Fallback to uk
    val = LOCALES.uk;
    for (const p of parts) val = val?.[p];
  }
  return val ?? key;
}

export const SUPPORTED_LANGS = [
  { code: 'uk', label: 'UA' },
  { code: 'ru', label: 'RU' },
  { code: 'en', label: 'EN' },
];
