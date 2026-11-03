import { ChartColumn, ChartLine, ChartPie, ChartBarBig, ChartArea, Donut, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { CHART_KINDS, type ChartElement } from '../../../core/model';
import { CHART_PALETTE } from '../../../render/Chart';
import { sfx } from '../../lib/sound';
import { ColorInput, Row, Section, Slider, Switch, TextInput } from '../ui/fields';

const KIND_META: Record<(typeof CHART_KINDS)[number], { label: string; icon: typeof ChartColumn }> = {
  column: { label: 'Columnas', icon: ChartColumn },
  bar: { label: 'Barras', icon: ChartBarBig },
  line: { label: 'Líneas', icon: ChartLine },
  area: { label: 'Área', icon: ChartArea },
  donut: { label: 'Dona', icon: Donut },
  pie: { label: 'Tarta', icon: ChartPie },
};

function Cell({ value, onCommit, numeric }: { value: string; onCommit: (v: string) => void; numeric?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className={`grid-cell${numeric ? ' num' : ''}`}
      value={draft ?? value}
      inputMode={numeric ? 'decimal' : undefined}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== value) onCommit(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

/** Convierte texto tabulado/CSV pegado (p. ej. desde una hoja de cálculo). */
function parseTable(text: string): { labels: string[]; series: { name: string; values: number[] }[] } | null {
  const sep = text.includes('\t') ? '\t' : text.includes(';') ? ';' : ',';
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map((r) => r.split(sep).map((c) => c.trim()));
  if (rows.length < 2 || rows[0].length < 2) return null;
  const header = rows[0];
  const headerIsNames = header.slice(1).some((h) => Number.isNaN(Number(h.replace(',', '.'))));
  const body = headerIsNames ? rows.slice(1) : rows;
  const names = headerIsNames ? header.slice(1) : header.slice(1).map((_, i) => `Serie ${i + 1}`);
  return {
    labels: body.map((r) => r[0]),
    series: names.map((name, si) => ({ name, values: body.map((r) => Number((r[si + 1] ?? '0').replace(',', '.')) || 0) })),
  };
}

export function ChartEditor({ el, patch }: { el: ChartElement; patch: (p: Record<string, unknown>, field?: string) => void }) {
  const [paste, setPaste] = useState('');
  const n = Math.max(el.labels.length, ...el.series.map((s) => s.values.length));
  const circular = el.chart === 'donut' || el.chart === 'pie';
  const series = circular ? el.series.slice(0, 1) : el.series;

  const setLabel = (i: number, v: string) => {
    const labels = [...el.labels];
    while (labels.length < n) labels.push('');
    labels[i] = v;
    patch({ labels });
  };
  const setValue = (si: number, i: number, v: string) => {
    const next = el.series.map((s, k) => {
      if (k !== si) return s;
      const values = [...s.values];
      while (values.length < n) values.push(0);
      values[i] = Number(v.replace(',', '.')) || 0;
      return { ...s, values };
    });
    patch({ series: next });
  };
  const addRow = () => {
    sfx('pop');
    patch({ labels: [...el.labels, `Dato ${n + 1}`], series: el.series.map((s) => ({ ...s, values: [...s.values, 0] })) });
  };
  const removeRow = (i: number) => {
    sfx('remove');
    patch({ labels: el.labels.filter((_, k) => k !== i), series: el.series.map((s) => ({ ...s, values: s.values.filter((_, k) => k !== i) })) });
  };
  const addSeries = () => {
    sfx('pop');
    patch({ series: [...el.series, { name: `Serie ${el.series.length + 1}`, values: Array(n).fill(0), color: '' }] });
  };
  const removeSeries = (si: number) => {
    if (el.series.length <= 1) return;
    sfx('remove');
    patch({ series: el.series.filter((_, k) => k !== si) });
  };

  return (
    <>
      <Section title="Gráfico" id="el-chart">
        <div className="chart-kinds">
          {CHART_KINDS.map((k) => {
            const M = KIND_META[k];
            return (
              <button
                key={k}
                className={`chart-kind${el.chart === k ? ' is-active' : ''}`}
                onClick={() => {
                  sfx('tick');
                  patch({ chart: k });
                }}
              >
                <M.icon size={18} />
                <span>{M.label}</span>
              </button>
            );
          })}
        </div>
        <div className="data-grid" style={{ gridTemplateColumns: `minmax(70px, 1.2fr) repeat(${series.length}, minmax(56px, 1fr)) 22px` }}>
          <span className="grid-head">Etiqueta</span>
          {series.map((s, si) => (
            <span key={si} className="grid-head series-head">
              <i style={{ background: s.color || CHART_PALETTE[si % CHART_PALETTE.length] }} />
              <Cell value={s.name} onCommit={(v) => patch({ series: el.series.map((x, k) => (k === si ? { ...x, name: v } : x)) })} />
              {!circular && el.series.length > 1 && (
                <button className="grid-x" onClick={() => removeSeries(si)} aria-label="Quitar serie">
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
          <span />
          {Array.from({ length: n }, (_, i) => (
            <div key={i} className="grid-row" style={{ display: 'contents' }}>
              <Cell value={el.labels[i] ?? ''} onCommit={(v) => setLabel(i, v)} />
              {series.map((s, si) => (
                <Cell key={si} numeric value={String(s.values[i] ?? 0)} onCommit={(v) => setValue(si, i, v)} />
              ))}
              <button className="grid-x" onClick={() => removeRow(i)} aria-label="Quitar fila">
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
        <div className="btn-row">
          <button className="btn soft small" onClick={addRow}>
            <Plus size={13} /> Fila
          </button>
          {!circular && (
            <button className="btn soft small" onClick={addSeries}>
              <Plus size={13} /> Serie
            </button>
          )}
        </div>
        <textarea
          className="text-area mono-area"
          rows={2}
          placeholder="Pega aquí datos de Excel / Sheets / CSV para reemplazar la tabla"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          onPaste={(e) => {
            const parsed = parseTable(e.clipboardData.getData('text/plain'));
            if (parsed) {
              e.preventDefault();
              patch({ labels: parsed.labels, series: parsed.series.map((s, i) => ({ ...s, color: el.series[i]?.color ?? '' })) });
              setPaste('');
              sfx('success');
            }
          }}
        />
      </Section>
      <Section title="Estilo del gráfico" id="el-chart-style">
        {!circular &&
          series.map((s, si) => (
            <Row key={si} label={s.name || `Serie ${si + 1}`}>
              <ColorInput
                value={s.color}
                allowEmpty
                emptyLabel="Paleta del tema"
                onChange={(v) => patch({ series: el.series.map((x, k) => (k === si ? { ...x, color: v } : x)) })}
              />
            </Row>
          ))}
        <Row label="Texto">
          <ColorInput value={el.textColor} allowEmpty emptyLabel="Secundario del tema" onChange={(v) => patch({ textColor: v })} />
        </Row>
        <Row label="Tamaño">
          <Slider value={el.fontSize} min={10} max={60} unit="px" onChange={(v) => patch({ fontSize: v }, 'cfs')} />
        </Row>
        <Row label={circular ? 'Anillo' : 'Grosor'}>
          <Slider value={Math.round(el.thickness * 100)} min={10} max={100} unit="%" onChange={(v) => patch({ thickness: v / 100 }, 'thick')} />
        </Row>
        <Row label="Prefijo / sufijo">
          <div className="inline-controls">
            <TextInput value={el.prefix} placeholder="$" onCommit={(v) => patch({ prefix: v })} />
            <TextInput value={el.suffix} placeholder="%" onCommit={(v) => patch({ suffix: v })} />
          </div>
        </Row>
        <div className="field-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Switch checked={el.showValues} onChange={(v) => patch({ showValues: v })} label="Valores" />
          <Switch checked={el.showLegend} onChange={(v) => patch({ showLegend: v })} label="Leyenda" />
          {!circular && <Switch checked={el.showGrid} onChange={(v) => patch({ showGrid: v })} label="Rejilla" />}
          {(el.chart === 'line' || el.chart === 'area') && <Switch checked={el.smooth} onChange={(v) => patch({ smooth: v })} label="Suave" />}
        </div>
        <p className="hint">Los gráficos crecen animados al aparecer. Pulsa «Previsualizar» en Animación.</p>
      </Section>
    </>
  );
}
