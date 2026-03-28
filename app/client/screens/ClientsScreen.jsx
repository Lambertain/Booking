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
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orderSheet, setOrderSheet] = useState(false);
  const [templateSheet, setTemplateSheet] = useState(false);
  const [orderForm, setOrderForm] = useState({
    user_id: '', sites: '', regions: '', volume: '', price: '',
    notes: '', order_type: 'rent', rental_start: '', rental_end: '',
  });
  const [templateForm, setTemplateForm] = useState({ name: '', rental_start: '', rental_end: '' });

  const canEdit = user.role === 'admin' || user.role === 'manager';

  useEffect(() => {
    Promise.all([
      api.get('/api/orders'),
      api.get('/api/templates'),
      canEdit ? api.get('/api/orders/clients') : Promise.resolve([]),
    ]).then(([o, tpl, cl]) => {
      setOrders(o);
      setTemplates(tpl);
      setClients(cl);
    }).finally(() => setLoading(false));
  }, []);

  async function createOrder() {
    if (!orderForm.user_id) return;
    const created = await api.post('/api/orders', orderForm);
    setOrders(o => [created, ...o]);
    setOrderSheet(false);
    setOrderForm({ user_id: '', sites: '', regions: '', volume: '', price: '', notes: '', order_type: 'rent', rental_start: '', rental_end: '' });
  }

  async function createTemplate() {
    if (!templateForm.name) return;
    const created = await api.post('/api/templates', templateForm);
    setTemplates(tpl => [created, ...tpl]);
    setTemplateSheet(false);
    setTemplateForm({ name: '', rental_start: '', rental_end: '' });
  }

  async function changeOrderStatus(order, status) {
    const updated = await api.patch(`/api/orders/${order.id}`, { status });
    setOrders(o => o.map(x => x.id === updated.id ? updated : x));
  }

  function formatDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString();
  }

  if (loading) return <div className="loader"><div className="spinner" /></div>;

  return (
    <div className="screen">
      <div style={{ padding: '16px 16px 8px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>{t('clients.title')}</h1>
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
        <div style={{ padding: '0 16px 80px' }}>
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
                      {o.template_name || o.client_name || o.deal_id || t('noData')}
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
                  <div style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
                    {o.deal_step && <span>📌 {o.deal_step}</span>}
                    {o.order_type && <span>{t(`mailings.orderTypeLabels.${o.order_type}`)}</span>}
                    {o.rental_start && <span>📅 {formatDate(o.rental_start)} – {formatDate(o.rental_end)}</span>}
                    {o.tour_start_2 && <span>📅2 {formatDate(o.tour_start_2)} – {formatDate(o.tour_end_2)}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text2)', display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                    {o.contact_name && <span>👤 {o.contact_name}</span>}
                    {o.contact_email && <span>✉️ {o.contact_email}</span>}
                    {o.client_name && <span>🏢 {o.client_name}</span>}
                    {o.model_sites && <span>🌐 {o.model_sites}</span>}
                    {o.responsible && <span>🧑‍💼 {o.responsible.split(' ')[0]}</span>}
                    {o.price > 0 && <span>💶 {o.price}</span>}
                  </div>
                  {o.notes && <div style={{ fontSize: 13, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>{o.notes}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{formatDate(o.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'templates' && (
        <div style={{ padding: '0 16px 80px' }}>
          {templates.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📄</div>
              <div className="empty-title">{t('templates.empty')}</div>
            </div>
          ) : (
            <div className="card">
              {templates.map(tpl => (
                <div key={tpl.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{tpl.name}</div>
                    {tpl.deal_step && (
                      <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>📌 {tpl.deal_step}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
                    {tpl.rental_end && <span>⏳ до {formatDate(tpl.rental_end)}</span>}
                    {tpl.price > 0 && <span>💶 {tpl.price}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text2)', display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                    {tpl.contact_name && <span>👤 {tpl.contact_name}</span>}
                    {tpl.contact_email && <span>✉️ {tpl.contact_email}</span>}
                    {tpl.model_sites && <span>🌐 {tpl.model_sites}</span>}
                    {tpl.accesses && <span>🔑 {tpl.accesses}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FAB — changes form based on active tab */}
      {canEdit && (
        <button
          onClick={() => tab === 'mailings' ? setOrderSheet(true) : setTemplateSheet(true)}
          style={{
            position: 'fixed',
            bottom: 'calc(var(--tabbar-h) + 16px)',
            right: 20,
            width: 52, height: 52, borderRadius: '50%',
            border: 'none', cursor: 'pointer',
            background: 'var(--accent)', color: '#fff',
            fontSize: 28, lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(10,132,255,0.4)',
            zIndex: 50,
          }}
        >
          +
        </button>
      )}

      {/* New order sheet */}
      <Sheet open={orderSheet} onClose={() => setOrderSheet(false)} title={t('mailings.newOrder')}>
        <div className="input-group">
          <div className="input-label">{t('mailings.client')}</div>
          <select
            value={orderForm.user_id}
            onChange={e => setOrderForm(f => ({ ...f, user_id: e.target.value }))}
          >
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
          <select
            value={orderForm.order_type}
            onChange={e => setOrderForm(f => ({ ...f, order_type: e.target.value }))}
          >
            <option value="rent">{t('mailings.orderTypeLabels.rent')}</option>
            <option value="sale">{t('mailings.orderTypeLabels.sale')}</option>
          </select>
        </div>

        {orderForm.order_type === 'rent' && (<>
          <div className="input-group">
            <div className="input-label">{t('mailings.rentalStart')}</div>
            <input type="date" value={orderForm.rental_start}
              onChange={e => setOrderForm(f => ({ ...f, rental_start: e.target.value }))} />
          </div>
          <div className="input-group">
            <div className="input-label">{t('mailings.rentalEnd')}</div>
            <input type="date" value={orderForm.rental_end}
              onChange={e => setOrderForm(f => ({ ...f, rental_end: e.target.value }))} />
          </div>
        </>)}

        {['sites', 'regions', 'volume', 'price'].map(field => (
          <div className="input-group" key={field}>
            <div className="input-label">{t(`mailings.${field}`)}</div>
            <input
              value={orderForm[field]}
              onChange={e => setOrderForm(f => ({ ...f, [field]: e.target.value }))}
              placeholder={t(`mailings.${field}`)}
            />
          </div>
        ))}

        <div className="input-group">
          <div className="input-label">{t('mailings.notes')}</div>
          <textarea
            value={orderForm.notes}
            onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))}
            rows={4}
            placeholder={t('mailings.notes')}
            style={{ resize: 'vertical' }}
          />
        </div>

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
          <div className="input-label">{t('mailings.rentalStart')}</div>
          <input type="date" value={templateForm.rental_start}
            onChange={e => setTemplateForm(f => ({ ...f, rental_start: e.target.value }))} />
        </div>
        <div className="input-group">
          <div className="input-label">{t('mailings.rentalEnd')}</div>
          <input type="date" value={templateForm.rental_end}
            onChange={e => setTemplateForm(f => ({ ...f, rental_end: e.target.value }))} />
        </div>
        <button className="btn btn-primary btn-full" onClick={createTemplate}>{t('add')}</button>
      </Sheet>
    </div>
  );
}
