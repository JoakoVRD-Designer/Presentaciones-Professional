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
      'POST /api/presentations/:id/commands': 'Aplicar comandos { commands: [...] }',
      'GET /api/presentations/:id/events': 'Stream SSE de cambios',
      'POST /api/assets': 'Subir archivo (cuerpo binario, cabecera Content-Type)',
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

app.post(
  '/api/presentations/:id/commands',
  wrap(async (req, res) => {
    const commands = Array.isArray(req.body) ? req.body : req.body?.commands;
    if (!Array.isArray(commands)) return res.status(400).json({ error: 'Se esperaba { commands: [...] }' });
    const result = await store.apply(param(req, 'id'), commands, origin(req));
    res.json({
      results: result.results,
      rev: result.doc.rev,
      presentation: req.query.full ? result.doc : summarizePresentation(result.doc),
    });
  }),
);

app.get('/api/presentations/:id/events', (req, res) => {
  const id = param(req, 'id');
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: ready\ndata: {}\n\n`);
  const onDoc = (e: DocEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  store.on(`doc:${id}`, onDoc);
  const ping = setInterval(() => res.write(`: ping\n\n`), 20000);
  req.on('close', () => {
    clearInterval(ping);
    store.off(`doc:${id}`, onDoc);
  });
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
    res.status(201).json({ url: `/assets/${name}`, type, size: body.length });
  }),
);
app.use(
  '/assets',
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
  app.get(/^\/(?!api|assets).*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
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
