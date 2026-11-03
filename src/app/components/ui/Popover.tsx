import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { sfx } from '../../lib/sound';

interface PopoverProps {
  trigger: (o: { open: boolean; toggle: () => void; ref: React.RefObject<HTMLElement | null> }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'start' | 'end' | 'center';
  side?: 'bottom' | 'top' | 'left' | 'right';
  width?: number;
  className?: string;
}

export function Popover({ trigger, children, align = 'start', side = 'bottom', width, className }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; origin: string }>({ left: 0, top: 0, origin: 'top left' });

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => {
    setOpen((o) => {
      sfx(o ? 'close' : 'open');
      return !o;
    });
  }, []);

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const place = () => {
      const r = anchor.current!.getBoundingClientRect();
      const p = panel.current?.getBoundingClientRect();
      const pw = p?.width ?? width ?? 260;
      const ph = p?.height ?? 200;
      let left = 0;
      let top = 0;
      if (side === 'bottom' || side === 'top') {
        left = align === 'start' ? r.left : align === 'end' ? r.right - pw : r.left + r.width / 2 - pw / 2;
        top = side === 'bottom' ? r.bottom + 8 : r.top - ph - 8;
        if (side === 'bottom' && top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 8);
      } else {
        top = r.top;
        left = side === 'left' ? r.left - pw - 8 : r.right + 8;
        if (top + ph > window.innerHeight - 8) top = Math.max(8, window.innerHeight - ph - 8);
      }
      left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
      setPos({ left, top, origin: `${side === 'top' ? 'bottom' : 'top'} ${align === 'end' ? 'right' : 'left'}` });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
    };
  }, [open, align, side, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <>
      {trigger({ open, toggle, ref: anchor })}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={panel}
              className={`popover${className ? ` ${className}` : ''}`}
              style={{ left: pos.left, top: pos.top, width, transformOrigin: pos.origin }}
              initial={{ opacity: 0, scale: 0.96, y: side === 'top' ? 6 : -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: side === 'top' ? 4 : -4, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            >
              {typeof children === 'function' ? children(close) : children}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  width = 720,
  icon,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  width?: number;
  icon?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="dialog-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onPointerDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            className="dialog"
            role="dialog"
            aria-modal="true"
            style={{ width }}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <header className="dialog-head">
              {icon}
              <h2>{title}</h2>
              <button className="dialog-close" onClick={onClose} aria-label="Cerrar">
                ×
              </button>
            </header>
            <div className="dialog-body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  kbd?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export function MenuList({ items, onDone }: { items: (MenuItem | 'sep')[]; onDone: () => void }) {
  return (
    <div className="menu" role="menu">
      {items.map((it, i) =>
        it === 'sep' ? (
          <div key={i} className="menu-sep" />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={`menu-item${it.danger ? ' is-danger' : ''}`}
            disabled={it.disabled}
            onClick={() => {
              sfx('tap');
              it.onSelect();
              onDone();
            }}
          >
            <span className="menu-icon">{it.icon}</span>
            <span className="menu-label">{it.label}</span>
            {it.kbd && <kbd>{it.kbd}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}

/** Menú contextual en la posición del puntero. */
export function ContextMenu({
  at,
  items,
  onClose,
}: {
  at: { x: number; y: number } | null;
  items: (MenuItem | 'sep')[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    if (!at) return;
    const r = ref.current?.getBoundingClientRect();
    const w = r?.width ?? 220;
    const h = r?.height ?? 300;
    setPos({ x: Math.min(at.x, window.innerWidth - w - 8), y: Math.min(at.y, window.innerHeight - h - 8) });
  }, [at]);
  useEffect(() => {
    if (!at) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onClose);
    };
  }, [at, onClose]);
  return createPortal(
    <AnimatePresence>
      {at && (
        <motion.div
          ref={ref}
          className="popover context-menu"
          style={{ left: pos.x, top: pos.y }}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
          transition={{ duration: 0.14 }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <MenuList items={items} onDone={onClose} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
