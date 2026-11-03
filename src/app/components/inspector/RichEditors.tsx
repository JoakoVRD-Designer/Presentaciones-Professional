/**
 * Editores del inspector para código, fórmulas y SVG.
 */
import { Upload, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CODE_LANGUAGES, CODE_THEMES, type CodeElement, type CodeTheme, type MathElement, type SvgElement } from '../../../core/model';
import { renderTex, useRichLib } from '../../../render/richLibs';
import { pickFile } from '../../lib/assets';
import { sfx } from '../../lib/sound';
import { useEditor } from '../../store/editor';
import { ColorInput, Row, Section, Segmented, Select, Slider, Switch, TextInput } from '../ui/fields';

type Patch = (p: Record<string, unknown>, field?: string) => void;

/** Área de texto monoespaciada: Tab inserta espacios, ⌘↵ o salir del campo confirma. */
function CodeArea({ value, onCommit, rows = 10, placeholder }: { value: string; onCommit: (v: string) => void; rows?: number; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <textarea
      className="text-area code-area code-field"
      value={draft}
      rows={rows}
      spellCheck={false}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        e.stopPropagation();
        const ta = e.currentTarget;
        if (e.key === 'Tab') {
          e.preventDefault();
          const { selectionStart: a, selectionEnd: b } = ta;
          const next = `${draft.slice(0, a)}  ${draft.slice(b)}`;
          setDraft(next);
          requestAnimationFrame(() => ta.setSelectionRange(a + 2, a + 2));
        }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          if (draft !== value) onCommit(draft);
        }
      }}
    />
  );
}

const LANG_LABELS: Record<string, string> = {
  javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', json: 'JSON', html: 'HTML', css: 'CSS', bash: 'Bash / Shell',
  sql: 'SQL', java: 'Java', go: 'Go', rust: 'Rust', c: 'C', cpp: 'C++', csharp: 'C#', php: 'PHP', ruby: 'Ruby', swift: 'Swift',
  kotlin: 'Kotlin', yaml: 'YAML', markdown: 'Markdown', dockerfile: 'Dockerfile', diff: 'Diff', plaintext: 'Texto plano',
};

const THEME_META: Record<CodeTheme, { label: string; bg: string; fg: string; kw: string; str: string }> = {
  auto: { label: 'Tema', bg: 'var(--ui-raised)', fg: '#fff', kw: 'var(--ui-accent)', str: 'var(--ui-accent-2)' },
  night: { label: 'Noche', bg: '#0f111a', fg: '#d6deeb', kw: '#c792ea', str: '#c3e88d' },
  dracula: { label: 'Drácula', bg: '#282a36', fg: '#f8f8f2', kw: '#ff79c6', str: '#f1fa8c' },
  tokyo: { label: 'Tokio', bg: '#1a1b26', fg: '#c0caf5', kw: '#bb9af7', str: '#9ece6a' },
  solarized: { label: 'Solarized', bg: '#002b36', fg: '#93a1a1', kw: '#859900', str: '#2aa198' },
  'github-light': { label: 'Claro', bg: '#ffffff', fg: '#24292f', kw: '#cf222e', str: '#0a3069' },
  paper: { label: 'Papel', bg: '#fbf8f1', fg: '#3b3a36', kw: '#a626a4', str: '#50a14f' },
};

