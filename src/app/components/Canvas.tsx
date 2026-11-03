import {
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Pencil,
  Play,
  Trash2,
  Unlock,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Command } from '../../core/commands';
import type { SlideElement } from '../../core/model';
import { sanitizeHtml } from '../../core/sanitize';
import { SlideRenderer } from '../../render/SlideRenderer';
import { countUp } from '../../runtime/player.js';
import { mediaSize, uploadAsset } from '../lib/assets';
import { setCursor } from '../lib/collab';
import { sfx } from '../lib/sound';
import { expandGroups, useCurrentSlide, useEditor } from '../store/editor';
import { CommentLayer, PeerLayer } from './Collab';
import { ContextMenu, type MenuItem } from './ui/Popover';

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_DIR: Record<Handle, [number, number]> = {
  n: [0, -1],
  s: [0, 1],
  e: [1, 0],
  w: [-1, 0],
  ne: [1, -1],
  nw: [-1, -1],
  se: [1, 1],
  sw: [-1, 1],
};

interface Guides {
  v: number[];
  h: number[];
}

const rad = (d: number) => (d * Math.PI) / 180;
function rotate(x: number, y: number, deg: number): [number, number] {
  const r = rad(deg);
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
}

function snapAxis(cands: number[], targets: number[], threshold: number): { delta: number; line: number | null } {
  let best = { delta: 0, line: null as number | null, dist: threshold + 1 };
  for (const c of cands) {
    for (const t of targets) {
      const d = Math.abs(t - c);
      if (d < best.dist) best = { delta: t - c, line: t, dist: d };
    }
  }
  return best.dist <= threshold ? { delta: best.delta, line: best.line } : { delta: 0, line: null };
}

