import { Columns3, Plus, Rows3, X } from 'lucide-react';
import { useState } from 'react';
import type { TableElement } from '../../../core/model';
import { sfx } from '../../lib/sound';
import { ColorInput, Row, Section, Segmented, Select, Slider, Switch } from '../ui/fields';

function Cell({ value, onCommit, head }: { value: string; onCommit: (v: string) => void; head?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className={`grid-cell${head ? ' head' : ''}`}
      value={draft ?? value}
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

function parseTable(text: string): string[][] | null {
  const sep = text.includes('\t') ? '\t' : text.includes(';') ? ';' : ',';
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map((r) => r.split(sep).map((c) => c.trim()));
  return rows.length && rows[0].length > 1 ? rows : null;
}

export function TableEditor({ el, patch }: { el: TableElement; patch: (p: Record<string, unknown>, field?: string) => void }) {
  const [paste, setPaste] = useState('');
  const cols = Math.max(1, ...el.rows.map((r) => r.length));
  const norm = el.rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ''));

  const setCell = (ri: number, ci: number, v: string) => patch({ rows: norm.map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? v : c)) : r)) });
  const addRow = () => {
    sfx('pop');
    patch({ rows: [...norm, Array(cols).fill('')] });
  };
  const addCol = () => {
    sfx('pop');
    patch({ rows: norm.map((r, i) => [...r, i === 0 && el.header ? `Columna ${cols + 1}` : '']) });
  };
  const removeRow = (ri: number) => {
    if (norm.length <= 1) return;
    sfx('remove');
    patch({ rows: norm.filter((_, i) => i !== ri) });
  };
  const removeCol = (ci: number) => {
    if (cols <= 1) return;
    sfx('remove');
    patch({ rows: norm.map((r) => r.filter((_, j) => j !== ci)), highlightColumn: el.highlightColumn === ci ? -1 : el.highlightColumn });
  };

  return (
    <>
      <Section title="Tabla" id="el-table">
        <div className="data-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(64px, 1fr)) 22px` }}>
          {Array.from({ length: cols }, (_, ci) => (
            <button key={`x${ci}`} className="grid-x col-x" onClick={() => removeCol(ci)} aria-label={`Quitar columna ${ci + 1}`}>
              <X size={11} />
            </button>
          ))}
          <span />
          {norm.map((row, ri) => (
            <div key={ri} style={{ display: 'contents' }}>
              {row.map((c, ci) => (
                <Cell key={ci} value={c} head={el.header && ri === 0} onCommit={(v) => setCell(ri, ci, v)} />
              ))}
              <button className="grid-x" onClick={() => removeRow(ri)} aria-label={`Quitar fila ${ri + 1}`}>
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
        <div className="btn-row">
          <button className="btn soft small" onClick={addRow}>
            <Rows3 size={13} /> <Plus size={11} /> Fila
          </button>
          <button className="btn soft small" onClick={addCol}>
            <Columns3 size={13} /> <Plus size={11} /> Columna
          </button>
        </div>
        <textarea
          className="text-area mono-area"
          rows={2}
          placeholder="Pega una tabla de Excel / Sheets / CSV para reemplazarla"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          onPaste={(e) => {
            const rows = parseTable(e.clipboardData.getData('text/plain'));
            if (rows) {
              e.preventDefault();
              patch({ rows });
              setPaste('');
              sfx('success');
            }
          }}
        />
      </Section>
      <Section title="Estilo de tabla" id="el-table-style">
        <div className="field-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Switch checked={el.header} onChange={(v) => patch({ header: v })} label="Encabezado" />
          <Switch checked={el.striped} onChange={(v) => patch({ striped: v })} label="Bandas" />
          <Switch checked={el.firstColumn} onChange={(v) => patch({ firstColumn: v })} label="1ª columna" />
        </div>
        <Row label="Destacar">
          <Select
            value={String(el.highlightColumn)}
            onChange={(v) => patch({ highlightColumn: Number(v) })}
            options={[{ value: '-1', label: 'Ninguna columna' }, ...Array.from({ length: cols }, (_, i) => ({ value: String(i), label: `Columna ${i + 1}${norm[0]?.[i] ? ` · ${norm[0][i]}` : ''}` }))]}
          />
        </Row>
        <Row label="Alinear">
          <Segmented
            layoutId="table-align"
            value={el.align}
            onChange={(v) => patch({ align: v })}
            options={[
              { value: 'left', label: 'Izq.' },
              { value: 'center', label: 'Centro' },
              { value: 'right', label: 'Der.' },
            ]}
          />
        </Row>
        <Row label="Tamaño">
          <Slider value={el.fontSize} min={10} max={80} unit="px" onChange={(v) => patch({ fontSize: v }, 'tfs')} />
        </Row>
        <Row label="Encabezado">
          <ColorInput value={el.headerFill} gradients allowEmpty emptyLabel="Primario del tema" onChange={(v) => patch({ headerFill: v })} />
        </Row>
        <Row label="Texto enc.">
          <ColorInput value={el.headerColor} onChange={(v) => patch({ headerColor: v })} />
        </Row>
        <Row label="Texto">
          <ColorInput value={el.textColor} allowEmpty emptyLabel="Texto del tema" onChange={(v) => patch({ textColor: v })} />
        </Row>
        <Row label="Líneas">
          <ColorInput value={el.lineColor} allowEmpty emptyLabel="Automático" onChange={(v) => patch({ lineColor: v })} />
        </Row>
        <p className="hint">Las filas aparecen escalonadas al presentar. Las celdas admiten &lt;b&gt;, &lt;i&gt; y colores.</p>
      </Section>
    </>
  );
}
