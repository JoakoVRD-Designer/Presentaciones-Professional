import { motion } from 'framer-motion';
import { Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Deck } from '../../render/Deck';
import { createPlayer } from '../../runtime/player.js';
import { publishPlayerState, setActivePlayer } from '../lib/presenter';
import { markSlide, recording, stopRecording } from '../lib/recorder';
import { useEditor } from '../store/editor';

/** Burbuja de cámara arrastrable (se ve en la grabación). */
function CameraBubble({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [pos, setPos] = useState({ x: 24, y: 24 });
  const [size, setSize] = useState(220);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  const drag = (e: React.PointerEvent) => {
    e.stopPropagation();
    const origin = { cx: e.clientX, cy: e.clientY, x: pos.x, y: pos.y };
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    // La burbuja se ancla abajo a la izquierda: x crece a la derecha, y crece hacia arriba.
    const move = (ev: PointerEvent) =>
      setPos({ x: Math.max(0, origin.x + (ev.clientX - origin.cx)), y: Math.max(0, origin.y - (ev.clientY - origin.cy)) });
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };
  return (
    <div
      className="cam-bubble"
      style={{ left: pos.x, bottom: pos.y, width: size, height: size }}
      onPointerDown={drag}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => setSize((s) => Math.max(120, Math.min(480, s - Math.sign(e.deltaY) * 20)))}
      title="Arrastra para mover · rueda para cambiar el tamaño"
    >
      <video ref={ref} autoPlay muted playsInline />
    </div>
  );
}

function RecordingBadge({ onStop }: { onStop: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const s = Math.floor((now - recording.startedAt()) / 1000);
  return (
    <button
      className="rec-badge"
      onClick={(e) => {
        e.stopPropagation();
        onStop();
      }}
      title="Detener la grabación"
    >
      <span className="rec-dot" /> {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
      <Square size={11} fill="currentColor" />
    </button>
  );
}

export function PresentMode() {
  const presenting = useEditor((s) => s.presenting);
  const doc = useEditor((s) => s.doc);
  const host = useRef<HTMLDivElement>(null);
  const isRecording = useSyncExternalStore(recording.subscribe, recording.active);
  const camera = useSyncExternalStore(recording.subscribe, recording.camera);
  // Congela el documento durante la presentación para no reiniciar el reproductor.
  const frozen = useMemo(() => (presenting ? doc : null), [presenting]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!presenting || !host.current || !frozen) return;
    const root = host.current.querySelector<HTMLElement>('.lm-deck');
    if (!root) return;
    const exit = () => useEditor.setState({ presenting: null });
    const visible = frozen.slides.filter((s) => !s.hidden);
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
        const slide = visible[i];
        if (slide) {
          useEditor.setState({ currentSlideId: slide.id, selection: [] });
          markSlide(slide.id);
        }
        const maxStep = Math.max(
          0,
          ...(slide?.elements.flatMap((e) => [e.animation.step, e.animation.exitStep, e.animation.emphasisStep, e.animation.move.step]) ?? [0]),
        );
        publishPlayerState(i, step, maxStep);
      },
    });
    setActivePlayer(player);
    root.focus();
    host.current.requestFullscreen?.().catch(() => {});
    const onFs = () => {
      if (!document.fullscreenElement && !recording.active()) exit();
    };
    // Entrar a pantalla completa es asíncrono; escuchamos la salida solo después.
    const t = setTimeout(() => document.addEventListener('fullscreenchange', onFs), 400);
    return () => {
      clearTimeout(t);
      document.removeEventListener('fullscreenchange', onFs);
      player.destroy();
      setActivePlayer(null);
      if (recording.active()) void stopRecording();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [presenting, frozen]);

  if (!presenting || !frozen) return null;
  return createPortal(
    <motion.div ref={host} className="present-host" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
      <Deck doc={frozen} mode="play" />
      {camera && <CameraBubble stream={camera} />}
      {isRecording && <RecordingBadge onStop={() => useEditor.setState({ presenting: null })} />}
    </motion.div>,
    document.body,
  );
}
