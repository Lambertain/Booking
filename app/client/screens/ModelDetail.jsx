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
  }));
  for (const s of saved) {
    if (!SITES.find(x => x.id === s.id)) {
      result.push({ id: s.id, label: s.label || s.id, active: s.active });
    }
  }
  return result;
}

// styles_json: [{name, price}] (new) or ["name",...] (old)
function parseStyles(raw) {
  if (!raw) return { selected: new Set(), prices: {} };
  const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!arr.length) return { selected: new Set(), prices: {} };
  if (typeof arr[0] === 'string') {
    return { selected: new Set(arr), prices: {} };
  }
  const selected = new Set(arr.map(s => s.name));
  const prices = {};
  for (const s of arr) prices[s.name] = s.price || '';
  return { selected, prices };
}

export default function ModelDetail({ model, shoots, onBack, canEdit, onShootUpdated, onModelUpdated }) {
  const { t } = useLang();
  const [tab, setTab] = useState('calendar');
  const [editSheet, setEditSheet] = useState(false);
  const [tourSheet, setTourSheet] = useState(false);
  const [createShoot, setCreateShoot] = useState(false);
  const [saving, setSaving] = useState(false);

  const rawSites  = parseSites(model.sites_json);
  const rawTours  = model.tours_json
    ? (typeof model.tours_json === 'string' ? JSON.parse(model.tours_json) : model.tours_json)
    : [];
  const { selected: initStyles, prices: initPrices } = parseStyles(model.styles_json);

  const [sitesList, setSitesList]           = useState(() => buildFullSitesList(rawSites));
  const [selectedStyles, setSelectedStyles] = useState(() => initStyles);
  const [stylePrices, setStylePrices]       = useState(() => initPrices);
  const [customStyle, setCustomStyle]       = useState('');
  const [customSite, setCustomSite]         = useState('');
  const [tours, setTours]                   = useState(rawTours);
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
  function setStylePrice(name, price) {
    setStylePrices(prev => ({ ...prev, [name]: price }));
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
        styles_json: [...selectedStyles].map(name => ({ name, price: stylePrices[name] || '' })),
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setCreateShoot(true)}
              style={{
                width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: 'var(--accent)', color: '#fff', fontSize: 22, lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 300,
              }}
            >+</button>
            <button className="btn btn-sm btn-secondary" onClick={() => setEditSheet(true)}>
              {t('edit')}
            </button>
          </div>
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
            stylePrices={stylePrices}
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

          {/* Sites — checkboxes only, no price */}
          <div className="list-section-title" style={{ margin: '12px 0 6px' }}>Сайты</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {sitesList.map(s => (
              <button
                key={s.id}
                onClick={() => toggleSite(s.id)}
                style={{
                  fontSize: 12, borderRadius: 8, padding: '5px 10px', border: 'none', cursor: 'pointer',
                  background: s.active ? 'var(--accent)' : 'var(--bg3)',
                  color: s.active ? '#fff' : 'var(--text2)',
                  fontWeight: s.active ? 600 : 400,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <input value={customSite} onChange={e => setCustomSite(e.target.value)} placeholder="Добавить сайт..." style={{ flex: 1 }} />
            <button className="btn btn-secondary" style={{ flexShrink: 0 }} onClick={addCustomSite}>+</button>
          </div>

          {/* Styles — toggle + price per style */}
          <div className="list-section-title" style={{ margin: '12px 0 6px' }}>Стили и цены</div>
          {[...STYLES, ...[...selectedStyles].filter(s => !STYLES.includes(s))].map(s => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <button
                onClick={() => toggleStyle(s)}
                style={{
                  flex: 1, textAlign: 'left', padding: '6px 10px', borderRadius: 8, border: 'none',
                  cursor: 'pointer', fontSize: 13,
                  background: selectedStyles.has(s) ? 'var(--accent)' : 'var(--bg3)',
                  color: selectedStyles.has(s) ? '#fff' : 'var(--text2)',
                  fontWeight: selectedStyles.has(s) ? 600 : 400,
                }}
              >
                {s}{!STYLES.includes(s) ? ' ×' : ''}
              </button>
              {selectedStyles.has(s) && (
                <input
                  value={stylePrices[s] || ''}
                  onChange={e => setStylePrice(s, e.target.value)}
                  placeholder="€/h"
                  style={{ width: 68, fontSize: 13, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)' }}
                />
              )}
            </div>
          ))}
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

      {/* ── Create shoot sheet ── */}
      <CreateShootSheet
        open={createShoot}
        onClose={() => setCreateShoot(false)}
        modelId={model.id}
        onCreated={shoot => {
          onShootUpdated?.(shoot);
          setCreateShoot(false);
        }}
      />
    </div>
  );
}

/* ── Profile tab (read-only view) ── */
function ProfileTab({ sitesList, activeSites, selectedStyles, stylePrices, canEdit, onEditClick }) {
  const stylesList = [...selectedStyles];

  return (
    <div style={{ padding: '0 16px 24px' }}>
      {/* Active sites — names only, no prices */}
      <div className="list-section-title" style={{ marginBottom: 8 }}>
        Сайты{activeSites.length > 0 && <span style={{ color: 'var(--text3)', fontWeight: 400 }}> ({activeSites.length})</span>}
      </div>
      {activeSites.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {activeSites.map(s => (
            <span key={s.id} style={{
              fontSize: 12, background: 'var(--bg3)', color: 'var(--text2)',
              borderRadius: 8, padding: '4px 10px',
            }}>
              {s.label}
            </span>
          ))}
        </div>
      ) : (
        <div style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 16 }}>Сайты не указаны</div>
      )}

      {/* Styles with prices */}
      <div className="list-section-title" style={{ marginBottom: 8 }}>
        Стили{stylesList.length > 0 && <span style={{ color: 'var(--text3)', fontWeight: 400 }}> ({stylesList.length})</span>}
      </div>
      {stylesList.length > 0 ? (
        <div className="card" style={{ marginBottom: 16 }}>
          {stylesList.map(s => (
            <div key={s} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 16px', borderBottom: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 14 }}>{s}</span>
              {stylePrices[s]
                ? <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)' }}>€{stylePrices[s]}</span>
                : <span style={{ fontSize: 12, color: 'var(--text3)' }}>—</span>
              }
            </div>
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

/* ── Create shoot sheet ── */
const EMPTY_SHOOT = {
  photographer_name: '', photographer_site: '', photographer_email: '',
  photographer_phone: '', photographer_telegram: '', dialog_url: '',
  shoot_date: '', location: '', rate: '', currency: 'EUR',
  status: 'negotiating', notes: '',
};
const STATUSES_CREATE = ['negotiating', 'confirmed', 'done', 'cancelled'];

function CreateShootSheet({ open, onClose, modelId, onCreated }) {
  const { t } = useLang();
  const [form, setForm] = useState(EMPTY_SHOOT);
  const [saving, setSaving] = useState(false);

  function f(key, val) { setForm(p => ({ ...p, [key]: val })); }

  async function save() {
    if (!form.photographer_name.trim()) return;
    setSaving(true);
    try {
      const shoot = await api.post('/api/shoots', {
        model_id: modelId,
        ...form,
        rate: form.rate ? parseFloat(form.rate) : null,
        shoot_date: form.shoot_date || null,
      });
      setForm(EMPTY_SHOOT);
      onCreated(shoot);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Новая съёмка">
      <div style={{ overflowY: 'auto', maxHeight: '72vh', display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div className="list-section-title" style={{ marginBottom: 6 }}>Фотограф</div>
        {[
          { key: 'photographer_name',     label: 'Имя *',    ph: 'Имя фотографа' },
          { key: 'photographer_site',     label: 'Площадка', ph: 'PurplePort / Model-Kartei...' },
          { key: 'photographer_email',    label: 'Email',    ph: 'email@example.com', type: 'email' },
          { key: 'photographer_phone',    label: 'Телефон',  ph: '+49 ...',           type: 'tel' },
          { key: 'photographer_telegram', label: 'Telegram', ph: '@username' },
          { key: 'dialog_url',            label: 'Диалог',   ph: 'https://...' },
        ].map(fi => (
          <div className="input-group" key={fi.key}>
            <div className="input-label">{fi.label}</div>
            <input type={fi.type || 'text'} value={form[fi.key]}
              onChange={e => f(fi.key, e.target.value)} placeholder={fi.ph} />
          </div>
        ))}

        <div className="list-section-title" style={{ margin: '12px 0 6px' }}>Съёмка</div>
        <div className="input-group">
          <div className="input-label">Дата</div>
          <input type="date" value={form.shoot_date} onChange={e => f('shoot_date', e.target.value)} />
        </div>
        <div className="input-group">
          <div className="input-label">Локация</div>
          <input value={form.location} onChange={e => f('location', e.target.value)} placeholder="Город, место" />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="input-group" style={{ flex: 1 }}>
            <div className="input-label">Ставка</div>
            <input type="number" value={form.rate} onChange={e => f('rate', e.target.value)} placeholder="0" />
          </div>
          <div className="input-group" style={{ width: 84 }}>
            <div className="input-label">Валюта</div>
            <select value={form.currency} onChange={e => f('currency', e.target.value)}>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
              <option value="PLN">PLN</option>
            </select>
          </div>
        </div>
        <div className="input-group">
          <div className="input-label">Статус</div>
          <select value={form.status} onChange={e => f('status', e.target.value)}>
            {STATUSES_CREATE.map(s => <option key={s} value={s}>{t(`shoots.statusLabels.${s}`)}</option>)}
          </select>
        </div>
        <div className="input-group">
          <div className="input-label">Заметки</div>
          <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={2} placeholder="Условия, детали..." />
        </div>
      </div>
      <button
        className="btn btn-primary btn-full"
        style={{ marginTop: 16 }}
        onClick={save}
        disabled={saving || !form.photographer_name.trim()}
      >
        {saving ? '...' : 'Создать съёмку'}
      </button>
    </Sheet>
  );
}
