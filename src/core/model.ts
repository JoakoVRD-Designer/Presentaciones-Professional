/**
 * Modelo de documento de Lumen.
 *
 * Los esquemas zod son la única fuente de verdad: definen los tipos de
 * TypeScript, los valores por defecto (un elemento parcial se completa al
 * parsearlo) y el JSON Schema que se entrega a las IAs que manipulan la app.
 */
import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Catálogos                                                           */
/* ------------------------------------------------------------------ */

export const ENTRANCES = [
  'none',
  'fade',
  'fade-up',
  'fade-down',
  'fade-left',
  'fade-right',
  'zoom-in',
  'zoom-out',
  'blur-in',
  'flip-x',
  'flip-y',
  'rotate-in',
  'bounce-in',
  'elastic',
  'drop',
  'slide-up',
  'slide-left',
  'slide-right',
  'reveal-left',
  'reveal-up',
  'typewriter',
  'glitch',
  'draw',
  'swing-in',
  'unfold',
] as const;

export const EXITS = [
  'none',
  'fade',
  'fade-up',
  'fade-down',
  'fade-left',
  'fade-right',
  'zoom-out',
  'zoom-in',
  'blur-out',
  'flip-out',
  'collapse',
  'slide-left',
  'slide-right',
  'drop-out',
] as const;

export const EMPHASES = ['none', 'pulse', 'shake', 'grow', 'shrink', 'spin', 'flash', 'bounce', 'wobble', 'jello', 'heartbeat', 'glow'] as const;

export const SPLITS = ['none', 'lines', 'words', 'chars'] as const;

export const CAMERAS = ['none', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down', 'drift', 'dolly'] as const;

export const LOOPS = [
  'none',
  'float',
  'pulse',
  'breathe',
  'spin',
  'bounce',
  'wiggle',
  'swing',
  'heartbeat',
  'glow',
  'shimmer',
  'gradient-shift',
] as const;

export const EASINGS = ['expo', 'ease-out', 'ease-in-out', 'spring', 'bounce', 'linear'] as const;

export const TRANSITIONS = [
  'none',
  'fade',
  'slide',
  'slide-up',
  'push',
  'zoom',
  'zoom-out',
  'blur',
  'flip',
  'cube',
  'wipe',
  'circle',
  'dissolve',
  'morph',
] as const;

export const SOUNDS = ['none', 'whoosh', 'swoosh', 'pop', 'chime', 'click', 'soft', 'rise'] as const;

export const BG_EFFECTS = [
  'aurora',
  'mesh',
  'grid',
  'dots',
  'stars',
  'spotlight',
  'beams',
  'waves',
  'noise',
  'particles',
  'bokeh',
  'liquid',
  'rays',
] as const;

export const SHAPES = [
  'rect',
  'ellipse',
  'triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'star',
  'arrow',
  'chevron',
  'cross',
  'blob',
  'line',
] as const;

export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'difference',
  'exclusion',
  'soft-light',
  'hard-light',
  'luminosity',
] as const;

export const MASKS = ['none', 'fade-bottom', 'fade-top', 'fade-left', 'fade-right', 'fade-edges', 'circle'] as const;

export const ELEMENT_TYPES = ['text', 'image', 'video', 'shape', 'icon', 'embed', 'chart', 'table', 'lottie', 'code', 'math', 'svg'] as const;

export const CODE_THEMES = ['auto', 'night', 'dracula', 'tokyo', 'solarized', 'github-light', 'paper'] as const;
export const CODE_LANGUAGES = [
  'javascript', 'typescript', 'python', 'json', 'html', 'css', 'bash', 'sql', 'java', 'go', 'rust', 'c', 'cpp',
  'csharp', 'php', 'ruby', 'swift', 'kotlin', 'yaml', 'markdown', 'dockerfile', 'diff', 'plaintext',
] as const;

export const CHART_KINDS = ['bar', 'column', 'line', 'area', 'donut', 'pie'] as const;

/* ------------------------------------------------------------------ */
/* Piezas reutilizables                                                */
/* ------------------------------------------------------------------ */

