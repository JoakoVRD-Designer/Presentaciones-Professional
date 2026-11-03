# Lumen frente a las herramientas de presentaciones actuales

Comparativa de funciones clave (noviembre de 2026). Leyenda: ✅ completo · ◐ parcial o de pago · ❌ no disponible.
Las columnas de terceros reflejan sus capacidades públicas conocidas; pueden variar según plan y versión.

| Capacidad | PowerPoint | Keynote | Google Slides | Canva | Pitch | Gamma | Figma Slides | reveal.js / Slidev | **Lumen** |
|---|---|---|---|---|---|---|---|---|---|
| Editor visual (arrastrar, redimensionar, rotar, guías) | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ✅ | ❌ | ✅ |
| Agrupar, alinear, distribuir, capas | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ✅ | ❌ | ✅ |
| Tablas | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ✅ |
| Gráficos de datos | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ◐ | ◐ | ✅ animados |
| Transición Morph / Magic Move | ✅ | ✅ | ❌ | ❌ | ◐ | ❌ | ✅ | ◐ | ✅ |
| Animaciones de entrada y por clic | ✅ | ✅ | ◐ | ◐ | ✅ | ◐ | ◐ | ✅ | ✅ 22 + 12 bucles |
| Fondos de video | ✅ | ✅ | ❌ | ✅ | ✅ | ◐ | ◐ | ✅ | ✅ con desenfoque, grano y viñeta |
| Fondos generativos animados (aurora, malla, estrellas…) | ❌ | ❌ | ❌ | ◐ | ❌ | ◐ | ❌ | ◐ | ✅ 9 efectos |
| Vidrio / desenfoque de fondo, modos de fusión, máscaras | ◐ | ◐ | ❌ | ◐ | ◐ | ❌ | ✅ | ◐ (CSS) | ✅ |
| Sonidos de transición | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ sintetizados |
| Notas, vista del orador, cronómetro | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ✅ | ✅ | ✅ |
| Vista general al presentar | ✅ | ✅ | ◐ | ◐ | ◐ | ❌ | ◐ | ✅ | ✅ |
| Buscar y reemplazar | ✅ | ✅ | ✅ | ◐ | ◐ | ◐ | ◐ | — | ✅ |
| Historial de versiones | ✅ | ◐ | ✅ | ✅ | ✅ | ✅ | ✅ | git | ✅ |
| Enlace para compartir con actualización en vivo | ✅ | ◐ | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ✅ |
| Edición simultánea desde varias fuentes | ✅ | ◐ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ◐ fusión automática, sin cursores |
| Generar o editar presentaciones con IA | ◐ de pago | ❌ | ◐ de pago | ✅ | ✅ | ✅ | ◐ | ❌ | ✅ con tu clave de Claude |
| **API abierta para que agentes de IA editen en vivo** (REST + MCP + navegador) | ◐ add-ins | ❌ | ◐ API REST | ◐ | ❌ | ◐ | ◐ | ◐ (archivos) | ✅ |
| Exportar PowerPoint (.pptx) editable | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ✅ con tablas y gráficos nativos |
| Exportar PDF | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Exportar HTML autónomo (un archivo, sin internet) | ❌ | ◐ | ❌ | ◐ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Autoalojado, código abierto, sin cuentas | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

## Dónde Lumen ya es superior

1. **IA de primera clase**: cualquier agente (Claude Desktop/Code vía MCP, scripts vía REST, extensiones vía `window.lumen`) manipula la presentación con el mismo motor de comandos que el editor, y los cambios aparecen en vivo y se pueden deshacer.
2. **Movimiento y atmósfera**: Morph, 22 entradas, 12 bucles, 13 transiciones (incluido cubo 3D), fondos generativos y de video con tratamiento cinematográfico y sonidos, todo sin plugins.
3. **Portabilidad**: un único HTML que se abre en cualquier navegador, además de PPTX editable, PDF y JSON.
4. **Propiedad de los datos**: autoalojado y sin cuentas, con los documentos como JSON legible.

## Brechas que aún quedan (próximos pasos)

| Brecha | Referente |
|---|---|
| Comentarios y cursores de colaboración en tiempo real | Google Slides, Figma, Pitch |
| Importar archivos .pptx | PowerPoint, Google Slides, Keynote |
| Biblioteca masiva de plantillas, fotos e ilustraciones | Canva |
| Diapositivas maestras / temas con diseños maestros | PowerPoint, Keynote |
| Grabar la presentación con voz y cámara | PowerPoint, Pitch |
| Bloques de código resaltado y fórmulas matemáticas | Slidev, reveal.js |
| Diseños inteligentes que se reacomodan solos | Beautiful.ai, Gamma |
| Comprobador de accesibilidad y contraste | PowerPoint |
| Apps móviles nativas | PowerPoint, Keynote, Google Slides |
