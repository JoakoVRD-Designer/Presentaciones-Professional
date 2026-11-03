import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Deck } from '../../render/Deck';
import { createPlayer } from '../../runtime/player.js';
import { publishPlayerState, setActivePlayer } from '../lib/presenter';
import { useEditor } from '../store/editor';

export function PresentMode() {
  const presenting = useEditor((s) => s.presenting);
  const doc = useEditor((s) => s.doc);
  const host = useRef<HTMLDivElement>(null);
  // Congela el documento durante la presentación para no reiniciar el reproductor.
  const frozen = useMemo(() => (presenting ? doc : null), [presenting]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!presenting || !host.current || !frozen) return;
    const root = host.current.querySelector<HTMLElement>('.lm-deck');
    if (!root) return;
    const exit = () => useEditor.setState({ presenting: null });
    const player = createPlayer(root, {
      width: frozen.width,
      height: frozen.height,
      loop: frozen.settings.loop,
      autoAdvance: frozen.settings.autoAdvance,
      progress: frozen.settings.progress,
      slideNumbers: frozen.settings.slideNumbers,
      sounds: frozen.settings.sounds,
      music: frozen.settings.music.src ? frozen.settings.music : null,
      controls: true,
      startIndex: presenting.start,
      exitButton: true,
      onExit: exit,
      onChange: (i, step) => {
        const visible = frozen.slides.filter((s) => !s.hidden);
        const slide = visible[i];
        if (slide) useEditor.setState({ currentSlideId: slide.id, selection: [] });
        const maxStep = Math.max(0, ...(slide?.elements.map((e) => e.animation.step) ?? [0]));
        publishPlayerState(i, step, maxStep);
      },
    });
    setActivePlayer(player);
    root.focus();
    host.current.requestFullscreen?.().catch(() => {});
    const onFs = () => {
      if (!document.fullscreenElement) exit();
    };
    // Entrar a pantalla completa es asíncrono; escuchamos la salida solo después.
    const t = setTimeout(() => document.addEventListener('fullscreenchange', onFs), 400);
    return () => {
      clearTimeout(t);
      document.removeEventListener('fullscreenchange', onFs);
      player.destroy();
      setActivePlayer(null);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [presenting, frozen]);

  if (!presenting || !frozen) return null;
  return createPortal(
    <motion.div
      ref={host}
      className="present-host"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <Deck doc={frozen} mode="play" />
    </motion.div>,
    document.body,
  );
}
