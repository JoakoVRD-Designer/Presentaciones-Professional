import { AnimatePresence, motion } from 'framer-motion';
import { useCurrentSlide, useEditor, type Panel } from '../../store/editor';
import { sfx } from '../../lib/sound';
import { AnimationInspector } from './AnimationInspector';
import { ElementInspector } from './ElementInspector';
import { SlideInspector } from './SlideInspector';
import { ThemeInspector } from './ThemeInspector';

export function Inspector() {
  const panel = useEditor((s) => s.panel);
  const selection = useEditor((s) => s.selection);
  const slide = useCurrentSlide();
  const elements = slide?.elements.filter((e) => selection.includes(e.id)) ?? [];
  const hasSel = elements.length > 0;

  const tabs: { id: Panel; label: string }[] = hasSel
    ? [
        { id: 'design', label: 'Diseño' },
        { id: 'animation', label: 'Animación' },
        { id: 'slide', label: 'Diapositiva' },
      ]
    : [
        { id: 'slide', label: 'Diapositiva' },
        { id: 'theme', label: 'Tema' },
      ];
  const active = tabs.some((t) => t.id === panel) ? panel : tabs[0].id;

  return (
    <aside className="inspector">
      <nav className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            className={`tab${active === t.id ? ' is-active' : ''}`}
            onClick={() => {
              if (active !== t.id) sfx('tick');
              useEditor.setState({ panel: t.id });
            }}
          >
            {active === t.id && <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${active}:${hasSel ? elements.map((e) => e.id).join(',') : 'none'}`}
          className="inspector-body"
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.16 }}
        >
          {active === 'design' && hasSel && <ElementInspector elements={elements} />}
          {active === 'animation' && hasSel && <AnimationInspector elements={elements} />}
          {active === 'slide' && <SlideInspector />}
          {active === 'theme' && <ThemeInspector />}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}