const num = (def: number, min = -100000, max = 100000) => z.number().min(min).max(max).default(def);

export const ShadowSchema = z
  .object({
    x: num(0),
    y: num(24),
    blur: num(64, 0, 500),
    spread: num(0),
    color: z.string().default('rgba(0,0,0,0.35)'),
  })
  .describe('Sombra paralela (box-shadow, o drop-shadow en formas recortadas).');

export const StyleSchema = z
  .object({
    fill: z
      .string()
      .default('transparent')
      .describe('Relleno: cualquier color CSS o degradado CSS (linear-gradient(...), radial-gradient(...)).'),
    borderColor: z.string().default('transparent'),
    borderWidth: num(0, 0, 200),
    borderStyle: z.enum(['solid', 'dashed', 'dotted']).default('solid'),
    radius: num(0, 0, 2000).describe('Radio de esquinas en px.'),
    shadow: ShadowSchema.nullable().default(null),
    glow: num(0, 0, 300).describe('Resplandor exterior en px (0 = sin brillo).'),
    glowColor: z.string().default('').describe('Color del resplandor; vacío = color primario del tema.'),
    blur: num(0, 0, 100).describe('Desenfoque del propio elemento (filter: blur) en px.'),
    backdropBlur: num(0, 0, 100).describe('Desenfoque de lo que hay detrás (efecto vidrio / glassmorphism) en px.'),
    brightness: num(100, 0, 300),
    contrast: num(100, 0, 300),
    saturate: num(100, 0, 300),
    hueRotate: num(0, -360, 360),
    grayscale: num(0, 0, 100),
    sepia: num(0, 0, 100),
    invert: num(0, 0, 100),
    blendMode: z.enum(BLEND_MODES).default('normal'),
    mask: z.enum(MASKS).default('none').describe('Máscara de desvanecido aplicada al elemento.'),
  })
  .describe('Estilo visual común a todos los elementos.');

export const AnimationSchema = z
  .object({
    entrance: z.enum(ENTRANCES).default('fade-up').describe('Animación de entrada.'),
    duration: num(900, 0, 10000).describe('Duración de la entrada en ms.'),
    delay: num(0, 0, 30000).describe('Retraso de la entrada en ms.'),
    easing: z.enum(EASINGS).default('expo'),
    step: z
      .number()
      .int()
      .min(0)
      .max(50)
      .default(0)
      .describe('0 = aparece con la diapositiva; n = aparece en el clic número n (builds).'),
    loop: z.enum(LOOPS).default('none').describe('Animación continua en bucle tras la entrada.'),
    loopDuration: num(3000, 200, 60000),
    split: z
      .enum(SPLITS)
      .default('none')
      .describe('Texto cinético: anima por líneas, palabras o letras (solo texto).'),
    stagger: num(60, 0, 2000).describe('Retraso entre piezas del texto cinético en ms.'),
    countUp: z.boolean().default(false).describe('Las cifras del texto cuentan desde 0 al aparecer.'),
    exit: z.enum(EXITS).default('none').describe('Animación de salida.'),
    exitStep: z.number().int().min(0).max(50).default(0).describe('Clic en el que el elemento sale (0 = nunca).'),
    exitDuration: num(600, 50, 10000),
    emphasis: z.enum(EMPHASES).default('none').describe('Animación de énfasis (una vez).'),
    emphasisStep: z.number().int().min(0).max(50).default(0).describe('Clic en el que se enfatiza (0 = nunca).'),
    move: z
      .object({
        step: z.number().int().min(0).max(50).default(0).describe('Clic en el que se mueve (0 = nunca).'),
        x: num(0).describe('Desplazamiento horizontal en px.'),
        y: num(0).describe('Desplazamiento vertical en px.'),
        scale: num(1, 0.05, 20),
        rotate: num(0, -3600, 3600),
        duration: num(1000, 50, 20000),
      })
      .prefault({})
      .describe('Trayectoria de movimiento: el elemento se desplaza/escala/gira en un clic.'),
  })
  .describe('Animaciones del elemento.');

