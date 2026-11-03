/**
 * Exportación a un único archivo HTML.
 *
 * El .html es el formato de la presentación: se abre en cualquier navegador
 * sin instalar nada y se puede volver a abrir y editar en Lumen.
 * - Las tipografías se incrustan como subconjuntos de Google Fonts que solo
 *   contienen los caracteres usados (archivos de pocos KB).
 * - Cada imagen, video o audio se guarda una sola vez (base64) y el runtime lo
 *   convierte en un blob al abrir; el documento editable referencia esos medios.
 * - Si se incrusta todo, el archivo no hace ninguna petición externa.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { collectMedia, collectText, isLocalUrl, mapMedia, type MediaKind } from '../core/media';
import type { Presentation } from '../core/model';
import { googleFontsUrl } from '../core/themes';
import playerCss from '../runtime/player.css?raw';
import playerJs from '../runtime/player.js?raw';
import slideCss from '../runtime/slide.css?raw';
import { Deck } from './Deck';
import { SlideRenderer } from './SlideRenderer';

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface ExportOptions {
  /** Incrusta las tipografías (subconjunto con los caracteres usados). */
  embedFonts?: boolean;
  /** Incrusta las imágenes remotas (las locales siempre se incrustan). */
  embedImages?: boolean;
  /** Incrusta videos, audio y animaciones remotos (pueden pesar mucho). */
  embedMedia?: boolean;
  /** Avance automático en segundos para modo kiosco (0 = según la presentación). */
  autoplay?: number;
  loop?: boolean;
  controls?: boolean;
  /** Incluye el documento editable para reabrirlo en Lumen. */
  editable?: boolean;
  onProgress?: (message: string) => void;
}

export interface ExportResult {
  html: string;
  bytes: number;
  embedded: number;
  external: string[];
  failed: string[];
  fonts: 'embedded' | 'linked' | 'failed';
}

const MAX_EMBED_BYTES = 400 * 1024 * 1024;

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

