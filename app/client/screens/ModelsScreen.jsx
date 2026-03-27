import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n/useLang.js';
import Avatar from '../components/Avatar.jsx';
import ModelDetail from './ModelDetail.jsx';

export default function ModelsScreen({ user }) {
  const { t } = useLang();
  const [models, setModels] = useState([]);
  const [shoots, setShoots] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/users?role=model'),
      api.get('/api/shoots'),
    ]).then(([u, s]) => {
      setModels(u);
      setShoots(s);
    }).finally(() => setLoading(false));
  }, []);

  if (selected) {
    const modelShoots = shoots.filter(s => s.model_id === selected.id);
    return (
      <ModelDetail
        model={selected}
        shoots={modelShoots}
        onBack={() => setSelected(null)}
        canEdit={user.role === 'admin' || user.role === 'manager'}
        onShootUpdated={updated => setShoots(s => s.map(x => x.id === updated.id ? updated : x))}
      />
    );
  }

  if (loading) return <div className="loader"><div className="spinner" />{t('loading')}</div>;

  return (
    <div className="screen">
      <div style={{ padding: '16px 16px 0', paddingTop: 'calc(var(--topbar-h) + 16px)' }}>
        <h1 style={{ marginBottom: 16 }}>{t('nav.models')}</h1>
      </div>
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 24 }}>
        {models.map(m => {
          const count = shoots.filter(s => s.model_id === m.id).length;
          const upcoming = shoots.filter(s => s.model_id === m.id && s.shoot_date && new Date(s.shoot_date) >= new Date() && s.status !== 'cancelled').length;
          return (
            <div key={m.id} className="model-card" onClick={() => setSelected(m)}>
              <Avatar name={m.name} size={52} />
              <div className="model-card-info">
                <div className="model-card-name">{m.display_name || m.name}</div>
                <div className="model-card-stats">
                  {count} {t('shoots.title').toLowerCase()}
                  {upcoming > 0 && <span style={{ color: 'var(--green)' }}> · {upcoming} {t('shoots.upcoming')}</span>}
                </div>
              </div>
              <span className="chevron" />
            </div>
          );
        })}
        {models.length === 0 && (
          <div className="empty">
            <div className="empty-icon">👤</div>
            <div className="empty-title">{t('models.empty')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
