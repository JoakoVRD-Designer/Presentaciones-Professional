import { Film, Image as ImageIcon, Palette, Play, Sparkles, Square, Upload, Volume2 } from 'lucide-react';
import { useMemo } from 'react';
import { BG_EFFECTS, BackgroundSchema, CAMERAS, SOUNDS, TRANSITIONS, type Slide, type Theme } from '../../../core/model';
import { STOCK_IMAGES, STOCK_VIDEOS } from '../../../core/themes';
import { SlideRenderer } from '../../../render/SlideRenderer';
import { pickFile, uploadAsset } from '../../lib/assets';
import { previewSound, sfx } from '../../lib/sound';
import { useCurrentSlide, useEditor } from '../../store/editor';
import { ColorInput, Row, Section, Segmented, Select, Slider, Switch, TextArea, TextInput } from '../ui/fields';
import { IconButton } from '../ui/IconButton';
import { AudioField } from '../ui/AudioField';
import { CAMERA_LABELS, EFFECT_LABELS, SOUND_LABELS, TRANSITION_LABELS, useSlidePatch } from './common';

function EffectTile({ effect, slide, theme, active, onPick }: { effect: string; slide: Slide; theme: Theme; active: boolean; onPick: () => void }) {
  const mini = useMemo<Slide>(
    () => ({
      ...slide,
      elements: [],
      background: BackgroundSchema.parse({ ...slide.background, type: 'effect', effect, overlayOpacity: 0, grain: 0, vignette: 0, blur: 0 }),
    }),
    [effect, slide, theme],
  );
  return (
    <button className={`fx-tile${active ? ' is-active' : ''}`} onClick={onPick}>
      <div className="fx-tile-render">
        <div style={{ transform: 'scale(0.05)', transformOrigin: '0 0', width: 1920, height: 1080 }}>
          <SlideRenderer slide={mini} theme={theme} mode="edit" live />
        </div>
      </div>
      <span>{EFFECT_LABELS[effect]}</span>
    </button>
  );
}

