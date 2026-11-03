import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Italic,
  Lock,
  RotateCcw,
  Shapes,
  Sparkles,
  Trash2,
  Type,
  Underline,
  Unlock,
  Upload,
  Video,
  Globe,
  CaseUpper,
  ChartColumn,
  Group,
  Ungroup,
  Table2,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
} from 'lucide-react';
import type { Command } from '../../../core/commands';
import { SHAPES, BLEND_MODES, MASKS, type SlideElement } from '../../../core/model';
import { FONTS, STOCK_IMAGES, STOCK_VIDEOS } from '../../../core/themes';
import { CLIP_SHAPES } from '../../../render/styles';
import { pickFile, uploadAsset } from '../../lib/assets';
import { sfx } from '../../lib/sound';
import { useEditor } from '../../store/editor';
import { IconPicker } from '../IconPicker';
import { IconButton } from '../ui/IconButton';
import { ColorInput, Grid, NumberInput, Row, Section, Segmented, Select, Slider, Switch, TextInput } from '../ui/fields';
import { Popover } from '../ui/Popover';
import { ChartEditor } from './ChartEditor';
import { TableEditor } from './TableEditor';
import { BLEND_LABELS, MASK_LABELS, SHAPE_LABELS, toEmbedUrl, useElementPatch } from './common';

const TYPE_META: Record<SlideElement['type'], { label: string; icon: typeof Type }> = {
  text: { label: 'Texto', icon: Type },
  image: { label: 'Imagen', icon: ImageIcon },
  video: { label: 'Video', icon: Video },
  shape: { label: 'Forma', icon: Shapes },
  icon: { label: 'Icono', icon: Sparkles },
  embed: { label: 'Incrustado', icon: Globe },
  chart: { label: 'Gráfico', icon: ChartColumn },
  table: { label: 'Tabla', icon: Table2 },
};

const SHADOWS: { id: string; label: string; value: null | { x: number; y: number; blur: number; spread: number; color: string } }[] = [
  { id: 'none', label: 'Ninguna', value: null },
  { id: 'soft', label: 'Suave', value: { x: 0, y: 12, blur: 40, spread: 0, color: 'rgba(0,0,0,0.25)' } },
  { id: 'medium', label: 'Media', value: { x: 0, y: 24, blur: 64, spread: 0, color: 'rgba(0,0,0,0.4)' } },
  { id: 'deep', label: 'Profunda', value: { x: 0, y: 40, blur: 120, spread: -10, color: 'rgba(0,0,0,0.6)' } },
  { id: 'hard', label: 'Dura', value: { x: 12, y: 12, blur: 0, spread: 0, color: 'rgba(0,0,0,0.9)' } },
];