const baseFields = {
  id: z.string().min(1).optional().describe('Identificador único. Si se omite se genera automáticamente.'),
  name: z.string().default('').describe('Nombre legible para la capa.'),
  x: num(160).describe('Posición X en px dentro de un lienzo de 1920×1080.'),
  y: num(160).describe('Posición Y en px.'),
  w: num(640, 1).describe('Ancho en px.'),
  h: num(200, 1).describe('Alto en px.'),
  rotation: num(0, -3600, 3600).describe('Rotación en grados.'),
  opacity: z.number().min(0).max(1).default(1),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  link: z.string().default('').describe('URL externa o "#3" para saltar a la diapositiva 3 al hacer clic.'),
  morph: z
    .string()
    .default('')
    .describe(
      'Clave Morph: con la transición "morph", los elementos con la misma clave (o el mismo nombre) en diapositivas consecutivas se animan de una posición/tamaño a otra. Al duplicar una diapositiva se enlaza solo.',
    ),
  group: z.string().default('').describe('Id de grupo: los elementos con el mismo grupo se seleccionan y mueven juntos.'),
  style: StyleSchema.prefault({}),
  animation: AnimationSchema.prefault({}),
};

export const TextElementSchema = z
  .object({
    ...baseFields,
    type: z.literal('text'),
    html: z
      .string()
      .default('Escribe algo increíble')
      .describe(
        'Contenido. Admite HTML simple: <b>, <i>, <u>, <s>, <br>, <span style="color:...">, <a href>, <ul>/<ol>/<li>, <p>. También texto plano.',
      ),
    role: z
      .enum(['heading', 'body'])
      .default('body')
      .describe('Determina la fuente del tema usada si "font" está vacío.'),
    font: z.string().default('').describe('Familia tipográfica; vacío = la del tema.'),
    size: num(40, 4, 600).describe('Tamaño de fuente en px.'),
    weight: num(400, 100, 900),
    color: z.string().default('').describe('Color del texto; vacío = color de texto del tema.'),
    gradient: z.string().default('').describe('Degradado CSS aplicado al texto (texto con degradado).'),
    align: z.enum(['left', 'center', 'right', 'justify']).default('left'),
    valign: z.enum(['top', 'middle', 'bottom']).default('top'),
    lineHeight: num(1.2, 0.5, 4),
    letterSpacing: num(0, -20, 100).describe('Espaciado entre letras en px.'),
    italic: z.boolean().default(false),
    underline: z.boolean().default(false),
    transform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).default('none'),
    padding: num(0, 0, 400),
    textShadow: z.string().default('').describe('text-shadow CSS opcional.'),
    stroke: z.string().default('').describe('Contorno del texto, p. ej. "2px #fff" (webkit-text-stroke).'),
  })
  .describe('Bloque de texto.');

export const ImageElementSchema = z
  .object({
    ...baseFields,
    type: z.literal('image'),
    src: z.string().default('').describe('URL de la imagen (http(s), /assets/... o data:).'),
    alt: z.string().default(''),
    fit: z.enum(['cover', 'contain', 'fill']).default('cover'),
    position: z.string().default('center').describe('object-position CSS.'),
    kenBurns: z.boolean().default(false).describe('Zoom lento cinematográfico.'),
  })
  .describe('Imagen.');

export const VideoElementSchema = z
  .object({
    ...baseFields,
    type: z.literal('video'),
    src: z.string().default('').describe('URL de video MP4/WebM.'),
    poster: z.string().default(''),
    fit: z.enum(['cover', 'contain', 'fill']).default('cover'),
    autoplay: z.boolean().default(true),
    loop: z.boolean().default(true),
    muted: z.boolean().default(true),
    controls: z.boolean().default(false),
    playbackRate: num(1, 0.1, 4),
  })
  .describe('Video incrustado en la diapositiva.');

export const ShapeElementSchema = z
  .object({
    ...baseFields,
    type: z.literal('shape'),
    shape: z.enum(SHAPES).default('rect'),
  })
  .describe('Forma geométrica. Su color se define con style.fill (admite degradados).');

