/**
 * Buscar y reemplazar en toda la presentación: textos (sin tocar etiquetas HTML),
 * celdas de tablas, etiquetas y series de gráficos, nombres y notas.
 */
import type { Command } from './commands';
import type { Presentation } from './model';

export interface Match {
  slideIndex: number;
  slideId: string;
  elementId?: string;
  where: string;
  snippet: string;
  count: number;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function makeRegex(find: string, opts: { caseSensitive?: boolean; wholeWord?: boolean }): RegExp | null {
  if (!find) return null;
  const body = opts.wholeWord ? `(?<![\\p{L}\\p{N}_])${escapeRe(find)}(?![\\p{L}\\p{N}_])` : escapeRe(find);
  return new RegExp(body, `gu${opts.caseSensitive ? '' : 'i'}`);
}

/** Reemplaza solo en los nodos de texto de un HTML simple. */
export function replaceInHtml(html: string, re: RegExp, repl: string): string {
  return html.replace(/(<[^>]*>)|([^<]+)/g, (_m, tag: string | undefined, text: string | undefined) =>
    tag ? tag : (text ?? '').replace(re, () => repl.replace(/&/g, '&amp;').replace(/</g, '&lt;')),
  );
}

const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

function countIn(text: string, re: RegExp) {
  re.lastIndex = 0;
  return (text.match(re) ?? []).length;
}

function snippetOf(text: string, re: RegExp) {
  re.lastIndex = 0;
  const m = re.exec(text);
  if (!m) return text.slice(0, 60);
  const start = Math.max(0, m.index - 24);
  return `${start > 0 ? '…' : ''}${text.slice(start, m.index + m[0].length + 32)}${m.index + m[0].length + 32 < text.length ? '…' : ''}`;
}

export function findAll(doc: Presentation, re: RegExp): Match[] {
  const out: Match[] = [];
  doc.slides.forEach((slide, si) => {
    for (const el of slide.elements) {
      const texts: [string, string][] = [];
      if (el.type === 'text') texts.push(['Texto', plain(el.html)]);
      if (el.type === 'table') texts.push(['Tabla', el.rows.flat().map(plain).join(' · ')]);
      if (el.type === 'chart') texts.push(['Gráfico', [...el.labels, ...el.series.map((s) => s.name)].join(' · ')]);
      if (el.type === 'image') texts.push(['Texto alternativo', el.alt]);
      for (const [where, t] of texts) {
        const count = countIn(t, re);
        if (count) out.push({ slideIndex: si, slideId: slide.id, elementId: el.id, where, snippet: snippetOf(t, re), count });
      }
    }
    const nc = countIn(slide.notes, re);
    if (nc) out.push({ slideIndex: si, slideId: slide.id, where: 'Notas', snippet: snippetOf(slide.notes, re), count: nc });
  });
  return out;
}

/** Genera los comandos que aplican el reemplazo en todo el documento. */
export function replaceAllCommands(doc: Presentation, re: RegExp, repl: string): Command[] {
  const cmds: Command[] = [];
  const rep = (s: string) => {
    re.lastIndex = 0;
    return s.replace(re, () => repl);
  };
  for (const slide of doc.slides) {
    for (const el of slide.elements) {
      if (el.type === 'text') {
        const html = replaceInHtml(el.html, re, repl);
        if (html !== el.html) cmds.push({ op: 'element.update', element: el.id, patch: { html } });
      } else if (el.type === 'table') {
        const rows = el.rows.map((r) => r.map((c) => replaceInHtml(c, re, repl)));
        if (JSON.stringify(rows) !== JSON.stringify(el.rows)) cmds.push({ op: 'element.update', element: el.id, patch: { rows } });
      } else if (el.type === 'chart') {
        const labels = el.labels.map(rep);
        const series = el.series.map((s) => ({ ...s, name: rep(s.name) }));
        if (JSON.stringify([labels, series]) !== JSON.stringify([el.labels, el.series])) {
          cmds.push({ op: 'element.update', element: el.id, patch: { labels, series } });
        }
      } else if (el.type === 'image' && el.alt) {
        const alt = rep(el.alt);
        if (alt !== el.alt) cmds.push({ op: 'element.update', element: el.id, patch: { alt } });
      }
    }
    const notes = rep(slide.notes);
    if (notes !== slide.notes) cmds.push({ op: 'slide.update', slide: slide.id, patch: { notes } });
  }
  return cmds;
}
