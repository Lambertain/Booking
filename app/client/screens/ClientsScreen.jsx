import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n/useLang.js';
import Sheet from '../components/Sheet.jsx';
import OrderSheet from '../components/OrderSheet.jsx';
import TemplateSheet from '../components/TemplateSheet.jsx';
import SubscriberSheet from '../components/SubscriberSheet.jsx';
import TagManagerSheet from '../components/TagManagerSheet.jsx';
import Avatar from '../components/Avatar.jsx';

const ORDER_STATUSES = ['all', 'new', 'in_progress', 'done', 'cancelled'];

const STATUS_COLORS = {
  new: 'var(--accent)',
  in_progress: 'var(--orange)',
  done: 'var(--green)',
  cancelled: 'var(--text3)',
};

const STEP_COLORS = {
  'В работе': 'var(--accent)',
  'Удалить': 'var(--red)',
  'Готово': 'var(--green)',
};

// Maps DB value (Russian) → locale key under templates.stepLabels
const STEP_LABEL_KEY = { 'В работе': 'inWork', 'Готово': 'done', 'Удалить': 'delete' };

function fmt(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function ClientsScreen({ user }) {
  const { t } = useLang();
  const [tab, setTab] = useState('mailings');
  const [orders, setOrders] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [clients, setClients] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Contacts tab state
  const [subscribers, setSubscribers] = useState([]);
  const [allTagsList, setAllTagsList] = useState([]);
  const [subSearch, setSubSearch] = useState('');
  const [subStatus, setSubStatus] = useState('active');
  const [subLoading, setSubLoading] = useState(false);
  const [selectedSub, setSelectedSub] = useState(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);

  // Filter state
  const [orderFilter, setOrderFilter] = useState('all');
  const [stepFilter, setStepFilter] = useState('all');

  // Sheet state
  const [orderSheet, setOrderSheet] = useState(false);
  const [templateSheet, setTemplateSheet] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  // Create forms
  const [orderForm, setOrderForm] = useState({
    user_id: '', order_type: 'rent', rental_start: '', rental_end: '', price: '', notes: '',
  });
  const [templateForm, setTemplateForm] = useState({ name: '', rental_start: '', rental_end: '', deal_type: 'rent' });
  const [templateNameMode, setTemplateNameMode] = useState('select'); // 'select' | 'custom'
  const [editNamesSheet, setEditNamesSheet] = useState(false);
  const [editingName, setEditingName] = useState({ old: '', new: '' });

  const canEdit = user.role === 'admin' || user.role === 'manager';

  const [pickerSubs, setPickerSubs] = useState([]);

  // Localized status labels (computed from locale)
  const STATUS_LABELS = {
    all: t('mailings.statusLabels.all'),
    new: t('mailings.statusLabels.new'),
    in_progress: t('mailings.statusLabels.in_progress'),
    done: t('mailings.statusLabels.done'),
    cancelled: t('mailings.statusLabels.cancelled'),
  };

  function getStepLabel(s) {
    if (s === 'all') return t('templates.stepLabels.all');
    const key = STEP_LABEL_KEY[s];
    return key ? t('templates.stepLabels.' + key) : s;
  }

  async function patchOrderStatus(id, status, e) {
    e.stopPropagation();
    const updated = await api.patch(`/api/orders/${id}`, { status });
    setOrders(os => os.map(x => x.id === id ? { ...x, status: updated.status } : x));
  }

  async function patchTemplateStep(id, deal_step, e) {
    e.stopPropagation();
    const updated = await api.patch(`/api/templates/${id}`, { deal_step });
    setTemplates(ts => ts.map(x => x.id === id ? { ...x, deal_step: updated.deal_step } : x));
  }

  useEffect(() => {
    const loads = [
      api.get('/api/orders'),
      api.get('/api/templates'),
      canEdit ? api.get('/api/orders/clients') : Promise.resolve([]),
      canEdit ? api.get('/api/users') : Promise.resolve([]),
      canEdit ? api.get('/api/broadcast/list?status=active') : Promise.resolve([]),
    ];
    Promise.all(loads).then(([o, tpl, cl, users, subs]) => {
      setOrders(o);
      setTemplates(tpl);
      setClients(cl);
      setAllUsers(Array.isArray(users) ? users : []);
      setPickerSubs(Array.isArray(subs) ? subs : []);
    }).finally(() => setLoading(false));
  }, []);

  function loadSubscribers() {
    if (!canEdit) return;
    setSubLoading(true);
    const q = new URLSearchParams();
    if (subStatus) q.set('status', subStatus);
    if (subSearch.trim()) q.set('search', subSearch.trim());
    api.get(`/api/broadcast/list?${q}`).then(setSubscribers).finally(() => setSubLoading(false));
  }

  function loadTags() {
    api.get('/api/broadcast/tags').then(d => setAllTagsList(d.tags || []));
  }

  useEffect(() => {
    if (tab !== 'contacts' || !canEdit) return;
    loadSubscribers();
    if (allTagsList.length === 0) loadTags();
  }, [tab, subSearch, subStatus]);

  async function createOrder() {
    if (!orderForm.user_id) return;
    const created = await api.post('/api/orders', orderForm);
    setOrders(o => [created, ...o]);
    setOrderSheet(false);
    setOrderForm({ user_id: '', order_type: 'rent', rental_start: '', rental_end: '', price: '', notes: '' });
  }

  async function createTemplate() {
    if (!templateForm.name) return;
    const created = await api.post('/api/templates', templateForm);
    setTemplates(tpl => [created, ...tpl]);
    setTemplateSheet(false);
    setTemplateNameMode('select');
    setTemplateForm({ name: '', rental_start: '', rental_end: '', deal_type: 'rent' });
  }

  // Derived data
  const filteredOrders = orderFilter === 'all'
    ? orders
    : orders.filter(o => o.status === orderFilter);

  const templateSteps = ['all', ...new Set(templates.map(tpl => tpl.deal_step).filter(Boolean))];
  const filteredTemplates = stepFilter === 'all'
    ? templates
    : templates.filter(tpl => tpl.deal_step === stepFilter);

  if (loading) return <div className="loader"><div className="spinner" /></div>;

  const contactFilters = [
    ['active', t('clients.contacts.active')],
    ['blocked', t('clients.contacts.blocked')],
    ['', t('clients.contacts.all')],
  ];

  return (
    <div className="screen">
      <div style={{ padding: '16px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>{t('clients.title')}</h1>
        {canEdit && tab !== 'contacts' && (
          <button
            onClick={() => tab === 'mailings' ? setOrderSheet(true) : setTemplateSheet(true)}
            style={{
              width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: 'var(--accent)', color: '#fff', fontSize: 22, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(10,132,255,0.35)', flexShrink: 0,
            }}
          >+</button>
        )}
      </div>

      {/* Main tabs */}
      <div style={{ padding: '0 16px 8px' }}>
        <div className="segmented">
          <button className={`segmented-btn ${tab === 'mailings' ? 'active' : ''}`} onClick={() => setTab('mailings')}>
            {t('clients.tabs.mailings')} {orders.length > 0 && <span style={{ opacity: 0.6, fontSize: 11 }}>({orders.length})</span>}
          </button>
          <button className={`segmented-btn ${tab === 'templates' ? 'active' : ''}`} onClick={() => setTab('templates')}>
            {t('clients.tabs.templates')} {templates.length > 0 && <span style={{ opacity: 0.6, fontSize: 11 }}>({templates.length})</span>}
          </button>
          {canEdit && (
            <button className={`segmented-btn ${tab === 'contacts' ? 'active' : ''}`} onClick={() => setTab('contacts')}>
              {t('clients.tabs.contacts')}
            </button>
          )}
        </div>
      </div>

      {tab === 'mailings' && (
        <>
          {/* Status filter chips */}
          <div style={{ padding: '0 16px 10px', overflowX: 'auto', display: 'flex', gap: 6, scrollbarWidth: 'none' }}>
            {ORDER_STATUSES.map(s => {
              const count = s === 'all' ? orders.length : orders.filter(o => o.status === s).length;
              return (
                <button
                  key={s}
                  onClick={() => setOrderFilter(s)}
                  style={{
                    flexShrink: 0,
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                    background: orderFilter === s ? (s === 'all' ? 'var(--accent)' : STATUS_COLORS[s]) : 'var(--bg3)',
                    color: orderFilter === s ? '#fff' : 'var(--text2)',
                  }}
                >
                  {STATUS_LABELS[s]} {count > 0 && <span style={{ opacity: 0.8 }}>({count})</span>}
                </button>
              );
            })}
          </div>

          <div style={{ padding: '0 16px 80px' }}>
            {filteredOrders.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">📋</div>
                <div className="empty-title">{t('mailings.empty')}</div>
              </div>
            ) : (
              <div className="card">
                {filteredOrders.map((o, idx) => (
                  <div
                    key={o.id}
                    onClick={() => setSelectedOrder(o)}
                    style={{
                      padding: '12px 16px',
                      cursor: 'pointer',
                      borderBottom: idx < filteredOrders.length - 1 ? '1px solid var(--separator)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <div style={{ fontWeight: 600, fontSize: 15, flex: 1, marginRight: 8 }}>
                        {o.template_name || o.client_name || o.deal_id || '—'}
                      </div>
                      {canEdit ? (
                        <select
                          value={o.status}
                          onClick={e => e.stopPropagation()}
                          onChange={e => patchOrderStatus(o.id, e.target.value, e)}
                          style={{
                            background: STATUS_COLORS[o.status] || 'var(--bg3)',
                            color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                            border: 'none', cursor: 'pointer', appearance: 'none', outline: 'none',
                            width: 'auto', flexShrink: 0,
                          }}
                        >
                          {['new', 'in_progress', 'done', 'cancelled'].map(s => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                      ) : (
                        <span style={{
                          background: STATUS_COLORS[o.status] || 'var(--bg3)',
                          color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                        }}>
                          {STATUS_LABELS[o.status] || o.status}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
                      {o.order_type && <span>{t('mailings.orderTypeLabels.' + o.order_type)}</span>}
                      {o.rental_start && <span>📅 {fmt(o.rental_start)} – {fmt(o.rental_end)}</span>}
                      {o.tour_start_2 && <span>📅 {fmt(o.tour_start_2)} – {fmt(o.tour_end_2)}</span>}
                      {o.price > 0 && <span>💶 {o.price} EUR</span>}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 12, color: 'var(--text2)' }}>
                      {o.contact_name && <span>👤 {o.contact_name}</span>}
                      {o.client_name && o.client_name !== o.contact_name && <span>🏢 {o.client_name}</span>}
                      {o.model_sites && <span>🌐 {o.model_sites}</span>}
                      {o.deal_step && <span style={{ color: 'var(--text3)' }}>{t('mailings.dealStep')}: {o.deal_step}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'templates' && (
        <>
          {/* Step filter chips */}
          <div style={{ padding: '0 16px 10px', overflowX: 'auto', display: 'flex', gap: 6, scrollbarWidth: 'none' }}>
            {templateSteps.map(s => {
              const count = s === 'all' ? templates.length : templates.filter(tpl => tpl.deal_step === s).length;
              const color = s === 'all' ? 'var(--accent)' : (STEP_COLORS[s] || 'var(--accent)');
              return (
                <button
                  key={s}
                  onClick={() => setStepFilter(s)}
                  style={{
                    flexShrink: 0,
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                    background: stepFilter === s ? color : 'var(--bg3)',
                    color: stepFilter === s ? '#fff' : 'var(--text2)',
                  }}
                >
                  {getStepLabel(s)} ({count})
                </button>
              );
            })}
          </div>

          <div style={{ padding: '0 16px 80px' }}>
            {filteredTemplates.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">📄</div>
                <div className="empty-title">{t('templates.empty')}</div>
              </div>
            ) : (
              <div className="card">
                {filteredTemplates.map((tpl, idx) => {
                  const stepColor = STEP_COLORS[tpl.deal_step] || 'var(--accent)';
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => setSelectedTemplate(tpl)}
                      style={{
                        padding: '12px 16px',
                        cursor: 'pointer',
                        borderBottom: idx < filteredTemplates.length - 1 ? '1px solid var(--separator)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                        <div style={{ fontWeight: 600, fontSize: 15, flex: 1, marginRight: 8 }}>{(tpl.name || '').replace(/^Шаблон\s*/i, '')}</div>
                        {canEdit ? (
                          <select
                            value={tpl.deal_step || ''}
                            onClick={e => e.stopPropagation()}
                            onChange={e => patchTemplateStep(tpl.id, e.target.value, e)}
                            style={{
                              background: stepColor, color: '#fff', borderRadius: 6,
                              padding: '2px 8px', fontSize: 11, fontWeight: 600,
                              border: 'none', cursor: 'pointer', appearance: 'none', outline: 'none',
                              width: 'auto', flexShrink: 0,
                            }}
                          >
                            <option value="">—</option>
                            {['В работе', 'Готово', 'Удалить'].map(s => (
                              <option key={s} value={s}>{getStepLabel(s)}</option>
                            ))}
                          </select>
                        ) : tpl.deal_step && (
                          <span style={{
                            background: stepColor, color: '#fff',
                            borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                          }}>
                            {getStepLabel(tpl.deal_step)}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
                        {tpl.rental_end && <span>⏳ {t('to')} {fmt(tpl.rental_end)}</span>}
                        {tpl.price > 0 && <span>💶 {tpl.price} EUR</span>}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 12, color: 'var(--text2)' }}>
                        {tpl.contact_name && <span>👤 {tpl.contact_name}</span>}
                        {tpl.model_sites && <span>🌐 {tpl.model_sites}</span>}
                        {tpl.accesses && <span>🔑 {tpl.accesses.slice(0, 30)}{tpl.accesses.length > 30 ? '…' : ''}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'contacts' && canEdit && (
        <div style={{ padding: '0 16px 80px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              value={subSearch}
              onChange={e => setSubSearch(e.target.value)}
              placeholder={t('clients.contacts.searchPlaceholder')}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-secondary"
              onClick={() => setTagManagerOpen(true)}
              style={{ whiteSpace: 'nowrap' }}
            >
              {t('clients.contacts.tags')}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {contactFilters.map(([s, label]) => (
              <button
                key={s}
                onClick={() => setSubStatus(s)}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                  border: 'none', cursor: 'pointer',
                  background: subStatus === s ? 'var(--accent)' : 'var(--bg3)',
                  color: subStatus === s ? '#fff' : 'var(--text2)',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {subLoading ? (
            <div className="loader"><div className="spinner" /></div>
          ) : subscribers.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">👥</div>
              <div className="empty-title">{t('clients.contacts.empty')}</div>
            </div>
          ) : (
            <div className="card">
              {subscribers.map((sub, idx) => (
                <div
                  key={sub.id}
                  onClick={() => setSelectedSub(sub)}
                  style={{
                    padding: '10px 16px', cursor: 'pointer',
                    borderBottom: idx < subscribers.length - 1 ? '1px solid var(--separator)' : 'none',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}
                >
                  <Avatar name={sub.full_name || sub.username || '?'} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {sub.full_name || '—'}
                      {sub.status === 'blocked' && <span style={{ marginLeft: 6, fontSize: 12 }}>🚫</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                      {sub.username ? `@${sub.username}` : `tg: ${sub.telegram_id}`}
                    </div>
                    {sub.tags?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {sub.tags.slice(0, 4).map(tag => (
                          <span key={tag} style={{
                            background: 'var(--accent-bg)', color: 'var(--accent)',
                            borderRadius: 6, padding: '1px 6px', fontSize: 11,
                          }}>
                            {tag}
                          </span>
                        ))}
                        {sub.tags.length > 4 && (
                          <span style={{ fontSize: 11, color: 'var(--text3)' }}>+{sub.tags.length - 4}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'right', flexShrink: 0 }}>
                    {sub.last_activity_at ? fmt(sub.last_activity_at) : fmt(sub.subscribed_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
            {subscribers.length} {t('clients.contacts.count')}
          </div>
        </div>
      )}

      {/* Subscriber detail/edit sheet */}
      <SubscriberSheet
        subscriber={selectedSub}
        onClose={() => setSelectedSub(null)}
        allTags={allTagsList.map(tg => tg.tag)}
        onUpdated={updated => {
          setSubscribers(ss => ss.map(x => x.id === updated.id ? updated : x));
          setSelectedSub(updated);
        }}
      />

      {/* Tag manager sheet */}
      <TagManagerSheet
        open={tagManagerOpen}
        onClose={() => setTagManagerOpen(false)}
        tags={allTagsList}
        onTagsChanged={() => {
          loadTags();
          loadSubscribers();
        }}
      />


      {/* Create order sheet */}
      <Sheet open={orderSheet} onClose={() => setOrderSheet(false)} title={t('mailings.newOrder')}>
        <div className="input-group">
          <div className="input-label">{t('mailings.client')}</div>
          <select value={orderForm.user_id} onChange={e => setOrderForm(f => ({ ...f, user_id: e.target.value }))}>
            <option value="">{t('mailings.selectClient')}</option>
            {clients.map(c => (
              <option key={c.user_id} value={c.user_id}>
                {c.name}{c.company_name ? ` (${c.company_name})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="input-group">
          <div className="input-label">{t('mailings.orderType')}</div>
          <select value={orderForm.order_type} onChange={e => setOrderForm(f => ({ ...f, order_type: e.target.value }))}>
            <option value="rent">{t('mailings.orderTypeLabels.rent')}</option>
            <option value="sale">{t('mailings.orderTypeLabels.sale')}</option>
          </select>
        </div>
        {orderForm.order_type === 'rent' && (<>
          <div className="input-group">
            <div className="input-label">{t('mailings.rentalStart')}</div>
            <input type="date" value={orderForm.rental_start} onChange={e => setOrderForm(f => ({ ...f, rental_start: e.target.value }))} />
          </div>
          <div className="input-group">
            <div className="input-label">{t('mailings.rentalEnd')}</div>
            <input type="date" value={orderForm.rental_end} onChange={e => setOrderForm(f => ({ ...f, rental_end: e.target.value }))} />
          </div>
        </>)}
        <div className="input-group">
          <div className="input-label">{t('mailings.price')}</div>
          <input type="number" value={orderForm.price} onChange={e => setOrderForm(f => ({ ...f, price: e.target.value }))} />
        </div>
        <div className="input-group">
          <div className="input-label">{t('mailings.notes')}</div>
          <textarea rows={3} value={orderForm.notes} onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} />
        </div>
        <button className="btn btn-primary btn-full" onClick={createOrder}>{t('add')}</button>
      </Sheet>

      {/* Create template sheet */}
      <Sheet open={templateSheet} onClose={() => { setTemplateSheet(false); setTemplateNameMode('select'); }} title={t('templates.newTemplate')}>
        {(() => {
          const existingNames = [...new Set(
            templates.map(tpl => (tpl.name || '').replace(/^Шаблон\s*/i, '').trim()).filter(Boolean)
          )].sort();
          return (
            <>
              <div className="input-group">
                <div className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t('templates.name')}</span>
                  {templateNameMode === 'select' && existingNames.length > 0 && (
                    <button
                      onClick={() => setEditNamesSheet(true)}
                      style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', padding: 0 }}
                    >✏️ Редагувати</button>
                  )}
                </div>
                {templateNameMode === 'select' ? (
                  <select
                    value={templateForm.name}
                    onChange={e => {
                      if (e.target.value === '__custom__') {
                        setTemplateNameMode('custom');
                        setTemplateForm(f => ({ ...f, name: '' }));
                      } else {
                        setTemplateForm(f => ({ ...f, name: e.target.value }));
                      }
                    }}
                  >
                    <option value="">— {t('templates.name')} —</option>
                    {existingNames.map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                    <option value="__custom__">+ Нова назва...</option>
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      autoFocus
                      value={templateForm.name}
                      onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))}
                      placeholder={t('templates.name')}
                      style={{ flex: 1 }}
                    />
                    <button
                      className="btn btn-secondary"
                      style={{ flexShrink: 0, fontSize: 12 }}
                      onClick={() => { setTemplateNameMode('select'); setTemplateForm(f => ({ ...f, name: '' })); }}
                    >←</button>
                  </div>
                )}
              </div>
              <div className="input-group">
                <div className="input-label">{t('mailings.orderType')}</div>
                <select value={templateForm.deal_type} onChange={e => setTemplateForm(f => ({ ...f, deal_type: e.target.value }))}>
                  <option value="rent">{t('mailings.orderTypeLabels.rent')}</option>
                  <option value="sale">{t('mailings.orderTypeLabels.sale')}</option>
                </select>
              </div>
              <div className="input-group">
                <div className="input-label">{t('mailings.rentalStart')}</div>
                <input type="date" value={templateForm.rental_start} onChange={e => setTemplateForm(f => ({ ...f, rental_start: e.target.value }))} />
              </div>
              <div className="input-group">
                <div className="input-label">{t('mailings.rentalEnd')}</div>
                <input type="date" value={templateForm.rental_end} onChange={e => setTemplateForm(f => ({ ...f, rental_end: e.target.value }))} />
              </div>
              <button className="btn btn-primary btn-full" onClick={createTemplate} disabled={!templateForm.name}>{t('add')}</button>
            </>
          );
        })()}
      </Sheet>

      {/* Order detail/edit sheet */}
      <OrderSheet
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        canEdit={canEdit}
        allUsers={allUsers}
        allSubscribers={pickerSubs}
        onUpdated={updated => {
          setOrders(os => os.map(x => x.id === updated.id ? updated : x));
          setSelectedOrder(updated);
        }}
      />

      {/* Edit template names sheet */}
      <Sheet open={editNamesSheet} onClose={() => { setEditNamesSheet(false); setEditingName({ old: '', new: '' }); }} title="Назви шаблонів">
        {(() => {
          const existingNames = [...new Set(
            templates.map(tpl => (tpl.name || '').replace(/^Шаблон\s*/i, '').trim()).filter(Boolean)
          )].sort();
          return (
            <div>
              <div className="card" style={{ marginBottom: 12 }}>
                {existingNames.map(n => (
                  <div key={n} className="list-item">
                    {editingName.old === n ? (
                      <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                        <input
                          autoFocus
                          value={editingName.new}
                          onChange={e => setEditingName(x => ({ ...x, new: e.target.value }))}
                          style={{ flex: 1 }}
                        />
                        <button className="btn btn-primary btn-sm" style={{ fontSize: 12 }} onClick={async () => {
                          if (!editingName.new.trim() || editingName.new === n) { setEditingName({ old: '', new: '' }); return; }
                          // Rename all templates with this name
                          const toRename = templates.filter(t => (t.name || '').replace(/^Шаблон\s*/i, '').trim() === n);
                          await Promise.all(toRename.map(t => api.patch(`/api/templates/${t.id}`, { name: editingName.new.trim() })));
                          setTemplates(ts => ts.map(t => {
                            const tName = (t.name || '').replace(/^Шаблон\s*/i, '').trim();
                            return tName === n ? { ...t, name: editingName.new.trim() } : t;
                          }));
                          setEditingName({ old: '', new: '' });
                        }}>✓</button>
                        <button className="btn btn-secondary btn-sm" style={{ fontSize: 12 }} onClick={() => setEditingName({ old: '', new: '' })}>✕</button>
                      </div>
                    ) : (
                      <>
                        <span style={{ flex: 1, fontSize: 14 }}>{n}</span>
                        <span style={{ fontSize: 12, color: 'var(--text3)', marginRight: 8 }}>
                          {templates.filter(t => (t.name || '').replace(/^Шаблон\s*/i, '').trim() === n).length} шт.
                        </span>
                        <button onClick={() => setEditingName({ old: n, new: n })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 16 }}>✏️</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </Sheet>

      {/* Template detail/edit sheet */}
      <TemplateSheet
        template={selectedTemplate}
        onClose={() => setSelectedTemplate(null)}
        canEdit={canEdit}
        allUsers={allUsers}
        allSubscribers={pickerSubs}
        onUpdated={updated => {
          setTemplates(ts => ts.map(x => x.id === updated.id ? updated : x));
          setSelectedTemplate(updated);
        }}
      />
    </div>
  );
}
