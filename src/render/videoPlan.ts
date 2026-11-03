/**
 * Plan de tiempos para convertir una presentación en video: cuándo avanza cada
 * clic/diapositiva, cuánto dura cada una y dónde van narraciones y efectos.
 * Es puro (sin DOM) para poder probarlo.
 */
import type { Presentation, Slide } from '../core/model';

export interface VideoOptions {
  width: number;
  height: number;
  fps: number;
  /** Segundos que se mantiene cada diapositiva tras sus animaciones. */
  secondsPerSlide: number;
  /** Segundos entre clics (builds) dentro de una diapositiva. */
  secondsPerStep: number;
  music: boolean;
  narration: boolean;
  sfx: boolean;
}

export const DEFAULT_VIDEO_OPTIONS: VideoOptions = {
  width: 1920,
  height: 1080,
  fps: 30,
  secondsPerSlide: 3.5,
  secondsPerStep: 1.4,
  music: true,
  narration: true,
  sfx: true,
};

export interface PlanSlide {
  slideId: string;
  start: number;
  end: number;
  sound: string;
  narration?: { src: string; volume: number };
}

export interface VideoPlan {
  /** Instantes (ms) en los que se llama a player.next(). */
  nexts: number[];
  duration: number;
  slides: PlanSlide[];
}

export function slideSteps(slide: Slide): number {
  return Math.max(
    0,
    ...slide.elements.flatMap((e) => [e.animation.step, e.animation.exitStep, e.animation.emphasisStep, e.animation.move.step]),
  );
}

/** Momento (ms) en que terminan las entradas que ocurren al aparecer la diapositiva. */
function entranceEnd(slide: Slide): number {
  let end = 0;
  for (const e of slide.elements) {
    const a = e.animation;
    if (a.step !== 0 || a.entrance === 'none') continue;
    let t = a.delay + a.duration;
    if (e.type === 'text' && a.split !== 'none') {
      const units = a.split === 'chars' ? e.html.replace(/<[^>]+>/g, '').length : a.split === 'words' ? e.html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length : 3;
      t += Math.max(0, units - 1) * a.stagger;
    }
    end = Math.max(end, t);
  }
  return Math.min(end, 4000);
}

export function buildPlan(doc: Presentation, opts: VideoOptions, narrationSeconds: Record<string, number> = {}): VideoPlan {
  const visible = doc.slides.filter((s) => !s.hidden);
  const nexts: number[] = [];
  const slides: PlanSlide[] = [];
  const stepMs = opts.secondsPerStep * 1000;
  let t = 0;
  visible.forEach((slide, i) => {
    const transition = i === 0 || slide.transition.type === 'none' ? 0 : slide.transition.duration;
    const settle = transition + entranceEnd(slide) + 400;
    const steps = slideSteps(slide);
    for (let k = 0; k < steps; k++) nexts.push(t + settle + k * stepMs);
    const hold = (slide.duration > 0 ? slide.duration : opts.secondsPerSlide) * 1000;
    const afterSteps = steps ? settle + (steps - 1) * stepMs + stepMs : settle;
    const narr = opts.narration && slide.narration.src ? narrationSeconds[slide.id] ?? 0 : 0;
    const total = Math.max(afterSteps + hold, narr ? narr * 1000 + 700 : 0, 1200);
    slides.push({
      slideId: slide.id,
      start: t,
      end: t + total,
      sound: i > 0 && opts.sfx && doc.settings.sounds ? slide.transition.sound : 'none',
      narration: narr && slide.narration.src ? { src: slide.narration.src, volume: slide.narration.volume } : undefined,
    });
    t += total;
    if (i < visible.length - 1) nexts.push(t);
  });
  return { nexts, duration: t + 400, slides };
}
