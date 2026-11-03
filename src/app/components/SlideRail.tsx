import { motion, Reorder } from 'framer-motion';
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Plus, Trash2, Wand2 } from 'lucide-react';
import { duplicateForMorph } from '../lib/actions';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { buildLayout, LAYOUTS } from '../../core/layouts';
import { makeSlide, type Slide, type Theme } from '../../core/model';
import { SlideRenderer } from '../../render/SlideRenderer';
import { sfx } from '../lib/sound';
import { useEditor } from '../store/editor';
import { ContextMenu, Popover, type MenuItem } from './ui/Popover';

export const Thumb = memo(function Thumb({ slide, theme, width }: { slide: Slide; theme: Theme; width: number }) {
  const W = useEditor((s) => s.doc.width);
  const H = useEditor((s) => s.doc.height);
  const s = width / W;
  return (
    <div className="thumb" style={{ width, height: H * s }}>
      <div style={{ transform: `scale(${s})`, transformOrigin: '0 0', width: W, height: H }}>
        <SlideRenderer slide={slide} theme={theme} width={W} height={H} mode="thumb" />
      </div>
    </div>
  );
});

export function LayoutGallery({ onPick }: { onPick: (layoutId: string) => void }) {
  const theme = useEditor((s) => s.doc.theme);
  const previews = useMemo(
    () => LAYOUTS.map((l) => ({ layout: l, slide: makeSlide(buildLayout(l.id, {}, theme)) })),
    [theme],
  );
  return (
    <div className="layout-gallery">
      <div className="pop-title">Nueva diapositiva</div>
      <div className="layout-grid">
        {previews.map(({ layout, slide }) => (
          <motion.button
            key={layout.id}
            className="layout-card"
            onClick={() => onPick(layout.id)}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            title={layout.description}
          >
            <Thumb slide={slide} theme={theme} width={150} />
            <span>{layout.name}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export function SlideRail() {
  const slides = useEditor((s) => s.doc.slides);
  const theme = useEditor((s) => s.doc.theme);
  const current = useEditor((s) => s.currentSlideId);
  const dispatch = useEditor((s) => s.dispatch);
  const [order, setOrder] = useState(() => slides.map((s) => s.id));
  const dragging = useRef<string | null>(null);
  const [menu, setMenu] = useState<null | { x: number; y: number; id: string }>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const orderRef = useRef(order);
  orderRef.current = order;

  useEffect(() => {
    if (!dragging.current) setOrder(slides.map((s) => s.id));
  }, [slides]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-slide="${current}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [current]);

  const byId = useMemo(() => new Map(slides.map((s) => [s.id, s])), [slides]);

  const addSlide = (layout: string) => {
    const idx = slides.findIndex((s) => s.id === current);
    const [res] = dispatch([{ op: 'slide.add', layout, content: {}, index: idx + 1 }]);
    if (res?.id) useEditor.getState().selectSlide(res.id);
    sfx('pop');
  };

  const menuItems = (id: string): (MenuItem | 'sep')[] => {
    const idx = slides.findIndex((s) => s.id === id);
    const slide = slides[idx];
    if (!slide) return [];
    return [
      {
        label: 'Duplicar',
        icon: <Copy size={14} />,
        kbd: '⌘D',
        onSelect: () => {
          const [r] = dispatch([{ op: 'slide.duplicate', slide: id }]);
          if (r?.id) useEditor.getState().selectSlide(r.id);
        },
      },
      { label: 'Duplicar con Morph', icon: <Wand2 size={14} />, onSelect: duplicateForMorph },
      {
        label: slide.hidden ? 'Mostrar en presentación' : 'Ocultar en presentación',
        icon: slide.hidden ? <Eye size={14} /> : <EyeOff size={14} />,
        onSelect: () => dispatch([{ op: 'slide.update', slide: id, patch: { hidden: !slide.hidden } }]),
      },
      'sep',
      { label: 'Subir', icon: <ArrowUp size={14} />, disabled: idx === 0, onSelect: () => dispatch([{ op: 'slide.move', slide: id, to: idx - 1 }]) },
      {
        label: 'Bajar',
        icon: <ArrowDown size={14} />,
        disabled: idx === slides.length - 1,
        onSelect: () => dispatch([{ op: 'slide.move', slide: id, to: idx + 1 }]),
      },
      'sep',
      {
        label: 'Eliminar',
        icon: <Trash2 size={14} />,
        danger: true,
        onSelect: () => {
          sfx('remove');
          dispatch([{ op: 'slide.delete', slide: id }]);
        },
      },
    ];
  };

  return (
    <aside className="rail">
      <div className="rail-head">
        <span>Diapositivas</span>
        <span className="rail-count">{slides.length}</span>
      </div>
      <div className="rail-list" ref={listRef}>
        <Reorder.Group axis="y" values={order} onReorder={setOrder} className="rail-group" as="div">
          {order.map((id, i) => {
            const slide = byId.get(id);
            if (!slide) return null;
            return (
              <Reorder.Item
                key={id}
                value={id}
                as="div"
                className={`rail-item${id === current ? ' is-current' : ''}${slide.hidden ? ' is-hidden' : ''}`}
                data-slide={id}
                onDragStart={() => {
                  dragging.current = id;
                  sfx('tap');
                }}
                onDragEnd={() => {
                  const moved = dragging.current;
                  dragging.current = null;
                  if (!moved) return;
                  const to = orderRef.current.indexOf(moved);
                  const from = slides.findIndex((s) => s.id === moved);
                  if (to !== from && to >= 0) {
                    dispatch([{ op: 'slide.move', slide: moved, to }]);
                    sfx('pop');
                  } else setOrder(slides.map((s) => s.id));
                }}
                whileDrag={{ scale: 1.04, zIndex: 5, boxShadow: '0 18px 40px rgba(0,0,0,0.5)' }}
                onClick={() => {
                  if (id !== current) sfx('tick');
                  useEditor.getState().selectSlide(id);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  useEditor.getState().selectSlide(id);
                  setMenu({ x: e.clientX, y: e.clientY, id });
                }}
              >
                <span className="rail-num">{i + 1}</span>
                <div className="rail-thumb">
                  <Thumb slide={slide} theme={theme} width={176} />
                  {slide.hidden && (
                    <span className="rail-badge">
                      <EyeOff size={12} />
                    </span>
                  )}
                  {slide.transition.type !== 'none' && <span className="rail-trans" title={`Transición: ${slide.transition.type}`} />}
                </div>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      </div>
      <div className="rail-foot">
        <Popover
          width={580}
          side="right"
          trigger={({ toggle, ref }) => (
            <motion.button
              ref={ref as React.RefObject<HTMLButtonElement>}
              className="rail-add"
              onClick={toggle}
              whileHover="hover"
              whileTap={{ scale: 0.97 }}
              initial="rest"
            >
              <motion.span variants={{ rest: { rotate: 0 }, hover: { rotate: 90 } }}>
                <Plus size={16} />
              </motion.span>
              Nueva diapositiva
            </motion.button>
          )}
        >
          {(close) => (
            <LayoutGallery
              onPick={(id) => {
                addSlide(id);
                close();
              }}
            />
          )}
        </Popover>
      </div>
      <ContextMenu at={menu} items={menu ? menuItems(menu.id) : []} onClose={() => setMenu(null)} />
    </aside>
  );
}
