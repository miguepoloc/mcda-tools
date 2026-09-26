// Cálculo VIKOR (misma matemática que pyDecision.vikor_method, ver 03_vikor_iot_palmor.ipynb del
// curso): S (utilidad de grupo), R (arrepentimiento individual), Q (compromiso, v = peso de la
// "estrategia de mayoría de criterios" de Opricovic 1998; 0.5 por defecto) -> menor Q es mejor.
// v NO sale de los datos: lo elige quien decide y se guarda en `decision_matrix.vikorV` (ver types.ts).
// Además de rankear, VIKOR solo declara un ganador único si se cumplen las 2 condiciones de Opricovic &
// Tzeng (2004) (ventaja aceptable y estabilidad); si no, propone un conjunto de compromiso, ver
// vikorVerdict(). Sesión 3 del curso, diapositivas 22-29 y 47. Mismos pesos y matriz
// de decisión que topsis.ts (types.ts DecisionMatrix), solo cambia la fórmula de síntesis.
import type { Alternative, Criterion, DecisionMatrix, MatrixType } from './types.ts';
import { getCell, getType } from './topsis.ts';

export type VikorResult = {
  n: number;
  s: number[]; // utilidad de grupo por alternativa
  r: number[]; // arrepentimiento individual por alternativa
  q: number[]; // compromiso; MENOR es mejor (a diferencia de TOPSIS, donde mayor es mejor)
  order: number[]; // índices ordenados de mejor (Q menor) a peor
  /** Detalle intermedio, expuesto para que excel.ts pueda cachear los mismos números que muestran
   * las fórmulas vivas del .xlsx (ver topsis.ts, mismo patrón). */
  weights: number[];
  best: number[]; // f* por columna
  worst: number[]; // f- por columna
  contrib: number[][]; // aporte ponderado de cada alternativa/criterio a S (y de donde sale R = max de la fila)
};

export function vikor(matrix: number[][], weights: number[], types: MatrixType[], v = 0.5): VikorResult {
  const n = matrix.length;
  const m = weights.length;
  if (n === 0 || m === 0) return { n, s: [], r: [], q: [], order: [], weights: [], best: [], worst: [], contrib: [] };
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const w = weights.map((x) => x / wsum);

  const colOf = (j: number) => matrix.map((row) => row[j]);
  const best = Array.from({ length: m }, (_, j) => {
    const col = colOf(j);
    return types[j] === 'min' ? Math.min(...col) : Math.max(...col);
  });
  const worst = Array.from({ length: m }, (_, j) => {
    const col = colOf(j);
    return types[j] === 'min' ? Math.max(...col) : Math.min(...col);
  });

  const contrib = matrix.map((row) => row.map((x, j) => {
    const denom = best[j] - worst[j];
    return denom === 0 ? 0 : (w[j] * (best[j] - x)) / denom;
  }));
  const s = contrib.map((row) => row.reduce((a, b) => a + b, 0));
  const r = contrib.map((row) => Math.max(...row));

  const sMin = Math.min(...s), sMax = Math.max(...s);
  const rMin = Math.min(...r), rMax = Math.max(...r);
  const q = s.map((si, i) => {
    const sPart = sMax - sMin === 0 ? 0 : (si - sMin) / (sMax - sMin);
    const rPart = rMax - rMin === 0 ? 0 : (r[i] - rMin) / (rMax - rMin);
    return v * sPart + (1 - v) * rPart;
  });
  const order = q.map((_, i) => i).sort((a, b) => q[a] - q[b]);
  return { n, s, r, q, order, weights: w, best, worst, contrib };
}

/** v por defecto, convención del curso y de pyDecision: "consenso" (Alidrisi 2021). No está justificado por los datos. */
export const VIKOR_V_DEFAULT = 0.5;

/** v guardado en la matriz de decisión del proyecto; 0.5 si falta o es inválido. */
export function vikorV(dm: DecisionMatrix): number {
  const v = dm.vikorV;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : VIKOR_V_DEFAULT;
}

const EPS = 1e-9;

/** Condiciones de Opricovic & Tzeng (2004) para declarar UN ganador (Alidrisi 2021 las repite igual):
 *  C1, ventaja aceptable: Q(2º) − Q(1º) ≥ DQ = 1/(m−1), con m = número de alternativas.
 *  C2, estabilidad: el 1º por Q también es el mejor en S y/o en R.
 *  Si solo falla C2 se proponen el 1º y el 2º; si falla C1, todas las alternativas con Q − Q(1º) < DQ. */
export type VikorVerdict = {
  m: number;
  dq: number;
  /** Q(2º) − Q(1º) */
  deltaQ: number;
  c1: boolean;
  c2: boolean;
  /** índices con el S más bajo / el R más bajo (puede haber empates) */
  bestS: number[];
  bestR: number[];
  kind: 'unique' | 'two' | 'set';
  /** índices (ordenados por Q) del conjunto de compromiso; 1 solo elemento si kind === 'unique' */
  set: number[];
};

