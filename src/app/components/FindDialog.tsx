import { Replace, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { findAll, makeRegex, replaceAllCommands } from '../../core/findReplace';
import { sfx } from '../lib/sound';
import { useEditor } from '../store/editor';
import { Switch } from './ui/fields';
import { Dialog } from './ui/Popover';

export function FindDialog() {
  const open = useEditor((s) => s.findOpen);
  const doc = useEditor((s) => s.doc);
  const [find, setFind] = useState('');
  const [repl, setRepl] = useState('');
  const [caseSensitive, setCase] = useState(false);
  const [wholeWord, setWhole] = useState(false);
  const re = useMemo(() => makeRegex(find, { caseSensitive, wholeWord }), [find, caseSensitive, wholeWord]);
  const matches = useMemo(() => (re ? findAll(doc, re) : []), [doc, re]);
  const total = matches.reduce((n, m) => n + m.count, 0);
  const close = () => useEditor.setState({ findOpen: false });

  const replaceAll = () => {
    if (!re) return;
    const cmds = replaceAllCommands(doc, re, repl);
    if (!cmds.length) return;
    useEditor.getState().dispatch(cmds);
    sfx('success');
    useEditor.getState().toast(`${total} coincidencia${total === 1 ? '' : 's'} reemplazada${total === 1 ? '' : 's'} (⌘Z para deshacer)`, 'success');
  };

  return (
    <Dialog open={open} onClose={close} title="Buscar y reemplazar" icon={<Search size={18} />} width={620}>
      <div className="find">
        <label className="search-box">
          <Search size={14} />
          <input autoFocus placeholder="Buscar en toda la presentación…" value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          {find && <span className="find-count">{total}</span>}
        </label>
        <label className="search-box">
          <Replace size={14} />
          <input
            placeholder="Reemplazar por…"
            value={repl}
            onChange={(e) => setRepl(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') replaceAll();
            }}
          />
        </label>
        <div className="find-opts">
          <Switch checked={caseSensitive} onChange={setCase} label="Mayúsculas/minúsculas" />
          <Switch checked={wholeWord} onChange={setWhole} label="Palabra completa" />
          <span className="grow" />
          <button className="btn primary" disabled={!total} onClick={replaceAll}>
            Reemplazar todo
          </button>
        </div>
        <div className="find-results">
          {matches.map((m, i) => (
            <button
              key={i}
              className="find-row"
              onClick={() => {
                const st = useEditor.getState();
                st.selectSlide(m.slideId);
                if (m.elementId) setTimeout(() => useEditor.getState().select([m.elementId!]), 0);
                else st.set({ panel: 'slide' });
                sfx('tick');
              }}
            >
              <span className="find-slide">{m.slideIndex + 1}</span>
              <span className="find-where">{m.where}</span>
              <span className="find-snippet">{m.snippet}</span>
              {m.count > 1 && <span className="find-n">×{m.count}</span>}
            </button>
          ))}
          {find && !matches.length && <p className="muted">Sin coincidencias.</p>}
        </div>
      </div>
    </Dialog>
  );
}