export function CodeEditor({ el, patch }: { el: CodeElement; patch: Patch }) {
  const lines = el.code.split('\n');
  const chars = el.code.replace(/\n/g, '').length;
  const typingSeconds = ((chars + lines.length * 4) * el.typingSpeed) / 1000;
  const detect = async () => {
    const { default: hljs } = await import('../../../render/hl');
    const guess = hljs.highlightAuto(el.code, [...CODE_LANGUAGES].map((l) => (l === 'html' ? 'xml' : l))).language;
    if (guess) {
      patch({ language: guess === 'xml' ? 'html' : guess });
      useEditor.getState().toast(`Lenguaje detectado: ${LANG_LABELS[guess === 'xml' ? 'html' : guess] ?? guess}`, 'success');
    }
  };
  return (
    <>
      <Section title="Código" id="el-code">
        <Row label="Lenguaje">
          <div className="row-inline">
            <Select
              value={(CODE_LANGUAGES as readonly string[]).includes(el.language) ? el.language : 'plaintext'}
              onChange={(v) => patch({ language: v })}
              options={CODE_LANGUAGES.map((l) => ({ value: l, label: LANG_LABELS[l] ?? l }))}
            />
            <button className="btn soft small" onClick={() => void detect()} data-tip="Detectar lenguaje">
              <Wand2 size={13} />
            </button>
          </div>
        </Row>
        <CodeArea value={el.code} onCommit={(v) => patch({ code: v })} rows={Math.min(16, Math.max(6, lines.length + 1))} />
        <p className="hint">Tab inserta espacios · ⌘↵ aplica · {lines.length} líneas.</p>
      </Section>
      <Section title="Aspecto del código" id="el-code-look">
        <div className="code-themes">
          {CODE_THEMES.map((t) => {
            const m = THEME_META[t];
            return (
              <button key={t} className={`code-theme${el.theme === t ? ' is-active' : ''}`} onClick={() => patch({ theme: t })} style={{ background: m.bg, color: m.fg }}>
                <span>
                  <i style={{ color: m.kw }}>const</i> <i style={{ color: m.str }}>"a"</i>
                </span>
                <b>{m.label}</b>
              </button>
            );
          })}
        </div>
        <Row label="Tamaño">
          <Slider value={el.fontSize} min={10} max={72} unit="px" onChange={(v) => patch({ fontSize: v }, 'cfs')} />
        </Row>
        <Row label="Números de línea">
          <Switch checked={el.lineNumbers} onChange={(v) => patch({ lineNumbers: v })} />
        </Row>
        <Row label="Barra de ventana">
          <Switch checked={el.chrome} onChange={(v) => patch({ chrome: v })} />
        </Row>
        {el.chrome && (
          <Row label="Título">
            <TextInput value={el.title} onCommit={(v) => patch({ title: v })} placeholder="app.ts" />
          </Row>
        )}
        <Row label="Destacar líneas" hint="Ej.: 2,4-6 · el resto se atenúa">
          <TextInput value={el.highlight} onCommit={(v) => patch({ highlight: v.replace(/[^\d,\s-]/g, '') })} placeholder="2,4-6" mono />
        </Row>
      </Section>
      <Section title="Máquina de escribir" id="el-code-type">
        <Row label="Escribir al aparecer">
          <Switch checked={el.typing} onChange={(v) => patch({ typing: v })} />
        </Row>
        {el.typing && (
          <>
            <Row label="Velocidad">
              <Slider value={el.typingSpeed} min={6} max={160} unit="ms" onChange={(v) => patch({ typingSpeed: v }, 'cts')} />
            </Row>
            <p className="hint">
              Se escribe carácter a carácter (~{typingSeconds.toFixed(1)} s) al presentar, en el HTML exportado y en el video. Pruébalo con «Previsualizar
              animación».
            </p>
          </>
        )}
      </Section>
    </>
  );
}