export const IconElementSchema = z
  .object({
    ...baseFields,
    type: z.literal('icon'),
    icon: z
      .string()
      .default('Sparkles')
      .describe('Nombre de icono Lucide en PascalCase (p. ej. "Rocket", "ChartLine", "ShieldCheck").'),
    color: z.string().default('').describe('Color del trazo; vacío = color primario del tema.'),
    strokeWidth: num(1.75, 0.25, 6),
    padding: num(0, 0, 400),
  })
  .describe('Icono vectorial (biblioteca Lucide).');

export const EmbedElementSchema = z
  .object({
    ...baseFields,
    type: z.literal('embed'),
    url: z.string().default('').describe('URL para incrustar en un iframe (YouTube embed, mapas, sitios, etc.).'),
    interactive: z.boolean().default(true),
  })
  .describe('Contenido web incrustado (iframe).');

export const ChartSeriesSchema = z.object({
  name: z.string().default('Serie'),
  values: z.array(z.number()).default([]),
  color: z.string().default('').describe('Color de la serie; vacío = paleta del tema.'),
});

export const ChartElementSchema = z
  .object({
    ...baseFields,
    type: z.literal('chart'),
    chart: z
      .enum(CHART_KINDS)
      .default('column')
      .describe('column = barras verticales, bar = horizontales, line, area, donut, pie.'),
    labels: z.array(z.string()).default(['Ene', 'Feb', 'Mar', 'Abr']).describe('Categorías (eje X o sectores).'),
    series: z
      .array(ChartSeriesSchema)
      .default([{ name: 'Serie 1', values: [12, 19, 14, 26], color: '' }])
      .describe('Una o más series; en donut/pie solo se usa la primera.'),
    showValues: z.boolean().default(true),
    showGrid: z.boolean().default(true),
    showLegend: z.boolean().default(false),
    smooth: z.boolean().default(true).describe('Curvas suaves en line/area.'),
    fontSize: num(22, 8, 80),
    textColor: z.string().default('').describe('Color de etiquetas; vacío = color secundario del tema.'),
    prefix: z.string().default('').describe('Prefijo de valores, p. ej. "$".'),
    suffix: z.string().default('').describe('Sufijo de valores, p. ej. "%".'),
    thickness: num(0.62, 0.1, 1).describe('Grosor relativo de barras / anillo.'),
  })
  .describe('Gráfico de datos animado (SVG).');

export const TableElementSchema = z
  .object({
    ...baseFields,
    type: z.literal('table'),
    rows: z
      .array(z.array(z.string()))
      .default([
        ['Plan', 'Precio', 'Usuarios'],
        ['Básico', '$9', '1'],
        ['Pro', '$29', '10'],
        ['Empresa', 'A medida', 'Ilimitados'],
      ])
      .describe('Celdas por filas; admite HTML simple (<b>, <i>, <span style="color">).'),
    header: z.boolean().default(true).describe('La primera fila es encabezado.'),
    firstColumn: z.boolean().default(false).describe('Resaltar la primera columna.'),
    striped: z.boolean().default(true),
    fontSize: num(26, 8, 120),
    align: z.enum(['left', 'center', 'right']).default('left'),
    textColor: z.string().default(''),
    headerFill: z.string().default('').describe('Fondo del encabezado; vacío = primario del tema.'),
    headerColor: z.string().default('#ffffff'),
    lineColor: z.string().default('').describe('Color de líneas; vacío = sutil automático.'),
    highlightColumn: z.number().int().default(-1).describe('Índice de columna a destacar (-1 = ninguna).'),
  })
  .describe('Tabla de datos.');

export const LottieElementSchema = z
  .object({
    ...baseFields,
    type: z.literal('lottie'),
    src: z.string().default('').describe('URL de una animación Lottie (.json), p. ej. de LottieFiles.'),
    loop: z.boolean().default(true),
    speed: num(1, 0.1, 5),
  })
  .describe('Animación vectorial Lottie (After Effects / LottieFiles).');

