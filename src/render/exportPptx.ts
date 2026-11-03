/**
 * Exportación a PowerPoint (.pptx).
 *
 * - Texto, formas, imágenes, tablas y gráficos se crean como objetos nativos y
 *   editables (tablas y gráficos nativos de PowerPoint).
 * - Los fondos que PowerPoint no puede reproducir (efectos animados, degradados,
 *   desenfoques, grano, viñetas) se rasterizan a imagen con html-to-image.
 * - Las notas del orador se conservan.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Background, ChartElement, Presentation, Slide, SlideElement, TableElement, TextElement, Theme } from '../core/model';
import { CHART_PALETTE } from './Chart';
import { resolveIcon, SlideRenderer } from './SlideRenderer';

type Pptx = import('pptxgenjs').default;
type PSlide = import('pptxgenjs').default.Slide;

const IN = 13.333 / 1920; // px → pulgadas (diapositiva 16:9 de 13,333")
const PT = 0.5; // px → puntos (1920 px = 960 pt)

/* ------------------------------------------------------------------ */
/* Colores                                                             */
/* ------------------------------------------------------------------ */

interface PColor {
  color: string;
  transparency: number;
}

function hex(n: number) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}

/** Convierte un color CSS (incl. var(--lm-*), rgba y degradados) a color de PowerPoint. */
export function toPColor(css: string | undefined, theme: Theme): PColor | null {
  if (!css) return null;
  let v = css.trim();
  if (!v || v === 'transparent' || v === 'none') return null;
  const vars: Record<string, string> = {
    '--lm-bg': theme.colors.background,
    '--lm-surface': theme.colors.surface,
    '--lm-text': theme.colors.text,
    '--lm-muted': theme.colors.muted,
    '--lm-primary': theme.colors.primary,
    '--lm-accent': theme.colors.accent,
  };
  // color-mix(in srgb, X N%, transparent) → X con transparencia
  const mix = /color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%\s*,\s*transparent\s*\)/.exec(v);
  if (mix) {
    const base = toPColor(mix[1], theme);
    return base ? { color: base.color, transparency: Math.round(100 - Number(mix[2]) * (1 - base.transparency / 100)) } : null;
  }
  if (/gradient\(/.test(v)) {
    const first = /(#[0-9a-f]{3,8}|rgba?\([^)]+\)|var\(--lm-[a-z]+\))/i.exec(v);
    return first ? toPColor(first[1], theme) : null;
  }
  const varM = /^var\((--lm-[a-z]+)\)$/.exec(v);
  if (varM) v = vars[varM[1]] ?? theme.colors.primary;
  if (/^#[0-9a-f]{3}$/i.test(v)) v = `#${v.slice(1).split('').map((c) => c + c).join('')}`;
  if (/^#[0-9a-f]{6}$/i.test(v)) return { color: v.slice(1).toUpperCase(), transparency: 0 };
  if (/^#[0-9a-f]{8}$/i.test(v)) {
    return { color: v.slice(1, 7).toUpperCase(), transparency: Math.round(100 - (parseInt(v.slice(7), 16) / 255) * 100) };
  }
  const rgb = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/i.exec(v);
  if (rgb) {
    const a = rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4]);
    return { color: (hex(+rgb[1]) + hex(+rgb[2]) + hex(+rgb[3])).toUpperCase(), transparency: Math.round((1 - a) * 100) };
  }
  if (v === 'white' || v === '#fff') return { color: 'FFFFFF', transparency: 0 };
  if (v === 'black') return { color: '000000', transparency: 0 };
  return null;
}

/* ------------------------------------------------------------------ */
/* Recursos                                                            */
/* ------------------------------------------------------------------ */

async function fetchDataUrl(url: string, maxBytes = 60 * 1024 * 1024): Promise<string | null> {
  if (url.startsWith('data:')) return url;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size > maxBytes) return null;
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function svgToPng(svg: string, size: number): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      c.getContext('2d')!.drawImage(img, 0, 0, size, size);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function needsRaster(bg: Background): boolean {
  return (
    bg.type === 'gradient' ||
    bg.type === 'effect' ||
    (bg.type === 'image' && (bg.blur > 0 || bg.brightness !== 100 || bg.saturate !== 100 || bg.hueRotate !== 0)) ||
    bg.overlayOpacity > 0 ||
    bg.grain > 0 ||
    bg.vignette > 0
  );
}

/** Rasteriza solo el fondo de una diapositiva (sin elementos) a JPEG. */
async function rasterBackground(slide: Slide, doc: Presentation): Promise<string | null> {
  const { toJpeg } = await import('html-to-image');
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', left: '-30000px', top: '0', width: `${doc.width}px`, height: `${doc.height}px`, pointerEvents: 'none' });
  // Los videos de fondo no se pueden capturar: se usa su póster o el color base.
  const bg: Background =
    slide.background.type === 'video'
      ? { ...slide.background, type: slide.background.poster ? 'image' : 'color', image: slide.background.poster }
      : slide.background;
  host.innerHTML = renderToStaticMarkup(
    createElement(SlideRenderer, {
      slide: { ...slide, background: bg, elements: [] },
      theme: doc.theme,
      width: doc.width,
      height: doc.height,
      mode: 'thumb',
    }),
  );
  document.body.appendChild(host);
  try {
    await new Promise((r) => setTimeout(r, 60));
    const target = host.firstElementChild as HTMLElement;
    return await toJpeg(target, { quality: 0.9, width: doc.width, height: doc.height, pixelRatio: 1, skipFonts: true, cacheBust: false });
  } catch {
    return null;
  } finally {
    host.remove();
  }
}

/* ------------------------------------------------------------------ */
/* Texto                                                               */
/* ------------------------------------------------------------------ */

type Run = { text: string; options: Record<string, unknown> };

/** Convierte el HTML simple de los textos en "runs" de PowerPoint. */
function htmlToRuns(html: string, base: Record<string, unknown>, upper: boolean): Run[] {
  const runs: Run[] = [];
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const walk = (node: Node, fmt: Record<string, unknown>) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = (child.textContent ?? '').replace(/\s+/g, ' ');
        if (t) runs.push({ text: upper ? t.toUpperCase() : t, options: { ...base, ...fmt } });
        return;
      }
      if (!(child instanceof HTMLElement)) return;
      const tag = child.tagName.toLowerCase();
      const next = { ...fmt };
      if (tag === 'b' || tag === 'strong') next.bold = true;
      if (tag === 'i' || tag === 'em') next.italic = true;
      if (tag === 'u') next.underline = { style: 'sng' };
      if (tag === 's') next.strike = 'sngStrike';
      if (tag === 'a' && child.getAttribute('href')) next.hyperlink = { url: child.getAttribute('href') };
      const color = child.style?.color;
      if (color) {
        const c = /^rgb/.test(color) || color.startsWith('#') || color.startsWith('var(') ? color : '';
        if (c) next.color = c;
      }
      if (tag === 'br') {
        runs.push({ text: '', options: { ...base, ...fmt, breakLine: true } });
        return;
      }
      if (tag === 'li') next.bullet = true;
      walk(child, next);
      if (tag === 'li' || tag === 'p' || tag === 'div') {
        if (runs.length) runs[runs.length - 1].options = { ...runs[runs.length - 1].options, breakLine: true };
      }
    });
  };
  walk(doc.body.firstChild!, {});
  return runs.length ? runs : [{ text: ' ', options: base }];
}

