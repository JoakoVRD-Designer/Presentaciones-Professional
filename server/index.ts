/**
 * Servidor de Lumen: API REST + eventos en tiempo real (SSE) + subida de
 * archivos + asistente de IA. En producción también sirve la app compilada.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import { createHash } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { API_GUIDE, commandJsonSchema, modelJsonSchemas, summarizePresentation } from '../src/core/commands';
import { LAYOUTS } from '../src/core/layouts';
import { normalizePresentation } from '../src/core/model';
import { TEMPLATES } from '../src/core/templates';
import { THEMES } from '../src/core/themes';
import { AI_MODEL, aiAvailable, runAssistant, type AiEvent, type ChatTurn } from './ai';
import { ASSETS_DIR, store, type DocEvent } from './store';
import {
  addComment,
  collab,
  deleteComment,
  listComments,
  listPresence,
  patchComment,
  removePresence,
  replyComment,
  updatePresence,
  type Comment,
  type Presence,
} from './collab';
import { cancelJob, defaultAppUrl, getJob, isSafeAppUrl, listJobs, startVideoJob, videoCapabilities, type VideoRenderOptions } from './video';

const PORT = Number(process.env.PORT ?? 4317);
const HOST = process.env.HOST ?? '127.0.0.1';
const TOKEN = process.env.LUMEN_API_TOKEN ?? '';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '50mb' }));

/* ---------- Autenticación opcional por token ---------- */
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (!TOKEN || req.method === 'GET') return next();
  const auth = req.header('authorization') ?? '';
  if (auth === `Bearer ${TOKEN}` || req.header('x-lumen-token') === TOKEN) return next();
  res.status(401).json({ error: 'Token inválido. Envía "Authorization: Bearer <LUMEN_API_TOKEN>".' });
});

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const origin = (req: Request) => String(req.header('x-lumen-client') ?? 'api');
const param = (req: Request, name: string) => String(req.params[name]);

/* ---------- Descubrimiento ---------- */
app.get('/api', (_req, res) => {
  res.json({
    name: 'Lumen Slides API',
    version: 1,
    ai: { available: aiAvailable(), model: AI_MODEL },
    endpoints: {
      'GET /api/guide': 'Guía en Markdown para IAs',
      'GET /api/schema': 'JSON Schema de comandos y del modelo de documento',
      'GET /api/layouts': 'Plantillas de diapositiva',
      'GET /api/themes': 'Temas',
      'GET /api/templates': 'Plantillas de presentación',
      'GET /api/presentations': 'Lista de presentaciones',
      'POST /api/presentations': 'Crear { template?, title?, document? }',
      'GET /api/presentations/:id': 'Documento completo (?summary=1 para resumen)',
      'PUT /api/presentations/:id': 'Reemplazar documento { document, baseRev? }',
      'DELETE /api/presentations/:id': 'Eliminar',
      'POST /api/presentations/:id/commands': 'Aplicar comandos { commands: [...] } · cabecera opcional x-lumen-agent: Nombre (aparece como colaborador)',
      'GET /api/presentations/:id/events': 'Stream SSE de cambios, presencia y comentarios',
      'GET/POST /api/presentations/:id/comments': 'Comentarios { slideId, elementId?, x, y, text, author }',
      'POST /api/presentations/:id/comments/:cid/replies': 'Responder { text, author, resolve? }',
      'PATCH /api/presentations/:id/comments/:cid': 'Resolver / editar { resolved, text }',
      'POST /api/presentations/:id/presence': 'Publicar presencia { clientId, name, color, slideId, cursor, selection }',
      'GET /api/presentations/:id/history': 'Versiones guardadas',
      'POST /api/presentations/:id/history': 'Guardar versión { label? }',
      'GET /api/presentations/:id/history/:vid': 'Documento de una versión',
      'POST /api/presentations/:id/history/:vid/restore': 'Restaurar versión',
      'POST /api/assets': 'Subir archivo (cuerpo binario, cabecera Content-Type)',
      'POST /api/presentations/:id/video': 'Renderizar MP4 { width, fps, secondsPerSlide, secondsPerStep, music, narration, sfx, quality }',
      'GET /api/video/:job': 'Estado del render · GET /api/video/:job/file para descargar',
      'POST /api/ai/chat': 'Asistente IA { presentationId, prompt, history? } (stream SSE)',
    },
  });
});
app.get('/api/guide', (_req, res) => res.type('text/markdown').send(API_GUIDE));
app.get('/api/schema', (_req, res) => res.json({ command: commandJsonSchema(), model: modelJsonSchemas() }));
app.get('/api/layouts', (_req, res) => res.json(LAYOUTS.map(({ id, name, description }) => ({ id, name, description }))));
app.get('/api/themes', (_req, res) => res.json(THEMES));
app.get('/api/templates', (_req, res) => res.json(TEMPLATES.map(({ id, name, description }) => ({ id, name, description }))));
app.get('/api/health', (_req, res) => res.json({ ok: true, ai: aiAvailable(), model: AI_MODEL }));

