/** Acciones de alto nivel reutilizadas por la barra, la paleta de comandos y los atajos. */
import { normalizePresentation, type ElementInput } from '../../core/model';
import { buildStandaloneHtml, downloadFile, printDocument, slugify } from '../../render/exportHtml';
import { currentSlideIndex, useEditor } from '../store/editor';
import { mediaSize, pickFile, uploadAsset } from './assets';
import { sfx } from './sound';
import { createDoc, flushNow, openDoc } from './sync';

const st = () => useEditor.getState();

export function insertElement(element: ElementInput) {
  const s = st();
  const slide = s.doc.slides.find((x) => x.id === s.currentSlideId);
  if (!slide) {
    s.toast('Primero crea una diapositiva', 'info');
    return;
  }
  const W = s.doc.width;
  const H = s.doc.height;
  const w = (element as { w?: number }).w ?? 640;
  const h = (element as { h?: number }).h ?? 200;
  // Desplaza ligeramente si ya hay algo en el centro, para que se note el nuevo elemento.
  const stacked = slide.elements.filter((e) => Math.abs(e.x + e.w / 2 - W / 2) < 4 && Math.abs(e.y + e.h / 2 - H / 2) < 4).length;
  const input = {
    x: Math.round((W - w) / 2 + stacked * 30),
    y: Math.round((H - h) / 2 + stacked * 30),
    ...element,
  } as ElementInput;
  const [res] = s.dispatch([{ op: 'element.add', slide: slide.id, element: input as Record<string, unknown> }]);
  if (res?.ok && res.id) {
    s.select([res.id]);
    sfx('pop');
    if (input.type === 'text') setTimeout(() => st().setEditing(res.id!), 60);
  } else if (res?.error) {
    s.toast(res.error, 'error');
  }
}

export const TEXT_PRESETS: { id: string; label: string; element: ElementInput }[] = [
  {
    id: 'title',
    label: 'Título',
    element: { type: 'text', name: 'Título', role: 'heading', html: 'Un título con impacto', size: 96, weight: 700, letterSpacing: -2, w: 1400, h: 140, lineHeight: 1.05 },
  },
  {
    id: 'subtitle',
    label: 'Subtítulo',
    element: { type: 'text', name: 'Subtítulo', html: 'Un subtítulo que da contexto', size: 40, color: 'var(--lm-muted)', w: 1100, h: 70 },
  },
  {
    id: 'body',
    label: 'Párrafo',
    element: { type: 'text', name: 'Párrafo', html: 'Escribe aquí tu idea con claridad. Una diapositiva, un mensaje.', size: 30, lineHeight: 1.5, w: 900, h: 140 },
  },
  {
    id: 'list',
    label: 'Lista',
    element: { type: 'text', name: 'Lista', html: '<ul><li>Primer punto</li><li>Segundo punto</li><li>Tercer punto</li></ul>', size: 34, lineHeight: 1.6, w: 900, h: 220 },
  },
  {
    id: 'gradient',
    label: 'Texto degradado',
    element: {
      type: 'text',
      name: 'Degradado',
      role: 'heading',
      html: 'Brillante',
      size: 160,
      weight: 800,
      letterSpacing: -5,
      w: 1200,
      h: 200,
      align: 'center',
      gradient: 'linear-gradient(120deg, var(--lm-primary), var(--lm-accent))',
    },
  },
  {
    id: 'label',
    label: 'Etiqueta',
    element: {
      type: 'text',
      name: 'Etiqueta',
      html: 'NOVEDAD',
      size: 20,
      weight: 700,
      letterSpacing: 4,
      color: 'var(--lm-accent)',
      align: 'center',
      valign: 'middle',
      w: 220,
      h: 52,
      style: { fill: 'color-mix(in srgb, var(--lm-accent) 14%, transparent)', radius: 26, borderWidth: 1, borderColor: 'color-mix(in srgb, var(--lm-accent) 40%, transparent)' },
    },
  },
];

export function insertShape(shape: string) {
  const line = shape === 'line';
  insertElement({
    type: 'shape',
    shape: shape as never,
    name: shape,
    w: line ? 600 : 360,
    h: line ? 6 : 360,
    style: { fill: line ? 'var(--lm-primary)' : 'linear-gradient(135deg, var(--lm-primary), var(--lm-accent))', radius: shape === 'rect' ? 24 : 0 },
  });
}

