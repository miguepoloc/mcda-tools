import type { ReactNode } from 'react';
import type { CalcMode } from './CalcKit';

/** Tabla de cifras Y texto (la CalcMatrix de CalcKit alinea todo a la derecha, pensado para números). Cada celda es un nodo o
 * `{ t, n, hl }`: `n` = alinear como cifra (derecha, monoespaciada); `hl` = 'good' | 'bad' | 'key' (siempre con negrita + `title`, nunca solo color).
 * Mismas clases `.calc-*` y, en el informe, `.rpt-table` (bordes y saltos de página del informe). */
export type TextCell = ReactNode | { t: ReactNode; n?: boolean; hl?: 'good' | 'bad' | 'key'; title?: string };
export type TextRow = { head: ReactNode; hint?: string; cells: TextCell[] };

const isSpec = (c: TextCell): c is { t: ReactNode; n?: boolean; hl?: 'good' | 'bad' | 'key'; title?: string } =>
  typeof c === 'object' && c !== null && !Array.isArray(c) && 't' in (c as object) && !('$$typeof' in (c as object));

const HL_TITLE = { good: 'Destacado: mejor valor', bad: 'Destacado: cambia el resultado', key: 'Destacado' } as const;

export default function TextTable({ mode, caption, corner, cols, colHint, rows, wide }: {
  mode: CalcMode; caption: string; corner?: string; cols: string[]; colHint?: (string | undefined)[]; rows: TextRow[]; wide?: boolean;
}) {
  return (
    <div className={'tbl calc-tbl' + (wide ? ' calc-wide' : '')} role="region" aria-label={caption} tabIndex={0}>
      <table className={'calc-table' + (mode === 'report' ? ' rpt-table rpt-keep' : '')}>
        <caption className="calc-cap">{caption}</caption>
        <thead>
          <tr>
            <th className="calc-corner" scope="col">{corner ?? ''}</th>
            {cols.map((c, j) => (
              <th key={j} scope="col" className="txt-h">
                {c}
                {colHint?.[j] && <span className="calc-hint">{colHint[j]}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <th scope="row" className="alt">{r.head}{r.hint && <span className="calc-hint">{r.hint}</span>}</th>
              {r.cells.map((c, j) => {
                const s = isSpec(c) ? c : { t: c as ReactNode };
                return (
                  <td key={j} className={(s.n ? 'n' : 'txt') + (s.hl ? ' calc-' + s.hl : '')} title={s.title ?? (s.hl ? HL_TITLE[s.hl] : undefined)}>{s.t}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
