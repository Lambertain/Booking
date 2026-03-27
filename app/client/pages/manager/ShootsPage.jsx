import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useLang } from '../../i18n/useLang.js';

export default function ShootsPage({ user }) {
  const { t } = useLang();
  const [shoots, setShoots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.get('/api/shoots').then(setShoots).finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? shoots : shoots.filter(s => s.status === filter);

  async function updateStatus(id, status) {
    const updated = await api.patch(`/api/shoots/${id}`, { status });
    setShoots(s => s.map(x => x.id === id ? { ...x, ...updated } : x));
  }

  if (loading) return <div className="loader">{t('loading')}</div>;

  const statuses = ['all', 'negotiating', 'confirmed', 'done', 'cancelled'];

  return (
    <div>
      <div className="page-title">{t('shoots.title')}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {statuses.map(s => (
          <button key={s} className={filter === s ? 'btn-primary' : 'btn-ghost'}
                  style={{ fontSize: 12, padding: '5px 12px' }}
                  onClick={() => setFilter(s)}>
            {s === 'all' ? t('shoots.all') : t(`shoots.statusLabels.${s}`)}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('shoots.photographer')}</th>
              <th>{t('shoots.model')}</th>
              <th>{t('shoots.site')}</th>
              <th>{t('shoots.date')}</th>
              <th>{t('shoots.location')}</th>
              <th>{t('shoots.rate')}</th>
              <th>{t('shoots.status')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id}>
                <td>
                  {s.dialog_url
                    ? <a href={s.dialog_url} target="_blank" rel="noreferrer">{s.photographer_name}</a>
                    : s.photographer_name}
                </td>
                <td style={{ color: 'var(--text2)' }}>{s.model_name}</td>
                <td style={{ color: 'var(--text2)' }}>{s.photographer_site || '—'}</td>
                <td style={{ color: 'var(--text2)' }}>{s.shoot_date ? s.shoot_date.slice(0, 10) : '—'}</td>
                <td style={{ color: 'var(--text2)' }}>{s.location || '—'}</td>
                <td style={{ color: 'var(--text2)' }}>{s.rate ? `${s.rate} ${s.currency}` : '—'}</td>
                <td>
                  <span className={`badge badge-${s.status}`}>
                    {t(`shoots.statusLabels.${s.status}`)}
                  </span>
                </td>
                <td>
                  {s.status !== 'done' && s.status !== 'cancelled' && (user?.role === 'admin' || user?.role === 'manager') && (
                    <select value={s.status} style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
                            onChange={e => updateStatus(s.id, e.target.value)}>
                      {['negotiating','confirmed','done','cancelled'].map(st => (
                        <option key={st} value={st}>{t(`shoots.statusLabels.${st}`)}</option>
                      ))}
                    </select>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ color: 'var(--text2)', textAlign: 'center', padding: 32 }}>
                {t('shoots.empty')}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
