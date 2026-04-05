import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n/useLang.js';

// In chart data, 'sent' = approved-only (non-edited), 'edited' = edited
const SERIES = [
  { key: 'sent',   color: '#34c759', i18nKey: 'approvedOnly' },
  { key: 'edited', color: '#ff9f0a', i18nKey: 'edited' },
  { key: 'failed', color: '#ff3b30', i18nKey: 'failed' },
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

function Chart({ data, period, chartType }) {
  const W = 340, H = 180, PAD = { top: 12, right: 8, bottom: 28, left: 32 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  if (!data.length) return null;

  const maxVal = Math.max(1, ...data.map(d => d.sent + d.edited + d.failed));
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
    return SERIES.map(({ key, color }) => {
      const val = d[key] || 0;
      const y = yPx(base + val);
      const h = (val / yMax) * innerH;
      base += val;
      return { cx, y, h: Math.max(0, h), barW, color };
    });
  });

  const lines = SERIES.map(({ key, color }) => {
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

export default function AnalyticsScreen() {
  const { t } = useLang();
  const [period, setPeriod]       = useState('week');
  const [chartType, setChartType] = useState('bar');
  const [model, setModel]         = useState('all');
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const offset = -new Date().getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const h = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const m = String(Math.abs(offset) % 60).padStart(2, '0');
    const tzParam = `${sign}${h}:${m}`;

    let url = `/api/analytics?period=${period}&tz=${encodeURIComponent(tzParam)}`;
    if (model !== 'all') url += `&model=${encodeURIComponent(model)}`;

    api.get(url).then(setData).finally(() => setLoading(false));
  }, [period, model]);

  useEffect(() => { load(); }, [load]);

  const periods    = ['day', 'week', 'month', 'year'];
  const chartTypes = [
    { key: 'bar',  label: t('analytics.bar') },
    { key: 'line', label: t('analytics.line') },
  ];

  const models = data?.models || [];

  const btnBase = (active) => ({
    flex: 1, padding: '7px 4px', borderRadius: 10, fontSize: 13, fontWeight: 500,
    border: 'none', cursor: 'pointer',
    background: active ? 'var(--accent)' : 'var(--bg2)',
    color: active ? '#fff' : 'var(--text2)',
  });

  return (
    <div className="screen">
      <div style={{ padding: '16px 16px 0' }}>

        {/* Model selector — replaces title */}
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

        {/* Period toggles */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {periods.map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={btnBase(period === p)}>
              {t(`analytics.${p}`)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loader"><div className="spinner" /></div>
      ) : !data ? null : (
        <div style={{ padding: '0 16px' }}>

          {/* 6 stat cards: 3+3 */}
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
              {chartTypes.map(({ key, label }) => (
                <button key={key} onClick={() => setChartType(key)} style={{
                  padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                  border: 'none', cursor: 'pointer',
                  background: chartType === key ? 'var(--accent)' : 'var(--bg3)',
                  color: chartType === key ? '#fff' : 'var(--text2)',
                }}>
                  {label}
                </button>
              ))}
            </div>

            {data.chart.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 14, padding: '32px 0' }}>
                {t('analytics.noData')}
              </div>
            ) : (
              <Chart data={data.chart} period={period} chartType={chartType} />
            )}

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
          {data.errorLog && data.errorLog.length > 0 && (
            <div style={{ background: 'var(--bg2)', borderRadius: 16, padding: '14px 14px 10px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#ff3b30', marginBottom: 10 }}>
                {t('analytics.lastErrors')}
              </div>
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
                  <div style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
                    {formatTime(e.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
