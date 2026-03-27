import { useState, useEffect } from 'react';
import { t, getLang, setLang, onLangChange, SUPPORTED_LANGS } from './index.js';

// Hook — re-renders component when language changes
export function useLang() {
  const [lang, setLangState] = useState(getLang);

  useEffect(() => {
    return onLangChange(setLangState);
  }, []);

  return { t, lang, setLang, SUPPORTED_LANGS };
}
