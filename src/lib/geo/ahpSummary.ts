/** Resumen del AHP de los criterios que se publica junto con el mapa (vista pública `/p/<token>`): matriz agregada, pesos, λmax/CI/RI/CR,
 * consenso del panel, incertidumbre de los pesos y, por experto, sus pesos y su CR. Es un cálculo puro sobre `SheetResult` (los mismos
 * números que ve el dueño en «Resultados»). Los expertos van SIN nombre: «Experto 1..n» por su posición. */
import { aggMatrix, type Item, type SheetResult, type WeightMethod } from '../ahp.ts';
import { consensus, weightUncertainty, type ConsensusCategory } from '../ahpGroup.ts';

export type AhpSummary = {
  method: WeightMethod;
  names: string[];
  /** Matriz agregada de comparaciones (media geométrica de los expertos). */
  matrix: number[][];
  weights: number[];
  lambda: number;
  ci: number;
  ri: number;
  cr: number;
  consensus: { sStar: number; category: ConsensusCategory } | null;
  /** Δw(−) y Δw(+) (Monte Carlo, semilla fija). */
  uncertainty: { minus: number[]; plus: number[]; accepted: number; runs: number; delta: number } | null;
  experts: { label: string; weights: number[]; cr: number }[];
};

/** `items` = criterios de la hoja «crit»; solo cuentan los expertos que respondieron algo (`answered > 0`). */
export function ahpSummary(items: Item[], result: SheetResult): AhpSummary | null {
  const answering = result.answered.map((a, i) => (a > 0 ? i : -1)).filter((i) => i >= 0);
  if (!answering.length || items.length < 2) return null;
  const A = aggMatrix(items, answering.map((i) => result.maps[i]));
  const cons = consensus(answering.map((i) => result.per[i].w));
  const mc = weightUncertainty(A, answering.length, { method: result.agg.method, seed: 1 });
  return {
    method: result.agg.method,
    names: items.map((x) => x.name),
    matrix: A,
    weights: result.agg.w,
    lambda: result.agg.lam, ci: result.agg.ci, ri: result.agg.ri, cr: result.agg.cr,
    consensus: cons ? { sStar: cons.sStar, category: cons.category } : null,
    uncertainty: { minus: mc.minus, plus: mc.plus, accepted: mc.accepted, runs: mc.runs, delta: mc.delta },
    experts: answering.map((i, k) => ({ label: `Experto ${k + 1}`, weights: result.per[i].w, cr: result.per[i].cr })),
  };
}
