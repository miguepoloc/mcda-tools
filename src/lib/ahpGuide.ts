// Guía de consistencia AHP: cuando CR ≥ 0.10, señala QUÉ comparación se aparta más de las demás y qué valor de la escala de
// Saaty la haría coherente. Es de solo lectura: no cambia cómo se calculan pesos, λmax, CI ni CR (todo sale de `analyze`).
//
// Método (práctica estándar, p. ej. Saaty 2003, «Decision-making with the AHP: why is the principal eigenvector necessary»):
//   1. w = pesos de la matriz A (por defecto el eigenvector principal, igual que el resto de la plataforma).
//   2. Para cada par i<j, residuo en logaritmo: |ln a_ij − ln(w_i / w_j)|. Mide cuánto se aleja el juicio de lo que
//      implican los pesos; el de mayor residuo es el más contradictorio con los demás.
//   3. Valor sugerido: el entero de la escala (1/9 … 9) más cercano, en log, a w_i / w_j, en la codificación del repo
//      (value ∈ [-8, 8]; negativo = gana el primero, positivo = gana el segundo; |value| + 1 = intensidad).
//   4. CR resultante: se recalcula la matriz cambiando SOLO ese par y se vuelve a llamar a `analyze`.
import { analyze, expertMatrix, getV, pairsOf, ratio, DEFAULT_WEIGHT_METHOD } from './ahp.ts';
import type { Item, JMap, WeightMethod } from './ahp.ts';

export type GuideSuggestion = {
  /** Posiciones de los elementos en `items` (i < j). */
  i: number;
  j: number;
  /** Clave de par `<idA>-<idB>` (A antes que B), la misma con la que se guarda el juicio. */
  pairKey: string;
  /** Valor actual en [-8, 8] (null = sin juicio, cuenta como 1). */
  current: number | null;
  /** Valor sugerido en [-8, 8]. */
  suggested: number;
  /** |ln a_ij − ln(w_i/w_j)|. */
  residual: number;
  /** Razón que implican los pesos, w_i / w_j. */
  implied: number;
  /** CR de la hoja si solo se cambia este par al valor sugerido. */
  crAfter: number;
  /** ¿Con ese único cambio CR < 0.10? */
  fixes: boolean;
};

export type Guide = {
  cr: number;
  /** Hasta 3 pares con mayor residuo cuyo valor sugerido difiere del actual, de mayor a menor residuo. */
  suggestions: GuideSuggestion[];
};

/** Entero de la escala de Saaty (1..9) más cercano, en log, a la razón r > 0; devuelto como value ∈ [-8, 8]. */
export function nearestValue(r: number): number {
  const lr = Math.abs(Math.log(r));
  let k = 1;
  for (let c = 2; c <= 9; c++) if (Math.abs(Math.log(c) - lr) < Math.abs(Math.log(k) - lr)) k = c;
  const v = r >= 1 ? -(k - 1) : k - 1;
  return v === 0 ? 0 : v; // evita -0
}

/** Guía sobre una matriz ya armada (A[i][j] = a_ij con a_ji = 1/a_ij) y el valor actual de cada par. */
export function guideFromMatrix(
  items: Item[],
  A: number[][],
  currentOf: (i: number, j: number) => number | null,
  method: WeightMethod = DEFAULT_WEIGHT_METHOD,
  top = 3,
): Guide | null {
  const n = items.length;
  if (n < 3) return null; // con 2 elementos siempre es consistente
  const base = analyze(A, method);
  if (base.ok) return null;
  const w = base.w;
  const cand = pairsOf(n).map(([i, j]) => {
    const implied = w[i] / w[j];
    return { i, j, implied, residual: Math.abs(Math.log(A[i][j]) - Math.log(implied)) };
  }).sort((a, b) => b.residual - a.residual);
  const out: GuideSuggestion[] = [];
  for (const c of cand) {
    if (out.length >= top) break;
    const suggested = nearestValue(c.implied);
    const current = currentOf(c.i, c.j);
    if (suggested === (current ?? 0)) continue; // ya es lo más cercano a lo implícito: cambiarlo no ayuda
    const B = A.map((r) => r.slice());
    const r = ratio(suggested);
    B[c.i][c.j] = r;
    B[c.j][c.i] = 1 / r;
    const crAfter = analyze(B, method).cr;
    out.push({
      i: c.i, j: c.j, pairKey: items[c.i].id + '-' + items[c.j].id, current, suggested,
      residual: c.residual, implied: c.implied, crAfter, fixes: crAfter < 0.1,
    });
  }
  return { cr: base.cr, suggestions: out };
}

/** Guía para los juicios de UN experto en una hoja. Devuelve null si la hoja es consistente (CR < 0.10) o tiene < 3 elementos. */
export function guideConsistency(items: Item[], map: JMap, method: WeightMethod = DEFAULT_WEIGHT_METHOD): Guide | null {
  return guideFromMatrix(items, expertMatrix(items, map), (i, j) => getV(map, items[i].id, items[j].id), method);
}
