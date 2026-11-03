/**
 * Canal entre el editor/presentación y la ventana de «vista del orador».
 * Usa BroadcastChannel (mismo origen), sin servidor.
 */
import type { Presentation } from '../../core/model';
import type { PlayerInstance } from '../../runtime/player.js';
import { useEditor } from '../store/editor';

export type PresenterMessage =
  | { type: 'hello' }
  | { type: 'doc'; doc: Presentation }
  | { type: 'state'; presenting: boolean; index: number; step: number; maxStep: number }
  | { type: 'cmd'; action: 'next' | 'prev' | 'go'; index?: number };

const CHANNEL = 'lumen-presenter';
let channel: BroadcastChannel | null = null;
let activePlayer: PlayerInstance | null = null;
let lastState: Extract<PresenterMessage, { type: 'state' }> = { type: 'state', presenting: false, index: 0, step: 0, maxStep: 0 };

function getChannel() {
  if (!channel && typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel(CHANNEL);
  return channel;
}

export function presenterChannel() {
  return getChannel();
}

function visibleIndexOfCurrent(): number {
  const { doc, currentSlideId } = useEditor.getState();
  const visible = doc.slides.filter((s) => !s.hidden);
  return Math.max(0, visible.findIndex((s) => s.id === currentSlideId));
}

/** Instala el lado «editor» del canal: responde a la vista del orador y obedece sus órdenes. */
export function installPresenterHost() {
  const ch = getChannel();
  if (!ch) return;
  ch.onmessage = (e: MessageEvent<PresenterMessage>) => {
    const msg = e.data;
    if (msg.type === 'hello') {
      ch.postMessage({ type: 'doc', doc: useEditor.getState().doc } satisfies PresenterMessage);
      ch.postMessage(activePlayer ? lastState : { ...lastState, presenting: false, index: visibleIndexOfCurrent() });
    }
    if (msg.type === 'cmd') {
      if (activePlayer) {
        if (msg.action === 'next') activePlayer.next();
        if (msg.action === 'prev') activePlayer.prev();
        if (msg.action === 'go' && msg.index !== undefined) activePlayer.go(msg.index);
      } else {
        const st = useEditor.getState();
        const visible = st.doc.slides.filter((s) => !s.hidden);
        const cur = visibleIndexOfCurrent();
        const target = msg.action === 'next' ? cur + 1 : msg.action === 'prev' ? cur - 1 : (msg.index ?? cur);
        const slide = visible[Math.max(0, Math.min(target, visible.length - 1))];
        if (slide) st.selectSlide(slide.id);
      }
    }
  };
  // Refleja los cambios del documento y de la diapositiva actual.
  useEditor.subscribe((s, p) => {
    if (s.doc !== p.doc) ch.postMessage({ type: 'doc', doc: s.doc } satisfies PresenterMessage);
    if (!activePlayer && s.currentSlideId !== p.currentSlideId) {
      ch.postMessage({ ...lastState, presenting: false, index: visibleIndexOfCurrent(), step: 0 } satisfies PresenterMessage);
    }
  });
}

export function setActivePlayer(player: PlayerInstance | null) {
  activePlayer = player;
  if (!player) {
    lastState = { ...lastState, presenting: false };
    getChannel()?.postMessage(lastState);
  }
}

export function publishPlayerState(index: number, step: number, maxStep: number) {
  lastState = { type: 'state', presenting: true, index, step, maxStep };
  getChannel()?.postMessage(lastState);
}

export function openPresenterWindow() {
  const id = useEditor.getState().doc.id;
  const w = window.open(
    `${window.location.pathname}?presenter=${encodeURIComponent(id)}`,
    'lumen-presenter',
    'width=1280,height=800,menubar=no,toolbar=no',
  );
  if (!w) useEditor.getState().toast('El navegador bloqueó la ventana emergente. Permite ventanas emergentes para este sitio.', 'error');
}
