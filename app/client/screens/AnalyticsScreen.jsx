import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n/useLang.js';
import TopBar from '../components/TopBar.jsx';

const SERIES = [
  { key: 'approved', color: '#34c759' },
  { key: 'edited',   color: '#ff9f0a' },
  { key: 'skipped',  color: '#ff3b30' },
  { key: 'pending',  color: '#636366' },
];

const STAT_COLORS = {
  processed: 'var(--accent)',
  approved:  '#34c759',
  edited:    '#ff9f0a',
  skipped:   '#ff3b30',
};

function formatBucket(bucket, period) {
  const d = new Date(bucket);
  if (period === 'day') {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (period === 'year') {
    return d.toLocaleDateString([], { month: 'short' });
  }
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}

// Pure SVG chart — no external libraries
function Chart({ data, period, chartType }) {
  const W = 340, H = 180, PAD = { top: 12, right: 8, bottom: 28, left: 32 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  if (!data.length) return null;

  const maxVal = Math.max(1, ...data.map(d => d.approved + d.edited + d.skipped + d.pending));
  const yStep = Math.ceil(maxVal / 4);
  const yMax = yStep * 4;

  const xSlotW = innerW / data.length;
  const BAR_PAD = Math.max(2, xSlotW * 0.15);
  const barW = Math.max(4, xSlotW - BAR_PAD * 2);

  function xCenter(i) { return PAD.left + i * xSlotW + xSlotW / 2; }
  function yPx(val) { return PAD.top + innerH - (val / yMax) * innerH; }

  // Build stacked bar segments or line paths per series
  const bars = data.map((d, i) => {
    const cx = PAD.left + i * xSlotW + BAR_PAD;
    let base = 0;
    return SERIES.map(({ key, color }) => {
      const val = d[key] || 0;
      const y = yPx(base + val);
      const h = (val / yMax) * innerH;
      base += val;
      return { cx, y, h: Math.max(0, h), barW, color, val };
    });
  });

  const lines = SERIES.map(({ key, color }) => {
    const pts = data.map((d, i) => [xCenter(i), yPx(d[key] || 0)]);
    const path = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
    return { path, color, pts };
  });

  // Y-axis labels
  const yLabels = [0, 1, 2, 3, 4].map(i => ({
    val: Math.round((yStep * i)),
    y: yPx(yStep * i),
  }));

  // X-axis labels: show max 7
  const step = Math.ceil(data.length / 7);
  const xLabels = data
    .map((d, i) => ({ i, label: formatBucket(d.bucket, period) }))
    .filter((_, i) => i % step === 0 || i === data.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {/* Grid lines */}
      {yLabels.map(({ val, y }) => (
        <g key={val}>
          <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
            stroke="var(--separator)" strokeWidth={0.5} strokeDasharray="3,3" />
          <text x={PAD.left - 4} y={y + 4} textAnchor="end"
            fill="var(--text3)" fontSize={9}>{val}</text>
        </g>
      ))}

      {/* X labels */}
      {xLabels.map(({ i, label }) => (
        <text key={i} x={xCenter(i)} y={H - 4} textAnchor="middle"
          fill="var(--text3)" fontSize={9}>{label}</text>
      ))}

      {/* Bars or Lines */}
      {chartType === 'bar'
        ? bars.map((segments, i) =>
            segments.map(({ cx, y, h, barW, color }, si) =>
              h > 0 && (
                <rect key={`${i}-${si}`} x={cx} y={y} width={barW} height={h}
                  fill={color} rx={2} />
              )
            )
          )
        : lines.map(({ path, color, pts }) => (
            <g key={color}>
              <path d={path} fill="none" stroke={color} strokeWidth={2}
                strokeLinejoin="round" strokeLinecap="round" />
              {pts.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={3} fill={color} />
              ))}
            </g>
          ))
      }
    </svg>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      flex: 1, background: 'var(--bg2)', borderRadius: 12, padding: '12px 10px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      border: `1.5px solid ${color}22`,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>{label}</div>
    </div>
  );
}

export default function AnalyticsScreen() {
  const { t } = useLang();
  const [period, setPeriod] = useState('week');
  const [chartType, setChartType] = useState('bar');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Convert IANA timezone to UTC offset for the query
    const offset = -new Date().getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const h = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const m = String(Math.abs(offset) % 60).padStart(2, '0');
    const tzParam = `${sign}${h}:${m}`;

    api.get(`/api/analytics?period=${period}&tz=${encodeURIComponent(tzParam)}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const periods = ['day', 'week', 'month', 'year'];
  const chartTypes = [
    { key: 'bar',  label: t('analytics.bar') },
    { key: 'line', label: t('analytics.line') },
  ];

  return (
    <div className="screen">
      <TopBar title={t('analytics.title')} />
      <div style={{ paddingTop: 'var(--topbar-h)', padding: 'calc(var(--topbar-h) + 12px) 16px 24px' }}>

        {/* Period toggles */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {periods.map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              flex: 1, padding: '7px 4px', borderRadius: 10, fontSize: 13, fontWeight: 500,
              border: 'none', cursor: 'pointer',
              background: period === p ? 'var(--accent)' : 'var(--bg2)',
              color: period === p ? '#fff' : 'var(--text2)',
            }}>
              {t(`analytics.${p}`)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loader"><div className="spinner" /></div>
        ) : !data ? null : (
          <>
            {/* Summary cards */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <StatCard label={t('analytics.totalProcessed')} value={data.totals.processed} color="var(--accent)" />
              <StatCard label={t('analytics.totalApproved')}  value={data.totals.approved}  color="#34c759" />
              <StatCard label={t('analytics.totalEdited')}    value={data.totals.edited}    color="#ff9f0a" />
              <StatCard label={t('analytics.totalSkipped')}   value={data.totals.skipped}   color="#ff3b30" />
            </div>

            {/* Chart card */}
            <div style={{ background: 'var(--bg2)', borderRadius: 16, padding: '16px 12px 12px' }}>
              {/* Chart type toggle */}
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

              {/* Legend */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12, justifyContent: 'center' }}>
                {SERIES.map(({ key, color }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text2)' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
                    {t(`analytics.${key}`)}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
