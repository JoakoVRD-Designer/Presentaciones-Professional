/**
 * Render de video de estudio (MP4 H.264 + AAC).
 *
 * Abre la presentación en un Chromium headless con el tiempo virtualizado y la
 * recorre fotograma a fotograma: cada animación, transición, video y Lottie se
 * coloca en su instante exacto antes de capturar, así el resultado es perfecto
 * (sin tirones) a 24/30/60 fps y hasta 4K. La banda sonora (música, narraciones
 * y efectos de transición) se mezcla con Web Audio offline y se une con ffmpeg.
 *
 * Requisitos: playwright (con Chromium: `npx playwright install chromium`) y ffmpeg.
 */
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { DATA_DIR } from './store';

const require = createRequire(import.meta.url);
const VIDEOS_DIR = path.join(DATA_DIR, 'videos');
const KEEP_VIDEOS = 12;

export interface VideoRenderOptions {
  width: number;
  height: number;
  fps: number;
  secondsPerSlide: number;
  secondsPerStep: number;
  music: boolean;
  narration: boolean;
  sfx: boolean;
  quality: 'draft' | 'high' | 'master';
}

export interface VideoJob {
  id: string;
  presentationId: string;
  title: string;
  status: 'queued' | 'starting' | 'rendering' | 'encoding' | 'done' | 'error' | 'cancelled';
  progress: number;
  message: string;
  frames: number;
  duration: number;
  file?: string;
  bytes?: number;
  error?: string;
  createdAt: string;
  options: VideoRenderOptions;
  cancelled?: boolean;
}

const jobs = new Map<string, VideoJob>();
const queue: (() => Promise<void>)[] = [];
let running = false;

/* ------------------------------------------------------------------ */
/* Dependencias                                                        */
/* ------------------------------------------------------------------ */

type PlaywrightModule = typeof import('playwright');

function loadPlaywright(): PlaywrightModule | null {
  for (const name of ['playwright', 'playwright-core']) {
    try {
      return require(name) as PlaywrightModule;
    } catch {
      /* siguiente */
    }
  }
  return null;
}

function ffmpegPath(): string | null {
  const candidates = [process.env.FFMPEG_PATH];
  try {
    candidates.push(require('ffmpeg-static') as string);
  } catch {
    /* opcional */
  }
  candidates.push('ffmpeg');
  for (const c of candidates) {
    if (!c) continue;
    try {
      if (spawnSync(c, ['-version'], { stdio: 'ignore' }).status === 0) return c;
    } catch {
      /* siguiente */
    }
  }
  return null;
}

export function videoCapabilities() {
  const pw = loadPlaywright();
  const ff = ffmpegPath();
  const missing: string[] = [];
  if (!pw) missing.push('playwright (npm i -D playwright && npx playwright install chromium)');
  if (!ff) missing.push('ffmpeg (instálalo o define FFMPEG_PATH)');
  return { available: missing.length === 0, missing, ffmpeg: ff ?? undefined };
}

/* ------------------------------------------------------------------ */
/* Tiempo virtual (se inyecta antes que cualquier script de la página) */
/* ------------------------------------------------------------------ */

