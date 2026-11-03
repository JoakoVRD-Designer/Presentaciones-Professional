import type { CSSProperties } from 'react';
import type { TableElement } from '../core/model';
import { sanitizeHtml } from '../core/sanitize';

export function TableView({ el }: { el: TableElement }) {
  const cols = Math.max(1, ...el.rows.map((r) => r.length));
  const line = el.lineColor || 'color-mix(in srgb, var(--lm-muted) 22%, transparent)';
  const style = {
    '--tb-line': line,
    '--tb-head': el.headerFill || 'var(--lm-primary)',
    '--tb-head-color': el.headerColor,
    '--tb-stripe': 'color-mix(in srgb, var(--lm-text) 5%, transparent)',
    '--tb-hl': 'color-mix(in srgb, var(--lm-accent) 16%, transparent)',
    fontSize: el.fontSize,
    color: el.textColor || 'var(--lm-text)',
    textAlign: el.align,
  } as CSSProperties;
  return (
    <table className={`lm-table${el.striped ? ' is-striped' : ''}${el.firstColumn ? ' first-col' : ''}`} style={style}>
      <tbody>
        {el.rows.map((row, ri) => {
          const isHead = el.header && ri === 0;
          return (
            <tr key={ri} className={isHead ? 'lm-th-row' : undefined} style={{ '--i': ri } as CSSProperties}>
              {Array.from({ length: cols }, (_, ci) => {
                const Tag = isHead ? 'th' : 'td';
                return (
                  <Tag
                    key={ci}
                    className={ci === el.highlightColumn ? 'is-hl' : undefined}
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(row[ci] ?? '') }}
                  />
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
