/**
 * Saneador de SVG sin dependencias (navegador y Node). Deja pasar formas,
 * degradados, filtros, máscaras, texto y animaciones SMIL seguras; elimina
 * scripts, manejadores de eventos, <foreignObject>, <style> y cualquier
 * recurso externo. También prefija los ids para que varias ilustraciones con
 * los mismos ids internos (p. ej. "g") no choquen en la misma página.
 */

const TAGS = new Map(
  [
    'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'textPath',
    'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern', 'use', 'symbol', 'title', 'desc',
    'marker', 'image', 'filter', 'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix', 'feComposite', 'feFlood',
    'feMerge', 'feMergeNode', 'feDropShadow', 'feTurbulence', 'feDisplacementMap', 'feMorphology', 'feComponentTransfer',
    'feFuncR', 'feFuncG', 'feFuncB', 'feFuncA', 'feSpecularLighting', 'feDiffuseLighting', 'fePointLight',
    'feDistantLight', 'feSpotLight', 'feTile', 'feImage', 'animate', 'animateTransform', 'animateMotion', 'mpath',
  ].map((t) => [t.toLowerCase(), t]),
);

const ATTRS = new Set(
  [
    'id', 'class', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'fr', 'width', 'height',
    'viewbox', 'points', 'fill', 'fill-opacity', 'fill-rule', 'clip-rule', 'stroke', 'stroke-width', 'stroke-linecap',
    'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'stroke-miterlimit', 'opacity',
    'transform', 'transform-origin', 'gradientunits', 'gradienttransform', 'spreadmethod', 'offset', 'stop-color',
    'stop-opacity', 'clip-path', 'clippathunits', 'mask', 'maskunits', 'maskcontentunits', 'filter', 'filterunits',
    'primitiveunits', 'patternunits', 'patterncontentunits', 'patterntransform', 'font-family', 'font-size',
    'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'alignment-baseline', 'letter-spacing',
    'word-spacing', 'textlength', 'lengthadjust', 'startoffset', 'preserveaspectratio', 'markerwidth', 'markerheight',
    'refx', 'refy', 'orient', 'markerunits', 'marker-start', 'marker-mid', 'marker-end', 'stddeviation', 'dx', 'dy',
    'in', 'in2', 'result', 'mode', 'values', 'type', 'operator', 'k1', 'k2', 'k3', 'k4', 'flood-color',
    'flood-opacity', 'basefrequency', 'numoctaves', 'seed', 'stitchtiles', 'scale', 'xchannelselector',
    'ychannelselector', 'radius', 'tablevalues', 'slope', 'intercept', 'amplitude', 'exponent', 'surfacescale',
    'specularconstant', 'specularexponent', 'diffuseconstant', 'lighting-color', 'azimuth', 'elevation', 'z',
    'pointsatx', 'pointsaty', 'pointsatz', 'limitingconeangle', 'pathlength', 'vector-effect', 'paint-order', 'color',
    'display', 'visibility', 'rotate', 'mix-blend-mode', 'isolation', 'shape-rendering', 'image-rendering',
    'style', 'href', 'xlink:href', 'xmlns', 'xmlns:xlink', 'version',
    // SMIL
    'attributename', 'attributetype', 'from', 'to', 'by', 'dur', 'begin', 'end', 'repeatcount', 'repeatdur',
    'keytimes', 'keysplines', 'keypoints', 'calcmode', 'additive', 'accumulate', 'restart', 'path', 'min', 'max',
  ],
);

/** Propiedades que una animación SMIL puede modificar (nunca enlaces). */
const ANIMATABLE = new Set([
  'opacity', 'fill', 'stroke', 'stroke-width', 'stroke-dashoffset', 'stroke-dasharray', 'stroke-opacity',
  'fill-opacity', 'transform', 'r', 'rx', 'ry', 'cx', 'cy', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height',
  'd', 'points', 'offset', 'stop-color', 'stop-opacity', 'stddeviation', 'basefrequency', 'scale', 'font-size',
  'letter-spacing', 'visibility', 'display', 'color', 'flood-color', 'flood-opacity', 'dx', 'dy', 'startoffset',
]);

