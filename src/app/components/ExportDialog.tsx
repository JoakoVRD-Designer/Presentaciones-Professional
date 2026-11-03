import { motion } from 'framer-motion';
import { CircleAlert, Download, FileCode2, Film, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { exportHtml, formatBytes, slugify, downloadFile, type ExportResult } from '../../render/exportHtml';
import { exportPdf } from '../lib/actions';
import { sfx } from '../lib/sound';
import { useEditor } from '../store/editor';
import { Row, Slider, Switch } from './ui/fields';
import { Dialog } from './ui/Popover';

export function ExportDialog() {
  const open = useEditor((s) => s.exportOpen);
  const doc = useEditor((s) => s.doc);
  const [embedFonts, setFonts] = useState(true);
  const [embedImages, setImages] = useState(true);
  const [embedMedia, setMedia] = useState(true);
  const [kiosk, setKiosk] = useState(false);
  const [seconds, setSeconds] = useState(6);
  const [loop, setLoop] = useState(doc.settings.loop);
  const [controls, setControls] = useState(doc.settings.controls);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const close = () => useEditor.setState({ exportOpen: false });

  useEffect(() => {
    if (open) {
      setResult(null);
      setLoop(doc.settings.loop);
      setControls(doc.settings.controls);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const run = async () => {
    setBusy('Preparando…');
    setResult(null);
    try {
      const res = await exportHtml(doc, {
        embedFonts,
        embedImages,
        embedMedia,
        autoplay: kiosk ? seconds : 0,
        loop: kiosk ? true : loop,
        controls,
        onProgress: setBusy,
      });
      downloadFile(`${slugify(doc.title)}.html`, res.html);
      setResult(res);
      sfx('success');
    } catch (err) {
      useEditor.getState().toast(err instanceof Error ? err.message : 'No se pudo exportar', 'error');
      sfx('error');
    } finally {
      setBusy(null);
    }
  };

  const offline = embedFonts && embedImages && embedMedia;
  return (
    <Dialog open={open} onClose={close} title="Exportar presentación" icon={<FileCode2 size={18} />} width={640}>
      <div className="export">
        <div className="export-hero">
          <div className="export-file">
            <FileCode2 size={26} />
            <span>.html</span>
          </div>
          <div>
            <b>Un único archivo HTML</b>
            <p className="muted">
              Se abre en cualquier navegador (ordenador, móvil o TV) con todas sus animaciones, videos y transiciones, y se puede volver a
              abrir y editar en Lumen.
            </p>
          </div>
        </div>

        <section className="export-opts">
          <Switch checked={embedFonts} onChange={setFonts} label="Incrustar tipografías (solo los caracteres usados)" />
          <Switch checked={embedImages} onChange={setImages} label="Incrustar imágenes" />
          <Switch checked={embedMedia} onChange={setMedia} label="Incrustar videos, audio y animaciones" />
          <span className={`export-badge${offline ? ' is-ok' : ''}`}>{offline ? 'Funciona sin conexión' : 'Algunos recursos se cargarán de internet'}</span>
        </section>

        <section className="export-opts">
          <Switch checked={kiosk} onChange={setKiosk} label="Modo kiosco (avanza solo y se repite)" />
          {kiosk ? (
            <Row label="Segundos">
              <Slider value={seconds} min={2} max={60} unit="s" onChange={setSeconds} />
            </Row>
          ) : (
            <Switch checked={loop} onChange={setLoop} label="Repetir al terminar" />
          )}
          <Switch checked={controls} onChange={setControls} label="Mostrar controles" />
        </section>

        {result && (
          <motion.div className="export-result" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <b>Listo · {formatBytes(result.bytes)}</b>
            <span className="muted">
              {result.embedded} recurso{result.embedded === 1 ? '' : 's'} incrustado{result.embedded === 1 ? '' : 's'} · tipografías{' '}
              {result.fonts === 'embedded' ? 'incrustadas' : result.fonts === 'linked' ? 'enlazadas' : 'no disponibles sin conexión'}
            </span>
            {(result.external.length > 0 || result.failed.length > 0) && (
              <div className="export-warn">
                <CircleAlert size={14} />
                <span>
                  {result.external.length} recurso{result.external.length === 1 ? '' : 's'} externo{result.external.length === 1 ? '' : 's'}
                  {result.failed.length ? ` (${result.failed.length} no permiten incrustarse por CORS)` : ''}: necesitarán internet.
                </span>
              </div>
            )}
          </motion.div>
        )}

        <div className="btn-row export-actions">
          <button
            className="btn ghost"
            onClick={() => {
              close();
              exportPdf();
            }}
          >
            <Printer size={14} /> PDF para imprimir
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              close();
              useEditor.setState({ videoOpen: true });
            }}
          >
            <Film size={14} /> Video MP4
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn primary" onClick={run} disabled={!!busy}>
            <Download size={14} /> {busy ?? 'Descargar .html'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
