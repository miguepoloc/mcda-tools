// Cálculo PROMETHEE I y II (misma matemática que pyDecision.promethee_ii, ver 05_promethee_iot_palmor.ipynb del curso) con las
// seis funciones de preferencia de Brans y Vincke (1985): usual, en U, en V, por niveles, lineal y gaussiana (ver
// prometheeConfig.ts). Por defecto —y en todo proyecto guardado sin `decision_matrix.prometheeConfig`— cada criterio usa el Tipo III
// (lineal/V, la única que enseña el curso) con q = 0 y p = rango del criterio (max-min), igual convención que el notebook
// (`P = list(rangos)`): los umbrales se calculan solos desde la matriz y los números no cambian. Flujo neto phi = phi+ - phi-.
import type { Alternative, Criterion, DecisionMatrix, MatrixType, PrometheeCriterionConfig, PrometheeFn } from './types.ts';
import { describePref, pref3, prefFn, resolvePref, type ResolvedPref } from './prometheeConfig.ts';
import { getCell, getType } from './topsis.ts';

export type PrometheeResult = {
  n: number;
  phi: number[]; // flujo neto, mayor es mejor
  phiPlus: number[];
  phiMinus: number[];
  order: number[];
  /** Detalle intermedio, expuesto para que excel.ts pueda cachear los mismos números que muestran
   * las fórmulas vivas del .xlsx (ver topsis.ts, mismo patrón). */
  weights: number[];
  /** Umbral p efectivo por columna (por defecto, el rango = max-min, o 1 si el rango es 0). */
  p: number[];
  /** Umbral de indiferencia q efectivo por columna (0 salvo en las funciones que lo usan). */
  q: number[];
  /** σ efectivo de la función gaussiana por columna (solo se usa donde fn = 'gaussian'). */
  s: number[];
  /** Función de preferencia efectiva por columna. */
  fn: PrometheeFn[];
  /** Rango (max-min, o 1 si es 0) de cada columna: referencia de los valores por defecto. */
  range: number[];
  /** Resolución completa por columna (valores por defecto aplicados, avisos de validación). */
  prefs: ResolvedPref[];
  g: number[][]; // matriz "dirección beneficio" (=matrix, con las columnas de costo en signo invertido)
  pi: number[][]; // preferencia de i sobre k, pi[i][i] = 0
};

export { pref3, prefFn };

/** `cfg[j]` = función y umbrales del criterio j (columna j de la matriz). Sin `cfg` (o con entradas ausentes) rige lo de siempre:
 * Tipo III (en V) con q = 0 y p = rango de la columna, la misma convención del notebook de referencia (`P = list(rangos)`). */
export function promethee(matrix: number[][], weights: number[], types: MatrixType[], cfg?: (PrometheeCriterionConfig | undefined)[]): PrometheeResult {
  const n = matrix.length;
  const m = weights.length;
  if (n === 0 || m === 0) return { n, phi: [], phiPlus: [], phiMinus: [], order: [], weights: [], p: [], q: [], s: [], fn: [], range: [], prefs: [], g: [], pi: [] };
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const w = weights.map((x) => x / wsum);

  const colOf = (j: number) => matrix.map((row) => row[j]);
  const rangeRaw = Array.from({ length: m }, (_, j) => {
    const col = colOf(j);
    return Math.max(...col) - Math.min(...col);
  });
  const prefs = rangeRaw.map((r, j) => resolvePref(cfg?.[j], r));
  const p = prefs.map((x) => x.p), q = prefs.map((x) => x.q), s = prefs.map((x) => x.s);
  const fn = prefs.map((x) => x.fn), range = prefs.map((x) => x.range);
  // g(x) en la dirección "mayor es mejor" siempre, para tratar beneficio/costo con la misma resta.
  const g = matrix.map((row) => row.map((x, j) => (types[j] === 'min' ? -x : x)));

  const pi = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, k) => {
    if (i === k) return 0;
    let acc = 0;
    for (let j = 0; j < m; j++) acc += w[j] * prefFn(fn[j], g[i][j] - g[k][j], q[j], p[j], s[j]);
    return acc;
  }));

  const phiPlus = pi.map((row) => row.reduce((a, b) => a + b, 0) / Math.max(1, n - 1));
  const phiMinus = Array.from({ length: n }, (_, k) => pi.reduce((a, row) => a + row[k], 0) / Math.max(1, n - 1));
  const phi = phiPlus.map((p1, i) => p1 - phiMinus[i]);
  const order = phi.map((_, i) => i).sort((a, b) => phi[b] - phi[a]);
  return { n, phi, phiPlus, phiMinus, order, weights: w, p, q, s, fn, range, prefs, g, pi };
}

