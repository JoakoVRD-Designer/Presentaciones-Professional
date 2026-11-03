import { useCallback } from 'react';
import type { Command } from '../../../core/commands';
import { useEditor } from '../../store/editor';

/** Devuelve una función que aplica un parche a varios elementos (agrupando el historial por campo). */
export function useElementPatch(ids: string[]) {
  const dispatch = useEditor((s) => s.dispatch);
  const key = ids.join(',');
  return useCallback(
    (patch: Record<string, unknown>, field?: string) => {
      const cmds: Command[] = ids.map((id) => ({ op: 'element.update', element: id, patch }));
      dispatch(cmds, { merge: `${key}:${field ?? Object.keys(patch).join(',')}` });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, dispatch],
  );
}

export function useSlidePatch(slideId: string | undefined) {
  const dispatch = useEditor((s) => s.dispatch);
  return {
    background: (bg: Record<string, unknown>, field?: string) =>
      slideId && dispatch([{ op: 'slide.background', slide: slideId, background: bg }], { merge: `bg:${slideId}:${field ?? Object.keys(bg).join(',')}` }),
    transition: (t: Record<string, unknown>, field?: string) =>
      slideId && dispatch([{ op: 'slide.transition', slide: slideId, transition: t }], { merge: `tr:${slideId}:${field ?? Object.keys(t).join(',')}` }),
    update: (patch: Record<string, unknown>, field?: string) =>
      slideId && dispatch([{ op: 'slide.update', slide: slideId, patch }], { merge: `sl:${slideId}:${field ?? Object.keys(patch).join(',')}` }),
  };
}

export const ENTRANCE_LABELS: Record<string, string> = {
  none: 'Ninguna',
  fade: 'Aparecer',
  'fade-up': 'Subir',
  'fade-down': 'Bajar',
  'fade-left': 'Desde derecha',
  'fade-right': 'Desde izquierda',
  'zoom-in': 'Acercar',
  'zoom-out': 'Alejar',
  'blur-in': 'Enfocar',
  'flip-x': 'Voltear X',
  'flip-y': 'Voltear Y',
  'rotate-in': 'Girar',
  'bounce-in': 'Rebote',
  elastic: 'Elástico',
  drop: 'Caída',
  'slide-up': 'Deslizar arriba',
  'slide-left': 'Deslizar izq.',
  'slide-right': 'Deslizar der.',
  'reveal-left': 'Revelar →',
  'reveal-up': 'Revelar ↑',
  typewriter: 'Máquina de escribir',
  glitch: 'Glitch',
};

export const LOOP_LABELS: Record<string, string> = {
  none: 'Ninguno',
  float: 'Flotar',
  pulse: 'Pulso',
  breathe: 'Respirar',
  spin: 'Girar',
  bounce: 'Rebotar',
  wiggle: 'Agitar',
  swing: 'Columpio',
  heartbeat: 'Latido',
  glow: 'Brillo',
  shimmer: 'Destello',
  'gradient-shift': 'Degradado vivo',
};

export const TRANSITION_LABELS: Record<string, string> = {
  none: 'Ninguna',
  fade: 'Fundido',
  slide: 'Deslizar',
  'slide-up': 'Subir',
  push: 'Empujar',
  zoom: 'Zoom',
  'zoom-out': 'Zoom inverso',
  blur: 'Desenfoque',
  flip: 'Voltear',
  cube: 'Cubo 3D',
  wipe: 'Barrido',
  circle: 'Círculo',
  dissolve: 'Disolver',
  morph: 'Morph ✦',
};

export const SOUND_LABELS: Record<string, string> = {
  none: 'Sin sonido',
  whoosh: 'Whoosh',
  swoosh: 'Swoosh',
  pop: 'Pop',
  chime: 'Campana',
  click: 'Clic',
  soft: 'Suave',
  rise: 'Ascenso',
};

export const EFFECT_LABELS: Record<string, string> = {
  aurora: 'Aurora',
  mesh: 'Malla',
  grid: 'Rejilla',
  dots: 'Puntos',
  stars: 'Estrellas',
  spotlight: 'Foco',
  beams: 'Haces',
  waves: 'Olas',
  noise: 'Ruido',
};

export const SHAPE_LABELS: Record<string, string> = {
  rect: 'Rectángulo',
  ellipse: 'Elipse',
  triangle: 'Triángulo',
  diamond: 'Rombo',
  pentagon: 'Pentágono',
  hexagon: 'Hexágono',
  star: 'Estrella',
  arrow: 'Flecha',
  chevron: 'Chevron',
  cross: 'Cruz',
  blob: 'Orgánica',
  line: 'Línea',
};

export const BLEND_LABELS: Record<string, string> = {
  normal: 'Normal',
  multiply: 'Multiplicar',
  screen: 'Trama',
  overlay: 'Superponer',
  darken: 'Oscurecer',
  lighten: 'Aclarar',
  'color-dodge': 'Sobreexponer',
  difference: 'Diferencia',
  exclusion: 'Exclusión',
  'soft-light': 'Luz suave',
  'hard-light': 'Luz fuerte',
  luminosity: 'Luminosidad',
};

export const MASK_LABELS: Record<string, string> = {
  none: 'Sin máscara',
  'fade-bottom': 'Desvanecer abajo',
  'fade-top': 'Desvanecer arriba',
  'fade-left': 'Desvanecer izquierda',
  'fade-right': 'Desvanecer derecha',
  'fade-edges': 'Desvanecer bordes',
  circle: 'Círculo',
};

export function toEmbedUrl(url: string): string {
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/.exec(url);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1&mute=1&loop=1&playlist=${yt[1]}&controls=0`;
  const vimeo = /vimeo\.com\/(\d+)/.exec(url);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1&muted=1&loop=1&background=1`;
  return url;
}
