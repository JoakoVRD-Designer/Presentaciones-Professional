/**
 * Bibliotecas pesadas (resaltado de código y KaTeX) cargadas bajo demanda.
 * El editor muestra el contenido sin formato mientras cargan y se vuelve a
 * pintar al terminar; la exportación y el render de video esperan a que
 * estén listas (ensureRichLibs) para producir HTML ya resaltado.
 */
import { useEffect, useSyncExternalStore } from 'react';
import type { Presentation, SlideElement } from '../core/model';

type Hljs = typeof import('./hl').default;
type Katex = typeof import('katex').default;

let hljs: Hljs | null = null;
let katex: Katex | null = null;
let hlPromise: Promise<void> | null = null;
let katexPromise: Promise<void> | null = null;
let version = 0;
const listeners = new Set<() => void>();
const notify = () => {
  version++;
  listeners.forEach((l) => l());
};

export function loadHighlighter(): Promise<void> {
  hlPromise ??= import('./hl').then((m) => {
    hljs = m.default;
    notify();
  });
  return hlPromise;
}

export function loadKatex(): Promise<void> {
  katexPromise ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => {
    katex = m.default;
    notify();
  });
  return katexPromise;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Hook: pide la biblioteca y vuelve a pintar cuando está lista. */
export function useRichLib(kind: 'code' | 'math'): number {
  const v = useSyncExternalStore(subscribe, () => version, () => version);
  useEffect(() => {
    void (kind === 'code' ? loadHighlighter() : loadKatex());
  }, [kind]);
  return v;
}

function elementsOf(doc: Pick<Presentation, 'slides' | 'master'>): SlideElement[] {
  return [...doc.slides.flatMap((s) => s.elements), ...(doc.master?.elements ?? [])];
}

export function docUses(doc: Pick<Presentation, 'slides' | 'master'>, type: SlideElement['type']): boolean {
  return elementsOf(doc).some((e) => e.type === type);
}

/** Espera a que estén cargadas las bibliotecas que usa el documento. */
export async function ensureRichLibs(doc: Pick<Presentation, 'slides' | 'master'>): Promise<void> {
  const tasks: Promise<void>[] = [];
  if (docUses(doc, 'code')) tasks.push(loadHighlighter());
  if (docUses(doc, 'math')) tasks.push(loadKatex());
  await Promise.all(tasks);
}

/* ---------------- Código ---------------- */

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ALIASES: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', sh: 'bash', zsh: 'bash',
  shell: 'bash', yml: 'yaml', md: 'markdown', cs: 'csharp', 'c#': 'csharp', 'c++': 'cpp', rb: 'ruby', kt: 'kotlin',
  rs: 'rust', golang: 'go', docker: 'dockerfile', html: 'xml', text: 'plaintext',
};

/** Divide HTML resaltado en líneas, cerrando y reabriendo los <span> abiertos. */
export function splitHighlighted(html: string): string[] {
  const lines: string[] = [];
  const stack: string[] = [];
  let cur = '';
  const re = /(<span[^>]*>)|(<\/span>)|(\n)|([^<\n]+|<)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1]) {
      stack.push(m[1]);
      cur += m[1];
    } else if (m[2]) {
      stack.pop();
      cur += m[2];
    } else if (m[3]) {
      lines.push(cur + '</span>'.repeat(stack.length));
      cur = stack.join('');
    } else cur += m[4];
  }
  lines.push(cur);
  return lines;
}

/** Líneas de código resaltadas (o escapadas si el resaltador aún no cargó). */
export function highlightLines(code: string, language: string): { html: string[]; plain: string[]; ready: boolean } {
  const normalized = code.replace(/\r\n?/g, '\n').replace(/\t/g, '  ');
  const plain = normalized.split('\n');
  if (!hljs) return { html: plain.map(escapeHtml), plain, ready: false };
  const lang = ALIASES[language.toLowerCase()] ?? language.toLowerCase();
  let out: string;
  try {
    out = hljs.getLanguage(lang)
      ? hljs.highlight(normalized, { language: lang, ignoreIllegals: true }).value
      : hljs.highlightAuto(normalized).value;
  } catch {
    out = escapeHtml(normalized);
  }
  return { html: splitHighlighted(out), plain, ready: true };
}

/** "2,4-6" → {2,4,5,6} */
export function parseLineSet(spec: string): Set<number> {
  const set = new Set<number>();
  for (const part of spec.split(/[\s,]+/)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b) && i - Math.min(a, b) < 2000; i++) set.add(i);
  }
  return set;
}

/* ---------------- Fórmulas ---------------- */

export function renderTex(tex: string, display: boolean): { html: string; ready: boolean } {
  if (!katex) return { html: escapeHtml(tex), ready: false };
  try {
    return {
      html: katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', output: 'html', trust: false }),
      ready: true,
    };
  } catch (err) {
    return { html: `<span class="lm-math-error">${escapeHtml(err instanceof Error ? err.message : String(err))}</span>`, ready: true };
  }
}
