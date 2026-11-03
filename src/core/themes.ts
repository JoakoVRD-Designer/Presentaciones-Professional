import type { Theme } from './model';

export const THEMES: Theme[] = [
  {
    id: 'aurora',
    name: 'Aurora Nocturna',
    fonts: { heading: 'Sora', body: 'Inter' },
    colors: {
      background: '#07080f',
      surface: 'rgba(255,255,255,0.06)',
      text: '#f4f6ff',
      muted: '#9aa3c7',
      primary: '#7c5cff',
      accent: '#22d3ee',
    },
    radius: 28,
  },
  {
    id: 'noir',
    name: 'Noir Editorial',
    fonts: { heading: 'Playfair Display', body: 'Inter' },
    colors: {
      background: '#0a0a0a',
      surface: 'rgba(255,255,255,0.05)',
      text: '#fafafa',
      muted: '#a3a3a3',
      primary: '#fafafa',
      accent: '#d4af37',
    },
    radius: 4,
  },
  {
    id: 'sunset',
    name: 'Atardecer',
    fonts: { heading: 'Outfit', body: 'Inter' },
    colors: {
      background: '#1a0b14',
      surface: 'rgba(255,255,255,0.07)',
      text: '#fff5ef',
      muted: '#d9a9a0',
      primary: '#ff6b4a',
      accent: '#ffc857',
    },
    radius: 32,
  },
  {
    id: 'ocean',
    name: 'Océano Profundo',
    fonts: { heading: 'Space Grotesk', body: 'Inter' },
    colors: {
      background: '#03141f',
      surface: 'rgba(255,255,255,0.06)',
      text: '#eaf8ff',
      muted: '#8fb3c4',
      primary: '#00b4d8',
      accent: '#90e0ef',
    },
    radius: 20,
  },
  {
    id: 'neon',
    name: 'Neón Cyber',
    fonts: { heading: 'Space Grotesk', body: 'JetBrains Mono' },
    colors: {
      background: '#05010d',
      surface: 'rgba(255,0,170,0.08)',
      text: '#f6f0ff',
      muted: '#a78bfa',
      primary: '#ff2bd6',
      accent: '#00f5d4',
    },
    radius: 12,
  },
  {
    id: 'forest',
    name: 'Bosque',
    fonts: { heading: 'Fraunces', body: 'Inter' },
    colors: {
      background: '#0b1410',
      surface: 'rgba(255,255,255,0.06)',
      text: '#f1f7ef',
      muted: '#9db5a3',
      primary: '#4ade80',
      accent: '#facc15',
    },
    radius: 24,
  },
  {
    id: 'paper',
    name: 'Papel',
    fonts: { heading: 'DM Serif Display', body: 'Inter' },
    colors: {
      background: '#f7f3ec',
      surface: 'rgba(20,20,20,0.05)',
      text: '#1b1916',
      muted: '#6b645a',
      primary: '#c2410c',
      accent: '#1d4ed8',
    },
    radius: 16,
  },
  {
    id: 'swiss',
    name: 'Suizo',
    fonts: { heading: 'Inter', body: 'Inter' },
    colors: {
      background: '#ffffff',
      surface: '#f2f2f2',
      text: '#0a0a0a',
      muted: '#6b6b6b',
      primary: '#e10600',
      accent: '#0a0a0a',
    },
    radius: 0,
  },
];

export const FONTS = [
  'Inter',
  'Sora',
  'Outfit',
  'Space Grotesk',
  'Manrope',
  'Plus Jakarta Sans',
  'Playfair Display',
  'DM Serif Display',
  'Fraunces',
  'Instrument Serif',
  'Bebas Neue',
  'Syne',
  'JetBrains Mono',
] as const;

export const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?' +
  [
    'Inter:ital,wght@0,300..900;1,300..900',
    'Sora:wght@300..800',
    'Outfit:wght@300..900',
    'Space+Grotesk:wght@300..700',
    'Manrope:wght@300..800',
    'Plus+Jakarta+Sans:ital,wght@0,300..800;1,300..800',
    'Playfair+Display:ital,wght@0,400..900;1,400..900',
    'DM+Serif+Display:ital@0;1',
    'Fraunces:ital,wght@0,300..900;1,300..900',
    'Instrument+Serif:ital@0;1',
    'Bebas+Neue',
    'Syne:wght@400..800',
    'JetBrains+Mono:wght@300..700',
  ]
    .map((f) => `family=${f}`)
    .join('&') +
  '&display=swap';

export function getTheme(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

export const GRADIENT_PRESETS = [
  'linear-gradient(135deg, #7c5cff 0%, #22d3ee 100%)',
  'linear-gradient(135deg, #ff6b4a 0%, #ffc857 100%)',
  'linear-gradient(135deg, #ff2bd6 0%, #7c5cff 100%)',
  'linear-gradient(135deg, #00b4d8 0%, #0077b6 100%)',
  'linear-gradient(135deg, #4ade80 0%, #22d3ee 100%)',
  'linear-gradient(180deg, #0b1020 0%, #312e81 100%)',
  'radial-gradient(circle at 30% 20%, #4f46e5 0%, #0b0d17 60%)',
  'conic-gradient(from 180deg at 50% 50%, #7c5cff, #22d3ee, #ff2bd6, #7c5cff)',
  'linear-gradient(120deg, #f6d365 0%, #fda085 100%)',
  'linear-gradient(135deg, #111 0%, #333 100%)',
  'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 100%)',
  'linear-gradient(90deg, #e10600 0%, #ff7a00 100%)',
];

export const STOCK_IMAGES = [
  'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1920&q=80',
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80',
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1920&q=80',
  'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&q=80',
  'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1920&q=80',
  'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920&q=80',
  'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1920&q=80',
  'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1920&q=80',
];

export const STOCK_VIDEOS = [
  {
    label: 'Fuego y llamas',
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  },
  {
    label: 'Escapada',
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  },
  {
    label: 'Diversión',
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
  },
  {
    label: 'Viaje en auto',
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
  },
  {
    label: 'Animación abstracta',
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  },
];
