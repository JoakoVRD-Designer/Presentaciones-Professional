import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Pipette } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GRADIENT_PRESETS } from '../../../core/themes';
import { sfx } from '../../lib/sound';
import { Popover } from './Popover';

/* ---------------- Sección plegable ---------------- */

export function Section({
  title,
  children,
  defaultOpen = true,
  actions,
  id,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  actions?: ReactNode;
  id?: string;
}) {
  const key = `lumen:section:${id ?? title}`;
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? defaultOpen : v === '1';
    } catch {
      return defaultOpen;
    }
  });
  return (
    <section className={`section${open ? ' is-open' : ''}`}>
      <header className="section-head">
        <button
          className="section-toggle"
          onClick={() => {
            const next = !open;
            setOpen(next);
            sfx('tick');
            try {
              localStorage.setItem(key, next ? '1' : '0');
            } catch {
              /* noop */
            }
          }}
        >
          <motion.span animate={{ rotate: open ? 0 : -90 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }}>
            <ChevronDown size={14} />
          </motion.span>
          {title}
        </button>
        {actions && <div className="section-actions">{actions}</div>}
      </header>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="section-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="section-inner">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export function Row({ label, children, hint }: { label?: ReactNode; children: ReactNode; hint?: string }) {
  return (
    <div className="row" title={hint}>
      {label !== undefined && <span className="row-label">{label}</span>}
      <div className="row-control">{children}</div>
    </div>
  );
}

export function Grid({ children, cols = 2 }: { children: ReactNode; cols?: number }) {
  return (
    <div className="field-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {children}
    </div>
  );
}

/* ---------------- Número con arrastre ---------------- */

export function NumberInput({
  value,
  onChange,
  label,
  min = -Infinity,
  max = Infinity,
  step = 1,
  unit,
  precision = 0,
}: {
  value: number;
  onChange: (v: number) => void;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  precision?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const round = (v: number) => Number(v.toFixed(precision));
  const scrub = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const start = value;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    document.body.classList.add('is-scrubbing');
    let lastTick = 0;
    const move = (ev: PointerEvent) => {
      const mult = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
      const v = round(clamp(start + Math.round((ev.clientX - startX) / 2) * step * mult));
      onChange(v);
      if (Date.now() - lastTick > 60) {
        sfx('tick');
        lastTick = Date.now();
      }
    };
    const up = () => {
      document.body.classList.remove('is-scrubbing');
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.replace(',', '.'));
    if (!Number.isNaN(n)) onChange(round(clamp(n)));
    setDraft(null);
  };
  return (
    <label className="num-input">
      {label && (
        <span className="num-label" onPointerDown={scrub} title="Arrastra para ajustar (Shift ×10, Alt ×0.1)">
          {label}
        </span>
      )}
      <input
        value={draft ?? String(round(value))}
        inputMode="decimal"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            onChange(round(clamp(value + d)));
            setDraft(null);
          }
        }}
      />
      {unit && <span className="num-unit">{unit}</span>}
    </label>
  );
}

/* ---------------- Deslizador ---------------- */

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  precision = 0,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  precision?: number;
  label?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider">
      {label && <span className="slider-label">{label}</span>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--pct': `${Math.max(0, Math.min(100, pct))}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={() => sfx('tick')}
      />
      <NumberInput value={value} onChange={onChange} min={min} max={max} step={step} unit={unit} precision={precision} />
    </div>
  );
}

