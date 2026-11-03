import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Bot, Check, CircleAlert, Copy, Square, Sparkles, Terminal, Plug, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { API_GUIDE, commandJsonSchema, type CommandResult } from '../../core/commands';
import { sfx } from '../lib/sound';
import { CLIENT_ID } from '../lib/sync';
import { useEditor } from '../store/editor';
import { IconButton } from './ui/IconButton';
import { Segmented } from './ui/fields';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  tools: { summary: string; ok: boolean }[];
  error?: string;
  pending?: boolean;
}

const SUGGESTIONS = [
  'Crea una presentación de 6 diapositivas sobre el futuro de la energía solar, tono inspirador',
  'Haz un pitch de 8 diapositivas para una app de recetas con IA',
  'Mejora el diseño de la diapositiva actual y añade animaciones',
  'Traduce toda la presentación al inglés',
  'Cambia a un estilo editorial elegante en blanco y negro',
  'Añade notas del orador a cada diapositiva',
];

/** El historial del chat persiste aunque el panel se cierre. */
const useChat = create<{ messages: ChatMessage[]; busy: boolean }>(() => ({ messages: [], busy: false }));
const setMessages = (fn: ChatMessage[] | ((m: ChatMessage[]) => ChatMessage[])) =>
  useChat.setState((s) => ({ messages: typeof fn === 'function' ? fn(s.messages) : fn }));
const setBusy = (busy: boolean) => useChat.setState({ busy });
let currentAbort: AbortController | null = null;

function copy(text: string) {
  navigator.clipboard?.writeText(text).then(
    () => {
      sfx('success');
      useEditor.getState().toast('Copiado al portapapeles', 'success');
    },
    () => useEditor.getState().toast('No se pudo copiar', 'error'),
  );
}

