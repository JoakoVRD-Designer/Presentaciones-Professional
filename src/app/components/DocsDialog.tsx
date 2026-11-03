import { motion } from 'framer-motion';
import { FileUp, FolderOpen, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TEMPLATES } from '../../core/templates';
import { importJson } from '../lib/actions';
import { sfx } from '../lib/sound';
import { createDoc, deleteDoc, flushNow, listDocs, openDoc, type DocMeta } from '../lib/sync';
import { useEditor } from '../store/editor';
import { Dialog } from './ui/Popover';

function timeAgo(iso?: string) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return new Date(iso).toLocaleDateString();
}

const TEMPLATE_ART: Record<string, string> = {
  showcase: 'radial-gradient(circle at 20% 20%, #7c5cff, transparent 60%), radial-gradient(circle at 80% 70%, #22d3ee, transparent 55%), #07080f',
  pitch: 'radial-gradient(circle at 70% 20%, #ff6b4a, transparent 60%), radial-gradient(circle at 20% 80%, #ffc857, transparent 55%), #1a0b14',
  blank: 'linear-gradient(135deg, #16171f, #0b0c12)',
};

export function DocsDialog() {
  const open = useEditor((s) => s.docsOpen);
  const currentId = useEditor((s) => s.doc.id);
  const serverMode = useEditor((s) => s.serverMode);
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const close = () => useEditor.setState({ docsOpen: false });

  const refresh = () => listDocs().then(setDocs).catch(() => setDocs([]));
  useEffect(() => {
    if (open) flushNow().finally(refresh);
  }, [open]);

  const create = async (template: string) => {
    await flushNow();
    const doc = await createDoc(template);
    await openDoc(doc.id);
    sfx('success');
    close();
  };

  return (
    <Dialog open={open} onClose={close} title="Presentaciones" icon={<FolderOpen size={18} />} width={820}>
      <div className="docs">
        <div className="pop-label">Crear nueva</div>
        <div className="template-row">
          {TEMPLATES.map((t) => (
            <motion.button key={t.id} className="template-card" whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }} onClick={() => create(t.id)}>
              <span className="template-art" style={{ background: TEMPLATE_ART[t.id] }}>
                <Plus size={22} />
              </span>
              <b>{t.name}</b>
              <small>{t.description}</small>
            </motion.button>
          ))}
          <motion.button className="template-card" whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }} onClick={() => importJson().then(close)}>
            <span className="template-art import">
              <FileUp size={22} />
            </span>
            <b>Importar</b>
            <small>Archivo .json o .html exportado por Lumen.</small>
          </motion.button>
        </div>

        <div className="pop-label">
          Recientes <span className="muted">· {serverMode ? 'servidor local' : 'este navegador'}</span>
        </div>
        <div className="doc-list">
          {docs.map((d, i) => (
            <motion.div
              key={d.id}
              className={`doc-row${d.id === currentId ? ' is-current' : ''}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <button
                className="doc-open"
                onClick={async () => {
                  await flushNow();
                  await openDoc(d.id);
                  sfx('tap');
                  close();
                }}
              >
                <b>{d.title}</b>
                <small>
                  {d.slides} diapositivas · {timeAgo(d.updatedAt)}
                </small>
              </button>
              {d.id !== currentId && (
                <button
                  className="icon-btn v-danger"
                  aria-label="Eliminar"
                  data-tip="Eliminar"
                  onClick={async () => {
                    if (!window.confirm(`¿Eliminar «${d.title}»? No se puede deshacer.`)) return;
                    await deleteDoc(d.id);
                    sfx('remove');
                    refresh();
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </motion.div>
          ))}
          {!docs.length && <p className="muted">Aún no hay presentaciones guardadas.</p>}
        </div>
      </div>
    </Dialog>
  );
}