/** Configuración de cada criterio en el orden de `criteria`, leída de `decision_matrix.prometheeConfig` (undefined = lo de siempre). */
export function prometheeCfgFor(criteria: Criterion[], dm: DecisionMatrix): (PrometheeCriterionConfig | undefined)[] {
  return criteria.map((c) => dm.prometheeConfig?.[c.id]);
}

export type PrometheeSynth = {
  rows: { name: string; phi: number; rank: number }[];
  order: number[];
  tie: boolean;
};

export function prometheeSynthesis(criteria: Criterion[], alternatives: Alternative[], dm: DecisionMatrix, weights: number[]): PrometheeSynth {
  const matrix = alternatives.map((a) => criteria.map((c) => getCell(dm, a.id, c.id) ?? 0));
  const types = criteria.map((c) => getType(dm, c.id));
  const res = promethee(matrix, weights, types, prometheeCfgFor(criteria, dm));
  const rows = alternatives.map((a, i) => ({ name: a.name, phi: res.phi[i] ?? 0, rank: 0 }));
  rows.forEach((row) => (row.rank = 1 + rows.filter((o) => o.phi > row.phi + 1e-9).length));
  const phis = rows.map((x) => x.phi);
  return { rows, order: res.order, tie: phis.length < 2 || Math.max(...phis) - Math.min(...phis) < 1e-9 };
}

// ---- Desglose para pantalla e informe (solo lectura: NO cambian ningún resultado de promethee()) ----

/** Matriz de decisión y tipos de criterio tal como los lee `promethee()` (mismo patrón que vikorInputs). Pasar la matriz EFECTIVA. */
export function prometheeInputs(criteria: Criterion[], alternatives: Alternative[], dm: DecisionMatrix): { matrix: number[][]; types: MatrixType[]; cfg: (PrometheeCriterionConfig | undefined)[] } {
  const matrix = alternatives.map((a) => criteria.map((c) => getCell(dm, a.id, c.id) ?? 0));
  const types = criteria.map((c) => getType(dm, c.id));
  return { matrix, types, cfg: prometheeCfgFor(criteria, dm) };
}

/** Un criterio dentro de π(a, b): la ventaja d de a sobre b (en la dirección «mayor es mejor»: beneficio xa − xb; costo xb − xa), la
 * preferencia P(d) con la función del criterio (por defecto Tipo III, q = 0 y p = rango), y su aporte peso × P. La suma de los aportes
 * es π(a, b) (idéntica a promethee().pi). */
export type PreferenceCriterion = { j: number; w: number; xa: number; xb: number; d: number; p: number; q: number; s: number; fn: PrometheeFn; P: number; contrib: number };
export type PreferenceDetail = { a: number; b: number; rows: PreferenceCriterion[]; pi: number };

export function preferenceDetail(matrix: number[][], types: MatrixType[], result: PrometheeResult, a: number, b: number): PreferenceDetail {
  const rows: PreferenceCriterion[] = [];
  let pi = 0;
  for (let j = 0; j < result.weights.length; j++) {
    const xa = matrix[a][j], xb = matrix[b][j];
    const d = result.g[a][j] - result.g[b][j];
    const P = a === b ? 0 : prefFn(result.fn[j], d, result.q[j], result.p[j], result.s[j]);
    const contrib = result.weights[j] * P;
    pi += contrib;
    rows.push({ j, w: result.weights[j], xa, xb, d, p: result.p[j], q: result.q[j], s: result.s[j], fn: result.fn[j], P, contrib });
  }
  return { a, b, rows, pi: a === b ? 0 : pi };
}

