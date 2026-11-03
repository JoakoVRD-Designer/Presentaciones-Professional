import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { themeVars } from '../render/styles';
import { AIPanel } from './components/AIPanel';
import { Canvas } from './components/Canvas';
import { CommandPalette } from './components/CommandPalette';
import { DocsDialog } from './components/DocsDialog';
import { ExportDialog } from './components/ExportDialog';
import { VideoDialog } from './components/VideoDialog';
import { FindDialog } from './components/FindDialog';
import { HistoryDialog } from './components/HistoryDialog';
import { HelpDialog } from './components/HelpDialog';
import { Inspector } from './components/inspector/Inspector';
import { PresentMode } from './components/PresentMode';
import { SlideRail } from './components/SlideRail';
import { Toaster } from './components/Toaster';
import { TopBar } from './components/TopBar';
import { bootstrap } from './lib/sync';
import { loadMe, startPresence } from './lib/collab';
import { useShortcuts } from './lib/shortcuts';
import { useEditor } from './store/editor';

function StatusBar() {
  const slides = useEditor((s) => s.doc.slides);
  const current = useEditor((s) => s.currentSlideId);
  const selection = useEditor((s) => s.selection);
  const serverMode = useEditor((s) => s.serverMode);
  const idx = slides.findIndex((s) => s.id === current);
  return (
    <footer className="statusbar">
      <span>{current === 'master' ? 'Diapositiva maestra (todas las diapositivas)' : `Diapositiva ${idx + 1} de ${slides.length}`}</span>
      {selection.length > 0 && <span>· {selection.length} seleccionado{selection.length > 1 ? 's' : ''}</span>}
      <span className="grow" />
      <span className="muted">{serverMode ? 'API: /api · MCP disponible' : 'Modo local (sin servidor)'}</span>
      <span className="muted">⌘K comandos · ⌘J IA · ⌘↵ presentar</span>
    </footer>
  );
}

export function App() {
  const [ready, setReady] = useState(false);
  const theme = useEditor((s) => s.doc.theme);
  const aiOpen = useEditor((s) => s.aiOpen);
  useShortcuts();

  useEffect(() => {
    useEditor.setState({ me: loadMe() });
    startPresence();
    bootstrap()
      .catch((err) => useEditor.getState().toast(`Error al iniciar: ${err instanceof Error ? err.message : err}`, 'error'))
      .finally(() => setReady(true));
  }, []);

  // Expone las variables del tema a la interfaz (muestras de color, tarjetas…).
  useEffect(() => {
    const vars = themeVars(theme) as Record<string, string>;
    for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
  }, [theme]);

  return (
    <div className={`app${aiOpen ? ' ai-open' : ''}`}>
      <TopBar />
      <div className="workspace">
        <SlideRail />
        <main className="stage-area">
          {ready ? (
            <Canvas />
          ) : (
            <div className="boot">
              <motion.span className="boot-mark" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.4, ease: 'linear' }} />
            </div>
          )}
          <AIPanel />
        </main>
        <Inspector />
      </div>
      <StatusBar />
      <CommandPalette />
      <DocsDialog />
      <HelpDialog />
      <FindDialog />
      <ExportDialog />
      <VideoDialog />
      <HistoryDialog />
      <PresentMode />
      <Toaster />
    </div>
  );
}
