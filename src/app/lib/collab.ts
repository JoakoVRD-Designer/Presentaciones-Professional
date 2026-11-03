/**
 * Colaboración en el editor: identidad, presencia (diapositiva, cursor,
 * selección) y comentarios. Con servidor se comparte en tiempo real; sin
 * servidor los comentarios se guardan en este navegador.
 */
import { useEditor } from '../store/editor';
import { sfx } from './sound';
import { CLIENT_ID } from './sync';

export interface Peer {
  clientId: string;
  name: string;
  color: string;
  kind: 'human' | 'ai';
  slideId: string;
  cursor: { x: number; y: number } | null;
  selection: string[];
  editing: string | null;
}

export interface CommentReply {
  id: string;
  author: string;
  color: string;
  text: string;
  createdAt: string;
}

export interface Comment extends CommentReply {
  slideId: string;
  elementId: string | null;
  x: number;
  y: number;
  resolved: boolean;
  replies: CommentReply[];
}

const COLORS = ['#7c5cff', '#22d3ee', '#ff6b4a', '#4ade80', '#facc15', '#ff2bd6', '#60a5fa', '#fb923c', '#a78bfa', '#34d399'];
const ANIMALS = ['Colibrí', 'Lince', 'Búho', 'Delfín', 'Zorro', 'Panda', 'Halcón', 'Nutria', 'Koala', 'Cóndor', 'Jaguar', 'Ballena'];

export interface Me {
  name: string;
  color: string;
}

export function loadMe(): Me {
  try {
    const raw = localStorage.getItem('lumen:pref:user');
    if (raw) return JSON.parse(raw) as Me;
  } catch {
    /* noop */
  }
  const me = {
    name: `${ANIMALS[Math.floor(Math.random() * ANIMALS.length)]} ${Math.floor(10 + Math.random() * 89)}`,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
  saveMe(me);
  return me;
}

export function saveMe(me: Me) {
  try {
    localStorage.setItem('lumen:pref:user', JSON.stringify(me));
  } catch {
    /* noop */
  }
  useEditor.setState({ me });
  schedulePresence();
}

export const PEER_COLORS = COLORS;

/* ---------------- Presencia ---------------- */

let cursor: { x: number; y: number } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastSent = 0;
let heartbeat: ReturnType<typeof setInterval> | null = null;

async function publish() {
  timer = null;
  const st = useEditor.getState();
  if (!st.serverMode || !st.doc.id) return;
  lastSent = Date.now();
  try {
    await fetch(`/api/presentations/${st.doc.id}/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-lumen-client': CLIENT_ID },
      body: JSON.stringify({
        clientId: CLIENT_ID,
        name: st.me.name,
        color: st.me.color,
        slideId: st.currentSlideId,
        cursor,
        selection: st.selection,
        editing: st.editingId,
      }),
    });
  } catch {
    /* sin conexión */
  }
}

export function schedulePresence() {
  if (timer) return;
  const wait = Math.max(0, 90 - (Date.now() - lastSent));
  timer = setTimeout(publish, wait);
}

export function setCursor(p: { x: number; y: number } | null) {
  cursor = p ? { x: Math.round(p.x), y: Math.round(p.y) } : null;
  schedulePresence();
}

export function startPresence() {
  useEditor.subscribe((s, prev) => {
    if (s.currentSlideId !== prev.currentSlideId || s.selection !== prev.selection || s.editingId !== prev.editingId || s.doc.id !== prev.doc.id) {
      schedulePresence();
    }
  });
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = setInterval(publish, 5000);
}

/* ---------------- Comentarios ---------------- */

const localKey = (id: string) => `lumen:comments:${id}`;

function saveLocal(list: Comment[]) {
  const { doc } = useEditor.getState();
  try {
    localStorage.setItem(localKey(doc.id), JSON.stringify(list));
  } catch {
    /* noop */
  }
  useEditor.setState({ comments: list });
}

export function loadLocalComments(docId: string): Comment[] {
  try {
    return JSON.parse(localStorage.getItem(localKey(docId)) ?? '[]') as Comment[];
  } catch {
    return [];
  }
}

const nid = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

async function api<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/presentations/${useEditor.getState().doc.id}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-lumen-client': CLIENT_ID },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return (res.status === 204 ? null : await res.json()) as T;
}

export async function addComment(input: { slideId: string; elementId?: string | null; x: number; y: number; text: string }): Promise<Comment> {
  const st = useEditor.getState();
  const payload = { ...input, author: st.me.name, color: st.me.color };
  if (st.serverMode) {
    const c = await api<Comment>('/comments', 'POST', payload);
    useEditor.setState({ comments: [...useEditor.getState().comments.filter((x) => x.id !== c.id), c] });
    return c;
  }
  const c: Comment = { id: nid(), elementId: null, ...payload, createdAt: new Date().toISOString(), resolved: false, replies: [] } as Comment;
  saveLocal([...st.comments, c]);
  return c;
}

export async function replyComment(id: string, text: string, resolve = false) {
  const st = useEditor.getState();
  if (st.serverMode) {
    const c = await api<Comment>(`/comments/${id}/replies`, 'POST', { text, author: st.me.name, color: st.me.color, resolve });
    useEditor.setState({ comments: useEditor.getState().comments.map((x) => (x.id === id ? c : x)) });
    return;
  }
  saveLocal(
    st.comments.map((c) =>
      c.id === id
        ? { ...c, resolved: resolve || c.resolved, replies: [...c.replies, { id: nid(), author: st.me.name, color: st.me.color, text, createdAt: new Date().toISOString() }] }
        : c,
    ),
  );
}

export async function patchComment(id: string, patch: Partial<Pick<Comment, 'resolved' | 'text' | 'x' | 'y'>>) {
  const st = useEditor.getState();
  const optimistic = st.comments.map((c) => (c.id === id ? { ...c, ...patch } : c));
  if (st.serverMode) {
    // Se aplica al instante y luego se confirma con la respuesta del servidor.
    const before = st.comments;
    useEditor.setState({ comments: optimistic });
    try {
      const c = await api<Comment>(`/comments/${id}`, 'PATCH', patch);
      useEditor.setState({ comments: useEditor.getState().comments.map((x) => (x.id === id ? c : x)) });
    } catch (err) {
      useEditor.setState({ comments: before });
      throw err;
    }
    return;
  }
  saveLocal(optimistic);
}

/** Activa o desactiva el modo comentario (clic en el lienzo = nuevo comentario). */
export function toggleCommentMode(on?: boolean) {
  const st = useEditor.getState();
  const next = on ?? !st.commentMode;
  if (next === st.commentMode) return;
  useEditor.setState({ commentMode: next, commentDraft: null, ...(next ? { panel: 'comments' as const, editingId: null } : {}) });
  sfx(next ? 'open' : 'close');
}

export async function deleteComment(id: string) {
  const st = useEditor.getState();
  if (st.serverMode) {
    useEditor.setState({ comments: st.comments.filter((x) => x.id !== id) });
    await api(`/comments/${id}`, 'DELETE');
    return;
  }
  saveLocal(st.comments.filter((c) => c.id !== id));
}
