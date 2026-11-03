import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Copy,
  Download,
  FileJson,
  FileUp,
  FolderOpen,
  LayoutTemplate,
  Palette,
  Play,
  Plus,
  Redo2,
  Sparkles,
  Trash2,
  Undo2,
  Volume2,
  Wand2,
  Type,
  Shapes,
  Image as ImageIcon,
  Film,
  ArrowRight,
  MonitorSpeaker,
  MessageSquarePlus,
  MessageSquare,
} from 'lucide-react';
import { toggleCommentMode } from '../lib/collab';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LAYOUTS } from '../../core/layouts';
import { SHAPES } from '../../core/model';
import { THEMES } from '../../core/themes';
import {
  addSlide,
  deleteSlide,
  duplicateForMorph,
  duplicateSlide,
  exportHtml,
  exportJson,
  exportPdf,
  shareLink,
  importJson,
  insertElement,
  insertChart,
  insertGlassCard,
  insertTable,
  insertMedia,
  insertShape,
  present,
  TEXT_PRESETS,
  toggleLive,
  toggleSounds,
} from '../lib/actions';
import { openPresenterWindow } from '../lib/presenter';
import { sfx } from '../lib/sound';
import { useEditor } from '../store/editor';
import { SHAPE_LABELS } from './inspector/common';

