import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { FONTS, THEMES } from '../../../core/themes';
import { sfx } from '../../lib/sound';
import { useEditor } from '../../store/editor';
import { ColorInput, Row, Section, Segmented, Select, Slider, Switch } from '../ui/fields';

const COLOR_LABELS: Record<string, string> = {
  background: 'Fondo',
  surface: 'Superficie',
  text: 'Texto',
  muted: 'Secundario',
  primary: 'Primario',
  accent: 'Acento',
};

export function ThemeInspector() {
  const theme = useEditor((s) => s.doc.theme);
  const settings = useEditor((s) => s.doc.settings);
  const dispatch = useEditor((s) => s.dispatch);
  const setTheme = (patch: Record<string, unknown>, field?: string) =>
    dispatch([{ op: 'theme.set', patch }], { merge: `theme:${field ?? Object.keys(patch).join(',')}` });
  const setSettings = (s: Record<string, unknown>) => dispatch([{ op: 'presentation.update', patch: { settings: s } }]);

  return (
    <div className="inspector-scroll">
      <Section title="Temas" id="th-gallery">
        <div className="theme-grid">
          {THEMES.map((t) => (
            <motion.button
              key={t.id}
              className={`theme-card${theme.id === t.id ? ' is-active' : ''}`}
              style={{ background: t.colors.background, color: t.colors.text }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                sfx('chime');
                dispatch([{ op: 'theme.set', preset: t.id }]);
              }}
            >
              <span className="theme-glow" style={{ background: `radial-gradient(circle at 80% 0%, ${t.colors.primary}88, transparent 60%)` }} />
              <span className="theme-title" style={{ fontFamily: t.fonts.heading }}>
                Aa
              </span>
              <span className="theme-dots">
                {[t.colors.primary, t.colors.accent, t.colors.muted].map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </span>
              <span className="theme-name">{t.name}</span>
              {theme.id === t.id && (
                <span className="theme-check">
                  <Check size={12} />
                </span>
              )}
            </motion.button>
          ))}
        </div>
      </Section>

      <Section title="Tipografía" id="th-fonts">
        <Row label="Títulos">
          <Select value={theme.fonts.heading} onChange={(v) => setTheme({ fonts: { heading: v } })} options={FONTS.map((f) => ({ value: f, label: f }))} />
        </Row>
        <Row label="Cuerpo">
          <Select value={theme.fonts.body} onChange={(v) => setTheme({ fonts: { body: v } })} options={FONTS.map((f) => ({ value: f, label: f }))} />
        </Row>
      </Section>

      <Section title="Paleta" id="th-colors">
        {Object.entries(theme.colors).map(([k, v]) => (
          <Row key={k} label={COLOR_LABELS[k] ?? k}>
            <ColorInput value={v} onChange={(c) => setTheme({ colors: { [k]: c }, id: 'custom', name: 'Personalizado' }, `color.${k}`)} />
          </Row>
        ))}
        <Row label="Radio">
          <Slider value={theme.radius} min={0} max={80} unit="px" onChange={(v) => setTheme({ radius: v }, 'radius')} />
        </Row>
        <p className="hint">Los elementos con color «del tema» se actualizan automáticamente.</p>
      </Section>

      <Section title="Reproducción" id="th-play">
        <Row label="Progreso">
          <Segmented
            layoutId="progress"
            value={settings.progress}
            onChange={(v) => setSettings({ progress: v })}
            options={[
              { value: 'bar', label: 'Barra' },
              { value: 'dots', label: 'Puntos' },
              { value: 'none', label: 'Nada' },
            ]}
          />
        </Row>
        <Row label="Avance auto.">
          <Slider value={settings.autoAdvance} min={0} max={60} unit="s" onChange={(v) => setSettings({ autoAdvance: v })} />
        </Row>
        <Row label="Bucle">
          <Switch checked={settings.loop} onChange={(v) => setSettings({ loop: v })} />
        </Row>
        <Row label="Sonidos">
          <Switch checked={settings.sounds} onChange={(v) => setSettings({ sounds: v })} />
        </Row>
        <Row label="Controles">
          <Switch checked={settings.controls} onChange={(v) => setSettings({ controls: v })} />
        </Row>
        <Row label="Números">
          <Switch checked={settings.slideNumbers} onChange={(v) => setSettings({ slideNumbers: v })} />
        </Row>
      </Section>
    </div>
  );
}
