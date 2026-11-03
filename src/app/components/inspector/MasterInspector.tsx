/**
 * Panel de la diapositiva maestra: elementos que aparecen en todas las
 * diapositivas (logo, pie, numeración…) con variables {n} {total} {title} {date}.
 */
import { CalendarDays, Hash, Image as ImageIcon, Minus, PanelBottom, Trash2, Type } from 'lucide-react';
import { MASTER_ID } from '../../../core/commands';
import type { ElementInput } from '../../../core/model';
import { pickFile, uploadAsset } from '../../lib/assets';
import { sfx } from '../../lib/sound';
import { useEditor } from '../../store/editor';
import { Section, Switch } from '../ui/fields';

function add(element: ElementInput) {
  const st = useEditor.getState();
  const [res] = st.dispatch([{ op: 'element.add', slide: MASTER_ID, element: element as Record<string, unknown> }]);
  if (res?.ok && res.id) {
    st.select([res.id]);
    sfx('pop');
  } else if (res?.error) st.toast(res.error, 'error');
}

export function MasterInspector() {
  const doc = useEditor((s) => s.doc);
  const W = doc.width;
  const H = doc.height;
  const count = doc.master?.elements.length ?? 0;
  const muted = doc.theme.colors.muted;
  const first = doc.slides[0];

  const footerText = (html: string, x: number, w: number, align: 'left' | 'right' | 'center', name: string): ElementInput => ({
    type: 'text',
    name,
    html,
    x,
    y: H - 92,
    w,
    h: 44,
    size: 22,
    weight: 600,
    color: muted,
    align,
    valign: 'middle',
    letterSpacing: 0.5,
    animation: { entrance: 'none' },
  });

  const logo = async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    try {
      const src = await uploadAsset(file);
      add({ type: 'image', name: 'Logo', src, fit: 'contain', x: W - 140 - 200, y: 64, w: 200, h: 72, animation: { entrance: 'none' } });
    } catch (err) {
      useEditor.getState().toast(err instanceof Error ? err.message : 'No se pudo subir', 'error');
    }
  };

  return (
    <div className="inspector-scroll">
      <Section title="Diapositiva maestra" id="ms-info">
        <p className="hint" style={{ marginTop: 0 }}>
          Los elementos de la maestra se dibujan detrás del contenido de cada diapositiva. Úsala para el logo, el pie, la numeración o una marca de
          agua. En los textos puedes usar variables:
        </p>
        <div className="master-tokens">
          <code>{'{n}'}</code>
          <code>{'{total}'}</code>
          <code>{'{title}'}</code>
          <code>{'{date}'}</code>
        </div>
      </Section>
      <Section title="Añadir rápido" id="ms-add">
        <div className="master-actions">
          <button className="btn soft" onClick={() => add(footerText('{n} / {total}', W - 140 - 220, 220, 'right', 'Paginación'))}>
            <Hash size={14} /> Paginación
          </button>
          <button className="btn soft" onClick={() => add(footerText('{title}', 140, 900, 'left', 'Pie: título'))}>
            <PanelBottom size={14} /> Pie con título
          </button>
          <button className="btn soft" onClick={() => add(footerText('{date}', W / 2 - 250, 500, 'center', 'Fecha'))}>
            <CalendarDays size={14} /> Fecha
          </button>
          <button className="btn soft" onClick={() => void logo()}>
            <ImageIcon size={14} /> Logo
          </button>
          <button
            className="btn soft"
            onClick={() =>
              add({
                type: 'shape',
                name: 'Línea del pie',
                shape: 'rect',
                x: 140,
                y: H - 112,
                w: W - 280,
                h: 2,
                style: { fill: `color-mix(in srgb, ${muted} 35%, transparent)` },
                animation: { entrance: 'none' },
              })
            }
          >
            <Minus size={14} /> Línea
          </button>
          <button
            className="btn soft"
            onClick={() =>
              add({
                type: 'text',
                name: 'Marca de agua',
                html: 'CONFIDENCIAL',
                x: W - 140 - 600,
                y: 60,
                w: 600,
                h: 60,
                size: 20,
                weight: 700,
                letterSpacing: 6,
                color: muted,
                align: 'right',
                opacity: 0.6,
                animation: { entrance: 'none' },
              })
            }
          >
            <Type size={14} /> Etiqueta
          </button>
        </div>
      </Section>
      <Section title="Opciones" id="ms-opts">
        {first && (
          <Switch
            checked={first.hideMaster}
            onChange={(v) => useEditor.getState().dispatch([{ op: 'slide.update', slide: first.id, patch: { hideMaster: v } }])}
            label="Ocultarla en la portada (diapositiva 1)"
          />
        )}
        <p className="hint">Cada diapositiva puede ocultarla desde su panel («Ocultar maestra»).</p>
        {count > 0 && (
          <button
            className="btn danger"
            style={{ marginTop: 8 }}
            onClick={() => {
              sfx('remove');
              const st = useEditor.getState();
              st.dispatch([{ op: 'slide.delete', slide: MASTER_ID }]);
              st.toast('Maestra quitada (puedes deshacer con ⌘Z)', 'info');
            }}
          >
            <Trash2 size={14} /> Quitar maestra ({count} {count === 1 ? 'elemento' : 'elementos'})
          </button>
        )}
      </Section>
    </div>
  );
}
