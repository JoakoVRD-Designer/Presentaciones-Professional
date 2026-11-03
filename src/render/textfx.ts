/**
 * Utilidades de texto para el renderizador:
 * - splitHtml: texto cinético (envuelve líneas, palabras o letras en piezas
 *   animables, respetando las etiquetas HTML y las entidades).
 * - replaceTokens: variables de la diapositiva maestra ({n}, {total}, {title}, {date}).
 */

export type SplitMode = 'lines' | 'words' | 'chars';

const BLOCK_TAGS = /^(p|div|li|ul|ol)$/i;
const TOKEN_RE = /(<[^>]+>)|(&[a-z0-9#]+;)|(\s+)|([^<&\s]+)/gi;

/** Divide los caracteres de una palabra respetando entidades HTML y pares sustitutos. */
function splitChars(word: string): string[] {
  const out: string[] = [];
  const re = /&[a-z0-9#]+;|[\s\S]/giu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(word))) out.push(m[0]);
  return out;
}

export function splitHtml(html: string, mode: SplitMode): string {
  let j = 0;
  const piece = (content: string, extra = '') => `<span class="lm-sw${extra}" style="--j:${j++}">${content}</span>`;

  if (mode === 'lines') {
    let out = '';
    let open = false;
    const close = () => {
      if (open) {
        out += '</span>';
        open = false;
      }
    };
    const parts = html.split(/(<[^>]+>)/g).filter(Boolean);
    for (const part of parts) {
      const tag = /^<\/?\s*([a-z0-9]+)/i.exec(part);
      if (tag && (/^br$/i.test(tag[1]) || BLOCK_TAGS.test(tag[1]))) {
        close();
        if (!/^br$/i.test(tag[1])) out += part;
        continue;
      }
      if (!open && (tag || part.trim())) {
        out += `<span class="lm-sw lm-line" style="--j:${j++}">`;
        open = true;
      }
      out += part;
    }
    close();
    return out;
  }

  let out = '';
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  let pendingEntityWord = '';
  const flushWord = (word: string) => {
    if (!word) return '';
    if (mode === 'words') return piece(word);
    return `<span class="lm-word">${splitChars(word)
      .map((c) => piece(c))
      .join('')}</span>`;
  };
  while ((m = TOKEN_RE.exec(html))) {
    if (m[1]) {
      out += flushWord(pendingEntityWord);
      pendingEntityWord = '';
      out += m[1];
    } else if (m[3]) {
      out += flushWord(pendingEntityWord);
      pendingEntityWord = '';
      out += m[3];
    } else {
      // Palabras y entidades contiguas forman una sola palabra (p. ej. "R&amp;D").
      pendingEntityWord += m[2] ?? m[4];
    }
  }
  out += flushWord(pendingEntityWord);
  return out;
}

export interface SlideContext {
  index: number;
  total: number;
  title: string;
}

export function replaceTokens(html: string, ctx?: SlideContext): string {
  if (!ctx || !html.includes('{')) return html;
  return html
    .replace(/\{n\}/g, String(ctx.index + 1))
    .replace(/\{total\}/g, String(ctx.total))
    .replace(/\{title\}/g, ctx.title.replace(/&/g, '&amp;').replace(/</g, '&lt;'))
    .replace(/\{date\}/g, new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }));
}
