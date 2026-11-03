import { icons, type LucideIcon } from 'lucide-react';
import { memo, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { Background, Slide, SlideElement, Theme } from '../core/model';
import { ChartView } from './Chart';
import { TableView } from './Table';
import { sanitizeHtml } from '../core/sanitize';
import {
  CLIP_SHAPES,
  EASING_CSS,
  effectColors,
  fillCss,
  filterCss,
  GRAIN_URL,
  MASK_CSS,
  shadowCss,
  themeVars,
} from './styles';

export type RenderMode = 'edit' | 'thumb' | 'play' | 'export';

export interface SlideRendererProps {
  slide: Slide;
  theme: Theme;
  width?: number;
  height?: number;
  mode: RenderMode;
  /** Id del texto en edición (solo modo edit). */
  editingId?: string | null;
  onTextCommit?: (id: string, html: string) => void;
  onEditEnd?: () => void;
  /** Mostrar animaciones en bucle en modo edición. */
  live?: boolean;
  className?: string;
}

export function resolveIcon(name: string): LucideIcon {
  const map = icons as Record<string, LucideIcon>;
  if (map[name]) return map[name];
  const pascal = name
    .replace(/[-_\s]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (c) => c.toUpperCase());
  return map[pascal] ?? map.Sparkles;
}

/* ------------------------------------------------------------------ */
/* Fondo                                                               */
/* ------------------------------------------------------------------ */

function EffectLayer({ bg, theme }: { bg: Background; theme: Theme }) {
  const [c1, c2, c3] = effectColors(bg, theme);
  const style = {
    '--c1': c1,
    '--c2': c2,
    '--c3': c3,
    '--fx-speed': String(1 / (bg.effectSpeed || 1)),
  } as CSSProperties;
  const blobs = bg.effect === 'aurora' || bg.effect === 'waves' ? 4 : bg.effect === 'stars' ? 3 : bg.effect === 'beams' ? 2 : 0;
  return (
    <div className={`lm-fx lm-fx-${bg.effect}`} style={style}>
      {Array.from({ length: blobs }, (_, i) => (
        <i key={i} className={`lm-fx-b lm-fx-b${i + 1}`} />
      ))}
    </div>
  );
}

function BackgroundLayer({ bg, theme, mode }: { bg: Background; theme: Theme; mode: RenderMode }) {
  const filter = filterCss({
    blur: bg.blur,
    brightness: bg.brightness,
    saturate: bg.saturate,
    hueRotate: bg.hueRotate,
    contrast: 100,
    grayscale: 0,
    sepia: 0,
    invert: 0,
  });
  const bleed = bg.blur ? -bg.blur * 2 : 0;
  const mediaStyle: CSSProperties = { filter: filter || undefined, inset: bleed };
  let media: React.ReactNode = null;
  if (bg.type === 'gradient') {
    media = <div className="lm-bg-fill" style={{ backgroundImage: bg.gradient }} />;
  } else if (bg.type === 'image' && bg.image) {
    media = (
      <div
        className={`lm-bg-fill lm-bg-image${bg.kenBurns ? ' lm-kenburns' : ''}`}
        style={{ backgroundImage: `url("${bg.image}")`, backgroundSize: bg.fit, backgroundPosition: bg.position }}
      />
    );
  } else if (bg.type === 'video' && bg.video) {
    const isThumb = mode === 'thumb';
    media = (
      <video
        className={`lm-bg-video${bg.kenBurns ? ' lm-kenburns' : ''}`}
        src={bg.video}
        poster={bg.poster || undefined}
        muted
        loop
        playsInline
        autoPlay={mode === 'edit'}
        preload={isThumb ? 'metadata' : 'auto'}
        data-autoplay="true"
        data-rate={bg.playbackRate}
        style={{ objectFit: bg.fit, objectPosition: bg.position }}
      />
    );
  } else if (bg.type === 'effect') {
    media = <EffectLayer bg={bg} theme={theme} />;
  }
  return (
    <div className="lm-bg" style={{ backgroundColor: bg.color || theme.colors.background }}>
      {media && (
        <div className="lm-bg-media" style={mediaStyle}>
          {media}
        </div>
      )}
      {bg.overlayOpacity > 0 && (
        <div
          className="lm-bg-overlay"
          style={{ ...fillCss(bg.overlay || '#000'), opacity: bg.overlayOpacity }}
        />
      )}
      {bg.grain > 0 && <div className="lm-bg-grain" style={{ backgroundImage: GRAIN_URL, opacity: bg.grain }} />}
      {bg.vignette > 0 && (
        <div
          className="lm-bg-vignette"
          style={{
            background: `radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,${0.35 + bg.vignette * 0.6}) 100%)`,
            opacity: Math.min(1, bg.vignette * 1.5),
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Elementos                                                           */
/* ------------------------------------------------------------------ */

function EditableText({ html, onCommit, onDone }: { html: string; onCommit: (h: string) => void; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = html;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // Solo al montar: el contenido lo gestiona el navegador mientras se edita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const el = ref.current;
    return () => {
      if (el) onCommit(el.innerHTML);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      className="lm-text-inner lm-editing"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          onDone();
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={() => onDone()}
    />
  );
}

function ElementContent({
  el,
  theme,
  mode,
  editing,
  onTextCommit,
  onEditEnd,
}: {
  el: SlideElement;
  theme: Theme;
  mode: RenderMode;
  editing: boolean;
  onTextCommit?: (id: string, html: string) => void;
  onEditEnd?: () => void;
}) {
  switch (el.type) {
    case 'text': {
      const style: CSSProperties = {
        fontFamily: el.font ? `'${el.font}', system-ui, sans-serif` : el.role === 'heading' ? 'var(--lm-font-heading)' : 'var(--lm-font-body)',
        fontSize: el.size,
        fontWeight: el.weight,
        color: el.color || theme.colors.text,
        textAlign: el.align,
        justifyContent: el.valign === 'middle' ? 'center' : el.valign === 'bottom' ? 'flex-end' : 'flex-start',
        lineHeight: el.lineHeight,
        letterSpacing: el.letterSpacing,
        fontStyle: el.italic ? 'italic' : undefined,
        textDecoration: el.underline ? 'underline' : undefined,
        textTransform: el.transform === 'none' ? undefined : el.transform,
        padding: el.padding || undefined,
        textShadow: el.textShadow || undefined,
        WebkitTextStroke: el.stroke || undefined,
      };
      const innerStyle: CSSProperties = el.gradient
        ? {
            backgroundImage: el.gradient,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }
        : {};
      return (
        <div className={`lm-text${el.gradient ? ' lm-text-gradient' : ''}`} style={style}>
          {editing && onTextCommit && onEditEnd ? (
            <EditableText html={el.html} onCommit={(h) => onTextCommit(el.id, h)} onDone={onEditEnd} />
          ) : (
            <div className="lm-text-inner" style={innerStyle} dangerouslySetInnerHTML={{ __html: sanitizeHtml(el.html) }} />
          )}
        </div>
      );
    }
    case 'image':
      return el.src ? (
        <img
          className={`lm-img${el.kenBurns ? ' lm-kenburns' : ''}`}
          src={el.src}
          alt={el.alt}
          draggable={false}
          style={{ objectFit: el.fit, objectPosition: el.position }}
        />
      ) : (
        <div className="lm-placeholder">Imagen</div>
      );
    case 'video':
      return el.src ? (
        <video
          className="lm-video"
          src={el.src}
          poster={el.poster || undefined}
          muted={mode === 'edit' || mode === 'thumb' ? true : el.muted}
          loop={el.loop}
          playsInline
          controls={mode === 'play' || mode === 'export' ? el.controls : false}
          autoPlay={mode === 'edit' && el.autoplay}
          preload={mode === 'thumb' ? 'metadata' : 'auto'}
          data-autoplay={String(el.autoplay)}
          data-rate={el.playbackRate}
          style={{ objectFit: el.fit }}
        />
      ) : (
        <div className="lm-placeholder">Video</div>
      );
    case 'shape': {
      if (el.shape in CLIP_SHAPES) {
        return (
          <div
            className="lm-shape-clip"
            style={{
              clipPath: CLIP_SHAPES[el.shape],
              ...fillCss(el.style.fill),
              backdropFilter: el.style.backdropBlur ? `blur(${el.style.backdropBlur}px)` : undefined,
              WebkitBackdropFilter: el.style.backdropBlur ? `blur(${el.style.backdropBlur}px)` : undefined,
            }}
          />
        );
      }
      return null;
    }
    case 'icon': {
      const Icon = resolveIcon(el.icon);
      return (
        <div className="lm-icon" style={{ padding: el.padding || undefined, color: el.color || theme.colors.primary }}>
          <Icon width="100%" height="100%" strokeWidth={el.strokeWidth} absoluteStrokeWidth={false} />
        </div>
      );
    }
    case 'chart':
      return <ChartView el={el} />;
    case 'table':
      return <TableView el={el} />;
    case 'embed':
      if (!el.url || mode === 'thumb') {
        return (
          <div className="lm-placeholder lm-embed-ph">
            <span>⧉</span>
            <small>{el.url || 'Contenido incrustado'}</small>
          </div>
        );
      }
      return (
        <iframe
          className="lm-embed"
          src={el.url}
          title={el.name || 'embed'}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          loading="lazy"
          style={{ pointerEvents: mode === 'edit' || !el.interactive ? 'none' : undefined }}
        />
      );
  }
}

function ElementView(props: {
  el: SlideElement;
  theme: Theme;
  mode: RenderMode;
  editing: boolean;
  onTextCommit?: (id: string, html: string) => void;
  onEditEnd?: () => void;
}) {
  const { el, theme } = props;
  if (el.hidden && props.mode !== 'edit') return null;
  const s = el.style;
  const clip = el.type === 'shape' && el.shape in CLIP_SHAPES;
  const filters = [filterCss(s), clip ? shadowCss(s, theme, true) : ''].filter(Boolean).join(' ');
  const mask = s.mask !== 'none' ? MASK_CSS[s.mask] : undefined;
  const radius =
    el.type === 'shape' && el.shape === 'ellipse'
      ? '50%'
      : el.type === 'shape' && el.shape === 'blob'
        ? '42% 58% 63% 37% / 41% 44% 56% 59%'
        : el.type === 'shape' && el.shape === 'line'
          ? Math.min(el.h, el.w) / 2
          : s.radius || undefined;

  const bodyStyle: CSSProperties = {
    opacity: el.opacity,
    filter: filters || undefined,
    WebkitMaskImage: mask,
    maskImage: mask,
    ...(clip ? {} : fillCss(s.fill)),
    borderRadius: radius,
    border: !clip && s.borderWidth ? `${s.borderWidth}px ${s.borderStyle} ${s.borderColor}` : undefined,
    boxShadow: clip ? undefined : shadowCss(s, theme) || undefined,
    backdropFilter: !clip && s.backdropBlur ? `blur(${s.backdropBlur}px) saturate(140%)` : undefined,
    WebkitBackdropFilter: !clip && s.backdropBlur ? `blur(${s.backdropBlur}px) saturate(140%)` : undefined,
  };
  const a = el.animation;
  const animStyle = {
    '--lm-dur': `${a.duration}ms`,
    '--lm-delay': `${a.delay}ms`,
    '--lm-ease': EASING_CSS[a.easing] ?? EASING_CSS.expo,
  } as CSSProperties;
  const loopStyle = { '--lm-loop-dur': `${a.loopDuration}ms`, '--lm-glow': s.glowColor || theme.colors.primary } as CSSProperties;

  return (
    <div
      className={`lm-el lm-el-${el.type}${el.hidden ? ' lm-hidden' : ''}`}
      data-id={el.id}
      data-link={el.link || undefined}
      data-morph={el.morph || el.id}
      data-name={el.name ? `${el.type}:${el.name}` : undefined}
      data-step={el.animation.step || undefined}
      style={{
        left: el.x,
        top: el.y,
        width: el.w,
        height: el.h,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        mixBlendMode: s.blendMode !== 'normal' ? s.blendMode : undefined,
      }}
    >
      <div className="lm-anim" data-entrance={a.entrance} data-step={a.step} style={animStyle}>
        <div className="lm-loop" data-loop={a.loop} style={loopStyle}>
          <div className={`lm-body${radius ? ' lm-rounded' : ''}`} style={bodyStyle}>
            <ElementContent {...props} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Diapositiva                                                         */
/* ------------------------------------------------------------------ */

export const SlideRenderer = memo(function SlideRenderer({
  slide,
  theme,
  width = 1920,
  height = 1080,
  mode,
  editingId,
  onTextCommit,
  onEditEnd,
  live = true,
  className,
}: SlideRendererProps) {
  const cls = ['lm-slide', `lm-mode-${mode}`, live && mode !== 'thumb' ? 'lm-live' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} style={{ width, height, ...themeVars(theme) }} data-slide-id={slide.id}>
      <BackgroundLayer bg={slide.background} theme={theme} mode={mode} />
      <div className="lm-elements">
        {slide.elements.map((el) => (
          <ElementView
            key={el.id}
            el={el}
            theme={theme}
            mode={mode}
            editing={editingId === el.id}
            onTextCommit={onTextCommit}
            onEditEnd={onEditEnd}
          />
        ))}
      </div>
    </div>
  );
});