/** PROMETHEE I (Brans & Vincke, 1985): ranking PARCIAL con los dos flujos por separado. A precede a B si φ⁺(A) ≥ φ⁺(B) y φ⁻(A) ≤ φ⁻(B) con al
 * menos una desigualdad estricta; son indiferentes si los dos flujos coinciden; en cualquier otro caso son incomparables (un flujo dice
 * una cosa y el otro la contraria). Tolerancia 1e-9 para no inventar incomparabilidades por redondeo. PROMETHEE II (φ = φ⁺ − φ⁻) siempre
 * los ordena; PROMETHEE I puede dejarlos sin relación. */
export type PrometheeIRel = 'self' | 'precedes' | 'preceded' | 'indifferent' | 'incomparable';
export type PrometheeIResult = {
  /** rel[i][k]: relación de i respecto de k desde el punto de vista de la FILA i. */
  rel: PrometheeIRel[][];
  /** Pares (i, k) donde i precede a k. */
  precedes: [number, number][];
  /** Pares i < k sin relación (φ⁺ y φ⁻ dicen cosas contrarias). */
  incomparable: [number, number][];
  /** Pares i < k con los dos flujos iguales. */
  indifferent: [number, number][];
  /** Todos los pares tienen relación: PROMETHEE I da un ranking completo, igual de informativo que PROMETHEE II. */
  complete: boolean;
};

export function prometheeI(phiPlus: number[], phiMinus: number[], eps = 1e-9): PrometheeIResult {
  const n = phiPlus.length;
  const rel: PrometheeIRel[][] = Array.from({ length: n }, () => Array<PrometheeIRel>(n).fill('self'));
  const precedes: [number, number][] = [];
  const incomparable: [number, number][] = [];
  const indifferent: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      if (i === k) continue;
      const plusGe = phiPlus[i] >= phiPlus[k] - eps, plusLe = phiPlus[i] <= phiPlus[k] + eps;
      const minusLe = phiMinus[i] <= phiMinus[k] + eps, minusGe = phiMinus[i] >= phiMinus[k] - eps;
      let r: PrometheeIRel;
      if (plusGe && plusLe && minusLe && minusGe) r = 'indifferent';
      else if (plusGe && minusLe) r = 'precedes';
      else if (plusLe && minusGe) r = 'preceded';
      else r = 'incomparable';
      rel[i][k] = r;
      if (r === 'precedes') precedes.push([i, k]);
      if (i < k && r === 'incomparable') incomparable.push([i, k]);
      if (i < k && r === 'indifferent') indifferent.push([i, k]);
    }
  }
  return { rel, precedes, incomparable, indifferent, complete: incomparable.length === 0 };
}

/** Resumen de la función elegida por criterio, para informes, metodología y comparativa. `custom` = false cuando ningún criterio
 * se apartó de lo de siempre (Tipo III, q = 0, p = rango). Pasar la matriz EFECTIVA (criterios «objetivo» ya convertidos). */
export type PrometheeConfigSummary = { custom: boolean; items: { name: string; fn: PrometheeFn; text: string; custom: boolean }[]; issues: string[] };
export function prometheeConfigSummary(criteria: Criterion[], alternatives: Alternative[], dm: DecisionMatrix): PrometheeConfigSummary {
  const { matrix, types, cfg } = prometheeInputs(criteria, alternatives, dm);
  const res = promethee(matrix, criteria.map(() => 1), types, cfg);
  const items = criteria.map((c, j) => {
    const r = res.prefs[j];
    return { name: c.name, fn: r.fn, text: describePref(r), custom: r.custom };
  });
  return { custom: items.some((x) => x.custom), items, issues: res.prefs.flatMap((r, j) => r.issues.map((t) => `${criteria[j].name}: ${t}`)) };
}
