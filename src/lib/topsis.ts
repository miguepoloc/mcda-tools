// Cálculo TOPSIS (misma matemática que pyDecision.topsis_method, ver 02_topsis_iot_palmor.ipynb
// del curso): normalización vectorial -> ponderar -> ideal mejor/peor por columna -> distancia
// euclidiana -> cercanía relativa. Recibe los pesos YA calculados (típicamente de la hoja Criterios
// de AHP, ver ahp.ts) en vez de derivarlos: es la diferencia de fondo con AHP que motiva que esto
// viva en un módulo aparte, no una variante de ahp.ts.
import type { Alternative, Criterion, DecisionMatrix, MatrixKind, MatrixType, TargetSpec } from './types.ts';

export type { DecisionMatrix, MatrixKind, MatrixType, TargetSpec };

export const blankMatrix = (): DecisionMatrix => ({ values: {}, types: {} });

export function normalizeMatrix(x: unknown): DecisionMatrix {
  const b = blankMatrix();
  if (!x || typeof x !== 'object') return b;
  const s = x as Partial<DecisionMatrix>;
  const out: DecisionMatrix = {
    values: s.values && typeof s.values === 'object' ? s.values : b.values,
    types: s.types && typeof s.types === 'object' ? s.types : b.types,
  };
  // v de VIKOR: se conserva solo si es un número válido en [0, 1] (si no, se ignora y rige el 0.5 por defecto)
  if (s.targets && typeof s.targets === 'object') {
    const t: Record<string, TargetSpec> = {};
    for (const [id, spec] of Object.entries(s.targets)) {
      const v = (spec as Partial<TargetSpec> | null)?.value, tol = (spec as Partial<TargetSpec> | null)?.tol;
      if (typeof v === 'number' && Number.isFinite(v)) t[id] = { value: v, tol: typeof tol === 'number' && Number.isFinite(tol) && tol >= 0 ? tol : 0 };
    }
    if (Object.keys(t).length) out.targets = t;
  }
  if (typeof s.vikorV === 'number' && Number.isFinite(s.vikorV) && s.vikorV >= 0 && s.vikorV <= 1) out.vikorV = s.vikorV;
  // c*/d* de ELECTRE: mismo criterio de validación que vikorV (número finito en [0, 1], si no se ignora).
  if (typeof s.electreCStar === 'number' && Number.isFinite(s.electreCStar) && s.electreCStar >= 0 && s.electreCStar <= 1) out.electreCStar = s.electreCStar;
  if (typeof s.electreDStar === 'number' && Number.isFinite(s.electreDStar) && s.electreDStar >= 0 && s.electreDStar <= 1) out.electreDStar = s.electreDStar;
  return out;
}

export function getCell(dm: DecisionMatrix, altId: string, critId: string): number | null {
  const v = dm.values[altId]?.[critId];
  return typeof v === 'number' ? v : null;
}

export function setCell(dm: DecisionMatrix, altId: string, critId: string, value: number | null): DecisionMatrix {
  const row = { ...dm.values[altId] };
  if (value == null || Number.isNaN(value)) delete row[critId];
  else row[critId] = value;
  return { ...dm, values: { ...dm.values, [altId]: row } };
}

/** Tipo que ven los métodos. 'target' cuenta como 'min' (su distancia al objetivo es un costo), pero eso solo
 * es correcto sobre una matriz ya resuelta con `resolveTargets`; sobre valores crudos no tiene sentido. */
export function getType(dm: DecisionMatrix, critId: string): MatrixType {
  return dm.types[critId] === 'min' || dm.types[critId] === 'target' ? 'min' : 'max';
}

/** Tipo declarado por el usuario, incluido 'target'. */
export function getKind(dm: DecisionMatrix, critId: string): MatrixKind {
  const k = dm.types[critId];
  return k === 'min' || k === 'target' ? k : 'max';
}

/** Objetivo guardado de un criterio 'target', o null si falta o no es válido. */
export function getTarget(dm: DecisionMatrix, critId: string): TargetSpec | null {
  const t = dm.targets?.[critId];
  return t && Number.isFinite(t.value) ? { value: t.value, tol: Number.isFinite(t.tol) && t.tol >= 0 ? t.tol : 0 } : null;
}

export function setTarget(dm: DecisionMatrix, critId: string, spec: TargetSpec): DecisionMatrix {
  return { ...dm, targets: { ...dm.targets, [critId]: spec } };
}

/** Distancia de x al objetivo value ± tol: 0 dentro de la banda, distancia al borde más cercano fuera de ella. */
export function targetDistance(x: number, value: number, tol: number): number {
  return Math.max(0, Math.abs(x - value) - tol);
}

/** Nombres de los criterios 'target' a los que todavía les falta el valor objetivo. */
export function missingTargets(criteria: Criterion[], dm: DecisionMatrix): string[] {
  return criteria.filter((c) => dm.types[c.id] === 'target' && !getTarget(dm, c.id)).map((c) => c.name);
}

/** Devuelve una matriz "efectiva" donde cada criterio 'target' se reemplaza por su distancia al objetivo y se
 * marca como 'min' (costo). Todos los métodos (TOPSIS/VIKOR/PROMETHEE/ELECTRE/SAW y los pesos CRITIC/Entropía)
 * leen esa matriz, así que no necesitan saber que existe el tipo objetivo. Un criterio 'target' sin objetivo
 * válido queda con distancia 0 en todas las alternativas (neutro) hasta que se llene. Las celdas vacías y las
 * etiquetas lingüísticas (Fuzzy TOPSIS) no se tocan. Si no hay criterios 'target', devuelve `dm` tal cual. */
