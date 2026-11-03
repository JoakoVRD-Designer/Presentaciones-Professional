/**
 * Persistencia y sincronización en tiempo real.
 * - Con servidor: guarda vía PUT (con control de versión) y escucha SSE, de modo
 *   que los cambios hechos por una IA (REST, MCP o asistente) aparecen en vivo.
 * - Sin servidor: guarda en localStorage.
 */
import { merge3 } from '../../core/merge';
import { normalizePresentation, uid, type Presentation } from '../../core/model';
import { createFromTemplate } from '../../core/templates';
import { useEditor } from '../store/editor';

export const CLIENT_ID = uid('client');
const LOCAL_INDEX = 'lumen:docs';
const localKey = (id: string) => `lumen:doc:${id}`;

let serverRev = 0;
/** Último estado conocido del servidor: base para fusionar cambios concurrentes. */
let baseDoc: Presentation | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let events: EventSource | null = null;
let lastSavedVersion = 0;
let saving = false;

export interface DocMeta {
  id: string;
  title: string;
  slides: number;
  updatedAt?: string;
}

const headers = { 'Content-Type': 'application/json', 'x-lumen-client': CLIENT_ID };

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error ?? res.statusText), { status: res.status, data });
  return data as T;
}

/* ---------------- Almacenamiento local ---------------- */

function localIndex(): DocMeta[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_INDEX) ?? '[]') as DocMeta[];
  } catch {
    return [];
  }
}

function saveLocal(doc: Presentation) {
  try {
    const stamped = { ...doc, updatedAt: new Date().toISOString() };
    localStorage.setItem(localKey(doc.id), JSON.stringify(stamped));
    const idx = localIndex().filter((d) => d.id !== doc.id);
    idx.unshift({ id: doc.id, title: doc.title, slides: doc.slides.length, updatedAt: stamped.updatedAt });
    localStorage.setItem(LOCAL_INDEX, JSON.stringify(idx));
    return true;
  } catch {
    return false;
  }
}