const STYLE_PROPS = new Set([
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'stroke-miterlimit', 'opacity', 'stop-color',
  'stop-opacity', 'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor',
  'dominant-baseline', 'mix-blend-mode', 'isolation', 'transform', 'transform-origin', 'transform-box', 'filter',
  'clip-path', 'mask', 'display', 'visibility', 'paint-order', 'vector-effect', 'flood-color', 'flood-opacity',
  'lighting-color', 'animation', 'animation-delay', 'animation-duration', 'animation-name', 'animation-iteration-count',
  'animation-timing-function', 'animation-direction', 'animation-fill-mode',
]);

const SKIP_CONTENT = new Set(['script', 'style', 'foreignobject', 'iframe', 'object', 'embed', 'template', 'noscript']);

/** Un valor es seguro si no ejecuta código ni carga recursos externos. */
function safeValue(v: string): boolean {
  if (/javascript:|vbscript:|data:text\/html|expression\s*\(|[<>]|@import/i.test(v)) return false;
  // url() solo puede apuntar a ids internos (#algo).
  const urls = v.match(/url\s*\(([^)]*)\)/gi) ?? [];
  return urls.every((u) => /^url\s*\(\s*['"]?#[\w:.-]+['"]?\s*\)$/i.test(u));
}

function cleanStyle(style: string): string {
  return style
    .split(';')
    .map((decl) => {
      const i = decl.indexOf(':');
      if (i < 0) return '';
      const prop = decl.slice(0, i).trim().toLowerCase();
      const value = decl.slice(i + 1).trim();
      return STYLE_PROPS.has(prop) && safeValue(value) ? `${prop}:${value}` : '';
    })
    .filter(Boolean)
    .join(';');
}

const esc = (s: string) => s.replace(/&(?!(#\d+|#x[\da-f]+|[a-z]+);)/gi, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export interface SvgOptions {
  /** Prefijo para ids internos (evita colisiones entre ilustraciones). */
  idPrefix?: string;
  /** Normaliza la longitud de los trazos (para la animación «dibujar»). */
  pathLength?: boolean;
  /** preserveAspectRatio de la raíz. */
  aspect?: string;
}

const DRAWABLE = new Set(['path', 'line', 'polyline', 'polygon', 'circle', 'ellipse', 'rect']);

export function sanitizeSvg(input: string, opts: SvgOptions = {}): string {
  const src = String(input ?? '').trim();
  const start = src.search(/<svg[\s>]/i);
  if (start < 0) return '';
  const prefix = opts.idPrefix ? `${opts.idPrefix.replace(/[^\w-]/g, '')}-` : '';
  const ref = (v: string) => (prefix ? v.replace(/url\(\s*(['"]?)#([\w:.-]+)\1\s*\)/g, `url(#${prefix}$2)`) : v);

  let out = '';
  let depth = 0;
  let rootDone = false;
  const skip: string[] = [];
  const tagRe = /<(\/?)([a-zA-Z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>/gi;
  let last = start;
  tagRe.lastIndex = start;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(src))) {
    const text = src.slice(last, m.index);
    last = tagRe.lastIndex;
    if (!skip.length && depth > 0 && text) out += esc(text);
    if (!m[2]) continue; // comentario, CDATA, doctype…
    const closing = m[1] === '/';
    const selfClosing = m[4] === '/';
    const lower = m[2].toLowerCase();
    if (SKIP_CONTENT.has(lower)) {
      if (closing) skip.pop();
      else if (!selfClosing) skip.push(lower);
      continue;
    }
    if (skip.length) continue;
    const tag = TAGS.get(lower);
    if (!tag) continue;
    if (closing) {
      if (depth > 0) {
        out += `</${tag}>`;
        depth--;
        if (depth === 0) {
          rootDone = true;
          break;
        }
      }
      continue;
    }
    if (rootDone) break;
    if (depth === 0 && lower !== 'svg') continue;

    // Atributos
    const attrRe = /([^\s=/]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    const attrs: [string, string][] = [];
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(m[3]))) {
      const name = a[1].toLowerCase();
      const value = a[3] ?? a[4] ?? a[5] ?? '';
      if (name.startsWith('on') || !ATTRS.has(name)) continue;
      attrs.push([name, value]);
    }
    const isAnim = lower === 'animate' || lower === 'animatetransform' || lower === 'animatemotion';
    if (isAnim) {
      const target = attrs.find(([n]) => n === 'attributename')?.[1].toLowerCase() ?? '';
      if (lower !== 'animatemotion' && !ANIMATABLE.has(target)) continue;
    }
    let attrOut = '';
    const isRoot = depth === 0;
    for (const [name, raw] of attrs) {
      let value = raw;
      if (name === 'href' || name === 'xlink:href') {
        const v = value.trim();
        const internal = /^#[\w:.-]+$/.test(v);
        const image = lower === 'image' && /^data:image\/(png|jpe?g|gif|webp|avif);base64,[\w+/=\s]+$/i.test(v);
        if (!internal && !image) continue;
        value = internal && prefix ? `#${prefix}${v.slice(1)}` : v;
        attrOut += ` href="${esc(value)}"`;
        continue;
      }
      if (name === 'xmlns' || name === 'xmlns:xlink' || name === 'version') continue;
      if (isRoot && (name === 'width' || name === 'height' || name === 'preserveaspectratio')) continue;
      if (name === 'style') {
        const css = cleanStyle(value);
        if (css) attrOut += ` style="${esc(ref(css))}"`;
        continue;
      }
      if (!safeValue(value)) continue;
      if (name === 'id' && prefix) value = `${prefix}${value}`;
      else value = ref(value);
      // Nombres en camelCase como los exige SVG (viewBox, gradientUnits, …).
      const proper = CAMEL[name] ?? name;
      attrOut += ` ${proper}="${esc(value)}"`;
    }
    if (isRoot) {
      if (!/\sviewBox=/.test(attrOut)) {
        const w = parseFloat(attrs.find(([n]) => n === 'width')?.[1] ?? '');
        const h = parseFloat(attrs.find(([n]) => n === 'height')?.[1] ?? '');
        if (w > 0 && h > 0) attrOut += ` viewBox="0 0 ${w} ${h}"`;
      }
      attrOut = ` xmlns="http://www.w3.org/2000/svg"${attrOut} preserveAspectRatio="${opts.aspect ?? 'xMidYMid meet'}"`;
    }
    if (opts.pathLength && DRAWABLE.has(lower) && !/\spathLength=/.test(attrOut)) attrOut += ' pathLength="1"';
    if (selfClosing) {
      out += `<${tag}${attrOut}/>`;
      if (isRoot) break;
    } else {
      out += `<${tag}${attrOut}>`;
      depth++;
    }
  }
  return out.startsWith('<svg') ? closeOpen(out) : '';
}

/** Cierra etiquetas abiertas si el SVG de entrada venía truncado. */
function closeOpen(svg: string): string {
  const stack: string[] = [];
  const re = /<(\/?)([a-zA-Z][\w]*)[^>]*?(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    if (m[3] === '/') continue;
    if (m[1] === '/') stack.pop();
    else stack.push(m[2]);
  }
  return svg + stack.reverse().map((t) => `</${t}>`).join('');
}

const CAMEL: Record<string, string> = Object.fromEntries(
  [
    'viewBox', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'clipPathUnits', 'maskUnits', 'maskContentUnits',
    'filterUnits', 'primitiveUnits', 'patternUnits', 'patternContentUnits', 'patternTransform', 'textLength',
    'lengthAdjust', 'startOffset', 'markerWidth', 'markerHeight', 'refX', 'refY', 'markerUnits', 'stdDeviation',
    'baseFrequency', 'numOctaves', 'stitchTiles', 'xChannelSelector', 'yChannelSelector', 'tableValues',
    'surfaceScale', 'specularConstant', 'specularExponent', 'diffuseConstant', 'pointsAtX', 'pointsAtY', 'pointsAtZ',
    'limitingConeAngle', 'pathLength', 'attributeName', 'attributeType', 'repeatCount', 'repeatDur', 'keyTimes',
    'keySplines', 'keyPoints', 'calcMode', 'preserveAspectRatio',
  ].map((n) => [n.toLowerCase(), n]),
);
