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

  // For model role — only show own profile
  const isModel = user.role === 'model';

  useEffect(() => {
    const modelsUrl = isModel ? '/api/users?role=model' : '/api/users?role=model';
    Promise.all([
      api.get(modelsUrl),
      api.get('/api/shoots'),
    ]).then(([u, s]) => {
      // Filter out users without proper agency_models entry (no slug)
      const valid = u.filter(m => m.slug || m.display_name || m.name !== 'ana-v');
      setModels(valid);
      setShoots(s);
      // Model role: auto-open own profile
      if (isModel) {
        const own = valid.find(m => m.id === user.id);
        if (own) setSelected(own);
      }
    }).finally(() => setLoading(false));
  }, []);

  if (selected) {
    const modelShoots = shoots.filter(s => s.model_id === selected.id);
    return (
      <ModelDetail
        model={selected}
        shoots={modelShoots}
        onBack={isModel ? null : () => setSelected(null)}
        canEdit={user.role === 'admin' || user.role === 'manager'}
        onShootUpdated={updated => setShoots(s => s.map(x => x.id === updated.id ? updated : x))}
        onModelUpdated={updated => setModels(m => m.map(x => x.id === updated.id ? { ...x, ...updated } : x))}
      />
    );
  }

  if (loading) return <div className="loader"><div className="spinner" /></div>;

  return (
    <div className="screen">
      <div style={{ padding: '16px 16px 8px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>{t('nav.models')}</h1>
      </div>
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 24 }}>
        {models.map(m => {
          const count = shoots.filter(s => s.model_id === m.id).length;
          const upcoming = shoots.filter(s => s.model_id === m.id && s.shoot_date && new Date(s.shoot_date) >= new Date() && s.status !== 'cancelled').length;
          return (
            <div key={m.id} className="model-card" onClick={() => setSelected(m)}>
              <Avatar name={m.display_name || m.name} size={52} />
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
            <div className="empty-icon" style={{ fontSize: 48, marginBottom: 12 }}>—</div>
            <div className="empty-title">{t('models.empty')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
