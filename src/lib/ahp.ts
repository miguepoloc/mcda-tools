// Cálculo AHP (misma matemática que el Excel del ejercicio y la herramienta HTML).
// Sin dependencias: se puede probar con `npm test`.
import type { Alternative, Criterion } from './types.ts';

export type Item = { id: string; name: string };
/** Juicios de UN experto en UNA hoja: clave "<idA>-<idB>" -> valor slider en [-8, 8]. */
export type JMap = Record<string, number>;
/** experto -> hoja -> juicios */
export type JIndex = Record<string, Record<string, JMap>>;

export const RI = [0, 0, 0, 0.58, 0.9, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49];
export const SAATY: Record<number, string> = {
  2: 'levemente',
  3: 'moderadamente',
  4: 'entre moderada y fuertemente',
  5: 'fuertemente',
  6: 'entre fuerte y muy fuertemente',
  7: 'muy fuertemente',
  8: 'entre muy fuerte y extremadamente',
  9: 'extremadamente',
};

export const pairsOf = (n: number): [number, number][] => {
  const p: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) p.push([i, j]);
  return p;
};

/** value del slider -> razón de Saaty a[i][j]. Negativo: gana el primero. */
export const ratio = (v: number | null | undefined) => (v == null || v === 0 ? 1 : v < 0 ? -v + 1 : 1 / (v + 1));

export function getV(m: JMap, a: string, b: string): number | null {
  const k = a + '-' + b;
  if (m[k] != null) return m[k];
  const r = m[b + '-' + a];
  return r != null ? -r : null;
}

export function setV(m: JMap, a: string, b: string, v: number): JMap {
  const n = { ...m };
  delete n[b + '-' + a];
  n[a + '-' + b] = v;
  return n;
}

const ones = (n: number) => Array.from({ length: n }, () => Array(n).fill(1) as number[]);

export function expertMatrix(items: Item[], m: JMap): number[][] {
  const A = ones(items.length);
  for (const [i, j] of pairsOf(items.length)) {
    const r = ratio(getV(m, items[i].id, items[j].id));
    A[i][j] = r;
    A[j][i] = 1 / r;
  }
  return A;
}

/** Media geométrica de las matrices de los expertos (Forman & Peniwati, 1998). */
export function aggMatrix(items: Item[], maps: JMap[]): number[][] {
  const A = ones(items.length);
  if (!maps.length) return A;
  for (const [i, j] of pairsOf(items.length)) {
    const g = Math.exp(maps.reduce((a, m) => a + Math.log(ratio(getV(m, items[i].id, items[j].id))), 0) / maps.length);
    A[i][j] = g;
    A[j][i] = 1 / g;
  }
  return A;
}

/**
 * Cómo se obtienen los pesos de una matriz de comparación:
 * - `mean`: promedio de las columnas normalizadas (el procedimiento a mano del curso, del Excel y del notebook 01;
 *   coincide con `pyDecision.ahp_method(wd='m')`). Es exacto solo si la matriz es consistente.
 * - `eigenvector`: eigenvector principal de Saaty (lo que usan AHP-OS y el artículo de la boya, 2021).
 */
export type WeightMethod = 'mean' | 'eigenvector';
/** Método por defecto: el del curso, para que la app coincida con el Excel y el notebook que ven los estudiantes. */
export const DEFAULT_WEIGHT_METHOD: WeightMethod = 'eigenvector';

export type Analysis = {
  n: number;
  N: number[][];
  /** Pesos según el método elegido (`wMean` o `wEigen`). */
  w: number[];
  /** Promedio de columnas normalizadas. */
  wMean: number[];
  /** Eigenvector principal (iteración de potencias hasta converger). */
  wEigen: number[];
  method: WeightMethod;
  lam: number;
  ci: number;
  ri: number;
  cr: number;
  diff: number;
  ok: boolean;
};

/** Eigenvector principal de una matriz positiva por iteración de potencias, normalizado a suma 1. */
export function principalEigenvector(A: number[][], tol = 1e-14, maxIter = 10000): number[] {
  const n = A.length;
  let p: number[] = Array(n).fill(1 / n);
  for (let k = 0; k < maxIter; k++) {
    const q = A.map((r) => r.reduce((a, x, j) => a + x * p[j], 0));
    const s = q.reduce((a, b) => a + b, 0);
    const next = q.map((x) => x / s);
    const d = Math.max(...next.map((x, i) => Math.abs(x - p[i])));
    p = next;
    if (d < tol) break;
  }
  return p;
}

