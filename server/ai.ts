/**
 * Asistente de IA integrado: Claude manipula la presentación usando la misma
 * API de comandos que el editor. Cada lote de comandos se guarda y se emite
 * por SSE, así el editor ve cómo se construye la presentación en vivo.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { API_GUIDE, commandJsonSchema, summarizePresentation } from '../src/core/commands';
import { store } from './store';
import { listComments, removePresence, replyComment, updatePresence } from './collab';

const AI_PRESENCE = { clientId: 'claude', name: 'Claude', color: '#d97757', kind: 'ai' as const };

export const AI_MODEL = process.env.LUMEN_AI_MODEL ?? 'claude-opus-5-5';
const EFFORT = (process.env.LUMEN_AI_EFFORT ?? 'medium') as 'low' | 'medium' | 'high' | 'xhigh' | 'max';
const MAX_ITERATIONS = 24;

export type AiEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string; summary: string; ok: boolean }
  | { type: 'status'; message: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
}

const SYSTEM = `Eres el diseñador de presentaciones integrado en Lumen, un editor de diapositivas HTML.
Trabajas manipulando el documento con la herramienta apply_commands. Tus cambios aparecen en vivo en el editor del usuario.

${API_GUIDE}

## Cómo trabajar
- Si te piden crear una presentación, primero elige un tema coherente con el tono y luego añade las diapositivas con plantillas (layout + content). Envía varios comandos por llamada (un lote por cada 2-4 diapositivas) para que el usuario vea el progreso.
- Si te piden editar, usa los ids del estado actual. Usa get_element para ver todas las propiedades de un elemento antes de un ajuste fino.
- Escribe contenido real, específico y conciso en el idioma del usuario; nunca dejes textos de relleno tipo "Lorem ipsum".
- Cuida la composición: márgenes de ~140 px, jerarquía tipográfica clara, contraste suficiente, una idea por diapositiva.
- Usa imágenes solo con URLs que conozcas como estables (p. ej. images.unsplash.com/photo-...?w=1920&q=80); si no, prefiere fondos de efecto.
- Si un comando falla, lee el error y corrígelo.
- Si te piden atender comentarios, usa list_comments, aplica los cambios y responde con reply_comment (resolve: true).
- Al terminar, responde con un resumen breve (2-4 frases) de lo que hiciste. Sin listas largas.`;

const ApplyInput = z.object({ commands: z.array(z.record(z.string(), z.unknown())).min(1) });
const GetElementInput = z.object({ element: z.string() });

function buildTools(): Anthropic.Beta.BetaTool[] {
  return [
    {
      name: 'apply_commands',
      description:
        'Aplica una lista de comandos de edición a la presentación (ver la guía de la API). Devuelve el resultado de cada comando y un resumen actualizado del documento.',
      eager_input_streaming: true,
      input_schema: {
        type: 'object',
        properties: {
          commands: { type: 'array', items: commandJsonSchema(), minItems: 1 },
        },
        required: ['commands'],
      },
    },
    {
      name: 'get_presentation',
      description: 'Devuelve un resumen del estado actual de la presentación (diapositivas, elementos e ids).',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'list_comments',
      description: 'Devuelve los comentarios de la presentación (con su diapositiva, elemento, respuestas y si están resueltos).',
      input_schema: { type: 'object', properties: { includeResolved: { type: 'boolean' } } },
    },
    {
      name: 'reply_comment',
      description: 'Responde a un comentario (p. ej. explicando el cambio realizado) y opcionalmente lo marca como resuelto.',
      input_schema: {
        type: 'object',
        properties: { comment: { type: 'string', description: 'Id del comentario.' }, text: { type: 'string' }, resolve: { type: 'boolean' } },
        required: ['comment', 'text'],
      },
    },
    {
      name: 'get_element',
      description: 'Devuelve el JSON completo de un elemento (estilo, animación y todas sus propiedades).',
      input_schema: {
        type: 'object',
        properties: { element: { type: 'string', description: 'Id del elemento.' } },
        required: ['element'],
      },
    },
  ];
}

function describeCommand(c: Record<string, unknown>): string {
  const op = String(c.op ?? '?');
  if (op === 'slide.add') return `Añadir diapositiva${c.layout ? ` «${String(c.layout)}»` : ''}`;
  if (op === 'theme.set') return `Tema ${c.preset ? `«${String(c.preset)}»` : 'personalizado'}`;
  if (op.startsWith('element.')) return `${op.replace('element.', 'Elemento: ')}`;
  if (op.startsWith('slide.')) return `${op.replace('slide.', 'Diapositiva: ')}`;
  return op;
}

async function runTool(
  presentationId: string,
  name: string,
  input: unknown,
  emit: (e: AiEvent) => void,
): Promise<{ content: string; isError: boolean }> {
  if (name === 'get_presentation') {
    const doc = await store.get(presentationId);
    return { content: JSON.stringify(doc ? summarizePresentation(doc) : null), isError: !doc };
  }
  if (name === 'list_comments') {
    const all = await listComments(presentationId);
    const include = Boolean((input as { includeResolved?: boolean })?.includeResolved);
    return { content: JSON.stringify(all.filter((c) => include || !c.resolved)), isError: false };
  }
  if (name === 'reply_comment') {
    const i = input as { comment?: string; text?: string; resolve?: boolean };
    if (!i?.comment || !i.text) return { content: 'Se requieren "comment" y "text".', isError: true };
    const c = await replyComment(presentationId, i.comment, { text: i.text, resolve: !!i.resolve, author: 'Claude', color: AI_PRESENCE.color });
    emit({ type: 'tool', name, ok: true, summary: `Respondió un comentario${i.resolve ? ' y lo resolvió' : ''}` });
    return { content: JSON.stringify(c), isError: false };
  }
  if (name === 'get_element') {
    const parsed = GetElementInput.safeParse(input);
    if (!parsed.success) return { content: 'Entrada inválida: se requiere "element".', isError: true };
    const doc = await store.get(presentationId);
    const el = doc?.slides.flatMap((s) => s.elements).find((e) => e.id === parsed.data.element);
    return el ? { content: JSON.stringify(el), isError: false } : { content: 'Elemento no encontrado', isError: true };
  }
  if (name === 'apply_commands') {
    const parsed = ApplyInput.safeParse(input);
    if (!parsed.success) {
      return { content: JSON.stringify({ INVALID_JSON: JSON.stringify(input).slice(0, 2000) }), isError: true };
    }
    const result = await store.apply(presentationId, parsed.data.commands, 'ai');
    const okCount = result.results.filter((r) => r.ok).length;
    // La presencia de la IA sigue a la diapositiva que está editando.
    const touched = [...result.results].reverse().find((r) => r.ok && r.id)?.id;
    const slide =
      result.doc.slides.find((s) => s.id === touched) ?? result.doc.slides.find((s) => s.elements.some((e) => e.id === touched));
    if (slide) updatePresence(presentationId, { ...AI_PRESENCE, slideId: slide.id, selection: slide.id === touched ? [] : [touched!] });
    const labels = parsed.data.commands.map(describeCommand);
    const unique = [...new Set(labels)];
    emit({
      type: 'tool',
      name,
      ok: okCount === result.results.length,
      summary: `${unique.slice(0, 3).join(' · ')}${unique.length > 3 ? ` +${unique.length - 3}` : ''} (${okCount}/${result.results.length})`,
    });
    return {
      content: JSON.stringify({ results: result.results, presentation: summarizePresentation(result.doc) }),
      isError: okCount === 0,
    };
  }
  return { content: `Herramienta desconocida: ${name}`, isError: true };
}

export async function runAssistant(opts: {
  presentationId: string;
  prompt: string;
  history: ChatTurn[];
  emit: (e: AiEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { presentationId, prompt, emit, signal } = opts;
  const doc = await store.get(presentationId);
  if (!doc) throw new Error('Presentación no encontrada');

  const client = new Anthropic();
  const tools = buildTools();
  updatePresence(presentationId, { ...AI_PRESENCE, slideId: doc.slides[0]?.id ?? '' });
  try {
    await loop();
  } finally {
    removePresence(presentationId, AI_PRESENCE.clientId);
  }

  async function loop() {
  const history: Anthropic.Beta.BetaMessageParam[] = opts.history
    .filter((t) => t.content.trim())
    .slice(-12)
    .map((t) => ({ role: t.role, content: t.content }));
  // La API exige alternancia user/assistant empezando por user.
  while (history.length && history[0].role !== 'user') history.shift();
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history,
    {
      role: 'user',
      content: `Estado actual de la presentación (resumen JSON):\n${JSON.stringify(summarizePresentation(doc!))}\n\nPetición:\n${prompt}`,
    },
  ];

  let jsonRetries = 0;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (signal?.aborted) return;
    const stream = client.beta.messages.stream(
      {
        model: AI_MODEL,
        max_tokens: 64000,
        system: SYSTEM,
        tools,
        messages,
        thinking: { type: 'adaptive' },
        output_config: { effort: EFFORT },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      },
      { signal },
    );
    stream.on('text', (delta) => emit({ type: 'text', delta }));

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      if (err instanceof Anthropic.APIError || signal?.aborted || jsonRetries++ >= 2) throw err;
      emit({ type: 'status', message: 'Reintentando: la entrada de la herramienta llegó incompleta…' });
      continue;
    }

    if (message.stop_reason === 'refusal') {
      emit({ type: 'error', message: 'El modelo rechazó esta petición.' });
      return;
    }
    if (message.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: message.content });
      continue;
    }
    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (message.stop_reason === 'end_turn' || toolUses.length === 0) return;
    if (message.stop_reason === 'max_tokens') {
      emit({ type: 'error', message: 'La respuesta se cortó (max_tokens). Intenta con una petición más acotada.' });
      return;
    }

    messages.push({ role: 'assistant', content: message.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      try {
        const r = await runTool(presentationId, tu.name, tu.input, emit);
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: r.content, is_error: r.isError || undefined });
      } catch (err) {
        results.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: err instanceof Error ? err.message : String(err),
          is_error: true,
        });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  emit({ type: 'status', message: 'Se alcanzó el número máximo de pasos.' });
  }
}