export function Canvas() {
  const slide = useCurrentSlide();
  const theme = useEditor((s) => s.doc.theme);
  const W = useEditor((s) => s.doc.width);
  const H = useEditor((s) => s.doc.height);
  const selection = useEditor((s) => s.selection);
  const editingId = useEditor((s) => s.editingId);
  const zoom = useEditor((s) => s.zoom);
  const live = useEditor((s) => s.liveAnimations);
  const previewTick = useEditor((s) => s.previewTick);
  const commentMode = useEditor((s) => s.commentMode);

  const viewport = useRef<HTMLDivElement>(null);
  const slideLayer = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1000, h: 600 });
  const [guides, setGuides] = useState<Guides>({ v: [], h: [] });
  const [marquee, setMarquee] = useState<null | { x: number; y: number; w: number; h: number }>(null);
  const [menu, setMenu] = useState<null | { x: number; y: number }>(null);
  const [dragOver, setDragOver] = useState(false);

  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const scale = zoom === 'fit' ? Math.max(0.05, Math.min((size.w - 96) / W, (size.h - 96) / H)) : zoom;

  /* ---------- Vista previa de animaciones ---------- */
  // Reproduce la secuencia completa del elemento: entrada → énfasis → trayectoria → salida.
  useEffect(() => {
    if (!previewTick.ids.length || !slideLayer.current) return;
    const timers: number[] = [];
    const stops: (() => void)[] = [];
    const resets: (() => void)[] = [];
    for (const id of previewTick.ids) {
      const root = slideLayer.current.querySelector<HTMLElement>(`.lm-el[data-id="${CSS.escape(id)}"]`);
      const anim = root?.querySelector<HTMLElement>('.lm-anim');
      const body = root?.querySelector<HTMLElement>('.lm-body');
      const el = slide?.elements.find((e) => e.id === id);
      if (!anim || !el) continue;
      const a = el.animation;
      const reset = () => {
        anim.classList.remove('lm-preview', 'lm-moved', 'lm-out-preview');
        body?.classList.remove('lm-emph');
      };
      reset();
      void anim.offsetWidth;
      anim.classList.add('lm-preview');
      if (a.countUp && el.type === 'text') stops.push(countUp(anim, Math.max(1200, a.duration * 1.6), a.delay));
      const pieces = anim.querySelectorAll('.lm-sw').length;
      let t = a.delay + a.duration + (pieces > 1 ? (pieces - 1) * a.stagger : 0) + 200;
      if (a.emphasis !== 'none' && a.emphasisStep) {
        timers.push(window.setTimeout(() => body?.classList.add('lm-emph'), t));
        t += 1000;
      }
      if (a.move.step) {
        timers.push(window.setTimeout(() => anim.classList.add('lm-moved'), t));
        t += a.move.duration + 300;
      }
      if (a.exit !== 'none' && a.exitStep) {
        timers.push(window.setTimeout(() => anim.classList.add('lm-out-preview'), t));
        t += a.exitDuration + 400;
      }
      timers.push(window.setTimeout(reset, t + (a.exit !== 'none' && a.exitStep ? 300 : 600)));
      resets.push(reset);
    }
    return () => {
      timers.forEach(clearTimeout);
      stops.forEach((stop) => stop());
      resets.forEach((r) => r());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewTick]);

  /* ---------- Coordenadas ---------- */
  const toSlide = useCallback(
    (clientX: number, clientY: number) => {
      const r = slideLayer.current!.getBoundingClientRect();
      return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
    },
    [scale],
  );

  const dispatch = useEditor((s) => s.dispatch);

  /* ---------- Colaboración ---------- */
  /** En modo comentario, un clic fija la posición de un comentario nuevo. */
  const placeComment = (clientX: number, clientY: number, elementId?: string) => {
    if (!slide || !slideLayer.current) return;
    const p = toSlide(clientX, clientY);
    if (p.x < 0 || p.y < 0 || p.x > W || p.y > H) {
      useEditor.setState({ commentDraft: null });
      return;
    }
    const hit =
      elementId ??
      [...slide.elements].reverse().find((el) => !el.hidden && p.x >= el.x && p.x <= el.x + el.w && p.y >= el.y && p.y <= el.y + el.h)?.id;
    sfx('pop');
    useEditor.setState({
      commentDraft: { slideId: slide.id, elementId: hit ?? null, x: Math.round(p.x), y: Math.round(p.y) },
      openComment: null,
    });
  };
  const onPointerMoveCursor = (e: React.PointerEvent) => {
    if (!slideLayer.current || e.pointerType === 'touch') return;
    const p = toSlide(e.clientX, e.clientY);
    setCursor(p.x < -40 || p.y < -40 || p.x > W + 40 || p.y > H + 40 ? null : p);
  };

  /* ---------- Arrastrar elementos ---------- */
  const startDrag = (e: React.PointerEvent, el: SlideElement) => {
    if (e.button !== 0 || !slide) return;
    e.stopPropagation();
    const st = useEditor.getState();
    if (st.commentMode) {
      e.preventDefault(); // evita que el mousedown quite el foco al cuadro de comentario
      placeComment(e.clientX, e.clientY, el.id);
      return;
    }
    if (st.openComment || st.commentDraft) useEditor.setState({ openComment: null, commentDraft: null });
    if (st.editingId === el.id) return;
    if (st.editingId) st.setEditing(null);
    let ids = st.selection;
    // Alt = seleccionar un elemento dentro de su grupo.
    const picked = e.altKey ? [el.id] : expandGroups([el.id]);
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      const has = ids.includes(el.id);
      st.select(has ? ids.filter((x) => !picked.includes(x)) : [...new Set([...ids, ...picked])]);
      return;
    }
    if (!ids.includes(el.id)) {
      st.select(picked);
      ids = picked;
      sfx('tick');
    }
    const movable = slide.elements.filter((x) => ids.includes(x.id) && !x.locked);
    if (!movable.length) return;
    const origins = new Map(movable.map((m) => [m.id, { x: m.x, y: m.y }]));
    const box = {
      x: Math.min(...movable.map((m) => m.x)),
      y: Math.min(...movable.map((m) => m.y)),
      r: Math.max(...movable.map((m) => m.x + m.w)),
      b: Math.max(...movable.map((m) => m.y + m.h)),
    };
    const others = slide.elements.filter((x) => !ids.includes(x.id) && !x.hidden);
    const xs = [0, W / 2, W, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
    const ys = [0, H / 2, H, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
    const start = { x: e.clientX, y: e.clientY };
    const key = `drag:${Date.now()}`;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    let moved = false;

    const move = (ev: PointerEvent) => {
      let dx = (ev.clientX - start.x) / scale;
      let dy = (ev.clientY - start.y) / scale;
      if (!moved && Math.hypot(dx, dy) * scale < 3) return;
      moved = true;
      if (ev.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const g: Guides = { v: [], h: [] };
      if (!ev.altKey) {
        const th = 6 / scale;
        const bw = box.r - box.x;
        const bh = box.b - box.y;
        const sx = snapAxis([box.x + dx, box.x + dx + bw / 2, box.x + dx + bw], xs, th);
        const sy = snapAxis([box.y + dy, box.y + dy + bh / 2, box.y + dy + bh], ys, th);
        dx += sx.delta;
        dy += sy.delta;
        if (sx.line !== null) g.v.push(sx.line);
        if (sy.line !== null) g.h.push(sy.line);
      }
      setGuides(g);
      const cmds: Command[] = movable.map((m) => ({
        op: 'element.update',
        element: m.id,
        patch: { x: Math.round(origins.get(m.id)!.x + dx), y: Math.round(origins.get(m.id)!.y + dy) },
      }));
      useEditor.getState().dispatch(cmds, { merge: key });
    };
    const up = () => {
      setGuides({ v: [], h: [] });
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  /* ---------- Redimensionar ---------- */
  const startResize = (e: React.PointerEvent, el: SlideElement, handle: Handle) => {
    e.stopPropagation();
    e.preventDefault();
    const [hx, hy] = HANDLE_DIR[handle];
    const start = { x: e.clientX, y: e.clientY };
    const o = { x: el.x, y: el.y, w: el.w, h: el.h, r: el.rotation };
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const [ax, ay] = rotate((-hx * o.w) / 2, (-hy * o.h) / 2, o.r);
    const anchor = { x: cx + ax, y: cy + ay };
    const keepRatioDefault = el.type === 'image' || el.type === 'icon' || el.type === 'video';
    const key = `resize:${Date.now()}`;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const [lx, ly] = rotate((ev.clientX - start.x) / scale, (ev.clientY - start.y) / scale, -o.r);
      let w = hx ? Math.max(8, o.w + hx * lx) : o.w;
      let h = hy ? Math.max(8, o.h + hy * ly) : o.h;
      const keep = (keepRatioDefault ? !ev.shiftKey : ev.shiftKey) && hx !== 0 && hy !== 0;
      if (keep) {
        const ratio = o.w / o.h;
        if (w / o.w > h / o.h) h = w / ratio;
        else w = h * ratio;
      }
      const [px, py] = rotate((hx * w) / 2, (hy * h) / 2, o.r);
      const ncx = anchor.x + px;
      const ncy = anchor.y + py;
      // El punto opuesto al manejador permanece fijo (también con rotación).
      const patch = {
        x: Math.round(ncx - w / 2),
        y: Math.round(ncy - h / 2),
        w: Math.round(w),
        h: Math.round(h),
      };
      useEditor.getState().dispatch([{ op: 'element.update', element: el.id, patch }], { merge: key });
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  /* ---------- Rotar ---------- */
  const startRotate = (e: React.PointerEvent, el: SlideElement) => {
    e.stopPropagation();
    e.preventDefault();
    const r = slideLayer.current!.getBoundingClientRect();
    const center = { x: r.left + (el.x + el.w / 2) * scale, y: r.top + (el.y + el.h / 2) * scale };
    const key = `rotate:${Date.now()}`;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      let deg = (Math.atan2(ev.clientY - center.y, ev.clientX - center.x) * 180) / Math.PI + 90;
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
      else {
        const near = Math.round(deg / 90) * 90;
        if (Math.abs(near - deg) < 3) deg = near;
      }
      deg = ((Math.round(deg) % 360) + 360) % 360;
      if (deg > 180) deg -= 360;
      useEditor.getState().dispatch([{ op: 'element.update', element: el.id, patch: { rotation: deg } }], { merge: key });
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  /* ---------- Selección por marco ---------- */
  const onViewportDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !slide || !slideLayer.current) return;
    const st = useEditor.getState();
    if (st.commentMode) {
      e.preventDefault();
      placeComment(e.clientX, e.clientY);
      return;
    }
    if (st.openComment || st.commentDraft) {
      useEditor.setState({ openComment: null, commentDraft: null });
      return;
    }
    if (st.editingId) {
      st.setEditing(null);
      return;
    }
    const p0 = toSlide(e.clientX, e.clientY);
    const additive = e.shiftKey;
    const base = additive ? st.selection : [];
    let moved = false;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const p = toSlide(ev.clientX, ev.clientY);
      const rect = { x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) };
      if (!moved && rect.w * scale < 4 && rect.h * scale < 4) return;
      moved = true;
      setMarquee(rect);
      const hit = slide.elements
        .filter((el) => el.x < rect.x + rect.w && el.x + el.w > rect.x && el.y < rect.y + rect.h && el.y + el.h > rect.y)
        .map((el) => el.id);
      useEditor.setState({ selection: expandGroups([...new Set([...base, ...hit])]), panel: 'design' });
    };
    const up = () => {
      setMarquee(null);
      if (!moved && !additive) useEditor.getState().select([]);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  /* ---------- Texto ---------- */
  const onTextCommit = useCallback((id: string, html: string) => {
    const st = useEditor.getState();
    const el = st.doc.slides.flatMap((s) => s.elements).find((x) => x.id === id);
    const clean = sanitizeHtml(html);
    if (el && el.type === 'text' && el.html !== clean) {
      st.dispatch([{ op: 'element.update', element: id, patch: { html: clean } }]);
    }
  }, []);
  const onEditEnd = useCallback(() => useEditor.getState().setEditing(null), []);

  /* ---------- Soltar archivos ---------- */
  const addMediaFile = async (file: File, at?: { x: number; y: number }) => {
    if (!slide) return;
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) return;
    try {
      const [url, dims] = await Promise.all([uploadAsset(file), mediaSize(file)]);
      const fit = Math.min(1100 / dims.w, 700 / dims.h, 1);
      const w = Math.round(dims.w * fit);
      const h = Math.round(dims.h * fit);
      const x = Math.round((at?.x ?? W / 2) - w / 2);
      const y = Math.round((at?.y ?? H / 2) - h / 2);
      const [res] = useEditor.getState().dispatch([
        {
          op: 'element.add',
          slide: slide.id,
          element: { type: isVideo ? 'video' : 'image', src: url, x, y, w, h, name: file.name, style: { radius: 16 } },
        },
      ]);
      if (res?.id) useEditor.getState().select([res.id]);
      sfx('pop');
    } catch (err) {
      useEditor.getState().toast(err instanceof Error ? err.message : 'No se pudo añadir el archivo', 'error');
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const p = slideLayer.current ? toSlide(e.clientX, e.clientY) : undefined;
    files.forEach((f, i) => addMediaFile(f, p ? { x: p.x + i * 40, y: p.y + i * 40 } : undefined));
  };

  /* ---------- Menú contextual ---------- */
  const selected = useMemo(() => slide?.elements.filter((e) => selection.includes(e.id)) ?? [], [slide, selection]);
  const menuItems: (MenuItem | 'sep')[] = useMemo(() => {
    if (!selected.length) return [];
    const one = selected[0];
    const all = (op: (id: string) => Command) => () => useEditor.getState().dispatch(selected.map((s) => op(s.id)));
    return [
      ...(one.type === 'text' && selected.length === 1
        ? [{ label: 'Editar texto', icon: <Pencil size={14} />, kbd: '↵', onSelect: () => useEditor.getState().setEditing(one.id) }]
        : []),
      { label: 'Previsualizar animación', icon: <Play size={14} />, onSelect: () => useEditor.getState().preview(selected.map((s) => s.id)) },
      { label: 'Duplicar', icon: <Copy size={14} />, kbd: '⌘D', onSelect: all((id) => ({ op: 'element.duplicate', element: id })) },
      'sep',
      { label: 'Traer al frente', icon: <ArrowUpToLine size={14} />, kbd: ']', onSelect: all((id) => ({ op: 'element.arrange', element: id, action: 'front' })) },
      { label: 'Enviar al fondo', icon: <ArrowDownToLine size={14} />, kbd: '[', onSelect: all((id) => ({ op: 'element.arrange', element: id, action: 'back' })) },
      'sep',
      {
        label: one.locked ? 'Desbloquear' : 'Bloquear',
        icon: one.locked ? <Unlock size={14} /> : <Lock size={14} />,
        onSelect: all((id) => ({ op: 'element.update', element: id, patch: { locked: !one.locked } })),
      },
      {
        label: one.hidden ? 'Mostrar' : 'Ocultar en presentación',
        icon: one.hidden ? <Eye size={14} /> : <EyeOff size={14} />,
        onSelect: all((id) => ({ op: 'element.update', element: id, patch: { hidden: !one.hidden } })),
      },
      'sep',
      {
        label: 'Eliminar',
        icon: <Trash2 size={14} />,
        kbd: '⌫',
        danger: true,
        onSelect: () => {
          sfx('remove');
          all((id) => ({ op: 'element.delete', element: id }))();
        },
      },
    ];
  }, [selected]);

  if (!slide) {
    return (
      <div className="canvas-viewport is-empty" ref={viewport}>
        <div className="empty-state">
          <p>No hay diapositivas.</p>
          <button
            className="btn primary"
            onClick={() => dispatch([{ op: 'slide.add', layout: 'title', content: {} }])}
          >
            Añadir una diapositiva
          </button>
        </div>
      </div>
    );
  }

  const single = selected.length === 1 ? selected[0] : null;

  return (
    <div
      className={`canvas-viewport${dragOver ? ' is-dragover' : ''}${commentMode ? ' is-commenting' : ''}`}
      ref={viewport}
      onPointerDown={onViewportDown}
      onPointerMove={onPointerMoveCursor}
      onPointerLeave={() => setCursor(null)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="canvas-stage" style={{ width: W * scale, height: H * scale }}>
        <div
          ref={slideLayer}
          className="canvas-slide"
          style={{ width: W, height: H, transform: `scale(${scale})` }}
        >
          <SlideRenderer
            slide={slide}
            theme={theme}
            width={W}
            height={H}
            mode="edit"
            live={live}
            editingId={editingId}
            onTextCommit={onTextCommit}
            onEditEnd={onEditEnd}
          />
        </div>

        <div className="canvas-overlay">
          {slide.elements.map((el) =>
            el.id === editingId ? null : (
              <div
                key={el.id}
                className={`hitbox${selection.includes(el.id) ? ' is-selected' : ''}${el.locked ? ' is-locked' : ''}`}
                style={{
                  left: el.x * scale,
                  top: el.y * scale,
                  width: el.w * scale,
                  height: el.h * scale,
                  transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                }}
                onPointerDown={(e) => startDrag(e, el)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (el.type === 'text' && !el.locked && !useEditor.getState().commentMode) {
                    useEditor.getState().select([el.id]);
                    useEditor.getState().setEditing(el.id);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!selection.includes(el.id)) useEditor.getState().select([el.id]);
                  setMenu({ x: e.clientX, y: e.clientY });
                  sfx('open');
                }}
              />
            ),
          )}

          {selected.map((el) => (
            <div
              key={`sel-${el.id}`}
              className={`selection-frame${single ? ' is-single' : ''}${el.locked ? ' is-locked' : ''}`}
              style={{
                left: el.x * scale,
                top: el.y * scale,
                width: el.w * scale,
                height: el.h * scale,
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
              }}
            >
              {single && !el.locked && editingId !== el.id && (
                <>
                  {HANDLES.map((h) => (
                    <span
                      key={h}
                      className={`handle h-${h}`}
                      onPointerDown={(e) => startResize(e, el, h)}
                    />
                  ))}
                  <span className="rotate-handle" onPointerDown={(e) => startRotate(e, el)} />
                  <span className="size-badge">
                    {Math.round(el.w)} × {Math.round(el.h)}
                    {el.rotation ? ` · ${Math.round(el.rotation)}°` : ''}
                  </span>
                </>
              )}
            </div>
          ))}

          {single && single.animation.move.step > 0 && (() => {
            const m = single.animation.move;
            const cx = (single.x + single.w / 2) * scale;
            const cy = (single.y + single.h / 2) * scale;
            return (
              <>
                <svg className="motion-path" width="100%" height="100%">
                  <line x1={cx} y1={cy} x2={cx + m.x * scale} y2={cy + m.y * scale} />
                  <circle cx={cx} cy={cy} r={4} className="mp-start" />
                  <circle cx={cx + m.x * scale} cy={cy + m.y * scale} r={5} className="mp-end" />
                </svg>
                <div
                  className="motion-ghost"
                  style={{
                    left: (single.x + m.x) * scale,
                    top: (single.y + m.y) * scale,
                    width: single.w * scale,
                    height: single.h * scale,
                    transform: `rotate(${single.rotation + m.rotate}deg) scale(${m.scale})`,
                  }}
                >
                  <span>clic {m.step}</span>
                </div>
              </>
            );
          })()}
          {selected.length > 1 && (() => {
            const l = Math.min(...selected.map((e) => e.x));
            const t = Math.min(...selected.map((e) => e.y));
            const r = Math.max(...selected.map((e) => e.x + e.w));
            const b = Math.max(...selected.map((e) => e.y + e.h));
            const grouped = selected.every((e) => e.group && e.group === selected[0].group);
            return (
              <div
                className={`group-frame${grouped ? ' is-group' : ''}`}
                style={{ left: l * scale - 6, top: t * scale - 6, width: (r - l) * scale + 12, height: (b - t) * scale + 12 }}
              >
                {grouped && <span className="group-badge">Grupo</span>}
              </div>
            );
          })()}
          {guides.v.map((x, i) => (
            <div key={`gv${i}`} className="guide guide-v" style={{ left: x * scale }} />
          ))}
          {guides.h.map((y, i) => (
            <div key={`gh${i}`} className="guide guide-h" style={{ top: y * scale }} />
          ))}
          {marquee && (
            <div
              className="marquee"
              style={{ left: marquee.x * scale, top: marquee.y * scale, width: marquee.w * scale, height: marquee.h * scale }}
            />
          )}
          <PeerLayer slide={slide} scale={scale} />
          <CommentLayer slide={slide} scale={scale} W={W} H={H} />
        </div>
      </div>
      {dragOver && <div className="drop-hint">Suelta imágenes o videos para añadirlos</div>}
      <ContextMenu at={menu} items={menuItems} onClose={() => setMenu(null)} />
    </div>
  );
}
