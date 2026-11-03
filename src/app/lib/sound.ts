import { lumenSound } from '../../runtime/player.js';
import { useEditor } from '../store/editor';

export type UiSound = 'tick' | 'tap' | 'toggle' | 'success' | 'error' | 'remove' | 'open' | 'close' | 'pop' | 'whoosh' | 'chime' | 'swoosh' | 'click' | 'soft' | 'rise';

lumenSound.setVolume(0.35);

/** Sonidos de interfaz (sintetizados con WebAudio, sin archivos). */
export function sfx(name: UiSound | string) {
  if (!useEditor.getState().sounds) return;
  lumenSound.play(name);
}

/** Reproduce un sonido aunque los sonidos de interfaz estén desactivados (vista previa). */
export function previewSound(name: string) {
  const was = lumenSound.isEnabled();
  lumenSound.setEnabled(true);
  lumenSound.play(name);
  lumenSound.setEnabled(was);
}
