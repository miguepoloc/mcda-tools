// De dónde salen los pesos de los criterios y, por tanto, si los juicios de los expertos cuentan o no.
// Lógica pura (sin React) para que Results, la pestaña Comparativa, la vista pública y el flujo del experto decidan lo mismo,
// y para poder probarla con `npm test`.
//
// Regla: AHP como método de ranking siempre usa juicios. Un método de matriz (TOPSIS, VIKOR, PROMETHEE, ELECTRE, SAW,
// Fuzzy TOPSIS) usa juicios solo si su ponderación es 'ahp'; con CRITIC o Entropía los pesos salen de la matriz de decisión y
// cualquier juicio guardado de una fase anterior es un dato huérfano que NO debe influir en nada de lo que se muestra o bloquea.
import type { Method, WeightingMethod } from './types.ts';
import type { JIndex } from './ahp.ts';
import { isObjectiveWeighting } from './references.ts';

export const WEIGHTING_SHORT: Record<WeightingMethod, string> = { ahp: 'AHP', critic: 'CRITIC', entropy: 'Entropía' };

/** Ponderación efectiva: AHP como método de ranking ignora `weighting_method` (siempre deriva sus propios pesos). */
export function effectiveWeighting(method: Method, weighting: WeightingMethod | null | undefined): WeightingMethod {
  if (method === 'ahp') return 'ahp';
  return weighting === 'critic' || weighting === 'entropy' ? weighting : 'ahp';
}

/** ¿Los pesos salen de la matriz de decisión (CRITIC/Entropía) en vez de juicios de expertos? */
export function isObjectiveFor(method: Method, weighting: WeightingMethod | null | undefined): boolean {
  return isObjectiveWeighting(effectiveWeighting(method, weighting));
}

/** ¿Los juicios de los expertos influyen en el resultado? Es lo contrario de `isObjectiveFor`. */
export function usesExpertJudgments(method: Method, weighting: WeightingMethod | null | undefined): boolean {
  return !isObjectiveFor(method, weighting);
}

/**
 * Expertos que aportan juicios al cálculo. Con pesos objetivos, ninguno. En AHP cuenta cualquier hoja (criterios o alternativas);
 * en un método de matriz solo importa la hoja «Criterios» (las alternativas se comparan con la matriz de decisión), así que un
 * experto con juicios solo en hojas de alternativas (sobrantes de cuando el proyecto era AHP) no debe entrar al agregado: entraría
 * como una matriz de unos y diluiría los pesos.
 */
export function expertsWithJudgments(expertIds: string[], idx: JIndex, method: Method, weighting: WeightingMethod | null | undefined): string[] {
  if (!usesExpertJudgments(method, weighting)) return [];
  return expertIds.filter((id) => {
    const sheets = idx[id] ?? {};
    if (method === 'ahp') return Object.values(sheets).some((m) => Object.keys(m).length > 0);
    return Object.keys(sheets['crit'] ?? {}).length > 0;
  });
}

/** Por qué no hay resultados que mostrar (null = sí los hay). */
export type ResultsGate = null | 'no-judgments' | 'no-matrix' | 'no-weight-judgments' | 'compare-nothing';

/**
 * Qué bloquea la vista de resultados. Con pesos objetivos SOLO depende de la matriz de decisión: los juicios no cuentan.
 * Con pesos AHP en un método de matriz, sin juicios sobre los criterios los pesos quedarían iguales (1/n) en silencio, así que se
 * bloquea con un mensaje que manda a la pestaña Expertos.
 */
export function resultsGate(p: {
  mode: 'single' | 'compare';
  method: Method;
  weighting: WeightingMethod | null | undefined;
  /** ¿La matriz de decisión tiene algún dato? */
  matrixFilled: boolean;
  /** Expertos que aportan juicios (ver `expertsWithJudgments`). */
  expertCount: number;
  /** Solo en 'compare': cuántos métodos tienen datos suficientes para ranquear. */
  decidableCount?: number;
}): ResultsGate {
  const needsJudgments = usesExpertJudgments(p.method, p.weighting);
  if (p.mode === 'single') {
    if (p.method === 'ahp') return p.expertCount > 0 ? null : 'no-judgments';
    if (!p.matrixFilled) return 'no-matrix';
    return needsJudgments && p.expertCount === 0 ? 'no-weight-judgments' : null;
  }
  if (p.method !== 'ahp' && needsJudgments && p.expertCount === 0) return 'no-weight-judgments';
  return (p.decidableCount ?? 0) === 0 ? 'compare-nothing' : null;
}
