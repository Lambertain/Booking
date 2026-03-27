import React, { useState } from 'react';
import { useLang } from '../i18n/useLang.js';

const DAY_NAMES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export default function CalendarView({ shoots }) {
  const { t, lang } = useLang();
  const [date, setDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);

  const year = date.getFullYear();
  const month = date.getMonth();

  const monthName = date.toLocaleDateString(lang === 'uk' ? 'uk-UA' : lang === 'ru' ? 'ru-RU' : 'en-US', { month: 'long', year: 'numeric' });

  // Build calendar days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Monday-first: 0=Mon..6=Sun
  const startOffset = (firstDay.getDay() + 6) % 7;

  const days = [];
  for (let i = 0; i < startOffset; i++) {
    const d = new Date(year, month, -startOffset + i + 1);
    days.push({ date: d, thisMonth: false });
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({ date: new Date(year, month, i), thisMonth: true });
  }
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), thisMonth: false });
    }
  }

  // Map shoot dates
  const shootsByDate = {};
  for (const s of shoots) {
    if (!s.shoot_date || s.status === 'cancelled') continue;
    const key = s.shoot_date.slice(0, 10);
    if (!shootsByDate[key]) shootsByDate[key] = [];
    shootsByDate[key].push(s);
  }

  const today = new Date().toISOString().slice(0, 10);
  const selectedKey = selectedDay?.toISOString().slice(0, 10);
  const selectedShoots = selectedKey ? (shootsByDate[selectedKey] || []) : [];

  return (
    <div style={{ padding: '0 16px' }}>
      <div className="card" style={{ padding: '16px', marginBottom: 16 }}>
        <div className="cal-nav">
          <button className="cal-nav-btn" onClick={() => setDate(new Date(year, month - 1, 1))}>‹</button>
          <span style={{ fontWeight: 700, fontSize: 16, textTransform: 'capitalize' }}>{monthName}</span>
          <button className="cal-nav-btn" onClick={() => setDate(new Date(year, month + 1, 1))}>›</button>
        </div>

        <div className="calendar-grid">
          {DAY_NAMES.map(d => <div key={d} className="cal-day-header">{d}</div>)}
          {days.map((d, i) => {
            const key = d.date.toISOString().slice(0, 10);
            const isToday = key === today;
            const hasShoot = !!shootsByDate[key];
            const isSelected = key === selectedKey;
            return (
              <div
                key={i}
                className={`cal-day ${isToday ? 'today' : ''} ${hasShoot ? 'has-shoot' : ''} ${!d.thisMonth ? 'other-month' : ''}`}
                style={isSelected && !isToday ? { background: 'var(--accent-bg)', borderRadius: '50%' } : {}}
                onClick={() => setSelectedDay(d.thisMonth ? d.date : null)}
              >
                {d.date.getDate()}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected day shoots */}
      {selectedDay && (
        <div>
          <div className="list-section-title" style={{ marginBottom: 8 }}>
            {selectedDay.toLocaleDateString(lang === 'uk' ? 'uk-UA' : lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'long' })}
          </div>
          {selectedShoots.length === 0 ? (
            <div style={{ color: 'var(--text2)', fontSize: 14, padding: '8px 0' }}>{t('shoots.empty')}</div>
          ) : (
            <div className="card">
              {selectedShoots.map((s, i) => (
                <div key={s.id} className="shoot-item">
                  <div className="shoot-item-top">
                    <span className="shoot-item-name">{s.photographer_name}</span>
                    <span className={`badge badge-${s.status}`}>{t(`shoots.statusLabels.${s.status}`)}</span>
                  </div>
                  <div className="shoot-item-meta">
                    {s.location && <span>📍 {s.location}</span>}
                    {s.rate && <span>💶 {s.rate} {s.currency}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upcoming shoots */}
      {!selectedDay && (
        <div>
          <div className="list-section-title" style={{ marginBottom: 8 }}>{t('shoots.upcoming')}</div>
          <div className="card">
            {Object.entries(shootsByDate)
              .filter(([k]) => k >= today)
              .sort(([a], [b]) => a.localeCompare(b))
              .slice(0, 5)
              .flatMap(([k, ss]) => ss.map(s => ({ ...s, _key: k })))
              .map(s => (
                <div key={s.id} className="shoot-item">
                  <div className="shoot-item-top">
                    <span className="shoot-item-name">{s.photographer_name}</span>
                    <span className={`badge badge-${s.status}`}>{t(`shoots.statusLabels.${s.status}`)}</span>
                  </div>
                  <div className="shoot-item-meta">
                    <span>📅 {new Date(s.shoot_date).toLocaleDateString()}</span>
                    {s.location && <span>📍 {s.location}</span>}
                  </div>
                </div>
              ))
            }
            {Object.keys(shootsByDate).filter(k => k >= today).length === 0 && (
              <div className="shoot-item" style={{ color: 'var(--text2)' }}>{t('shoots.noUpcoming')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