export const CodeElementSchema = z
  .object({
    ...baseFields,
    type: z.literal('code'),
    code: z
      .string()
      .default("function saludar(nombre) {\n  const hora = new Date().getHours();\n  return `Hola, ${nombre} 👋`;\n}\n\nsaludar('Lumen');")
      .describe('Código fuente (texto plano).'),
    language: z.string().default('javascript').describe(`Lenguaje del resaltado: ${CODE_LANGUAGES.join(', ')}.`),
    theme: z.enum(CODE_THEMES).default('auto').describe('Paleta del código; "auto" sigue los colores del tema.'),
    fontSize: num(26, 8, 120),
    lineNumbers: z.boolean().default(true),
    title: z.string().default('').describe('Nombre de archivo o título en la barra de la ventana.'),
    chrome: z.boolean().default(true).describe('Mostrar la barra de ventana con los tres botones.'),
    highlight: z.string().default('').describe('Líneas destacadas, p. ej. "2,4-6"; el resto se atenúa.'),
    typing: z.boolean().default(false).describe('Efecto máquina de escribir al aparecer (presentación y video).'),
    typingSpeed: num(32, 4, 400).describe('Milisegundos por carácter del efecto de escritura.'),
  })
  .describe('Bloque de código con resaltado de sintaxis.');

export const MathElementSchema = z
  .object({
    ...baseFields,
    type: z.literal('math'),
    tex: z.string().default('e^{i\\pi} + 1 = 0').describe('Fórmula en LaTeX (KaTeX).'),
    size: num(72, 8, 400).describe('Tamaño de fuente en px.'),
    color: z.string().default('').describe('Color; vacío = texto del tema.'),
    align: z.enum(['left', 'center', 'right']).default('center'),
    display: z.boolean().default(true).describe('Estilo de bloque (fracciones y sumatorios grandes).'),
  })
  .describe('Fórmula matemática.');

export const SvgElementSchema = z
  .object({
    ...baseFields,
    type: z.literal('svg'),
    svg: z
      .string()
      .default(
        '<svg viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--lm-primary)"/><stop offset="1" stop-color="var(--lm-accent)"/></linearGradient></defs><circle cx="100" cy="100" r="70" fill="url(#g)" opacity="0.9"/><path d="M60 110 L90 140 L145 75" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      )
      .describe('Marcado SVG (se sanea: sin scripts ni recursos externos). Usa currentColor o var(--lm-primary)/var(--lm-accent).'),
    color: z.string().default('').describe('Color de currentColor; vacío = primario del tema.'),
    fit: z.enum(['contain', 'cover', 'fill']).default('contain'),
  })
  .describe('Ilustración vectorial SVG.');

export const ElementSchema = z.discriminatedUnion('type', [
  TextElementSchema,
  ImageElementSchema,
  VideoElementSchema,
  ShapeElementSchema,
  IconElementSchema,
  EmbedElementSchema,
  ChartElementSchema,
  TableElementSchema,
  LottieElementSchema,
  CodeElementSchema,
  MathElementSchema,
  SvgElementSchema,
]);

export const BackgroundSchema = z
  .object({
    type: z.enum(['color', 'gradient', 'image', 'video', 'effect']).default('color'),
    color: z.string().default('').describe('Color base; vacío = fondo del tema. Se pinta siempre debajo de todo.'),
    gradient: z.string().default('linear-gradient(135deg, #0b1020 0%, #312e81 100%)'),
    image: z.string().default('').describe('URL de imagen de fondo.'),
    video: z.string().default('').describe('URL de video de fondo (MP4/WebM), se reproduce en bucle y silenciado.'),
    poster: z.string().default(''),
    effect: z.enum(BG_EFFECTS).default('aurora').describe('Fondo animado generativo.'),
    effectColors: z
      .array(z.string())
      .default([])
      .describe('Colores del efecto; vacío = colores del tema.'),
    effectSpeed: num(1, 0.1, 5),
    fit: z.enum(['cover', 'contain']).default('cover'),
    position: z.string().default('center'),
    kenBurns: z.boolean().default(false),
    playbackRate: num(1, 0.1, 4),
    blur: num(0, 0, 80).describe('Desenfoque del fondo (imagen/video/efecto) en px.'),
    brightness: num(100, 0, 300),
    saturate: num(100, 0, 300),
    hueRotate: num(0, -360, 360),
    overlay: z.string().default('#000000').describe('Color o degradado superpuesto al fondo.'),
    overlayOpacity: z.number().min(0).max(1).default(0),
    grain: z.number().min(0).max(1).default(0).describe('Grano de película (0-1).'),
    vignette: z.number().min(0).max(1).default(0).describe('Viñeta oscura en bordes (0-1).'),
  })
  .describe('Fondo de una diapositiva.');

export const TransitionSchema = z
  .object({
    type: z.enum(TRANSITIONS).default('fade'),
    duration: num(800, 0, 5000),
    sound: z.enum(SOUNDS).default('none'),
  })
  .describe('Transición al entrar en la diapositiva.');

export const SlideSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().default(''),
    background: BackgroundSchema.prefault({}),
    transition: TransitionSchema.prefault({}),
    elements: z.array(ElementSchema).default([]),
    notes: z.string().default('').describe('Notas del orador.'),
    duration: num(0, 0, 3600).describe('Avance automático en segundos (0 = manual).'),
    hidden: z.boolean().default(false),
    camera: z.enum(CAMERAS).default('none').describe('Movimiento de cámara cinematográfico lento durante la diapositiva.'),
    cameraDuration: num(14000, 1000, 120000),
    narration: z
      .object({
        src: z.string().default('').describe('Audio de narración (se reproduce al entrar).'),
        volume: z.number().min(0).max(1).default(1),
        advance: z.boolean().default(false).describe('Pasar a la siguiente diapositiva al terminar la narración.'),
      })
      .prefault({}),
    hideMaster: z.boolean().default(false).describe('Ocultar los elementos de la diapositiva maestra.'),
  })
  .describe('Diapositiva.');

