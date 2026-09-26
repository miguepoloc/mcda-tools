// SAW – Simple Additive Weighting.
// Normalización Min-Max (beneficio: (x-min)/(max-min); costo: (max-x)/(max-min)).
// Puntuación final: suma ponderada de los valores normalizados.
// Referencia: Hwang & Yoon (1981), Multiple Attribute Decision Making, cap. 2.
import type { Alternative, Criterion, DecisionMatrix } from './types.ts';
import type { MatrixType } from './topsis.ts';
import { getType } from './topsis.ts';

/** Obtiene el valor numérico de una celda de la matriz (solo para métodos no difusos). */
function getNum(dm: DecisionMatrix, altId: string, critId: string): number {
  const v = dm.values[altId]?.[critId];
  return typeof v === 'number' ? v : 0;
}

export type SawResult = {
  scores: number[];   // mismo orden que `alternatives`
  normalized: number[][];  // filas=alternativas, columnas=criterios (normalizado Min-Max)
  order: number[];
  weights: number[];
};

export function saw(matrix: number[][], weights: number[], types: MatrixType[]): SawResult {
  const n = matrix.length;
  const m = weights.length;
  if (n === 0 || m === 0) return { scores: [], normalized: [], order: [], weights: [] };

  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const w = weights.map((x) => x / wsum);

  // Normalización Min-Max por columna
  const normalized = matrix.map((row) => row.map(() => 0));
  for (let j = 0; j < m; j++) {
    const col = matrix.map((row) => row[j]);
    const lo = Math.min(...col);
    const hi = Math.max(...col);
    const span = hi - lo || 1;
    for (let i = 0; i < n; i++) {
      normalized[i][j] = types[j] === 'min'
        ? (hi - matrix[i][j]) / span
        : (matrix[i][j] - lo) / span;
    }
  }

  const scores = normalized.map((row) => row.reduce((s, v, j) => s + w[j] * v, 0));
  const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  return { scores, normalized, order, weights: w };
}

export type SawSynth = {
  rows: { name: string; value: number; rank: number }[];
  order: number[];
  tie: boolean;
};

export function sawSynthesis(
  criteria: Criterion[],
  alternatives: Alternative[],
  dm: DecisionMatrix,
  weights: number[],
): SawSynth {
  const matrix = alternatives.map((a) => criteria.map((c) => getNum(dm, a.id, c.id)));
  const types = criteria.map((c) => getType(dm, c.id));
  const r = saw(matrix, weights, types);
  const rows = alternatives.map((a, i) => ({ name: a.name, value: r.scores[i] ?? 0, rank: 0 }));
  rows.forEach((row) => (row.rank = 1 + rows.filter((o) => o.value > row.value + 1e-9).length));
  const vals = rows.map((x) => x.value);
  return {
    rows,
    order: r.order,
    tie: vals.length < 2 || Math.max(...vals) - Math.min(...vals) < 1e-9,
  };
}
