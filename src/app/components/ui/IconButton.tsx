import { motion, type TargetAndTransition } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { forwardRef, type ReactNode } from 'react';
import { sfx } from '../../lib/sound';

export type IconAnim = 'wiggle' | 'spin' | 'bounce' | 'pop' | 'right' | 'left' | 'up' | 'down' | 'float' | 'swing' | 'none';

const HOVER: Record<IconAnim, TargetAndTransition> = {
  wiggle: { rotate: [0, -14, 12, -6, 0], transition: { duration: 0.5 } },
  spin: { rotate: 180, transition: { type: 'spring', stiffness: 220, damping: 14 } },
  bounce: { y: [0, -4, 0, -2, 0], transition: { duration: 0.55 } },
  pop: { scale: [1, 1.25, 0.95, 1], transition: { duration: 0.4 } },
  right: { x: [0, 3, 0], transition: { duration: 0.4 } },
  left: { x: [0, -3, 0], transition: { duration: 0.4 } },
  up: { y: [0, -3, 0], transition: { duration: 0.4 } },
  down: { y: [0, 3, 0], transition: { duration: 0.4 } },
  float: { y: [0, -2, 0, 2, 0], transition: { duration: 0.9, repeat: Infinity } },
  swing: { rotate: [0, 15, -10, 5, 0], transition: { duration: 0.6 } },
  none: {},
};

export function AnimatedIcon({ icon: Icon, anim = 'wiggle', size = 16, strokeWidth = 1.9 }: {
  icon: LucideIcon;
  anim?: IconAnim;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <motion.span
      className="anim-icon"
      variants={{ rest: { rotate: 0, scale: 1, x: 0, y: 0 }, hover: HOVER[anim] }}
      style={{ display: 'inline-grid', placeItems: 'center' }}
    >
      <Icon size={size} strokeWidth={strokeWidth} />
    </motion.span>
  );
}

interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  anim?: IconAnim;
  size?: number;
  kbd?: string;
  variant?: 'ghost' | 'solid' | 'primary' | 'danger' | 'soft';
  disabled?: boolean;
  className?: string;
  tipSide?: 'top' | 'bottom' | 'left' | 'right';
  children?: ReactNode;
  sound?: string | false;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, onClick, active, anim = 'wiggle', size = 16, kbd, variant = 'ghost', disabled, className, tipSide = 'bottom', children, sound = 'tap' },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type="button"
      className={`icon-btn v-${variant}${active ? ' is-active' : ''}${children ? ' has-label' : ''}${className ? ` ${className}` : ''}`}
      data-tip={children ? undefined : kbd ? `${label}  ${kbd}` : label}
      data-tip-side={tipSide}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      initial="rest"
      animate="rest"
      whileHover={disabled ? undefined : 'hover'}
      whileTap={disabled ? undefined : { scale: 0.93 }}
      onClick={(e) => {
        if (sound) sfx(sound);
        onClick?.(e);
      }}
    >
      <AnimatedIcon icon={icon} anim={anim} size={size} />
      {children && <span className="icon-btn-label">{children}</span>}
    </motion.button>
  );
});
