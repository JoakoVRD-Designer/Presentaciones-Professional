import { motion } from 'framer-motion';
import { Camera, Circle, Clapperboard, Download, Film, Mic, Timer, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildPlan, DEFAULT_VIDEO_OPTIONS } from '../../render/videoPlan';
import { formatBytes } from '../../render/exportHtml';
import { startRecording } from '../lib/recorder';
import { sfx } from '../lib/sound';
import { CLIENT_ID, flushNow } from '../lib/sync';
import { currentSlideIndex, useEditor } from '../store/editor';
import { Row, Segmented, Slider, Switch } from './ui/fields';
import { Dialog } from './ui/Popover';

interface Job {
  id: string;
  status: 'queued' | 'starting' | 'rendering' | 'encoding' | 'done' | 'error' | 'cancelled';
  progress: number;
  message: string;
  error?: string;
  bytes?: number;
  frames: number;
}

const RESOLUTIONS = [
  { value: '1280', label: '720p' },
  { value: '1920', label: '1080p' },
  { value: '2560', label: '1440p' },
  { value: '3840', label: '4K' },
] as const;

function StudioTab() {
  const doc = useEditor((s) => s.doc);
  const serverMode = useEditor((s) => s.serverMode);
  const [caps, setCaps] = useState<{ available: boolean; missing: string[] } | null>(null);
  const [width, setWidth] = useState<'1280' | '1920' | '2560' | '3840'>('1920');
  const [fps, setFps] = useState<'24' | '30' | '60'>('30');
  const [perSlide, setPerSlide] = useState(DEFAULT_VIDEO_OPTIONS.secondsPerSlide);
  const [perStep, setPerStep] = useState(DEFAULT_VIDEO_OPTIONS.secondsPerStep);
  const [music, setMusic] = useState(true);
  const [narration, setNarration] = useState(true);
  const [sfxOn, setSfx] = useState(true);
  const [quality, setQuality] = useState<'draft' | 'high' | 'master'>('high');
  const [job, setJob] = useState<Job | null>(null);
  const poll = useRef<number | null>(null);

  useEffect(() => {
    if (!serverMode) return;
    fetch('/api/video/capabilities')
      .then((r) => r.json())
      .then(setCaps)
      .catch(() => setCaps({ available: false, missing: ['servidor'] }));
    return () => {
      if (poll.current) clearInterval(poll.current);
    };
  }, [serverMode]);

  const plan = useMemo(
    () => buildPlan(doc, { ...DEFAULT_VIDEO_OPTIONS, width: Number(width), fps: Number(fps), secondsPerSlide: perSlide, secondsPerStep: perStep }),
    [doc, width, fps, perSlide, perStep],
  );
  const seconds = Math.round(plan.duration / 1000);
  const busy = job && !['done', 'error', 'cancelled'].includes(job.status);

  const start = async () => {
    await flushNow();
    const res = await fetch(`/api/presentations/${doc.id}/video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-lumen-client': CLIENT_ID },
      body: JSON.stringify({
        width: Number(width),
        fps: Number(fps),
        secondsPerSlide: perSlide,
        secondsPerStep: perStep,
        music,
        narration,
        sfx: sfxOn,
        quality,
        appUrl: window.location.origin,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      useEditor.getState().toast(data.error ?? 'No se pudo iniciar el render', 'error');
      return;
    }
    sfx('whoosh');
    setJob(data);
    if (poll.current) clearInterval(poll.current);
    poll.current = window.setInterval(async () => {
      const j = (await fetch(`/api/video/${data.id}`).then((r) => r.json())) as Job;
      setJob(j);
      if (['done', 'error', 'cancelled'].includes(j.status)) {
        if (poll.current) clearInterval(poll.current);
        sfx(j.status === 'done' ? 'success' : 'error');
      }
    }, 1000);
  };

  if (!serverMode) return <p className="muted">El render de video necesita el servidor de Lumen («npm run dev»). Mientras tanto puedes usar «Grabar».</p>;
  if (caps && !caps.available) {
    return (
      <div className="video-missing">
        <p>Para renderizar video MP4 instala una sola vez:</p>
        <pre className="code">{'npm i -D playwright\nnpx playwright install chromium\n# y ffmpeg: https://ffmpeg.org/download.html'}</pre>
        <p className="hint">Falta: {caps.missing.join(' · ')}</p>
      </div>
    );
  }

  return (
    <div className="video-studio">
      <div className="video-hero">
        <Clapperboard size={22} />
        <div>
          <b>Render de estudio fotograma a fotograma</b>
          <p className="muted">Cada animación, transición, video y Lottie se coloca en su instante exacto: sin tirones, a la resolución que elijas.</p>
        </div>
      </div>
      <Row label="Resolución">
        <Segmented layoutId="vres" value={width} onChange={setWidth} options={RESOLUTIONS.map((r) => ({ value: r.value, label: r.label }))} />
      </Row>
      <Row label="Fotogramas">
        <Segmented
          layoutId="vfps"
          value={fps}
          onChange={setFps}
          options={[
            { value: '24', label: '24 cine' },
            { value: '30', label: '30' },
            { value: '60', label: '60 fluido' },
          ]}
        />
      </Row>
      <Row label="Calidad">
        <Segmented
          layoutId="vq"
          value={quality}
          onChange={setQuality}
          options={[
            { value: 'draft', label: 'Borrador' },
            { value: 'high', label: 'Alta' },
            { value: 'master', label: 'Máster' },
          ]}
        />
      </Row>
      <Row label="Por diapositiva">
        <Slider value={perSlide} min={1} max={20} step={0.5} precision={1} unit="s" onChange={setPerSlide} />
      </Row>
      <Row label="Entre clics">
        <Slider value={perStep} min={0.3} max={6} step={0.1} precision={1} unit="s" onChange={setPerStep} />
      </Row>
      <div className="field-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <Switch checked={music} onChange={setMusic} label="Música" />
        <Switch checked={narration} onChange={setNarration} label="Narración" />
        <Switch checked={sfxOn} onChange={setSfx} label="Efectos" />
      </div>
      <p className="hint">
        Duración estimada: <b>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</b> · {Math.ceil((plan.duration / 1000) * Number(fps))} fotogramas.
        Las diapositivas con «Avance auto.» o narración usan su propio tiempo.
      </p>

      {job && (
        <motion.div className={`video-job is-${job.status}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div className="video-progress">
            <motion.i animate={{ width: `${Math.round(job.progress * 100)}%` }} transition={{ ease: 'easeOut' }} />
          </div>
          <div className="video-job-row">
            <span>{job.status === 'error' ? job.error : job.message}</span>
            {busy && (
              <button
                className="icon-btn"
                aria-label="Cancelar"
                onClick={() => fetch(`/api/video/${job.id}`, { method: 'DELETE' })}
              >
                <X size={14} />
              </button>
            )}
          </div>
          {job.status === 'done' && (
            <>
              <video className="video-preview" src={`/api/video/${job.id}/file`} controls playsInline />
              <a className="btn primary" href={`/api/video/${job.id}/file`} download>
                <Download size={14} /> Descargar MP4 {job.bytes ? `(${formatBytes(job.bytes)})` : ''}
              </a>
            </>
          )}
        </motion.div>
      )}

      <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn primary" disabled={!!busy || !caps} onClick={start}>
          <Film size={14} /> {busy ? 'Renderizando…' : 'Renderizar MP4'}
        </button>
      </div>
    </div>
  );
}

