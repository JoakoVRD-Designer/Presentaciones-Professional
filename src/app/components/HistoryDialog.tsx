import { motion } from 'framer-motion';
import { Clock3, RotateCcw, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { normalizePresentation, type Presentation } from '../../core/model';
import { sfx } from '../lib/sound';
import { CLIENT_ID, flushNow } from '../lib/sync';
import { useEditor } from '../store/editor';
import { Thumb } from './SlideRail';
import { Dialog } from './ui/Popover';

interface VersionMeta {
  id: string;
  at: string;
  origin: string;
  label: string;
  title: string;
  slides: number;
}

const ORIGIN: Record<string, string> = {
  editor: 'Edición',
  ai: 'Antes de cambios de la IA',
  api: 'Antes de cambios por API',
  mcp: 'Antes de cambios por MCP',
  restore: 'Restauración',
};

function when(iso: string) {
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  const rel = s < 60 ? 'hace un momento' : s < 3600 ? `hace ${Math.floor(s / 60)} min` : s < 86400 ? `hace ${Math.floor(s / 3600)} h` : d.toLocaleDateString();
  return `${rel} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function HistoryDialog() {
  const open = useEditor((s) => s.historyOpen);
  const serverMode = useEditor((s) => s.serverMode);
  const id = useEditor((s) => s.doc.id);
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<Presentation | null>(null);
  const close = () => useEditor.setState({ historyOpen: false });
  const headers = { 'Content-Type': 'application/json', 'x-lumen-client': CLIENT_ID };

  const load = () =>
    fetch(`/api/presentations/${id}/history`)
      .then((r) => r.json())
      .then((v: VersionMeta[]) => setVersions(Array.isArray(v) ? v : []))
      .catch(() => setVersions([]));

  useEffect(() => {
    if (!open || !serverMode) return;
    setSelected(null);
    setPreview(null);
    flushNow().finally(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id, serverMode]);

  useEffect(() => {
    if (!selected) return;
    fetch(`/api/presentations/${id}/history/${selected}`)
      .then((r) => r.json())
      .then((d) => setPreview(normalizePresentation(d)))
      .catch(() => setPreview(null));
  }, [selected, id]);

  const saveNow = async () => {
    await flushNow();
    await fetch(`/api/presentations/${id}/history`, { method: 'POST', headers, body: JSON.stringify({ label: 'Guardada manualmente' }) });
    sfx('success');
    load();
  };

  const restore = async () => {
    if (!selected) return;
    await flushNow();
    const res = await fetch(`/api/presentations/${id}/history/${selected}/restore`, { method: 'POST', headers });
    if (res.ok) {
      sfx('chime');
      useEditor.getState().toast('Versión restaurada. Puedes deshacerlo con ⌘Z o desde el historial.', 'success');
      close();
    } else {
      useEditor.getState().toast('No se pudo restaurar la versión', 'error');
    }
  };

  return (
    <Dialog open={open} onClose={close} title="Historial de versiones" icon={<Clock3 size={18} />} width={900}>
      {!serverMode ? (
        <p className="muted">El historial de versiones necesita el servidor de Lumen («npm run dev»).</p>
      ) : (
        <div className="history">
          <aside className="history-list">
            <button className="btn soft wide" onClick={saveNow}>
              <Save size={14} /> Guardar versión ahora
            </button>
            {versions.map((v, i) => (
              <motion.button
                key={v.id}
                className={`history-row${selected === v.id ? ' is-active' : ''}`}
                onClick={() => {
                  setSelected(v.id);
                  sfx('tick');
                }}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
              >
                <b>{v.label || ORIGIN[v.origin] || v.origin}</b>
                <small>
                  {when(v.at)} · {v.slides} diap.
                </small>
              </motion.button>
            ))}
            {!versions.length && <p className="muted small">Las versiones se guardan automáticamente cada pocos minutos y antes de cada cambio de una IA.</p>}
          </aside>
          <section className="history-preview">
            {preview ? (
              <>
                <div className="history-thumbs">
                  {preview.slides.slice(0, 9).map((s) => (
                    <Thumb key={s.id} slide={s} theme={preview.theme} width={170} />
                  ))}
                </div>
                <div className="btn-row">
                  <span className="muted">
                    «{preview.title}» · {preview.slides.length} diapositivas
                  </span>
                  <span style={{ flex: 1 }} />
                  <button className="btn primary" onClick={restore}>
                    <RotateCcw size={14} /> Restaurar esta versión
                  </button>
                </div>
              </>
            ) : (
              <p className="muted">Selecciona una versión para previsualizarla.</p>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}
