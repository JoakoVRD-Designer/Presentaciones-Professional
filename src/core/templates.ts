import { applyCommands, type Command } from './commands';
import { makePresentation, type Presentation } from './model';

export interface TemplateDef {
  id: string;
  name: string;
  description: string;
  commands: Command[];
}

const showcase: Command[] = [
  { op: 'theme.set', preset: 'aurora' },
  {
    op: 'slide.add',
    layout: 'title',
    content: {
      kicker: 'Lumen Slides',
      title: 'Presentaciones que se sienten vivas',
      subtitle: 'HTML, video, efectos y animaciones — editables a mano o por inteligencia artificial.',
    },
  },
  {
    op: 'slide.add',
    layout: 'features',
    content: {
      kicker: 'Todo es editable',
      title: 'Diseña sin límites',
      items: [
        { title: 'Efectos', text: 'Desenfoque, vidrio, brillo, máscaras y mezclas.', icon: 'Wand' },
        { title: 'Movimiento', text: '20+ entradas, bucles y transiciones 3D.', icon: 'Orbit' },
        { title: 'IA nativa', text: 'Una API de comandos para que una IA construya contigo.', icon: 'BrainCircuit' },
      ],
    },
  },
  {
    op: 'slide.add',
    layout: 'video-hero',
    content: {
      kicker: 'Video de fondo',
      title: 'Cinematográfico por defecto',
      subtitle: 'Fondos en video con desenfoque, viñeta, grano y superposiciones.',
    },
  },
  {
    op: 'slide.add',
    layout: 'stats',
    content: {
      kicker: 'Impacto',
      title: 'Cifras que se recuerdan',
      stats: [
        { value: '20+', label: 'Animaciones de entrada' },
        { value: '13', label: 'Transiciones' },
        { value: '9', label: 'Fondos generativos' },
      ],
    },
  },
  {
    op: 'slide.add',
    layout: 'chart',
    content: {
      kicker: 'Datos',
      title: 'Gráficos que se animan',
      body: 'Columnas, barras, líneas, áreas, donas y tartas. Pega tus datos desde Excel o Sheets.',
      chart: {
        kind: 'area',
        labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'],
        series: [
          { name: 'Usuarios', values: [12, 19, 17, 28, 36, 49] },
          { name: 'Ingresos', values: [6, 9, 12, 15, 22, 31] },
        ],
        suffix: 'k',
      },
    },
  },
  {
    op: 'slide.add',
    layout: 'bullets',
    content: {
      kicker: 'Builds',
      title: 'Revela ideas paso a paso',
      bullets: [
        'Cada viñeta aparece con un clic',
        'Controla duración, retraso y curva de cada animación',
        'Notas del orador, avance automático y sonidos',
        'Exporta un único archivo HTML que funciona en cualquier navegador',
      ],
    },
  },
  {
    op: 'slide.add',
    layout: 'quote',
    content: {
      quote: 'El diseño no es solo cómo se ve. El diseño es cómo funciona.',
      author: 'Steve Jobs',
    },
  },
  {
    op: 'slide.add',
    layout: 'closing',
    content: { title: '¡Empieza a crear!', subtitle: 'Pulsa ⌘K para ver todos los comandos.', cta: 'Presentar ▶' },
  },
];

const pitch: Command[] = [
  { op: 'theme.set', preset: 'sunset' },
  {
    op: 'slide.add',
    layout: 'title',
    content: { kicker: 'Ronda semilla', title: 'Nombre de tu startup', subtitle: 'Una frase que explique qué haces y para quién.' },
  },
  {
    op: 'slide.add',
    layout: 'image-right',
    content: {
      kicker: 'El problema',
      title: 'Algo que duele de verdad',
      body: 'Describe el problema con datos concretos y una historia breve.',
      image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1600&q=80',
    },
  },
  {
    op: 'slide.add',
    layout: 'features',
    content: {
      kicker: 'La solución',
      title: 'Cómo lo resolvemos',
      items: [
        { title: 'Simple', text: 'Explica el primer beneficio.', icon: 'Sparkles' },
        { title: 'Escalable', text: 'Explica el segundo beneficio.', icon: 'TrendingUp' },
        { title: 'Rentable', text: 'Explica el tercer beneficio.', icon: 'PiggyBank' },
      ],
    },
  },
  {
    op: 'slide.add',
    layout: 'stats',
    content: {
      kicker: 'Tracción',
      title: 'Crecimiento real',
      stats: [
        { value: '12k', label: 'Usuarios' },
        { value: '+38%', label: 'Crecimiento mensual' },
        { value: '$90k', label: 'MRR' },
      ],
    },
  },
  {
    op: 'slide.add',
    layout: 'timeline',
    content: {
      title: 'Hoja de ruta',
      items: [
        { title: 'Q1', text: 'Lanzamiento público' },
        { title: 'Q2', text: 'Integraciones clave' },
        { title: 'Q3', text: 'Expansión LATAM' },
        { title: 'Q4', text: 'Serie A' },
      ],
    },
  },
  { op: 'slide.add', layout: 'closing', content: { title: 'Hablemos', subtitle: 'tu@email.com', cta: 'Invertir' } },
];

export const TEMPLATES: TemplateDef[] = [
  { id: 'showcase', name: 'Demostración Lumen', description: 'Recorrido por las capacidades del editor.', commands: showcase },
  { id: 'pitch', name: 'Pitch de startup', description: 'Estructura clásica para inversores.', commands: pitch },
  {
    id: 'blank',
    name: 'En blanco',
    description: 'Una diapositiva de portada para empezar desde cero.',
    commands: [
      { op: 'theme.set', preset: 'aurora' },
      { op: 'slide.add', layout: 'title', content: { title: 'Título de la presentación', subtitle: 'Subtítulo' } },
    ],
  },
];

export function createFromTemplate(templateId = 'showcase', title?: string): Presentation {
  const tpl = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
  const base = makePresentation({ title: title ?? (tpl.id === 'blank' ? 'Presentación sin título' : tpl.name) });
  return applyCommands(base, tpl.commands).doc;
}