/* ------------------------------------------------------------------ */
/* Elementos                                                           */
/* ------------------------------------------------------------------ */

const box = (el: SlideElement) => ({
  x: el.x * IN,
  y: el.y * IN,
  w: Math.max(1, el.w) * IN,
  h: Math.max(1, el.h) * IN,
  rotate: el.rotation || undefined,
});

function shadowOf(el: SlideElement, theme: Theme) {
  const s = el.style.shadow;
  if (!s) return undefined;
  const c = toPColor(s.color, theme);
  return {
    type: 'outer' as const,
    blur: Math.min(100, s.blur * PT),
    offset: Math.min(200, Math.hypot(s.x, s.y) * PT),
    angle: Math.round(((Math.atan2(s.y, s.x) * 180) / Math.PI + 360) % 360),
    color: c?.color ?? '000000',
    opacity: c ? 1 - c.transparency / 100 : 0.4,
  };
}

function linkOf(el: SlideElement) {
  if (!el.link) return undefined;
  if (el.link.startsWith('#')) return { slide: Number(el.link.slice(1)) || 1 };
  return { url: el.link };
}

function fillOf(el: SlideElement, theme: Theme) {
  const c = toPColor(el.style.fill, theme);
  if (!c) return undefined;
  const t = Math.min(100, c.transparency + Math.round((1 - el.opacity) * (100 - c.transparency)));
  return { color: c.color, transparency: t };
}

