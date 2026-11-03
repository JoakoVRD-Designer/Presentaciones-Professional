import { useEffect, useRef } from 'react';
import type { LottieElement } from '../core/model';
import type { RenderMode } from './SlideRenderer';

/** Reproductor Lottie montado por React (editor y modo presentación de la app). */
function LottiePlayer({ el }: { el: LottieElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let anim: { destroy: () => void } | null = null;
    (async () => {
      const [{ default: lottie }, data] = await Promise.all([
        import('lottie-web/build/player/lottie_light'),
        fetch(el.src).then((r) => r.json()),
      ]);
      if (cancelled || !ref.current) return;
      const a = lottie.loadAnimation({ container: ref.current, renderer: 'svg', loop: el.loop, autoplay: true, animationData: data });
      a.setSpeed(el.speed);
      anim = a;
    })().catch(() => {
      if (ref.current) ref.current.dataset.error = 'true';
    });
    return () => {
      cancelled = true;
      anim?.destroy();
    };
  }, [el.src, el.loop, el.speed]);
  return <div ref={ref} className="lm-lottie" />;
}

export function LottieView({ el, mode }: { el: LottieElement; mode: RenderMode }) {
  if (!el.src) return <div className="lm-placeholder">Lottie</div>;
  // En el HTML exportado lo monta el runtime (ver exportHtml).
  if (mode === 'export') return <div className="lm-lottie" data-src={el.src} data-loop={String(el.loop)} data-speed={el.speed} />;
  if (mode === 'thumb') return <div className="lm-placeholder lm-lottie-ph">✦</div>;
  return <LottiePlayer el={el} />;
}
