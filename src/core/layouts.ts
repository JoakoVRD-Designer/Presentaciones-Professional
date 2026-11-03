/**
 * Plantillas de diseño de alto nivel. Permiten que una persona o una IA cree
 * diapositivas bien compuestas pasando solo contenido.
 */
import { z } from 'zod';
import type { ElementInput, SlideInput, Theme } from './model';

export const LayoutContentSchema = z
  .object({
    kicker: z.string().optional().describe('Texto pequeño sobre el título (etiqueta / categoría).'),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    body: z.string().optional(),
    bullets: z.array(z.string()).optional().describe('Viñetas (máx. 6).'),
    image: z.string().optional().describe('URL de imagen.'),
    video: z.string().optional().describe('URL de video (MP4/WebM).'),
    quote: z.string().optional(),
    author: z.string().optional(),
    stats: z
      .array(z.object({ value: z.string(), label: z.string() }))
      .optional()
      .describe('Cifras destacadas (máx. 4).'),
    items: z
      .array(
        z.object({
          title: z.string(),
          text: z.string().optional(),
          icon: z.string().optional().describe('Icono Lucide en PascalCase.'),
        }),
      )
      .optional()
      .describe('Tarjetas / hitos (máx. 5).'),
    chart: z
      .object({
        kind: z.enum(['column', 'bar', 'line', 'area', 'donut', 'pie']).optional(),
        labels: z.array(z.string()),
        series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })),
        prefix: z.string().optional(),
        suffix: z.string().optional(),
      })
      .optional()
      .describe('Datos para la plantilla "chart".'),
    table: z
      .array(z.array(z.string()))
      .optional()
      .describe('Filas de la tabla para la plantilla "table" (la primera es el encabezado).'),
    columns: z
      .array(z.object({ title: z.string(), body: z.string() }))
      .optional()
      .describe('Dos columnas.'),
    code: z.string().optional().describe('Código fuente para la plantilla "code".'),
    language: z.string().optional().describe('Lenguaje del código (typescript, python, bash…).'),
    tex: z.string().optional().describe('Fórmula LaTeX para la plantilla "equation".'),
    cta: z.string().optional().describe('Llamada a la acción.'),
  })
  .describe('Contenido para rellenar una plantilla de diapositiva.');

export type LayoutContent = z.infer<typeof LayoutContentSchema>;

export interface LayoutDef {
  id: string;
  name: string;
  description: string;
  build: (c: LayoutContent, theme: Theme) => SlideInput;
}

const W = 1920;
const H = 1080;
const M = 140;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Convierte texto plano con **negritas** y *cursivas* en HTML seguro. */
export function textToHtml(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>')
    .replace(/\n/g, '<br>');
}

const T = (text: string, o: Record<string, unknown>): ElementInput =>
  ({ type: 'text', html: textToHtml(text), ...o }) as ElementInput;

const anim = (entrance: string, delay = 0, extra: Record<string, unknown> = {}) => ({
  entrance,
  delay,
  ...extra,
});

function kicker(text: string | undefined, x: number, y: number, align: 'left' | 'center' = 'left') {
  if (!text) return [];
  return [
    T(text, {
      name: 'Etiqueta',
      x,
      y,
      w: align === 'center' ? W - 2 * x : 900,
      h: 40,
      size: 22,
      weight: 600,
      letterSpacing: 6,
      transform: 'uppercase',
      color: 'var(--lm-accent)',
      align,
      animation: anim('fade-down', 0, { duration: 700 }),
    }),
  ];
}

