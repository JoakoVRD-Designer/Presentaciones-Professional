import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { Presentation } from '../core/model';
import { GOOGLE_FONTS_URL } from '../core/themes';
import slideCss from '../runtime/slide.css?raw';
import playerCss from '../runtime/player.css?raw';
import playerJs from '../runtime/player.js?raw';
import { Deck } from './Deck';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function toDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Sustituye recursos locales (/assets, blob:) por data: URIs para que el HTML sea autónomo. */
async function inlineLocalAssets(doc: Presentation, embedRemote: boolean): Promise<Presentation> {
  const urls = new Set<string>();
  const json = JSON.stringify(doc);
  const re = /"((?:\/assets\/|blob:)[^"]+|https?:\/\/[^"]+\.(?:png|jpe?g|webp|gif|svg|avif)(?:\?[^"]*)?)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(json))) {
    if (m[1].startsWith('http') && !embedRemote) continue;
    urls.add(m[1]);
  }
  let out = json;
  for (const url of urls) {
    try {
      const data = await toDataUrl(url);
      out = out.split(JSON.stringify(url).slice(1, -1)).join(data);
    } catch {
      /* si falla, se deja la URL original */
    }
  }
  return JSON.parse(out) as Presentation;
}

export interface ExportOptions {
  /** Incrusta también imágenes remotas (http) como data: URIs. */
  embedRemoteImages?: boolean;
}

export async function buildStandaloneHtml(input: Presentation, options: ExportOptions = {}): Promise<string> {
  const doc = await inlineLocalAssets(input, !!options.embedRemoteImages);
  const markup = renderToStaticMarkup(createElement(Deck, { doc, mode: 'export' }));
  const config = {
    width: doc.width,
    height: doc.height,
    loop: doc.settings.loop,
    autoAdvance: doc.settings.autoAdvance,
    progress: doc.settings.progress,
    slideNumbers: doc.settings.slideNumbers,
    sounds: doc.settings.sounds,
    controls: doc.settings.controls,
    hash: true,
  };
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Lumen Slides">
<title>${escapeHtml(doc.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${GOOGLE_FONTS_URL}">
<style>
html,body{margin:0;height:100%;background:#000;overflow:hidden}
${slideCss}
${playerCss}
</style>
</head>
<body>
${markup}
<script type="module">
${playerJs}
const deck = document.querySelector('.lm-deck');
window.lumenPlayer = createPlayer(deck, ${JSON.stringify(config)});
deck.focus();
</script>
<script type="application/json" id="lumen-document">${JSON.stringify(input).replace(/</g, '\\u003c')}</script>
</body>
</html>`;
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
