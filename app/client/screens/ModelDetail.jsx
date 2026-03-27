import React, { useState } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n/useLang.js';
import Avatar from '../components/Avatar.jsx';
import CalendarView from './CalendarView.jsx';
import ShootsList from './ShootsList.jsx';
import TopBar from '../components/TopBar.jsx';
import Sheet from '../components/Sheet.jsx';

export default function ModelDetail({ model, shoots, onBack, canEdit, onShootUpdated, onModelUpdated }) {
  const { t, lang } = useLang();
  const [tab, setTab] = useState('calendar');
  const [editSheet, setEditSheet] = useState(false);
  const [tourSheet, setTourSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    display_name: model.display_name || model.name || '',
    city: model.city || '',
    instagram: model.instagram || '',
    rates: model.rates || '',
    sites_json: model.sites_json ? (typeof model.sites_json === 'string' ? JSON.parse(model.sites_json) : model.sites_json) : [],
    tours_json: model.tours_json ? (typeof model.tours_json === 'string' ? JSON.parse(model.tours_json) : model.tours_json) : [],
  });
  const [newSite, setNewSite] = useState({ label: '', url: '' });
  const [newTour, setNewTour] = useState({ city: '', date_from: '', date_to: '' });

  async function saveProfile() {
    setSaving(true);
    try {
      const updated = await api.patch(`/api/users/${model.id}/profile`, profile);
      onModelUpdated?.({ ...model, ...updated });
      setEditSheet(false);
    } finally {
      setSaving(false);
    }
  }

  function addSite() {
    if (!newSite.url) return;
    setProfile(p => ({ ...p, sites_json: [...p.sites_json, { ...newSite }] }));
    setNewSite({ label: '', url: '' });
  }

  function removeSite(i) {
    setProfile(p => ({ ...p, sites_json: p.sites_json.filter((_, idx) => idx !== i) }));
  }

  function addTour() {
    if (!newTour.city || !newTour.date_from) return;
    setProfile(p => ({ ...p, tours_json: [...p.tours_json, { ...newTour }] }));
    setNewTour({ city: '', date_from: '', date_to: '' });
    setTourSheet(false);
  }

  function removeTour(i) {
    setProfile(p => ({ ...p, tours_json: p.tours_json.filter((_, idx) => idx !== i) }));
  }

  const tours = profile.tours_json || [];
  const upcomingTours = tours.filter(t => t.date_from >= new Date().toISOString().slice(0, 10));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <TopBar
        title={profile.display_name || model.name}
        left={onBack ? <button className="back-btn" onClick={onBack}>‹ {t('back')}</button> : null}
        right={canEdit && (
          <button className="btn btn-sm btn-secondary" onClick={() => setEditSheet(true)}>
            {t('edit')}
          </button>
        )}
      />

      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 'var(--topbar-h)' }}>
        {/* Model header */}
        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar name={profile.display_name || model.name} size={64} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{profile.display_name || model.name}</div>
            {model.telegram_username && (
              <div style={{ fontSize: 14, color: 'var(--text2)' }}>@{model.telegram_username}</div>
            )}
            {profile.city && (
              <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>📍 {profile.city}</div>
            )}
          </div>
        </div>

        {/* Profile info row */}
        {(profile.rates || profile.sites_json?.length > 0 || profile.instagram) && (
          <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {profile.rates && (
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                <span style={{ color: 'var(--text3)' }}>Rates: </span>{profile.rates}
              </div>
            )}
            {profile.instagram && (
              <div style={{ fontSize: 13, color: 'var(--accent)' }}>@{profile.instagram}</div>
            )}
            {profile.sites_json?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {profile.sites_json.map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noreferrer"
                    style={{ fontSize: 12, background: 'var(--bg3)', borderRadius: 8, padding: '4px 10px', color: 'var(--text2)', textDecoration: 'none' }}>
                    {s.label || s.url}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Upcoming tours */}
        {upcomingTours.length > 0 && (
          <div style={{ padding: '0 16px 12px' }}>
            <div className="list-section-title" style={{ marginBottom: 8 }}>Tours</div>
            <div className="card">
              {upcomingTours.map((tour, i) => (
                <div key={i} className="list-item">
                  <div className="list-item-body">
                    <div className="list-item-title">{tour.city}</div>
                    <div className="list-item-subtitle">
                      {tour.date_from}{tour.date_to ? ` – ${tour.date_to}` : ''}
                    </div>
                  </div>
                  {canEdit && (
                    <button onClick={() => removeTour(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 18 }}>×</button>
                  )}
                </div>
              ))}
            </div>
            {canEdit && (
              <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => setTourSheet(true)}>
                + Add tour
              </button>
            )}
          </div>
        )}
        {canEdit && upcomingTours.length === 0 && (
          <div style={{ padding: '0 16px 12px' }}>
            <button className="btn btn-secondary" onClick={() => setTourSheet(true)}>
              + Add tour
            </button>
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 16px' }}>
          {[
            { label: t('shoots.all'), value: shoots.length },
            { label: t('shoots.statusLabels.confirmed'), value: shoots.filter(s => s.status === 'confirmed').length, color: 'var(--green)' },
            { label: t('shoots.statusLabels.done'), value: shoots.filter(s => s.status === 'done').length, color: 'var(--accent)' },
          ].map(s => (
            <div key={s.label} className="card" style={{ flex: 1, padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color || 'var(--text)' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Segmented control */}
        <div style={{ padding: '0 16px 8px' }}>
          <div className="segmented">
            <button className={`segmented-btn ${tab === 'calendar' ? 'active' : ''}`} onClick={() => setTab('calendar')}>
              {t('shoots.calendar')}
            </button>
            <button className={`segmented-btn ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>
              {t('shoots.list')}
            </button>
          </div>
        </div>

        {tab === 'calendar'
          ? <CalendarView shoots={shoots} />
          : <ShootsList shoots={shoots} canEdit={canEdit} onShootUpdated={onShootUpdated} />
        }
      </div>

      {/* Edit profile sheet */}
      <Sheet open={editSheet} onClose={() => setEditSheet(false)} title="Edit profile">
        <div className="input-group">
          <div className="input-label">Name</div>
          <input value={profile.display_name} onChange={e => setProfile(p => ({ ...p, display_name: e.target.value }))} />
        </div>
        <div className="input-group">
          <div className="input-label">City</div>
          <input value={profile.city} onChange={e => setProfile(p => ({ ...p, city: e.target.value }))} placeholder="e.g. Paris" />
        </div>
        <div className="input-group">
          <div className="input-label">Rates</div>
          <input value={profile.rates} onChange={e => setProfile(p => ({ ...p, rates: e.target.value }))} placeholder="e.g. €200-400/h, €1500/day" />
        </div>
        <div className="input-group">
          <div className="input-label">Instagram</div>
          <input value={profile.instagram} onChange={e => setProfile(p => ({ ...p, instagram: e.target.value }))} placeholder="username (without @)" />
        </div>

        {/* Sites */}
        <div className="input-group">
          <div className="input-label">Sites</div>
          {profile.sites_json.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
              <div style={{ flex: 1, fontSize: 13, background: 'var(--bg3)', borderRadius: 8, padding: '8px 12px', color: 'var(--text2)' }}>
                {s.label || s.url}
              </div>
              <button onClick={() => removeSite(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 18, padding: 4 }}>×</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={newSite.label}
              onChange={e => setNewSite(s => ({ ...s, label: e.target.value }))}
              placeholder="Label (e.g. Model-Kartei)"
              style={{ flex: 1 }}
            />
            <input
              value={newSite.url}
              onChange={e => setNewSite(s => ({ ...s, url: e.target.value }))}
              placeholder="URL"
              style={{ flex: 2 }}
            />
            <button className="btn btn-secondary" onClick={addSite} style={{ flexShrink: 0 }}>+</button>
          </div>
        </div>

        <button className="btn btn-primary btn-full" onClick={saveProfile} disabled={saving}>
          {saving ? '...' : t('save')}
        </button>
      </Sheet>

      {/* Add tour sheet */}
      <Sheet open={tourSheet} onClose={() => setTourSheet(false)} title="Add tour">
        <div className="input-group">
          <div className="input-label">City</div>
          <input value={newTour.city} onChange={e => setNewTour(t => ({ ...t, city: e.target.value }))} placeholder="e.g. Paris" />
        </div>
        <div className="input-group">
          <div className="input-label">From</div>
          <input type="date" value={newTour.date_from} onChange={e => setNewTour(t => ({ ...t, date_from: e.target.value }))} />
        </div>
        <div className="input-group">
          <div className="input-label">To</div>
          <input type="date" value={newTour.date_to} onChange={e => setNewTour(t => ({ ...t, date_to: e.target.value }))} />
        </div>
        <button className="btn btn-primary btn-full" onClick={addTour}>Add</button>
      </Sheet>
    </div>
  );
}
