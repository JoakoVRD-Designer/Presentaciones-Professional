/**
 * Motor de comandos de Lumen.
 *
 * TODA modificación del documento pasa por aquí: el editor visual, la API REST,
 * el servidor MCP y el asistente de IA envían los mismos comandos JSON.
 * Esto garantiza que lo que puede hacer una persona con el ratón también lo
 * puede hacer una IA, y viceversa.
 */
import { produce, type Draft } from 'immer';
import { z } from 'zod';
import { buildLayout, LayoutContentSchema, LAYOUTS } from './layouts';
import {
  AnimationSchema,
  BackgroundSchema,
  ElementSchema,
  makeElement,
  makeSlide,
  normalizePresentation,
  PresentationSchema,
  SettingsSchema,
  SlideSchema,
  StyleSchema,
  ThemeSchema,
  TransitionSchema,
  uid,
  type Presentation,
  type Slide,
  type SlideElement,
} from './model';
import { getTheme, THEMES } from './themes';

/* ------------------------------------------------------------------ */
/* Esquemas de comandos                                                */
/* ------------------------------------------------------------------ */

const SlideRef = z
  .union([z.string(), z.number().int()])
  .describe('Id de la diapositiva o su índice (0 = primera, -1 = última).');
const ElementRef = z.string().describe('Id del elemento.');
const Patch = z
  .record(z.string(), z.any())
  .describe('Objeto parcial; se fusiona en profundidad con el valor actual.');

export const CommandSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('presentation.update'),
      patch: z
        .object({ title: z.string().optional(), settings: SettingsSchema.partial().optional() })
        .describe('Título y/o ajustes de reproducción.'),
    })
    .describe('Actualiza el título o los ajustes de la presentación.'),
  z
    .object({
      op: z.literal('theme.set'),
      preset: z
        .string()
        .optional()
        .describe(`Id de tema predefinido: ${THEMES.map((t) => t.id).join(', ')}.`),
      patch: Patch.optional().describe('Cambios parciales del tema (fonts, colors, radius).'),
    })
    .describe('Aplica un tema predefinido y/o modifica el tema actual.'),
  z
    .object({
      op: z.literal('slide.add'),
      index: z.number().int().optional().describe('Posición de inserción; por defecto al final.'),
      layout: z
        .string()
        .optional()
        .describe(`Plantilla: ${LAYOUTS.map((l) => l.id).join(', ')}.`),
      content: LayoutContentSchema.optional(),
      slide: Patch.optional().describe('Diapositiva completa o parcial (background, transition, elements, notes...).'),
      id: z.string().optional().describe('Id deseado para la nueva diapositiva.'),
    })
    .describe('Añade una diapositiva, desde una plantilla con contenido o definida a mano.'),
  z
    .object({ op: z.literal('slide.update'), slide: SlideRef, patch: Patch })
    .describe('Modifica propiedades de una diapositiva (name, notes, duration, hidden, background, transition).'),
  z.object({ op: z.literal('slide.delete'), slide: SlideRef }).describe('Elimina una diapositiva.'),
  z.object({ op: z.literal('slide.duplicate'), slide: SlideRef }).describe('Duplica una diapositiva.'),
  z
    .object({ op: z.literal('slide.move'), slide: SlideRef, to: z.number().int() })
    .describe('Mueve una diapositiva al índice "to".'),
  z
    .object({ op: z.literal('slide.background'), slide: SlideRef, background: Patch })
    .describe('Cambia el fondo (color, degradado, imagen, video, efecto, desenfoque, superposición...).'),
  z
    .object({ op: z.literal('slide.transition'), slide: SlideRef, transition: Patch })
    .describe('Cambia la transición de entrada y su sonido.'),
  z.object({ op: z.literal('slides.clear') }).describe('Elimina todas las diapositivas.'),
  z
    .object({
      op: z.literal('element.add'),
      slide: SlideRef,
      element: Patch.describe('Elemento: requiere "type" (text, image, video, shape, icon, embed).'),
      index: z.number().int().optional().describe('Posición en el orden de capas (por defecto, encima de todo).'),
    })
    .describe('Añade un elemento a una diapositiva.'),
  z
    .object({ op: z.literal('element.update'), element: ElementRef, slide: SlideRef.optional(), patch: Patch })
    .describe('Modifica cualquier propiedad de un elemento (posición, texto, estilo, animación...).'),
  z
    .object({ op: z.literal('element.style'), element: ElementRef, slide: SlideRef.optional(), style: Patch })
    .describe('Atajo para modificar element.style.'),
  z
    .object({ op: z.literal('element.animate'), element: ElementRef, slide: SlideRef.optional(), animation: Patch })
    .describe('Atajo para modificar element.animation.'),
  z
    .object({ op: z.literal('element.delete'), element: ElementRef, slide: SlideRef.optional() })
    .describe('Elimina un elemento.'),
  z
    .object({
      op: z.literal('element.duplicate'),
      element: ElementRef,
      slide: SlideRef.optional(),
      offset: z.number().default(40),
    })
    .describe('Duplica un elemento desplazándolo.'),
  z
    .object({
      op: z.literal('element.arrange'),
      element: ElementRef,
      slide: SlideRef.optional(),
      action: z.enum(['front', 'back', 'forward', 'backward']),
    })
    .describe('Cambia el orden de capas.'),
  z
    .object({
      op: z.literal('element.align'),
      element: ElementRef,
      slide: SlideRef.optional(),
      align: z.enum(['left', 'center', 'right', 'top', 'middle', 'bottom']),
      margin: z.number().default(0),
    })
    .describe('Alinea el elemento respecto a la diapositiva.'),
  z
    .object({
      op: z.literal('element.move'),
      element: ElementRef,
      slide: SlideRef.optional(),
      toSlide: SlideRef,
    })
    .describe('Mueve un elemento a otra diapositiva.'),
  z
    .object({ op: z.literal('document.replace'), document: Patch })
    .describe('Reemplaza el documento completo (se valida y completa).'),
]);

