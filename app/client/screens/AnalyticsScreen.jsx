import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n/useLang.js';

// ─── Models tab (existing) ───────────────────────────────────────────────────

const SERIES = [
  { key: 'sent',   color: '#34c759', i18nKey: 'approvedOnly' },
  { key: 'edited', color: '#ff9f0a', i18nKey: 'edited' },
  { key: 'failed', color: '#ff3b30', i18nKey: 'failed' },
];

const CHAT_SERIES = [
  { key: 'approved', color: '#34c759', label: 'Апрув' },
  { key: 'edited',   color: '#ff9f0a', label: 'Редаговано' },
  { key: 'skipped',  color: '#636366', label: 'Пропущено' },
];

function formatBucket(bucket, period) {
  const d = new Date(bucket);
  if (period === 'day')  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (period === 'year') return d.toLocaleDateString([], { month: 'short' });
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function Chart({ data, period, chartType, series }) {
  const W = 340, H = 180, PAD = { top: 12, right: 8, bottom: 28, left: 32 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  if (!data.length) return null;

  const keys = series.map(s => s.key);
  const maxVal = Math.max(1, ...data.map(d => keys.reduce((sum, k) => sum + (d[k] || 0), 0)));
  const yStep = Math.ceil(maxVal / 4);
  const yMax  = yStep * 4;

  const xSlotW = innerW / data.length;
  const BAR_PAD = Math.max(2, xSlotW * 0.15);
  const barW = Math.max(4, xSlotW - BAR_PAD * 2);

  function xCenter(i) { return PAD.left + i * xSlotW + xSlotW / 2; }
  function yPx(val)   { return PAD.top + innerH - (val / yMax) * innerH; }

  const bars = data.map((d, i) => {
    const cx = PAD.left + i * xSlotW + BAR_PAD;
    let base = 0;
    return series.map(({ key, color }) => {
      const val = d[key] || 0;
      const y = yPx(base + val);
      const h = (val / yMax) * innerH;
      base += val;
      return { cx, y, h: Math.max(0, h), barW, color };
    });
  });

  const lines = series.map(({ key, color }) => {
    const pts  = data.map((d, i) => [xCenter(i), yPx(d[key] || 0)]);
    const path = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
    return { path, color, pts };
  });

  const yLabels = [0, 1, 2, 3, 4].map(i => ({ val: yStep * i, y: yPx(yStep * i) }));
  const step    = Math.ceil(data.length / 7);
  const xLabels = data
    .map((d, i) => ({ i, label: formatBucket(d.bucket, period) }))
    .filter((_, i) => i % step === 0 || i === data.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {yLabels.map(({ val, y }) => (
        <g key={val}>
          <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
            stroke="var(--separator)" strokeWidth={0.5} strokeDasharray="3,3" />
          <text x={PAD.left - 4} y={y + 4} textAnchor="end" fill="var(--text3)" fontSize={9}>{val}</text>
        </g>
      ))}
      {xLabels.map(({ i, label }) => (
        <text key={i} x={xCenter(i)} y={H - 4} textAnchor="middle" fill="var(--text3)" fontSize={9}>{label}</text>
      ))}
      {chartType === 'bar'
        ? bars.map((segs, i) => segs.map(({ cx, y, h, barW, color }, si) =>
            h > 0 && <rect key={`${i}-${si}`} x={cx} y={y} width={barW} height={h} fill={color} rx={2} />
          ))
        : lines.map(({ path, color, pts }) => (
            <g key={color}>
              <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3} fill={color} />)}
            </g>
          ))
      }
    </svg>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      flex: 1, background: 'var(--bg2)', borderRadius: 12, padding: '12px 6px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      border: `1.5px solid ${color}33`,
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.3 }}>{label}</div>
    </div>
  );
}

