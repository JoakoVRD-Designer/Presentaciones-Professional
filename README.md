# ✦ Lumen Slides

Editor de presentaciones **basado en HTML**, pensado como un “PowerPoint” moderno: fondos en
video, desenfoques, vidrio, máscaras, más de 20 animaciones de entrada, bucles, 13 transiciones
(incluidas 3D) y sonidos. **Todo se puede editar a mano** y, además, incluye una **API interna de
comandos** para que una inteligencia artificial construya o modifique presentaciones en vivo.

```bash
npm install
npm run dev          # API en :4317 + editor en http://localhost:5173
```

Con asistente de IA integrado (Claude):

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run dev
```

Producción: `npm run build && npm start` (el servidor sirve la app compilada en `:4317`).

---

## Funciones

**Editor visual**
- Lienzo 1920×1080 con arrastrar, redimensionar (mantiene proporción en imágenes; ⇧ invierte),
  rotar (⇧ = pasos de 15°), selección múltiple y por marco, **guías inteligentes** de alineación,
  menú contextual, copiar/pegar entre pestañas, soltar o pegar imágenes y videos.
- Elementos: texto enriquecido (doble clic para editar), imagen, video, 12 formas, 2000+ iconos
  Lucide e incrustaciones web (YouTube/Vimeo se convierten solas).
- Estilo por elemento: relleno sólido o degradado, bordes, radio, sombras, **resplandor**,
  **vidrio (backdrop blur)**, desenfoque, brillo, contraste, saturación, tono, sepia, inversión,
  modos de fusión, máscaras de desvanecido, texto con degradado y contorno.
- Fondos: color, degradado, imagen (Ken Burns), **video** y 9 **efectos generativos animados**
  (aurora, malla, rejilla, puntos, estrellas, foco, haces, olas, ruido), con desenfoque,
  superposición, grano de película y viñeta.
- Animaciones: 22 entradas, 12 bucles, curvas (expo, resorte, rebote…), retrasos, **builds por
  clic**, escalonado automático y vista previa.
- 13 transiciones (fundido, deslizar, empujar, zoom, desenfoque, voltear, **cubo 3D**, barrido,
  círculo, disolver…) con sonido.
- 8 temas, tipografías de Google Fonts, colores ligados al tema (`var(--lm-primary)`), 13
  plantillas de diapositiva y 3 plantillas de presentación.
- Historial (⌘Z / ⇧⌘Z), guardado automático, paleta de comandos (⌘K). Si una IA modifica la
  presentación mientras editas, los cambios se **fusionan** por id sin perder tus ediciones.
- **Sonidos de interfaz** sintetizados con Web Audio (sin archivos) e **iconos animados** con
  Framer Motion; ambos se pueden desactivar.

**Presentación y exportación**
- Modo presentación a pantalla completa: teclado, clic, gestos táctiles, notas del orador (N),
  pantalla negra (B), sonido (M), barra o puntos de progreso, avance automático y bucle.
- **Vista del orador** en una segunda ventana: diapositiva actual y siguiente, notas ampliables,
  cronómetro y control remoto, sincronizada en vivo con la presentación.
- Exporta un **único archivo HTML autónomo** (los recursos locales se incrustan) que funciona en
  cualquier navegador, y JSON. También importa ambos formatos.

## Atajos

| Atajo | Acción |
|---|---|
| ⌘K | Paleta de comandos |
| ⌘J | Asistente de IA / API |
| ⌘↵ | Presentar desde la diapositiva actual |
| ⌘Z · ⇧⌘Z | Deshacer · rehacer |
| ⌘D · ⌘C · ⌘X · ⌘V | Duplicar · copiar · cortar · pegar |
| ⌫ | Eliminar selección (⇧⌫ sin selección elimina la diapositiva) |
| Flechas | Mover 1 px (⇧ = 10 px) · sin selección, cambia de diapositiva |
| [ · ] | Enviar atrás · traer adelante (con ⌘: al fondo / al frente) |
| ↵ | Editar el texto seleccionado |
| ⌘E · ⌘O | Exportar HTML · mis presentaciones |

---

## API para inteligencias artificiales

Todo cambio —desde el ratón, la API REST, el servidor MCP o el asistente— pasa por el mismo
**motor de comandos JSON** (`src/core/commands.ts`). Lo que puede hacer una persona, lo puede
hacer una IA. Los cambios externos se emiten por SSE y aparecen **en vivo** en el editor (y se
pueden deshacer con ⌘Z).

### Comandos

```jsonc
[
  { "op": "theme.set", "preset": "ocean" },
  { "op": "slide.add", "layout": "title",
    "content": { "title": "Energía solar", "subtitle": "El futuro ya llegó" } },
  { "op": "slide.add", "layout": "stats",
    "content": { "title": "En cifras", "stats": [{ "value": "40%", "label": "Más barata" }] } },
  { "op": "slide.background", "slide": -1,
    "background": { "type": "video", "video": "https://…/clip.mp4", "blur": 8, "overlayOpacity": 0.6 } },
  { "op": "element.add", "slide": 0,
    "element": { "type": "icon", "icon": "Sun", "x": 880, "y": 120, "w": 160, "h": 160,
                 "animation": { "entrance": "zoom-in", "loop": "spin" } } }
]
```

Operaciones: `presentation.update`, `theme.set`, `slide.add` / `update` / `delete` /
`duplicate` / `move` / `background` / `transition`, `slides.clear`, `element.add` / `update` /
`style` / `animate` / `delete` / `duplicate` / `arrange` / `align` / `move`, `document.replace`.
Cada comando devuelve `{ ok, op, id, error }`; si uno falla, el resto continúa.

Plantillas de diapositiva (`layout`): `title`, `section`, `bullets`, `two-column`, `image-left`,
`image-right`, `quote`, `stats`, `features`, `timeline`, `video-hero`, `big-number`, `closing`,
`blank`.

### REST (`npm run dev`, puerto 4317)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api` | Índice de endpoints |
| GET | `/api/guide` | Guía en Markdown para IAs |
| GET | `/api/schema` | JSON Schema de comandos y del modelo |
| GET/POST | `/api/presentations` | Listar / crear `{ template?, title?, document? }` |
| GET/PUT/DELETE | `/api/presentations/:id` | Leer (`?summary=1`), reemplazar, eliminar |
| POST | `/api/presentations/:id/commands` | Aplicar `{ commands: [...] }` |
| GET | `/api/presentations/:id/events` | Stream SSE de cambios |
| POST | `/api/assets` | Subir imagen/video (cuerpo binario) → `/media/…` |
| POST | `/api/ai/chat` | Asistente IA (stream SSE) |

