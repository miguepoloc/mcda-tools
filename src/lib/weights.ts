// Métodos de ponderación objetiva de criterios.
// CRITIC: Diakoulaki et al. (1995), basado en desviación estándar y correlación entre criterios.
// Entropía: Shannon (1948) — la menor entropía (mayor dispersión) da más peso al criterio.
// Ambos reciben la matriz de decisión y devuelven pesos normalizados (suma = 1).
import type { Alternative, Criterion, DecisionMatrix } from './types.ts';
import { getType } from './topsis.ts';

/** Valor numérico de una celda. Fuzzy TOPSIS usa strings; para ponderación objetiva siempre numérico. */
function getNum(dm: DecisionMatrix, altId: string, critId: string): number {
  const v = dm.values[altId]?.[critId];
  return typeof v === 'number' ? v : 0;
}

function normalizeMinMax(col: number[], type: 'max' | 'min'): number[] {
  const lo = Math.min(...col);
  const hi = Math.max(...col);
  const span = hi - lo || 1;
  return col.map((x) => (type === 'min' ? (hi - x) / span : (x - lo) / span));
}

/** Intermedios de CRITIC, los mismos números que produce criticWeights() (que ahora los toma de aquí: una sola matemática).
 * Matrices con filas = alternativas (i) y columnas = criterios (j), salvo `corr`, que es criterio × criterio. */
export type CriticSteps = {
  n: number; m: number;
  /** Valores originales de la matriz (celda no numérica = 0, como en criticWeights). */
  raw: number[][];
  types: ('max' | 'min')[];
  /** Mínimo y máximo de cada criterio (los que usa la normalización min-max). */
  lo: number[]; hi: number[];
  /** Matriz normalizada min-max en [0,1] (costo invertido; si el criterio no varía, todo 0). */
  norm: number[][];
  /** Media y desviación estándar (población, n) de cada columna normalizada. */
  mean: number[]; sigma: number[];
  /** Correlación de Pearson entre criterios (diagonal 1; sin varianza → 0). */
  corr: number[][];
  /** Σ_k (1 − ρ_jk) por criterio: cuánta información distinta aporta frente a los demás. */
  conflict: number[];
  /** C_j = σ_j · Σ_k (1 − ρ_jk), su suma y el peso final w_j = C_j / ΣC. */
  C: number[]; total: number; w: number[];
};

/** Intermedios de la Entropía de Shannon (los mismos números que entropyWeights()). */
export type EntropySteps = {
  n: number; m: number;
  raw: number[][];
  types: ('max' | 'min')[];
  /** Valor orientado: en criterios de costo 1/x (0 si x = 0), en beneficio x tal cual. */
  oriented: number[][];
  /** Suma de la columna orientada (denominador de las proporciones). */
  colTotal: number[];
  /** Proporciones p_ij = x_ij / Σ_i x_ij. */
  p: number[][];
  /** Términos p·ln(p) (0 cuando p ≤ 0). */
  plnp: number[][];
  /** k = 1/ln(n) y entropía E_j = −k·Σ p·ln(p). */
  k: number; E: number[];
  /** Divergencia d_j = 1 − E_j, su suma y el peso final w_j = d_j / Σd. */
  d: number[]; dTotal: number; w: number[];
};

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

/**
 * CRITIC (CRiteria Importance Through Intercriteria Correlation).
 * Pasos: normalización Min-Max → σ por columna → matriz de correlación → C_j = σ_j * Σ(1 - r_jk) → normalizar.
 */
