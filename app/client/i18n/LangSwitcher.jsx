import React from 'react';
import { useLang } from './useLang.js';

export default function LangSwitcher() {
  const { lang, setLang, SUPPORTED_LANGS } = useLang();

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {SUPPORTED_LANGS.map(l => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          style={{
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: lang === l.code ? 700 : 400,
            background: lang === l.code ? 'var(--accent)' : 'transparent',
            color: lang === l.code ? '#fff' : 'var(--text2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
          }}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
