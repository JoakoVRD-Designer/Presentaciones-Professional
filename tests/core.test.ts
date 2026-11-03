import { describe, expect, it } from 'vitest';
import { applyCommands, commandJsonSchema, deepMerge, summarizePresentation } from '../src/core/commands';
import { LAYOUTS } from '../src/core/layouts';
import { makePresentation, normalizePresentation } from '../src/core/model';
import { sanitizeHtml } from '../src/core/sanitize';
import { createFromTemplate, TEMPLATES } from '../src/core/templates';
import { THEMES } from '../src/core/themes';

const blank = () => makePresentation({ title: 'Prueba' });

describe('comandos', () => {
  it('crea diapositivas desde todas las plantillas', () => {
    const { doc, results } = applyCommands(
      blank(),
      LAYOUTS.map((l) => ({ op: 'slide.add', layout: l.id, content: { title: `T ${l.id}` } })),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(doc.slides).toHaveLength(LAYOUTS.length);
    const ids = doc.slides.flatMap((s) => s.elements.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('aplica todos los temas', () => {
    for (const t of THEMES) {
      const { doc, results } = applyCommands(blank(), [{ op: 'theme.set', preset: t.id }]);
      expect(results[0].ok).toBe(true);
      expect(doc.theme.colors.primary).toBe(t.colors.primary);
    }
  });

  it('añade, edita, duplica, ordena y elimina elementos', () => {
    let { doc } = applyCommands(blank(), [{ op: 'slide.add', layout: 'blank', id: 's1' }]);
    const add = applyCommands(doc, [
      { op: 'element.add', slide: 's1', element: { type: 'text', id: 'a', html: 'Hola' } },
      { op: 'element.add', slide: 0, element: { type: 'shape', id: 'b', shape: 'star' } },
    ]);
    expect(add.results.map((r) => r.ok)).toEqual([true, true]);
    doc = add.doc;
    const res = applyCommands(doc, [
      { op: 'element.update', element: 'a', patch: { size: 80, style: { blur: 4 } } },
      { op: 'element.animate', element: 'a', animation: { entrance: 'glitch', step: 2 } },
      { op: 'element.duplicate', element: 'b' },
      { op: 'element.arrange', element: 'a', action: 'front' },
      { op: 'element.align', element: 'b', align: 'center' },
    ]);
    expect(res.results.every((r) => r.ok)).toBe(true);
    const slide = res.doc.slides[0];
    const a = slide.elements.find((e) => e.id === 'a')!;
    expect(a.type === 'text' && a.size).toBe(80);
    expect(a.style.blur).toBe(4);
    expect(a.style.brightness).toBe(100); // la fusión profunda conserva el resto
    expect(a.animation.entrance).toBe('glitch');
    expect(slide.elements.at(-1)!.id).toBe('a');
    expect(slide.elements).toHaveLength(3);
    const b = slide.elements.find((e) => e.id === 'b')!;
    expect(b.x).toBe((1920 - b.w) / 2);
    const del = applyCommands(res.doc, [{ op: 'element.delete', element: 'a' }]);
    expect(del.doc.slides[0].elements.some((e) => e.id === 'a')).toBe(false);
  });

  it('informa errores sin abortar el lote', () => {
    const { results, doc } = applyCommands(blank(), [
      { op: 'nope' },
      { op: 'element.update', element: 'x', patch: {} },
      { op: 'slide.add', layout: 'title' },
      { op: 'element.add', slide: 0, element: { type: 'banana' } },
      { op: 'slide.background', slide: 5, background: {} },
    ]);
    expect(results.map((r) => r.ok)).toEqual([false, false, true, false, false]);
    expect(doc.slides).toHaveLength(1);
  });

  it('no permite cambiar el tipo de un elemento', () => {
    const { doc } = applyCommands(blank(), [
      { op: 'slide.add' },
      { op: 'element.add', slide: 0, element: { type: 'text', id: 't' } },
    ]);
    const { results } = applyCommands(doc, [{ op: 'element.update', element: 't', patch: { type: 'image' } }]);
    expect(results[0].ok).toBe(false);
  });

  it('mueve, duplica y borra diapositivas; índices negativos', () => {
    const { doc } = applyCommands(blank(), [
      { op: 'slide.add', id: 'a' },
      { op: 'slide.add', id: 'b' },
      { op: 'slide.add', id: 'c' },
      { op: 'slide.move', slide: 'c', to: 0 },
      { op: 'slide.duplicate', slide: -1 },
      { op: 'slide.delete', slide: 'a' },
    ]);
    expect(doc.slides.map((s) => s.id).slice(0, 2)).toEqual(['c', 'b']);
    expect(doc.slides).toHaveLength(3);
  });

  it('no muta el documento original y devuelve changed=false si nada cambia', () => {
    const d = blank();
    const snapshot = JSON.stringify(d);
    applyCommands(d, [{ op: 'slide.add', layout: 'title' }]);
    expect(JSON.stringify(d)).toBe(snapshot);
    expect(applyCommands(d, [{ op: 'nope' }]).changed).toBe(false);
  });
});

describe('modelo y utilidades', () => {
  it('las plantillas de presentación son válidas y re-normalizables', () => {
    for (const t of TEMPLATES) {
      const doc = createFromTemplate(t.id);
      expect(doc.slides.length).toBeGreaterThan(0);
      expect(normalizePresentation(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    }
  });

  it('deepMerge reemplaza arrays y mezcla objetos', () => {
    expect(deepMerge({ a: { b: 1, c: 2 }, l: [1, 2] }, { a: { c: 3 }, l: [9] })).toEqual({ a: { b: 1, c: 3 }, l: [9] });
  });

  it('genera el JSON Schema de comandos y un resumen compacto', () => {
    const schema = JSON.stringify(commandJsonSchema());
    expect(schema).toContain('slide.add');
    const doc = createFromTemplate('showcase');
    const summary = summarizePresentation(doc) as { slides: unknown[] };
    expect(summary.slides).toHaveLength(doc.slides.length);
  });

  it('sanitiza HTML peligroso y conserva el formato', () => {
    const out = sanitizeHtml(
      '<b onclick="x()">Hola</b><script>alert(1)</script><img src=x onerror=y><a href="javascript:alert(1)">l</a><span style="color:red;background:url(x)">c</span>',
    );
    expect(out).toBe('<b>Hola</b><a>l</a><span style="color: red">c</span>');
    expect(sanitizeHtml('a < b')).toBe('a &lt; b');
    expect(sanitizeHtml('<font color="#f00">x</font>')).toBe('<span style="color: #f00">x</span>');
  });
});