export type Command = z.input<typeof CommandSchema>;
export type ParsedCommand = z.infer<typeof CommandSchema>;

export interface CommandResult {
  ok: boolean;
  op: string;
  /** Id del objeto creado o afectado. */
  id?: string;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

/** Copia profunda segura también para borradores de immer (structuredClone no los admite). */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Fusión profunda: los arrays y primitivos se reemplazan, los objetos se mezclan. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch) || !isPlainObject(base)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

function resolveSlideIndex(doc: Presentation, ref: string | number): number {
  if (typeof ref === 'number') {
    const i = ref < 0 ? doc.slides.length + ref : ref;
    if (i < 0 || i >= doc.slides.length) throw new Error(`No existe la diapositiva en el índice ${ref}`);
    return i;
  }
  if (/^-?\d+$/.test(ref)) return resolveSlideIndex(doc, Number(ref));
  const i = doc.slides.findIndex((s) => s.id === ref);
  if (i < 0) throw new Error(`No existe la diapositiva "${ref}"`);
  return i;
}

function findElement(
  doc: Draft<Presentation>,
  elementId: string,
  slideRef?: string | number,
): { slide: Draft<Slide>; index: number } {
  const slides =
    slideRef === undefined ? doc.slides : [doc.slides[resolveSlideIndex(doc as Presentation, slideRef)]];
  for (const slide of slides) {
    const index = slide.elements.findIndex((e) => e.id === elementId);
    if (index >= 0) return { slide, index };
  }
  throw new Error(`No existe el elemento "${elementId}"`);
}

