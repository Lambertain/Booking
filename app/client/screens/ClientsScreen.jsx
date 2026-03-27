import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n/useLang.js';
import TopBar from '../components/TopBar.jsx';
import Sheet from '../components/Sheet.jsx';

export default function ClientsScreen({ user }) {
  const { t } = useLang();
  const [tab, setTab] = useState('mailings');
  const [orders, setOrders] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orderSheet, setOrderSheet] = useState(false);
  const [templateSheet, setTemplateSheet] = useState(false);
  const [orderForm, setOrderForm] = useState({ sites: '', regions: '', genres: '', volume: '', price: '', notes: '' });
  const [templateForm, setTemplateForm] = useState({ name: '', content: '', sites: '' });

  const canEdit = user.role === 'admin' || user.role === 'manager';

  useEffect(() => {
    Promise.all([
      api.get('/api/orders'),
      api.get('/api/templates'),
    ]).then(([o, tpl]) => {
      setOrders(o);
      setTemplates(tpl);
    }).finally(() => setLoading(false));
  }, []);

  async function createOrder() {
    const created = await api.post('/api/orders', orderForm);
    setOrders(o => [created, ...o]);
    setOrderSheet(false);
    setOrderForm({ sites: '', regions: '', genres: '', volume: '', price: '', notes: '' });
  }

  async function createTemplate() {
    const created = await api.post('/api/templates', templateForm);
    setTemplates(tpl => [created, ...tpl]);
    setTemplateSheet(false);
    setTemplateForm({ name: '', content: '', sites: '' });
  }

  async function changeOrderStatus(order, status) {
    const updated = await api.patch(`/api/orders/${order.id}`, { status });
    setOrders(o => o.map(x => x.id === updated.id ? updated : x));
  }

  if (loading) return <div className="loader"><div className="spinner" /></div>;

  return (
    <div className="screen">
      <div style={{ padding: '0 16px', paddingTop: 'calc(var(--topbar-h) + 16px)' }}>
        <h1 style={{ margin: '16px 0' }}>{t('clients.title')}</h1>
      </div>

      <div style={{ padding: '0 16px 8px' }}>
        <div className="segmented">
          <button
            className={`segmented-btn ${tab === 'mailings' ? 'active' : ''}`}
            onClick={() => setTab('mailings')}
          >
            📋 {t('clients.tabs.mailings')}
          </button>
          <button
            className={`segmented-btn ${tab === 'templates' ? 'active' : ''}`}
            onClick={() => setTab('templates')}
          >
            📄 {t('clients.tabs.templates')}
          </button>
        </div>
      </div>

      {tab === 'mailings' && (
        <div style={{ padding: '0 16px 24px' }}>
          {canEdit && (
            <button
              className="btn btn-primary btn-full"
              style={{ marginBottom: 12 }}
              onClick={() => setOrderSheet(true)}
            >
              + {t('mailings.newOrder')}
            </button>
          )}

          {orders.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📋</div>
              <div className="empty-title">{t('mailings.empty')}</div>
            </div>
          ) : (
            <div className="card">
              {orders.map(o => (
                <div key={o.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>
                      {o.client_name || t('noData')}
                    </div>
                    {canEdit ? (
                      <select
                        value={o.status}
                        onChange={e => changeOrderStatus(o, e.target.value)}
                        style={{ width: 'auto', padding: '3px 8px', fontSize: 12, borderRadius: 8 }}
                      >
                        {['new', 'in_progress', 'done', 'cancelled'].map(s => (
                          <option key={s} value={s}>{t(`mailings.statusLabels.${s}`)}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`badge badge-${o.status}`}>{t(`mailings.statusLabels.${o.status}`)}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text2)', display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                    {o.target_sites && <span>🌐 {o.target_sites}</span>}
                    {o.target_regions && <span>🗺 {o.target_regions}</span>}
                    {o.volume && <span>📊 {o.volume}</span>}
                    {o.price && <span>💶 {o.price}</span>}
                  </div>
                  {o.notes && <div style={{ fontSize: 13, color: 'var(--text3)' }}>{o.notes}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {new Date(o.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'templates' && (
        <div style={{ padding: '0 16px 24px' }}>
          {canEdit && (
            <button
              className="btn btn-primary btn-full"
              style={{ marginBottom: 12 }}
              onClick={() => setTemplateSheet(true)}
            >
              + {t('templates.newTemplate')}
            </button>
          )}

          {templates.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📄</div>
              <div className="empty-title">{t('templates.empty')}</div>
            </div>
          ) : (
            <div className="card">
              {templates.map(tpl => (
                <div key={tpl.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{tpl.name}</div>
                  {tpl.sites && <div style={{ fontSize: 12, color: 'var(--text3)' }}>🌐 {tpl.sites}</div>}
                  {tpl.content && (
                    <div style={{ fontSize: 13, color: 'var(--text2)', whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'hidden' }}>
                      {tpl.content}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New order sheet */}
      <Sheet open={orderSheet} onClose={() => setOrderSheet(false)} title={t('mailings.newOrder')}>
        {['sites', 'regions', 'genres', 'volume', 'price', 'notes'].map(field => (
          <div className="input-group" key={field}>
            <div className="input-label">{t(`mailings.${field}`) || field}</div>
            <input
              value={orderForm[field]}
              onChange={e => setOrderForm(f => ({ ...f, [field]: e.target.value }))}
              placeholder={t(`mailings.${field}`) || field}
            />
          </div>
        ))}
        <button className="btn btn-primary btn-full" onClick={createOrder}>{t('add')}</button>
      </Sheet>

      {/* New template sheet */}
      <Sheet open={templateSheet} onClose={() => setTemplateSheet(false)} title={t('templates.newTemplate')}>
        <div className="input-group">
          <div className="input-label">{t('templates.name')}</div>
          <input
            value={templateForm.name}
            onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))}
            placeholder={t('templates.name')}
          />
        </div>
        <div className="input-group">
          <div className="input-label">{t('templates.sites')}</div>
          <input
            value={templateForm.sites}
            onChange={e => setTemplateForm(f => ({ ...f, sites: e.target.value }))}
            placeholder="e.g. model-kartei.de, purpleport.com"
          />
        </div>
        <div className="input-group">
          <div className="input-label">{t('templates.content')}</div>
          <textarea
            value={templateForm.content}
            onChange={e => setTemplateForm(f => ({ ...f, content: e.target.value }))}
            rows={6}
            placeholder={t('templates.content')}
          />
        </div>
        <button className="btn btn-primary btn-full" onClick={createTemplate}>{t('add')}</button>
      </Sheet>
    </div>
  );
}
