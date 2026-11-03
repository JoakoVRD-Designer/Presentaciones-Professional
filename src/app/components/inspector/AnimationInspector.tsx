import { motion } from 'framer-motion';
import { Layers, Play, Wand2 } from 'lucide-react';
import { EASINGS, EMPHASES, ENTRANCES, EXITS, LOOPS, SPLITS, type SlideElement } from '../../../core/model';
import { sfx } from '../../lib/sound';
import { useCurrentSlide, useEditor } from '../../store/editor';
import { Grid, NumberInput, Row, Section, Segmented, Select, Slider, Switch } from '../ui/fields';
import { EMPHASIS_LABELS, ENTRANCE_LABELS, EXIT_LABELS, LOOP_LABELS, useElementPatch } from './common';

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
  const maxStep = Math.max(
    0,
    ...(slide?.elements.flatMap((e) => [e.animation.step, e.animation.exitStep, e.animation.emphasisStep, e.animation.move.step]) ?? [0]),
  );

  const stepOptions = (zero: string) => [
    { value: '0', label: zero },
    ...Array.from({ length: Math.min(30, maxStep + 2) }, (_, i) => ({ value: String(i + 1), label: `En el clic ${i + 1}` })),
  ];
  const isText = el.type === 'text';

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
          <Select value={String(a.step)} onChange={(v) => anim({ step: Number(v) })} options={stepOptions('Con la diapositiva')} />
        </Row>
      </Section>

      {isText && (
        <Section title="Texto cinético" id="anim-kinetic">
          <Segmented
            layoutId="anim-split"
            value={a.split}
            onChange={(v) => {
              anim({ split: v });
              requestAnimationFrame(() => preview(ids));
            }}
            options={SPLITS.map((sp) => ({ value: sp, label: { none: 'Bloque', lines: 'Líneas', words: 'Palabras', chars: 'Letras' }[sp] }))}
          />
          {a.split !== 'none' && (
            <Row label="Escalonado">
              <Slider value={a.stagger} min={0} max={400} step={5} unit="ms" onChange={(v) => anim({ stagger: v }, 'stagger')} />
            </Row>
          )}
          <Row label="Contar cifras" hint="Los números del texto cuentan desde 0 al aparecer (ideal para estadísticas).">
            <Switch checked={a.countUp} onChange={(v) => anim({ countUp: v })} />
          </Row>
          <p className="hint">Cada línea, palabra o letra entra con la animación elegida, una tras otra.</p>
        </Section>
      )}

      <Section title="Énfasis" id="anim-emphasis" defaultOpen={false}>
        <div className="chips">
          {EMPHASES.map((e) => (
            <button
              key={e}
              className={`chip${a.emphasis === e ? ' is-active' : ''}`}
              onClick={() => {
                sfx('tick');
                anim({ emphasis: e, emphasisStep: e === 'none' ? 0 : a.emphasisStep || maxStep + 1 });
              }}
            >
              {EMPHASIS_LABELS[e]}
            </button>
          ))}
        </div>
        {a.emphasis !== 'none' && (
          <Row label="Cuándo">
            <Select value={String(a.emphasisStep)} onChange={(v) => anim({ emphasisStep: Number(v) })} options={stepOptions('Nunca')} />
          </Row>
        )}
      </Section>

      <Section title="Trayectoria de movimiento" id="anim-move" defaultOpen={false}>
        <Row label="Cuándo">
          <Select
            value={String(a.move.step)}
            onChange={(v) => anim({ move: { step: Number(v), ...(Number(v) && !a.move.x && !a.move.y ? { x: 300 } : {}) } })}
            options={stepOptions('Sin movimiento')}
          />
        </Row>
        {a.move.step > 0 && (
          <>
            <Grid cols={2}>
              <NumberInput label="Δx" value={a.move.x} unit="px" onChange={(v) => anim({ move: { x: v } }, 'mvx')} />
              <NumberInput label="Δy" value={a.move.y} unit="px" onChange={(v) => anim({ move: { y: v } }, 'mvy')} />
              <NumberInput label="Esc" value={a.move.scale} min={0.05} max={20} step={0.05} precision={2} unit="×" onChange={(v) => anim({ move: { scale: v } }, 'mvs')} />
              <NumberInput label="↻" value={a.move.rotate} unit="°" onChange={(v) => anim({ move: { rotate: v } }, 'mvr')} />
            </Grid>
            <Row label="Duración">
              <Slider value={a.move.duration} min={100} max={6000} step={50} unit="ms" onChange={(v) => anim({ move: { duration: v } }, 'mvd')} />
            </Row>
            <p className="hint">La línea punteada en el lienzo muestra el destino.</p>
          </>
        )}
      </Section>

      <Section title="Salida" id="anim-exit" defaultOpen={false}>
        <div className="chips">
          {EXITS.map((e) => (
            <button
              key={e}
              className={`chip${a.exit === e ? ' is-active' : ''}`}
              onClick={() => {
                sfx('tick');
                anim({ exit: e, exitStep: e === 'none' ? 0 : a.exitStep || maxStep + 1 });
              }}
            >
              {EXIT_LABELS[e]}
            </button>
          ))}
        </div>
        {a.exit !== 'none' && (
          <>
            <Row label="Cuándo">
              <Select value={String(a.exitStep)} onChange={(v) => anim({ exitStep: Number(v) })} options={stepOptions('Nunca')} />
            </Row>
            <Row label="Duración">
              <Slider value={a.exitDuration} min={100} max={3000} step={50} unit="ms" onChange={(v) => anim({ exitDuration: v }, 'exitdur')} />
            </Row>
          </>
        )}
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
