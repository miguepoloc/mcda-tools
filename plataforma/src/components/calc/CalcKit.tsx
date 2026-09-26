import type { ReactNode } from 'react';

/** Piezas comunes del «desglose de cálculo» (paso a paso, como en las diapositivas del curso). Se usan igual en Resultados
 * (`mode="screen"`: cada paso es un <details> que se abre a demanda) y en el Informe ejecutivo (`mode="report"`: todo abierto, porque
 * un <details> cerrado no se imprime). Solo usan variables CSS (--ink, --line, --surface2…), que el informe ya redefine en su hoja
 * clara, y las clases `.calc-*` de globals.css: nada depende del color solo (los resaltes llevan además negrita o marca escrita). */

export type CalcMode = 'screen' | 'report';

/** Número a texto con `d` decimales; «—» si no es finito (evita «NaN» o «Infinity» en pantalla y papel). */
export function num(x: number | null | undefined, d = 4): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return x.toFixed(d);
}

/** Contenedor de un método: título, una línea de contexto y la lista de pasos. `accent` = color de familia (p. ej. 'var(--m-topsis)'). */
export function CalcSection({ title, intro, accent = 'var(--pa)', mode, children }: { title: string; intro?: ReactNode; accent?: string; mode: CalcMode; children: ReactNode }) {
  return (
    <section className={'calc-sec' + (mode === 'report' ? ' calc-report' : '')} style={{ ['--calc-accent' as string]: accent }}>
      <h3 className="calc-sec-title">{title}</h3>
      {intro && <p className="calc-intro">{intro}</p>}
      <div className="calc-steps">{children}</div>
    </section>
  );
}

/** Un paso numerado. `formula` y `meaning` son opcionales: fórmula general, y «qué significa» en lenguaje llano. Los hijos llevan
 * las tablas/gráficas con los números del proyecto. En `report` siempre abierto; en `screen` abierto solo si `defaultOpen`. */
export function CalcStep({ no, title, mode, formula, meaning, defaultOpen = false, children }: {
  no: number | string; title: string; mode: CalcMode; formula?: ReactNode; meaning?: ReactNode; defaultOpen?: boolean; children?: ReactNode;
}) {
  const body = (
    <div className="calc-body">
      {meaning && <p className="calc-meaning"><b>Qué significa: </b>{meaning}</p>}
      {formula && <div className="calc-formula mono" role="math">{formula}</div>}
      {children}
    </div>
  );
  if (mode === 'report') {
    return (
      <div className="calc-step rpt-keep-soft">
        <h4 className="calc-step-h"><span className="calc-no">{no}</span>{title}</h4>
        {body}
      </div>
    );
  }
  return (
    <details className="calc-step" open={defaultOpen}>
      <summary className="calc-step-h"><span className="calc-no">{no}</span>{title}</summary>
      {body}
    </details>
  );
}

/** «Con tus números»: sustitución numérica de una fórmula con los valores reales del proyecto (lo que las diapositivas hacen a mano). */
export function Worked({ title = 'Con tus números', children }: { title?: string; children: ReactNode }) {
  return (
    <div className="calc-worked">
      <div className="calc-worked-t">{title}</div>
      <div className="mono calc-worked-b">{children}</div>
    </div>
  );
}

/** «Cómo leerlo»: una frase que dice qué mirar en la tabla/gráfica y qué conclusión sacar. */
export function Reading({ title = 'Cómo leerlo', children }: { title?: string; children: ReactNode }) {
  return (
    <p className="calc-reading"><b>{title}: </b>{children}</p>
  );
}

export type CalcCell = number | string | null | undefined;

/** Tabla/matriz con encabezados de fila y columna, filas de pie opcionales (sumas, A+, A−…) y resaltes.
 * - `cells[i][j]`: número (se formatea con `digits`) o texto ya formateado.
 * - `hl(i, j)`: 'good' | 'bad' | 'key' para resaltar (siempre + `title`/negrita, no solo color).
 * - `footer`: filas extra {label, cells, hint}; `colHint`: subtítulo bajo cada encabezado de columna (p. ej. el peso o el tipo). */
export function CalcMatrix({ mode, corner, rows, cols, cells, digits = 4, colHint, footer, hl, rowHint, caption, wide }: {
  mode: CalcMode;
  corner?: string;
  rows: string[];
  cols: string[];
  cells: CalcCell[][];
  digits?: number;
  colHint?: (string | undefined)[];
  rowHint?: (string | undefined)[];
  footer?: { label: string; cells: CalcCell[]; hint?: string }[];
  hl?: (i: number, j: number) => 'good' | 'bad' | 'key' | undefined;
  caption?: string;
  wide?: boolean;
}) {
  const fmtCell = (v: CalcCell) => (typeof v === 'number' ? num(v, digits) : v == null ? '—' : v);
  return (
    <div className={'tbl calc-tbl' + (wide ? ' calc-wide' : '')} role="region" aria-label={caption ?? corner ?? 'Tabla de cálculo'} tabIndex={0}>
      <table className={'calc-table' + (mode === 'report' ? ' rpt-table rpt-keep' : '')}>
        {caption && <caption className="calc-cap">{caption}</caption>}
        <thead>
          <tr>
            <th className="calc-corner">{corner ?? ''}</th>
            {cols.map((c, j) => (
              <th key={j} className="n" scope="col">
                {c}
                {colHint?.[j] && <span className="calc-hint">{colHint[j]}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <th scope="row" className="alt">
                {r}
                {rowHint?.[i] && <span className="calc-hint">{rowHint[i]}</span>}
              </th>
              {cells[i].map((v, j) => {
                const k = hl?.(i, j);
                return <td key={j} className={'n' + (k ? ' calc-' + k : '')} title={k === 'good' ? 'Destacado: mejor valor' : k === 'bad' ? 'Destacado: no cumple' : k === 'key' ? 'Destacado' : undefined}>{fmtCell(v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
        {footer && footer.length > 0 && (
          <tfoot>
            {footer.map((f, i) => (
              <tr key={i}>
                <th scope="row" className="alt">{f.label}{f.hint && <span className="calc-hint">{f.hint}</span>}</th>
                {f.cells.map((v, j) => <td key={j} className="n">{fmtCell(v)}</td>)}
              </tr>
            ))}
          </tfoot>
        )}
      </table>
    </div>
  );
}
