/**
 * Servidor MCP (stdio) de Lumen.
 *
 * Permite que cualquier cliente MCP (Claude Desktop, Claude Code, etc.) cree y
 * edite presentaciones. Habla con la API REST del servidor Lumen en ejecución,
 * así que los cambios aparecen en vivo en el editor abierto.
 *
 *   LUMEN_URL=http://localhost:4317 npx tsx server/mcp.ts
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { API_GUIDE, commandJsonSchema } from '../src/core/commands';
import { LAYOUTS, LayoutContentSchema } from '../src/core/layouts';
import { THEMES } from '../src/core/themes';

const BASE = (process.env.LUMEN_URL ?? 'http://localhost:4317').replace(/\/$/, '');
const TOKEN = process.env.LUMEN_API_TOKEN ?? '';

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-lumen-client': 'mcp',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Lumen ${res.status}: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : null) as T;
}

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });
const fail = (err: unknown) => ({
  isError: true,
  content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
});

const server = new McpServer({ name: 'lumen-slides', version: '1.0.0' });

server.registerTool(
  'lumen_guide',
  {
    title: 'Guía de la API de Lumen',
    description: 'Explica el modelo de documento, los comandos, plantillas, temas y buenas prácticas de diseño. Léela antes de editar.',
    inputSchema: {},
  },
  async () => ok(`${API_GUIDE}\n\n## JSON Schema de un comando\n${JSON.stringify(commandJsonSchema())}`),
);

server.registerTool(
  'list_presentations',
  { title: 'Listar presentaciones', description: 'Lista las presentaciones guardadas.', inputSchema: {} },
  async () => {
    try {
      return ok(await api('GET', '/presentations'));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  'create_presentation',
  {
    title: 'Crear presentación',
    description: 'Crea una presentación nueva. Plantillas: showcase, pitch, blank. Devuelve su id y la URL del editor.',
    inputSchema: {
      title: z.string().optional(),
      template: z.enum(['blank', 'showcase', 'pitch']).optional(),
      theme: z.enum(THEMES.map((t) => t.id) as [string, ...string[]]).optional(),
    },
  },
  async ({ title, template, theme }) => {
    try {
      const doc = await api<{ id: string }>('POST', '/presentations', { title, template: template ?? 'blank' });
      if (theme) await api('POST', `/presentations/${doc.id}/commands`, { commands: [{ op: 'theme.set', preset: theme }] });
      return ok({ id: doc.id, editor: `${BASE.replace(':4317', ':5173')}/?p=${doc.id}` });
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  'get_presentation',
  {
    title: 'Ver presentación',
    description: 'Devuelve el resumen (por defecto) o el documento completo de una presentación.',
    inputSchema: { id: z.string(), full: z.boolean().optional() },
  },
  async ({ id, full }) => {
    try {
      return ok(await api('GET', `/presentations/${id}${full ? '' : '?summary=1'}`));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  'apply_commands',
  {
    title: 'Aplicar comandos',
    description:
      'Aplica una lista de comandos de edición (ver lumen_guide). Ej.: [{"op":"slide.add","layout":"title","content":{"title":"Hola"}}]. Devuelve el resultado de cada comando y el resumen actualizado.',
    inputSchema: {
      id: z.string().describe('Id de la presentación.'),
      commands: z.array(z.record(z.string(), z.unknown())).min(1),
    },
  },
  async ({ id, commands }) => {
    try {
      return ok(await api('POST', `/presentations/${id}/commands`, { commands }));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  'add_slide',
  {
    title: 'Añadir diapositiva desde plantilla',
    description: `Atajo para añadir una diapositiva bien diseñada. Plantillas: ${LAYOUTS.map((l) => `${l.id} — ${l.description}`).join(' | ')}`,
    inputSchema: {
      id: z.string(),
      layout: z.enum(LAYOUTS.map((l) => l.id) as [string, ...string[]]),
      content: LayoutContentSchema,
      index: z.number().int().optional(),
      notes: z.string().optional(),
    },
  },
  async ({ id, layout, content, index, notes }) => {
    try {
      return ok(
        await api('POST', `/presentations/${id}/commands`, {
          commands: [{ op: 'slide.add', layout, content, index, slide: notes ? { notes } : undefined }],
        }),
      );
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  'delete_presentation',
  {
    title: 'Eliminar presentación',
    description: 'Elimina una presentación de forma permanente.',
    inputSchema: { id: z.string() },
    annotations: { destructiveHint: true },
  },
  async ({ id }) => {
    try {
      await api('DELETE', `/presentations/${id}`);
      return ok('Eliminada');
    } catch (e) {
      return fail(e);
    }
  },
);

await server.connect(new StdioServerTransport());
