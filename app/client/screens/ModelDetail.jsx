import React, { useState } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n/useLang.js';
import Avatar from '../components/Avatar.jsx';
import CalendarView from './CalendarView.jsx';
import ShootsList from './ShootsList.jsx';
import TopBar from '../components/TopBar.jsx';
import Sheet from '../components/Sheet.jsx';

export const SITES = [
  { id: 'purpleport',      label: 'PurplePort' },
  { id: 'model-kartei',    label: 'Model-Kartei' },
  { id: 'fotopatracka',    label: 'Fotopatracka' },
  { id: 'modelmayhem',     label: 'Model Mayhem' },
  { id: 'adultfolio',      label: 'adultfolio.com' },
  { id: 'maxmodels',       label: 'MaxModels.pl' },
  { id: 'kavyar',          label: 'Kavyar' },
  { id: 'litmind',         label: 'Litmind' },
  { id: 'ibrandapp',       label: 'iBrandApp' },
  { id: 'models-com',      label: 'Models.com' },
  { id: 'podium',          label: 'Podium.com' },
  { id: 'book-fr',         label: 'Book.Fr' },
  { id: 'modelsociety',    label: 'Model Society' },
  { id: 'starnow',         label: 'StarNow' },
  { id: 'spotlight',       label: 'Spotlight' },
  { id: 'mandy',           label: 'Mandy.com' },
  { id: 'onemodelplace',   label: 'OneModelPlace' },
  { id: 'fotosidan',       label: 'Fotosidan.se' },
  { id: 'modele-photo-fr', label: 'Modele-photo.Fr' },
];

export const STYLES = [
  'Portrait', 'Fashion', 'Lifestyle', 'Swimwear', 'Dance', 'Cosplay',
  'Lingerie', 'Covered nude', 'Topless', 'Implied nude',
  'Art nude', 'Aerial silks',
  'Erotic', 'Open legs', 'Pink', 'Toys',
  'Girl-girl soft', 'Girl-girl hard',
  'BDSM', 'Shibari', 'Fetish', 'Adult',
];