function RecordTab() {
  const [camera, setCamera] = useState(true);
  const [microphone, setMicrophone] = useState(true);
  const [timings, setTimings] = useState(true);
  return (
    <div className="video-record">
      <div className="video-hero">
        <Circle size={20} fill="#ff3b5c" color="#ff3b5c" />
        <div>
          <b>Graba la presentación mientras la das</b>
          <p className="muted">
            Se captura esta pestaña con todas las animaciones en tiempo real, tu voz y tu cámara en una burbuja que puedes mover. Al salir
            se descarga el video.
          </p>
        </div>
      </div>
      <div className="export-opts">
        <Switch checked={microphone} onChange={setMicrophone} label="Micrófono (tu voz)" />
        <Switch checked={camera} onChange={setCamera} label="Cámara en burbuja" />
        <Switch checked={timings} onChange={setTimings} label="Guardar los tiempos como avance automático (ensayo)" />
      </div>
      <p className="hint">
        <Mic size={12} /> <Camera size={12} /> <Timer size={12} /> Cuando el navegador lo pida, elige «Esta pestaña» y activa «Compartir audio».
        Pulsa Esc o el indicador rojo para terminar.
      </p>
      <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
        <button
          className="btn primary rec-start"
          onClick={() => {
            useEditor.setState({ videoOpen: false });
            void startRecording({ camera, microphone, timings }, currentSlideIndex());
          }}
        >
          <Circle size={12} fill="currentColor" /> Empezar a grabar
        </button>
      </div>
    </div>
  );
}

export function VideoDialog() {
  const open = useEditor((s) => s.videoOpen);
  const [tab, setTab] = useState<'studio' | 'record'>('studio');
  return (
    <Dialog open={open} onClose={() => useEditor.setState({ videoOpen: false })} title="Video" icon={<Film size={18} />} width={640}>
      <div className="video-dialog">
        <Segmented
          layoutId="vtab"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'studio', label: 'Render MP4 de estudio' },
            { value: 'record', label: 'Grabar con voz y cámara' },
          ]}
        />
        {tab === 'studio' ? <StudioTab /> : <RecordTab />}
      </div>
    </Dialog>
  );
}
