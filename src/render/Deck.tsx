import type { Presentation } from '../core/model';
import { SlideRenderer, type RenderMode } from './SlideRenderer';
import { slideContext } from './textfx';

/** Marcado del reproductor: lo usan el modo presentación y la exportación HTML. */
export function Deck({ doc, mode }: { doc: Presentation; mode: Extract<RenderMode, 'play' | 'export'> }) {
  return (
    <div className="lm-deck" tabIndex={-1}>
      <div className="lm-stage" style={{ width: doc.width, height: doc.height }}>
        {doc.slides.map((slide, i) => (
          <section
            key={slide.id}
            className="lm-frame"
            data-index={i}
            data-transition={slide.transition.type}
            data-tdur={slide.transition.duration}
            data-sound={slide.transition.sound}
            data-duration={slide.duration || undefined}
            data-hidden={slide.hidden ? 'true' : undefined}
            data-notes={slide.notes || undefined}
            data-narration={slide.narration.src || undefined}
            data-narration-advance={slide.narration.src && slide.narration.advance ? 'true' : undefined}
            data-narration-volume={slide.narration.src && slide.narration.volume !== 1 ? slide.narration.volume : undefined}
            aria-label={slide.name || `Diapositiva ${i + 1}`}
          >
            <SlideRenderer
              slide={slide}
              theme={doc.theme}
              width={doc.width}
              height={doc.height}
              mode={mode}
              master={doc.master}
              context={slideContext(doc, slide.id)}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