export const LAYOUTS: LayoutDef[] = [
  {
    id: 'title',
    name: 'Portada',
    description: 'Portada con título gigante con degradado, subtítulo y fondo aurora animado.',
    build: (c, _theme) => ({
      name: 'Portada',
      background: { type: 'effect', effect: 'aurora', grain: 0.12, vignette: 0.35 },
      transition: { type: 'zoom', sound: 'rise' },
      elements: [
        ...kicker(c.kicker, M, 300, 'center'),
        T(c.title ?? 'Título de la presentación', {
          name: 'Título',
          role: 'heading',
          x: M,
          y: 360,
          w: W - 2 * M,
          h: 260,
          size: 132,
          weight: 700,
          lineHeight: 1.02,
          letterSpacing: -3,
          align: 'center',
          valign: 'middle',
          gradient: `linear-gradient(120deg, var(--lm-text) 20%, var(--lm-primary) 60%, var(--lm-accent) 100%)`,
          animation: anim('blur-in', 150, { duration: 1400 }),
        }),
        T(c.subtitle ?? '', {
          name: 'Subtítulo',
          x: 360,
          y: 650,
          w: W - 720,
          h: 120,
          size: 36,
          color: 'var(--lm-muted)',
          align: 'center',
          lineHeight: 1.4,
          animation: anim('fade-up', 650),
        }),
      ].filter((e) => (e as { html?: string }).html !== ''),
    }),
  },
  {
    id: 'section',
    name: 'Sección',
    description: 'Separador de sección con número/etiqueta grande y título.',
    build: (c, _theme) => ({
      name: 'Sección',
      background: { type: 'effect', effect: 'grid', vignette: 0.5 },
      transition: { type: 'wipe', sound: 'swoosh' },
      elements: [
        T(c.kicker ?? '01', {
          name: 'Número',
          role: 'heading',
          x: M,
          y: 250,
          w: 900,
          h: 260,
          size: 240,
          weight: 800,
          letterSpacing: -8,
          color: 'transparent',
          stroke: `2px var(--lm-primary)`,
          animation: anim('reveal-up', 0, { duration: 1200 }),
        }),
        T(c.title ?? 'Nueva sección', {
          name: 'Título',
          role: 'heading',
          x: M,
          y: 540,
          w: 1400,
          h: 160,
          size: 104,
          weight: 700,
          letterSpacing: -2,
          animation: anim('fade-up', 250),
        }),
        T(c.subtitle ?? '', {
          name: 'Subtítulo',
          x: M,
          y: 720,
          w: 1100,
          h: 100,
          size: 32,
          color: 'var(--lm-muted)',
          animation: anim('fade-up', 450),
        }),
      ],
    }),
  },
  {
    id: 'bullets',
    name: 'Lista',
    description: 'Título y hasta 6 viñetas que aparecen una por una con clics.',
    build: (c, _theme) => {
      const bullets = (c.bullets ?? ['Primer punto clave', 'Segundo punto clave', 'Tercer punto clave']).slice(0, 6);
      const gap = Math.min(120, 600 / bullets.length);
      return {
        name: 'Lista',
        background: { type: 'effect', effect: 'mesh', overlayOpacity: 0.35 },
        transition: { type: 'slide' },
        elements: [
          ...kicker(c.kicker, M, 130),
          T(c.title ?? 'Puntos clave', {
            name: 'Título',
            role: 'heading',
            x: M,
            y: 180,
            w: W - 2 * M,
            h: 140,
            size: 84,
            weight: 700,
            letterSpacing: -2,
            animation: anim('fade-up'),
          }),
          ...bullets.flatMap((b, i) => [
            {
              type: 'shape',
              name: `Marcador ${i + 1}`,
              shape: 'ellipse',
              x: M,
              y: 400 + i * gap + 14,
              w: 18,
              h: 18,
              style: { fill: 'var(--lm-primary)', glow: 18 },
              animation: anim('zoom-in', 0, { step: i + 1, duration: 500 }),
            } as ElementInput,
            T(b, {
              name: `Viñeta ${i + 1}`,
              x: M + 56,
              y: 400 + i * gap,
              w: W - 2 * M - 56,
              h: gap - 10,
              size: 40,
              lineHeight: 1.3,
              animation: anim('fade-left', 80, { step: i + 1, duration: 700 }),
            }),
          ]),
        ],
      };
    },
  },
  {
    id: 'two-column',
    name: 'Dos columnas',
    description: 'Título y dos tarjetas de vidrio comparativas (columns).',
    build: (c, theme) => {
      const cols = (c.columns ?? [
        { title: 'Antes', body: 'Describe la situación inicial.' },
        { title: 'Después', body: 'Describe la transformación.' },
      ]).slice(0, 2);
      const cw = (W - 2 * M - 60) / 2;
      return {
        name: 'Dos columnas',
        background: { type: 'effect', effect: 'aurora', overlayOpacity: 0.45 },
        transition: { type: 'push' },
        elements: [
          T(c.title ?? 'Comparativa', {
            name: 'Título',
            role: 'heading',
            x: M,
            y: 140,
            w: W - 2 * M,
            h: 130,
            size: 80,
            weight: 700,
            letterSpacing: -2,
            animation: anim('fade-up'),
          }),
          ...cols.flatMap((col, i) => {
            const x = M + i * (cw + 60);
            return [
              {
                type: 'shape',
                name: `Tarjeta ${i + 1}`,
                x,
                y: 330,
                w: cw,
                h: 600,
                style: {
                  fill: 'var(--lm-surface)',
                  radius: theme.radius,
                  backdropBlur: 24,
                  borderColor: 'rgba(255,255,255,0.12)',
                  borderWidth: 1,
                  shadow: { x: 0, y: 30, blur: 80, spread: 0, color: 'rgba(0,0,0,0.35)' },
                },
                animation: anim('fade-up', 200 + i * 200),
              } as ElementInput,
              T(col.title, {
                name: `Título columna ${i + 1}`,
                role: 'heading',
                x: x + 60,
                y: 390,
                w: cw - 120,
                h: 90,
                size: 52,
                weight: 700,
                color: i === 0 ? 'var(--lm-text)' : 'var(--lm-accent)',
                animation: anim('fade-up', 350 + i * 200),
              }),
              T(col.body, {
                name: `Texto columna ${i + 1}`,
                x: x + 60,
                y: 500,
                w: cw - 120,
                h: 380,
                size: 32,
                lineHeight: 1.5,
                color: 'var(--lm-muted)',
                animation: anim('fade-up', 450 + i * 200),
              }),
            ];
          }),
        ],
      };
    },
  },
  ...(['image-left', 'image-right'] as const).map<LayoutDef>((id) => ({
    id,
    name: id === 'image-left' ? 'Imagen a la izquierda' : 'Imagen a la derecha',
    description: `Imagen a sangre en la mitad ${id === 'image-left' ? 'izquierda' : 'derecha'} y texto al otro lado.`,
    build: (c, _theme) => {
      const left = id === 'image-left';
      const tx = left ? 1040 : M;
      return {
        name: left ? 'Imagen izquierda' : 'Imagen derecha',
        background: { type: 'color' },
        transition: { type: 'fade' },
        elements: [
          {
            type: 'image',
            name: 'Imagen',
            src: c.image ?? 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1600&q=80',
            x: left ? 0 : 960,
            y: 0,
            w: 960,
            h: H,
            kenBurns: true,
            style: { mask: left ? 'fade-right' : 'fade-left' },
            animation: anim('fade', 0, { duration: 1400 }),
          } as ElementInput,
          ...kicker(c.kicker, tx, 300),
          T(c.title ?? 'Una imagen vale más que mil palabras', {
            name: 'Título',
            role: 'heading',
            x: tx,
            y: 350,
            w: 760,
            h: 260,
            size: 72,
            weight: 700,
            lineHeight: 1.08,
            letterSpacing: -1.5,
            animation: anim(left ? 'fade-left' : 'fade-right', 200),
          }),
          T(c.body ?? c.subtitle ?? '', {
            name: 'Texto',
            x: tx,
            y: 630,
            w: 740,
            h: 240,
            size: 30,
            lineHeight: 1.5,
            color: 'var(--lm-muted)',
            animation: anim('fade-up', 450),
          }),
        ],
      };
    },
  })),
  {
    id: 'quote',
    name: 'Cita',
    description: 'Cita destacada con autor.',
    build: (c, _theme) => ({
      name: 'Cita',
      background: { type: 'effect', effect: 'spotlight', vignette: 0.5, grain: 0.1 },
      transition: { type: 'blur' },
      elements: [
        {
          type: 'icon',
          name: 'Comillas',
          icon: 'Quote',
          x: 900,
          y: 170,
          w: 120,
          h: 120,
          color: 'var(--lm-primary)',
          animation: anim('zoom-in', 0, { loop: 'float' }),
        } as ElementInput,
        T(c.quote ?? c.title ?? 'La simplicidad es la máxima sofisticación.', {
          name: 'Cita',
          role: 'heading',
          x: 220,
          y: 340,
          w: W - 440,
          h: 380,
          size: 68,
          weight: 500,
          italic: true,
          lineHeight: 1.25,
          align: 'center',
          valign: 'middle',
          animation: anim('blur-in', 200, { duration: 1400 }),
        }),
        T(c.author ? `— ${c.author}` : '', {
          name: 'Autor',
          x: 460,
          y: 770,
          w: 1000,
          h: 60,
          size: 28,
          weight: 600,
          letterSpacing: 4,
          transform: 'uppercase',
          color: 'var(--lm-accent)',
          align: 'center',
          animation: anim('fade-up', 900),
        }),
      ],
    }),
  },
  {
    id: 'stats',
    name: 'Cifras',
    description: 'Hasta 4 cifras grandes con etiqueta, en tarjetas.',
    build: (c, theme) => {
      const stats = (c.stats ?? [
        { value: '98%', label: 'Satisfacción' },
        { value: '3×', label: 'Más rápido' },
        { value: '24/7', label: 'Disponibilidad' },
      ]).slice(0, 4);
      const gap = 40;
      const cw = (W - 2 * M - gap * (stats.length - 1)) / stats.length;
      return {
        name: 'Cifras',
        background: { type: 'effect', effect: 'dots', vignette: 0.4 },
        transition: { type: 'zoom' },
        elements: [
          ...kicker(c.kicker, M, 170),
          T(c.title ?? 'Resultados que importan', {
            name: 'Título',
            role: 'heading',
            x: M,
            y: 220,
            w: W - 2 * M,
            h: 130,
            size: 80,
            weight: 700,
            letterSpacing: -2,
            animation: anim('fade-up'),
          }),
          ...stats.flatMap((s, i) => {
            const x = M + i * (cw + gap);
            return [
              {
                type: 'shape',
                name: `Tarjeta ${i + 1}`,
                x,
                y: 440,
                w: cw,
                h: 440,
                style: {
                  fill: 'var(--lm-surface)',
                  radius: theme.radius,
                  borderColor: 'rgba(255,255,255,0.10)',
                  borderWidth: 1,
                  backdropBlur: 20,
                },
                animation: anim('fade-up', 150 + i * 150),
              } as ElementInput,
              T(s.value, {
                name: `Cifra ${i + 1}`,
                role: 'heading',
                x: x + 30,
                y: 520,
                w: cw - 60,
                h: 180,
                size: stats.length > 3 ? 110 : 140,
                weight: 800,
                letterSpacing: -4,
                align: 'center',
                valign: 'middle',
                gradient: `linear-gradient(135deg, var(--lm-primary), var(--lm-accent))`,
                animation: anim('zoom-in', 300 + i * 150, { easing: 'spring' }),
              }),
              T(s.label, {
                name: `Etiqueta ${i + 1}`,
                x: x + 30,
                y: 730,
                w: cw - 60,
                h: 100,
                size: 30,
                align: 'center',
                color: 'var(--lm-muted)',
                animation: anim('fade-up', 450 + i * 150),
              }),
            ];
          }),
        ],
      };
    },
  },
  {
    id: 'features',
    name: 'Características',
    description: 'Hasta 4 tarjetas con icono animado, título y texto.',
    build: (c, theme) => {
      const items = (c.items ?? [
        { title: 'Rápido', text: 'Rendimiento excepcional en cada interacción.', icon: 'Zap' },
        { title: 'Seguro', text: 'Protección de nivel empresarial.', icon: 'ShieldCheck' },
        { title: 'Inteligente', text: 'Automatiza con IA lo repetitivo.', icon: 'BrainCircuit' },
      ]).slice(0, 4);
      const gap = 40;
      const cw = (W - 2 * M - gap * (items.length - 1)) / items.length;
      return {
        name: 'Características',
        background: { type: 'effect', effect: 'aurora', overlayOpacity: 0.5 },
        transition: { type: 'slide-up' },
        elements: [
          ...kicker(c.kicker, M, 130),
          T(c.title ?? '¿Por qué elegirnos?', {
            name: 'Título',
            role: 'heading',
            x: M,
            y: 180,
            w: W - 2 * M,
            h: 130,
            size: 80,
            weight: 700,
            letterSpacing: -2,
            animation: anim('fade-up'),
          }),
          ...items.flatMap((it, i) => {
            const x = M + i * (cw + gap);
            return [
              {
                type: 'shape',
                name: `Tarjeta ${i + 1}`,
                x,
                y: 390,
                w: cw,
                h: 540,
                style: {
                  fill: 'var(--lm-surface)',
                  radius: theme.radius,
                  backdropBlur: 24,
                  borderColor: 'rgba(255,255,255,0.12)',
                  borderWidth: 1,
                  shadow: { x: 0, y: 30, blur: 80, spread: 0, color: 'rgba(0,0,0,0.3)' },
                },
                animation: anim('fade-up', 150 + i * 150),
              } as ElementInput,
              {
                type: 'icon',
                name: `Icono ${i + 1}`,
                icon: it.icon ?? 'Sparkles',
                x: x + 50,
                y: 450,
                w: 110,
                h: 110,
                padding: 24,
                color: 'var(--lm-accent)',
                style: {
                  fill: 'linear-gradient(135deg, color-mix(in srgb, var(--lm-primary) 22%, transparent), color-mix(in srgb, var(--lm-accent) 14%, transparent))',
                  radius: Math.min(theme.radius, 36),
                  borderColor: 'rgba(255,255,255,0.15)',
                  borderWidth: 1,
                },
                animation: anim('zoom-in', 350 + i * 150, { easing: 'spring', loop: 'float', loopDuration: 4000 + i * 400 }),
              } as ElementInput,
              T(it.title, {
                name: `Título ${i + 1}`,
                role: 'heading',
                x: x + 50,
                y: 610,
                w: cw - 100,
                h: 80,
                size: 44,
                weight: 700,
                animation: anim('fade-up', 450 + i * 150),
              }),
              T(it.text ?? '', {
                name: `Texto ${i + 1}`,
                x: x + 50,
                y: 700,
                w: cw - 100,
                h: 200,
                size: 27,
                lineHeight: 1.5,
                color: 'var(--lm-muted)',
                animation: anim('fade-up', 550 + i * 150),
              }),
            ];
          }),
        ],
      };
    },
  },
  {
    id: 'timeline',
    name: 'Línea de tiempo',
    description: 'Hitos horizontales (items: title = fecha/fase, text = descripción). Cada hito aparece con un clic.',
    build: (c, _theme) => {
      const items = (c.items ?? [
        { title: '2024', text: 'Idea y validación' },
        { title: '2025', text: 'Lanzamiento' },
        { title: '2026', text: 'Expansión global' },
      ]).slice(0, 5);
      const span = W - 2 * M;
      const step = span / items.length;
      return {
        name: 'Línea de tiempo',
        background: { type: 'effect', effect: 'beams', overlayOpacity: 0.4 },
        transition: { type: 'slide' },
        elements: [
          T(c.title ?? 'Hoja de ruta', {
            name: 'Título',
            role: 'heading',
            x: M,
            y: 160,
            w: W - 2 * M,
            h: 130,
            size: 80,
            weight: 700,
            letterSpacing: -2,
            animation: anim('fade-up'),
          }),
          {
            type: 'shape',
            name: 'Línea',
            shape: 'line',
            x: M,
            y: 560,
            w: span,
            h: 4,
            style: { fill: `linear-gradient(90deg, var(--lm-primary), var(--lm-accent))` },
            animation: anim('reveal-left', 200, { duration: 1600 }),
          } as ElementInput,
          ...items.flatMap((it, i) => {
            const cx = M + step * i + step / 2;
            return [
              {
                type: 'shape',
                name: `Punto ${i + 1}`,
                shape: 'ellipse',
                x: cx - 18,
                y: 544,
                w: 36,
                h: 36,
                style: {
                  fill: 'var(--lm-bg)',
                  borderColor: 'var(--lm-accent)',
                  borderWidth: 6,
                  glow: 24,
                  glowColor: 'var(--lm-accent)',
                },
                animation: anim('zoom-in', 0, { step: i + 1, easing: 'spring', loop: 'pulse' }),
              } as ElementInput,
              T(it.title, {
                name: `Fecha ${i + 1}`,
                role: 'heading',
                x: cx - step / 2 + 20,
                y: 410,
                w: step - 40,
                h: 90,
                size: 52,
                weight: 700,
                align: 'center',
                color: 'var(--lm-accent)',
                animation: anim('fade-down', 100, { step: i + 1 }),
              }),
              T(it.text ?? '', {
                name: `Hito ${i + 1}`,
                x: cx - step / 2 + 20,
                y: 620,
                w: step - 40,
                h: 200,
                size: 28,
                lineHeight: 1.45,
                align: 'center',
                color: 'var(--lm-muted)',
                animation: anim('fade-up', 200, { step: i + 1 }),
              }),
            ];
          }),
        ],
      };
    },
  },
  {
    id: 'video-hero',
    name: 'Video de fondo',
    description: 'Video a pantalla completa con desenfoque, superposición oscura y título.',
    build: (c, _theme) => ({
      name: 'Video',
      background: {
        type: 'video',
        video: c.video ?? 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        blur: 6,
        brightness: 80,
        overlay: `linear-gradient(180deg, rgba(0,0,0,0.2) 0%, var(--lm-bg) 100%)`,
        overlayOpacity: 0.85,
        grain: 0.15,
        vignette: 0.4,
      },
      transition: { type: 'dissolve', duration: 1200, sound: 'whoosh' },
      elements: [
        ...kicker(c.kicker, M, 560),
        T(c.title ?? 'Una experiencia cinematográfica', {
          name: 'Título',
          role: 'heading',
          x: M,
          y: 610,
          w: 1500,
          h: 200,
          size: 104,
          weight: 700,
          lineHeight: 1.02,
          letterSpacing: -3,
          animation: anim('reveal-up', 300, { duration: 1300 }),
        }),
        T(c.subtitle ?? '', {
          name: 'Subtítulo',
          x: M,
          y: 830,
          w: 1200,
          h: 100,
          size: 34,
          color: 'var(--lm-muted)',
          animation: anim('fade-up', 700),
        }),
      ],
    }),
  },
  {
    id: 'big-number',
    name: 'Número gigante',
    description: 'Una sola cifra enorme con explicación (usar title = cifra, subtitle = explicación).',
    build: (c, _theme) => ({
      name: 'Cifra',
      background: { type: 'effect', effect: 'stars', vignette: 0.3 },
      transition: { type: 'zoom-out' },
      elements: [
        ...kicker(c.kicker, M, 230, 'center'),
        T(c.title ?? '10M', {
          name: 'Cifra',
          role: 'heading',
          x: M,
          y: 260,
          w: W - 2 * M,
          h: 420,
          size: 380,
          weight: 800,
          letterSpacing: -16,
          align: 'center',
          valign: 'middle',
          gradient: `linear-gradient(180deg, var(--lm-text) 30%, var(--lm-primary) 100%)`,
          animation: anim('zoom-out', 0, { duration: 1500, loop: 'breathe', loopDuration: 6000 }),
        }),
        T(c.subtitle ?? 'usuarios activos cada mes', {
          name: 'Explicación',
          x: 360,
          y: 720,
          w: W - 720,
          h: 120,
          size: 40,
          align: 'center',
          color: 'var(--lm-muted)',
          animation: anim('fade-up', 700),
        }),
      ],
    }),
  },
  {
    id: 'chart',
    name: 'Gráfico',
    description: 'Título, texto breve y un gráfico animado (usar content.chart con labels y series).',
    build: (c) => {
      const ch = c.chart ?? {
        kind: 'column' as const,
        labels: ['Q1', 'Q2', 'Q3', 'Q4'],
        series: [{ name: 'Ingresos', values: [24, 38, 47, 72] }],
      };
      const circular = ch.kind === 'donut' || ch.kind === 'pie';
      return {
        name: 'Gráfico',
        background: { type: 'effect', effect: 'grid', vignette: 0.45 },
        transition: { type: 'slide' },
        elements: [
          ...kicker(c.kicker, M, 150),
          T(c.title ?? 'Crecimiento sostenido', {
            name: 'Título',
            role: 'heading',
            x: M,
            y: 200,
            w: 620,
            h: 260,
            size: 72,
            weight: 700,
            lineHeight: 1.05,
            letterSpacing: -2,
            animation: anim('fade-up'),
          }),
          T(c.body ?? c.subtitle ?? '', {
            name: 'Texto',
            x: M,
            y: 500,
            w: 600,
            h: 300,
            size: 30,
            lineHeight: 1.5,
            color: 'var(--lm-muted)',
            animation: anim('fade-up', 250),
          }),
          {
            type: 'shape',
            name: 'Panel',
            x: 820,
            y: 150,
            w: 960,
            h: 780,
            style: {
              fill: 'var(--lm-surface)',
              radius: 32,
              backdropBlur: 24,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.12)',
            },
            animation: anim('fade', 100),
          } as ElementInput,
          {
            type: 'chart',
            name: 'Gráfico',
            chart: ch.kind ?? 'column',
            labels: ch.labels,
            series: ch.series.map((s) => ({ ...s, color: '' })),
            prefix: ch.prefix ?? '',
            suffix: ch.suffix ?? '',
            showLegend: ch.series.length > 1 || circular,
            x: 880,
            y: 210,
            w: 840,
            h: 660,
            fontSize: 24,
            animation: anim('fade', 200),
          } as ElementInput,
        ],
      };
    },
  },
  {
    id: 'table',
    name: 'Tabla',
    description: 'Título y una tabla comparativa (content.table: filas de celdas; la primera es el encabezado).',
    build: (c) => {
      const rows = c.table ?? [
        ['', 'Básico', 'Pro', 'Empresa'],
        ['Precio', '$9', '$29', 'A medida'],
        ['Usuarios', '1', '10', 'Ilimitados'],
        ['Soporte', 'Email', 'Prioritario', 'Dedicado'],
      ];
      const h = Math.min(640, 110 * rows.length);
      return {
        name: 'Tabla',
        background: { type: 'effect', effect: 'mesh', overlayOpacity: 0.55 },
        transition: { type: 'fade' },
        elements: [
          ...kicker(c.kicker, M, 140),
          T(c.title ?? 'Compara opciones', {
            name: 'Título',
            role: 'heading',
            x: M,
            y: 190,
            w: W - 2 * M,
            h: 130,
            size: 80,
            weight: 700,
            letterSpacing: -2,
            animation: anim('fade-up'),
          }),
          {
            type: 'table',
            name: 'Tabla',
            rows,
            firstColumn: true,
            highlightColumn: rows[0].length > 2 ? rows[0].length - 2 : -1,
            align: 'center',
            fontSize: 30,
            x: M,
            y: 380,
            w: W - 2 * M,
            h,
            style: { fill: 'var(--lm-surface)', radius: 24, backdropBlur: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
            animation: anim('fade', 200),
          } as ElementInput,
        ],
      };
    },
  },
  {
    id: 'code',
    name: 'Código',
    description: 'Título, explicación breve y un bloque de código resaltado que se escribe solo (content.code, content.language).',
    build: (c) => ({
      name: 'Código',
      background: { type: 'effect', effect: 'grid', overlayOpacity: 0.65 },
      transition: { type: 'fade' },
      elements: [
        ...kicker(c.kicker, M, 130),
        T(c.title ?? 'Así de simple', {
          name: 'Título',
          role: 'heading',
          x: M,
          y: 180,
          w: 620,
          h: 260,
          size: 72,
          weight: 700,
          letterSpacing: -2,
          animation: anim('fade-up'),
        }),
        T(c.body ?? c.subtitle ?? 'Unas pocas líneas bastan para ponerlo en marcha.', {
          name: 'Explicación',
          x: M,
          y: 470,
          w: 600,
          h: 300,
          size: 30,
          lineHeight: 1.5,
          color: 'var(--lm-muted)',
          animation: anim('fade-up', 150),
        }),
        {
          type: 'code',
          name: 'Código',
          code:
            c.code ??
            "import { createDeck } from 'lumen';\n\nconst deck = await createDeck({\n  theme: 'aurora',\n  slides: 12,\n});\n\ndeck.present();",
          language: c.language ?? 'typescript',
          typing: true,
          typingSpeed: 24,
          title: c.language ? `ejemplo.${{ typescript: 'ts', javascript: 'js', python: 'py', bash: 'sh' }[c.language] ?? c.language}` : 'ejemplo.ts',
          fontSize: 28,
          x: 820,
          y: 180,
          w: W - 820 - M,
          h: 700,
          style: { radius: 24, shadow: { x: 0, y: 40, blur: 100, spread: -10, color: 'rgba(0,0,0,0.55)' } },
          animation: anim('fade-up', 250),
        } as ElementInput,
      ],
    }),
  },
  {
    id: 'equation',
    name: 'Fórmula',
    description: 'Título y una fórmula matemática grande en LaTeX (content.tex) con una nota opcional (content.body).',
    build: (c) => ({
      name: 'Fórmula',
      background: { type: 'effect', effect: 'stars', overlayOpacity: 0.4 },
      transition: { type: 'zoom' },
      elements: [
        ...kicker(c.kicker, M, 150, 'center'),
        T(c.title ?? 'La idea en una ecuación', {
          name: 'Título',
          role: 'heading',
          x: M,
          y: 190,
          w: W - 2 * M,
          h: 110,
          size: 64,
          weight: 700,
          align: 'center',
          animation: anim('fade-up'),
        }),
        {
          type: 'math',
          name: 'Fórmula',
          tex: c.tex ?? 'e^{i\\pi} + 1 = 0',
          size: 110,
          x: M,
          y: 380,
          w: W - 2 * M,
          h: 300,
          animation: anim('zoom-in', 250, { easing: 'spring' }),
        } as ElementInput,
        T(c.body ?? '', {
          name: 'Nota',
          x: 360,
          y: 760,
          w: W - 720,
          h: 120,
          size: 30,
          align: 'center',
          color: 'var(--lm-muted)',
          animation: anim('fade', 600),
        }),
      ],
    }),
  },
  {
    id: 'closing',
    name: 'Cierre',
    description: 'Diapositiva final de agradecimiento con llamada a la acción.',
    build: (c, _theme) => ({
      name: 'Cierre',
      background: { type: 'effect', effect: 'aurora', grain: 0.1, vignette: 0.3 },
      transition: { type: 'circle', sound: 'chime' },
      elements: [
        T(c.title ?? '¡Gracias!', {
          name: 'Título',
          role: 'heading',
          x: M,
          y: 330,
          w: W - 2 * M,
          h: 240,
          size: 160,
          weight: 800,
          letterSpacing: -5,
          align: 'center',
          valign: 'middle',
          gradient: `linear-gradient(120deg, var(--lm-primary), var(--lm-accent))`,
          animation: anim('elastic', 0, { duration: 1400 }),
        }),
        T(c.subtitle ?? '', {
          name: 'Subtítulo',
          x: 360,
          y: 600,
          w: W - 720,
          h: 80,
          size: 34,
          align: 'center',
          color: 'var(--lm-muted)',
          animation: anim('fade-up', 500),
        }),
        ...(c.cta
          ? [
              {
                type: 'shape',
                name: 'Botón',
                x: 760,
                y: 730,
                w: 400,
                h: 96,
                style: {
                  fill: `linear-gradient(135deg, var(--lm-primary), var(--lm-accent))`,
                  radius: 48,
                  glow: 40,
                },
                animation: anim('zoom-in', 800, { easing: 'spring', loop: 'pulse' }),
              } as ElementInput,
              T(c.cta, {
                name: 'Texto botón',
                x: 760,
                y: 730,
                w: 400,
                h: 96,
                size: 30,
                weight: 700,
                align: 'center',
                valign: 'middle',
                color: '#ffffff',
                animation: anim('zoom-in', 800, { easing: 'spring', loop: 'pulse' }),
              }),
            ]
          : []),
      ],
    }),
  },
  {
    id: 'blank',
    name: 'En blanco',
    description: 'Diapositiva vacía con el fondo del tema.',
    build: () => ({ name: 'En blanco', background: { type: 'color' }, elements: [] }),
  },
];

export function getLayout(id: string): LayoutDef | undefined {
  return LAYOUTS.find((l) => l.id === id);
}

/** Construye una diapositiva a partir de una plantilla, omitiendo textos vacíos. */
export function buildLayout(id: string, content: LayoutContent, theme: Theme): SlideInput {
  const layout = getLayout(id) ?? LAYOUTS[LAYOUTS.length - 1];
  const slide = layout.build(content, theme);
  slide.elements = (slide.elements ?? []).filter(
    (e) => !(e.type === 'text' && (e as { html?: string }).html === ''),
  );
  return slide;
}
