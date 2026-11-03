import { motion } from 'framer-motion';
import {
  Cloud,
  CloudOff,
  Command as CommandIcon,
  Download,
  FileJson,
  FileUp,
  Film,
  FolderOpen,
  Globe,
  Image as ImageIcon,
  LoaderCircle,
  Play,
  Redo2,
  Shapes,
  Sparkles,
  Type,
  Undo2,
  Volume2,
  VolumeX,
  Wand2,
  HardDrive,
  ZoomIn,
  Square,
  FileCode2,
  MonitorSpeaker,
  ChartColumn,
  ChartBarBig,
  ChartLine,
  ChartArea,
  Donut,
  ChartPie,
  Printer,
  Keyboard,
  Table2,
  Presentation,
  Share2,
} from 'lucide-react';
import { SHAPES } from '../../core/model';
import { STOCK_IMAGES, STOCK_VIDEOS } from '../../core/themes';
import { CLIP_SHAPES } from '../../render/styles';
import {
  exportHtml,
  exportJson,
  exportPdf,
  exportPptx,
  shareLink,
  importJson,
  insertElement,
  insertGlassCard,
  insertChart,
  insertIcon,
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
import { IconPicker } from './IconPicker';
import { toEmbedUrl, SHAPE_LABELS } from './inspector/common';
import { AnimatedIcon, IconButton } from './ui/IconButton';
import { TextInput } from './ui/fields';
import { MenuList, Popover } from './ui/Popover';

function Logo() {
  return (
    <motion.button
      className="logo"
      onClick={() => {
        sfx('open');
        useEditor.setState({ docsOpen: true });
      }}
      whileHover="hover"
      initial="rest"
      data-tip="Mis presentaciones"
    >
      <motion.span
        className="logo-mark"
        variants={{ rest: { rotate: 0, scale: 1 }, hover: { rotate: 90, scale: 1.06 } }}
        transition={{ type: 'spring', stiffness: 300, damping: 15 }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <path d="M12 2l2.6 6.9L22 12l-7.4 3.1L12 22l-2.6-6.9L2 12l7.4-3.1L12 2z" fill="currentColor" />
        </svg>
      </motion.span>
      <span className="logo-word">Lumen</span>
    </motion.button>
  );
}

function SyncBadge() {
  const sync = useEditor((s) => s.sync);
  const map = {
    connecting: { icon: LoaderCircle, label: 'Conectando…', cls: 'is-busy' },
    saving: { icon: LoaderCircle, label: 'Guardando…', cls: 'is-busy' },
    saved: { icon: Cloud, label: 'Guardado · sincronizado en vivo', cls: 'is-ok' },
    local: { icon: HardDrive, label: 'Guardado en este navegador', cls: 'is-local' },
    error: { icon: CloudOff, label: 'Sin conexión con el servidor', cls: 'is-error' },
  }[sync];
  const Icon = map.icon;
  return (
    <span className={`sync-badge ${map.cls}`} data-tip={map.label}>
      <Icon size={13} className={map.cls === 'is-busy' ? 'spin' : undefined} />
    </span>
  );
}

function InsertButton({ icon, label, children, width = 280 }: { icon: typeof Type; label: string; children: (close: () => void) => React.ReactNode; width?: number }) {
  return (
    <Popover
      width={width}
      align="center"
      trigger={({ toggle, open, ref }) => (
        <motion.button
          ref={ref as React.RefObject<HTMLButtonElement>}
          className={`insert-btn${open ? ' is-open' : ''}`}
          onClick={toggle}
          initial="rest"
          animate="rest"
          whileHover="hover"
          whileTap={{ scale: 0.95 }}
        >
          <AnimatedIcon icon={icon} anim="bounce" size={17} />
          <span>{label}</span>
        </motion.button>
      )}
    >
      {children}
    </Popover>
  );
}

export function TopBar() {
  const title = useEditor((s) => s.doc.title);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const sounds = useEditor((s) => s.sounds);
  const live = useEditor((s) => s.liveAnimations);
  const zoom = useEditor((s) => s.zoom);
  const aiOpen = useEditor((s) => s.aiOpen);
  const dispatch = useEditor((s) => s.dispatch);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Logo />
        <span className="topbar-sep" />
        <div className="title-field">
          <TextInput
            value={title}
            onCommit={(v) => {
              dispatch([{ op: 'presentation.update', patch: { title: v || 'Sin título' } }]);
              document.title = `${v} · Lumen`;
            }}
          />
        </div>
        <SyncBadge />
      </div>

      <nav className="topbar-center" aria-label="Insertar">
        <InsertButton icon={Type} label="Texto" width={240}>
          {(close) => (
            <MenuList
              onDone={close}
              items={TEXT_PRESETS.map((p) => ({ label: p.label, icon: <Type size={14} />, onSelect: () => insertElement(p.element) }))}
            />
          )}
        </InsertButton>
        <InsertButton icon={Shapes} label="Forma" width={300}>
          {(close) => (
            <div className="pop-pad">
              <div className="shape-grid">
                {SHAPES.map((s) => (
                  <button
                    key={s}
                    className="shape-cell"
                    data-tip={SHAPE_LABELS[s]}
                    onClick={() => {
                      insertShape(s);
                      close();
                    }}
                  >
                    <span
                      className="shape-preview"
                      style={{
                        clipPath: CLIP_SHAPES[s],
                        borderRadius: s === 'ellipse' ? '50%' : s === 'blob' ? '42% 58% 63% 37% / 41% 44% 56% 59%' : s === 'rect' ? 4 : undefined,
                        height: s === 'line' ? 3 : undefined,
                      }}
                    />
                  </button>
                ))}
              </div>
              <button
                className="btn soft wide"
                onClick={() => {
                  insertGlassCard();
                  close();
                }}
              >
                <Square size={14} /> Tarjeta de vidrio
              </button>
            </div>
          )}
        </InsertButton>
        <InsertButton icon={ImageIcon} label="Imagen" width={320}>
          {(close) => (
            <div className="pop-pad">
              <button
                className="btn primary wide"
                onClick={() => {
                  close();
                  insertMedia('image');
                }}
              >
                <FileUp size={14} /> Subir desde tu equipo
              </button>
              <TextInput
                value=""
                placeholder="o pega una URL y pulsa Enter"
                onCommit={(v) => {
                  if (v.trim()) {
                    insertMedia('image', v.trim());
                    close();
                  }
                }}
              />
              <div className="pop-label">Fotos de muestra</div>
              <div className="stock-grid">
                {STOCK_IMAGES.map((src) => (
                  <button
                    key={src}
                    className="stock-cell"
                    style={{ backgroundImage: `url(${src.replace('w=1920', 'w=240')})` }}
                    onClick={() => {
                      insertMedia('image', src);
                      close();
                    }}
                  />
                ))}
              </div>
              <p className="hint">También puedes arrastrar archivos al lienzo o pegarlos con ⌘V.</p>
            </div>
          )}
        </InsertButton>
        <InsertButton icon={Film} label="Video" width={300}>
          {(close) => (
            <div className="pop-pad">
              <button
                className="btn primary wide"
                onClick={() => {
                  close();
                  insertMedia('video');
                }}
              >
                <FileUp size={14} /> Subir video
              </button>
              <TextInput
                value=""
                placeholder="URL .mp4 / .webm y Enter"
                onCommit={(v) => {
                  if (v.trim()) {
                    insertMedia('video', v.trim());
                    close();
                  }
                }}
              />
              <div className="pop-label">Videos de muestra</div>
              <MenuList
                onDone={close}
                items={STOCK_VIDEOS.map((v) => ({ label: v.label, icon: <Film size={14} />, onSelect: () => insertMedia('video', v.src) }))}
              />
            </div>
          )}
        </InsertButton>
        <InsertButton icon={Sparkles} label="Icono" width={340}>
          {(close) => (
            <IconPicker
              onPick={(name) => {
                insertIcon(name);
                close();
              }}
            />
          )}
        </InsertButton>
        <InsertButton icon={ChartColumn} label="Datos" width={300}>
          {(close) => (
            <div className="pop-pad">
              <div className="chart-kinds">
                {(
                  [
                    ['column', 'Columnas', ChartColumn],
                    ['bar', 'Barras', ChartBarBig],
                    ['line', 'Líneas', ChartLine],
                    ['area', 'Área', ChartArea],
                    ['donut', 'Dona', Donut],
                    ['pie', 'Tarta', ChartPie],
                  ] as const
                ).map(([k, label, Icon]) => (
                  <button
                    key={k}
                    className="chart-kind"
                    onClick={() => {
                      insertChart(k);
                      close();
                    }}
                  >
                    <Icon size={20} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <button
                className="btn soft wide"
                onClick={() => {
                  insertTable();
                  close();
                }}
              >
                <Table2 size={14} /> Tabla
              </button>
              <p className="hint">Edita los datos en el inspector o pega una tabla desde Excel / Sheets.</p>
            </div>
          )}
        </InsertButton>
        <InsertButton icon={Globe} label="Web" width={300}>
          {(close) => (
            <div className="pop-pad">
              <p className="hint">Incrusta YouTube, Vimeo, Figma, Google Maps o cualquier página que lo permita.</p>
              <TextInput
                value=""
                placeholder="https://… y Enter"
                onCommit={(v) => {
                  if (!v.trim()) return;
                  insertElement({ type: 'embed', url: toEmbedUrl(v.trim()), w: 1120, h: 630, style: { radius: 20 } });
                  close();
                }}
              />
            </div>
          )}
        </InsertButton>
      </nav>

      <div className="topbar-right">
        <IconButton icon={Undo2} label="Deshacer" kbd="⌘Z" anim="left" disabled={!canUndo} onClick={() => useEditor.getState().undo()} />
        <IconButton icon={Redo2} label="Rehacer" kbd="⇧⌘Z" anim="right" disabled={!canRedo} onClick={() => useEditor.getState().redo()} />
        <span className="topbar-sep" />
        <Popover
          width={200}
          align="end"
          trigger={({ toggle, ref }) => (
            <button ref={ref as React.RefObject<HTMLButtonElement>} className="zoom-btn" onClick={toggle} data-tip="Zoom">
              <ZoomIn size={14} />
              {zoom === 'fit' ? 'Ajustar' : `${Math.round(zoom * 100)}%`}
            </button>
          )}
        >
          {(close) => (
            <MenuList
              onDone={close}
              items={[
                { label: 'Ajustar a la ventana', kbd: '⇧1', onSelect: () => useEditor.setState({ zoom: 'fit' }) },
                ...[0.25, 0.5, 0.75, 1].map((z) => ({ label: `${z * 100}%`, onSelect: () => useEditor.setState({ zoom: z }) })),
              ]}
            />
          )}
        </Popover>
        <IconButton icon={Wand2} label={live ? 'Pausar animaciones en vivo' : 'Animaciones en vivo'} active={live} anim="swing" onClick={toggleLive} />
        <IconButton icon={sounds ? Volume2 : VolumeX} label={sounds ? 'Silenciar sonidos' : 'Activar sonidos'} active={sounds} anim="pop" sound={false} onClick={toggleSounds} />
        <IconButton icon={CommandIcon} label="Comandos" kbd="⌘K" anim="spin" onClick={() => useEditor.setState({ paletteOpen: true })} />
        <Popover
          width={250}
          align="end"
          trigger={({ toggle, ref }) => (
            <IconButton ref={ref as React.RefObject<HTMLButtonElement>} icon={Download} label="Exportar e importar" anim="down" onClick={toggle} sound={false} />
          )}
        >
          {(close) => (
            <MenuList
              onDone={close}
              items={[
                { label: 'HTML autónomo (.html)', icon: <FileCode2 size={14} />, kbd: '⌘E', onSelect: exportHtml },
                { label: 'PowerPoint (.pptx)', icon: <Presentation size={14} />, onSelect: exportPptx },
                { label: 'PDF (imprimir)', icon: <Printer size={14} />, kbd: '⌘P', onSelect: exportPdf },
                { label: 'Documento Lumen (.json)', icon: <FileJson size={14} />, onSelect: exportJson },
                'sep',
                { label: 'Importar JSON / HTML…', icon: <FileUp size={14} />, onSelect: importJson },
                { label: 'Mis presentaciones', icon: <FolderOpen size={14} />, kbd: '⌘O', onSelect: () => useEditor.setState({ docsOpen: true }) },
                { label: 'Historial de versiones', icon: <FolderOpen size={14} />, onSelect: () => useEditor.setState({ historyOpen: true }) },
                { label: 'Buscar y reemplazar', icon: <Keyboard size={14} />, kbd: '⌘F', onSelect: () => useEditor.setState({ findOpen: true }) },
                { label: 'Atajos de teclado', icon: <Keyboard size={14} />, kbd: '?', onSelect: () => useEditor.setState({ helpOpen: true }) },
              ]}
            />
          )}
        </Popover>
        <motion.button
          className={`ai-btn${aiOpen ? ' is-active' : ''}`}
          onClick={() => {
            sfx(aiOpen ? 'close' : 'open');
            useEditor.setState({ aiOpen: !aiOpen });
          }}
          initial="rest"
          animate="rest"
          whileHover="hover"
          whileTap={{ scale: 0.95 }}
          data-tip="Asistente IA y API  ⌘J"
        >
          <AnimatedIcon icon={Sparkles} anim="spin" size={15} />
          <span>IA</span>
        </motion.button>
        <IconButton icon={Share2} label="Copiar enlace para ver la presentación" anim="pop" sound={false} onClick={shareLink} />
        <IconButton icon={MonitorSpeaker} label="Vista del orador (otra ventana)" anim="pop" onClick={openPresenterWindow} />
        <motion.button className="present-btn" onClick={() => present()} whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }} data-tip="Presentar  ⌘↵">
          <Play size={14} fill="currentColor" />
          <span>Presentar</span>
        </motion.button>
      </div>
    </header>
  );
}
