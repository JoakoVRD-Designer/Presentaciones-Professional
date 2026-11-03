/**
 * Sanitizador HTML mínimo y sin dependencias (funciona en navegador y Node).
 * Solo deja pasar etiquetas de formato de texto y estilos inline seguros.
 */
const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'br', 'span', 'a', 'ul', 'ol', 'li', 'p', 'div',
  'small', 'sup', 'sub', 'mark', 'code', 'font',
]);

const ALLOWED_CSS = new Set([
  'color', 'background', 'background-color', 'font-weight', 'font-style', 'text-decoration',
  'font-size', 'font-family', 'opacity', 'letter-spacing', 'text-transform', 'line-height',
  '-webkit-text-fill-color', 'background-clip', '-webkit-background-clip', 'text-align',
]);

function cleanStyle(style: string): string {
  return style
    .split(';')
    .map((decl) => {
      const idx = decl.indexOf(':');
      if (idx < 0) return '';
      const prop = decl.slice(0, idx).trim().toLowerCase();
      const value = decl.slice(idx + 1).trim();
      if (!ALLOWED_CSS.has(prop)) return '';
      if (/url\s*\(|expression|javascript:|[<>]/i.test(value)) return '';
      return `${prop}: ${value}`;
    })
    .filter(Boolean)
    .join('; ');
}

function attr(attrs: string, name: string): string | null {
  const re = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = re.exec(attrs);
  if (!m) return null;
  return m[2] ?? m[3] ?? m[4] ?? '';
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function sanitizeHtml(input: string): string {
  if (!input) return '';
  let out = '';
  let last = 0;
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^<>]*)>|<!--[\s\S]*?-->/g;
  const skipDepth: string[] = [];
  let m: RegExpExecArray | null;
  const emitText = (t: string) => {
    if (skipDepth.length) return;
    out += t.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  while ((m = tagRe.exec(input))) {
    emitText(input.slice(last, m.index));
    last = tagRe.lastIndex;
    if (!m[2]) continue; // comentario
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object' || tag === 'template') {
      if (closing) skipDepth.pop();
      else if (!/\/\s*$/.test(m[3])) skipDepth.push(tag);
      continue;
    }
    if (skipDepth.length || !ALLOWED_TAGS.has(tag)) continue;
    const t = tag === 'font' ? 'span' : tag;
    if (closing) {
      if (t !== 'br') out += `</${t}>`;
      continue;
    }
    let attrs = '';
    const style = attr(m[3], 'style');
    const fontColor = tag === 'font' ? attr(m[3], 'color') : null;
    const css = [style ? cleanStyle(style) : '', fontColor ? `color: ${fontColor.replace(/[;<>"]/g, '')}` : '']
      .filter(Boolean)
      .join('; ');
    if (css) attrs += ` style="${escapeAttr(css)}"`;
    if (t === 'a') {
      const href = attr(m[3], 'href') ?? '';
      if (/^(https?:|mailto:|#)/i.test(href.trim())) {
        attrs += ` href="${escapeAttr(href.trim())}" target="_blank" rel="noopener noreferrer"`;
      }
    }
    out += t === 'br' ? '<br>' : `<${t}${attrs}>`;
  }
  emitText(input.slice(last));
  return out;
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}