function loadLocal(id: string): Presentation | null {
  try {
    const raw = localStorage.getItem(localKey(id));
    return raw ? normalizePresentation(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/* ---------------- API pública ---------------- */

export async function listDocs(): Promise<DocMeta[]> {
  if (useEditor.getState().serverMode) return json<DocMeta[]>(await fetch('/api/presentations'));
  return localIndex();
}

export async function createDoc(template: string, title?: string, document?: Presentation): Promise<Presentation> {
  if (useEditor.getState().serverMode) {
    return json<Presentation>(
      await fetch('/api/presentations', { method: 'POST', headers, body: JSON.stringify({ template, title, document }) }),
    );
  }
  const doc = document ? normalizePresentation({ ...document, id: undefined }) : createFromTemplate(template, title);
  saveLocal(doc);
  return doc;
}

export async function deleteDoc(id: string) {
  if (useEditor.getState().serverMode) {
    await fetch(`/api/presentations/${id}`, { method: 'DELETE', headers });
    return;
  }
  localStorage.removeItem(localKey(id));
  localStorage.setItem(LOCAL_INDEX, JSON.stringify(localIndex().filter((d) => d.id !== id)));
}

export async function openDoc(id: string): Promise<boolean> {
  const st = useEditor.getState();
  let doc: Presentation | null = null;
  if (st.serverMode) {
    try {
      doc = await json<Presentation>(await fetch(`/api/presentations/${id}`));
    } catch {
      doc = null;
    }
  } else {
    doc = loadLocal(id);
  }
  if (!doc) return false;
  activate(doc);
  return true;
}

function activate(doc: Presentation) {
  clearTimeout(saveTimer);
  serverRev = doc.rev ?? 0;
  baseDoc = doc;
  useEditor.getState().setDoc(doc, { resetHistory: true, remote: true });
  useEditor.setState({ currentSlideId: doc.slides[0]?.id ?? '', selection: [] });
  lastSavedVersion = useEditor.getState().localVersion;
  const url = new URL(window.location.href);
  url.searchParams.set('p', doc.id);
  window.history.replaceState(null, '', url);
  document.title = `${doc.title} · Lumen`;
  connectEvents(doc.id);
}

function connectEvents(id: string) {
  events?.close();
  events = null;
  if (!useEditor.getState().serverMode) return;
  events = new EventSource(`/api/presentations/${id}/events`);
  events.onmessage = (e) => {
    try {
      const evt = JSON.parse(e.data) as { type: string; doc: Presentation; origin: string };
      if (evt.type !== 'doc' || evt.doc.id !== useEditor.getState().doc.id) return;
      serverRev = Math.max(serverRev, evt.doc.rev);
      if (evt.origin === CLIENT_ID) return;
      receiveRemote(normalizePresentation(evt.doc));
    } catch {
      /* evento malformado */
    }
  };
  events.onerror = () => useEditor.setState({ sync: 'error' });
  events.onopen = () => useEditor.setState({ sync: 'saved' });
}

/**
 * Integra un documento remoto. Si hay ediciones locales pendientes de guardar,
 * se fusionan a tres bandas para no perder ninguno de los dos lados.
 */
function receiveRemote(remote: Presentation) {
  const st = useEditor.getState();
  const pending = st.localVersion !== lastSavedVersion;
  if (pending && baseDoc) {
    const merged = normalizePresentation(merge3<unknown>(baseDoc, st.doc, remote));
    baseDoc = remote;
    st.setDoc({ ...merged, rev: remote.rev }, { remote: true });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 300);
  } else {
    baseDoc = remote;
    st.setDoc(remote, { remote: true });
    lastSavedVersion = useEditor.getState().localVersion;
    useEditor.setState({ sync: 'saved' });
  }
}

async function flush() {
  const st = useEditor.getState();
  if (st.localVersion === lastSavedVersion) return;
  if (saving) {
    saveTimer = setTimeout(flush, 250);
    return;
  }
  const version = st.localVersion;
  const doc = st.doc;
  if (!st.serverMode) {
    const ok = saveLocal(doc);
    lastSavedVersion = version;
    useEditor.setState({ sync: ok ? 'local' : 'error' });
    if (!ok) st.toast('No hay espacio en el almacenamiento local. Exporta tu presentación.', 'error');
    return;
  }
  saving = true;
  useEditor.setState({ sync: 'saving' });
  try {
    const res = await fetch(`/api/presentations/${doc.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ document: doc, baseRev: serverRev }),
    });
    if (res.status === 409) {
      // Otro cliente guardó antes: fusionamos y reintentamos.
      const data = (await res.json()) as { document: Presentation };
      serverRev = data.document.rev;
      receiveRemote(normalizePresentation(data.document));
      return;
    }
    const data = await json<{ rev: number }>(res);
    serverRev = Math.max(serverRev, data.rev);
    baseDoc = doc;
    lastSavedVersion = version;
    useEditor.setState({ sync: useEditor.getState().localVersion === version ? 'saved' : 'saving' });
  } catch {
    useEditor.setState({ sync: 'error' });
    saveTimer = setTimeout(flush, 3000);
  } finally {
    saving = false;
  }
}

export function flushNow() {
  clearTimeout(saveTimer);
  return flush();
}

/** Inicializa: detecta servidor, abre el documento de la URL o el más reciente. */
export async function bootstrap() {
  let serverMode = false;
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    serverMode = res.ok && (await res.json()).ok === true;
  } catch {
    serverMode = false;
  }
  useEditor.setState({ serverMode, sync: serverMode ? 'saved' : 'local' });

  const requested = new URLSearchParams(window.location.search).get('p');
  if (requested && (await openDoc(requested))) return;
  const list = await listDocs().catch(() => [] as DocMeta[]);
  if (list[0] && (await openDoc(list[0].id))) return;
  const doc = await createDoc('showcase').catch(() => createFromTemplate('showcase'));
  if (!serverMode) saveLocal(doc);
  activate(doc);
}

// Guardado automático con debounce cuando cambia el documento localmente.
useEditor.subscribe((state, prev) => {
  if (state.localVersion !== prev.localVersion && state.localVersion !== lastSavedVersion) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 500);
  }
});

window.addEventListener('beforeunload', () => {
  const st = useEditor.getState();
  if (st.localVersion !== lastSavedVersion && !st.serverMode) saveLocal(st.doc);
});