export function insertGlassCard() {
  insertElement({
    type: 'shape',
    name: 'Tarjeta de vidrio',
    w: 720,
    h: 440,
    style: {
      fill: 'rgba(255,255,255,0.08)',
      backdropBlur: 24,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.16)',
      radius: 32,
      shadow: { x: 0, y: 30, blur: 80, spread: 0, color: 'rgba(0,0,0,0.35)' },
    },
  });
}

export const CHART_SAMPLES: Record<string, ElementInput> = {
  column: { type: 'chart', chart: 'column', name: 'Gráfico de columnas', w: 1100, h: 600, labels: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: '2025', values: [32, 45, 51, 68] }, { name: '2026', values: [41, 58, 66, 89] }], showLegend: true },
  bar: { type: 'chart', chart: 'bar', name: 'Gráfico de barras', w: 1100, h: 560, labels: ['Producto A', 'Producto B', 'Producto C', 'Producto D'], series: [{ name: 'Ventas', values: [86, 64, 47, 29] }], suffix: '%' },
  line: { type: 'chart', chart: 'line', name: 'Gráfico de líneas', w: 1100, h: 560, labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'], series: [{ name: 'Usuarios', values: [12, 18, 16, 27, 34, 46] }], suffix: 'k' },
  area: { type: 'chart', chart: 'area', name: 'Gráfico de área', w: 1100, h: 560, labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'], series: [{ name: 'Ingresos', values: [20, 26, 24, 38, 45, 61] }], prefix: '$', suffix: 'k' },
  donut: { type: 'chart', chart: 'donut', name: 'Gráfico de dona', w: 760, h: 560, labels: ['Móvil', 'Escritorio', 'Tablet'], series: [{ name: 'Tráfico', values: [58, 34, 8] }], showLegend: true },
  pie: { type: 'chart', chart: 'pie', name: 'Gráfico de tarta', w: 760, h: 560, labels: ['Norte', 'Sur', 'Este', 'Oeste'], series: [{ name: 'Región', values: [35, 25, 22, 18] }], showLegend: true },
};

export function insertChart(kind: string) {
  insertElement({ ...(CHART_SAMPLES[kind] ?? CHART_SAMPLES.column), animation: { entrance: 'fade' } } as ElementInput);
}

export function insertIcon(icon: string) {
  insertElement({ type: 'icon', icon, name: icon, w: 160, h: 160, animation: { entrance: 'zoom-in', easing: 'spring', loop: 'float' } });
}

export async function insertMedia(kind: 'image' | 'video', src?: string) {
  if (src) {
    insertElement({ type: kind, src, w: kind === 'video' ? 960 : 800, h: kind === 'video' ? 540 : 520, style: { radius: 20 } });
    return;
  }
  const file = await pickFile(kind === 'image' ? 'image/*' : 'video/*');
  if (!file) return;
  try {
    const [url, dims] = await Promise.all([uploadAsset(file), mediaSize(file)]);
    const fit = Math.min(1100 / dims.w, 700 / dims.h, 1);
    insertElement({ type: kind, src: url, name: file.name, w: Math.round(dims.w * fit), h: Math.round(dims.h * fit), style: { radius: 20 } });
  } catch (err) {
    st().toast(err instanceof Error ? err.message : 'No se pudo subir', 'error');
  }
}

export function addSlide(layout = 'blank') {
  const s = st();
  const [res] = s.dispatch([{ op: 'slide.add', layout, content: {}, index: currentSlideIndex() + 1 }]);
  if (res?.id) s.selectSlide(res.id);
  sfx('pop');
}

export function duplicateSlide() {
  const s = st();
  const [res] = s.dispatch([{ op: 'slide.duplicate', slide: s.currentSlideId }]);
  if (res?.id) s.selectSlide(res.id);
  sfx('pop');
}

/** Flujo tipo Keynote/PowerPoint: duplica la diapositiva con transición Morph para mover cosas y animarlas. */
export function duplicateForMorph() {
  const s = st();
  const [res] = s.dispatch([{ op: 'slide.duplicate', slide: s.currentSlideId }]);
  if (!res?.id) return;
  s.dispatch([{ op: 'slide.transition', slide: res.id, transition: { type: 'morph', duration: 1000 } }], { history: true });
  s.selectSlide(res.id);
  sfx('success');
  s.toast('Diapositiva duplicada con Morph: mueve, redimensiona o cambia elementos y se animarán solos.', 'success');
}

export function deleteSlide() {
  const s = st();
  if (!s.currentSlideId) return;
  s.dispatch([{ op: 'slide.delete', slide: s.currentSlideId }]);
  sfx('remove');
}

export function present(fromStart = false) {
  const s = st();
  if (!s.doc.slides.length) return s.toast('No hay diapositivas que presentar', 'info');
  const visible = s.doc.slides.filter((x) => !x.hidden);
  const idx = fromStart ? 0 : Math.max(0, visible.findIndex((x) => x.id === s.currentSlideId));
  sfx('whoosh');
  s.set({ presenting: { start: idx }, editingId: null });
}

export async function exportHtml() {
  const s = st();
  try {
    s.toast('Generando HTML autónomo…');
    const html = await buildStandaloneHtml(s.doc);
    downloadFile(`${slugify(s.doc.title)}.html`, html);
    sfx('success');
    s.toast('HTML exportado. Ábrelo en cualquier navegador.', 'success');
  } catch (err) {
    s.toast(err instanceof Error ? err.message : 'Error al exportar', 'error');
  }
}

export async function exportPdf() {
  const s = st();
  try {
    s.toast('Preparando PDF… elige «Guardar como PDF» en el diálogo de impresión.');
    await printDocument(s.doc);
  } catch (err) {
    s.toast(err instanceof Error ? err.message : 'No se pudo imprimir', 'error');
  }
}

export function exportJson() {
  const s = st();
  downloadFile(`${slugify(s.doc.title)}.lumen.json`, JSON.stringify(s.doc, null, 2), 'application/json');
  sfx('success');
}

export async function importJson() {
  const file = await pickFile('.json,application/json,.html');
  if (!file) return;
  const s = st();
  try {
    let text = await file.text();
    if (file.name.endsWith('.html')) {
      const m = /<script type="application\/json" id="lumen-document">([\s\S]*?)<\/script>/.exec(text);
      if (!m) throw new Error('Este HTML no fue exportado por Lumen');
      text = m[1];
    }
    const doc = normalizePresentation(JSON.parse(text));
    await flushNow();
    const created = await createDoc('blank', doc.title, doc);
    await openDoc(created.id);
    sfx('success');
    s.toast(`«${doc.title}» importada`, 'success');
  } catch (err) {
    s.toast(err instanceof Error ? `No se pudo importar: ${err.message}` : 'Archivo inválido', 'error');
  }
}

export function toggleSounds() {
  const s = st();
  const next = !s.sounds;
  s.set({ sounds: next });
  try {
    localStorage.setItem('lumen:pref:sounds', JSON.stringify(next));
  } catch {
    /* noop */
  }
  if (next) sfx('toggle');
}

export function toggleLive() {
  const s = st();
  const next = !s.liveAnimations;
  s.set({ liveAnimations: next });
  try {
    localStorage.setItem('lumen:pref:live', JSON.stringify(next));
  } catch {
    /* noop */
  }
  sfx('toggle');
}

/* ---------- Portapapeles ---------- */

const CLIP_PREFIX = '{"lumen-elements":';

export function copySelection(cut = false) {
  const s = st();
  const slide = s.doc.slides.find((x) => x.id === s.currentSlideId);
  const els = slide?.elements.filter((e) => s.selection.includes(e.id)) ?? [];
  if (!els.length) return false;
  s.set({ clipboard: structuredClone(els) });
  navigator.clipboard?.writeText(`${CLIP_PREFIX}${JSON.stringify(els)}}`).catch(() => {});
  if (cut) s.dispatch(els.map((e) => ({ op: 'element.delete', element: e.id })));
  sfx('tap');
  return true;
}

export function pasteElements(fromText?: string) {
  const s = st();
  let els = s.clipboard;
  if (fromText?.startsWith(CLIP_PREFIX)) {
    try {
      els = (JSON.parse(fromText) as { 'lumen-elements': typeof els })['lumen-elements'];
    } catch {
      /* ignora */
    }
  }
  if (!els.length || !s.currentSlideId) return false;
  const results = s.dispatch(
    els.map((e) => {
      const { id: _omit, ...rest } = e;
      void _omit;
      return { op: 'element.add', slide: s.currentSlideId, element: { ...rest, x: e.x + 30, y: e.y + 30 } };
    }),
  );
  s.set({ clipboard: els.map((e) => ({ ...e, x: e.x + 30, y: e.y + 30 })) });
  s.select(results.filter((r) => r.ok && r.id).map((r) => r.id!));
  sfx('pop');
  return true;
}

export { CLIP_PREFIX };