export function CommandPalette() {
  const open = useEditor((s) => s.paletteOpen);
  const slides = useEditor((s) => s.doc.slides);
  const close = () => useEditor.setState({ paletteOpen: false });

  useEffect(() => {
    if (open) sfx('open');
  }, [open]);

  const run = (fn: () => void) => () => {
    close();
    // Deja que se cierre la paleta antes de ejecutar (p. ej. para abrir otro popover).
    setTimeout(fn, 10);
  };

  const Item = ({ icon, label, kbd, onSelect, keywords }: { icon: React.ReactNode; label: string; kbd?: string; onSelect: () => void; keywords?: string[] }) => (
    <Command.Item onSelect={run(onSelect)} keywords={keywords} className="cmdk-item">
      <span className="cmdk-icon">{icon}</span>
      <span className="cmdk-label">{label}</span>
      {kbd && <kbd>{kbd}</kbd>}
    </Command.Item>
  );

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="dialog-backdrop palette-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onPointerDown={(e) => e.target === e.currentTarget && close()}
        >
          <motion.div
            className="palette"
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
          >
            <Command
              label="Paleta de comandos"
              loop
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') close();
              }}
            >
              <Command.Input autoFocus placeholder="Escribe un comando o busca…" className="cmdk-input" />
              <Command.List className="cmdk-list">
                <Command.Empty className="cmdk-empty">Sin resultados.</Command.Empty>
                <Command.Group heading="Acciones">
                  <Item icon={<Play size={15} />} label="Presentar desde aquí" kbd="⌘↵" onSelect={() => present()} />
                  <Item icon={<Play size={15} />} label="Presentar desde el inicio" onSelect={() => present(true)} />
                  <Item icon={<MonitorSpeaker size={15} />} label="Abrir vista del orador" onSelect={openPresenterWindow} keywords={['presenter', 'notas']} />
                  <Item icon={<Sparkles size={15} />} label="Abrir asistente IA" kbd="⌘J" onSelect={() => useEditor.setState({ aiOpen: true })} keywords={['ai', 'claude', 'api']} />
                  <Item icon={<Undo2 size={15} />} label="Deshacer" kbd="⌘Z" onSelect={() => useEditor.getState().undo()} />
                  <Item icon={<Redo2 size={15} />} label="Rehacer" kbd="⇧⌘Z" onSelect={() => useEditor.getState().redo()} />
                  <Item icon={<Download size={15} />} label="Buscar y reemplazar" kbd="⌘F" onSelect={() => useEditor.setState({ findOpen: true })} keywords={['find', 'replace', 'buscar']} />
                  <Item icon={<Download size={15} />} label="Copiar enlace para compartir" onSelect={shareLink} keywords={['share', 'compartir', 'publicar', 'link']} />
                  <Item icon={<MessageSquarePlus size={15} />} label="Comentar en el lienzo" kbd="C" onSelect={() => toggleCommentMode(true)} keywords={['comment', 'nota', 'revisar', 'feedback']} />
                  <Item icon={<MessageSquare size={15} />} label="Ver comentarios" onSelect={() => useEditor.setState({ panel: 'comments' })} keywords={['comments', 'revision', 'hilos']} />
                  <Item
                    icon={<Sparkles size={15} />}
                    label="Que Claude atienda los comentarios"
                    onSelect={() =>
                      useEditor.setState({
                        aiOpen: true,
                        aiRequest:
                          'Atiende los comentarios abiertos de la presentación: léelos con list_comments, aplica los cambios que piden y responde a cada uno con reply_comment explicando qué hiciste (resolve: true).',
                      })
                    }
                    keywords={['ai', 'comentarios', 'revision']}
                  />
                  <Item icon={<FolderOpen size={15} />} label="Historial de versiones" onSelect={() => useEditor.setState({ historyOpen: true })} keywords={['history', 'versiones', 'restaurar']} />
                  <Item icon={<FolderOpen size={15} />} label="Mis presentaciones" kbd="⌘O" onSelect={() => useEditor.setState({ docsOpen: true })} />
                </Command.Group>
                <Command.Group heading="Diapositivas">
                  {LAYOUTS.map((l) => (
                    <Item key={l.id} icon={<LayoutTemplate size={15} />} label={`Nueva: ${l.name}`} onSelect={() => addSlide(l.id)} keywords={[l.description]} />
                  ))}
                  <Item icon={<Copy size={15} />} label="Duplicar diapositiva" onSelect={duplicateSlide} />
                  <Item icon={<Wand2 size={15} />} label="Duplicar con Morph (Magic Move)" onSelect={duplicateForMorph} keywords={['morph', 'magic move', 'animar']} />
                  <Item icon={<Trash2 size={15} />} label="Eliminar diapositiva" onSelect={deleteSlide} />
                </Command.Group>
                <Command.Group heading="Insertar">
                  {TEXT_PRESETS.map((t) => (
                    <Item key={t.id} icon={<Type size={15} />} label={`Texto: ${t.label}`} onSelect={() => insertElement(t.element)} />
                  ))}
                  {SHAPES.map((s) => (
                    <Item key={s} icon={<Shapes size={15} />} label={`Forma: ${SHAPE_LABELS[s]}`} onSelect={() => insertShape(s)} />
                  ))}
                  <Item icon={<Shapes size={15} />} label="Tarjeta de vidrio" onSelect={insertGlassCard} keywords={['glass']} />
                  <Item icon={<Shapes size={15} />} label="Tabla" onSelect={insertTable} keywords={['table', 'tabla', 'datos']} />
                  {['column', 'bar', 'line', 'area', 'donut', 'pie'].map((k) => (
                    <Item key={k} icon={<Shapes size={15} />} label={`Gráfico: ${k}`} onSelect={() => insertChart(k)} keywords={['chart', 'grafico', 'datos']} />
                  ))}
                  <Item icon={<ImageIcon size={15} />} label="Imagen desde archivo" onSelect={() => insertMedia('image')} />
                  <Item icon={<Film size={15} />} label="Video desde archivo" onSelect={() => insertMedia('video')} />
                </Command.Group>
                <Command.Group heading="Tema">
                  {THEMES.map((t) => (
                    <Item
                      key={t.id}
                      icon={<Palette size={15} style={{ color: t.colors.primary }} />}
                      label={`Tema: ${t.name}`}
                      onSelect={() => {
                        useEditor.getState().dispatch([{ op: 'theme.set', preset: t.id }]);
                        sfx('chime');
                      }}
                    />
                  ))}
                </Command.Group>
                <Command.Group heading="Ir a">
                  {slides.map((s, i) => (
                    <Item
                      key={s.id}
                      icon={<ArrowRight size={15} />}
                      label={`${i + 1}. ${s.name || 'Diapositiva'}`}
                      onSelect={() => useEditor.getState().selectSlide(s.id)}
                    />
                  ))}
                </Command.Group>
                <Command.Group heading="Archivo y preferencias">
                  <Item icon={<Download size={15} />} label="Exportar presentación (.html)" kbd="⌘E" onSelect={exportHtml} />
                  <Item icon={<Film size={15} />} label="Exportar video MP4 (render de estudio)" onSelect={() => useEditor.setState({ videoOpen: true })} keywords={['video', 'mp4', 'render', 'grabar', 'record']} />
                  <Item icon={<Download size={15} />} label="Exportar PDF (imprimir)" kbd="⌘P" onSelect={exportPdf} keywords={['pdf', 'imprimir', 'print']} />
                  <Item icon={<FileJson size={15} />} label="Exportar JSON" onSelect={exportJson} />
                  <Item icon={<Wand2 size={15} />} label="Atajos de teclado" kbd="?" onSelect={() => useEditor.setState({ helpOpen: true })} keywords={['ayuda', 'help', 'shortcuts']} />
                  <Item icon={<FileUp size={15} />} label="Abrir archivo .html / .json" onSelect={importJson} />
                  <Item icon={<Volume2 size={15} />} label="Activar/desactivar sonidos" onSelect={toggleSounds} />
                  <Item icon={<Wand2 size={15} />} label="Activar/desactivar animaciones en vivo" onSelect={toggleLive} />
                  <Item icon={<Plus size={15} />} label="Ajustar zoom a la ventana" kbd="⇧1" onSelect={() => useEditor.setState({ zoom: 'fit' })} />
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
