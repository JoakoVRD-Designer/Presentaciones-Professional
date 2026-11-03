import type { CSSProperties } from 'react';
import type { Background, ElementStyle, Theme } from '../core/model';

export const EASING_CSS: Record<string, string> = {
  expo: 'cubic-bezier(0.16, 1, 0.3, 1)',
  'ease-out': 'cubic-bezier(0.33, 1, 0.68, 1)',
  'ease-in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  bounce:
    'linear(0, 0.004, 0.016, 0.035, 0.063, 0.098, 0.141 13.6%, 0.25, 0.391, 0.563, 0.765, 1, 0.891 40.9%, 0.848, 0.813, 0.785, 0.766, 0.754, 0.75, 0.754, 0.766, 0.785, 0.813, 0.848, 0.891 68.2%, 1 72.7%, 0.973, 0.953, 0.941, 0.938, 0.941, 0.953, 0.973, 1, 0.988, 0.984, 0.988, 1)',
  linear: 'linear',
};

export const CLIP_SHAPES: Record<string, string> = {
  triangle: 'polygon(50% 0%, 100% 100%, 0% 100%)',
  diamond: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
  pentagon: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)',
  hexagon: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
  star: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
  arrow: 'polygon(0% 30%, 62% 30%, 62% 0%, 100% 50%, 62% 100%, 62% 70%, 0% 70%)',
  chevron: 'polygon(0% 0%, 70% 0%, 100% 50%, 70% 100%, 0% 100%, 30% 50%)',
  cross: 'polygon(35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%)',
};

export const MASK_CSS: Record<string, string> = {
  'fade-bottom': 'linear-gradient(180deg, #000 55%, transparent 100%)',
  'fade-top': 'linear-gradient(0deg, #000 55%, transparent 100%)',
  'fade-left': 'linear-gradient(270deg, #000 55%, transparent 100%)',
  'fade-right': 'linear-gradient(90deg, #000 55%, transparent 100%)',
  'fade-edges': 'radial-gradient(ellipse 70% 70% at 50% 50%, #000 55%, transparent 100%)',
  circle: 'radial-gradient(circle at 50% 50%, #000 69.5%, transparent 70.5%)',
};

export function themeVars(theme: Theme): CSSProperties {
  return {
    '--lm-bg': theme.colors.background,
    '--lm-surface': theme.colors.surface,
    '--lm-text': theme.colors.text,
    '--lm-muted': theme.colors.muted,
    '--lm-primary': theme.colors.primary,
    '--lm-accent': theme.colors.accent,
    '--lm-font-heading': `'${theme.fonts.heading}', system-ui, sans-serif`,
    '--lm-font-body': `'${theme.fonts.body}', system-ui, sans-serif`,
    '--lm-radius': `${theme.radius}px`,
  } as CSSProperties;
}

export function filterCss(s: Pick<ElementStyle, 'blur' | 'brightness' | 'contrast' | 'saturate' | 'hueRotate' | 'grayscale' | 'sepia' | 'invert'>): string {
  const parts: string[] = [];
  if (s.blur) parts.push(`blur(${s.blur}px)`);
  if (s.brightness !== 100) parts.push(`brightness(${s.brightness}%)`);
  if (s.contrast !== 100) parts.push(`contrast(${s.contrast}%)`);
  if (s.saturate !== 100) parts.push(`saturate(${s.saturate}%)`);
  if (s.hueRotate) parts.push(`hue-rotate(${s.hueRotate}deg)`);
  if (s.grayscale) parts.push(`grayscale(${s.grayscale}%)`);
  if (s.sepia) parts.push(`sepia(${s.sepia}%)`);
  if (s.invert) parts.push(`invert(${s.invert}%)`);
  return parts.join(' ');
}

export function shadowCss(s: ElementStyle, theme: Theme, dropShadow = false): string {
  const parts: string[] = [];
  const glowColor = s.glowColor || theme.colors.primary;
  if (dropShadow) {
    if (s.shadow) parts.push(`drop-shadow(${s.shadow.x}px ${s.shadow.y}px ${s.shadow.blur / 2}px ${s.shadow.color})`);
    if (s.glow) parts.push(`drop-shadow(0 0 ${s.glow / 2}px ${glowColor})`);
    return parts.join(' ');
  }
  if (s.shadow) parts.push(`${s.shadow.x}px ${s.shadow.y}px ${s.shadow.blur}px ${s.shadow.spread}px ${s.shadow.color}`);
  if (s.glow) parts.push(`0 0 ${s.glow}px ${Math.round(s.glow / 4)}px ${glowColor}`);
  return parts.join(', ');
}

export function isGradient(v: string): boolean {
  return /gradient\(/.test(v);
}

export function fillCss(fill: string): CSSProperties {
  if (!fill || fill === 'transparent') return {};
  return isGradient(fill) ? { backgroundImage: fill } : { backgroundColor: fill };
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixColors(a: string, b: string, t = 0.5): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return a;
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function withAlpha(color: string, alpha: number): string {
  const c = hexToRgb(color);
  return c ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})` : color;
}

export function effectColors(bg: Background, theme: Theme): [string, string, string] {
  const c = bg.effectColors;
  const c1 = c[0] || theme.colors.primary;
  const c2 = c[1] || theme.colors.accent;
  const c3 = c[2] || mixColors(theme.colors.primary, '#ff2bd6', 0.55);
  return [c1, c2, c3];
}

export const GRAIN_URL =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";