/* ---------------- Interruptor / segmentado / select ---------------- */

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`switch${checked ? ' is-on' : ''}`}
      onClick={() => {
        sfx('toggle');
        onChange(!checked);
      }}
    >
      <span className="switch-track">
        <motion.span className="switch-thumb" layout transition={{ type: 'spring', stiffness: 600, damping: 32 }} />
      </span>
      {label && <span className="switch-label">{label}</span>}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  layoutId,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label?: ReactNode; icon?: ReactNode; tip?: string }[];
  layoutId: string;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={`seg${value === o.value ? ' is-active' : ''}`}
          data-tip={o.tip}
          onClick={() => {
            if (value !== o.value) sfx('tick');
            onChange(o.value);
          }}
        >
          {value === o.value && (
            <motion.span layoutId={layoutId} className="seg-bg" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />
          )}
          <span className="seg-content">
            {o.icon}
            {o.label}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  style,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  style?: React.CSSProperties;
}) {
  return (
    <div className="select" style={style}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} />
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  onCommit,
  mono,
}: {
  value: string;
  onChange?: (v: string) => void;
  onCommit?: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className={`text-input${mono ? ' mono' : ''}`}
      value={onCommit ? draft : value}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => (onCommit ? setDraft(e.target.value) : onChange?.(e.target.value))}
      onBlur={() => onCommit && draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function TextArea({
  value,
  onCommit,
  placeholder,
  rows = 4,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <textarea
      className="text-area"
      value={draft}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
}

/* ---------------- Color / degradado ---------------- */

function toHex(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{3}$/i.test(color)) return `#${color.slice(1).split('').map((c) => c + c).join('')}`;
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(color);
  if (m) return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
  return '#7c5cff';
}

export function Swatch({ value, size = 22 }: { value: string; size?: number }) {
  const empty = !value || value === 'transparent';
  return (
    <span
      className={`swatch${empty ? ' is-empty' : ''}`}
      style={{ width: size, height: size, background: empty ? undefined : value }}
    />
  );
}

export function ColorInput({
  value,
  onChange,
  gradients = false,
  allowEmpty = false,
  emptyLabel = 'Tema',
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  gradients?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  placeholder?: string;
}) {
  // Los colores del tema se guardan como variables CSS para que sigan al tema.
  const swatches = [
    'var(--lm-text)',
    'var(--lm-muted)',
    'var(--lm-primary)',
    'var(--lm-accent)',
    'var(--lm-bg)',
    'var(--lm-surface)',
    '#ffffff',
    '#000000',
    'rgba(255,255,255,0.08)',
    'rgba(0,0,0,0.5)',
  ];
  const nativeRef = useRef<HTMLInputElement>(null);
  return (
    <Popover
      width={260}
      align="end"
      trigger={({ toggle, ref }) => (
        <button
          ref={ref as React.RefObject<HTMLButtonElement>}
          type="button"
          className="color-trigger"
          onClick={toggle}
        >
          <Swatch value={value} />
          <span className="color-value">{value || placeholder || emptyLabel}</span>
        </button>
      )}
    >
      <div className="color-pop">
        <div className="color-row">
          <button className="eyedrop" onClick={() => nativeRef.current?.click()} data-tip="Selector">
            <Pipette size={14} />
            <input
              ref={nativeRef}
              type="color"
              value={toHex(value)}
              onChange={(e) => onChange(e.target.value)}
              tabIndex={-1}
            />
          </button>
          <TextInput value={value} onCommit={onChange} mono placeholder="#hex, rgba(), gradient…" />
        </div>
        <div className="swatch-grid">
          {allowEmpty && (
            <button className="swatch-btn" onClick={() => onChange('')} data-tip={emptyLabel}>
              <Swatch value="" />
            </button>
          )}
          <button className="swatch-btn" onClick={() => onChange('transparent')} data-tip="Transparente">
            <Swatch value="transparent" />
          </button>
          {swatches.map((c, i) => (
            <button key={i} className="swatch-btn" onClick={() => onChange(c)} data-tip={c.startsWith('var(') ? `Tema: ${c.slice(9, -1)}` : c}>
              <Swatch value={c} />
            </button>
          ))}
        </div>
        {gradients && (
          <>
            <div className="pop-label">Degradados</div>
            <div className="swatch-grid gradients">
              {[
                'linear-gradient(135deg, var(--lm-primary) 0%, var(--lm-accent) 100%)',
                'linear-gradient(180deg, var(--lm-text) 30%, var(--lm-primary) 100%)',
                ...GRADIENT_PRESETS,
              ].map((g) => (
                <button key={g} className="swatch-btn" onClick={() => onChange(g)}>
                  <Swatch value={g} size={30} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </Popover>
  );
}

export function Chips<T extends string>({
  value,
  options,
  onChange,
  onHover,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  onHover?: (v: T) => void;
}) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button
          key={o.value}
          className={`chip${value === o.value ? ' is-active' : ''}`}
          onClick={() => {
            sfx('tick');
            onChange(o.value);
          }}
          onMouseEnter={() => onHover?.(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
