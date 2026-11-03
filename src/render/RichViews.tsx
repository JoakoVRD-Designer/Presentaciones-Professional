/**
 * Elementos «ricos»: bloque de código resaltado (con efecto de escritura),
 * fórmula LaTeX e ilustración SVG.
 */
import { useMemo, type CSSProperties } from 'react';
import type { CodeElement, MathElement, SvgElement, Theme } from '../core/model';
import { sanitizeSvg } from '../core/svg';
import { highlightLines, parseLineSet, renderTex, useRichLib } from './richLibs';
import type { RenderMode } from './SlideRenderer';

export function CodeView({ el, mode }: { el: CodeElement; mode: RenderMode }) {
  const v = useRichLib('code');
  const lines = useMemo(() => highlightLines(el.code, el.language), [el.code, el.language, v]);
  const hl = useMemo(() => parseLineSet(el.highlight), [el.highlight]);
  const typing = el.typing && mode !== 'thumb';
  // Retardo acumulado de cada línea para el efecto de escritura.
  let t = 0;
  const speed = el.typingSpeed;
  const digits = String(lines.plain.length).length;
  return (
    <div
      className={`lm-code lm-code-${el.theme}${el.chrome ? ' has-chrome' : ''}${hl.size ? ' has-hl' : ''}`}
      data-typing={typing ? 'true' : undefined}
      data-ready={lines.ready ? undefined : 'false'}
      style={{ fontSize: el.fontSize, '--spd': `${speed}ms`, '--ln-w': `${digits + 1}ch` } as CSSProperties}
    >
      {el.chrome && (
        <div className="lm-code-bar">
          <i />
          <i />
          <i />
          {el.title && <span>{el.title}</span>}
        </div>
      )}
      <pre className="lm-code-pre">
        <code>
          {lines.html.map((html, i) => {
            const ch = Math.max(1, [...lines.plain[i]].length);
            const d = t;
            t += ch * speed + speed * 4;
            const n = i + 1;
            return (
              <span
                key={i}
                className={`lm-code-line${hl.size ? (hl.has(n) ? ' is-hl' : ' is-dim') : ''}`}
                style={typing ? ({ '--ch': ch, '--d': `${d}ms` } as CSSProperties) : undefined}
              >
                {el.lineNumbers && <span className="lm-code-ln">{n}</span>}
                <span className="lm-code-text" dangerouslySetInnerHTML={{ __html: html || ' ' }} />
                {'\n'}
              </span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}

export function MathView({ el, theme }: { el: MathElement; theme: Theme }) {
  const v = useRichLib('math');
  const out = useMemo(() => renderTex(el.tex, el.display), [el.tex, el.display, v]);
  return (
    <div
      className={`lm-math lm-math-${el.align}`}
      data-ready={out.ready ? undefined : 'false'}
      style={{ fontSize: el.size, color: el.color || theme.colors.text }}
      dangerouslySetInnerHTML={{ __html: out.html }}
    />
  );
}

const ASPECT: Record<SvgElement['fit'], string> = { contain: 'xMidYMid meet', cover: 'xMidYMid slice', fill: 'none' };

export function SvgView({ el, theme }: { el: SvgElement; theme: Theme }) {
  const draw = el.animation.entrance === 'draw';
  const html = useMemo(
    () => sanitizeSvg(el.svg, { idPrefix: el.id, pathLength: draw, aspect: ASPECT[el.fit] }),
    [el.svg, el.id, draw, el.fit],
  );
  if (!html) return <div className="lm-placeholder">SVG no válido</div>;
  return <div className="lm-svg" style={{ color: el.color || theme.colors.primary }} dangerouslySetInnerHTML={{ __html: html }} />;
}
