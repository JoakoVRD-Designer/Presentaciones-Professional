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

import { merge3 } from '../src/core/merge';

describe('fusión a tres bandas', () => {
  const base = createFromTemplate('blank');
  const sid = base.slides[0].id;
  const eid = base.slides[0].elements[0].id;

  it('conserva un cambio local y una diapositiva añadida remotamente', () => {
    const local = applyCommands(base, [{ op: 'element.update', element: eid, patch: { x: 999 } }]).doc;
    const remote = applyCommands(base, [{ op: 'slide.add', layout: 'quote', id: 'remota' }]).doc;
    const merged = merge3(base, local, remote);
    expect(merged.slides.map((s) => s.id)).toEqual([sid, 'remota']);
    expect(merged.slides[0].elements.find((e) => e.id === eid)!.x).toBe(999);
  });

  it('combina cambios en campos distintos del mismo elemento y respeta borrados', () => {
    const local = applyCommands(base, [
      { op: 'element.update', element: eid, patch: { y: 5 } },
      { op: 'slide.add', layout: 'blank', id: 'local' },
    ]).doc;
    const remote = applyCommands(base, [
      { op: 'element.style', element: eid, style: { blur: 7 } },
      { op: 'element.add', slide: 0, element: { type: 'icon', id: 'ic' } },
    ]).doc;
    const merged = merge3(base, local, remote);
    const el = merged.slides[0].elements.find((e) => e.id === eid)!;
    expect(el.y).toBe(5);
    expect(el.style.blur).toBe(7);
    expect(merged.slides[0].elements.some((e) => e.id === 'ic')).toBe(true);
    expect(merged.slides.map((s) => s.id)).toEqual([sid, 'local']);
    const removed = applyCommands(base, [{ op: 'element.delete', element: eid }]).doc;
    expect(merge3(base, removed, remote).slides[0].elements.some((e) => e.id === eid)).toBe(false);
  });
});

describe('gráficos y capas', () => {
  it('crea gráficos con valores por defecto y la plantilla chart', () => {
    const { doc, results } = applyCommands(blank(), [
      { op: 'slide.add', layout: 'chart', content: { title: 'Ventas', chart: { kind: 'donut', labels: ['A', 'B'], series: [{ name: 'x', values: [1, 2] }] } } },
      { op: 'element.add', slide: 0, element: { type: 'chart', id: 'c1' } },
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    const charts = doc.slides[0].elements.filter((e) => e.type === 'chart');
    expect(charts).toHaveLength(2);
    const c1 = charts.find((c) => c.id === 'c1')!;
    expect(c1.type === 'chart' && c1.series[0].values.length).toBe(4);
  });

  it('element.order coloca una capa en una posición exacta', () => {
    const { doc } = applyCommands(blank(), [
      { op: 'slide.add' },
      { op: 'element.add', slide: 0, element: { type: 'shape', id: 'a' } },
      { op: 'element.add', slide: 0, element: { type: 'shape', id: 'b' } },
      { op: 'element.add', slide: 0, element: { type: 'shape', id: 'c' } },
      { op: 'element.order', element: 'c', index: 0 },
      { op: 'element.order', element: 'a', index: 99 },
    ]);
    expect(doc.slides[0].elements.map((e) => e.id)).toEqual(['c', 'b', 'a']);
  });
});
