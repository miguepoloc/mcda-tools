// Datos del «desglose AHP paso a paso» (components/calc/AhpBreakdown.tsx). Solo ARMA lo que la plataforma ya calcula
// (`sheetResult`, `synthesis`, `aggMatrix`, `expertMatrix`) y le suma los intermedios que las diapositivas muestran a mano
// (A·w, cocientes, iteraciones de potencias, modo ideal): no hay ninguna fórmula nueva para los resultados. Sin dependencias
// de React ni de Supabase, para poder probarlo con `npm test`.
import {
  CRIT_SHEET, RI, aggMatrix, altSheet, equalWeightsSynthesis, expertMatrix, idealSynthesis, pairsOf, powerIterations, sheetResult, synthesis,
  type Analysis, type IdealSynth, type Item, type JIndex, type Synth, type WeightMethod,
} from './ahp.ts';
import type { Alternative, Criterion } from './types.ts';

export type BreakdownExpert = { id: string; label: string; /** Rol o perfil del experto (p. ej. «ingeniero agrónomo»). Opcional. */ role?: string };

export type SheetBreakdown = {
  key: string;
  label: string;
  /** Etiqueta corta para encabezados de tabla: «Criterios» o el nombre del criterio. */
  short: string;
  kind: 'criteria' | 'alternatives';
  items: Item[];
  /** Matriz agregada A (media geométrica de los expertos). */
  A: number[][];
  /** Matriz de cada experto incluido, en el orden de `experts`. Un par sin juicio cuenta como 1. */
  expertA: number[][][];
  /** Juicios respondidos por experto y total de pares n(n−1)/2. */
  answered: number[];
  totalPairs: number;
  agg: Analysis;
  per: Analysis[];
  /** w⁽⁰⁾ … w⁽⁶⁾ del método de potencias sobre A. */
  iterations: number[][];
  /** A·w con los pesos usados (`agg.w`) y los cocientes (A·w)_i / w_i cuyo promedio es λmax. */
  Aw: number[];
  ratios: number[];
};

export type SynthesisBreakdown = {
  synth: Synth;
  ideal: IdealSynth;
  equal: { score: number[]; rank: number[] };
};

export type AhpBreakdownData = {
  weightMethod: WeightMethod;
  experts: BreakdownExpert[];
  /** La hoja de criterios va primero; después, una por criterio (solo cuando el método es AHP completo). */
  sheets: SheetBreakdown[];
  /** Solo cuando hay hojas de alternativas (AHP completo). */
  synthesis?: SynthesisBreakdown;
};

function sheetBreakdown(key: string, label: string, short: string, kind: SheetBreakdown['kind'], items: Item[], usedIds: string[], idx: JIndex, method: WeightMethod): SheetBreakdown {
  const r = sheetResult(key, items, usedIds, idx, method);
  const A = aggMatrix(items, r.maps);
  const Aw = A.map((row) => row.reduce((a, x, j) => a + x * (r.agg.w[j] ?? 0), 0));
  return {
    key, label, short, kind, items, A,
    expertA: r.maps.map((m) => expertMatrix(items, m)),
    answered: r.answered,
    totalPairs: pairsOf(items.length).length,
    agg: r.agg, per: r.per,
    iterations: powerIterations(A, 6),
    Aw,
    ratios: Aw.map((x, i) => (r.agg.w[i] > 0 ? x / r.agg.w[i] : NaN)),
  };
}

/**
 * Arma todos los datos del desglose desde lo que ya tiene Resultados: criterios, alternativas, expertos del proyecto, ids de los
 * expertos incluidos en el cálculo (`used`, mismo orden que en `sheetResult`), el índice de juicios y el método de pesos.
 * `withAlternatives` = false cuando solo los pesos de los criterios salen de AHP (métodos de matriz con pesos por AHP): entonces no
 * hay hojas de alternativas ni síntesis.
 */
export function buildAhpBreakdownData(p: {
  criteria: Criterion[]; alternatives: Alternative[]; experts: BreakdownExpert[]; used: string[]; idx: JIndex; weightMethod: WeightMethod; withAlternatives: boolean;
}): AhpBreakdownData {
  const experts = p.used.map((id) => p.experts.find((e) => e.id === id) ?? { id, label: 'Experto' });
  const sheets: SheetBreakdown[] = [sheetBreakdown(CRIT_SHEET, 'Comparación de los criterios entre sí', 'Criterios', 'criteria', p.criteria, p.used, p.idx, p.weightMethod)];
  let syn: SynthesisBreakdown | undefined;
  if (p.withAlternatives) {
    for (const c of p.criteria) sheets.push(sheetBreakdown(altSheet(c.id), `Alternativas según «${c.name}»`, c.name, 'alternatives', p.alternatives, p.used, p.idx, p.weightMethod));
    const synth = synthesis(p.criteria, p.alternatives, p.used, p.idx, p.weightMethod);
    const loc = synth.rows.map((r) => r.loc);
    syn = { synth, ideal: idealSynthesis(synth.wr, loc), equal: equalWeightsSynthesis(loc) };
  }
  return { weightMethod: p.weightMethod, experts, sheets, synthesis: syn };
}

/** RI que usa la plataforma para una matriz n×n (la tabla de Saaty hasta n = 10; 1.49 después). */
export const riFor = (n: number): number => (RI[n] !== undefined ? RI[n] : 1.49);
