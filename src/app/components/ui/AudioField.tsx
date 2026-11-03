import { Mic, Pause, Play, Square, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { pickFile, uploadAsset } from '../../lib/assets';
import { sfx } from '../../lib/sound';
import { useEditor } from '../../store/editor';
import { IconButton } from './IconButton';
import { TextInput } from './fields';

/** Campo de audio: URL, subir archivo, grabar con el micrófono y escuchar. */
export function AudioField({ value, onChange, record = false }: { value: string; onChange: (src: string) => void; record?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; chunks: Blob[]; t: number; timer: number } | null>(null);

  useEffect(
    () => () => {
      audio.current?.pause();
      if (rec.current) {
        rec.current.stream.getTracks().forEach((t) => t.stop());
        clearInterval(rec.current.timer);
      }
    },
    [],
  );

  const toggle = () => {
    if (!value) return;
    if (playing) {
      audio.current?.pause();
      setPlaying(false);
      return;
    }
    audio.current?.pause();
    audio.current = new Audio(value);
    audio.current.onended = () => setPlaying(false);
    audio.current.play().then(() => setPlaying(true)).catch(() => useEditor.getState().toast('No se pudo reproducir el audio', 'error'));
  };

  const upload = async () => {
    const file = await pickFile('audio/*');
    if (!file) return;
    try {
      onChange(await uploadAsset(file));
      sfx('success');
    } catch (err) {
      useEditor.getState().toast(err instanceof Error ? err.message : 'No se pudo subir', 'error');
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
      const mr = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 128000 } : undefined);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
        try {
          onChange(await uploadAsset(new File([blob], `narracion.${ext}`, { type: blob.type.split(';')[0] })));
          sfx('success');
        } catch (err) {
          useEditor.getState().toast(err instanceof Error ? err.message : 'No se pudo guardar la grabación', 'error');
        }
      };
      mr.start(250);
      const t = Date.now();
      rec.current = { mr, stream, chunks, t, timer: window.setInterval(() => setElapsed(Math.floor((Date.now() - t) / 1000)), 250) };
      setElapsed(0);
      setRecording(true);
      sfx('pop');
    } catch {
      useEditor.getState().toast('No se pudo acceder al micrófono', 'error');
    }
  };

  const stopRecording = () => {
    if (!rec.current) return;
    clearInterval(rec.current.timer);
    rec.current.mr.stop();
    rec.current = null;
    setRecording(false);
  };

  return (
    <div className="audio-field">
      <TextInput value={value} placeholder="URL de audio (.mp3, .m4a, .ogg)" mono onCommit={onChange} />
      <div className="audio-actions">
        <IconButton icon={playing ? Pause : Play} label={playing ? 'Pausar' : 'Escuchar'} disabled={!value} sound={false} onClick={toggle} />
        <IconButton icon={Upload} label="Subir audio" anim="up" onClick={upload} />
        {record &&
          (recording ? (
            <button className="btn small rec-btn is-recording" onClick={stopRecording}>
              <Square size={11} fill="currentColor" /> {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
            </button>
          ) : (
            <IconButton icon={Mic} label="Grabar con el micrófono" anim="pop" onClick={startRecording} />
          ))}
        {value && <IconButton icon={Trash2} label="Quitar" variant="danger" sound="remove" onClick={() => onChange('')} />}
      </div>
    </div>
  );
}