export const VIRTUAL_TIME_SCRIPT = `(() => {
  const realSetTimeout = window.setTimeout.bind(window);
  const realRaf = window.requestAnimationFrame.bind(window);
  window.__realSetTimeout = realSetTimeout;
  window.__realRaf = realRaf;
  let now = 0;
  const epoch = Date.now();
  const timers = new Map();
  const rafs = new Map();
  let seq = 1;
  performance.now = () => now;
  Date.now = () => epoch + now;
  window.setTimeout = (fn, ms, ...args) => { const id = seq++; timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn, args }); return id; };
  window.setInterval = (fn, ms, ...args) => { const id = seq++; const every = Math.max(1, Number(ms) || 1); timers.set(id, { at: now + every, fn, args, every }); return id; };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (fn) => { const id = seq++; rafs.set(id, fn); return id; };
  window.cancelAnimationFrame = (id) => { rafs.delete(id); };
  const run = (fn, args) => { try { if (typeof fn === 'function') fn(...args); } catch (e) { console.error(e); } };
  window.__vt = {
    now: () => now,
    advance(ms) {
      const target = now + Math.max(0, ms);
      for (let guard = 0; guard < 200000; guard++) {
        let pick = null;
        for (const entry of timers) {
          const t = entry[1];
          if (t.at <= target && (!pick || t.at < pick[1].at)) pick = entry;
        }
        if (!pick) break;
        const id = pick[0];
        const t = pick[1];
        now = Math.max(now, t.at);
        if (t.every) t.at += t.every; else timers.delete(id);
        run(t.fn, t.args);
      }
      now = target;
      const cbs = Array.from(rafs.values());
      rafs.clear();
      for (const cb of cbs) run(cb, [now]);
    },
  };
  const P = HTMLMediaElement.prototype;
  P.play = function () { this.__lm = { playing: true, startV: now, base: this.currentTime || 0 }; return Promise.resolve(); };
  P.pause = function () {
    const c = this.__lm;
    if (c && c.playing) this.__lm = { playing: false, startV: now, base: c.base + ((now - c.startV) / 1000) * (this.playbackRate || 1) };
  };
  Object.defineProperty(P, 'paused', { configurable: true, get() { return !(this.__lm && this.__lm.playing); } });
})();`;

/* ------------------------------------------------------------------ */
/* Trabajos                                                            */
/* ------------------------------------------------------------------ */

export function getJob(id: string) {
  return jobs.get(id);
}

export function listJobs(presentationId?: string) {
  return [...jobs.values()].filter((j) => !presentationId || j.presentationId === presentationId).reverse();
}

export function cancelJob(id: string) {
  const job = jobs.get(id);
  if (job && !['done', 'error', 'cancelled'].includes(job.status)) {
    job.cancelled = true;
    job.status = 'cancelled';
    job.message = 'Cancelado';
  }
  return job;
}

async function pump() {
  if (running) return;
  const next = queue.shift();
  if (!next) return;
  running = true;
  try {
    await next();
  } finally {
    running = false;
    void pump();
  }
}