const TEX_SNIPPETS: { label: string; tex: string }[] = [
  { label: 'a/b', tex: '\\frac{a}{b}' },
  { label: '√x', tex: '\\sqrt{x}' },
  { label: 'xⁿ', tex: 'x^{n}' },
  { label: 'xᵢ', tex: 'x_{i}' },
  { label: 'Σ', tex: '\\sum_{i=1}^{n} ' },
  { label: '∫', tex: '\\int_{a}^{b} f(x)\\,dx' },
  { label: 'lím', tex: '\\lim_{x \\to \\infty} ' },
  { label: 'matriz', tex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
  { label: 'α', tex: '\\alpha' },
  { label: 'β', tex: '\\beta' },
  { label: 'π', tex: '\\pi' },
  { label: 'θ', tex: '\\theta' },
  { label: 'Δ', tex: '\\Delta' },
  { label: '∞', tex: '\\infty' },
  { label: '±', tex: '\\pm' },
  { label: '≤', tex: '\\leq' },
  { label: '≈', tex: '\\approx' },
  { label: '→', tex: '\\rightarrow' },
  { label: 'ℝ', tex: '\\mathbb{R}' },
  { label: 'vec', tex: '\\vec{v}' },
];

const TEX_EXAMPLES: { label: string; tex: string }[] = [
  { label: 'Identidad de Euler', tex: 'e^{i\\pi} + 1 = 0' },
  { label: 'Fórmula cuadrática', tex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
  { label: 'Teorema de Pitágoras', tex: 'a^2 + b^2 = c^2' },
  { label: 'Teorema de Bayes', tex: 'P(A \\mid B) = \\frac{P(B \\mid A)\\,P(A)}{P(B)}' },
  { label: 'Integral de Gauss', tex: '\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}' },
  { label: 'Energía-masa', tex: 'E = mc^2' },
  { label: 'Serie geométrica', tex: '\\sum_{n=0}^{\\infty} r^n = \\frac{1}{1-r}, \\quad |r| < 1' },
  { label: 'Interés compuesto', tex: 'A = P\\left(1 + \\frac{r}{n}\\right)^{nt}' },
  { label: 'Softmax', tex: '\\sigma(\\mathbf{z})_i = \\frac{e^{z_i}}{\\sum_{j=1}^{K} e^{z_j}}' },
];

export function MathEditor({ el, patch }: { el: MathElement; patch: Patch }) {
  const [draft, setDraft] = useState(el.tex);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setDraft(el.tex), [el.tex]);
  const v = useRichLib('math');
  const preview = useMemo(() => renderTex(draft, el.display), [draft, el.display, v]);
  // Vista previa en vivo; se confirma en el documento con una pausa corta.
  useEffect(() => {
    if (draft === el.tex) return;
    const t = setTimeout(() => patch({ tex: draft }, 'tex'), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  const insert = (snippet: string) => {
    const ta = ref.current;
    const a = ta?.selectionStart ?? draft.length;
    const b = ta?.selectionEnd ?? draft.length;
    const next = `${draft.slice(0, a)}${snippet}${draft.slice(b)}`;
    setDraft(next);
    sfx('tick');
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(a + snippet.length, a + snippet.length);
    });
  };
  return (
    <>
      <Section title="Fórmula (LaTeX)" id="el-math">
        <div className="math-preview" dangerouslySetInnerHTML={{ __html: preview.html }} />
        <textarea
          ref={ref}
          className="text-area code-area code-field"
          rows={3}
          spellCheck={false}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}"
        />
        <div className="chips tex-chips">
          {TEX_SNIPPETS.map((s) => (
            <button key={s.label} className="chip" onClick={() => insert(s.tex)} title={s.tex}>
              {s.label}
            </button>
          ))}
        </div>
        <Row label="Ejemplos">
          <Select
            value=""
            onChange={(v) => v && setDraft(v)}
            options={[{ value: '', label: 'Elegir una fórmula…' }, ...TEX_EXAMPLES.map((x) => ({ value: x.tex, label: x.label }))]}
          />
        </Row>
      </Section>
      <Section title="Aspecto de la fórmula" id="el-math-look">
        <Row label="Tamaño">
          <Slider value={el.size} min={16} max={240} unit="px" onChange={(v) => patch({ size: v }, 'msize')} />
        </Row>
        <Row label="Color">
          <ColorInput value={el.color} onChange={(v) => patch({ color: v }, 'mcolor')} />
        </Row>
        <Row label="Alineación">
          <Segmented
            layoutId="malign"
            value={el.align}
            onChange={(v) => patch({ align: v })}
            options={[
              { value: 'left', label: 'Izq.' },
              { value: 'center', label: 'Centro' },
              { value: 'right', label: 'Der.' },
            ]}
          />
        </Row>
        <Row label="Estilo bloque">
          <Switch checked={el.display} onChange={(v) => patch({ display: v })} />
        </Row>
      </Section>
    </>
  );
}

export function SvgEditor({ el, patch }: { el: SvgElement; patch: Patch }) {
  const upload = async () => {
    const file = await pickFile('image/svg+xml,.svg');
    if (!file) return;
    const text = await file.text();
    if (!/<svg[\s>]/i.test(text)) {
      useEditor.getState().toast('El archivo no parece un SVG', 'error');
      return;
    }
    patch({ svg: text });
    sfx('success');
  };
  return (
    <Section title="Ilustración SVG" id="el-svg">
      <Row label="Color">
        <ColorInput value={el.color} onChange={(v) => patch({ color: v }, 'scolor')} />
      </Row>
      <Row label="Ajuste">
        <Segmented
          layoutId="sfit"
          value={el.fit}
          onChange={(v) => patch({ fit: v })}
          options={[
            { value: 'contain', label: 'Contener' },
            { value: 'cover', label: 'Cubrir' },
            { value: 'fill', label: 'Estirar' },
          ]}
        />
      </Row>
      <CodeArea value={el.svg} onCommit={(v) => patch({ svg: v })} rows={7} placeholder="<svg viewBox=…>…</svg>" />
      <div className="btn-row">
        <button className="btn soft" onClick={() => void upload()}>
          <Upload size={14} /> Subir .svg
        </button>
      </div>
      <p className="hint">
        Se limpia automáticamente (sin scripts ni recursos externos). Usa <code>currentColor</code>, <code>var(--lm-primary)</code> o{' '}
        <code>var(--lm-accent)</code> para que siga al tema, y la entrada «Dibujar» para que los trazos se dibujen solos.
      </p>
    </Section>
  );
}
