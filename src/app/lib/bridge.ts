/**
 * API interna en el navegador: `window.lumen`.
 *
 * Permite que una IA que controle el navegador (extensión, agente con
 * Playwright, iframe anfitrión vía postMessage...) manipule la app con los
 * mismos comandos que la API REST.
 */
import { API_GUIDE, commandJsonSchema, summarizePresentation, type Command } from '../../core/commands';
import { LAYOUTS } from '../../core/layouts';
import { THEMES } from '../../core/themes';
import { buildPrintHtml, buildStandaloneHtml } from '../../render/exportHtml';
import { useEditor, currentSlideIndex } from '../store/editor';

export interface LumenBrowserApi {
  version: number;
  guide: string;
  schema: () => Record<string, unknown>;
  layouts: { id: string; name: string; description: string }[];
  themes: string[];
  getDocument: () => unknown;
  getSummary: () => unknown;
  apply: (commands: Command[] | Command) => unknown;
  undo: () => void;
  redo: () => void;
  select: (elementIds: string[]) => void;
  goToSlide: (index: number) => void;
  present: (fromIndex?: number) => void;
  stopPresenting: () => void;
  exportHtml: () => Promise<string>;
  /** HTML paginado (una diapositiva por página) listo para imprimir/convertir a PDF. */
  printHtml: () => string;
  /** Genera el .pptx como Blob (PowerPoint/Keynote/Google Slides). */
  exportPptx: () => Promise<Blob>;
  on: (event: 'change', cb: (doc: unknown) => void) => () => void;
}

declare global {
  interface Window {
    lumen: LumenBrowserApi;
  }
}

export function installBridge() {
  const api: LumenBrowserApi = {
    version: 1,
    guide: API_GUIDE,
    schema: () => commandJsonSchema(),
    layouts: LAYOUTS.map(({ id, name, description }) => ({ id, name, description })),
    themes: THEMES.map((t) => t.id),
    getDocument: () => structuredClone(useEditor.getState().doc),
    getSummary: () => summarizePresentation(useEditor.getState().doc),
    apply: (commands) => useEditor.getState().dispatch(Array.isArray(commands) ? commands : [commands]),
    undo: () => useEditor.getState().undo(),
    redo: () => useEditor.getState().redo(),
    select: (ids) => useEditor.getState().select(ids),
    goToSlide: (index) => {
      const slide = useEditor.getState().doc.slides[index];
      if (slide) useEditor.getState().selectSlide(slide.id);
    },
    present: (fromIndex) => useEditor.setState({ presenting: { start: fromIndex ?? currentSlideIndex() } }),
    stopPresenting: () => useEditor.setState({ presenting: null }),
    exportHtml: () => buildStandaloneHtml(useEditor.getState().doc),
    printHtml: () => buildPrintHtml(useEditor.getState().doc),
    exportPptx: async () => (await import('../../render/exportPptx')).buildPptx(useEditor.getState().doc),
    on: (_event, cb) => useEditor.subscribe((s, p) => s.doc !== p.doc && cb(s.doc)),
  };
  window.lumen = api;

  // Puente postMessage: { type: 'lumen:command', id, commands } → { type: 'lumen:result', id, results }
  window.addEventListener('message', (e: MessageEvent) => {
    const data = e.data as { type?: string; id?: string; commands?: Command[] } | null;
    if (!data || typeof data !== 'object') return;
    // Solo se aceptan mensajes del mismo origen o de la ventana anfitriona (iframe).
    const fromHost = window.parent !== window && e.source === window.parent;
    if (e.origin !== window.location.origin && !fromHost) return;
    const reply = (payload: Record<string, unknown>) =>
      (e.source as WindowProxy | null)?.postMessage({ id: data.id, ...payload }, { targetOrigin: e.origin || '*' });
    if (data.type === 'lumen:command' && Array.isArray(data.commands)) {
      reply({ type: 'lumen:result', results: api.apply(data.commands) });
    } else if (data.type === 'lumen:get') {
      reply({ type: 'lumen:document', document: api.getDocument() });
    }
  });
}