export function vikorVerdict(res: Pick<VikorResult, 's' | 'r' | 'q' | 'order'>): VikorVerdict | null {
  const m = res.q.length;
  if (m < 2 || res.order.length < 2) return null;
  const dq = 1 / (m - 1);
  const top = res.order[0], second = res.order[1];
  const deltaQ = res.q[second] - res.q[top];
  const minS = Math.min(...res.s), minR = Math.min(...res.r);
  const bestS = res.s.map((x, i) => (x <= minS + EPS ? i : -1)).filter((i) => i >= 0);
  const bestR = res.r.map((x, i) => (x <= minR + EPS ? i : -1)).filter((i) => i >= 0);
  const c1 = deltaQ >= dq - EPS;
  const c2 = bestS.includes(top) || bestR.includes(top);
  if (c1 && c2) return { m, dq, deltaQ, c1, c2, bestS, bestR, kind: 'unique', set: [top] };
  if (c1) return { m, dq, deltaQ, c1, c2, bestS, bestR, kind: 'two', set: [top, second] };
  return { m, dq, deltaQ, c1, c2, bestS, bestR, kind: 'set', set: res.order.filter((i) => res.q[i] - res.q[top] < dq - EPS) };
}

export type VikorSensRow = { v: number; q: number[]; order: number[]; verdict: VikorVerdict | null };

/** Q, ranking y veredicto para cada v de `vs`, con los mismos datos y pesos. */
export function vikorSensitivity(matrix: number[][], weights: number[], types: MatrixType[], vs: number[]): VikorSensRow[] {
  return vs.map((v) => {
    const r = vikor(matrix, weights, types, v);
    return { v, q: r.q, order: r.order, verdict: vikorVerdict(r) };
  });
}

/** Valores de v en (0, 1) donde cambia la alternativa en 1er lugar (Q_i(v) es una recta en v: Q = b + (a−b)·v,
 * con a = parte de S y b = parte de R ya normalizadas). `from`/`to` son índices de alternativa. */
export type VikorBreak = { v: number; from: number; to: number };

export function vikorFirstPlaceChanges(matrix: number[][], weights: number[], types: MatrixType[]): VikorBreak[] {
  const n = matrix.length;
  if (n < 2) return [];
  const a = vikor(matrix, weights, types, 1).q;
  const b = vikor(matrix, weights, types, 0).q;
  const line = (i: number, v: number) => b[i] + (a[i] - b[i]) * v;
  const cuts = new Set<number>([0, 1]);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const den = (a[i] - b[i]) - (a[j] - b[j]);
      if (Math.abs(den) < EPS) continue;
      const v = (b[j] - b[i]) / den;
      if (v > EPS && v < 1 - EPS) cuts.add(Math.round(v * 1e9) / 1e9);
    }
  }
  const pts = [...cuts].sort((x, y) => x - y);
  const winnerAt = (v: number) => {
    let best = 0;
    for (let i = 1; i < n; i++) if (line(i, v) < line(best, v) - EPS) best = i;
    return best;
  };
  const out: VikorBreak[] = [];
  let prev = winnerAt((pts[0] + pts[1]) / 2);
  for (let k = 1; k < pts.length - 1; k++) {
    const next = winnerAt((pts[k] + pts[k + 1]) / 2);
    if (next !== prev) { out.push({ v: pts[k], from: prev, to: next }); prev = next; }
  }
  return out;
}

/** Arma matriz numérica + tipos (max/min) de un proyecto, igual que hace vikorSynthesis. */
export function vikorInputs(criteria: Criterion[], alternatives: Alternative[], dm: DecisionMatrix) {
  const matrix = alternatives.map((a) => criteria.map((c) => getCell(dm, a.id, c.id) ?? 0));
  const types = criteria.map((c) => getType(dm, c.id));
  return { matrix, types };
}

export type VikorSynth = {
  rows: { name: string; s: number; r: number; q: number; rank: number }[];
  order: number[];
  tie: boolean;
  /** v usado (de `v` si se pasó, si no de `dm.vikorV`, si no 0.5) */
  v: number;
  /** null si hay empate (sin datos) o menos de 2 alternativas */
  verdict: VikorVerdict | null;
};

export function vikorSynthesis(criteria: Criterion[], alternatives: Alternative[], dm: DecisionMatrix, weights: number[], v: number = vikorV(dm)): VikorSynth {
  const { matrix, types } = vikorInputs(criteria, alternatives, dm);
  const res = vikor(matrix, weights, types, v);
  const rows = alternatives.map((a, i) => ({ name: a.name, s: res.s[i] ?? 0, r: res.r[i] ?? 0, q: res.q[i] ?? 0, rank: 0 }));
  rows.forEach((row) => (row.rank = 1 + rows.filter((o) => o.q < row.q - 1e-9).length));
  const qs = rows.map((x) => x.q);
  const tie = qs.length < 2 || Math.max(...qs) - Math.min(...qs) < 1e-9;
  return { rows, order: res.order, tie, v, verdict: tie ? null : vikorVerdict(res) };
}