export const ThemeSchema = z
  .object({
    id: z.string().default('custom'),
    name: z.string().default('Personalizado'),
    fonts: z
      .object({
        heading: z.string().default('Sora'),
        body: z.string().default('Inter'),
      })
      .prefault({}),
    colors: z
      .object({
        background: z.string().default('#0b0d17'),
        surface: z.string().default('rgba(255,255,255,0.06)'),
        text: z.string().default('#f5f7ff'),
        muted: z.string().default('#9aa3c7'),
        primary: z.string().default('#7c5cff'),
        accent: z.string().default('#22d3ee'),
      })
      .prefault({}),
    radius: num(24, 0, 200),
  })
  .describe('Tema visual: tipografías y paleta.');

export const SettingsSchema = z
  .object({
    loop: z.boolean().default(false),
    autoAdvance: num(0, 0, 3600).describe('Segundos de avance automático global (0 = manual).'),
    progress: z.enum(['bar', 'dots', 'none']).default('bar'),
    slideNumbers: z.boolean().default(false),
    sounds: z.boolean().default(true).describe('Reproducir sonidos de transición en modo presentación.'),
    controls: z.boolean().default(true),
    music: z
      .object({
        src: z.string().default('').describe('Música de fondo de toda la presentación.'),
        volume: z.number().min(0).max(1).default(0.5),
        loop: z.boolean().default(true),
      })
      .prefault({}),
  })
  .describe('Ajustes de reproducción.');

export const PresentationSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().default('Presentación sin título'),
  width: z.number().default(1920),
  height: z.number().default(1080),
  rev: z.number().int().default(0),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  theme: ThemeSchema.prefault({}),
  settings: SettingsSchema.prefault({}),
  slides: z.array(SlideSchema).default([]),
  master: SlideSchema.optional().describe(
    'Diapositiva maestra: sus elementos (logo, pie, numeración con {n}/{total}/{title}/{date}) aparecen en todas las diapositivas.',
  ),
});

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

type WithId<T> = Omit<T, 'id'> & { id: string };

