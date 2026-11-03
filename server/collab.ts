/**
 * Colaboración: presencia en tiempo real (quién está, en qué diapositiva, su
 * cursor y su selección) y comentarios con hilos. La IA también aparece como
 * colaboradora cuando trabaja en la presentación.
 */
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './store';

const COMMENTS_DIR = path.join(DATA_DIR, 'comments');
const PRESENCE_TTL = 15000;
const SAFE_ID = /^[a-zA-Z0-9_-]{1,64}$/;

export interface Presence {
  clientId: string;
  name: string;
  color: string;
  kind: 'human' | 'ai';
  slideId: string;
  cursor: { x: number; y: number } | null;
  selection: string[];
  editing: string | null;
  at: number;
  /** Momento en que caduca (agentes externos que no mantienen conexión). */
  expires?: number;
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

export const collab = new EventEmitter();
collab.setMaxListeners(500);

/* ---------------- Presencia ---------------- */

const presence = new Map<string, Map<string, Presence>>();
const pending = new Map<string, NodeJS.Timeout>();

function broadcastPresence(docId: string) {
  if (pending.has(docId)) return;
  pending.set(
    docId,
    setTimeout(() => {
      pending.delete(docId);
      collab.emit(`presence:${docId}`, listPresence(docId));
    }, 60),
  );
}

export function listPresence(docId: string): Presence[] {
  return [...(presence.get(docId)?.values() ?? [])];
}

export function updatePresence(docId: string, p: Partial<Presence> & { clientId: string }) {
  if (!SAFE_ID.test(p.clientId)) return;
  let room = presence.get(docId);
  if (!room) presence.set(docId, (room = new Map()));
  const prev = room.get(p.clientId);
  room.set(p.clientId, {
    name: 'Invitado',
    color: '#7c5cff',
    kind: 'human',
    slideId: '',
    cursor: null,
    selection: [],
    editing: null,
    ...prev,
    ...p,
    at: Date.now(),
  });
  broadcastPresence(docId);
}

export function removePresence(docId: string, clientId: string) {
  if (presence.get(docId)?.delete(clientId)) broadcastPresence(docId);
}

setInterval(() => {
  const now = Date.now();
  for (const [docId, room] of presence) {
    let changed = false;
    for (const [id, p] of room) {
      if (p.expires ? now > p.expires : p.kind === 'human' && now - p.at > PRESENCE_TTL) {
        room.delete(id);
        changed = true;
      }
    }
    if (changed) broadcastPresence(docId);
  }
}, 5000).unref();

/* ---------------- Comentarios ---------------- */

const cache = new Map<string, Comment[]>();
const writes = new Map<string, Promise<void>>();

function file(docId: string) {
  if (!SAFE_ID.test(docId)) throw new Error('Id inválido');
  return path.join(COMMENTS_DIR, `${docId}.json`);
}

const uid = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const clean = (s: unknown, max = 4000) => String(s ?? '').slice(0, max);
const color = (s: unknown) => (/^#[0-9a-f]{3,8}$/i.test(String(s)) ? String(s) : '#7c5cff');

export async function listComments(docId: string): Promise<Comment[]> {
  const hit = cache.get(docId);
  if (hit) return hit;
  try {
    const list = JSON.parse(await fs.readFile(file(docId), 'utf8')) as Comment[];
    cache.set(docId, list);
    return list;
  } catch {
    cache.set(docId, []);
    return [];
  }
}

async function save(docId: string, list: Comment[]) {
  cache.set(docId, list);
  collab.emit(`comments:${docId}`, list);
  const prev = writes.get(docId) ?? Promise.resolve();
  const next = prev.then(async () => {
    await fs.mkdir(COMMENTS_DIR, { recursive: true });
    await fs.writeFile(file(docId), JSON.stringify(list, null, 2));
  });
  writes.set(docId, next.catch(() => {}));
  await next;
}

export async function addComment(docId: string, input: Record<string, unknown>): Promise<Comment> {
  const list = await listComments(docId);
  const c: Comment = {
    id: uid(),
    slideId: clean(input.slideId, 64),
    elementId: input.elementId ? clean(input.elementId, 64) : null,
    x: Number(input.x) || 0,
    y: Number(input.y) || 0,
    author: clean(input.author, 60) || 'Invitado',
    color: color(input.color),
    text: clean(input.text),
    createdAt: new Date().toISOString(),
    resolved: false,
    replies: [],
  };
  if (!c.text.trim()) throw Object.assign(new Error('El comentario está vacío'), { status: 400 });
  await save(docId, [...list, c]);
  return c;
}

export async function replyComment(docId: string, commentId: string, input: Record<string, unknown>): Promise<Comment> {
  const list = await listComments(docId);
  const c = list.find((x) => x.id === commentId);
  if (!c) throw Object.assign(new Error('Comentario no encontrado'), { status: 404 });
  const text = clean(input.text);
  if (!text.trim()) throw Object.assign(new Error('La respuesta está vacía'), { status: 400 });
  const updated: Comment = {
    ...c,
    resolved: input.resolve === true ? true : c.resolved,
    replies: [...c.replies, { id: uid(), author: clean(input.author, 60) || 'Invitado', color: color(input.color), text, createdAt: new Date().toISOString() }],
  };
  await save(docId, list.map((x) => (x.id === commentId ? updated : x)));
  return updated;
}

export async function patchComment(docId: string, commentId: string, input: Record<string, unknown>): Promise<Comment> {
  const list = await listComments(docId);
  const c = list.find((x) => x.id === commentId);
  if (!c) throw Object.assign(new Error('Comentario no encontrado'), { status: 404 });
  const updated: Comment = {
    ...c,
    ...(typeof input.resolved === 'boolean' ? { resolved: input.resolved } : {}),
    ...(typeof input.text === 'string' ? { text: clean(input.text) } : {}),
    ...(typeof input.x === 'number' ? { x: input.x } : {}),
    ...(typeof input.y === 'number' ? { y: input.y } : {}),
  };
  await save(docId, list.map((x) => (x.id === commentId ? updated : x)));
  return updated;
}

export async function deleteComment(docId: string, commentId: string) {
  const list = await listComments(docId);
  await save(docId, list.filter((x) => x.id !== commentId));
}