/* ---------- Presentaciones ---------- */
app.get('/api/presentations', wrap(async (_req, res) => res.json(await store.list())));

app.post(
  '/api/presentations',
  wrap(async (req, res) => {
    const { template, title, document } = req.body ?? {};
    const doc = await store.create({ template, title, document }, origin(req));
    res.status(201).json(doc);
  }),
);

app.get(
  '/api/presentations/:id',
  wrap(async (req, res) => {
    const doc = await store.get(param(req, 'id'));
    if (!doc) return res.status(404).json({ error: 'No encontrada' });
    res.json(req.query.summary ? summarizePresentation(doc) : doc);
  }),
);

app.put(
  '/api/presentations/:id',
  wrap(async (req, res) => {
    const body = req.body ?? {};
    const raw = body.document ?? body;
    const doc = normalizePresentation({ ...raw, id: param(req, 'id') });
    const baseRev = typeof body.baseRev === 'number' ? body.baseRev : undefined;
    const result = await store.replace(doc, baseRev, origin(req));
    if (result.conflict) return res.status(409).json({ error: 'Conflicto de versión', document: result.doc });
    res.json({ rev: result.doc.rev, updatedAt: result.doc.updatedAt });
  }),
);

app.delete(
  '/api/presentations/:id',
  wrap(async (req, res) => {
    await store.remove(param(req, 'id'));
    res.status(204).end();
  }),
);

/**
 * Un agente externo (REST o MCP) puede identificarse con la cabecera
 * «x-lumen-agent: Nombre»: aparece como colaborador en el editor, en la
 * diapositiva y el elemento que está tocando.
 */
function announceAgent(req: Request, docId: string, result: Awaited<ReturnType<typeof store.apply>>) {
  let name = String(req.header('x-lumen-agent') ?? '');
  try {
    name = decodeURIComponent(name);
  } catch {
    /* se usa tal cual */
  }
  name = name.trim().slice(0, 40);
  if (!name) return;
  const touched = [...result.results].reverse().find((r) => r.ok && r.id)?.id;
  const slide =
    result.doc.slides.find((s) => s.id === touched) ?? result.doc.slides.find((s) => s.elements.some((e) => e.id === touched));
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'agente';
  updatePresence(docId, {
    clientId: `agent_${slug}`,
    name,
    color: '#d97757',
    kind: 'ai',
    slideId: slide?.id ?? result.doc.slides[0]?.id ?? '',
    selection: touched && slide && slide.id !== touched ? [touched] : [],
    cursor: null,
    editing: null,
    expires: Date.now() + 20000,
  });
}

app.post(
  '/api/presentations/:id/commands',
  wrap(async (req, res) => {
    const commands = Array.isArray(req.body) ? req.body : req.body?.commands;
    if (!Array.isArray(commands)) return res.status(400).json({ error: 'Se esperaba { commands: [...] }' });
    const result = await store.apply(param(req, 'id'), commands, origin(req));
    announceAgent(req, param(req, 'id'), result);
    res.json({
      results: result.results,
      rev: result.doc.rev,
      presentation: req.query.full ? result.doc : summarizePresentation(result.doc),
    });
  }),
);

app.get(
  '/api/presentations/:id/history',
  wrap(async (req, res) => res.json(await store.history(param(req, 'id')))),
);
app.post(
  '/api/presentations/:id/history',
  wrap(async (req, res) => {
    const doc = await store.get(param(req, 'id'));
    if (!doc) return res.status(404).json({ error: 'No encontrada' });
    res.status(201).json(await store.snapshot(doc, origin(req).startsWith('client_') ? 'editor' : origin(req), String(req.body?.label ?? '')));
  }),
);
app.get(
  '/api/presentations/:id/history/:vid',
  wrap(async (req, res) => {
    const doc = await store.version(param(req, 'id'), param(req, 'vid'));
    if (!doc) return res.status(404).json({ error: 'Versión no encontrada' });
    res.json(doc);
  }),
);
app.post(
  '/api/presentations/:id/history/:vid/restore',
  wrap(async (req, res) => {
    const doc = await store.restore(param(req, 'id'), param(req, 'vid'), 'restore');
    res.json({ rev: doc.rev });
  }),
);