async function fetchBlob(url: string): Promise<Blob> {
  if (url.startsWith('data:')) return await (await fetch(url)).blob();
  const res = await fetch(url, { mode: url.startsWith('http') ? 'cors' : 'same-origin' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.blob();
}

function guessMime(url: string, kind: MediaKind, blobType: string): string {
  if (blobType && blobType !== 'application/octet-stream') return blobType;
  const ext = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    avif: 'image/avif',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    json: 'application/json',
  };
  return map[ext] ?? (kind === 'image' ? 'image/jpeg' : kind === 'video' ? 'video/mp4' : kind === 'audio' ? 'audio/mpeg' : 'application/json');
}

/** CSS @font-face con las fuentes usadas incrustadas como data: URIs. */
async function buildFontCss(doc: Presentation, embed: boolean): Promise<{ css: string; status: ExportResult['fonts'] }> {
  const families = new Set<string>([doc.theme.fonts.heading, doc.theme.fonts.body, 'Inter']);
  const scan = (els: Presentation['slides'][number]['elements']) => {
    for (const el of els) {
      if (el.type === 'text' && el.font) families.add(el.font);
      const font = (el as unknown as { font?: string }).font;
      if (font) families.add(font);
      if ((el as { type: string }).type === 'code') families.add('JetBrains Mono');
    }
  };
  doc.slides.forEach((s) => scan(s.elements));
  const master = (doc as unknown as { master?: { elements: Presentation['slides'][number]['elements'] } }).master;
  if (master) scan(master.elements);
  if (!embed) return { css: `@import url("${googleFontsUrl([...families])}");`, status: 'linked' };
  // Caracteres usados + los del reproductor (contador, cifras animadas).
  const chars = [...new Set(`${collectText(doc)} 0123456789/%$€.,:;-–—+×·…()!?¿¡"'«»`)].join('');
  try {
    const res = await fetch(googleFontsUrl([...families], chars));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let css = await res.text();
    const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
    for (const url of urls) {
      const b64 = await blobToBase64(await fetchBlob(url));
      css = css.split(url).join(`data:font/woff2;base64,${b64}`);
    }
    return { css, status: 'embedded' };
  } catch {
    return { css: `@import url("${googleFontsUrl([...families])}");`, status: 'failed' };
  }
}

/** Runtime: convierte los medios incrustados en blobs y los asigna antes de iniciar el reproductor. */
const MEDIA_RUNTIME = `
const lumenMediaUrls = {};
for (const s of document.querySelectorAll('script[type="application/x-lumen-media"]')) {
  try {
    const bin = atob(s.textContent.trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    lumenMediaUrls[s.dataset.id] = URL.createObjectURL(new Blob([bytes], { type: s.dataset.mime }));
  } catch (e) { console.warn('Medio dañado', s.dataset.id, e); }
}
const lumenFix = (v) => v.replace(/lumen-media:([\\w-]+)/g, (_, id) => lumenMediaUrls[id] || '');
for (const el of document.querySelectorAll('[data-lm-src]')) { el.setAttribute('src', lumenFix(el.dataset.lmSrc)); if (el.load) el.load(); }
for (const el of document.querySelectorAll('[data-lm-poster]')) el.setAttribute('poster', lumenFix(el.dataset.lmPoster));
for (const el of document.querySelectorAll('[data-lm-bg]')) el.style.backgroundImage = 'url("' + lumenFix(el.dataset.lmBg) + '")';
for (const el of document.querySelectorAll('[data-lm-data]')) el.dataset.src = lumenFix(el.dataset.lmData);
window.lumenMedia = lumenMediaUrls;
`;

/** Evita que el navegador intente cargar "lumen-media:" antes de que el runtime los resuelva. */
function deferMediaAttributes(markup: string): string {
  return markup
    .replace(/\ssrc="(lumen-media:[\w-]+)"/g, ' data-lm-src="$1"')
    .replace(/\sposter="(lumen-media:[\w-]+)"/g, ' data-lm-poster="$1"')
    .replace(/\sdata-src="(lumen-media:[\w-]+)"/g, ' data-lm-data="$1"')
    .replace(
      /<([a-z]+)([^>]*?)style="([^"]*?)background-image:url\((?:&quot;|")?(lumen-media:[\w-]+)(?:&quot;|")?\);?([^"]*)"/g,
      (_m, tag: string, before: string, s1: string, id: string, s2: string) => `<${tag}${before}data-lm-bg="${id}" style="${s1}${s2}"`,
    );
}

export async function exportHtml(input: Presentation, options: ExportOptions = {}): Promise<ExportResult> {
  const opts = { embedFonts: true, embedImages: true, embedMedia: false, autoplay: 0, loop: input.settings.loop, controls: input.settings.controls, editable: true, ...options };
  const progress = opts.onProgress ?? (() => {});
  const failed: string[] = [];
  const external: string[] = [];
  const payloads: { id: string; mime: string; b64: string }[] = [];
  const idByUrl = new Map<string, string>();
  let total = 0;

  const refs = collectMedia(input);
  let i = 0;
  for (const ref of refs) {
    i++;
    const local = isLocalUrl(ref.url);
    const want = local || (ref.kind === 'image' ? opts.embedImages : opts.embedMedia);
    if (!want) {
      external.push(ref.url);
      continue;
    }
    progress(`Incrustando medios ${i}/${refs.length}…`);
    try {
      const blob = await fetchBlob(ref.url);
      total += blob.size;
      if (total > MAX_EMBED_BYTES) throw new Error('El archivo superaría 400 MB');
      const id = `m${payloads.length + 1}`;
      payloads.push({ id, mime: guessMime(ref.url, ref.kind, blob.type), b64: await blobToBase64(blob) });
      idByUrl.set(ref.url, id);
    } catch {
      failed.push(ref.url);
      if (!local) external.push(ref.url);
    }
  }
  const doc = mapMedia(input, (url) => (idByUrl.has(url) ? `lumen-media:${idByUrl.get(url)}` : url));

  progress('Incrustando tipografías…');
  const fonts = await buildFontCss(input, opts.embedFonts);

  progress('Componiendo el archivo…');
  const markup = deferMediaAttributes(renderToStaticMarkup(createElement(Deck, { doc, mode: 'export' })));
  const config = {
    width: doc.width,
    height: doc.height,
    loop: opts.loop,
    autoAdvance: opts.autoplay || doc.settings.autoAdvance,
    progress: doc.settings.progress,
    slideNumbers: doc.settings.slideNumbers,
    sounds: doc.settings.sounds,
    controls: opts.controls,
    hash: true,
    music: (doc.settings as unknown as { music?: unknown }).music ?? null,
  };
  const mediaScripts = payloads
    .map((p) => `<script type="application/x-lumen-media" data-id="${p.id}" data-mime="${escapeHtml(p.mime)}">${p.b64}</script>`)
    .join('\n');
  const editableDoc = opts.editable
    ? `<script type="application/json" id="lumen-document">${JSON.stringify(doc).replace(/</g, '\\u003c')}</script>`
    : '';

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="generator" content="Lumen Slides">
<meta name="lumen-format" content="2">
<title>${escapeHtml(doc.title)}</title>
<style>
${fonts.css}
html,body{margin:0;height:100%;background:#000;overflow:hidden}
${slideCss}
${playerCss}
</style>
</head>
<body>
${markup}
${mediaScripts}
${editableDoc}
<script type="module">
${MEDIA_RUNTIME}
${playerJs}
const deck = document.querySelector('.lm-deck');
window.lumenPlayer = createPlayer(deck, ${JSON.stringify(config)});
deck.focus();
</script>
</body>
</html>`;
  return { html, bytes: new Blob([html]).size, embedded: payloads.length, external: [...new Set(external)], failed, fonts: fonts.status };
}

/** Compatibilidad: HTML con las opciones por defecto. */
export async function buildStandaloneHtml(doc: Presentation, options: ExportOptions = {}): Promise<string> {
  return (await exportHtml(doc, options)).html;
}

/** Lee un .html exportado por Lumen: documento + medios incrustados. */
export function parseLumenHtml(text: string): { doc: unknown; media: Map<string, { mime: string; b64: string }> } {
  const m = /<script type="application\/json" id="lumen-document">([\s\S]*?)<\/script>/.exec(text);
  if (!m) throw new Error('Este HTML no contiene un documento de Lumen');
  const media = new Map<string, { mime: string; b64: string }>();
  for (const mm of text.matchAll(/<script type="application\/x-lumen-media" data-id="([\w-]+)" data-mime="([^"]+)">([\s\S]*?)<\/script>/g)) {
    media.set(mm[1], { mime: mm[2].replace(/&amp;/g, '&'), b64: mm[3].trim() });
  }
  return { doc: JSON.parse(m[1]), media };
}

/* ------------------------------------------------------------------ */
/* Impresión / PDF                                                     */
/* ------------------------------------------------------------------ */

/** HTML con una página por diapositiva (estado final, sin animaciones) para imprimir o guardar como PDF. */
export function buildPrintHtml(doc: Presentation): string {
  const pages = doc.slides
    .filter((s) => !s.hidden)
    .map(
      (slide, i) =>
        `<section class="page">${renderToStaticMarkup(
          createElement(SlideRenderer, {
            slide,
            theme: doc.theme,
            width: doc.width,
            height: doc.height,
            mode: 'thumb',
            master: (doc as unknown as { master?: Presentation['slides'][number] }).master,
            context: { index: i, total: doc.slides.length, title: doc.title },
          } as never),
        )}</section>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title>
<link rel="stylesheet" href="${googleFontsUrl()}">
<style>
@page { size: ${doc.width}px ${doc.height}px; margin: 0; }
html, body { margin: 0; background: #000; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: ${doc.width}px; height: ${doc.height}px; overflow: hidden; position: relative; break-after: page; page-break-after: always; }
.page:last-child { break-after: auto; page-break-after: auto; }
.lm-fx, .lm-fx *, .lm-bg-grain, .lm-kenburns { animation-play-state: paused !important; }
${slideCss}
</style></head><body>${pages}</body></html>`;
}

/** Abre el diálogo de impresión (permite «Guardar como PDF»). */
export async function printDocument(doc: Presentation): Promise<void> {
  const local = collectMedia(doc).filter((r) => r.url.startsWith('blob:'));
  const map = new Map<string, string>();
  for (const r of local) {
    try {
      map.set(r.url, `data:${(await fetchBlob(r.url)).type};base64,${await blobToBase64(await fetchBlob(r.url))}`);
    } catch {
      /* se deja la URL */
    }
  }
  const html = buildPrintHtml(mapMedia(doc, (u) => map.get(u) ?? u));
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: `${doc.width}px`, height: `${doc.height}px`, border: '0' });
  document.body.appendChild(frame);
  const win = frame.contentWindow!;
  win.document.open();
  win.document.write(html);
  win.document.close();
  await Promise.race([
    Promise.all([
      win.document.fonts?.ready,
      ...Array.from(win.document.images).map((img) => (img.complete ? null : new Promise((r) => (img.onload = img.onerror = r)))),
    ]),
    new Promise((r) => setTimeout(r, 4000)),
  ]);
  await new Promise((r) => setTimeout(r, 300));
  win.focus();
  win.print();
  setTimeout(() => frame.remove(), 1500);
}

export function downloadFile(name: string, content: string | Blob, type = 'text/html') {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'presentacion'
  );
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
