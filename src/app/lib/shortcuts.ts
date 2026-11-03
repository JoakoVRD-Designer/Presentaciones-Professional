import { useEffect } from 'react';
import type { Command } from '../../core/commands';
import { slideById, useEditor } from '../store/editor';
import { CLIP_PREFIX, copySelection, duplicateSlide, exportHtml, exportPdf, insertElement, pasteElements, present } from './actions';
import { mediaSize, uploadAsset } from './assets';
import { toggleCommentMode } from './collab';
import { sfx } from './sound';

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useEditor.getState();
      if (st.presenting) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // Atajos globales (también mientras se escribe)
      if (mod && key === 'k') {
        e.preventDefault();
        st.set({ paletteOpen: !st.paletteOpen });
        return;
      }
      if (mod && key === 'j') {
        e.preventDefault();
        st.set({ aiOpen: !st.aiOpen });
        sfx(st.aiOpen ? 'close' : 'open');
        return;
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        present();
        return;
      }
      if (mod && key === 's') {
        e.preventDefault();
        st.toast('Lumen guarda automáticamente ✓', 'success');
        return;
      }
      if (mod && key === 'e') {
        e.preventDefault();
        exportHtml();
        return;
      }
      if (mod && (key === 'f' || key === 'h') && !st.findOpen) {
        e.preventDefault();
        st.set({ findOpen: true });
        return;
      }
      if (mod && key === 'p') {
        e.preventDefault();
        exportPdf();
        return;
      }
      if (mod && key === 'o') {
        e.preventDefault();
        st.set({ docsOpen: true });
        return;
      }
      if (isTyping(e.target) || st.paletteOpen || st.docsOpen || st.helpOpen || st.findOpen || st.historyOpen) return;
      if (e.key === '?') {
        st.set({ helpOpen: true });
        return;
      }

      const slide = slideById(st.doc, st.currentSlideId);
      const sel = slide?.elements.filter((x) => st.selection.includes(x.id)) ?? [];
      const each = (fn: (id: string) => Command) => st.dispatch(sel.map((x) => fn(x.id)));

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        st.redo();
        return;
      }
      if (mod && key === 'g') {
        e.preventDefault();
        if (e.shiftKey) {
          if (sel.some((x) => x.group)) {
            st.dispatch([{ op: 'elements.ungroup', elements: sel.map((x) => x.id) }]);
            sfx('tap');
          }
        } else if (sel.length > 1) {
          st.dispatch([{ op: 'elements.group', elements: sel.map((x) => x.id) }]);
          sfx('pop');
        }
        return;
      }
      if (mod && key === 'a') {
        e.preventDefault();
        st.select(slide?.elements.map((x) => x.id) ?? []);
        return;
      }
      if (mod && key === 'd') {
        e.preventDefault();
        if (sel.length) {
          const res = each((id) => ({ op: 'element.duplicate', element: id }));
          st.select(res.filter((r) => r.id).map((r) => r.id!));
          sfx('pop');
        } else duplicateSlide();
        return;
      }
      if (mod && key === 'c') {
        if (copySelection()) e.preventDefault();
        return;
      }
      if (mod && key === 'x') {
        if (copySelection(true)) e.preventDefault();
        return;
      }
      if (e.shiftKey && e.key === '!') {
        st.set({ zoom: 'fit' });
        return;
      }

      if (e.key === 'Escape') {
        if (st.commentDraft || st.openComment) st.set({ commentDraft: null, openComment: null });
        else if (st.commentMode) toggleCommentMode(false);
        else if (st.aiOpen) st.set({ aiOpen: false });
        else st.select([]);
        return;
      }
      if (!mod && !e.altKey && key === 'c') {
        e.preventDefault();
        toggleCommentMode();
        return;
      }

      if (sel.length) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          each((id) => ({ op: 'element.delete', element: id }));
          sfx('remove');
          return;
        }
        if (e.key === 'Enter' && sel.length === 1 && sel[0].type === 'text') {
          e.preventDefault();
          st.setEditing(sel[0].id);
          return;
        }
        if (e.key.startsWith('Arrow')) {
          e.preventDefault();
          const d = e.shiftKey ? 10 : 1;
          const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
          const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
          st.dispatch(
            sel.filter((x) => !x.locked).map((x) => ({ op: 'element.update', element: x.id, patch: { x: x.x + dx, y: x.y + dy } })),
            { merge: 'nudge' },
          );
          return;
        }
        if (e.key === ']') {
          each((id) => ({ op: 'element.arrange', element: id, action: mod ? 'front' : 'forward' }));
          return;
        }
        if (e.key === '[') {
          each((id) => ({ op: 'element.arrange', element: id, action: mod ? 'back' : 'backward' }));
          return;
        }
      } else {
        // Sin selección: navegar entre diapositivas.
        const idx = st.doc.slides.findIndex((s) => s.id === st.currentSlideId);
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') {
          const next = st.doc.slides[idx + 1];
          if (next) {
            e.preventDefault();
            st.selectSlide(next.id);
            sfx('tick');
          }
          return;
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') {
          const prev = st.doc.slides[idx - 1];
          if (prev) {
            e.preventDefault();
            st.selectSlide(prev.id);
            sfx('tick');
          }
          return;
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && slide && e.shiftKey && slide.id !== 'master') {
          st.dispatch([{ op: 'slide.delete', slide: slide.id }]);
          sfx('remove');
        }
      }
    };

    const onPaste = async (e: ClipboardEvent) => {
      const st = useEditor.getState();
      if (st.presenting || isTyping(e.target)) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => /^(image|video)\//.test(f.type));
      if (files.length) {
        e.preventDefault();
        for (const file of files) {
          try {
            const [src, dims] = await Promise.all([uploadAsset(file), mediaSize(file)]);
            const fit = Math.min(1100 / dims.w, 700 / dims.h, 1);
            insertElement({
              type: file.type.startsWith('video/') ? 'video' : 'image',
              src,
              w: Math.round(dims.w * fit),
              h: Math.round(dims.h * fit),
              style: { radius: 16 },
            });
          } catch (err) {
            st.toast(err instanceof Error ? err.message : 'No se pudo pegar', 'error');
          }
        }
        return;
      }
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (text.startsWith(CLIP_PREFIX) || (!text && st.clipboard.length)) {
        e.preventDefault();
        pasteElements(text);
        return;
      }
      if (text.trim()) {
        e.preventDefault();
        if (/^https?:\/\/\S+\.(png|jpe?g|gif|webp|avif|svg)(\?\S*)?$/i.test(text.trim())) {
          insertElement({ type: 'image', src: text.trim(), w: 800, h: 520, style: { radius: 16 } });
        } else if (/^https?:\/\/\S+\.(mp4|webm)(\?\S*)?$/i.test(text.trim())) {
          insertElement({ type: 'video', src: text.trim(), w: 960, h: 540, style: { radius: 16 } });
        } else {
          const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
          insertElement({ type: 'text', html: esc, size: 36, w: 1000, h: Math.min(700, 60 + text.split('\n').length * 48) });
          useEditor.getState().setEditing(null);
        }
      }
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  }, []);
}
