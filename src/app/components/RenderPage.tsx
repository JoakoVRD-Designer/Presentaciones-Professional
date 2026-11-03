/**
 * Página de render de video (/?render=<id>).
 *
 * La abre el servidor en un Chromium headless con el tiempo virtualizado
 * (setTimeout, requestAnimationFrame, performance.now, play/pause de medios).
 * Expone window.__lumenRender para avanzar fotograma a fotograma de forma
 * determinista: cada animación CSS/WAAPI, video y Lottie se coloca exactamente
 * en el instante del fotograma, así el video sale perfecto sin saltos.
 */
import { useEffect, useRef, useState } from 'react';
import { normalizePresentation, type Presentation } from '../../core/model';
import { Deck } from '../../render/Deck';
import { buildPlan, DEFAULT_VIDEO_OPTIONS, type VideoOptions, type VideoPlan } from '../../render/videoPlan';
import { createPlayer, lumenSound, type PlayerInstance } from '../../runtime/player.js';

interface VirtualTime {
  now: () => number;
  advance: (ms: number) => void;
}

interface MediaClock {
  playing: boolean;
  startV: number;
  base: number;
}

export interface RenderApi {
  ready: () => Promise<{ slides: number }>;
  plan: (opts: Partial<VideoOptions>) => Promise<{ duration: number; frames: number; nexts: number }>;
  seek: (ms: number) => Promise<void>;
  audio: () => Promise<string | null>;
}

declare global {
  interface Window {
    __vt?: VirtualTime;
    __lumenRender?: RenderApi;
  }
  interface HTMLMediaElement {
    __lm?: MediaClock;
  }
}

const vnow = () => (window.__vt ? window.__vt.now() : performance.now());

function waitEvent(el: EventTarget, name: string, timeout: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      el.removeEventListener(name, done);
      resolve();
    };
    el.addEventListener(name, done, { once: true });
    // Con tiempo virtual, los plazos de espera usan el temporizador real.
    const realTimeout = (window as unknown as { __realSetTimeout?: typeof setTimeout }).__realSetTimeout ?? setTimeout;
    realTimeout(done, timeout);
  });
}

/** Coloca cada animación CSS/WAAPI en su instante exacto según el tiempo virtual. */
function syncAnimations(starts: WeakMap<Animation, number>) {
  const now = vnow();
  for (const a of document.getAnimations()) {
    let s = starts.get(a);
    if (s === undefined) {
      s = now;
      starts.set(a, s);
    }
    if (a.playState !== 'paused') a.pause();
    a.currentTime = Math.max(0, now - s);
  }
}

/** Mueve cada video al fotograma que le corresponde y espera a que se dibuje. */
async function syncVideos(scope: ParentNode) {
  const now = vnow();
  const waits: Promise<void>[] = [];
  scope.querySelectorAll('video').forEach((v) => {
    const c = v.__lm;
    if (!c || v.error || v.readyState < 1) return;
    const elapsed = c.playing ? ((now - c.startV) / 1000) * (v.playbackRate || 1) : 0;
    let target = c.base + elapsed;
    const d = v.duration;
    if (Number.isFinite(d) && d > 0) target = v.loop ? target % d : Math.min(target, d - 0.001);
    if (Math.abs(v.currentTime - target) > 0.004) {
      v.currentTime = target;
      waits.push(waitEvent(v, 'seeked', 3000));
    }
  });
  await Promise.all(waits);
}

function wavBase64(buf: AudioBuffer): string {
  const ch = buf.numberOfChannels;
  const len = buf.length;
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  data.setUint32(4, 36 + len * ch * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, ch, true);
  data.setUint32(24, buf.sampleRate, true);
  data.setUint32(28, buf.sampleRate * ch * 2, true);
  data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true);
  w(36, 'data');
  data.setUint32(40, len * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  const bytes = new Uint8Array(data.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function audioDuration(src: string): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => resolve(0);
    a.src = src;
  });
}

