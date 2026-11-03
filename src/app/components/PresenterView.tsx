import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, MonitorPlay } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Presentation } from '../../core/model';
import { SlideRenderer } from '../../render/SlideRenderer';
import { presenterChannel, type PresenterMessage } from '../lib/presenter';

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function Scaled({ doc, index, label }: { doc: Presentation; index: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const visible = doc.slides.filter((s) => !s.hidden);
  const slide = visible[index];
  const s = w / doc.width;
  return (
    <div className="pv-slide" ref={ref}>
      <span className="pv-label">{label}</span>
      <div className="pv-frame" style={{ height: doc.height * s }}>
        {slide ? (
          <div style={{ transform: `scale(${s})`, transformOrigin: '0 0', width: doc.width, height: doc.height }}>
            <SlideRenderer slide={slide} theme={doc.theme} width={doc.width} height={doc.height} mode="edit" live />
          </div>
        ) : (
          <div className="pv-end">Fin de la presentación</div>
        )}
      </div>
    </div>
  );
}

export function PresenterView() {
  const [doc, setDoc] = useState<Presentation | null>(null);
  const [state, setState] = useState({ presenting: false, index: 0, step: 0, maxStep: 0 });
  const [start, setStart] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [fontSize, setFontSize] = useState(22);
  const ch = useMemo(() => presenterChannel(), []);

  useEffect(() => {
    if (!ch) return;
    ch.onmessage = (e: MessageEvent<PresenterMessage>) => {
      const m = e.data;
      if (m.type === 'doc') setDoc(m.doc);
      if (m.type === 'state') {
        setState({ presenting: m.presenting, index: m.index, step: m.step, maxStep: m.maxStep });
        if (m.presenting) setStart((s) => s ?? Date.now());
      }
    };
    ch.postMessage({ type: 'hello' } satisfies PresenterMessage);
    document.title = 'Vista del orador · Lumen';
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [ch]);

  const send = (action: 'next' | 'prev') => ch?.postMessage({ type: 'cmd', action } satisfies PresenterMessage);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault();
        send('next');
      }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        send('prev');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!ch) return <div className="pv-wait">Este navegador no admite BroadcastChannel.</div>;
  if (!doc) return <div className="pv-wait">Conectando con el editor… (mantén abierta la pestaña del editor)</div>;

  const visible = doc.slides.filter((s) => !s.hidden);
  const slide = visible[state.index];

  return (
    <div className="presenter">
      <header className="pv-head">
        <b>{doc.title}</b>
        <span className={`pv-status${state.presenting ? ' is-live' : ''}`}>
          <MonitorPlay size={14} /> {state.presenting ? 'En vivo' : 'Editor (pulsa Presentar en la otra ventana)'}
        </span>
        <span className="grow" />
        <span className="pv-timer">{start ? fmt(now - start) : '00:00'}</span>
        <button className="icon-btn" data-tip="Reiniciar cronómetro" onClick={() => setStart(state.presenting ? Date.now() : null)}>
          <RotateCcw size={15} />
        </button>
        <span className="pv-clock">{new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </header>
      <main className="pv-main">
        <section className="pv-current">
          <Scaled doc={doc} index={state.index} label={`Actual · ${state.index + 1} / ${visible.length}`} />
          <div className="pv-controls">
            <motion.button className="btn" whileTap={{ scale: 0.95 }} onClick={() => send('prev')}>
              <ChevronLeft size={16} /> Anterior
            </motion.button>
            {state.maxStep > 0 && (
              <span className="pv-steps">
                {Array.from({ length: state.maxStep }, (_, i) => (
                  <i key={i} className={i < state.step ? 'on' : ''} />
                ))}
              </span>
            )}
            <motion.button className="btn primary" whileTap={{ scale: 0.95 }} onClick={() => send('next')}>
              Siguiente <ChevronRight size={16} />
            </motion.button>
          </div>
        </section>
        <aside className="pv-side">
          <Scaled doc={doc} index={state.index + 1} label="Siguiente" />
          <div className="pv-notes-head">
            <span>Notas</span>
            <button className="icon-btn" aria-label="Reducir" onClick={() => setFontSize((f) => Math.max(12, f - 2))}>
              <Minus size={14} />
            </button>
            <button className="icon-btn" aria-label="Aumentar" onClick={() => setFontSize((f) => Math.min(48, f + 2))}>
              <Plus size={14} />
            </button>
          </div>
          <div className="pv-notes" style={{ fontSize }}>
            {slide?.notes || <span className="muted">Sin notas para esta diapositiva.</span>}
          </div>
        </aside>
      </main>
    </div>
  );
}