const EFFECT_PRESETS: { label: string; style: Record<string, unknown> }[] = [
  {
    label: 'Vidrio',
    style: { fill: 'rgba(255,255,255,0.08)', backdropBlur: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', radius: 28, shadow: SHADOWS[2].value },
  },
  { label: 'Neón', style: { glow: 40, glowColor: '', borderWidth: 2, borderColor: 'var(--lm-primary)' } },
  { label: 'Duotono', style: { grayscale: 100, contrast: 120, blendMode: 'luminosity' } },
  { label: 'Vintage', style: { sepia: 45, contrast: 110, saturate: 80, brightness: 95 } },
  { label: 'Sueño', style: { blur: 2, brightness: 115, saturate: 140 } },
  { label: 'Noir', style: { grayscale: 100, contrast: 140, brightness: 90 } },
];

const RESET_EFFECTS = {
  blur: 0,
  backdropBlur: 0,
  brightness: 100,
  contrast: 100,
  saturate: 100,
  hueRotate: 0,
  grayscale: 0,
  sepia: 0,
  invert: 0,
  blendMode: 'normal',
  mask: 'none',
  glow: 0,
};

export function ElementInspector({ elements }: { elements: SlideElement[] }) {
  const ids = elements.map((e) => e.id);
  const el = elements[0];
  const patch = useElementPatch(ids);
  const dispatch = useEditor((s) => s.dispatch);
  const W = useEditor((s) => s.doc.width);
  const H = useEditor((s) => s.doc.height);
  const multi = elements.length > 1;
  const meta = TYPE_META[el.type];
  const style = (s: Record<string, unknown>, field?: string) => patch({ style: s }, field ?? `style.${Object.keys(s).join(',')}`);
  const all = (fn: (id: string) => Command) => dispatch(ids.map(fn));

  const align = (a: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    sfx('tick');
    if (!multi) return dispatch([{ op: 'element.align', element: el.id, align: a }]);
    const l = Math.min(...elements.map((e) => e.x));
    const t = Math.min(...elements.map((e) => e.y));
    const r = Math.max(...elements.map((e) => e.x + e.w));
    const b = Math.max(...elements.map((e) => e.y + e.h));
    dispatch(
      elements.map((e) => ({
        op: 'element.update',
        element: e.id,
        patch:
          a === 'left' ? { x: l } : a === 'right' ? { x: r - e.w } : a === 'center' ? { x: Math.round((l + r - e.w) / 2) }
          : a === 'top' ? { y: t } : a === 'bottom' ? { y: b - e.h } : { y: Math.round((t + b - e.h) / 2) },
      })),
    );
  };

  const replaceMedia = async (accept: string) => {
    const file = await pickFile(accept);
    if (!file) return;
    try {
      const url = await uploadAsset(file);
      patch({ src: url });
      sfx('success');
    } catch (err) {
      useEditor.getState().toast(err instanceof Error ? err.message : 'Error al subir', 'error');
    }
  };

  return (
    <div className="inspector-scroll">
      <div className="el-header">
        <span className="el-type">
          <meta.icon size={15} />
        </span>
        {multi ? (
          <span className="el-name">{elements.length} elementos</span>
        ) : (
          <TextInput value={el.name} placeholder={meta.label} onCommit={(v) => patch({ name: v })} />
        )}
        <div className="el-actions">
          <IconButton
            icon={el.locked ? Lock : Unlock}
            label={el.locked ? 'Desbloquear' : 'Bloquear'}
            active={el.locked}
            anim="swing"
            onClick={() => all((id) => ({ op: 'element.update', element: id, patch: { locked: !el.locked } }))}
          />
          <IconButton
            icon={el.hidden ? EyeOff : Eye}
            label={el.hidden ? 'Mostrar en presentación' : 'Ocultar en presentación'}
            active={el.hidden}
            onClick={() => all((id) => ({ op: 'element.update', element: id, patch: { hidden: !el.hidden } }))}
          />
          <IconButton icon={Copy} label="Duplicar" kbd="⌘D" anim="pop" onClick={() => all((id) => ({ op: 'element.duplicate', element: id }))} />
          <IconButton
            icon={Trash2}
            label="Eliminar"
            kbd="⌫"
            variant="danger"
            sound="remove"
            onClick={() => all((id) => ({ op: 'element.delete', element: id }))}
          />
        </div>
      </div>

      <Section title="Disposición" id="el-layout">
        <div className="align-bar">
          <IconButton icon={AlignStartVertical} label="Alinear a la izquierda" size={15} onClick={() => align('left')} />
          <IconButton icon={AlignCenterVertical} label="Centrar horizontalmente" size={15} onClick={() => align('center')} />
          <IconButton icon={AlignEndVertical} label="Alinear a la derecha" size={15} onClick={() => align('right')} />
          <span className="bar-sep" />
          <IconButton icon={AlignStartHorizontal} label="Alinear arriba" size={15} onClick={() => align('top')} />
          <IconButton icon={AlignCenterHorizontal} label="Centrar verticalmente" size={15} onClick={() => align('middle')} />
          <IconButton icon={AlignEndHorizontal} label="Alinear abajo" size={15} onClick={() => align('bottom')} />
          <span className="bar-sep" />
          <IconButton icon={ArrowUpToLine} label="Traer al frente" kbd="]" size={15} anim="up" onClick={() => all((id) => ({ op: 'element.arrange', element: id, action: 'front' }))} />
          <IconButton icon={ArrowDownToLine} label="Enviar al fondo" kbd="[" size={15} anim="down" onClick={() => all((id) => ({ op: 'element.arrange', element: id, action: 'back' }))} />
        </div>
        {multi && (
          <div className="align-bar">
            {elements.every((e) => e.group && e.group === el.group) ? (
              <IconButton icon={Ungroup} label="Desagrupar" kbd="⇧⌘G" size={15} anim="pop" onClick={() => dispatch([{ op: 'elements.ungroup', elements: ids }])}>
                Desagrupar
              </IconButton>
            ) : (
              <IconButton icon={Group} label="Agrupar" kbd="⌘G" size={15} anim="pop" onClick={() => dispatch([{ op: 'elements.group', elements: ids }])}>
                Agrupar
              </IconButton>
            )}
            <span className="bar-sep" />
            <IconButton
              icon={AlignHorizontalSpaceAround}
              label="Distribuir horizontalmente"
              size={15}
              disabled={elements.length < 3}
              onClick={() => dispatch([{ op: 'elements.distribute', elements: ids, axis: 'horizontal' }])}
            />
            <IconButton
              icon={AlignVerticalSpaceAround}
              label="Distribuir verticalmente"
              size={15}
              disabled={elements.length < 3}
              onClick={() => dispatch([{ op: 'elements.distribute', elements: ids, axis: 'vertical' }])}
            />
          </div>
        )}
        {!multi && (
          <Grid cols={2}>
            <NumberInput label="X" value={el.x} onChange={(v) => patch({ x: v }, 'x')} />
            <NumberInput label="Y" value={el.y} onChange={(v) => patch({ y: v }, 'y')} />
            <NumberInput label="An" value={el.w} min={1} onChange={(v) => patch({ w: v }, 'w')} />
            <NumberInput label="Al" value={el.h} min={1} onChange={(v) => patch({ h: v }, 'h')} />
            <NumberInput label="↻" value={el.rotation} min={-360} max={360} unit="°" onChange={(v) => patch({ rotation: v }, 'rotation')} />
            <button
              className="btn ghost small"
              onClick={() => patch({ x: 0, y: 0, w: W, h: H, rotation: 0 })}
              data-tip="Ocupar toda la diapositiva"
            >
              Pantalla completa
            </button>
          </Grid>
        )}
        <Row label="Opacidad">
          <Slider value={Math.round(el.opacity * 100)} unit="%" onChange={(v) => patch({ opacity: v / 100 }, 'opacity')} />
        </Row>
      </Section>

      {!multi && el.type === 'text' && (
        <Section title="Tipografía" id="el-text">
          <Row label="Fuente">
            <Select
              value={el.font || `theme:${el.role}`}
              onChange={(v) =>
                v.startsWith('theme:') ? patch({ font: '', role: v.slice(6) }) : patch({ font: v })
              }
              options={[
                { value: 'theme:heading', label: 'Tema · Títulos' },
                { value: 'theme:body', label: 'Tema · Cuerpo' },
                ...FONTS.map((f) => ({ value: f, label: f })),
              ]}
            />
          </Row>
          <Grid cols={2}>
            <NumberInput label="Tam" value={el.size} min={4} max={600} unit="px" onChange={(v) => patch({ size: v }, 'size')} />
            <Select
              value={String(el.weight)}
              onChange={(v) => patch({ weight: Number(v) })}
              options={[
                ['300', 'Ligera'],
                ['400', 'Regular'],
                ['500', 'Media'],
                ['600', 'Semi'],
                ['700', 'Negrita'],
                ['800', 'Extra'],
                ['900', 'Black'],
              ].map(([value, label]) => ({ value, label }))}
            />
          </Grid>
          <Row label="Color">
            <ColorInput value={el.color} allowEmpty emptyLabel="Color del tema" onChange={(v) => patch({ color: v })} />
          </Row>
          <Row label="Degradado">
            <ColorInput value={el.gradient} gradients allowEmpty emptyLabel="Sin degradado" onChange={(v) => patch({ gradient: v === 'transparent' ? '' : v })} />
          </Row>
          <Row label="Alinear">
            <Segmented
              layoutId="text-align"
              value={el.align}
              onChange={(v) => patch({ align: v })}
              options={[
                { value: 'left', icon: <AlignLeft size={14} />, tip: 'Izquierda' },
                { value: 'center', icon: <AlignCenter size={14} />, tip: 'Centro' },
                { value: 'right', icon: <AlignRight size={14} />, tip: 'Derecha' },
                { value: 'justify', icon: <AlignJustify size={14} />, tip: 'Justificado' },
              ]}
            />
          </Row>
          <Row label="Vertical">
            <Segmented
              layoutId="text-valign"
              value={el.valign}
              onChange={(v) => patch({ valign: v })}
              options={[
                { value: 'top', label: 'Arriba' },
                { value: 'middle', label: 'Centro' },
                { value: 'bottom', label: 'Abajo' },
              ]}
            />
          </Row>
          <Row label="Estilo">
            <div className="toggle-group">
              <IconButton icon={Italic} label="Cursiva" active={el.italic} onClick={() => patch({ italic: !el.italic })} />
              <IconButton icon={Underline} label="Subrayado" active={el.underline} onClick={() => patch({ underline: !el.underline })} />
              <IconButton
                icon={CaseUpper}
                label="Mayúsculas"
                active={el.transform === 'uppercase'}
                onClick={() => patch({ transform: el.transform === 'uppercase' ? 'none' : 'uppercase' })}
              />
            </div>
          </Row>
          <Row label="Interlineado">
            <Slider value={el.lineHeight} min={0.6} max={3} step={0.05} precision={2} onChange={(v) => patch({ lineHeight: v }, 'lh')} />
          </Row>
          <Row label="Espaciado">
            <Slider value={el.letterSpacing} min={-10} max={40} step={0.5} precision={1} unit="px" onChange={(v) => patch({ letterSpacing: v }, 'ls')} />
          </Row>
          <Row label="Contorno">
            <TextInput value={el.stroke} placeholder="p. ej. 2px #ffffff" onCommit={(v) => patch({ stroke: v })} mono />
          </Row>
          <Row label="Sombra">
            <Select
              value={el.textShadow}
              onChange={(v) => patch({ textShadow: v })}
              options={[
                { value: '', label: 'Ninguna' },
                { value: '0 4px 24px rgba(0,0,0,0.45)', label: 'Suave' },
                { value: '0 0 24px var(--lm-primary), 0 0 64px var(--lm-primary)', label: 'Neón' },
                { value: '4px 4px 0 rgba(0,0,0,0.9)', label: 'Retro' },
                { value: '0 1px 0 rgba(255,255,255,0.4), 0 -1px 0 rgba(0,0,0,0.6)', label: 'Relieve' },
              ]}
            />
          </Row>
          <p className="hint">Doble clic sobre el texto para editarlo. ⌘B / ⌘I / ⌘U dentro del texto.</p>
        </Section>
      )}

      {!multi && el.type === 'image' && (
        <Section title="Imagen" id="el-image">
          <Row label="URL">
            <TextInput value={el.src} onCommit={(v) => patch({ src: v })} placeholder="https://…" mono />
          </Row>
          <div className="btn-row">
            <button className="btn soft" onClick={() => replaceMedia('image/*')}>
              <Upload size={14} /> Subir imagen
            </button>
          </div>
          <div className="stock-grid">
            {STOCK_IMAGES.map((src) => (
              <button key={src} className="stock-cell" onClick={() => patch({ src })} style={{ backgroundImage: `url(${src.replace('w=1920', 'w=240')})` }} />
            ))}
          </div>
          <Row label="Ajuste">
            <Segmented
              layoutId="img-fit"
              value={el.fit}
              onChange={(v) => patch({ fit: v })}
              options={[
                { value: 'cover', label: 'Cubrir' },
                { value: 'contain', label: 'Contener' },
                { value: 'fill', label: 'Estirar' },
              ]}
            />
          </Row>
          <Row label="Ken Burns">
            <Switch checked={el.kenBurns} onChange={(v) => patch({ kenBurns: v })} />
          </Row>
          <Row label="Texto alt.">
            <TextInput value={el.alt} onCommit={(v) => patch({ alt: v })} placeholder="Descripción accesible" />
          </Row>
        </Section>
      )}

      {!multi && el.type === 'video' && (
        <Section title="Video" id="el-video">
          <Row label="URL">
            <TextInput value={el.src} onCommit={(v) => patch({ src: v })} placeholder="https://…/video.mp4" mono />
          </Row>
          <div className="btn-row">
            <button className="btn soft" onClick={() => replaceMedia('video/*')}>
              <Upload size={14} /> Subir video
            </button>
          </div>
          <div className="chips">
            {STOCK_VIDEOS.map((v) => (
              <button key={v.src} className={`chip${el.src === v.src ? ' is-active' : ''}`} onClick={() => patch({ src: v.src })}>
                {v.label}
              </button>
            ))}
          </div>
          <Grid cols={2}>
            <Switch checked={el.autoplay} onChange={(v) => patch({ autoplay: v })} label="Autoplay" />
            <Switch checked={el.loop} onChange={(v) => patch({ loop: v })} label="Bucle" />
            <Switch checked={el.muted} onChange={(v) => patch({ muted: v })} label="Silenciado" />
            <Switch checked={el.controls} onChange={(v) => patch({ controls: v })} label="Controles" />
          </Grid>
          <Row label="Velocidad">
            <Slider value={el.playbackRate} min={0.25} max={3} step={0.25} precision={2} unit="×" onChange={(v) => patch({ playbackRate: v }, 'rate')} />
          </Row>
          <Row label="Ajuste">
            <Segmented
              layoutId="vid-fit"
              value={el.fit}
              onChange={(v) => patch({ fit: v })}
              options={[
                { value: 'cover', label: 'Cubrir' },
                { value: 'contain', label: 'Contener' },
              ]}
            />
          </Row>
        </Section>
      )}

      {!multi && el.type === 'shape' && (
        <Section title="Forma" id="el-shape">
          <div className="shape-grid">
            {SHAPES.map((s) => (
              <button
                key={s}
                className={`shape-cell${el.shape === s ? ' is-active' : ''}`}
                onClick={() => patch({ shape: s })}
                data-tip={SHAPE_LABELS[s]}
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
        </Section>
      )}

      {!multi && el.type === 'icon' && (
        <Section title="Icono" id="el-icon">
          <Popover
            width={340}
            align="end"
            trigger={({ toggle, ref }) => (
              <button ref={ref as React.RefObject<HTMLButtonElement>} className="btn soft wide" onClick={toggle}>
                <Sparkles size={14} /> Cambiar icono · {el.icon}
              </button>
            )}
          >
            {(close) => (
              <IconPicker
                value={el.icon}
                onPick={(name) => {
                  patch({ icon: name });
                  close();
                }}
              />
            )}
          </Popover>
          <Row label="Color">
            <ColorInput value={el.color} allowEmpty emptyLabel="Primario del tema" onChange={(v) => patch({ color: v })} />
          </Row>
          <Row label="Trazo">
            <Slider value={el.strokeWidth} min={0.5} max={4} step={0.25} precision={2} onChange={(v) => patch({ strokeWidth: v }, 'stroke')} />
          </Row>
          <Row label="Relleno int.">
            <Slider value={el.padding} min={0} max={200} unit="px" onChange={(v) => patch({ padding: v }, 'pad')} />
          </Row>
        </Section>
      )}

      {!multi && el.type === 'chart' && <ChartEditor el={el} patch={patch} />}
      {!multi && el.type === 'table' && <TableEditor el={el} patch={patch} />}

      {!multi && el.type === 'embed' && (
        <Section title="Contenido incrustado" id="el-embed">
          <Row label="URL">
            <TextInput value={el.url} onCommit={(v) => patch({ url: toEmbedUrl(v) })} placeholder="YouTube, Vimeo, Figma, mapas…" mono />
          </Row>
          <Row label="Interactivo">
            <Switch checked={el.interactive} onChange={(v) => patch({ interactive: v })} />
          </Row>
          <p className="hint">Los enlaces de YouTube y Vimeo se convierten automáticamente al formato incrustable.</p>
        </Section>
      )}

      <Section title="Relleno y borde" id="el-fill">
        <Row label="Relleno">
          <ColorInput value={el.style.fill} gradients onChange={(v) => style({ fill: v })} />
        </Row>
        <Row label="Esquinas">
          <Slider value={el.style.radius} min={0} max={400} unit="px" onChange={(v) => style({ radius: v }, 'radius')} />
        </Row>
        <Row label="Borde">
          <div className="inline-controls">
            <NumberInput value={el.style.borderWidth} min={0} max={60} unit="px" onChange={(v) => style({ borderWidth: v }, 'bw')} />
            <Select
              value={el.style.borderStyle}
              onChange={(v) => style({ borderStyle: v })}
              options={[
                { value: 'solid', label: 'Sólido' },
                { value: 'dashed', label: 'Guiones' },
                { value: 'dotted', label: 'Puntos' },
              ]}
            />
          </div>
        </Row>
        <Row label="Color borde">
          <ColorInput value={el.style.borderColor} onChange={(v) => style({ borderColor: v })} />
        </Row>
      </Section>

      <Section title="Sombra y brillo" id="el-shadow">
        <div className="chips">
          {SHADOWS.map((s) => (
            <button
              key={s.id}
              className={`chip${JSON.stringify(el.style.shadow) === JSON.stringify(s.value) ? ' is-active' : ''}`}
              onClick={() => style({ shadow: s.value })}
            >
              {s.label}
            </button>
          ))}
        </div>
        {el.style.shadow && (
          <>
            <Grid cols={2}>
              <NumberInput label="X" value={el.style.shadow.x} onChange={(v) => style({ shadow: { x: v } }, 'sx')} />
              <NumberInput label="Y" value={el.style.shadow.y} onChange={(v) => style({ shadow: { y: v } }, 'sy')} />
              <NumberInput label="Des" value={el.style.shadow.blur} min={0} onChange={(v) => style({ shadow: { blur: v } }, 'sb')} />
              <NumberInput label="Exp" value={el.style.shadow.spread} onChange={(v) => style({ shadow: { spread: v } }, 'ss')} />
            </Grid>
            <Row label="Color">
              <ColorInput value={el.style.shadow.color} onChange={(v) => style({ shadow: { color: v } })} />
            </Row>
          </>
        )}
        <Row label="Resplandor">
          <Slider value={el.style.glow} min={0} max={200} unit="px" onChange={(v) => style({ glow: v }, 'glow')} />
        </Row>
        {el.style.glow > 0 && (
          <Row label="Color brillo">
            <ColorInput value={el.style.glowColor} allowEmpty emptyLabel="Primario del tema" onChange={(v) => style({ glowColor: v })} />
          </Row>
        )}
      </Section>

      <Section
        title="Efectos"
        id="el-effects"
        actions={<IconButton icon={RotateCcw} label="Restablecer efectos" size={13} anim="spin" onClick={() => style(RESET_EFFECTS)} />}
      >
        <div className="chips">
          {EFFECT_PRESETS.map((p) => (
            <button key={p.label} className="chip" onClick={() => style(p.style)}>
              {p.label}
            </button>
          ))}
        </div>
        <Row label="Desenfoque">
          <Slider value={el.style.blur} min={0} max={60} unit="px" onChange={(v) => style({ blur: v }, 'blur')} />
        </Row>
        <Row label="Vidrio" hint="Desenfoca lo que hay detrás del elemento (necesita un relleno semitransparente).">
          <Slider value={el.style.backdropBlur} min={0} max={80} unit="px" onChange={(v) => style({ backdropBlur: v }, 'bblur')} />
        </Row>
        <Row label="Brillo">
          <Slider value={el.style.brightness} min={0} max={200} unit="%" onChange={(v) => style({ brightness: v }, 'bright')} />
        </Row>
        <Row label="Contraste">
          <Slider value={el.style.contrast} min={0} max={200} unit="%" onChange={(v) => style({ contrast: v }, 'contrast')} />
        </Row>
        <Row label="Saturación">
          <Slider value={el.style.saturate} min={0} max={300} unit="%" onChange={(v) => style({ saturate: v }, 'sat')} />
        </Row>
        <Row label="Tono">
          <Slider value={el.style.hueRotate} min={-180} max={180} unit="°" onChange={(v) => style({ hueRotate: v }, 'hue')} />
        </Row>
        <Row label="Grises">
          <Slider value={el.style.grayscale} min={0} max={100} unit="%" onChange={(v) => style({ grayscale: v }, 'gray')} />
        </Row>
        <Row label="Sepia">
          <Slider value={el.style.sepia} min={0} max={100} unit="%" onChange={(v) => style({ sepia: v }, 'sepia')} />
        </Row>
        <Row label="Invertir">
          <Slider value={el.style.invert} min={0} max={100} unit="%" onChange={(v) => style({ invert: v }, 'invert')} />
        </Row>
        <Row label="Fusión">
          <Select value={el.style.blendMode} onChange={(v) => style({ blendMode: v })} options={BLEND_MODES.map((b) => ({ value: b, label: BLEND_LABELS[b] }))} />
        </Row>
        <Row label="Máscara">
          <Select value={el.style.mask} onChange={(v) => style({ mask: v })} options={MASKS.map((m) => ({ value: m, label: MASK_LABELS[m] }))} />
        </Row>
      </Section>

      {!multi && (
        <Section title="Enlace" id="el-link" defaultOpen={false}>
          <Row label="Al hacer clic">
            <TextInput value={el.link} onCommit={(v) => patch({ link: v })} placeholder="https://… o #3" mono />
          </Row>
          <p className="hint">Usa «#n» para saltar a la diapositiva n durante la presentación.</p>
        </Section>
      )}
    </div>
  );
}
