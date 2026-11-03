import { icons, Search, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { sfx } from '../lib/sound';

const FEATURED = [
  'Sparkles', 'Rocket', 'Zap', 'Star', 'Heart', 'Lightbulb', 'Target', 'TrendingUp', 'ChartLine', 'ChartPie',
  'ChartColumn', 'Users', 'User', 'Globe', 'MapPin', 'ShieldCheck', 'Lock', 'BrainCircuit', 'Cpu', 'Bot',
  'Code', 'Database', 'Cloud', 'Wifi', 'Smartphone', 'Laptop', 'Camera', 'Video', 'Music', 'Mic',
  'Mail', 'MessageCircle', 'Phone', 'Calendar', 'Clock', 'Timer', 'Award', 'Trophy', 'Medal', 'Crown',
  'Gem', 'Gift', 'ShoppingCart', 'CreditCard', 'Wallet', 'PiggyBank', 'DollarSign', 'Banknote', 'Briefcase', 'Building2',
  'Factory', 'Leaf', 'Sun', 'Moon', 'Flame', 'Droplet', 'Mountain', 'Plane', 'Car', 'Ship',
  'Compass', 'Map', 'Flag', 'Bookmark', 'BookOpen', 'GraduationCap', 'Palette', 'PenTool', 'Wand', 'Layers',
  'Puzzle', 'Settings', 'Wrench', 'Hammer', 'Package', 'Truck', 'Recycle', 'Infinity', 'Orbit', 'Atom',
  'CircleCheck', 'CircleX', 'TriangleAlert', 'Info', 'Quote', 'ThumbsUp', 'Smile', 'Handshake', 'Eye', 'Search',
  'ArrowRight', 'ArrowUpRight', 'MoveRight', 'ChevronRight', 'Play', 'Pause', 'Volume2', 'Headphones', 'Gamepad2', 'Dna',
];

export function IconPicker({ value, onPick }: { value?: string; onPick: (name: string) => void }) {
  const [q, setQ] = useState('');
  const all = icons as Record<string, LucideIcon>;
  const list = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/\s+/g, '');
    if (!term) return FEATURED.filter((n) => all[n]);
    return Object.keys(all)
      .filter((n) => n.toLowerCase().includes(term))
      .slice(0, 160);
  }, [q, all]);
  return (
    <div className="icon-picker">
      <label className="search-box">
        <Search size={14} />
        <input
          autoFocus
          placeholder="Buscar entre 2000 iconos (en inglés)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </label>
      <div className="icon-grid">
        {list.map((name) => {
          const Icon = all[name];
          return (
            <button
              key={name}
              className={`icon-cell${value === name ? ' is-active' : ''}`}
              title={name}
              onClick={() => {
                sfx('pop');
                onPick(name);
              }}
            >
              <Icon size={20} strokeWidth={1.75} />
            </button>
          );
        })}
        {!list.length && <p className="muted small">Sin resultados para «{q}».</p>}
      </div>
    </div>
  );
}
