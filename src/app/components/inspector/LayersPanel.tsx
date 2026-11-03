import { Reorder } from 'framer-motion';
import {
  SquareCode,
  Sigma,
  PenTool,
  ChartColumn,
  Eye,
  EyeOff,
  Film,
  Globe,
  GripVertical,
  Image as ImageIcon,
  Lock,
  Shapes,
  Sparkles,
  Type,
  Unlock,
  Table2,
  Clapperboard,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SlideElement } from '../../../core/model';
import { htmlToPlainText } from '../../../core/sanitize';
import { sfx } from '../../lib/sound';
import { useCurrentSlide, useEditor } from '../../store/editor';
import { ENTRANCE_LABELS } from './common';

const TYPE_ICON: Record<SlideElement['type'], typeof Type> = {
  text: Type,
  image: ImageIcon,
  video: Film,
  shape: Shapes,
  icon: Sparkles,
  embed: Globe,
  chart: ChartColumn,
  table: Table2,
  lottie: Clapperboard,
  code: SquareCode,
  math: Sigma,
  svg: PenTool,
};

function labelOf(el: SlideElement): string {
  if (el.name) return el.name;
  if (el.type === 'text') return htmlToPlainText(el.html).slice(0, 40) || 'Texto';
  if (el.type === 'icon') return el.icon;
  if (el.type === 'code') return el.title || el.code.split('\n').find((l) => l.trim())?.trim().slice(0, 40) || 'Código';
  if (el.type === 'math') return el.tex.slice(0, 40) || 'Fórmula';
  if (el.type === 'svg') return 'Ilustración';
  if (el.type === 'chart') return `Gráfico (${el.chart})`;
  return ({ image: 'Imagen', video: 'Video', shape: 'Forma', embed: 'Web', table: 'Tabla', lottie: 'Lottie' } as Record<string, string>)[el.type] ?? el.type;
}

function LayerName({ el }: { el: SlideElement }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  if (editing) {
    return (
      <input
        className="layer-input"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setEditing(false);
        }}
        onBlur={() => {
          setEditing(false);
          if (draft !== el.name) useEditor.getState().dispatch([{ op: 'element.update', element: el.id, patch: { name: draft } }]);
        }}
      />
    );
  }
  return (
    <span
      className="layer-name"
      title="Doble clic para renombrar"
      onDoubleClick={(e) => {
        e.stopPropagation();
        setDraft(el.name || labelOf(el));
        setEditing(true);
      }}
    >
      {labelOf(el)}
    </span>
  );
}

export function LayersPanel() {
  const slide = useCurrentSlide();
  const selection = useEditor((s) => s.selection);
  const dispatch = useEditor((s) => s.dispatch);
  // Arriba en la lista = encima en el lienzo.
  const ids = useMemo(() => (slide ? [...slide.elements].reverse().map((e) => e.id) : []), [slide]);
  const [order, setOrder] = useState(ids);
  const dragging = useRef<string | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;
  useEffect(() => {
    if (!dragging.current) setOrder(ids);
  }, [ids]);

  if (!slide) return <div className="inspector-scroll empty">Sin diapositiva</div>;
  const byId = new Map(slide.elements.map((e) => [e.id, e]));

  if (!slide.elements.length) {
    return (
      <div className="inspector-scroll empty">
        <p className="muted">Esta diapositiva no tiene elementos. Usa la barra superior para añadirlos.</p>
      </div>
    );
  }

  return (
    <div className="inspector-scroll">
      <p className="hint layers-hint">Arrastra para reordenar · doble clic para renombrar · ⇧ clic para seleccionar varios</p>
      <Reorder.Group axis="y" values={order} onReorder={setOrder} className="layers" as="div">
        {order.map((id) => {
          const el = byId.get(id);
          if (!el) return null;
          const Icon = TYPE_ICON[el.type];
          const selected = selection.includes(id);
          return (
            <Reorder.Item
              key={id}
              value={id}
              as="div"
              className={`layer${selected ? ' is-selected' : ''}${el.hidden ? ' is-hidden' : ''}`}
              whileDrag={{ scale: 1.02, boxShadow: '0 10px 30px rgba(0,0,0,0.45)', zIndex: 3 }}
              onDragStart={() => {
                dragging.current = id;
              }}
              onDragEnd={() => {
                const moved = dragging.current;
                dragging.current = null;
                if (!moved) return;
                const visualIndex = orderRef.current.indexOf(moved);
                const target = slide.elements.length - 1 - visualIndex;
                const current = slide.elements.findIndex((e) => e.id === moved);
                if (target !== current) {
                  dispatch([{ op: 'element.order', element: moved, index: target }]);
                  sfx('pop');
                }
              }}
              onClick={(e) => {
                sfx('tick');
                if (e.altKey) useEditor.getState().select([id]);
                else if (e.shiftKey || e.metaKey || e.ctrlKey) useEditor.getState().toggleSelect(id);
                else useEditor.getState().select([id]);
              }}
            >
              <GripVertical size={13} className="layer-grip" />
              <span className="layer-icon">
                <Icon size={13} />
              </span>
              <LayerName el={el} />
              {el.group && <span className="layer-group" title="Pertenece a un grupo" />}
              {el.animation.entrance !== 'none' && (
                <span className="layer-anim" title={`Entrada: ${ENTRANCE_LABELS[el.animation.entrance]}`}>
                  {el.animation.step > 0 ? `clic ${el.animation.step}` : '✦'}
                </span>
              )}
              <button
                className={`layer-btn${el.locked ? ' is-on' : ''}`}
                aria-label={el.locked ? 'Desbloquear' : 'Bloquear'}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  sfx('toggle');
                  dispatch([{ op: 'element.update', element: id, patch: { locked: !el.locked } }]);
                }}
              >
                {el.locked ? <Lock size={12} /> : <Unlock size={12} />}
              </button>
              <button
                className={`layer-btn${el.hidden ? ' is-on' : ''}`}
                aria-label={el.hidden ? 'Mostrar' : 'Ocultar'}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  sfx('toggle');
                  dispatch([{ op: 'element.update', element: id, patch: { hidden: !el.hidden } }]);
                }}
              >
                {el.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </Reorder.Item>
          );
        })}
      </Reorder.Group>
    </div>
  );
}