export function SlideInspector() {
  const slide = useCurrentSlide();
  const theme = useEditor((s) => s.doc.theme);
  const p = useSlidePatch(slide?.id);
  if (!slide) return <div className="inspector-scroll empty">Sin diapositiva</div>;
  const bg = slide.background;
  const tr = slide.transition;

  const previewCamera = () => {
    requestAnimationFrame(() => {
      const cam = document.querySelector<HTMLElement>('.canvas-slide .lm-cam');
      if (!cam) return;
      cam.classList.remove('lm-cam-preview');
      void cam.offsetWidth;
      cam.classList.add('lm-cam-preview');
      window.setTimeout(() => cam.classList.remove('lm-cam-preview'), Math.min(slide.cameraDuration, 8000));
    });
  };

  const upload = async (kind: 'image' | 'video') => {
    const file = await pickFile(kind === 'image' ? 'image/*' : 'video/*');
    if (!file) return;
    try {
      const url = await uploadAsset(file);
      p.background(kind === 'image' ? { type: 'image', image: url } : { type: 'video', video: url });
      sfx('success');
    } catch (err) {
      useEditor.getState().toast(err instanceof Error ? err.message : 'Error al subir', 'error');
    }
  };

  return (
    <div className="inspector-scroll">
      <Section title="Diapositiva" id="sl-meta">
        <Row label="Nombre">
          <TextInput value={slide.name} placeholder="Sin nombre" onCommit={(v) => p.update({ name: v })} />
        </Row>
        <Row label="Avance auto." hint="Segundos antes de pasar a la siguiente (0 = manual)">
          <Slider value={slide.duration} min={0} max={60} unit="s" onChange={(v) => p.update({ duration: v }, 'duration')} />
        </Row>
        <Row label="Ocultar">
          <Switch checked={slide.hidden} onChange={(v) => p.update({ hidden: v })} />
        </Row>
      </Section>

      <Section title="Fondo" id="sl-bg">
        <Segmented
          layoutId="bg-type"
          value={bg.type}
          onChange={(v) => p.background({ type: v })}
          options={[
            { value: 'color', icon: <Square size={13} />, tip: 'Color' },
            { value: 'gradient', icon: <Palette size={13} />, tip: 'Degradado' },
            { value: 'image', icon: <ImageIcon size={13} />, tip: 'Imagen' },
            { value: 'video', icon: <Film size={13} />, tip: 'Video' },
            { value: 'effect', icon: <Sparkles size={13} />, tip: 'Efecto animado' },
          ]}
        />
        <Row label="Color base">
          <ColorInput value={bg.color} allowEmpty emptyLabel="Fondo del tema" onChange={(v) => p.background({ color: v })} />
        </Row>

        {bg.type === 'gradient' && (
          <Row label="Degradado">
            <ColorInput value={bg.gradient} gradients onChange={(v) => p.background({ gradient: v })} />
          </Row>
        )}

        {bg.type === 'image' && (
          <>
            <Row label="URL">
              <TextInput value={bg.image} placeholder="https://…" mono onCommit={(v) => p.background({ image: v })} />
            </Row>
            <button className="btn soft" onClick={() => upload('image')}>
              <Upload size={14} /> Subir imagen
            </button>
            <div className="stock-grid">
              {STOCK_IMAGES.map((src) => (
                <button
                  key={src}
                  className={`stock-cell${bg.image === src ? ' is-active' : ''}`}
                  onClick={() => p.background({ image: src })}
                  style={{ backgroundImage: `url(${src.replace('w=1920', 'w=240')})` }}
                />
              ))}
            </div>
            <Row label="Ken Burns">
              <Switch checked={bg.kenBurns} onChange={(v) => p.background({ kenBurns: v })} />
            </Row>
          </>
        )}

        {bg.type === 'video' && (
          <>
            <Row label="URL">
              <TextInput value={bg.video} placeholder="https://…/video.mp4" mono onCommit={(v) => p.background({ video: v })} />
            </Row>
            <button className="btn soft" onClick={() => upload('video')}>
              <Upload size={14} /> Subir video
            </button>
            <div className="chips">
              {STOCK_VIDEOS.map((v) => (
                <button key={v.src} className={`chip${bg.video === v.src ? ' is-active' : ''}`} onClick={() => p.background({ video: v.src })}>
                  {v.label}
                </button>
              ))}
            </div>
            <Row label="Velocidad">
              <Slider value={bg.playbackRate} min={0.25} max={2} step={0.25} precision={2} unit="×" onChange={(v) => p.background({ playbackRate: v }, 'rate')} />
            </Row>
            <Row label="Ken Burns">
              <Switch checked={bg.kenBurns} onChange={(v) => p.background({ kenBurns: v })} />
            </Row>
          </>
        )}

        {bg.type === 'effect' && (
          <>
            <div className="fx-grid">
              {BG_EFFECTS.map((fx) => (
                <EffectTile key={fx} effect={fx} slide={slide} theme={theme} active={bg.effect === fx} onPick={() => p.background({ effect: fx })} />
              ))}
            </div>
            <Row label="Velocidad">
              <Slider value={bg.effectSpeed} min={0.2} max={4} step={0.1} precision={1} unit="×" onChange={(v) => p.background({ effectSpeed: v }, 'speed')} />
            </Row>
            {[0, 1, 2].map((i) => (
              <Row key={i} label={`Color ${i + 1}`}>
                <ColorInput
                  value={bg.effectColors[i] ?? ''}
                  allowEmpty
                  emptyLabel="Del tema"
                  onChange={(v) => {
                    const next = [...bg.effectColors];
                    while (next.length <= i) next.push('');
                    next[i] = v;
                    p.background({ effectColors: next });
                  }}
                />
              </Row>
            ))}
          </>
        )}
      </Section>

      {bg.type !== 'color' && (
        <Section title="Ajustes del fondo" id="sl-bgfx">
          <Row label="Desenfoque">
            <Slider value={bg.blur} min={0} max={60} unit="px" onChange={(v) => p.background({ blur: v }, 'blur')} />
          </Row>
          <Row label="Brillo">
            <Slider value={bg.brightness} min={0} max={200} unit="%" onChange={(v) => p.background({ brightness: v }, 'bright')} />
          </Row>
          <Row label="Saturación">
            <Slider value={bg.saturate} min={0} max={300} unit="%" onChange={(v) => p.background({ saturate: v }, 'sat')} />
          </Row>
          <Row label="Tono">
            <Slider value={bg.hueRotate} min={-180} max={180} unit="°" onChange={(v) => p.background({ hueRotate: v }, 'hue')} />
          </Row>
        </Section>
      )}

      <Section title="Atmósfera" id="sl-atmo">
        <Row label="Superposición">
          <ColorInput value={bg.overlay} gradients onChange={(v) => p.background({ overlay: v })} />
        </Row>
        <Row label="Opacidad">
          <Slider value={Math.round(bg.overlayOpacity * 100)} unit="%" onChange={(v) => p.background({ overlayOpacity: v / 100 }, 'ovop')} />
        </Row>
        <Row label="Grano">
          <Slider value={Math.round(bg.grain * 100)} unit="%" onChange={(v) => p.background({ grain: v / 100 }, 'grain')} />
        </Row>
        <Row label="Viñeta">
          <Slider value={Math.round(bg.vignette * 100)} unit="%" onChange={(v) => p.background({ vignette: v / 100 }, 'vig')} />
        </Row>
      </Section>

      <Section title="Transición de entrada" id="sl-trans">
        <div className="chips">
          {TRANSITIONS.map((t) => (
            <button
              key={t}
              className={`chip${tr.type === t ? ' is-active' : ''}`}
              onClick={() => {
                sfx('tick');
                p.transition({ type: t });
              }}
            >
              {TRANSITION_LABELS[t]}
            </button>
          ))}
        </div>
        <Row label="Duración">
          <Slider value={tr.duration} min={100} max={3000} step={50} unit="ms" onChange={(v) => p.transition({ duration: v }, 'dur')} />
        </Row>
        <Row label="Sonido">
          <div className="inline-controls">
            <Select value={tr.sound} onChange={(v) => { p.transition({ sound: v }); previewSound(v); }} options={SOUNDS.map((s) => ({ value: s, label: SOUND_LABELS[s] }))} />
            <IconButton icon={Volume2} label="Escuchar" anim="pop" sound={false} onClick={() => previewSound(tr.sound)} />
          </div>
        </Row>
        <button
          className="btn ghost small"
          onClick={() => {
            const st = useEditor.getState();
            const idx = st.doc.slides.findIndex((s) => s.id === slide.id);
            st.set({ presenting: { start: Math.max(0, idx - 1) } });
          }}
        >
          <Play size={13} /> Ver transición en presentación
        </button>
      </Section>

      <Section title="Cámara cinematográfica" id="sl-camera">
        <div className="chips">
          {CAMERAS.map((c) => (
            <button
              key={c}
              className={`chip${slide.camera === c ? ' is-active' : ''}`}
              onClick={() => {
                sfx('tick');
                p.update({ camera: c });
                if (c !== 'none') previewCamera();
              }}
            >
              {CAMERA_LABELS[c]}
            </button>
          ))}
        </div>
        {slide.camera !== 'none' && (
          <>
            <Row label="Duración">
              <Slider value={Math.round(slide.cameraDuration / 1000)} min={2} max={60} unit="s" onChange={(v) => p.update({ cameraDuration: v * 1000 }, 'camdur')} />
            </Row>
            <button className="btn ghost small" onClick={previewCamera}>
              <Play size={13} /> Ver movimiento
            </button>
          </>
        )}
        <p className="hint">Un movimiento lento de toda la escena mientras la diapositiva está en pantalla, como en un documental.</p>
      </Section>

      <Section title="Narración" id="sl-narration" defaultOpen={false}>
        <AudioField value={slide.narration.src} record onChange={(v) => p.update({ narration: { src: v } })} />
        {slide.narration.src && (
          <>
            <Row label="Volumen">
              <Slider value={Math.round(slide.narration.volume * 100)} unit="%" onChange={(v) => p.update({ narration: { volume: v / 100 } }, 'narvol')} />
            </Row>
            <Row label="Avanzar al terminar">
              <Switch checked={slide.narration.advance} onChange={(v) => p.update({ narration: { advance: v } })} />
            </Row>
          </>
        )}
        <p className="hint">Se reproduce al entrar en la diapositiva (la música baja de volumen mientras tanto). Ideal para presentaciones autónomas y video.</p>
      </Section>

      <Section title="Diapositiva maestra" id="sl-master" defaultOpen={false}>
        {(useEditor.getState().doc.master?.elements.length ?? 0) > 0 ? (
          <Row label="Ocultar maestra">
            <Switch checked={slide.hideMaster} onChange={(v) => p.update({ hideMaster: v })} />
          </Row>
        ) : (
          <p className="hint" style={{ marginTop: 0 }}>
            Añade logo, pie o numeración ({'{n}'} / {'{total}'}) que aparecen en todas las diapositivas.
          </p>
        )}
        <button className="btn soft" onClick={() => useEditor.getState().selectSlide('master')}>
          Editar la maestra
        </button>
      </Section>

      <Section title="Notas del orador" id="sl-notes">
        <TextArea value={slide.notes} rows={5} placeholder="Lo que quieres decir en esta diapositiva…" onCommit={(v) => p.update({ notes: v })} />
        <p className="hint">Pulsa N durante la presentación para verlas.</p>
      </Section>
    </div>
  );
}
