export interface PlayerOptions {
  width?: number;
  height?: number;
  loop?: boolean;
  autoAdvance?: number;
  progress?: 'bar' | 'dots' | 'none';
  slideNumbers?: boolean;
  sounds?: boolean;
  controls?: boolean;
  startIndex?: number;
  hash?: boolean;
  exitButton?: boolean;
  exitOnFullscreenEnd?: boolean;
  onExit?: (() => void) | null;
  onChange?: ((index: number, step: number) => void) | null;
  music?: { src: string; volume?: number; loop?: boolean } | null;
}
export interface PlayerInstance {
  next(): void;
  prev(): void;
  go(index: number): void;
  readonly index: number;
  readonly step: number;
  readonly count: number;
  destroy(): void;
}
export function createPlayer(root: HTMLElement, options?: PlayerOptions): PlayerInstance;
export const lumenSound: {
  play(name: string): void;
  setEnabled(v: boolean): void;
  isEnabled(): boolean;
  setVolume(v: number): void;
  names: string[];
};
export function countUp(container: Element, duration: number, delay?: number): () => void;
