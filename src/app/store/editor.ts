import { create } from 'zustand';
import { applyCommands, type Command, type CommandResult } from '../../core/commands';
import type { Presentation, Slide, SlideElement } from '../../core/model';
import { createFromTemplate } from '../../core/templates';

export type Panel = 'design' | 'animation' | 'slide' | 'theme' | 'layers';
export type SyncStatus = 'connecting' | 'saved' | 'saving' | 'error' | 'local';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  message: string;
}

interface DispatchOptions {
  /** Agrupa cambios consecutivos con la misma clave en un solo paso de historial. */
  merge?: string;
  /** false = no registrar en el historial. */
  history?: boolean;
}

interface EditorState {
  doc: Presentation;
  past: Presentation[];
  future: Presentation[];
  mergeKey: string | null;
  mergeAt: number;
  /** Incrementa con cada cambio local (para la sincronización). */
  localVersion: number;

  currentSlideId: string;
  selection: string[];
  editingId: string | null;
  previewTick: { ids: string[]; at: number };

  zoom: number | 'fit';
  panel: Panel;
  aiOpen: boolean;
  paletteOpen: boolean;
  presenting: null | { start: number };
  docsOpen: boolean;
  helpOpen: boolean;
  liveAnimations: boolean;
  sounds: boolean;
  sync: SyncStatus;
  serverMode: boolean;
  clipboard: SlideElement[];
  toasts: Toast[];

  dispatch: (commands: Command[], opts?: DispatchOptions) => CommandResult[];
  setDoc: (doc: Presentation, opts?: { resetHistory?: boolean; remote?: boolean }) => void;
  undo: () => void;
  redo: () => void;

  selectSlide: (id: string) => void;
  select: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  setEditing: (id: string | null) => void;
  preview: (ids: string[]) => void;

  set: (partial: Partial<EditorState>) => void;
  toast: (message: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
}

const HISTORY_LIMIT = 150;
const MERGE_WINDOW = 1200;
let toastId = 0;

function readPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`lumen:pref:${key}`);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
export function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(`lumen:pref:${key}`, JSON.stringify(value));
  } catch {
    /* almacenamiento no disponible */
  }
}

function keepSlide(doc: Presentation, preferredId: string, prevDoc?: Presentation): string {
  if (doc.slides.some((s) => s.id === preferredId)) return preferredId;
  const prevIndex = prevDoc ? prevDoc.slides.findIndex((s) => s.id === preferredId) : 0;
  const i = Math.max(0, Math.min(prevIndex, doc.slides.length - 1));
  return doc.slides[i]?.id ?? '';
}

const initialDoc = createFromTemplate('showcase');