export function analyze(A: number[][], method: WeightMethod = DEFAULT_WEIGHT_METHOD): Analysis {
  const n = A.length;
  if (n < 2) {
    const w = n ? [1] : [];
    return { n, N: A, w, wMean: w, wEigen: w, method, lam: n, ci: 0, ri: 0, cr: 0, diff: 0, ok: true };
  }
  const cs = Array(n).fill(0) as number[];
  A.forEach((r) => r.forEach((x, j) => (cs[j] += x)));
  const N = A.map((r) => r.map((x, j) => x / cs[j]));
  const wMean = N.map((r) => r.reduce((a, b) => a + b, 0) / n);
  const wEigen = principalEigenvector(A);
  const w = method === 'eigenvector' ? wEigen : wMean;
  const Aw = A.map((r) => r.reduce((a, x, j) => a + x * w[j], 0));
  const lam = Aw.reduce((a, x, i) => a + x / w[i], 0) / n;
  const ci = (lam - n) / (n - 1);
  const ri = RI[n] !== undefined ? RI[n] : 1.49;
  const cr = ri > 0 ? Math.max(0, ci / ri) : 0;
  const diff = Math.max(...wEigen.map((x, i) => Math.abs(x - wMean[i])));
  return { n, N, w, wMean, wEigen, method, lam, ci: Math.max(0, ci), ri, cr, diff, ok: cr < 0.1 };
}

export const fmt = (a: number) => {
  if (a >= 0.995) return Math.abs(a - Math.round(a)) < 0.005 ? String(Math.round(a)) : a.toFixed(2);
  const r = 1 / a;
  return Math.abs(r - Math.round(r)) < 0.005 ? '1/' + Math.round(r) : a.toFixed(3);
};

export const CRIT_SHEET = 'crit';
export const altSheet = (critId: string) => 'alt:' + critId;

export function indexJudgments(rows: { expert_id: string; sheet: string; pair_key: string; value: number }[]): JIndex {
  const idx: JIndex = {};
  for (const r of rows) {
    ((idx[r.expert_id] ??= {})[r.sheet] ??= {})[r.pair_key] = r.value;
  }
  return idx;
}

export function sheetItems(sheet: string, criteria: Criterion[], alts: Alternative[]): Item[] {
  return sheet === CRIT_SHEET ? criteria : alts;
}

export function answeredCount(items: Item[], m: JMap) {
  return pairsOf(items.length).filter(([i, j]) => getV(m, items[i].id, items[j].id) != null).length;
}

export type SheetResult = { items: Item[]; agg: Analysis; per: Analysis[]; answered: number[]; maps: JMap[] };

export function sheetResult(sheet: string, items: Item[], expertIds: string[], idx: JIndex, method: WeightMethod = DEFAULT_WEIGHT_METHOD): SheetResult {
  const maps = expertIds.map((e) => idx[e]?.[sheet] ?? {});
  return {
    items,
    agg: analyze(aggMatrix(items, maps), method),
    per: maps.map((m) => analyze(expertMatrix(items, m), method)),
    answered: maps.map((m) => answeredCount(items, m)),
    maps,
  };
}

export type Synth = {
  wr: number[];
  rows: { name: string; loc: number[]; contrib: number[]; g: number; rank: number }[];
  order: number[];
  tie: boolean;
};

export function synthesis(criteria: Criterion[], alts: Alternative[], expertIds: string[], idx: JIndex, method: WeightMethod = DEFAULT_WEIGHT_METHOD): Synth {
  const wr = sheetResult(CRIT_SHEET, criteria, expertIds, idx, method).agg.w;
  const loc = criteria.map((c) => sheetResult(altSheet(c.id), alts, expertIds, idx, method).agg.w);
  const rows = alts.map((a, i) => {
    const contrib = wr.map((w, c) => w * (loc[c]?.[i] ?? 0));
    return { name: a.name, loc: loc.map((l) => l[i] ?? 0), contrib, g: contrib.reduce((x, y) => x + y, 0), rank: 0 };
  });
  const order = rows.map((_, i) => i).sort((a, b) => rows[b].g - rows[a].g);
  rows.forEach((r) => (r.rank = 1 + rows.filter((o) => o.g > r.g + 1e-9).length));
  const gs = rows.map((r) => r.g);
  return { wr, rows, order, tie: gs.length < 2 || Math.max(...gs) - Math.min(...gs) < 1e-9 };
}