export function startVideoJob(presentationId: string, title: string, appUrl: string, options: VideoRenderOptions): VideoJob {
  const id = `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const job: VideoJob = {
    id,
    presentationId,
    title,
    status: 'queued',
    progress: 0,
    message: running ? 'En cola…' : 'Iniciando…',
    frames: 0,
    duration: 0,
    createdAt: new Date().toISOString(),
    options,
  };
  jobs.set(id, job);
  queue.push(() => render(job, appUrl).catch((err) => {
    if (job.status !== 'cancelled') {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : String(err);
      job.message = 'Error al renderizar';
      console.error('[video]', err);
    }
  }));
  void pump();
  return job;
}

function waitDrain(proc: ChildProcessWithoutNullStreams) {
  return new Promise<void>((resolve) => proc.stdin.once('drain', () => resolve()));
}

async function cleanupOld() {
  const files = (await fs.readdir(VIDEOS_DIR).catch(() => [] as string[])).filter((f) => f.endsWith('.mp4'));
  if (files.length <= KEEP_VIDEOS) return;
  const withTime = await Promise.all(files.map(async (f) => ({ f, t: (await fs.stat(path.join(VIDEOS_DIR, f))).mtimeMs })));
  withTime.sort((a, b) => a.t - b.t);
  for (const { f } of withTime.slice(0, withTime.length - KEEP_VIDEOS)) await fs.rm(path.join(VIDEOS_DIR, f), { force: true });
}

type RenderWindow = {
  __lumenRender: {
    ready: () => Promise<unknown>;
    plan: (o: unknown) => Promise<{ duration: number; frames: number }>;
    seek: (t: number) => Promise<void>;
    audio: () => Promise<string | null>;
  };
};

async function openRenderPage(
  browser: import('playwright').Browser,
  appUrl: string,
  job: VideoJob,
): Promise<{ page: import('playwright').Page; context: import('playwright').BrowserContext; info: { duration: number; frames: number } }> {
  const o = job.options;
  const context = await browser.newContext({ viewport: { width: o.width, height: o.height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.warn('[video:page]', e.message));
  await page.addInitScript(VIRTUAL_TIME_SCRIPT);
  await page.goto(`${appUrl.replace(/\/$/, '')}/?render=${encodeURIComponent(job.presentationId)}`, { waitUntil: 'load', timeout: 60000 });
  // No se usa page.waitForFunction: sondea con requestAnimationFrame, que aquí está virtualizado.
  for (let waited = 0; ; waited += 250) {
    if (await page.evaluate(() => !!(window as unknown as Partial<RenderWindow>).__lumenRender)) break;
    if (waited > 60000) throw new Error('La página de render no respondió');
    await new Promise((r) => setTimeout(r, 250));
  }
  await page.evaluate(() => (window as unknown as RenderWindow).__lumenRender.ready());
  const info = await page.evaluate((opts) => (window as unknown as RenderWindow).__lumenRender.plan(opts), { ...o });
  return { page, context, info };
}

function encoderArgs(o: VideoRenderOptions, out: string): string[] {
  const crf = o.quality === 'master' ? '14' : o.quality === 'draft' ? '26' : '18';
  const preset = o.quality === 'draft' ? 'veryfast' : o.quality === 'master' ? 'slow' : 'medium';
  return [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(o.fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', preset, '-crf', crf, '-pix_fmt', 'yuv420p', '-r', String(o.fps),
    out,
  ];
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let err = '';
    p.stderr.on('data', (d) => (err += String(d)));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg (${code}): ${err.slice(-400)}`))));
  });
}