// ─── Models Tab ──────────────────────────────────────────────────────────────
function ModelsTab({ period, chartType, setChartType }) {
  const { t } = useLang();
  const [model, setModel] = useState('all');
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const offset = -new Date().getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const h = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const m = String(Math.abs(offset) % 60).padStart(2, '0');
    const tz = `${sign}${h}:${m}`;
    let url = `/api/analytics?period=${period}&tz=${encodeURIComponent(tz)}`;
    if (model !== 'all') url += `&model=${encodeURIComponent(model)}`;
    api.get(url).then(setData).finally(() => setLoading(false));
  }, [period, model]);

  useEffect(() => { load(); }, [load]);

  const models = data?.models || [];

  if (loading) return <div className="loader"><div className="spinner" /></div>;
  if (!data) return null;

  return (
    <div style={{ padding: '0 16px' }}>
      {/* Model selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {['all', ...models].map(m => (
          <button key={m} onClick={() => setModel(m)} style={{
            padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500,
            border: 'none', cursor: 'pointer', flexShrink: 0,
            background: model === m ? 'var(--accent)' : 'var(--bg3)',
            color: model === m ? '#fff' : 'var(--text2)',
          }}>
            {m === 'all' ? t('analytics.allModels') : m}
          </button>
        ))}
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
        <StatCard label={t('analytics.seen')}        value={data.totals.seen}     color="var(--accent)" />
        <StatCard label={t('analytics.sent')}        value={data.totals.sent}     color="#34c759" />
        <StatCard label={t('analytics.approvedOnly')} value={data.totals.approved} color="#30d158" />
        <StatCard label={t('analytics.edited')}      value={data.totals.edited}   color="#ff9f0a" />
        <StatCard label={t('analytics.skipped')}     value={data.totals.skipped}  color="#636366" />
        <StatCard label={t('analytics.errors')}      value={data.totals.errors}   color="#ff3b30" />
      </div>

      {/* Chart */}
      <div style={{ background: 'var(--bg2)', borderRadius: 16, padding: '16px 12px 12px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 12 }}>
          {[{ key: 'bar', label: t('analytics.bar') }, { key: 'line', label: t('analytics.line') }].map(({ key, label }) => (
            <button key={key} onClick={() => setChartType(key)} style={{
              padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
              border: 'none', cursor: 'pointer',
              background: chartType === key ? 'var(--accent)' : 'var(--bg3)',
              color: chartType === key ? '#fff' : 'var(--text2)',
            }}>{label}</button>
          ))}
        </div>
        {data.chart.length === 0
          ? <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 14, padding: '32px 0' }}>{t('analytics.noData')}</div>
          : <Chart data={data.chart} period={period} chartType={chartType} series={SERIES} />
        }
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12, justifyContent: 'center' }}>
          {SERIES.map(({ key, color, i18nKey }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text2)' }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
              {t(`analytics.${i18nKey}`)}
            </div>
          ))}
        </div>
      </div>

      {/* Error log */}
      {data.errorLog?.length > 0 && (
        <div style={{ background: 'var(--bg2)', borderRadius: 16, padding: '14px 14px 10px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#ff3b30', marginBottom: 10 }}>{t('analytics.lastErrors')}</div>
          {data.errorLog.slice(0, 10).map((e, i) => (
            <div key={i} style={{
              fontSize: 12, padding: '6px 0',
              borderBottom: i < data.errorLog.length - 1 ? '1px solid var(--separator)' : 'none',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: 'var(--text1)', fontWeight: 500 }}>{e.photographer}</span>
                <span style={{ color: 'var(--text3)' }}> ({e.site}{e.model_name ? `, ${e.model_name}` : ''})</span>
                {e.error_message && (
                  <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.error_message}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{formatTime(e.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Chats Tab ───────────────────────────────────────────────────────────────
function ChatsTab({ period, chartType, setChartType }) {
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const offset = -new Date().getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const h = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const m = String(Math.abs(offset) % 60).padStart(2, '0');
    const tz = `${sign}${h}:${m}`;
    api.get(`/api/analytics/chats?period=${period}&tz=${encodeURIComponent(tz)}`).then(setData).finally(() => setLoading(false));
  }, [period]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="loader"><div className="spinner" /></div>;
  if (!data) return null;

  const { totals, chart, learning, allTime } = data;
  const approvalRate = totals.total > 0
    ? Math.round((totals.approved / totals.total) * 100)
    : null;

  return (
    <div style={{ padding: '0 16px' }}>
      {/* All-time AI accuracy banner */}
      {allTime.total > 0 && (
        <div style={{
          background: 'var(--bg2)', borderRadius: 16, padding: '14px 16px', marginBottom: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>ІІ — апруви за весь час</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              {allTime.approved} апрув · {allTime.edited} редаговано · {allTime.skipped} пропущено · {allTime.total} всього
            </div>
          </div>
          <div style={{
            fontSize: 26, fontWeight: 800,
            color: allTime.rate >= 60 ? '#34c759' : allTime.rate >= 30 ? '#ff9f0a' : '#ff3b30',
          }}>
            {allTime.rate}%
          </div>
        </div>
      )}

      {/* Period stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
        <StatCard label="Всього" value={totals.total}    color="var(--accent)" />
        <StatCard label="Апрув"  value={totals.approved} color="#34c759" />
        <StatCard label={approvalRate !== null ? `${approvalRate}% апруву` : 'Редаговано'} value={totals.edited} color="#ff9f0a" />
        <StatCard label="Пропущено" value={totals.skipped} color="#636366" />
        <StatCard label="Очікує"   value={totals.pending} color="var(--text3)" />
      </div>

      {/* Chart */}
      <div style={{ background: 'var(--bg2)', borderRadius: 16, padding: '16px 12px 12px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 12 }}>
          {[{ key: 'bar', label: 'Стовпці' }, { key: 'line', label: 'Лінії' }].map(({ key, label }) => (
            <button key={key} onClick={() => setChartType(key)} style={{
              padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
              border: 'none', cursor: 'pointer',
              background: chartType === key ? 'var(--accent)' : 'var(--bg3)',
              color: chartType === key ? '#fff' : 'var(--text2)',
            }}>{label}</button>
          ))}
        </div>
        {chart.length === 0
          ? <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 14, padding: '32px 0' }}>Немає даних за цей період</div>
          : <Chart data={chart} period={period} chartType={chartType} series={CHAT_SERIES} />
        }
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12, justifyContent: 'center' }}>
          {CHAT_SERIES.map(({ key, color, label }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text2)' }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* AI Learning log */}
      {learning?.length > 0 && (
        <div style={{ background: 'var(--bg2)', borderRadius: 16, padding: '14px 14px 10px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#ff9f0a', marginBottom: 10 }}>
            🧠 Навчання ІІ — відредаговані відповіді
          </div>
          {learning.map((r, i) => (
            <div key={r.id} style={{
              fontSize: 12, padding: '8px 0',
              borderBottom: i < learning.length - 1 ? '1px solid var(--separator)' : 'none',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 500, color: 'var(--text1)' }}>{r.sender_name}</span>
                <span style={{ color: 'var(--text3)', fontSize: 11 }}>{formatDate(r.created_at)}</span>
              </div>
              {/* Toggle expand */}
              <div
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                style={{ cursor: 'pointer', color: 'var(--accent)', fontSize: 11, marginBottom: 4 }}
              >
                {expanded === r.id ? '▲ Сховати' : '▼ Показати черновик vs відправлено'}
              </div>
              {expanded === r.id && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: '#ff3b30', fontWeight: 600, marginBottom: 3 }}>🤖 ІІ запропонував:</div>
                    <div style={{ color: 'var(--text2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{r.ai_draft}</div>
                  </div>
                  <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: '#34c759', fontWeight: 600, marginBottom: 3 }}>✅ Менеджер відправив:</div>
                    <div style={{ color: 'var(--text1)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{r.manager_sent}</div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function AnalyticsScreen() {
  const { t } = useLang();
  const [tab, setTab]           = useState('models'); // models | chats
  const [period, setPeriod]     = useState('week');
  const [chartType, setChartType] = useState('bar');

  const periods = ['day', 'week', 'month', 'year'];

  const btnBase = (active) => ({
    flex: 1, padding: '7px 4px', borderRadius: 10, fontSize: 13, fontWeight: 500,
    border: 'none', cursor: 'pointer',
    background: active ? 'var(--accent)' : 'var(--bg2)',
    color: active ? '#fff' : 'var(--text2)',
  });

  return (
    <div className="screen">
      <div style={{ padding: '16px 16px 0' }}>
        {/* Tab selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <button onClick={() => setTab('models')} style={{
            flex: 1, padding: '8px', borderRadius: 12, fontSize: 14, fontWeight: 600,
            border: 'none', cursor: 'pointer',
            background: tab === 'models' ? 'var(--accent)' : 'var(--bg3)',
            color: tab === 'models' ? '#fff' : 'var(--text2)',
          }}>
            {t('nav.models')}
          </button>
          <button onClick={() => setTab('chats')} style={{
            flex: 1, padding: '8px', borderRadius: 12, fontSize: 14, fontWeight: 600,
            border: 'none', cursor: 'pointer',
            background: tab === 'chats' ? 'var(--accent)' : 'var(--bg3)',
            color: tab === 'chats' ? '#fff' : 'var(--text2)',
          }}>
            {t('nav.chats')}
          </button>
        </div>

        {/* Period toggles */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {periods.map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={btnBase(period === p)}>
              {t(`analytics.${p}`)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'models'
        ? <ModelsTab period={period} chartType={chartType} setChartType={setChartType} />
        : <ChatsTab  period={period} chartType={chartType} setChartType={setChartType} />
      }
    </div>
  );
}
