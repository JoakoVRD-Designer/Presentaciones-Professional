/**
 * Localiza y reemplaza los recursos multimedia de un documento (imágenes,
 * videos, audio, animaciones Lottie...). Lo usan la exportación HTML
 * autocontenida, la importación y el render de video.
 */
import type { Presentation } from './model';

export type MediaKind = 'image' | 'video' | 'audio' | 'lottie';

export interface MediaRef {
  url: string;
  kind: MediaKind;
}

type Json = Record<string, unknown>;

/** Campos con medios en el fondo de una diapositiva. */
const BG_FIELDS: [string, MediaKind][] = [
  ['image', 'image'],
  ['video', 'video'],
  ['poster', 'image'],
];

/** Campos con medios por tipo de elemento. */
const ELEMENT_FIELDS: Record<string, [string, MediaKind][]> = {
  image: [['src', 'image']],
  video: [
    ['src', 'video'],
    ['poster', 'image'],
  ],
  lottie: [['src', 'lottie']],
  audio: [['src', 'audio']],
};

function visitSlide(slide: Json, fn: (holder: Json, key: string, kind: MediaKind) => void) {
  const bg = slide.background as Json | undefined;
  if (bg) for (const [k, kind] of BG_FIELDS) if (typeof bg[k] === 'string' && bg[k]) fn(bg, k, kind);
  const narration = slide.narration as Json | undefined;
  if (narration && typeof narration.src === 'string' && narration.src) fn(narration, 'src', 'audio');
  for (const el of (slide.elements as Json[] | undefined) ?? []) {
    for (const [k, kind] of ELEMENT_FIELDS[String(el.type)] ?? []) {
      if (typeof el[k] === 'string' && el[k]) fn(el, k, kind);
    }
  }
}

function visit(doc: Json, fn: (holder: Json, key: string, kind: MediaKind) => void) {
  const music = (doc.settings as Json | undefined)?.music as Json | undefined;
  if (music && typeof music.src === 'string' && music.src) fn(music, 'src', 'audio');
  if (doc.master) visitSlide(doc.master as Json, fn);
  for (const slide of (doc.slides as Json[] | undefined) ?? []) visitSlide(slide, fn);
}

/** Lista única de recursos del documento. */
export function collectMedia(doc: Presentation): MediaRef[] {
  const seen = new Map<string, MediaRef>();
  visit(doc as unknown as Json, (holder, key, kind) => {
    const url = String(holder[key]);
    if (!seen.has(url)) seen.set(url, { url, kind });
  });
  return [...seen.values()];
}

/** Devuelve una copia del documento con cada URL de medio transformada. */
export function mapMedia(doc: Presentation, fn: (url: string, kind: MediaKind) => string): Presentation {
  const copy = JSON.parse(JSON.stringify(doc)) as Json;
  visit(copy, (holder, key, kind) => {
    holder[key] = fn(String(holder[key]), kind);
  });
  return copy as unknown as Presentation;
}

/** Recursos servidos por la propia app (subidas, animaciones incluidas) o ya en memoria. */
export const isLocalUrl = (url: string) =>
  (url.startsWith('/') && !url.startsWith('//')) || url.startsWith('blob:') || url.startsWith('data:');

/** Texto visible de todo el documento (para subconjuntos de fuentes). */
export function collectText(doc: Presentation): string {
  const parts: string[] = [doc.title];
  const strip = (h: string) =>
    h
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  const slides = [...doc.slides, ...((doc as unknown as { master?: typeof doc.slides[number] }).master ? [(doc as unknown as { master: typeof doc.slides[number] }).master] : [])];
  for (const s of slides) {
    for (const el of s.elements as unknown as Json[]) {
      for (const v of Object.values(el)) {
        if (typeof v === 'string') parts.push(strip(v));
        else if (Array.isArray(v)) parts.push(strip(JSON.stringify(v)));
      }
    }
  }
  return parts.join(' ');
}