function zodMessage(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`)
      .join('; ');
  }
  return err instanceof Error ? err.message : String(err);
}

function validateElement(el: unknown): SlideElement {
  const parsed = ElementSchema.parse(el);
  return { ...parsed, id: parsed.id ?? uid('el') } as SlideElement;
}

function cloneSlideWithNewIds(slide: Slide): Slide {
  return {
    ...clone(slide),
    id: uid('sl'),
    elements: slide.elements.map((e) => ({ ...clone(e), id: uid('el') })),
  };
}

function ensureUniqueIds(doc: Presentation, slide: Slide): Slide {
  const used = new Set<string>();
  for (const s of doc.slides) for (const e of s.elements) used.add(e.id);
  const slideIds = new Set(doc.slides.map((s) => s.id));
  return {
    ...slide,
    id: slideIds.has(slide.id) ? uid('sl') : slide.id,
    elements: slide.elements.map((e) => (used.has(e.id) ? { ...e, id: uid('el') } : e)),
  };
}

/* ------------------------------------------------------------------ */
/* Aplicación                                                          */
/* ------------------------------------------------------------------ */

function applyOne(draft: Draft<Presentation>, cmd: ParsedCommand): string | undefined {
  const doc = draft as unknown as Presentation;
  switch (cmd.op) {
    case 'presentation.update': {
      if (cmd.patch.title !== undefined) draft.title = cmd.patch.title;
      if (cmd.patch.settings) draft.settings = SettingsSchema.parse(deepMerge(doc.settings, cmd.patch.settings));
      return draft.id;
    }
    case 'theme.set': {
      let theme = doc.theme;
      if (cmd.preset) {
        const preset = getTheme(cmd.preset);
        if (!preset) throw new Error(`Tema desconocido "${cmd.preset}". Disponibles: ${THEMES.map((t) => t.id).join(', ')}`);
        theme = clone(preset);
      }
      if (cmd.patch) theme = deepMerge(theme, cmd.patch);
      draft.theme = ThemeSchema.parse(theme);
      return draft.theme.id;
    }
    case 'slide.add': {
      let input: Record<string, unknown> = {};
      if (cmd.layout || cmd.content) {
        input = buildLayout(cmd.layout ?? 'blank', cmd.content ?? {}, doc.theme) as Record<string, unknown>;
      }
      if (cmd.slide) input = deepMerge(input, cmd.slide);
      if (cmd.id) input.id = cmd.id;
      const slide = ensureUniqueIds(doc, makeSlide(SlideSchema.parse(input)));
      const at = cmd.index === undefined ? draft.slides.length : Math.max(0, Math.min(cmd.index, draft.slides.length));
      draft.slides.splice(at, 0, slide as Draft<Slide>);
      return slide.id;
    }
    case 'slide.update': {
      const i = resolveSlideIndex(doc, cmd.slide);
      const current = doc.slides[i];
      const { elements, ...rest } = cmd.patch as Record<string, unknown>;
      const merged = deepMerge(current, rest);
      if (Array.isArray(elements)) (merged as { elements: unknown }).elements = elements;
      const parsed = SlideSchema.parse(merged);
      draft.slides[i] = {
        ...parsed,
        id: current.id,
        elements: parsed.elements.map((e) => ({ ...e, id: e.id ?? uid('el') })),
      } as Draft<Slide>;
      return current.id;
    }
    case 'slide.delete': {
      const i = resolveSlideIndex(doc, cmd.slide);
      const [removed] = draft.slides.splice(i, 1);
      return removed.id;
    }
    case 'slide.duplicate': {
      const i = resolveSlideIndex(doc, cmd.slide);
      const copy = cloneSlideWithNewIds(doc.slides[i]);
      draft.slides.splice(i + 1, 0, copy as Draft<Slide>);
      return copy.id;
    }
    case 'slide.move': {
      const i = resolveSlideIndex(doc, cmd.slide);
      const to = Math.max(0, Math.min(cmd.to < 0 ? draft.slides.length + cmd.to : cmd.to, draft.slides.length - 1));
      const [s] = draft.slides.splice(i, 1);
      draft.slides.splice(to, 0, s);
      return s.id;
    }
    case 'slide.background': {
      const i = resolveSlideIndex(doc, cmd.slide);
      draft.slides[i].background = BackgroundSchema.parse(deepMerge(doc.slides[i].background, cmd.background));
      return doc.slides[i].id;
    }
    case 'slide.transition': {
      const i = resolveSlideIndex(doc, cmd.slide);
      draft.slides[i].transition = TransitionSchema.parse(deepMerge(doc.slides[i].transition, cmd.transition));
      return doc.slides[i].id;
    }
    case 'slides.clear': {
      draft.slides = [];
      return undefined;
    }
    case 'element.add': {
      const i = resolveSlideIndex(doc, cmd.slide);
      let el = makeElement(cmd.element as never);
      const exists = doc.slides.some((s) => s.elements.some((e) => e.id === el.id));
      if (exists) el = { ...el, id: uid('el') };
      const list = draft.slides[i].elements;
      const at = cmd.index === undefined ? list.length : Math.max(0, Math.min(cmd.index, list.length));
      list.splice(at, 0, el as Draft<SlideElement>);
      return el.id;
    }
    case 'element.update':
    case 'element.style':
    case 'element.animate': {
      const { slide, index } = findElement(draft, cmd.element, cmd.slide);
      const current = slide.elements[index] as SlideElement;
      const patch =
        cmd.op === 'element.update'
          ? cmd.patch
          : cmd.op === 'element.style'
            ? { style: cmd.style }
            : { animation: cmd.animation };
      const merged = deepMerge(current, patch) as Record<string, unknown>;
      if (merged.type !== current.type) throw new Error('No se puede cambiar el tipo de un elemento; elimínalo y crea otro.');
      merged.id = current.id;
      slide.elements[index] = validateElement(merged) as Draft<SlideElement>;
      return current.id;
    }
    case 'element.delete': {
      const { slide, index } = findElement(draft, cmd.element, cmd.slide);
      slide.elements.splice(index, 1);
      return cmd.element;
    }
    case 'element.duplicate': {
      const { slide, index } = findElement(draft, cmd.element, cmd.slide);
      const src = slide.elements[index] as SlideElement;
      const copy = { ...clone(src), id: uid('el'), x: src.x + cmd.offset, y: src.y + cmd.offset };
      slide.elements.splice(index + 1, 0, copy as Draft<SlideElement>);
      return copy.id;
    }
    case 'element.arrange': {
      const { slide, index } = findElement(draft, cmd.element, cmd.slide);
      const list = slide.elements;
      const [el] = list.splice(index, 1);
      const to =
        cmd.action === 'front'
          ? list.length
          : cmd.action === 'back'
            ? 0
            : cmd.action === 'forward'
              ? Math.min(index + 1, list.length)
              : Math.max(index - 1, 0);
      list.splice(to, 0, el);
      return el.id;
    }
    case 'element.align': {
      const { slide, index } = findElement(draft, cmd.element, cmd.slide);
      const el = slide.elements[index];
      const m = cmd.margin;
      const W = doc.width;
      const H = doc.height;
      if (cmd.align === 'left') el.x = m;
      if (cmd.align === 'center') el.x = Math.round((W - el.w) / 2);
      if (cmd.align === 'right') el.x = W - el.w - m;
      if (cmd.align === 'top') el.y = m;
      if (cmd.align === 'middle') el.y = Math.round((H - el.h) / 2);
      if (cmd.align === 'bottom') el.y = H - el.h - m;
      return el.id;
    }
    case 'element.move': {
      const { slide, index } = findElement(draft, cmd.element, cmd.slide);
      const target = draft.slides[resolveSlideIndex(doc, cmd.toSlide)];
      const [el] = slide.elements.splice(index, 1);
      target.elements.push(el);
      return el.id;
    }
    case 'document.replace': {
      const next = normalizePresentation({ ...cmd.document, id: draft.id, rev: draft.rev });
      Object.assign(draft, next);
      return draft.id;
    }
  }
}

export interface ApplyResult {
  doc: Presentation;
  results: CommandResult[];
  changed: boolean;
}

/**
 * Aplica una lista de comandos de forma inmutable. Cada comando se valida y
 * aplica por separado: si uno falla, el resto continúa y el error se informa.
 */
export function applyCommands(doc: Presentation, commands: unknown[]): ApplyResult {
  const results: CommandResult[] = [];
  let current = doc;
  for (const raw of commands) {
    const op = isPlainObject(raw) && typeof raw.op === 'string' ? raw.op : '?';
    const parsed = CommandSchema.safeParse(raw);
    if (!parsed.success) {
      results.push({ ok: false, op, error: `Comando inválido: ${zodMessage(parsed.error)}` });
      continue;
    }
    try {
      let id: string | undefined;
      current = produce(current, (draft) => {
        id = applyOne(draft, parsed.data);
      });
      results.push({ ok: true, op, id });
    } catch (err) {
      results.push({ ok: false, op, error: zodMessage(err) });
    }
  }
  return { doc: current, results, changed: current !== doc };
}

/* ------------------------------------------------------------------ */
/* Descripción para IAs                                                */
/* ------------------------------------------------------------------ */

export function commandJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(CommandSchema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
}

export function modelJsonSchemas(): Record<string, unknown> {
  const opts = { io: 'input', unrepresentable: 'any' } as const;
  return {
    element: z.toJSONSchema(ElementSchema, opts),
    style: z.toJSONSchema(StyleSchema, opts),
    animation: z.toJSONSchema(AnimationSchema, opts),
    background: z.toJSONSchema(BackgroundSchema, opts),
    transition: z.toJSONSchema(TransitionSchema, opts),
    theme: z.toJSONSchema(ThemeSchema, opts),
    settings: z.toJSONSchema(SettingsSchema, opts),
    presentation: z.toJSONSchema(PresentationSchema, opts),
  };
}

/** Resumen compacto del documento, pensado para el contexto de una IA. */
export function summarizePresentation(doc: Presentation): unknown {
  return {
    id: doc.id,
    title: doc.title,
    theme: { id: doc.theme.id, fonts: doc.theme.fonts, colors: doc.theme.colors, radius: doc.theme.radius },
    settings: doc.settings,
    slides: doc.slides.map((s, i) => ({
      index: i,
      id: s.id,
      name: s.name,
      background: {
        type: s.background.type,
        ...(s.background.type === 'effect' ? { effect: s.background.effect } : {}),
        ...(s.background.type === 'image' ? { image: s.background.image } : {}),
        ...(s.background.type === 'video' ? { video: s.background.video } : {}),
        ...(s.background.type === 'gradient' ? { gradient: s.background.gradient } : {}),
        ...(s.background.type === 'color' ? { color: s.background.color } : {}),
      },
      transition: s.transition.type,
      notes: s.notes || undefined,
      elements: s.elements.map((e) => ({
        id: e.id,
        type: e.type,
        name: e.name || undefined,
        box: [Math.round(e.x), Math.round(e.y), Math.round(e.w), Math.round(e.h)],
        ...(e.type === 'text' ? { text: e.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140), size: e.size } : {}),
        ...(e.type === 'image' || e.type === 'video' ? { src: e.src } : {}),
        ...(e.type === 'icon' ? { icon: e.icon } : {}),
        ...(e.type === 'shape' ? { shape: e.shape, fill: e.style.fill } : {}),
        entrance: e.animation.entrance,
        step: e.animation.step || undefined,
      })),
    })),
  };
}

export const API_GUIDE = `
# API de Lumen (para IAs)

Lumen es un editor de presentaciones HTML. El documento es JSON: una presentación
tiene "theme", "settings" y "slides"; cada diapositiva tiene "background",
"transition", "notes" y "elements" (text, image, video, shape, icon, embed).
El lienzo mide 1920×1080 px; x/y/w/h de los elementos están en esas unidades.

Todo cambio se hace con comandos JSON (campo "op"). Se envían en lote:
  POST /api/presentations/:id/commands   { "commands": [ ... ] }
Cada comando devuelve { ok, op, id, error }. Si uno falla los demás continúan.

## Flujo recomendado
1. Elige tema: {"op":"theme.set","preset":"aurora"}  (${THEMES.map((t) => t.id).join(', ')})
2. Crea diapositivas con plantillas y contenido:
   {"op":"slide.add","layout":"title","content":{"title":"...","subtitle":"..."}}
   Plantillas: ${LAYOUTS.map((l) => `${l.id} (${l.description})`).join('; ')}
3. Ajusta detalles: element.update, slide.background, slide.transition...
4. Para diseños libres: slide.add con layout "blank" y luego element.add.

## Consejos de diseño
- Una idea por diapositiva. Títulos de 3-8 palabras. Máx. 6 viñetas.
- Usa "step" en animation para revelar contenido con clics (builds).
- Fondos: "effect" (aurora, mesh, grid, dots, stars, spotlight, beams, waves, noise),
  "video" con blur 4-10 + overlay oscuro para legibilidad, "image" con kenBurns.
- Vidrio (glassmorphism): style { fill: "rgba(255,255,255,0.08)", backdropBlur: 24,
  borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", radius: 28 }.
- Texto con degradado: text.gradient = "linear-gradient(...)".
- Iconos: nombres Lucide en PascalCase (Rocket, Sparkles, ChartLine, Users, Globe,
  ShieldCheck, Zap, BrainCircuit, Target, Lightbulb, Heart, Star, TrendingUp...).
- Mantén márgenes de ~140 px y buen contraste.
`.trim();
