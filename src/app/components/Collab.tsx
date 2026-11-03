/**
 * Interfaz de colaboración: avatares de quién está en la presentación,
 * cursores y selecciones de otras personas (y de la IA) sobre el lienzo,
 * pines de comentarios con hilos y el panel de comentarios.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { Check, MessageSquare, MessageSquarePlus, RotateCcw, Send, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Slide } from '../../core/model';
import {
  addComment,
  deleteComment,
  patchComment,
  PEER_COLORS,
  replyComment,
  saveMe,
  toggleCommentMode,
  type Comment,
  type CommentReply,
} from '../lib/collab';
import { sfx } from '../lib/sound';
import { useEditor } from '../store/editor';
import { IconButton } from './ui/IconButton';
import { Switch, TextInput } from './ui/fields';
import { Popover } from './ui/Popover';

/* ---------------- Utilidades ---------------- */

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Texto legible (claro u oscuro) sobre un color de fondo. */
export function readableOn(hex: string) {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})/i.exec(hex);
  if (!m) return '#fff';
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.42 ? '#14151c' : '#fff';
}

const tone = (color: string) => ({ '--c': color, '--fg': readableOn(color) }) as CSSProperties;

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 45) return 'ahora';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const isAiAuthor = (m: { author: string; color: string }) => m.author === 'Claude' || m.color.toLowerCase() === '#d97757';

export function Avatar({ name, color, ai, size = 26 }: { name: string; color: string; ai?: boolean; size?: number }) {
  return (
    <span className={`avatar${ai ? ' is-ai' : ''}`} style={{ ...tone(color), width: size, height: size, fontSize: Math.round(size * 0.4) }} aria-hidden>
      {ai ? <Sparkles size={Math.round(size * 0.52)} /> : initials(name)}
    </span>
  );
}

/* ---------------- Presencia en la barra superior ---------------- */

function MeEditor() {
  const me = useEditor((s) => s.me);
  const peers = useEditor((s) => s.peers);
  const serverMode = useEditor((s) => s.serverMode);
  return (
    <div className="me-editor">
      <div className="pop-title">Tu identidad</div>
      <TextInput value={me.name} onCommit={(v) => saveMe({ ...me, name: v.trim().slice(0, 40) || me.name })} />
      <div className="me-colors">
        {PEER_COLORS.map((c) => (
          <button
            key={c}
            className={`me-color${c === me.color ? ' is-on' : ''}`}
            style={{ background: c }}
            aria-label={`Color ${c}`}
            onClick={() => {
              sfx('tick');
              saveMe({ ...me, color: c });
            }}
          />
        ))}
      </div>
      <p className="hint">
        {serverMode
          ? peers.length
            ? `Hay ${peers.length} ${peers.length === 1 ? 'colaborador' : 'colaboradores'} contigo. Comparte la URL del editor para invitar a más.`
            : 'Comparte la URL del editor para editar en tiempo real con otras personas o agentes de IA.'
          : 'Sin servidor, los comentarios se guardan en este navegador.'}
      </p>
    </div>
  );
}

export function PresenceBar() {
  const me = useEditor((s) => s.me);
  const peers = useEditor((s) => s.peers);
  const slides = useEditor((s) => s.doc.slides);
  const current = useEditor((s) => s.currentSlideId);
  const shown = peers.slice(0, 4);
  return (
    <div className="presence">
      <AnimatePresence initial={false}>
        {shown.map((p) => {
          const idx = slides.findIndex((s) => s.id === p.slideId);
          return (
            <motion.button
              key={p.clientId}
              className="presence-av"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              data-tip={`${p.name}${p.kind === 'ai' ? ' (IA)' : ''}${idx >= 0 ? ` · diapositiva ${idx + 1}${p.slideId === current ? ' · aquí' : ''}` : ''}`}
              onClick={() => {
                if (idx < 0) return;
                sfx('tick');
                useEditor.getState().selectSlide(p.slideId);
              }}
            >
              <Avatar name={p.name} color={p.color} ai={p.kind === 'ai'} />
              {p.kind === 'ai' && <span className="presence-pulse" />}
            </motion.button>
          );
        })}
      </AnimatePresence>
      {peers.length > shown.length && <span className="presence-more">+{peers.length - shown.length}</span>}
      <Popover
        width={248}
        align="end"
        trigger={({ toggle, ref }) => (
          <button ref={ref as React.RefObject<HTMLButtonElement>} className="presence-av is-me" onClick={toggle} data-tip={`Tú: ${me.name}`}>
            <Avatar name={me.name} color={me.color} />
          </button>
        )}
      >
        <MeEditor />
      </Popover>
    </div>
  );
}