app.get('/api/presentations/:id/events', (req, res) => {
  const id = param(req, 'id');
  const client = typeof req.query.client === 'string' ? req.query.client : '';
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: ready\ndata: {}\n\n`);
  const send = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
  const onDoc = (e: DocEvent) => send(e);
  const onPresence = (users: Presence[]) => send({ type: 'presence', users });
  const onComments = (comments: Comment[]) => send({ type: 'comments', comments });
  store.on(`doc:${id}`, onDoc);
  collab.on(`presence:${id}`, onPresence);
  collab.on(`comments:${id}`, onComments);
  // Estado inicial de colaboración.
  send({ type: 'presence', users: listPresence(id) });
  listComments(id).then((comments) => send({ type: 'comments', comments })).catch(() => {});
  const ping = setInterval(() => res.write(`: ping\n\n`), 20000);
  req.on('close', () => {
    clearInterval(ping);
    store.off(`doc:${id}`, onDoc);
    collab.off(`presence:${id}`, onPresence);
    collab.off(`comments:${id}`, onComments);
    if (client) removePresence(id, client);
  });
});

/* ---------- Colaboración ---------- */
app.post('/api/presentations/:id/presence', (req, res) => {
  const b = (req.body ?? {}) as Partial<Presence>;
  if (!b.clientId) return res.status(400).json({ error: 'Falta clientId' });
  updatePresence(param(req, 'id'), {
    clientId: String(b.clientId),
    name: String(b.name ?? 'Invitado').slice(0, 40),
    color: /^#[0-9a-f]{3,8}$/i.test(String(b.color)) ? String(b.color) : '#7c5cff',
    kind: 'human',
    slideId: String(b.slideId ?? '').slice(0, 64),
    cursor: b.cursor && typeof b.cursor.x === 'number' && typeof b.cursor.y === 'number' ? { x: b.cursor.x, y: b.cursor.y } : null,
    selection: Array.isArray(b.selection) ? b.selection.slice(0, 50).map(String) : [],
    editing: b.editing ? String(b.editing) : null,
  });
  res.status(204).end();
});
app.get('/api/presentations/:id/presence', (req, res) => res.json(listPresence(param(req, 'id'))));
app.get('/api/presentations/:id/comments', wrap(async (req, res) => res.json(await listComments(param(req, 'id')))));
app.post('/api/presentations/:id/comments', wrap(async (req, res) => res.status(201).json(await addComment(param(req, 'id'), req.body ?? {}))));
app.post(
  '/api/presentations/:id/comments/:cid/replies',
  wrap(async (req, res) => res.status(201).json(await replyComment(param(req, 'id'), param(req, 'cid'), req.body ?? {}))),
);
app.patch('/api/presentations/:id/comments/:cid', wrap(async (req, res) => res.json(await patchComment(param(req, 'id'), param(req, 'cid'), req.body ?? {}))));
app.delete(
  '/api/presentations/:id/comments/:cid',
  wrap(async (req, res) => {
    await deleteComment(param(req, 'id'), param(req, 'cid'));
    res.status(204).end();
  }),
);

/* ---------- Video MP4 de estudio ---------- */
app.get('/api/video/capabilities', (_req, res) => res.json(videoCapabilities()));
app.get('/api/video', (req, res) => res.json(listJobs(req.query.presentation ? String(req.query.presentation) : undefined)));
app.post(
  '/api/presentations/:id/video',
  wrap(async (req, res) => {
    const doc = await store.get(param(req, 'id'));
    if (!doc) return res.status(404).json({ error: 'No encontrada' });
    const caps = videoCapabilities();
    if (!caps.available) return res.status(501).json({ error: `Faltan dependencias: ${caps.missing.join(', ')}` });
    const b = (req.body ?? {}) as Partial<VideoRenderOptions> & { appUrl?: string };
    const clamp = (v: unknown, min: number, max: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
    const width = clamp(b.width, 320, 3840, 1920);
    const options: VideoRenderOptions = {
      width: Math.round(width / 2) * 2,
      height: Math.round((width * (doc.height / doc.width)) / 2) * 2,
      fps: [24, 25, 30, 50, 60].includes(Number(b.fps)) ? Number(b.fps) : 30,
      secondsPerSlide: clamp(b.secondsPerSlide, 0.5, 120, 3.5),
      secondsPerStep: clamp(b.secondsPerStep, 0.2, 30, 1.4),
      music: b.music !== false,
      narration: b.narration !== false,
      sfx: b.sfx !== false,
      quality: b.quality === 'draft' || b.quality === 'master' ? b.quality : 'high',
    };
    const appUrl = b.appUrl && isSafeAppUrl(b.appUrl) ? b.appUrl : defaultAppUrl(PORT);
    res.status(202).json(startVideoJob(doc.id, doc.title, appUrl, options));
  }),
);
app.get('/api/video/:job', (req, res) => {
  const job = getJob(param(req, 'job'));
  if (!job) return res.status(404).json({ error: 'Trabajo no encontrado' });
  res.json(job);
});
app.delete('/api/video/:job', (req, res) => {
  const job = cancelJob(param(req, 'job'));
  if (!job) return res.status(404).json({ error: 'Trabajo no encontrado' });
  res.json(job);
});
app.get('/api/video/:job/file', (req, res) => {
  const job = getJob(param(req, 'job'));
  if (!job?.file) return res.status(404).json({ error: 'Video no disponible' });
  const name = `${job.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'presentacion'}.mp4`;
  res.download(job.file, name);
});

/* ---------- Archivos ---------- */
const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'application/json': 'json',
};

app.post(
  '/api/assets',
  express.raw({ type: () => true, limit: '300mb' }),
  wrap(async (req, res) => {
    const type = (req.header('content-type') ?? '').split(';')[0].trim();
    const ext = MIME_EXT[type];
    if (!ext) return res.status(415).json({ error: `Tipo no admitido: ${type || 'desconocido'}` });
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) return res.status(400).json({ error: 'Archivo vacío' });
    const hash = createHash('sha256').update(body).digest('hex').slice(0, 20);
    const name = `${hash}.${ext}`;
    const file = path.join(ASSETS_DIR, name);
    if (!existsSync(file)) await fs.writeFile(file, body);
    res.status(201).json({ url: `/media/${name}`, type, size: body.length });
  }),
);
app.use(
  '/media',
  express.static(ASSETS_DIR, {
    maxAge: '30d',
    immutable: true,
    setHeaders: (res, file) => {
      if (file.endsWith('.svg')) res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    },
  }),
);

/* ---------- Asistente IA ---------- */
app.post('/api/ai/chat', async (req, res) => {
  const { presentationId, prompt, history } = (req.body ?? {}) as {
    presentationId?: string;
    prompt?: string;
    history?: ChatTurn[];
  };
  if (!aiAvailable()) {
    return res.status(501).json({
      error: 'El asistente necesita una clave de API de Anthropic. Inicia el servidor con ANTHROPIC_API_KEY=... npm run dev',
    });
  }
  if (!presentationId || !prompt?.trim()) return res.status(400).json({ error: 'Faltan presentationId o prompt' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const abort = new AbortController();
  res.on('close', () => abort.abort());
  const emit = (e: AiEvent) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(e)}\n\n`);
  };
  try {
    await runAssistant({
      presentationId,
      prompt,
      history: Array.isArray(history) ? history : [],
      emit,
      signal: abort.signal,
    });
  } catch (err) {
    if (!abort.signal.aborted) {
      console.error('[ai]', err);
      emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }
  emit({ type: 'done' });
  res.end();
});

/* ---------- App compilada (producción) ---------- */
const DIST = path.resolve(process.cwd(), 'dist');
if (existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api|media).*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

/* ---------- Errores ---------- */
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  void _next;
  const status = (err as { status?: number }).status ?? 500;
  const message = err instanceof Error ? err.message : String(err);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: message });
});

await store.init();
app.listen(PORT, HOST, () => {
  console.log(`\n  ✦ Lumen API escuchando en http://${HOST}:${PORT}/api`);
  console.log(`    Asistente IA: ${aiAvailable() ? `activo (${AI_MODEL})` : 'inactivo (define ANTHROPIC_API_KEY)'}`);
  if (TOKEN) console.log('    Escrituras protegidas con LUMEN_API_TOKEN');
});
