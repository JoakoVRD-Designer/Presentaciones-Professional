/**
 * Grabación de la presentación en el navegador (como «Grabar» de PowerPoint):
 * captura la pestaña con las animaciones en tiempo real, tu voz y, si quieres,
 * tu cámara en una burbuja. También registra los tiempos de cada diapositiva
 * para guardarlos como avance automático (ensayo de intervalos).
 */
import { downloadFile, slugify } from '../../render/exportHtml';
import { useEditor } from '../store/editor';
import { sfx } from './sound';

export interface RecordingOptions {
  camera: boolean;
  microphone: boolean;
  timings: boolean;
}

interface Session {
  recorder: MediaRecorder;
  chunks: Blob[];
  streams: MediaStream[];
  camera: MediaStream | null;
  audio: AudioContext | null;
  startedAt: number;
  options: RecordingOptions;
  marks: { slideId: string; at: number }[];
  stopping?: Promise<void>;
}

let session: Session | null = null;
const listeners = new Set<() => void>();

export const recording = {
  active: () => !!session,
  camera: () => session?.camera ?? null,
  startedAt: () => session?.startedAt ?? 0,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
const notify = () => listeners.forEach((fn) => fn());

function pickMime(): string {
  const options = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return options.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';
}

/** Pide permisos, prepara la grabación y abre la presentación. */
export async function startRecording(options: RecordingOptions, startIndex: number) {
  const st = useEditor.getState();
  if (session) return;
  if (!navigator.mediaDevices?.getDisplayMedia) {
    st.toast('Este navegador no permite grabar la pantalla. Usa Chrome, Edge o Firefox de escritorio.', 'error');
    return;
  }
  const streams: MediaStream[] = [];
  try {
    const display = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: true,
      // Sugiere capturar esta misma pestaña (Chrome/Edge).
      ...({ preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude' } as object),
    } as DisplayMediaStreamOptions);
    streams.push(display);
    let mic: MediaStream | null = null;
    if (options.microphone) {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).catch(() => null);
      if (mic) streams.push(mic);
      else st.toast('No se pudo usar el micrófono; se grabará sin voz.', 'info');
    }
    let camera: MediaStream | null = null;
    if (options.camera) {
      camera = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 640, facingMode: 'user' } }).catch(() => null);
      if (camera) streams.push(camera);
      else st.toast('No se pudo usar la cámara.', 'info');
    }
    // Mezcla el audio de la pestaña (sonidos, videos, música) con la voz.
    let audioCtx: AudioContext | null = null;
    const tracks: MediaStreamTrack[] = [...display.getVideoTracks()];
    const audioSources = [display, mic].filter((s): s is MediaStream => !!s && s.getAudioTracks().length > 0);
    if (audioSources.length) {
      audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      for (const s of audioSources) audioCtx.createMediaStreamSource(s).connect(dest);
      tracks.push(...dest.stream.getAudioTracks());
    }
    const mime = pickMime();
    const recorder = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    // Si el usuario detiene el uso compartido desde el navegador, termina la grabación.
    display.getVideoTracks()[0]?.addEventListener('ended', () => useEditor.setState({ presenting: null }));
    session = { recorder, chunks, streams, camera, audio: audioCtx, startedAt: Date.now(), options, marks: [] };
    recorder.start(1000);
    sfx('pop');
    notify();
    useEditor.setState({ presenting: { start: startIndex } });
  } catch (err) {
    streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    if ((err as DOMException)?.name !== 'NotAllowedError') st.toast(err instanceof Error ? err.message : 'No se pudo iniciar la grabación', 'error');
  }
}

/** Registra que se entró en una diapositiva (para los tiempos de ensayo). */
export function markSlide(slideId: string) {
  if (!session) return;
  const last = session.marks[session.marks.length - 1];
  if (last?.slideId !== slideId) session.marks.push({ slideId, at: Date.now() });
}

/** Detiene la grabación, descarga el video y guarda los tiempos si se pidió. */
export async function stopRecording() {
  const s = session;
  if (!s) return;
  if (s.stopping) return s.stopping;
  s.stopping = (async () => {
    await new Promise<void>((resolve) => {
      s.recorder.onstop = () => resolve();
      if (s.recorder.state !== 'inactive') s.recorder.stop();
      else resolve();
    });
    s.streams.forEach((st) => st.getTracks().forEach((t) => t.stop()));
    await s.audio?.close().catch(() => {});
    session = null;
    notify();
    const st = useEditor.getState();
    const type = s.recorder.mimeType || 'video/webm';
    const blob = new Blob(s.chunks, { type });
    if (blob.size) {
      downloadFile(`${slugify(st.doc.title)}-grabacion.${type.includes('mp4') ? 'mp4' : 'webm'}`, blob, type);
      sfx('success');
    }
    if (s.options.timings && s.marks.length) {
      const end = Date.now();
      const spent = new Map<string, number>();
      s.marks.forEach((m, i) => {
        const until = s.marks[i + 1]?.at ?? end;
        spent.set(m.slideId, (spent.get(m.slideId) ?? 0) + (until - m.at));
      });
      const cmds = [...spent].map(([slide, ms]) => ({ op: 'slide.update' as const, slide, patch: { duration: Math.max(1, Math.round(ms / 1000)) } }));
      st.dispatch(cmds);
      st.toast(`Grabación descargada y tiempos guardados en ${cmds.length} diapositiva${cmds.length === 1 ? '' : 's'} (⌘Z para deshacer).`, 'success');
    } else if (blob.size) {
      st.toast('Grabación descargada.', 'success');
    }
  })();
  return s.stopping;
}