function parseSites(raw) {
  if (!raw) return [];
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

function buildFullSitesList(saved) {
  const savedMap = {};
  for (const s of saved) savedMap[s.id] = s;
  const result = SITES.map(s => ({
    ...s,
    active: savedMap[s.id]?.active || false,
    price: savedMap[s.id]?.price || '',
  }));
  for (const s of saved) {
    if (!SITES.find(x => x.id === s.id)) {
      result.push({ id: s.id, label: s.label || s.id, active: s.active, price: s.price || '' });
    }
  }
  return result;
}

export default function ModelDetail({ model, shoots, onBack, canEdit, onShootUpdated, onModelUpdated }) {
  const { t } = useLang();
  const [tab, setTab] = useState('calendar');
  const [editSheet, setEditSheet] = useState(false);
  const [tourSheet, setTourSheet] = useState(false);
  const [saving, setSaving] = useState(false);

  const rawSites = parseSites(model.sites_json);
  const rawStyles = model.styles_json
    ? (typeof model.styles_json === 'string' ? JSON.parse(model.styles_json) : model.styles_json)
    : [];
  const rawTours = model.tours_json
    ? (typeof model.tours_json === 'string' ? JSON.parse(model.tours_json) : model.tours_json)
    : [];

  const [sitesList, setSitesList]       = useState(() => buildFullSitesList(rawSites));
  const [selectedStyles, setSelectedStyles] = useState(() => new Set(rawStyles));
  const [customStyle, setCustomStyle]   = useState('');
  const [customSite, setCustomSite]     = useState('');
  const [tours, setTours]               = useState(rawTours);
  const [newTour, setNewTour]           = useState({ city: '', date_from: '', date_to: '' });
  const [profile, setProfile]           = useState({
    display_name: model.display_name || model.name || '',
    city: model.city || '',
    instagram: model.instagram || '',
    rates: model.rates || '',
  });

  const activeSites = sitesList.filter(s => s.active);
  const upcomingTours = tours.filter(t => t.date_from >= new Date().toISOString().slice(0, 10));

  function toggleSite(id) {
    setSitesList(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
  }
  function setSitePrice(id, price) {
    setSitesList(prev => prev.map(s => s.id === id ? { ...s, price } : s));
  }
  function toggleStyle(style) {
    setSelectedStyles(prev => {
      const next = new Set(prev);
      next.has(style) ? next.delete(style) : next.add(style);
      return next;
    });
  }
  function addCustomStyle() {
    const val = customStyle.trim();
    if (!val) return;
    setSelectedStyles(prev => new Set([...prev, val]));
    setCustomStyle('');
  }
  function addCustomSite() {
    const val = customSite.trim();
    if (!val) return;
    const id = val.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    setSitesList(prev => [...prev, { id, label: val, active: true, price: '' }]);
    setCustomSite('');
  }
  function addTour() {
    if (!newTour.city || !newTour.date_from) return;
    setTours(t => [...t, { ...newTour }]);
    setNewTour({ city: '', date_from: '', date_to: '' });
    setTourSheet(false);
  }
  function removeTour(i) {
    setTours(t => t.filter((_, idx) => idx !== i));
  }

  async function saveProfile() {
    setSaving(true);
    try {
      const updated = await api.patch(`/api/users/${model.id}/profile`, {
        ...profile,
        sites_json: sitesList,
        styles_json: [...selectedStyles],
        tours_json: tours,
      });
      onModelUpdated?.({ ...model, ...updated });
      setEditSheet(false);
    } finally {
      setSaving(false);
    }
  }

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

      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 'var(--topbar-h)', paddingBottom: 'var(--tabbar-h)' }}>

        {/* Header */}
        <div style={{ padding: '16px 16px 8px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar name={profile.display_name || model.name} size={64} src={model.photo_url} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{profile.display_name || model.name}</div>
            {model.telegram_username && (
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>@{model.telegram_username}</div>
            )}
            {profile.city && (
              <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>{profile.city}</div>
            )}
            {profile.instagram && (
              <div style={{ fontSize: 13, color: 'var(--accent)', marginTop: 1 }}>@{profile.instagram}</div>
            )}
          </div>
        </div>

        {/* Rates */}
        {profile.rates && (
          <div style={{ padding: '0 16px 8px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
            {profile.rates}
          </div>
        )}

        {/* Upcoming tours */}
        {upcomingTours.length > 0 && (
          <div style={{ padding: '0 16px 8px' }}>
            <div className="list-section-title" style={{ marginBottom: 4 }}>Туры</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {upcomingTours.map((tour, i) => (
                <span key={i} style={{
                  fontSize: 12, background: 'var(--bg3)', borderRadius: 8, padding: '4px 10px',
                  color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {tour.city} · {tour.date_from}{tour.date_to ? `–${tour.date_to}` : ''}
                  {canEdit && (
                    <button onClick={() => removeTour(tours.indexOf(tour))} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 2 }}>×</button>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
        {canEdit && (
          <div style={{ padding: '0 16px 8px' }}>
            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setTourSheet(true)}>
              + Тур
            </button>
          </div>
        )}

        {/* Segmented control: Calendar | List | Profile */}
        <div style={{ padding: '8px 16px 0' }}>
          <div className="segmented">
            <button className={`segmented-btn ${tab === 'calendar' ? 'active' : ''}`} onClick={() => setTab('calendar')}>
              {t('shoots.calendar')}
            </button>
            <button className={`segmented-btn ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>
              {t('shoots.list')}
            </button>
            <button className={`segmented-btn ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>
              Профиль
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 8, padding: '8px 16px 12px' }}>
          {[
            { label: t('shoots.all'),                          value: shoots.length },
            { label: t('shoots.statusLabels.confirmed'),       value: shoots.filter(s => s.status === 'confirmed').length, color: 'var(--green)' },
            { label: t('shoots.statusLabels.done'),            value: shoots.filter(s => s.status === 'done').length,      color: 'var(--accent)' },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: 'var(--bg2)', borderRadius: 12, padding: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color || 'var(--text)' }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {tab === 'calendar' && <CalendarView shoots={shoots} canEdit={canEdit} onShootUpdated={onShootUpdated} />}
        {tab === 'list'     && <ShootsList shoots={shoots} canEdit={canEdit} onShootUpdated={onShootUpdated} />}
        {tab === 'profile'  && (
          <ProfileTab
            sitesList={sitesList}
            activeSites={activeSites}
            selectedStyles={selectedStyles}
            canEdit={canEdit}
            onEditClick={() => setEditSheet(true)}
          />
        )}
      </div>

      {/* ── Edit profile sheet ── */}
      <Sheet open={editSheet} onClose={() => setEditSheet(false)} title="Редактировать профиль">
        <div style={{ overflowY: 'auto', maxHeight: '72vh', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Basic */}
          <div className="list-section-title" style={{ marginBottom: 6 }}>Основное</div>
          {[
            { key: 'display_name', label: 'Имя' },
            { key: 'city',         label: 'Город',     ph: 'Hamburg' },
            { key: 'instagram',    label: 'Instagram',  ph: 'username без @' },
            { key: 'rates',        label: 'Расценки',   ph: 'Portrait 80€, Nude 100€/h' },
          ].map(f => (
            <div className="input-group" key={f.key}>
              <div className="input-label">{f.label}</div>
              <input value={profile[f.key]} onChange={e => setProfile(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph || ''} />
            </div>
          ))}

          {/* Sites */}
          <div className="list-section-title" style={{ margin: '12px 0 6px' }}>Сайты</div>
          {sitesList.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <input type="checkbox" checked={s.active} onChange={() => toggleSite(s.id)}
                style={{ width: 18, height: 18, accentColor: 'var(--accent)', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 14, color: s.active ? 'var(--text)' : 'var(--text3)' }}>{s.label}</span>
              {s.active && (
                <input
                  value={s.price}
                  onChange={e => setSitePrice(s.id, e.target.value)}
                  placeholder="цена €"
                  style={{ width: 72, fontSize: 13, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)' }}
                />
              )}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <input value={customSite} onChange={e => setCustomSite(e.target.value)} placeholder="Добавить сайт..." style={{ flex: 1 }} />
            <button className="btn btn-secondary" style={{ flexShrink: 0 }} onClick={addCustomSite}>+</button>
          </div>

          {/* Styles */}
          <div className="list-section-title" style={{ margin: '12px 0 6px' }}>Стили</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {STYLES.map(s => (
              <button key={s} onClick={() => toggleStyle(s)} style={{
                fontSize: 12, borderRadius: 8, padding: '5px 10px', border: 'none', cursor: 'pointer',
                background: selectedStyles.has(s) ? 'var(--accent)' : 'var(--bg3)',
                color: selectedStyles.has(s) ? '#fff' : 'var(--text2)',
                fontWeight: selectedStyles.has(s) ? 600 : 400,
              }}>
                {s}
              </button>
            ))}
            {[...selectedStyles].filter(s => !STYLES.includes(s)).map(s => (
              <button key={s} onClick={() => toggleStyle(s)} style={{
                fontSize: 12, borderRadius: 8, padding: '5px 10px', border: 'none', cursor: 'pointer',
                background: 'var(--accent)', color: '#fff', fontWeight: 600,
              }}>
                {s} ×
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={customStyle} onChange={e => setCustomStyle(e.target.value)} placeholder="Добавить стиль..." style={{ flex: 1 }} />
            <button className="btn btn-secondary" style={{ flexShrink: 0 }} onClick={addCustomStyle}>+</button>
          </div>
        </div>

        <button className="btn btn-primary btn-full" style={{ marginTop: 16 }} onClick={saveProfile} disabled={saving}>
          {saving ? '...' : t('save')}
        </button>
      </Sheet>

      {/* Add tour sheet */}
      <Sheet open={tourSheet} onClose={() => setTourSheet(false)} title="Добавить тур">
        <div className="input-group">
          <div className="input-label">Город</div>
          <input value={newTour.city} onChange={e => setNewTour(t => ({ ...t, city: e.target.value }))} placeholder="Paris" />
        </div>
        <div className="input-group">
          <div className="input-label">С</div>
          <input type="date" value={newTour.date_from} onChange={e => setNewTour(t => ({ ...t, date_from: e.target.value }))} />
        </div>
        <div className="input-group">
          <div className="input-label">По</div>
          <input type="date" value={newTour.date_to} onChange={e => setNewTour(t => ({ ...t, date_to: e.target.value }))} />
        </div>
        <button className="btn btn-primary btn-full" onClick={addTour}>Добавить</button>
      </Sheet>
    </div>
  );
}

/* ── Profile tab (read-only view) ── */
function ProfileTab({ sitesList, activeSites, selectedStyles, canEdit, onEditClick }) {
  return (
    <div style={{ padding: '0 16px 24px' }}>
      {/* Active sites with prices */}
      <div className="list-section-title" style={{ marginBottom: 8 }}>
        Сайты {activeSites.length > 0 && <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({activeSites.length})</span>}
      </div>
      {activeSites.length > 0 ? (
        <div className="card" style={{ marginBottom: 16 }}>
          {activeSites.map(s => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 14 }}>{s.label}</span>
              {s.price
                ? <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)' }}>€{s.price}</span>
                : <span style={{ fontSize: 12, color: 'var(--text3)' }}>—</span>
              }
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 16 }}>Сайты не указаны</div>
      )}

      {/* Styles */}
      <div className="list-section-title" style={{ marginBottom: 8 }}>
        Стили {selectedStyles.size > 0 && <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({selectedStyles.size})</span>}
      </div>
      {selectedStyles.size > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {[...selectedStyles].map(s => (
            <span key={s} style={{
              fontSize: 12, background: 'var(--accent-bg)', color: 'var(--accent)',
              borderRadius: 6, padding: '4px 10px', fontWeight: 500,
            }}>
              {s}
            </span>
          ))}
        </div>
      ) : (
        <div style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 16 }}>Стили не указаны</div>
      )}

      {canEdit && (
        <button className="btn btn-secondary btn-full" onClick={onEditClick}>
          Редактировать профиль
        </button>
      )}
    </div>
  );
}