export function criticSteps(criteria: Criterion[], alternatives: Alternative[], dm: DecisionMatrix): CriticSteps {
  const m = criteria.length;
  const n = alternatives.length;
  if (m === 0 || n === 0) return { n, m, raw: [], types: [], lo: [], hi: [], norm: [], mean: [], sigma: [], corr: [], conflict: [], C: [], total: 0, w: [] };

  const types = criteria.map((c) => getType(dm, c.id));
  const raw = alternatives.map((a) => criteria.map((c) => getNum(dm, a.id, c.id)));
  const cols = criteria.map((_, j) => raw.map((row) => row[j]));
  const lo = cols.map((c) => Math.min(...c));
  const hi = cols.map((c) => Math.max(...c));
  // Matriz normalizada por criterio: X[j][i]
  const X: number[][] = cols.map((col, j) => normalizeMinMax(col, types[j]));

  // Desviación estándar de cada criterio (población)
  const means = X.map((col) => mean(col));
  const sigma: number[] = X.map((col, j) => Math.sqrt(col.reduce((a, x) => a + (x - means[j]) ** 2, 0) / n));

  // Matriz de correlación de Pearson (m × m)
  const corr: number[][] = Array.from({ length: m }, () => Array(m).fill(0));
  for (let j = 0; j < m; j++) {
    for (let k = 0; k < m; k++) {
      if (j === k) { corr[j][k] = 1; continue; }
      const xj = X[j], xk = X[k];
      const mj = mean(xj);
      const mk = mean(xk);
      const num = xj.reduce((s, v, i) => s + (v - mj) * (xk[i] - mk), 0);
      const den = Math.sqrt(xj.reduce((s, v) => s + (v - mj) ** 2, 0) * xk.reduce((s, v) => s + (v - mk) ** 2, 0));
      corr[j][k] = den === 0 ? 0 : num / den;
    }
  }

  // C_j = σ_j * Σ_k (1 - r_jk)
  const conflict = corr.map((row) => row.reduce((sum, r) => sum + (1 - r), 0));
  const C = sigma.map((s, j) => s * conflict[j]);
  const total = C.reduce((a, b) => a + b, 0) || 1;
  const norm = raw.map((_, i) => criteria.map((__, j) => X[j][i]));
  return { n, m, raw, types, lo, hi, norm, mean: means, sigma, corr, conflict, C, total, w: C.map((c) => c / total) };
}

export function criticWeights(criteria: Criterion[], alternatives: Alternative[], dm: DecisionMatrix): number[] {
  return criticSteps(criteria, alternatives, dm).w;
}

/**
 * Entropía de Shannon.
 * Pasos: normalizar a proporciones por columna → E_j = -k Σ p_ij ln(p_ij) → d_j = 1 - E_j → normalizar.
 */
export function entropySteps(criteria: Criterion[], alternatives: Alternative[], dm: DecisionMatrix): EntropySteps {
  const m = criteria.length;
  const n = alternatives.length;
  if (m === 0 || n === 0) return { n, m, raw: [], types: [], oriented: [], colTotal: [], p: [], plnp: [], k: 0, E: [], d: [], dTotal: 0, w: [] };

  const k = 1 / Math.log(n || 2); // factor de normalización
  const types = criteria.map((c) => getType(dm, c.id));
  const raw = alternatives.map((a) => criteria.map((c) => getNum(dm, a.id, c.id)));
  // Para criterios de costo invertir para que dispersión alta = más información
  const oriented = raw.map((row) => row.map((x, j) => (types[j] === 'min' ? (x === 0 ? 0 : 1 / x) : x)));
  const colTotal = criteria.map((_, j) => oriented.reduce((a, row) => a + row[j], 0) || 1);
  const p = oriented.map((row) => row.map((x, j) => x / colTotal[j]));
  const plnp = p.map((row) => row.map((pi) => (pi > 0 ? pi * Math.log(pi) : 0)));
  const E = criteria.map((_, j) => -k * plnp.reduce((s, row) => s + row[j], 0));

  const d = E.map((e) => 1 - e);
  const dTotal = d.reduce((a, b) => a + b, 0) || 1;
  return { n, m, raw, types, oriented, colTotal, p, plnp, k, E, d, dTotal, w: d.map((di) => di / dTotal) };
}

export function entropyWeights(criteria: Criterion[], alternatives: Alternative[], dm: DecisionMatrix): number[] {
  return entropySteps(criteria, alternatives, dm).w;
}