async function render(job: VideoJob, appUrl: string) {
  const pw = loadPlaywright();
  const ff = ffmpegPath();
  if (!pw || !ff) throw new Error('Faltan dependencias para el video: ' + videoCapabilities().missing.join(', '));
  const o = job.options;
  await fs.mkdir(VIDEOS_DIR, { recursive: true });
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-video-'));
  job.status = 'starting';
  job.message = 'Abriendo el motor de render…';
  const browser = await pw.chromium.launch({
    channel: process.env.LUMEN_CHROME_CHANNEL || undefined,
    args: ['--hide-scrollbars', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--force-color-profile=srgb'],
  });
  const encoders: ChildProcessWithoutNullStreams[] = [];
  try {
    job.message = 'Cargando medios y tipografías…';
    const first = await openRenderPage(browser, appUrl, job);
    const { frames, duration } = first.info;
    job.frames = frames;
    job.duration = duration;

    let wav: string | null = null;
    if (o.music || o.narration || o.sfx) {
      job.message = 'Mezclando la banda sonora…';
      const b64 = await first.page.evaluate(() => (window as unknown as RenderWindow).__lumenRender.audio());
      if (b64) {
        wav = path.join(tmp, 'audio.wav');
        await fs.writeFile(wav, Buffer.from(b64, 'base64'));
      }
    }

    // Render en paralelo por tramos: el tiempo virtual es determinista, así que
    // cada página produce exactamente los mismos fotogramas que produciría una sola.
    const cpu = Math.max(1, os.cpus().length - 1);
    const workers = Math.max(1, Math.min(Number(process.env.LUMEN_RENDER_WORKERS) || cpu, 6, Math.ceil(frames / 90)));
    const chunk = Math.ceil(frames / workers);
    job.status = 'rendering';
    job.message = `Renderizando con ${workers} proceso${workers > 1 ? 's' : ''}…`;
    const started = Date.now();
    const done = new Array(workers).fill(0);
    const segments: string[] = [];
    const tick = () => {
      const total = done.reduce((a, b) => a + b, 0);
      job.progress = Math.min(0.99, total / frames);
      const elapsed = (Date.now() - started) / 1000;
      const eta = total ? Math.max(0, Math.round((elapsed / total) * (frames - total))) : 0;
      job.message = `Fotograma ${total} de ${frames} · ${workers} proceso${workers > 1 ? 's' : ''} · quedan ~${eta < 60 ? `${eta} s` : `${Math.ceil(eta / 60)} min`}`;
    };
    await Promise.all(
      Array.from({ length: workers }, async (_, w) => {
        const from = w * chunk;
        const to = Math.min(frames, from + chunk);
        if (from >= to) return;
        const { page, context } = w === 0 ? first : await openRenderPage(browser, appUrl, job);
        const seg = path.join(tmp, `seg${String(w).padStart(2, '0')}.mp4`);
        segments[w] = seg;
        const enc = spawn(ff, encoderArgs(o, seg));
        encoders.push(enc);
        let encErr = '';
        enc.stderr.on('data', (d) => (encErr += String(d)));
        const closed = new Promise<number>((resolve) => enc.on('close', (code) => resolve(code ?? 1)));
        const cdp = await context.newCDPSession(page);
        for (let f = from; f < to; f++) {
          if (job.cancelled) throw new Error('Cancelado');
          await page.evaluate((t) => (window as unknown as RenderWindow).__lumenRender.seek(t), (f * 1000) / o.fps);
          const shot = (await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: o.quality === 'draft' ? 82 : 94, optimizeForSpeed: true })) as { data: string };
          if (!enc.stdin.write(Buffer.from(shot.data, 'base64'))) await waitDrain(enc);
          done[w] = f - from + 1;
          if ((f - from) % 5 === 0) tick();
        }
        enc.stdin.end();
        const code = await closed;
        if (code !== 0) throw new Error(`ffmpeg terminó con código ${code}: ${encErr.slice(-300)}`);
        await context.close().catch(() => {});
      }),
    );

    job.status = 'encoding';
    job.message = 'Uniendo y finalizando el MP4…';
    const list = path.join(tmp, 'list.txt');
    await fs.writeFile(list, segments.filter(Boolean).map((sgm) => `file '${sgm.replace(/'/g, "'\\''")}'`).join('\n'));
    const out = path.join(VIDEOS_DIR, `${job.id}.mp4`);
    await run(ff, [
      '-y', '-loglevel', 'error',
      '-f', 'concat', '-safe', '0', '-i', list,
      ...(wav ? ['-i', wav] : []),
      '-c:v', 'copy',
      ...(wav ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
      '-movflags', '+faststart',
      '-metadata', `title=${job.title}`,
      out,
    ]);
    job.file = out;
    job.bytes = (await fs.stat(out)).size;
    job.progress = 1;
    job.status = 'done';
    job.message = `Listo en ${Math.round((Date.now() - started) / 1000)} s`;
    void cleanupOld();
  } finally {
    for (const enc of encoders) {
      if (enc.exitCode === null) {
        try {
          enc.stdin.destroy();
          enc.kill('SIGKILL');
        } catch {
          /* noop */
        }
      }
    }
    await browser.close().catch(() => {});
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

/** URL desde la que el render abre la app (en desarrollo, Vite; en producción, este servidor). */
export function defaultAppUrl(port: number): string {
  if (process.env.LUMEN_APP_URL) return process.env.LUMEN_APP_URL;
  return existsSync(path.resolve(process.cwd(), 'dist', 'index.html')) && process.env.NODE_ENV === 'production'
    ? `http://127.0.0.1:${port}`
    : 'http://127.0.0.1:5173';
}

/** Solo se permite abrir la app desde la propia máquina (evita SSRF). */
export function isSafeAppUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(u.hostname);
  } catch {
    return false;
  }
}