export type Shadow = z.infer<typeof ShadowSchema>;
export type ElementStyle = z.infer<typeof StyleSchema>;
export type ElementAnimation = z.infer<typeof AnimationSchema>;
export type TextElement = WithId<z.infer<typeof TextElementSchema>>;
export type ImageElement = WithId<z.infer<typeof ImageElementSchema>>;
export type VideoElement = WithId<z.infer<typeof VideoElementSchema>>;
export type ShapeElement = WithId<z.infer<typeof ShapeElementSchema>>;
export type IconElement = WithId<z.infer<typeof IconElementSchema>>;
export type EmbedElement = WithId<z.infer<typeof EmbedElementSchema>>;
export type ChartElement = WithId<z.infer<typeof ChartElementSchema>>;
export type ChartKind = (typeof CHART_KINDS)[number];
export type TableElement = WithId<z.infer<typeof TableElementSchema>>;
export type LottieElement = WithId<z.infer<typeof LottieElementSchema>>;
export type CodeElement = WithId<z.infer<typeof CodeElementSchema>>;
export type MathElement = WithId<z.infer<typeof MathElementSchema>>;
export type SvgElement = WithId<z.infer<typeof SvgElementSchema>>;
export type CodeTheme = (typeof CODE_THEMES)[number];
export type SlideElement =
  | TextElement
  | ImageElement
  | VideoElement
  | ShapeElement
  | IconElement
  | EmbedElement
  | ChartElement
  | TableElement
  | LottieElement
  | CodeElement
  | MathElement
  | SvgElement;
export type ElementType = SlideElement['type'];
export type ElementInput = z.input<typeof ElementSchema>;
export type Background = z.infer<typeof BackgroundSchema>;
export type Transition = z.infer<typeof TransitionSchema>;
export type Slide = Omit<WithId<z.infer<typeof SlideSchema>>, 'elements'> & { elements: SlideElement[] };
export type SlideInput = z.input<typeof SlideSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type Presentation = Omit<WithId<z.infer<typeof PresentationSchema>>, 'slides' | 'master'> & {
  slides: Slide[];
  master?: Slide;
};
export type PresentationInput = z.input<typeof PresentationSchema>;

export type EntranceType = (typeof ENTRANCES)[number];
export type ExitType = (typeof EXITS)[number];
export type EmphasisType = (typeof EMPHASES)[number];
export type CameraType = (typeof CAMERAS)[number];
export type LoopType = (typeof LOOPS)[number];
export type TransitionType = (typeof TRANSITIONS)[number];
export type SoundName = (typeof SOUNDS)[number];
export type BgEffect = (typeof BG_EFFECTS)[number];
export type ShapeKind = (typeof SHAPES)[number];

/* ------------------------------------------------------------------ */
/* Ids y normalización                                                 */
/* ------------------------------------------------------------------ */

const ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789';
export function uid(prefix = ''): string {
  let out = '';
  const bytes =
    typeof crypto !== 'undefined' && 'getRandomValues' in crypto
      ? crypto.getRandomValues(new Uint8Array(10))
      : Uint8Array.from({ length: 10 }, () => Math.floor(Math.random() * 256));
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return prefix ? `${prefix}_${out}` : out;
}

export function makeElement(input: ElementInput): SlideElement {
  const parsed = ElementSchema.parse(input);
  return { ...parsed, id: parsed.id ?? uid('el') } as SlideElement;
}

export function makeSlide(input: SlideInput = {}): Slide {
  const parsed = SlideSchema.parse(input);
  return {
    ...parsed,
    id: parsed.id ?? uid('sl'),
    elements: parsed.elements.map((e) => ({ ...e, id: e.id ?? uid('el') }) as SlideElement),
  };
}

export function makePresentation(input: PresentationInput = {}): Presentation {
  const parsed = PresentationSchema.parse(input);
  const now = new Date().toISOString();
  return {
    ...parsed,
    id: parsed.id ?? uid('pr'),
    createdAt: parsed.createdAt ?? now,
    updatedAt: parsed.updatedAt ?? now,
    slides: parsed.slides.map((s) => makeSlide(s)),
    master: parsed.master ? makeSlide({ ...parsed.master, id: 'master' }) : undefined,
  };
}

/** Valida y completa un documento entrante (p. ej. JSON importado). */
export function normalizePresentation(input: unknown): Presentation {
  return makePresentation(input as PresentationInput);
}
