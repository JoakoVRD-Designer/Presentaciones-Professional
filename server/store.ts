import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { applyCommands, type ApplyResult } from '../src/core/commands';
import { normalizePresentation, type Presentation } from '../src/core/model';
import { createFromTemplate } from '../src/core/templates';

export const DATA_DIR = path.resolve(process.env.LUMEN_DATA_DIR ?? path.join(process.cwd(), 'data'));
const DOCS_DIR = path.join(DATA_DIR, 'presentations');
export const ASSETS_DIR = path.join(DATA_DIR, 'assets');
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const HISTORY_LIMIT = 100;
const SNAPSHOT_INTERVAL = 2 * 60 * 1000;

export interface VersionMeta {
  id: string;
  at: string;
  origin: string;
  label: string;
  title: string;
  slides: number;
}

export interface DocEvent {
  type: 'doc';
  doc: Presentation;
  /** Quién originó el cambio (id de cliente, "ai", "api", "mcp"). */
  origin: string;
}

export interface PresentationMeta {
  id: string;
  title: string;
  slides: number;
  updatedAt?: string;
  theme: string;
}

const SAFE_ID = /^[a-zA-Z0-9_-]{1,64}$/;

class Store extends EventEmitter {
  private cache = new Map<string, Presentation>();
  private writing = new Map<string, Promise<void>>();
  private locks = new Map<string, Promise<unknown>>();
  private lastSnapshot = new Map<string, { at: number; origin: string }>();