export function phrase(items: Item[], i: number, j: number, v: number | null): string {
  if (v == null) return 'Sin juicio todavía (cuenta como 1).';
  if (v === 0) return `1 · ${items[i].name} y ${items[j].name} son igual de importantes.`;
  const k = Math.abs(v) + 1;
  const win = v < 0 ? i : j;
  const lose = v < 0 ? j : i;
  return `${k} · ${items[win].name} es ${SAATY[k]} preferida que ${items[lose].name}.`;
}

// ---------------------------------------------------------------------------------------------------
// Helpers de solo lectura para el desglose didáctico (components/calc/AhpBreakdown.tsx). No cambian ningún resultado de `analyze`.

/**
 * Primeras iteraciones del método de potencias de Saaty: w⁽⁰⁾ = (1/n, …, 1/n) y w⁽ᵏ⁺¹⁾ = A·w⁽ᵏ⁾ / ‖A·w⁽ᵏ⁾‖₁.
 * Devuelve `steps + 1` vectores (de w⁽⁰⁾ a w⁽ˢᵗᵉᵖˢ⁾), cada uno con suma 1. Es la misma recurrencia que `principalEigenvector`,
 * pero guardando cada paso en vez de iterar hasta converger (sin tolerancia): sirve para mostrar cómo se acerca al eigenvector.
 */
export function powerIterations(A: number[][], steps = 6): number[][] {
  const n = A.length;
  let p: number[] = Array(n).fill(n ? 1 / n : 0);
  const out: number[][] = [p];
  for (let k = 0; k < steps; k++) {
    const q = A.map((r) => r.reduce((a, x, j) => a + x * p[j], 0));
    const s = q.reduce((a, b) => a + b, 0);
    p = s > 0 ? q.map((x) => x / s) : q;
    out.push(p);
  }
  return out;
}

export type IdealSynth = {
  /** Prioridades locales en modo ideal: L'[i][c] = L[i][c] / max_i L[i][c] (la mejor alternativa de cada criterio vale 1). */
  localIdeal: number[][];
  /** Mejor prioridad local de cada criterio (el divisor). */
  best: number[];
  /** P'_i = Σ_c w_c · L'[i][c], tal cual (no suma 1). */
  raw: number[];
  /** raw normalizado a suma 1, para compararlo con el modo distributivo. */
  norm: number[];
  /** Posición de cada alternativa (1 = mejor; empates comparten posición, tolerancia 1e-9 como `synthesis`). */
  rank: number[];
};

/**
 * Síntesis en modo IDEAL (Saaty & Vargas, 1993): cada prioridad local se divide entre la MEJOR de su criterio en vez de entre la suma
 * (que es lo que ya hace el modo distributivo de `synthesis`). `wr[c]` = peso del criterio c, `loc[i][c]` = prioridad local distributiva
 * de la alternativa i en el criterio c (`Synth.rows[i].loc`). No depende de cuántas alternativas compitan, solo de quién es la mejor.
 */
export function idealSynthesis(wr: number[], loc: number[][]): IdealSynth {
  const best = wr.map((_, c) => Math.max(0, ...loc.map((r) => r[c] ?? 0)));
  const localIdeal = loc.map((r) => wr.map((_, c) => (best[c] > 0 ? (r[c] ?? 0) / best[c] : 0)));
  const raw = localIdeal.map((r) => r.reduce((a, x, c) => a + wr[c] * x, 0));
  const total = raw.reduce((a, b) => a + b, 0);
  const norm = raw.map((x) => (total > 0 ? x / total : 0));
  const rank = raw.map((x) => 1 + raw.filter((o) => o > x + 1e-9).length);
  return { localIdeal, best, raw, norm, rank };
}

/** Síntesis con pesos IGUALES (1/n a cada criterio) sobre las mismas prioridades locales: la línea base «a ojo» contra la que se
 * compara el peso que sale de los juicios. `score[i]` = media de las prioridades locales de la alternativa i. */
export function equalWeightsSynthesis(loc: number[][]): { score: number[]; rank: number[] } {
  const score = loc.map((r) => (r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0));
  const rank = score.map((x) => 1 + score.filter((o) => o > x + 1e-9).length);
  return { score, rank };
}