function lineOf(el: SlideElement, theme: Theme) {
  if (!el.style.borderWidth) return undefined;
  const c = toPColor(el.style.borderColor, theme);
  if (!c) return undefined;
  return {
    color: c.color,
    transparency: c.transparency,
    width: el.style.borderWidth * PT,
    dashType: el.style.borderStyle === 'dashed' ? ('dash' as const) : el.style.borderStyle === 'dotted' ? ('sysDot' as const) : ('solid' as const),
  };
}

function addText(pptx: Pptx, s: PSlide, el: TextElement, theme: Theme) {
  void pptx;
  const color = toPColor(el.gradient || el.color || theme.colors.text, theme) ?? { color: 'FFFFFF', transparency: 0 };
  const font = el.font || (el.role === 'heading' ? theme.fonts.heading : theme.fonts.body);
  const base: Record<string, unknown> = {
    fontFace: font,
    fontSize: Math.max(1, el.size * PT),
    color: color.color,
    transparency: color.transparency,
    bold: el.weight >= 600,
    italic: el.italic || undefined,
    underline: el.underline ? { style: 'sng' } : undefined,
    charSpacing: el.letterSpacing ? el.letterSpacing * PT : undefined,
  };
  const runs = htmlToRuns(el.html, base, el.transform === 'uppercase').map((r) => {
    if (typeof r.options.color === 'string' && !/^[0-9A-F]{6}$/.test(r.options.color as string)) {
      const c = toPColor(r.options.color as string, theme);
      r.options.color = c?.color ?? color.color;
    }
    return r;
  });
  s.addText(runs as never, {
    ...box(el),
    align: el.align,
    valign: el.valign === 'middle' ? 'middle' : el.valign === 'bottom' ? 'bottom' : 'top',
    lineSpacingMultiple: el.lineHeight,
    margin: el.padding * PT,
    fill: fillOf(el, theme),
    line: lineOf(el, theme),
    rectRadius: el.style.radius ? Math.min(0.5, (el.style.radius / Math.min(el.w, el.h)) ) : undefined,
    shape: el.style.radius ? ('roundRect' as never) : undefined,
    shadow: shadowOf(el, theme),
    hyperlink: linkOf(el),
    fit: 'none',
    paraSpaceAfter: 0,
  } as never);
}

const SHAPE_MAP: Record<string, string> = {
  rect: 'rect',
  ellipse: 'ellipse',
  triangle: 'triangle',
  diamond: 'diamond',
  pentagon: 'pentagon',
  hexagon: 'hexagon',
  star: 'star5',
  arrow: 'rightArrow',
  chevron: 'chevron',
  cross: 'plus',
  blob: 'ellipse',
  line: 'rect',
};