function Assistant({ available }: { available: boolean | null }) {
  const messages = useChat((s) => s.messages);
  const busy = useChat((s) => s.busy);
  const [input, setInput] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const serverMode = useEditor((s) => s.serverMode);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async (prompt: string) => {
    if (!prompt.trim() || busy) return;
    const st = useEditor.getState();
    const history = messages.filter((m) => !m.error && m.content).map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: 'user', content: prompt, tools: [] }, { role: 'assistant', content: '', tools: [], pending: true }]);
    setInput('');
    setBusy(true);
    sfx('whoosh');
    const ctrl = new AbortController();
    currentAbort = ctrl;
    const update = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((all) => {
        const next = [...all];
        next[next.length - 1] = fn(next[next.length - 1]);
        return next;
      });
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-lumen-client': CLIENT_ID },
        body: JSON.stringify({ presentationId: st.doc.id, prompt, history }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? 'Error del asistente');
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          const evt = JSON.parse(line.slice(6)) as
            | { type: 'text'; delta: string }
            | { type: 'tool'; summary: string; ok: boolean }
            | { type: 'status'; message: string }
            | { type: 'error'; message: string }
            | { type: 'done' };
          if (evt.type === 'text') update((m) => ({ ...m, content: m.content + evt.delta }));
          if (evt.type === 'tool') {
            sfx(evt.ok ? 'pop' : 'error');
            update((m) => ({ ...m, tools: [...m.tools, { summary: evt.summary, ok: evt.ok }] }));
          }
          if (evt.type === 'status') update((m) => ({ ...m, tools: [...m.tools, { summary: evt.message, ok: true }] }));
          if (evt.type === 'error') update((m) => ({ ...m, error: evt.message }));
        }
      }
      sfx('success');
    } catch (err) {
      if (!ctrl.signal.aborted) {
        sfx('error');
        update((m) => ({ ...m, error: err instanceof Error ? err.message : String(err) }));
      }
    } finally {
      update((m) => ({ ...m, pending: false }));
      setBusy(false);
      currentAbort = null;
    }
  };

  if (!serverMode || available === false) {
    return (
      <div className="ai-setup">
        <div className="ai-orb">
          <Bot size={26} />
        </div>
        <h3>{serverMode ? 'Conecta una clave de Anthropic' : 'Inicia el servidor de Lumen'}</h3>
        <p>
          {serverMode
            ? 'El asistente integrado usa Claude para construir y editar tus presentaciones en vivo.'
            : 'El asistente y la API para IAs viven en el servidor local. Sin él, puedes usar la consola de comandos.'}
        </p>
        <pre className="code">{serverMode ? 'ANTHROPIC_API_KEY=sk-ant-… npm run dev' : 'npm install\nnpm run dev'}</pre>
        <p className="hint">Mientras tanto, la pestaña «API» te permite pegar comandos generados por cualquier IA.</p>
      </div>
    );
  }

  return (
    <div className="ai-chat">
      <div className="ai-messages" ref={list}>
        {!messages.length && (
          <div className="ai-empty">
            <motion.div className="ai-orb" animate={{ rotate: 360 }} transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}>
              <Sparkles size={24} />
            </motion.div>
            <h3>¿Qué quieres crear?</h3>
            <p>Describe la presentación y mira cómo se construye en vivo. Puedes deshacer cualquier cambio con ⌘Z.</p>
            <div className="ai-suggestions">
              {SUGGESTIONS.map((s) => (
                <motion.button key={s} className="ai-suggestion" whileHover={{ x: 3 }} onClick={() => send(s)}>
                  {s}
                </motion.button>
              ))}
            </div>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              className={`ai-msg ai-${m.role}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            >
              {m.tools.length > 0 && (
                <ul className="ai-tools">
                  {m.tools.map((t, j) => (
                    <motion.li key={j} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className={t.ok ? '' : 'is-error'}>
                      {t.ok ? <Check size={12} /> : <CircleAlert size={12} />} {t.summary}
                    </motion.li>
                  ))}
                </ul>
              )}
              {m.content && <div className="ai-text">{m.content}</div>}
              {m.pending && !m.content && (
                <div className="ai-typing">
                  <span />
                  <span />
                  <span />
                </div>
              )}
              {m.error && (
                <div className="ai-error">
                  <CircleAlert size={13} /> {m.error}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <form
        className="ai-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          rows={2}
          placeholder="Pide algo: «Añade una diapositiva de precios con 3 planes»"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          disabled={available === null}
        />
        {busy ? (
          <IconButton icon={Square} label="Detener" variant="solid" onClick={() => currentAbort?.abort()} />
        ) : (
          <IconButton icon={ArrowUp} label="Enviar" variant="primary" anim="up" disabled={!input.trim()} onClick={() => send(input)} />
        )}
      </form>
    </div>
  );
}

const EXAMPLE = `[
  { "op": "theme.set", "preset": "ocean" },
  { "op": "slide.add", "layout": "title",
    "content": { "title": "Hola desde la API", "subtitle": "Creado con comandos JSON" } },
  { "op": "slide.add", "layout": "stats",
    "content": { "title": "Métricas", "stats": [
      { "value": "42", "label": "Respuesta" }, { "value": "∞", "label": "Ideas" } ] } }
]`;

function ApiConsole() {
  const [text, setText] = useState(EXAMPLE);
  const [results, setResults] = useState<CommandResult[] | null>(null);
  const serverMode = useEditor((s) => s.serverMode);
  const docId = useEditor((s) => s.doc.id);
  const origin = window.location.origin;

  const run = () => {
    try {
      const parsed = JSON.parse(text);
      const cmds = Array.isArray(parsed) ? parsed : Array.isArray(parsed.commands) ? parsed.commands : [parsed];
      const res = useEditor.getState().dispatch(cmds);
      setResults(res);
      sfx(res.every((r) => r.ok) ? 'success' : 'error');
    } catch (err) {
      setResults([{ ok: false, op: 'JSON', error: err instanceof Error ? err.message : String(err) }]);
      sfx('error');
    }
  };

  const promptForAi = `${API_GUIDE}\n\n## Esquema JSON de cada comando\n${JSON.stringify(commandJsonSchema())}\n\nResponde SOLO con un array JSON de comandos.`;
  const mcpConfig = JSON.stringify(
    { mcpServers: { lumen: { command: 'npx', args: ['tsx', 'server/mcp.ts'], env: { LUMEN_URL: 'http://localhost:4317' } } } },
    null,
    2,
  );
  const curl = `curl -X POST ${serverMode ? origin.replace(':5173', ':4317') : 'http://localhost:4317'}/api/presentations/${docId}/commands \\
  -H 'Content-Type: application/json' \\
  -d '{"commands":[{"op":"slide.add","layout":"quote","content":{"quote":"Hola"}}]}'`;

  return (
    <div className="api-console">
      <section>
        <header>
          <Terminal size={14} /> Consola de comandos
        </header>
        <p className="hint">Pega comandos JSON (de cualquier IA) y ejecútalos sobre la presentación abierta.</p>
        <textarea className="code-area" value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run();
        }} />
        <div className="btn-row">
          <button className="btn primary" onClick={run}>
            Ejecutar <kbd>⌘↵</kbd>
          </button>
          <button className="btn soft" onClick={() => copy(promptForAi)}>
            <Copy size={13} /> Copiar guía para tu IA
          </button>
        </div>
        {results && (
          <ul className="api-results">
            {results.map((r, i) => (
              <li key={i} className={r.ok ? 'ok' : 'err'}>
                {r.ok ? <Check size={12} /> : <X size={12} />} <code>{r.op}</code> {r.ok ? r.id : r.error}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <header>
          <Plug size={14} /> Conecta tu IA
        </header>
        <p className="hint">
          <b>REST</b> {serverMode ? '(activo)' : '(requiere npm run dev)'} — los cambios aparecen aquí en vivo:
        </p>
        <pre className="code" onClick={() => copy(curl)} title="Clic para copiar">{curl}</pre>
        <p className="hint">
          <b>MCP</b> para Claude Desktop / Claude Code:
        </p>
        <pre className="code" onClick={() => copy(mcpConfig)} title="Clic para copiar">{mcpConfig}</pre>
        <p className="hint">
          <b>Navegador</b>: <code>window.lumen.apply([...])</code>, <code>window.lumen.getSummary()</code>, o{' '}
          <code>postMessage({'{'} type: 'lumen:command', commands {'}'})</code> desde un iframe anfitrión.
        </p>
      </section>
    </div>
  );
}

export function AIPanel() {
  const open = useEditor((s) => s.aiOpen);
  const [tab, setTab] = useState<'chat' | 'api'>('chat');
  const [available, setAvailable] = useState<boolean | null>(null);
  const serverMode = useEditor((s) => s.serverMode);

  useEffect(() => {
    if (!open || !serverMode) return;
    fetch('/api/health')
      .then((r) => r.json())
      .then((d: { ai: boolean }) => setAvailable(d.ai))
      .catch(() => setAvailable(false));
  }, [open, serverMode]);

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          className="ai-panel"
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 34 }}
        >
          <header className="ai-head">
            <span className="ai-title">
              <Sparkles size={15} /> Inteligencia artificial
            </span>
            <Segmented
              layoutId="ai-tab"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'chat', label: 'Asistente' },
                { value: 'api', label: 'API' },
              ]}
            />
            <IconButton icon={X} label="Cerrar" anim="spin" sound="close" onClick={() => useEditor.setState({ aiOpen: false })} />
          </header>
          <div className="ai-body">
            <div className="ai-pane" hidden={tab !== 'chat'}>
              <Assistant available={available} />
            </div>
            <div className="ai-pane" hidden={tab !== 'api'}>
              <ApiConsole />
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
