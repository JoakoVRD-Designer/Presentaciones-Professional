import { motion } from 'framer-motion';
import { Layers, Play, Wand2 } from 'lucide-react';
import { EASINGS, ENTRANCES, LOOPS, type SlideElement } from '../../../core/model';
import { sfx } from '../../lib/sound';
import { useCurrentSlide, useEditor } from '../../store/editor';
import { Row, Section, Select, Slider } from '../ui/fields';
import { ENTRANCE_LABELS, LOOP_LABELS, useElementPatch } from './common';

const EASING_LABELS: Record<string, string> = {
  expo: 'Expo (suave)',
  'ease-out': 'Desacelerar',
  'ease-in-out': 'Suave entrada/salida',
  spring: 'Resorte',
  bounce: 'Rebote',
  linear: 'Lineal',
};

export function AnimationInspector({ elements }: { elements: SlideElement[] }) {
  const el = elements[0];
  const ids = elements.map((e) => e.id);
  const patch = useElementPatch(ids);
  const slide = useCurrentSlide();
  const preview = useEditor((s) => s.preview);
  const dispatch = useEditor((s) => s.dispatch);
  const a = el.animation;
  const anim = (p: Record<string, unknown>, field?: string) => patch({ animation: p }, `anim.${field ?? Object.keys(p).join(',')}`);
  const maxStep = Math.max(0, ...(slide?.elements.map((e) => e.animation.step) ?? [0]));

  const setEntrance = (v: string) => {
    anim({ entrance: v });
    // Previsualiza tras aplicar el cambio.
    requestAnimationFrame(() => preview(ids));
  };

  const stagger = () => {
    const ordered = [...elements].sort((x, y) => x.y - y.y || x.x - y.x);
    dispatch(
      ordered.map((e, i) => ({ op: 'element.animate', element: e.id, animation: { delay: i * 150 } })),
    );
    sfx('success');
    requestAnimationFrame(() => preview(ids));
  };

  const sequence = () => {
    const ordered = [...elements].sort((x, y) => x.y - y.y || x.x - y.x);
    dispatch(ordered.map((e, i) => ({ op: 'element.animate', element: e.id, animation: { step: i + 1, delay: 0 } })));
    sfx('success');
  };

  return (
    <div className="inspector-scroll">
      <div className="anim-hero">
        <motion.button
          className="btn primary wide"
          onClick={() => {
            sfx('whoosh');
            preview(ids);
          }}
          whileTap={{ scale: 0.97 }}
        >
          <Play size={14} /> Previsualizar
        </motion.button>
        {elements.length > 1 && (
          <div className="btn-row">
            <button className="btn soft" onClick={stagger} data-tip="Retrasos escalonados de 150 ms">
              <Wand2 size={14} /> Escalonar
            </button>
            <button className="btn soft" onClick={sequence} data-tip="Cada elemento aparece con un clic">
              <Layers size={14} /> Secuencia de clics
            </button>
          </div>
        )}
      </div>

      <Section title="Entrada" id="anim-in">
        <div className="anim-grid">
          {ENTRANCES.map((e) => (
            <button
              key={e}
              className={`anim-cell${a.entrance === e ? ' is-active' : ''}`}
              onClick={() => {
                sfx('tick');
                setEntrance(e);
              }}
            >
              <span className={`anim-demo demo-${e}`} />
              <span>{ENTRANCE_LABELS[e]}</span>
            </button>
          ))}
        </div>
        <Row label="Duración">
          <Slider value={a.duration} min={100} max={4000} step={50} unit="ms" onChange={(v) => anim({ duration: v }, 'dur')} />
        </Row>
        <Row label="Retraso">
          <Slider value={a.delay} min={0} max={6000} step={50} unit="ms" onChange={(v) => anim({ delay: v }, 'delay')} />
        </Row>
        <Row label="Curva">
          <Select value={a.easing} onChange={(v) => anim({ easing: v })} options={EASINGS.map((e) => ({ value: e, label: EASING_LABELS[e] }))} />
        </Row>
        <Row label="Aparece">
          <Select
            value={String(a.step)}
            onChange={(v) => anim({ step: Number(v) })}
            options={[
              { value: '0', label: 'Con la diapositiva' },
              ...Array.from({ length: Math.min(30, maxStep + 2) }, (_, i) => ({ value: String(i + 1), label: `En el clic ${i + 1}` })),
            ]}
          />
        </Row>
      </Section>

      <Section title="Bucle continuo" id="anim-loop">
        <div className="chips">
          {LOOPS.map((l) => (
            <button
              key={l}
              className={`chip${a.loop === l ? ' is-active' : ''}`}
              onClick={() => {
                sfx('tick');
                anim({ loop: l });
              }}
            >
              {LOOP_LABELS[l]}
            </button>
          ))}
        </div>
        {a.loop !== 'none' && (
          <Row label="Ciclo">
            <Slider value={a.loopDuration} min={300} max={20000} step={100} unit="ms" onChange={(v) => anim({ loopDuration: v }, 'loopdur')} />
          </Row>
        )}
        <p className="hint">Los bucles se ven en el editor si «Animaciones en vivo» está activo.</p>
      </Section>
    </div>
  );
}