function addChart(pptx: Pptx, s: PSlide, el: ChartElement, theme: Theme) {
  const circular = el.chart === 'donut' || el.chart === 'pie';
  const type = el.chart === 'column' || el.chart === 'bar' ? pptx.ChartType.bar : el.chart === 'line' ? pptx.ChartType.line : el.chart === 'area' ? pptx.ChartType.area : el.chart === 'donut' ? pptx.ChartType.doughnut : pptx.ChartType.pie;
  const series = circular ? el.series.slice(0, 1) : el.series;
  const data = series.map((sr) => ({ name: sr.name, labels: el.labels, values: el.labels.map((_, i) => sr.values[i] ?? 0) }));
  const palette = (circular ? el.labels.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]) : series.map((sr, i) => sr.color || CHART_PALETTE[i % CHART_PALETTE.length]))
    .map((c) => toPColor(c, theme)?.color ?? toPColor(theme.colors.primary, theme)!.color);
  const text = toPColor(el.textColor || theme.colors.muted, theme)?.color ?? '999999';
  const fmt = `${el.prefix ? `"${el.prefix}"` : ''}#,##0.##${el.suffix ? `"${el.suffix}"` : ''}`;
  s.addChart(type, data, {
    ...box(el),
    barDir: el.chart === 'bar' ? 'bar' : 'col',
    chartColors: palette,
    chartColorsOpacity: el.chart === 'area' && series.length > 1 ? 65 : undefined,
    showValue: el.showValues,
    showPercent: circular && el.showValues && !el.prefix && !el.suffix,
    showLegend: el.showLegend,
    legendPos: circular ? 'r' : 't',
    legendColor: text,
    legendFontSize: el.fontSize * PT,
    dataLabelColor: circular ? 'FFFFFF' : toPColor(theme.colors.text, theme)?.color,
    dataLabelFontSize: el.fontSize * PT * 0.85,
    dataLabelFormatCode: fmt,
    catAxisLabelColor: text,
    valAxisLabelColor: text,
    catAxisLabelFontSize: el.fontSize * PT,
    valAxisLabelFontSize: el.fontSize * PT * 0.8,
    valAxisHidden: !el.showGrid,
    valGridLine: el.showGrid ? { color: text, style: 'dash', size: 0.5 } : { style: 'none' },
    catGridLine: { style: 'none' },
    valAxisLabelFormatCode: fmt,
    lineSize: Math.max(1, el.fontSize * 0.12),
    lineSmooth: el.smooth,
    lineDataSymbolSize: Math.max(4, el.fontSize * 0.3),
    holeSize: Math.round((1 - el.thickness * 0.6) * 100),
    barGapWidthPct: Math.round((1 - el.thickness) * 300),
    dataLabelPosition: circular ? 'ctr' : undefined,
  } as never);
}

function addTable(s: PSlide, el: TableElement, theme: Theme) {
  const cols = Math.max(1, ...el.rows.map((r) => r.length));
  const head = toPColor(el.headerFill || theme.colors.primary, theme);
  const headText = toPColor(el.headerColor, theme)?.color ?? 'FFFFFF';
  const text = toPColor(el.textColor || theme.colors.text, theme)?.color ?? 'FFFFFF';
  const line = toPColor(el.lineColor || theme.colors.muted, theme)?.color ?? '888888';
  const hl = toPColor(theme.colors.accent, theme)?.color;
  const strip = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const rows = el.rows.map((row, ri) =>
    Array.from({ length: cols }, (_, ci) => {
      const isHead = el.header && ri === 0;
      const isHl = ci === el.highlightColumn;
      return {
        text: strip(row[ci] ?? ''),
        options: {
          bold: isHead || isHl || (el.firstColumn && ci === 0) || /<b>|<strong>/.test(row[ci] ?? ''),
          color: isHead ? headText : text,
          fill: isHead
            ? { color: head?.color ?? '7C5CFF' }
            : isHl && hl
              ? { color: hl, transparency: 80 }
              : el.striped && ri % 2 === 0
                ? { color: text, transparency: 94 }
                : undefined,
        },
      };
    }),
  );
  s.addTable(rows as never, {
    ...box(el),
    colW: Array(cols).fill((el.w * IN) / cols),
    fontFace: theme.fonts.body,
    fontSize: el.fontSize * PT,
    align: el.align,
    valign: 'middle',
    border: { type: 'solid', pt: 0.75, color: line },
    margin: (el.fontSize * PT) / 2,
  } as never);
}

