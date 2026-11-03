import { useEffect, useRef, useState } from 'react';
import { normalizePresentation, type Presentation } from '../../core/model';
import { Deck } from '../../render/Deck';
import { createPlayer, type PlayerInstance } from '../../runtime/player.js';

/** Visor público de solo lectura: /?view=<id>. Se actualiza en vivo al editarse. */
export function ViewerPage({ id }: { id: string }) {
  const [doc, setDoc] = useState<Presentation | null>(null);
  const [error, setError] = useState('');
  const host = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);

  useEffect(() => {
    let es: EventSource | null = null;
    fetch(`/api/presentations/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? 'Presentación no encontrada' : r.statusText))))
      .then((d) => {
        setDoc(normalizePresentation(d));
        es = new EventSource(`/api/presentations/${encodeURIComponent(id)}/events`);
        es.onmessage = (e) => {
          try {
            const evt = JSON.parse(e.data) as { type: string; doc: Presentation };
            if (evt.type === 'doc') setDoc(normalizePresentation(evt.doc));
          } catch {
            /* ignora */
          }
        };
      })
      .catch((err: Error) => {
        // Sin servidor: intenta con el almacenamiento local de este navegador.
        try {
          const raw = localStorage.getItem(`lumen:doc:${id}`);
          if (raw) return setDoc(normalizePresentation(JSON.parse(raw)));
        } catch {
          /* noop */
        }
        setError(err.message);
      });
    return () => es?.close();
  }, [id]);

  useEffect(() => {
    if (!doc || !host.current) return;
    document.title = doc.title;
    const root = host.current.querySelector<HTMLElement>('.lm-deck');
    if (!root) return;
    const player: PlayerInstance = createPlayer(root, {
      width: doc.width,
      height: doc.height,
      loop: doc.settings.loop,
      autoAdvance: doc.settings.autoAdvance,
      progress: doc.settings.progress,
      slideNumbers: doc.settings.slideNumbers,
      sounds: doc.settings.sounds,
      controls: doc.settings.controls,
      hash: true,
      startIndex: indexRef.current,
      onChange: (i) => {
        indexRef.current = i;
      },
    });
    root.focus();
    return () => player.destroy();
  }, [doc]);

  if (error) return <div className="viewer-msg">{error}</div>;
  if (!doc) return <div className="viewer-msg">Cargando…</div>;
  return (
    <div className="viewer" ref={host}>
      <Deck doc={doc} mode="play" />
    </div>
  );
}
