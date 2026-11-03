import { Keyboard } from 'lucide-react';
import { useEditor } from '../store/editor';
import { Dialog } from './ui/Popover';

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'General',
    items: [
      ['⌘K', 'Paleta de comandos'],
      ['⌘J', 'Asistente de IA y API'],
      ['⌘↵', 'Presentar desde la diapositiva actual'],
      ['⌘Z · ⇧⌘Z', 'Deshacer · rehacer'],
      ['⌘E · ⌘P', 'Exportar HTML · exportar PDF'],
      ['⌘O', 'Mis presentaciones'],
      ['⌘F', 'Buscar y reemplazar'],
      ['C', 'Modo comentario (clic en el lienzo para comentar)'],
      ['?', 'Esta ayuda'],
    ],
  },
  {
    title: 'Elementos',
    items: [
      ['Doble clic · ↵', 'Editar texto'],
      ['⌘D', 'Duplicar (sin selección: la diapositiva)'],
      ['⌘C · ⌘X · ⌘V', 'Copiar · cortar · pegar (también imágenes y texto)'],
      ['⌫', 'Eliminar'],
      ['Flechas · ⇧', 'Mover 1 px · 10 px'],
      ['[ · ]', 'Atrás · adelante (con ⌘: al fondo / al frente)'],
      ['⌘A', 'Seleccionar todo'],
      ['⌘G · ⇧⌘G', 'Agrupar · desagrupar (Alt-clic entra al grupo)'],
      ['⇧ clic · arrastrar en vacío', 'Selección múltiple · por marco'],
      ['⇧ al mover', 'Bloquear a un eje'],
      ['Alt al mover', 'Desactivar guías'],
      ['⇧ al rotar', 'Pasos de 15°'],
      ['Arrastrar etiqueta numérica', 'Ajuste fino (⇧ ×10 · Alt ×0.1)'],
    ],
  },
  {
    title: 'Presentación',
    items: [
      ['→ · Espacio · clic', 'Siguiente paso'],
      ['← ', 'Anterior'],
      ['1–9', 'Ir a la diapositiva'],
      ['G', 'Vista general de diapositivas'],
      ['N · M · B · F', 'Notas · sonido · pantalla negra · pantalla completa'],
      ['Esc', 'Salir'],
    ],
  },
];

export function HelpDialog() {
  const open = useEditor((s) => s.helpOpen);
  return (
    <Dialog open={open} onClose={() => useEditor.setState({ helpOpen: false })} title="Atajos de teclado" icon={<Keyboard size={18} />} width={760}>
      <div className="help-grid">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            {g.items.map(([k, d]) => (
              <div key={k} className="help-row">
                <span>{d}</span>
                <kbd>{k}</kbd>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Dialog>
  );
}