```bash
curl -X POST localhost:4317/api/presentations/<id>/commands \
  -H 'Content-Type: application/json' \
  -d '{"commands":[{"op":"slide.add","layout":"quote","content":{"quote":"Hola","author":"API"}}]}'
```

Define `LUMEN_API_TOKEN` para exigir `Authorization: Bearer <token>` en las escrituras. El
servidor escucha en `127.0.0.1` por defecto (`HOST` para cambiarlo).

### MCP (Claude Desktop, Claude Code, etc.)

```json
{
  "mcpServers": {
    "lumen": {
      "command": "npx",
      "args": ["tsx", "/ruta/a/Presentaciones-Professional/server/mcp.ts"],
      "env": { "LUMEN_URL": "http://localhost:4317" }
    }
  }
}
```

Herramientas: `lumen_guide`, `list_presentations`, `create_presentation`, `get_presentation`,
`apply_commands`, `add_slide`, `delete_presentation`.

### En el navegador

```js
window.lumen.apply([{ op: 'slide.add', layout: 'closing', content: { title: '¡Gracias!' } }]);
window.lumen.getSummary();   // resumen compacto con ids
window.lumen.schema();       // JSON Schema de comandos
// Desde un iframe anfitrión:
frame.contentWindow.postMessage({ type: 'lumen:command', id: 1, commands: [...] }, '*');
```

La pestaña **IA → API** del editor incluye una consola para pegar comandos generados por
cualquier IA y un botón que copia la guía + esquema para usarlo como prompt.

### Asistente integrado

Con `ANTHROPIC_API_KEY`, el panel de IA usa **Claude** (`claude-opus-5-5` por defecto,
configurable con `LUMEN_AI_MODEL` y `LUMEN_AI_EFFORT`) con *tool use*: el modelo llama a
`apply_commands` y ves cómo se construye la presentación en tiempo real. Usa *streaming*,
pensamiento adaptativo y el *fallback* de servidor del API de Anthropic ante rechazos.

---

## Arquitectura

```
src/core/       Modelo (zod), comandos, plantillas, temas, sanitizador — compartido navegador/Node
src/render/     SlideRenderer (React) + exportador HTML autónomo
src/runtime/    slide.css, player.css y player.js (reproductor + sintetizador de sonido sin dependencias,
                usado tanto en la app como dentro del HTML exportado)
src/app/        Editor (React, Zustand, Framer Motion, cmdk, Lucide)
server/         API REST + SSE + subida de archivos + asistente IA (Express) y servidor MCP
tests/          Pruebas del núcleo (Vitest)
```

Los esquemas zod son la única fuente de verdad: generan los tipos, los valores por defecto (un
elemento parcial se completa al validarlo) y el JSON Schema que reciben las IAs.

Sin servidor, el editor funciona igual guardando en `localStorage` (el asistente y la API REST
requieren `npm run dev`).

**Librerías de apoyo:** [Framer Motion](https://motion.dev) (animación de interfaz),
[Lucide](https://lucide.dev) (iconos), [cmdk](https://cmdk.paco.me) (paleta de comandos),
[Zustand](https://zustand.docs.pmnd.rs) + [Immer](https://immerjs.github.io) (estado),
[Zod](https://zod.dev) (validación), [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript)
y [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## Scripts

| Script | |
|---|---|
| `npm run dev` | Servidor API + editor con recarga en caliente |
| `npm run build` | Comprobación de tipos + compilación de producción |
| `npm start` | Servidor de producción (sirve `dist/`) |
| `npm run mcp` | Servidor MCP por stdio |
| `npm test` | Pruebas |