export function resolveTargets(criteria: Criterion[], alternatives: Alternative[], dm: DecisionMatrix): DecisionMatrix {
  const tc = criteria.filter((c) => dm.types[c.id] === 'target');
  if (!tc.length) return dm;
  const values: DecisionMatrix['values'] = { ...dm.values };
  for (const a of alternatives) {
    const row = { ...(values[a.id] ?? {}) };
    for (const c of tc) {
      const x = row[c.id], t = getTarget(dm, c.id);
      if (typeof x === 'number') row[c.id] = t ? targetDistance(x, t.value, t.tol) : 0;
    }
    values[a.id] = row;
  }
  const types = { ...dm.types };
  for (const c of tc) types[c.id] = 'min';
  const { targets: _omit, ...rest } = dm;
  void _omit;
  return { ...rest, values, types };
}

export function setType(dm: DecisionMatrix, critId: string, type: MatrixKind): DecisionMatrix {
  return { ...dm, types: { ...dm.types, [critId]: type } };
}

export function answeredCells(criteria: Criterion[], alternatives: Alternative[], dm: DecisionMatrix): number {
  let n = 0;
  for (const a of alternatives) for (const c of criteria) if (getCell(dm, a.id, c.id) != null) n++;
  return n;
}

export type TopsisResult = {
  n: number;
  closeness: number[]; // C_i, mismo orden que `alternatives`
  distPlus: number[];
  distMinus: number[];
  order: number[]; // índices de `alternatives` ordenados de mejor a peor
  /** Detalle intermedio (pesos renormalizados, normas, matriz ponderada-normalizada e ideales),
   * expuesto para que excel.ts pueda cachear los mismos números que muestran las fórmulas vivas
   * del .xlsx sin reimplementar la matemática. */
  weights: number[];
  norms: number[]; // uno por columna
  v: number[][]; // matriz ponderada-normalizada, mismas filas/columnas que `matrix`
  best: number[]; // A+ por columna
  worst: number[]; // A- por columna
};

/** matrix: filas = alternativas, columnas = criterios, valores reales (no juicios de Saaty).
 * weights: uno por columna, ya normalizado o no (se re-normaliza internamente por si acaso).
 * types: 'max' (beneficio, más es mejor) o 'min' (costo, menos es mejor) por columna. */
export function topsis(matrix: number[][], weights: number[], types: MatrixType[]): TopsisResult {
  const n = matrix.length;
  const m = weights.length;
  if (n === 0 || m === 0) {
    return { n, closeness: [], distPlus: [], distMinus: [], order: [], weights: [], norms: [], v: [], best: [], worst: [] };
  }
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const w = weights.map((x) => x / wsum);

  const norms = Array.from({ length: m }, (_, j) => {
    const s = Math.sqrt(matrix.reduce((a, row) => a + row[j] * row[j], 0));
    return s || 1;
  });
  const v = matrix.map((row) => row.map((x, j) => (x / norms[j]) * w[j]));

  const colOf = (j: number) => v.map((row) => row[j]);
  const best = Array.from({ length: m }, (_, j) => {
    const col = colOf(j);
    return types[j] === 'min' ? Math.min(...col) : Math.max(...col);
  });
  const worst = Array.from({ length: m }, (_, j) => {
    const col = colOf(j);
    return types[j] === 'min' ? Math.max(...col) : Math.min(...col);
  });

  const distPlus = v.map((row) => Math.sqrt(row.reduce((a, x, j) => a + (x - best[j]) ** 2, 0)));
  const distMinus = v.map((row) => Math.sqrt(row.reduce((a, x, j) => a + (x - worst[j]) ** 2, 0)));
  const closeness = distPlus.map((dp, i) => {
    const tot = dp + distMinus[i];
    return tot === 0 ? 0 : distMinus[i] / tot;
  });
  const order = closeness.map((_, i) => i).sort((a, b) => closeness[b] - closeness[a]);
  return { n, closeness, distPlus, distMinus, order, weights: w, norms, v, best, worst };
}

export type TopsisSynth = {
  rows: { name: string; c: number; rank: number }[];
  order: number[];
  tie: boolean;
};

/** Arma la matriz/tipos desde criteria+alternatives+DecisionMatrix (celdas sin llenar cuentan como
 * 0, igual que un juicio de AHP sin llenar cuenta como "igual") y corre topsis(). */
export function topsisSynthesis(criteria: Criterion[], alternatives: Alternative[], dm: DecisionMatrix, weights: number[]): TopsisSynth {
  const matrix = alternatives.map((a) => criteria.map((c) => getCell(dm, a.id, c.id) ?? 0));
  const types = criteria.map((c) => getType(dm, c.id));
  const r = topsis(matrix, weights, types);
  const rows = alternatives.map((a, i) => ({ name: a.name, c: r.closeness[i] ?? 0, rank: 0 }));
  rows.forEach((row) => (row.rank = 1 + rows.filter((o) => o.c > row.c + 1e-9).length));
  const cs = rows.map((x) => x.c);
  return { rows, order: r.order, tie: cs.length < 2 || Math.max(...cs) - Math.min(...cs) < 1e-9 };
}
