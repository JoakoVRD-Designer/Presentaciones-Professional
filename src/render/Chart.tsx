/**
 * Gráficos SVG sin dependencias. Las animaciones de crecimiento se disparan con
 * las mismas clases que las entradas (.lm-in / .lm-preview), así funcionan
 * igual en el editor, en la presentación y en el HTML exportado.
 */
import type { CSSProperties } from 'react';
import type { ChartElement } from '../core/model';

export const CHART_PALETTE = [
  'var(--lm-primary)',
  'var(--lm-accent)',
  '#ff2bd6',
  '#facc15',
  '#4ade80',
  '#fb923c',
  '#60a5fa',
  '#f472b6',
];

const colorOf = (el: ChartElement, i: number) => el.series[i]?.color || CHART_PALETTE[i % CHART_PALETTE.length];

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

export function formatValue(v: number, el: Pick<ChartElement, 'prefix' | 'suffix'>): string {
  const abs = Math.abs(v);
  const n = abs >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : abs >= 1e4 ? `${+(v / 1e3).toFixed(1)}k` : `${+v.toFixed(2)}`;
  return `${el.prefix}${n}${el.suffix}`;
}

/** Curva suave (Catmull-Rom → Bézier). */
function smoothPath(pts: [number, number][], smooth: boolean): string {
  if (!pts.length) return '';
  if (!smooth || pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = 0.18;
    d += ` C${p1[0] + (p2[0] - p0[0]) * t},${p1[1] + (p2[1] - p0[1]) * t} ${p2[0] - (p3[0] - p1[0]) * t},${p2[1] - (p3[1] - p1[1]) * t} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number): [number, number, number, number, number] {
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  return [x0, y0, x1, y1, a1 - a0 > Math.PI ? 1 : 0];
}

const anim = (i: number): CSSProperties => ({ '--i': i } as CSSProperties);

function Legend({ el, x, y, items }: { el: ChartElement; x: number; y: number; items: { name: string; color: string }[] }) {
  const fs = el.fontSize;
  let cx = x;
  return (
    <g className="lm-chart-legend lm-chart-fade" style={anim(items.length)}>
      {items.map((it, i) => {
        const gx = cx;
        cx += fs * 1.4 + it.name.length * fs * 0.58 + fs * 1.2;
        return (
          <g key={i}>
            <rect x={gx} y={y - fs * 0.55} width={fs * 0.9} height={fs * 0.9} rx={fs * 0.25} style={{ fill: it.color }} />
            <text x={gx + fs * 1.3} y={y} dominantBaseline="middle" style={{ fontSize: fs }}>
              {it.name}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function ChartView({ el }: { el: ChartElement }) {
  const W = Math.max(40, el.w);
  const H = Math.max(40, el.h);
  const fs = el.fontSize;
  const textStyle: CSSProperties = { fill: el.textColor || 'var(--lm-muted)', fontFamily: 'var(--lm-font-body)' };
  const gid = (i: number) => `lmc-${el.id}-${i}`;
  const series = el.series.length ? el.series : [{ name: '', values: [], color: '' }];
  const labels = el.labels;

  /* -------- Circulares -------- */
  if (el.chart === 'donut' || el.chart === 'pie') {
    const values = (series[0].values ?? []).map((v) => Math.max(0, v));
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const legendW = el.showLegend ? Math.min(W * 0.42, fs * 12) : 0;
    const cx = (W - legendW) / 2;
    const cy = H / 2;
    const r = Math.max(10, Math.min(W - legendW, H) / 2 - fs * 0.6);
    const inner = el.chart === 'donut' ? r * (1 - el.thickness * 0.6) : 0;
    let a = -Math.PI / 2;
    return (
      <svg className="lm-chart" viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={textStyle}>
        {values.map((v, i) => {
          const a0 = a;
          const a1 = a + (v / total) * Math.PI * 2 - (values.length > 1 ? 0.012 : 0);
          a += (v / total) * Math.PI * 2;
          const full = v / total >= 0.9999;
          const color = CHART_PALETTE[i % CHART_PALETTE.length];
          let d: string;
          if (full) {
            d = `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0` +
              (inner ? ` M${cx - inner},${cy} a${inner},${inner} 0 1,1 ${2 * inner},0 a${inner},${inner} 0 1,1 ${-2 * inner},0` : '');
          } else {
            const [x0, y0, x1, y1, large] = arc(cx, cy, r, a0, a1);
            if (inner) {
              const [ix1, iy1, ix0, iy0] = arc(cx, cy, inner, a1, a0);
              d = `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${ix1},${iy1} A${inner},${inner} 0 ${large} 0 ${ix0},${iy0} Z`;
            } else {
              d = `M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`;
            }
          }
          const mid = (a0 + a1) / 2;
          const lr = inner ? (r + inner) / 2 : r * 0.62;
          return (
            <g key={i}>
              <path d={d} fillRule="evenodd" className="lm-chart-pop" style={{ ...anim(i), fill: color, transformOrigin: `${cx}px ${cy}px` }} />
              {el.showValues && v / total > 0.04 && (
                <text
                  className="lm-chart-fade"
                  x={cx + lr * Math.cos(mid)}
                  y={cy + lr * Math.sin(mid)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ ...anim(i + values.length), fontSize: fs, fontWeight: 700, fill: '#fff' }}
                >
                  {el.suffix || el.prefix ? formatValue(v, el) : `${Math.round((v / total) * 100)}%`}
                </text>
              )}
            </g>
          );
        })}
        {el.showLegend &&
          labels.map((l, i) => (
            <g key={`lg${i}`} className="lm-chart-fade" style={anim(i + values.length)}>
              <rect x={W - legendW + fs * 0.4} y={cy - (labels.length * fs * 1.6) / 2 + i * fs * 1.6} width={fs * 0.9} height={fs * 0.9} rx={fs * 0.25} style={{ fill: CHART_PALETTE[i % CHART_PALETTE.length] }} />
              <text x={W - legendW + fs * 1.7} y={cy - (labels.length * fs * 1.6) / 2 + i * fs * 1.6 + fs * 0.45} dominantBaseline="middle" style={{ fontSize: fs }}>
                {l}
              </text>
            </g>
          ))}
      </svg>
    );
  }

  /* -------- Cartesianos -------- */
  const n = Math.max(labels.length, ...series.map((s) => s.values.length), 1);
  const all = series.flatMap((s) => s.values);
  const maxV = niceMax(Math.max(0, ...all));
  const minV = Math.min(0, ...all) < 0 ? -niceMax(-Math.min(0, ...all)) : 0;
  const horizontal = el.chart === 'bar';
  const longest = Math.max(0, ...labels.map((l) => l.length));
  const legendH = el.showLegend ? fs * 2 : 0;
  const pad = {
    top: fs * 1.4 + legendH,
    right: horizontal ? fs * 3.5 : fs * 0.8,
    // (las barras negativas dejan su etiqueta a la izquierda del eje)
    bottom: horizontal ? (el.showGrid ? fs * 2 : fs * 0.8) : fs * 2,
    left: horizontal ? Math.min(W * 0.35, longest * fs * 0.6 + fs) : el.showGrid ? fs * 3.2 : fs * 0.5,
  };
  const pw = Math.max(10, W - pad.left - pad.right);
  const ph = Math.max(10, H - pad.top - pad.bottom);
  const span = maxV - minV || 1;
  const vy = (v: number) => pad.top + ph - ((v - minV) / span) * ph; // vertical
  const vx = (v: number) => pad.left + ((v - minV) / span) * pw; // horizontal
  const ticks = 4;
  const group = (horizontal ? ph : pw) / n;

  const grid = el.showGrid
    ? Array.from({ length: ticks + 1 }, (_, t) => {
        const v = minV + (span * t) / ticks;
        return horizontal ? (
          <g key={t}>
            <line x1={vx(v)} x2={vx(v)} y1={pad.top} y2={pad.top + ph} className="lm-chart-grid" />
            <text x={vx(v)} y={pad.top + ph + fs * 1.2} textAnchor="middle" style={{ fontSize: fs * 0.8 }}>
              {formatValue(v, el)}
            </text>
          </g>
        ) : (
          <g key={t}>
            <line x1={pad.left} x2={pad.left + pw} y1={vy(v)} y2={vy(v)} className="lm-chart-grid" />
            <text x={pad.left - fs * 0.5} y={vy(v)} textAnchor="end" dominantBaseline="middle" style={{ fontSize: fs * 0.8 }}>
              {formatValue(v, el)}
            </text>
          </g>
        );
      })
    : null;

  const defs = (
    <defs>
      {series.map((_, i) => (
        <linearGradient key={i} id={gid(i)} x1="0" y1="0" x2={horizontal ? '1' : '0'} y2={horizontal ? '0' : '1'}>
          <stop offset="0" style={{ stopColor: colorOf(el, i), stopOpacity: horizontal ? 0.65 : 1 }} />
          <stop offset="1" style={{ stopColor: colorOf(el, i), stopOpacity: horizontal ? 1 : 0.55 }} />
        </linearGradient>
      ))}
      {series.map((_, i) => (
        <linearGradient key={`a${i}`} id={`${gid(i)}-area`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: colorOf(el, i), stopOpacity: 0.45 }} />
          <stop offset="1" style={{ stopColor: colorOf(el, i), stopOpacity: 0 }} />
        </linearGradient>
      ))}
    </defs>
  );

  let body: React.ReactNode;
  if (el.chart === 'column' || el.chart === 'bar') {
    const bw = (group * el.thickness) / series.length;
    body = series.map((s, si) =>
      Array.from({ length: n }, (_, i) => {
        const v = s.values[i] ?? 0;
        const off = group * i + (group - bw * series.length) / 2 + bw * si;
        const rr = Math.min(bw / 2, fs * 0.45);
        if (horizontal) {
          const x0 = vx(Math.min(0, v));
          const len = Math.abs(vx(v) - vx(0));
          const y = pad.top + off;
          return (
            <g key={`${si}-${i}`}>
              <rect className="lm-chart-grow-x" x={x0} y={y} width={Math.max(0.5, len)} height={bw * 0.92} rx={rr} style={{ ...anim(i + si), fill: `url(#${gid(si)})` }} />
              {el.showValues && (
                <text className="lm-chart-fade" x={vx(v) + (v < 0 ? -fs * 0.4 : fs * 0.4)} y={y + bw * 0.46} textAnchor={v < 0 ? 'end' : 'start'} dominantBaseline="middle" style={{ ...anim(i + si + 4), fontSize: fs * 0.85, fontWeight: 700, fill: el.textColor || 'var(--lm-text)' }}>
                  {formatValue(v, el)}
                </text>
              )}
            </g>
          );
        }
        const y0 = vy(Math.max(0, v));
        const len = Math.abs(vy(v) - vy(0));
        const x = pad.left + off;
        return (
          <g key={`${si}-${i}`}>
            <rect className={v < 0 ? 'lm-chart-grow-down' : 'lm-chart-grow-y'} x={x + bw * 0.04} y={y0} width={bw * 0.92} height={Math.max(0.5, len)} rx={rr} style={{ ...anim(i + si), fill: `url(#${gid(si)})` }} />
            {el.showValues && (
              <text className="lm-chart-fade" x={x + bw / 2} y={vy(v) - (v < 0 ? -fs : fs * 0.45)} textAnchor="middle" style={{ ...anim(i + si + 4), fontSize: fs * 0.85, fontWeight: 700, fill: el.textColor || 'var(--lm-text)' }}>
                {formatValue(v, el)}
              </text>
            )}
          </g>
        );
      }),
    );
  } else {
    body = series.map((s, si) => {
      const pts: [number, number][] = s.values.slice(0, n).map((v, i) => [pad.left + group * i + group / 2, vy(v)]);
      const line = smoothPath(pts, el.smooth);
      const area = pts.length ? `${line} L${pts[pts.length - 1][0]},${vy(Math.max(0, minV))} L${pts[0][0]},${vy(Math.max(0, minV))} Z` : '';
      return (
        <g key={si}>
          {el.chart === 'area' && <path className="lm-chart-fade" d={area} style={{ ...anim(si + 2), fill: `url(#${gid(si)}-area)` }} />}
          <path className="lm-chart-draw" d={line} pathLength={1} style={{ ...anim(si), fill: 'none', stroke: colorOf(el, si), strokeWidth: Math.max(2, fs * 0.22), strokeLinecap: 'round', strokeLinejoin: 'round' }} />
          {pts.map((p, i) => (
            <g key={i}>
              <circle className="lm-chart-pop" cx={p[0]} cy={p[1]} r={Math.max(3, fs * 0.28)} style={{ ...anim(i + 3), fill: 'var(--lm-bg)', stroke: colorOf(el, si), strokeWidth: Math.max(2, fs * 0.16), transformOrigin: `${p[0]}px ${p[1]}px` }} />
              {el.showValues && (
                <text className="lm-chart-fade" x={p[0]} y={p[1] - fs * 0.8} textAnchor="middle" style={{ ...anim(i + 5), fontSize: fs * 0.8, fontWeight: 700, fill: el.textColor || 'var(--lm-text)' }}>
                  {formatValue(s.values[i], el)}
                </text>
              )}
            </g>
          ))}
        </g>
      );
    });
  }

  const axisLabels = labels.slice(0, n).map((l, i) =>
    horizontal ? (
      <text key={i} x={pad.left - fs * 0.5} y={pad.top + group * i + group / 2} textAnchor="end" dominantBaseline="middle" style={{ fontSize: fs }}>
        {l}
      </text>
    ) : (
      <text key={i} x={pad.left + group * i + group / 2} y={pad.top + ph + fs * 1.3} textAnchor="middle" style={{ fontSize: fs }}>
        {l}
      </text>
    ),
  );

  return (
    <svg className="lm-chart" viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={textStyle}>
      {defs}
      {grid}
      {!horizontal && minV < 0 && <line x1={pad.left} x2={pad.left + pw} y1={vy(0)} y2={vy(0)} className="lm-chart-zero" />}
      {body}
      {axisLabels}
      {el.showLegend && (
        <Legend el={el} x={pad.left} y={fs * 0.8} items={series.map((s, i) => ({ name: s.name, color: colorOf(el, i) }))} />
      )}
    </svg>
  );
}
