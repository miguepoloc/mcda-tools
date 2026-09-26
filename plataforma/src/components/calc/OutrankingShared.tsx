'use client';

import { useId, type ReactNode } from 'react';
import type { MatrixType } from '@/lib/types';
import { CalcMatrix, Reading, Worked, type CalcMode } from './CalcKit';
import { fmtVal, n4, typeText } from './calcFormat';

/** Piezas comunes de los desgloses de ELECTRE y PROMETHEE (sesión 4): matriz de decisión + pesos + tipo + rango, y selector de par.
 * Solo variables CSS y las clases `.calc-*` / `.ob-*` de globals.css. */

/** Paso 1 de los dos métodos: la matriz tal como entra, el tipo de cada criterio, sus pesos y sus rangos. */
export function InputsTable({ mode, names, critLabels, matrix, types, weights, ranges, rangeName, rangeMeaning }: {
  mode: CalcMode;
  names: string[];
  critLabels: string[];
  matrix: number[][];
  types: MatrixType[];
  weights: number[];
  ranges: number[];
  /** «R_j» en ELECTRE, «p_j» en PROMETHEE. */
  rangeName: string;
  rangeMeaning: string;
}) {
  const best = critLabels.map((_, j) => {
    const col = matrix.map((r) => r[j]);
    return types[j] === 'min' ? Math.min(...col) : Math.max(...col);
  });
  return (
    <>
      <CalcMatrix
        mode={mode} corner="Alternativa" caption="Matriz de decisión, con el tipo, el peso y el rango de cada criterio"
        rows={names} cols={critLabels}
        colHint={types.map((t, j) => `${typeText(t)} · w = ${n4(weights[j])}`)}
        cells={matrix.map((r) => r.map(fmtVal))}
        hl={(i, j) => (matrix[i][j] === best[j] ? 'good' : undefined)}
        footer={[
          { label: 'Peso w_j', hint: 'normalizado, suma 1', cells: weights.map(n4) },
          { label: `${rangeName}`, hint: rangeMeaning, cells: ranges.map(fmtVal) },
        ]}
      />
      <Worked title="Con tus números: cómo salen los rangos">
        {critLabels.map((c, j) => {
          const col = matrix.map((r) => r[j]);
          const mx = Math.max(...col), mn = Math.min(...col);
          const zero = mx - mn === 0;
          return `${rangeName} de ${c} = máx − mín = ${fmtVal(mx)} − ${fmtVal(mn)} = ${fmtVal(mx - mn)}${zero ? '  (rango 0: se usa 1 para no dividir entre cero)' : ''}\n`;
        }).join('')}
      </Worked>
      <p className="calc-meaning"><b>Marca de lectura: </b>los valores en negrita con fondo son el mejor de cada criterio (el mayor si es de beneficio, el menor si es de costo). Los pesos suman 1 y vienen del paso de ponderación de criterios de este proyecto.</p>
    </>
  );
}

/** Selector de par ordenado (a → b) para el desglose «un par completo». Objetivos táctiles de 44 px; elegir el mismo en los dos lados
 * cambia el otro, porque un par necesita dos alternativas distintas. */
export function PairPicker({ names, a, b, onChange, labelA = 'a (la que se compara)', labelB = 'b (contra la que se compara)' }: {
  names: string[]; a: number; b: number; onChange: (a: number, b: number) => void; labelA?: string; labelB?: string;
}) {
  const uid = useId();
  const pick = (which: 'a' | 'b', v: number) => {
    if (which === 'a') onChange(v, v === b ? a : b);
    else onChange(v === a ? b : a, v);
  };
  return (
    <div className="ob-picker" role="group" aria-label="Elige el par de alternativas a desglosar">
      <label htmlFor={uid + 'a'}>{labelA}
        <select id={uid + 'a'} className="ob-sel" value={a} onChange={(e) => pick('a', Number(e.target.value))}>
          {names.map((nm, i) => <option key={i} value={i}>{nm}</option>)}
        </select>
      </label>
      <span className="ob-arrow" aria-hidden="true">→</span>
      <label htmlFor={uid + 'b'}>{labelB}
        <select id={uid + 'b'} className="ob-sel" value={b} onChange={(e) => pick('b', Number(e.target.value))}>
          {names.map((nm, i) => <option key={i} value={i}>{nm}</option>)}
        </select>
      </label>
      <button type="button" className="ob-btn" onClick={() => onChange(b, a)} aria-label={`Invertir el par: comparar ${names[b]} contra ${names[a]}`}>⇄ Invertir</button>
    </div>
  );
}

/** Aviso corto dentro de un paso. `kind='note'` = convención o limitación; siempre lleva la etiqueta escrita (no solo color). */
export function Note({ title = 'Nota', children }: { title?: string; children: ReactNode }) {
  return <p className="ob-note"><b>{title}: </b>{children}</p>;
}

export { Reading, Worked };