export function CommentButton() {
  const on = useEditor((s) => s.commentMode);
  const open = useEditor((s) => s.comments.filter((c) => !c.resolved).length);
  return (
    <span className="comment-btn-wrap">
      <IconButton icon={MessageSquarePlus} label={on ? 'Salir del modo comentario' : 'Comentar'} kbd="C" active={on} anim="pop" sound={false} onClick={() => toggleCommentMode()} />
      {open > 0 && <span className="comment-btn-badge">{open}</span>}
    </span>
  );
}

/* ---------------- Lienzo: otras personas ---------------- */

export function PeerLayer({ slide, scale }: { slide: Slide; scale: number }) {
  const peers = useEditor((s) => s.peers);
  const here = peers.filter((p) => p.slideId === slide.id);
  if (!here.length) return null;
  return (
    <>
      {here.flatMap((p) =>
        p.selection.map((id) => {
          const el = slide.elements.find((e) => e.id === id);
          if (!el) return null;
          const editing = p.editing === id;
          return (
            <div
              key={`${p.clientId}:${id}`}
              className={`peer-frame${editing ? ' is-editing' : ''}`}
              style={{
                ...tone(p.color),
                left: el.x * scale,
                top: el.y * scale,
                width: el.w * scale,
                height: el.h * scale,
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
              }}
            >
              <span className="peer-tag">
                {p.kind === 'ai' && <Sparkles size={10} />}
                {p.name}
                {editing ? ' · escribiendo…' : ''}
              </span>
            </div>
          );
        }),
      )}
      {here
        .filter((p) => p.cursor)
        .map((p) => (
          <div
            key={`cursor-${p.clientId}`}
            className="peer-cursor"
            style={{ ...tone(p.color), transform: `translate(${p.cursor!.x * scale}px, ${p.cursor!.y * scale}px)` }}
          >
            <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden>
              <path d="M1.5 1.5 L1.5 16 L5.6 12.4 L8.3 18.4 L11 17.2 L8.4 11.3 L13.8 11.3 Z" />
            </svg>
            <span className="peer-name">{p.name}</span>
          </div>
        ))}
    </>
  );
}

/* ---------------- Lienzo: comentarios ---------------- */

function CommentInput({
  placeholder,
  onSubmit,
  onCancel,
  autoFocus,
}: {
  placeholder: string;
  onSubmit: (text: string) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  // El clic que abre la tarjeta mueve el foco al terminar (mousedown); se
  // enfoca en el siguiente fotograma para que el texto vaya al comentario.
  useEffect(() => {
    if (!autoFocus) return;
    area.current?.focus();
    const raf = requestAnimationFrame(() => area.current?.focus({ preventScroll: true }));
    const t = setTimeout(() => area.current?.focus({ preventScroll: true }), 60);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [autoFocus]);
  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onSubmit(t);
      setText('');
    } catch (err) {
      sfx('error');
      useEditor.getState().toast(err instanceof Error ? err.message : 'No se pudo enviar', 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="comment-input">
      <textarea
        ref={area}
        value={text}
        rows={Math.min(5, Math.max(1, text.split('\n').length))}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
          if (e.key === 'Escape') onCancel?.();
        }}
      />
      <button className="comment-send" disabled={!text.trim() || busy} onClick={() => void submit()} aria-label="Enviar">
        <Send size={14} />
      </button>
    </div>
  );
}

function Message({ m }: { m: CommentReply }) {
  return (
    <div className="comment-msg">
      <Avatar name={m.author} color={m.color} ai={isAiAuthor(m)} size={24} />
      <div className="comment-msg-body">
        <div className="comment-meta">
          <b>{m.author}</b>
          <span>{timeAgo(m.createdAt)}</span>
        </div>
        <p>{m.text}</p>
      </div>
    </div>
  );
}