  /** Serializa las operaciones de lectura-modificación-escritura por documento. */
  withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    this.locks.set(
      id,
      run.catch(() => {}),
    );
    return run;
  }

  async init() {
    await fs.mkdir(DOCS_DIR, { recursive: true });
    await fs.mkdir(ASSETS_DIR, { recursive: true });
    await fs.mkdir(HISTORY_DIR, { recursive: true });
  }

  /* ---------------- Historial de versiones ---------------- */

  private historyDir(id: string) {
    this.file(id); // valida el id
    return path.join(HISTORY_DIR, id);
  }

  /** Guarda una instantánea de `doc` (la versión que está a punto de ser reemplazada). */
  async snapshot(doc: Presentation, origin: string, label = ''): Promise<VersionMeta> {
    const dir = this.historyDir(doc.id);
    await fs.mkdir(dir, { recursive: true });
    const at = new Date().toISOString();
    const vid = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const meta: VersionMeta = { id: vid, at, origin, label, title: doc.title, slides: doc.slides.length };
    await fs.writeFile(path.join(dir, `${vid}.json`), JSON.stringify({ meta, doc }));
    this.lastSnapshot.set(doc.id, { at: Date.now(), origin });
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - HISTORY_LIMIT))) await fs.rm(path.join(dir, f), { force: true });
    return meta;
  }

  /** Decide si conviene guardar la versión anterior antes de un cambio. */
  private async maybeSnapshot(prev: Presentation | undefined, origin: string) {
    if (!prev) return;
    const last = this.lastSnapshot.get(prev.id);
    const external = !origin.startsWith('client_');
    const stale = !last || Date.now() - last.at > SNAPSHOT_INTERVAL;
    const originChanged = last && last.origin !== origin;
    if (stale || (external && originChanged) || (!last && external)) {
      await this.snapshot(prev, origin.startsWith('client_') ? 'editor' : origin).catch(() => {});
    }
  }

  async history(id: string): Promise<VersionMeta[]> {
    const dir = this.historyDir(id);
    const files = (await fs.readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.json')).sort().reverse();
    const out: VersionMeta[] = [];
    for (const f of files) {
      try {
        out.push((JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')) as { meta: VersionMeta }).meta);
      } catch {
        /* ignora versiones corruptas */
      }
    }
    return out;
  }

  async version(id: string, vid: string): Promise<Presentation | null> {
    if (!/^[\w-]+$/.test(vid)) return null;
    try {
      const raw = JSON.parse(await fs.readFile(path.join(this.historyDir(id), `${vid}.json`), 'utf8')) as { doc: unknown };
      return normalizePresentation(raw.doc);
    } catch {
      return null;
    }
  }

  restore(id: string, vid: string, origin: string) {
    return this.withLock(id, async () => {
      const current = await this.get(id);
      const old = await this.version(id, vid);
      if (!current || !old) throw Object.assign(new Error('Versión no encontrada'), { status: 404 });
      await this.snapshot(current, 'restore', 'Antes de restaurar');
      return this.save({ ...old, id, rev: current.rev }, origin);
    });
  }

  private file(id: string) {
    if (!SAFE_ID.test(id)) throw new Error('Id de presentación inválido');
    return path.join(DOCS_DIR, `${id}.json`);
  }

  async list(): Promise<PresentationMeta[]> {
    const files = await fs.readdir(DOCS_DIR).catch(() => [] as string[]);
    const out: PresentationMeta[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const doc = await this.get(f.slice(0, -5)).catch(() => null);
      if (doc) {
        out.push({ id: doc.id, title: doc.title, slides: doc.slides.length, updatedAt: doc.updatedAt, theme: doc.theme.name });
      }
    }
    return out.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  }

  async get(id: string): Promise<Presentation | null> {
    const cached = this.cache.get(id);
    if (cached) return cached;
    try {
      const raw = await fs.readFile(this.file(id), 'utf8');
      const doc = normalizePresentation(JSON.parse(raw));
      this.cache.set(id, doc);
      return doc;
    } catch {
      return null;
    }
  }

  private async persist(doc: Presentation) {
    const prev = this.writing.get(doc.id) ?? Promise.resolve();
    const next = prev.then(async () => {
      const tmp = `${this.file(doc.id)}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(doc, null, 2));
      await fs.rename(tmp, this.file(doc.id));
    });
    this.writing.set(doc.id, next.catch(() => {}));
    await next;
  }

  async save(doc: Presentation, origin: string): Promise<Presentation> {
    const current = this.cache.get(doc.id);
    await this.maybeSnapshot(current, origin);
    const saved: Presentation = {
      ...doc,
      rev: Math.max(doc.rev ?? 0, current?.rev ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    this.cache.set(saved.id, saved);
    await this.persist(saved);
    this.emit(`doc:${saved.id}`, { type: 'doc', doc: saved, origin } satisfies DocEvent);
    this.emit('list');
    return saved;
  }

  async create(opts: { template?: string; title?: string; document?: unknown }, origin: string) {
    const doc = opts.document
      ? normalizePresentation({ ...(opts.document as object), id: undefined })
      : createFromTemplate(opts.template ?? 'blank', opts.title);
    // Los documentos producidos por los comandos están congelados (immer): se copia.
    return this.save(opts.title ? { ...doc, title: opts.title } : doc, origin);
  }

  async remove(id: string) {
    this.cache.delete(id);
    await fs.rm(this.file(id), { force: true });
    this.emit('list');
  }

  apply(id: string, commands: unknown[], origin: string): Promise<ApplyResult & { doc: Presentation }> {
    return this.withLock(id, async () => {
      const doc = await this.get(id);
      if (!doc) throw Object.assign(new Error('Presentación no encontrada'), { status: 404 });
      const result = applyCommands(doc, commands);
      const saved = result.changed ? await this.save(result.doc, origin) : doc;
      return { ...result, doc: saved };
    });
  }

  /** Reemplazo completo desde el editor, con control de versión optimista. */
  replace(doc: Presentation, baseRev: number | undefined, origin: string) {
    return this.withLock(doc.id, async () => {
      const current = await this.get(doc.id);
      if (current && baseRev !== undefined && current.rev > baseRev) {
        return { conflict: true as const, doc: current };
      }
      const saved = await this.save({ ...doc, createdAt: current?.createdAt ?? doc.createdAt }, origin);
      return { conflict: false as const, doc: saved };
    });
  }
}

export const store = new Store();
store.setMaxListeners(200);
