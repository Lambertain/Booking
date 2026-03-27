import React, { useEffect, useState } from 'react';
import { useLang } from '../i18n/useLang.js';
import LangSwitcher from '../i18n/LangSwitcher.jsx';

export default function LoginPage() {
  const { t } = useLang();
  const [status, setStatus] = useState('Відкрийте цю сторінку через Telegram');

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg?.initData) {
      setStatus('Авторизація через Telegram...');
    }
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', flexDirection: 'column', gap: 24 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent2)' }}>Lambertain Booking</div>
      <div className="card" style={{ width: 320, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✈️</div>
        <div style={{ color: 'var(--text2)', lineHeight: 1.6 }}>{status}</div>
        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text2)' }}>
          Якщо ви не зареєстровані — зверніться до адміністратора
        </div>
      </div>
      <LangSwitcher />
    </div>
  );
}