export const useEditor = create<EditorState>((set, get) => ({
  doc: initialDoc,
  past: [],
  future: [],
  mergeKey: null,
  mergeAt: 0,
  localVersion: 0,

  currentSlideId: initialDoc.slides[0]?.id ?? '',
  selection: [],
  editingId: null,
  previewTick: { ids: [], at: 0 },

  zoom: 'fit',
  panel: 'slide',
  aiOpen: false,
  paletteOpen: false,
  presenting: null,
  docsOpen: false,
  helpOpen: false,
  liveAnimations: readPref('live', true),
  sounds: readPref('sounds', true),
  sync: 'connecting',
  serverMode: false,
  clipboard: [],
  toasts: [],

  dispatch: (commands, opts = {}) => {
    const state = get();
    const { doc, results, changed } = applyCommands(state.doc, commands);
    if (!changed) return results;
    const now = Date.now();
    const merging = opts.merge && opts.merge === state.mergeKey && now - state.mergeAt < MERGE_WINDOW;
    const record = opts.history !== false && !merging;
    const selection = state.selection.filter((id) => doc.slides.some((s) => s.elements.some((e) => e.id === id)));
    set({
      doc,
      past: record ? [...state.past, state.doc].slice(-HISTORY_LIMIT) : state.past,
      future: opts.history === false ? state.future : [],
      mergeKey: opts.merge ?? null,
      mergeAt: now,
      localVersion: state.localVersion + 1,
      currentSlideId: keepSlide(doc, state.currentSlideId, state.doc),
      selection,
    });
    return results;
  },

  setDoc: (doc, opts = {}) => {
    const state = get();
    set({
      doc,
      past: opts.resetHistory ? [] : [...state.past, state.doc].slice(-HISTORY_LIMIT),
      future: opts.resetHistory ? [] : state.future,
      mergeKey: null,
      localVersion: opts.remote ? state.localVersion : state.localVersion + 1,
      currentSlideId: keepSlide(doc, state.currentSlideId, state.doc),
      selection: opts.resetHistory
        ? []
        : state.selection.filter((id) => doc.slides.some((s) => s.elements.some((e) => e.id === id))),
      editingId: opts.remote ? state.editingId : null,
    });
  },

  undo: () => {
    const { past, doc, future, currentSlideId } = get();
    const prev = past[past.length - 1];
    if (!prev) return;
    set({
      doc: prev,
      past: past.slice(0, -1),
      future: [doc, ...future].slice(0, HISTORY_LIMIT),
      mergeKey: null,
      localVersion: get().localVersion + 1,
      currentSlideId: keepSlide(prev, currentSlideId, doc),
      editingId: null,
    });
  },

  redo: () => {
    const { past, doc, future, currentSlideId } = get();
    const next = future[0];
    if (!next) return;
    set({
      doc: next,
      past: [...past, doc],
      future: future.slice(1),
      mergeKey: null,
      localVersion: get().localVersion + 1,
      currentSlideId: keepSlide(next, currentSlideId, doc),
      editingId: null,
    });
  },

  selectSlide: (id) => {
    if (id === get().currentSlideId) return;
    const panel = get().panel;
    set({ currentSlideId: id, selection: [], editingId: null, panel: panel === 'theme' || panel === 'layers' ? panel : 'slide' });
  },
  select: (ids) => {
    const panel = get().panel;
    set({
      selection: ids,
      editingId: null,
      panel:
        panel === 'layers'
          ? 'layers'
          : ids.length
            ? panel === 'animation'
              ? 'animation'
              : 'design'
            : panel === 'theme'
              ? 'theme'
              : 'slide',
    });
  },
  toggleSelect: (id) => {
    const sel = get().selection;
    get().select(sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]);
  },
  setEditing: (id) => set({ editingId: id }),
  preview: (ids) => set({ previewTick: { ids, at: Date.now() } }),

  set: (partial) => set(partial),
  toast: (message, kind = 'info') => {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, kind, message }].slice(-4) });
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 3200);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

/* ---------- Selectores ---------- */

export function useCurrentSlide(): Slide | undefined {
  return useEditor((s) => s.doc.slides.find((sl) => sl.id === s.currentSlideId));
}

export function useSelectedElements(): SlideElement[] {
  const slide = useCurrentSlide();
  const selection = useEditor((s) => s.selection);
  if (!slide) return [];
  return slide.elements.filter((e) => selection.includes(e.id));
}

export function currentSlideIndex(): number {
  const { doc, currentSlideId } = useEditor.getState();
  return Math.max(0, doc.slides.findIndex((s) => s.id === currentSlideId));
}

/** Amplía una lista de ids con todos los miembros de sus grupos (en la diapositiva actual). */
export function expandGroups(ids: string[]): string[] {
  const { doc, currentSlideId } = useEditor.getState();
  const slide = doc.slides.find((s) => s.id === currentSlideId);
  if (!slide) return ids;
  const groups = new Set(slide.elements.filter((e) => ids.includes(e.id) && e.group).map((e) => e.group));
  if (!groups.size) return ids;
  return [...new Set([...ids, ...slide.elements.filter((e) => groups.has(e.group)).map((e) => e.id)])];
}
