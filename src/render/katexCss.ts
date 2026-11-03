/**
 * CSS de KaTeX para el HTML exportado. Solo se incluye si hay fórmulas y, al
 * incrustar, solo las familias tipográficas que se necesitan (woff2 en base64)
 * para que el archivo siga siendo autónomo y ligero.
 */
import katexCss from 'katex/dist/katex.min.css?raw';
import katexPkg from 'katex/package.json';

// Vite emite cada fuente como recurso y devuelve su URL.
const FONT_URLS = import.meta.glob('../../node_modules/katex/dist/fonts/*.woff2', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const BASE = ['KaTeX_Main', 'KaTeX_Math', 'KaTeX_Size1', 'KaTeX_Size2', 'KaTeX_Size3', 'KaTeX_Size4', 'KaTeX_AMS'];
const OPTIONAL: [RegExp, string][] = [
  [/\\mathcal|\\cal\b/, 'KaTeX_Caligraphic'],
  [/\\mathfrak|\\frak\b/, 'KaTeX_Fraktur'],
  [/\\mathsf|\\textsf|\\sf\b/, 'KaTeX_SansSerif'],
  [/\\mathscr/, 'KaTeX_Script'],
  [/\\mathtt|\\texttt|\\tt\b/, 'KaTeX_Typewriter'],
];

function fontUrl(file: string): string | undefined {
  const key = Object.keys(FONT_URLS).find((k) => k.endsWith(`/${file}`));
  return key ? FONT_URLS[key] : undefined;
}

async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  return `data:font/woff2;base64,${dataUrl.slice(dataUrl.indexOf(',') + 1)}`;
}

export async function katexExportCss(texSources: string[], embed: boolean): Promise<string> {
  const all = texSources.join('\n');
  const families = new Set([...BASE, ...OPTIONAL.filter(([re]) => re.test(all)).map(([, f]) => f)]);
  const cdn = `https://cdn.jsdelivr.net/npm/katex@${(katexPkg as { version: string }).version}/dist/fonts/`;
  const faces = [...katexCss.matchAll(/@font-face\{[^}]*\}/g)].map((m) => m[0]);
  let css = katexCss.replace(/@font-face\{[^}]*\}/g, '');
  const out: string[] = [];
  for (const face of faces) {
    const family = /font-family:\s*([\w-]+)/.exec(face)?.[1] ?? '';
    const file = /url\(fonts\/([\w-]+\.woff2)\)/.exec(face)?.[1];
    if (!file || !families.has(family)) continue;
    let src = `url(${cdn}${file}) format("woff2")`;
    if (embed) {
      const url = fontUrl(file);
      if (url) {
        try {
          src = `url(${await toDataUrl(url)}) format("woff2")`;
        } catch {
          /* se usa la CDN */
        }
      }
    }
    out.push(face.replace(/src:[^}]*/, `src:${src}`));
  }
  css = out.join('') + css;
  return css;
}