/** Coloca la tarjeta junto al pin sin salirse del lienzo. */
function useCardPosition(x: number, y: number, stageW: number, stageH: number, deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(y - 14);
  const width = 300;
  const left = x + 24 + width > stageW && x - width - 12 > -40 ? x - width - 12 : x + 24;
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    setTop(Math.max(-24, Math.min(y - 14, stageH - h + 24)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [y, stageH, ...deps]);
  return { ref, style: { left, top, width } };
}

function ThreadCard({ comment, x, y, stageW, stageH }: { comment: Comment; x: number; y: number; stageW: number; stageH: number }) {
  const pos = useCardPosition(x, y, stageW, stageH, [comment.replies.length]);
  const close = () => useEditor.setState({ openComment: null });
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [comment.replies.length]);
  return (
    <motion.div
      ref={pos.ref}
      className="comment-card"
      style={pos.style}
      initial={{ opacity: 0, scale: 0.96, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 6 }}
      transition={{ type: 'spring', stiffness: 520, damping: 36 }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <header>
        <span className="ttl">{comment.resolved ? 'Resuelto' : 'Comentario'}</span>
        <IconButton
          icon={comment.resolved ? RotateCcw : Check}
          label={comment.resolved ? 'Reabrir' : 'Resolver'}
          anim="pop"
          sound={false}
          onClick={() => {
            sfx(comment.resolved ? 'tick' : 'success');
            void patchComment(comment.id, { resolved: !comment.resolved });
            if (!comment.resolved && !useEditor.getState().showResolved) close();
          }}
        />
        <IconButton
          icon={Trash2}
          label="Eliminar hilo"
          anim="wiggle"
          sound={false}
          onClick={() => {
            sfx('remove');
            close();
            void deleteComment(comment.id);
          }}
        />
        <IconButton icon={X} label="Cerrar" anim="spin" sound="close" onClick={close} />
      </header>
      <div className="comment-msgs" ref={list}>
        <Message m={comment} />
        {comment.replies.map((r) => (
          <Message key={r.id} m={r} />
        ))}
      </div>
      <CommentInput
        placeholder="Responder…"
        onCancel={close}
        autoFocus
        onSubmit={async (t) => {
          await replyComment(comment.id, t);
          sfx('pop');
        }}
      />
    </motion.div>
  );
}

function DraftCard({ x, y, stageW, stageH }: { x: number; y: number; stageW: number; stageH: number }) {
  const pos = useCardPosition(x, y, stageW, stageH, []);
  const cancel = () => useEditor.setState({ commentDraft: null });
  return (
    <motion.div
      ref={pos.ref}
      className="comment-card is-draft"
      style={pos.style}
      initial={{ opacity: 0, scale: 0.96, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 520, damping: 36 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <CommentInput
        placeholder="Escribe un comentario… (Intro para enviar)"
        autoFocus
        onCancel={cancel}
        onSubmit={async (text) => {
          const d = useEditor.getState().commentDraft;
          if (!d) return;
          const c = await addComment({ slideId: d.slideId, elementId: d.elementId, x: d.x, y: d.y, text });
          useEditor.setState({ commentDraft: null, openComment: c.id });
          sfx('success');
        }}
      />
    </motion.div>
  );
}

function CommentPin({ comment, scale, active, W, H }: { comment: Comment; scale: number; active: boolean; W: number; H: number }) {
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      el.style.translate = `${dx}px ${dy}px`;
      el.classList.add('is-dragging');
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.classList.remove('is-dragging');
      if (moved) {
        const x = Math.round(Math.max(0, Math.min(W, comment.x + (ev.clientX - start.x) / scale)));
        const y = Math.round(Math.max(0, Math.min(H, comment.y + (ev.clientY - start.y) / scale)));
        void patchComment(comment.id, { x, y }).finally(() => (el.style.translate = ''));
        sfx('tap');
      } else {
        sfx(active ? 'close' : 'open');
        useEditor.setState({ openComment: active ? null : comment.id, commentDraft: null });
      }
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return (
    <motion.button
      className={`comment-pin${active ? ' is-active' : ''}${comment.resolved ? ' is-resolved' : ''}`}
      style={{ ...tone(comment.color), left: comment.x * scale, top: comment.y * scale }}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      exit={{ scale: 0 }}
      transition={{ type: 'spring', stiffness: 600, damping: 26 }}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => e.stopPropagation()}
      aria-label={`Comentario de ${comment.author}: ${comment.text}`}
      title={`${comment.author}: ${comment.text}`}
    >
      {comment.resolved ? <Check size={13} strokeWidth={3} /> : isAiAuthor(comment) ? <Sparkles size={13} /> : initials(comment.author)}
      {comment.replies.length > 0 && <span className="pin-count">{comment.replies.length + 1}</span>}
    </motion.button>
  );
}

export function CommentLayer({ slide, scale, W, H }: { slide: Slide; scale: number; W: number; H: number }) {
  const comments = useEditor((s) => s.comments);
  const showResolved = useEditor((s) => s.showResolved);
  const openId = useEditor((s) => s.openComment);
  const draft = useEditor((s) => s.commentDraft);
  const list = useMemo(
    () => comments.filter((c) => c.slideId === slide.id && (!c.resolved || showResolved || c.id === openId)),
    [comments, slide.id, showResolved, openId],
  );
  const open = list.find((c) => c.id === openId);
  const me = useEditor((s) => s.me);
  const draftHere = draft && draft.slideId === slide.id ? draft : null;
  return (
    <>
      <AnimatePresence>
        {list.map((c) => (
          <CommentPin key={c.id} comment={c} scale={scale} active={c.id === openId} W={W} H={H} />
        ))}
        {draftHere && (
          <motion.span
            key="draft-pin"
            className="comment-pin is-active is-draft"
            style={{ ...tone(me.color), left: draftHere.x * scale, top: draftHere.y * scale }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            {initials(me.name)}
          </motion.span>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && <ThreadCard key={open.id} comment={open} x={open.x * scale} y={open.y * scale} stageW={W * scale} stageH={H * scale} />}
        {draftHere && <DraftCard key="draft" x={draftHere.x * scale} y={draftHere.y * scale} stageW={W * scale} stageH={H * scale} />}
      </AnimatePresence>
    </>
  );
}

/* ---------------- Panel de comentarios ---------------- */

export function CommentsPanel() {
  const comments = useEditor((s) => s.comments);
  const slides = useEditor((s) => s.doc.slides);
  const showResolved = useEditor((s) => s.showResolved);
  const commentMode = useEditor((s) => s.commentMode);
  const openId = useEditor((s) => s.openComment);
  const serverMode = useEditor((s) => s.serverMode);
  const open = comments.filter((c) => !c.resolved);
  const list = showResolved ? comments : open;
  const groups = slides
    .map((slide, index) => ({ slide, index, items: list.filter((c) => c.slideId === slide.id) }))
    .filter((g) => g.items.length);

  const askAI = () => {
    sfx('whoosh');
    useEditor.setState({
      aiOpen: true,
      aiRequest:
        'Atiende los comentarios abiertos de la presentación: léelos con list_comments, aplica los cambios que piden y responde a cada uno con reply_comment explicando qué hiciste (resolve: true).',
    });
  };

  return (
    <div className="inspector-scroll comments-panel">
      <div className="comments-actions">
        <button className={`btn${commentMode ? ' primary' : ' soft'}`} onClick={() => toggleCommentMode()}>
          <MessageSquarePlus size={14} />
          {commentMode ? 'Haz clic en el lienzo para comentar' : 'Nuevo comentario'}
          <kbd>C</kbd>
        </button>
        {serverMode && open.length > 0 && (
          <button className="btn comments-ai" onClick={askAI}>
            <Sparkles size={14} /> Que Claude atienda {open.length === 1 ? 'el comentario' : `los ${open.length} comentarios`}
          </button>
        )}
        <Switch checked={showResolved} onChange={(v) => useEditor.setState({ showResolved: v })} label={`Ver resueltos (${comments.length - open.length})`} />
      </div>

      {groups.length === 0 ? (
        <div className="comments-empty">
          <MessageSquare size={26} />
          <p>{comments.length ? 'Todo resuelto. ¡Buen trabajo!' : 'Aún no hay comentarios.'}</p>
          <p className="hint">Pulsa C y haz clic en cualquier punto de la diapositiva para dejar una nota a tu equipo o a la IA.</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.slide.id}>
            <div className="comments-slide">
              Diapositiva {g.index + 1}
              {g.slide.name ? ` · ${g.slide.name}` : ''}
            </div>
            {g.items.map((c) => (
              <button
                key={c.id}
                className={`comment-row${c.id === openId ? ' is-active' : ''}${c.resolved ? ' is-resolved' : ''}`}
                onClick={() => {
                  sfx('tick');
                  useEditor.getState().selectSlide(c.slideId);
                  useEditor.setState({ openComment: c.id, commentDraft: null, panel: 'comments' });
                }}
              >
                <Avatar name={c.author} color={c.color} ai={isAiAuthor(c)} size={24} />
                <div className="comment-row-body">
                  <div className="comment-meta">
                    <b>{c.author}</b>
                    <span>{timeAgo(c.createdAt)}</span>
                    {c.resolved && <Check size={12} className="ok" />}
                  </div>
                  <p>{c.text}</p>
                  {c.replies.length > 0 && (
                    <span className="comment-replies">
                      {c.replies.length} {c.replies.length === 1 ? 'respuesta' : 'respuestas'} · última de {c.replies[c.replies.length - 1].author}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