async function addElement(pptx: Pptx, s: PSlide, el: SlideElement, theme: Theme) {
  if (el.hidden) return;
  switch (el.type) {
    case 'text':
      return addText(pptx, s, el, theme);
    case 'shape': {
      const radius = el.shape === 'rect' && el.style.radius;
      s.addShape((radius ? 'roundRect' : SHAPE_MAP[el.shape] ?? 'rect') as never, {
        ...box(el),
        fill: fillOf(el, theme) ?? { color: 'FFFFFF', transparency: 100 },
        line: lineOf(el, theme) ?? { type: 'none' },
        rectRadius: radius ? Math.min(0.5, el.style.radius / Math.min(el.w, el.h)) : undefined,
        shadow: shadowOf(el, theme),
        hyperlink: linkOf(el),
      } as never);
      return;
    }
    case 'image': {
      const data = el.src ? await fetchDataUrl(el.src) : null;
      if (!data) return;
      s.addImage({
        data,
        ...box(el),
        sizing: { type: el.fit === 'contain' ? 'contain' : 'cover', w: el.w * IN, h: el.h * IN },
        rounding: el.style.radius >= Math.min(el.w, el.h) / 2 || undefined,
        transparency: Math.round((1 - el.opacity) * 100) || undefined,
        hyperlink: linkOf(el),
        altText: el.alt || undefined,
      } as never);
      return;
    }
    case 'video': {
      const data = el.src ? await fetchDataUrl(el.src) : null;
      if (data) {
        const ext = /webm/.test(data.slice(0, 40)) ? 'webm' : 'mp4';
        s.addMedia({ type: 'video', data, extn: ext, ...box(el) } as never);
      } else {
        s.addText(`▶ Video: ${el.src}`, { ...box(el), fill: { color: '111111' }, color: 'FFFFFF', align: 'center', valign: 'middle', fontSize: 18, hyperlink: el.src ? { url: el.src } : undefined } as never);
      }
      return;
    }
    case 'icon': {
      const Icon = resolveIcon(el.icon);
      const color = toPColor(el.color || theme.colors.primary, theme)?.color ?? 'FFFFFF';
      const svg = renderToStaticMarkup(createElement(Icon, { size: 512, color: `#${color}`, strokeWidth: el.strokeWidth }));
      const png = await svgToPng(svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'), 512);
      const fill = fillOf(el, theme);
      if (fill) {
        s.addShape((el.style.radius ? 'roundRect' : 'rect') as never, {
          ...box(el),
          fill,
          line: lineOf(el, theme) ?? { type: 'none' },
          rectRadius: el.style.radius ? Math.min(0.5, el.style.radius / Math.min(el.w, el.h)) : undefined,
        } as never);
      }
      if (png) {
        const pad = el.padding;
        const size = Math.max(1, Math.min(el.w, el.h) - pad * 2);
        s.addImage({
          data: png,
          x: (el.x + (el.w - size) / 2) * IN,
          y: (el.y + (el.h - size) / 2) * IN,
          w: size * IN,
          h: size * IN,
          rotate: el.rotation || undefined,
          hyperlink: linkOf(el),
        } as never);
      }
      return;
    }
    case 'embed':
      s.addText(`🌐 ${el.url || 'Contenido web'}`, {
        ...box(el),
        fill: { color: '1C1D29' },
        color: 'B4B7C8',
        align: 'center',
        valign: 'middle',
        fontSize: 16,
        hyperlink: el.url ? { url: el.url } : undefined,
      } as never);
      return;
    case 'chart':
      return addChart(pptx, s, el, theme);
    case 'table':
      return addTable(s, el, theme);
  }
}

/* ------------------------------------------------------------------ */
/* Documento                                                           */
/* ------------------------------------------------------------------ */

export async function buildPptx(doc: Presentation, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = doc.title;
  pptx.company = 'Lumen Slides';
  pptx.theme = { headFontFace: doc.theme.fonts.heading, bodyFontFace: doc.theme.fonts.body };
  const theme = doc.theme;
  const total = doc.slides.length;
  for (let i = 0; i < total; i++) {
    const slide = doc.slides[i];
    const s = pptx.addSlide();
    if (slide.hidden) (s as unknown as { hidden: boolean }).hidden = true;
    const bg = slide.background;
    const base = toPColor(bg.color || theme.colors.background, theme) ?? { color: '000000', transparency: 0 };
    let done = false;
    if (needsRaster(bg) || (bg.type === 'video' && bg.poster)) {
      const img = await rasterBackground(slide, doc);
      if (img) {
        s.background = { data: img };
        done = true;
      }
    }
    if (!done && bg.type === 'image' && bg.image) {
      const data = await fetchDataUrl(bg.image);
      if (data) {
        s.background = { data };
        done = true;
      }
    }
    if (!done) s.background = { color: base.color };
    for (const el of slide.elements) {
      try {
        await addElement(pptx, s, el, theme);
      } catch (err) {
        console.warn('No se pudo exportar el elemento', el.id, err);
      }
    }
    if (slide.notes) s.addNotes(slide.notes);
    onProgress?.(i + 1, total);
  }
  return (await pptx.write({ outputType: 'blob' })) as Blob;
}