export function RenderPage({ id }: { id: string }) {
  const [doc, setDoc] = useState<Presentation | null>(null);
  const [error, setError] = useState('');
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/presentations/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setDoc(normalizePresentation(d)))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!doc || !host.current) return;
    document.title = `Render · ${doc.title}`;
    const root = host.current.querySelector<HTMLElement>('.lm-deck');
    if (!root) return;
    const player: PlayerInstance = createPlayer(root, {
      width: doc.width,
      height: doc.height,
      loop: false,
      autoAdvance: 0,
      progress: 'none',
      controls: false,
      sounds: false,
      hash: false,
      manual: true,
      music: null,
    });
    const starts = new WeakMap<Animation, number>();
    let plan: VideoPlan | null = null;
    let opts: VideoOptions = DEFAULT_VIDEO_OPTIONS;
    let nextIdx = 0;

    window.__lumenRender = {
      ready: async () => {
        await document.fonts.ready;
        const media = [...document.querySelectorAll<HTMLVideoElement>('video')].map((v) =>
          v.readyState >= 2 || v.error ? Promise.resolve() : Promise.race([waitEvent(v, 'loadeddata', 15000), waitEvent(v, 'error', 15000)]),
        );
        const imgs = [...document.images].map((im) => (im.complete ? Promise.resolve() : waitEvent(im, 'load', 15000)));
        await Promise.all([...media, ...imgs]);
        return { slides: doc.slides.filter((s) => !s.hidden).length };
      },
      plan: async (o) => {
        opts = { ...DEFAULT_VIDEO_OPTIONS, ...o };
        const durations: Record<string, number> = {};
        for (const s of doc.slides) if (s.narration.src && opts.narration) durations[s.id] = await audioDuration(s.narration.src);
        plan = buildPlan(doc, opts, durations);
        nextIdx = 0;
        return { duration: plan.duration, frames: Math.ceil((plan.duration / 1000) * opts.fps), nexts: plan.nexts.length };
      },
      seek: async (ms) => {
        if (!plan) throw new Error('Llama a plan() primero');
        const vt = window.__vt;
        // Registra las animaciones existentes con su instante real de inicio
        // (permite que varias páginas rendericen tramos en paralelo).
        syncAnimations(starts);
        while (nextIdx < plan.nexts.length && plan.nexts[nextIdx] <= ms) {
          if (vt) vt.advance(Math.max(0, plan.nexts[nextIdx] - vt.now()));
          syncAnimations(starts);
          player.next();
          syncAnimations(starts);
          nextIdx++;
        }
        if (vt) vt.advance(Math.max(0, ms - vt.now()));
        syncAnimations(starts);
        const current = root.querySelectorAll('.lm-frame.is-current, .lm-frame.is-leave');
        for (const f of current) await syncVideos(f);
        await new Promise<void>((r) => requestAnimationFrameReal(() => r()));
      },
      audio: async () => {
        if (!plan) return null;
        const sr = 48000;
        const ctx = new OfflineAudioContext(2, Math.ceil((plan.duration / 1000) * sr), sr);
        const master = ctx.createGain();
        master.connect(ctx.destination);
        let any = false;
        const decode = async (src: string) => {
          try {
            return await ctx.decodeAudioData(await (await fetch(src)).arrayBuffer());
          } catch {
            return null;
          }
        };
        for (const s of plan.slides) {
          if (s.sound && s.sound !== 'none') {
            lumenSound.schedule(ctx, master, s.sound, s.start / 1000, 0.55);
            any = true;
          }
        }
        const windows: [number, number][] = [];
        for (const s of plan.slides) {
          if (!s.narration) continue;
          const buf = await decode(s.narration.src);
          if (!buf) continue;
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const g = ctx.createGain();
          g.gain.value = s.narration.volume;
          src.connect(g).connect(master);
          src.start(s.start / 1000);
          windows.push([s.start / 1000, s.start / 1000 + buf.duration]);
          any = true;
        }
        const music = doc.settings.music;
        if (opts.music && music.src) {
          const buf = await decode(music.src);
          if (buf) {
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.loop = music.loop;
            const g = ctx.createGain();
            const end = plan.duration / 1000;
            g.gain.setValueAtTime(0, 0);
            g.gain.linearRampToValueAtTime(music.volume, Math.min(2, end / 3));
            for (const [a, b] of windows) {
              g.gain.setTargetAtTime(Math.min(music.volume, 0.15), Math.max(0, a - 0.3), 0.15);
              g.gain.setTargetAtTime(music.volume, b + 0.2, 0.4);
            }
            g.gain.setTargetAtTime(0, Math.max(0, end - 2.2), 0.5);
            src.connect(g).connect(master);
            src.start(0);
            any = true;
          }
        }
        if (!any) return null;
        return wavBase64(await ctx.startRendering());
      },
    };
    document.documentElement.dataset.renderReady = 'true';
    return () => {
      player.destroy();
      delete window.__lumenRender;
    };
  }, [doc]);

  if (error) return <div className="viewer-msg">{error}</div>;
  if (!doc) return <div className="viewer-msg">Cargando…</div>;
  return (
    <div className="viewer render-host" ref={host}>
      <Deck doc={doc} mode="play" />
    </div>
  );
}

/** requestAnimationFrame real (el virtual solo avanza con __vt.advance). */
function requestAnimationFrameReal(cb: () => void) {
  const real = (window as unknown as { __realRaf?: (cb: FrameRequestCallback) => number }).__realRaf;
  if (real) real(() => cb());
  else requestAnimationFrame(() => cb());
}
