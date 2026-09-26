// Desglose numérico de TOPSIS para «paso a paso» (Resultados) y el apéndice de cálculo del informe ejecutivo. NO recalcula con otra
// fórmula: llama a `topsis()` y `resolveTargets()` (topsis.ts), y solo deriva lo que esa función no expone (matriz normalizada r,
// diferencias por criterio para D⁺/D⁻, ranking, datos de la dispersión 2D). Sesión 3 del curso, diapositivas 9-18 y 43-46.
import type { Alternative, Criterion, DecisionMatrix, MatrixKind, MatrixType, TargetSpec } from './types.ts';
import { getCell, getKind, getTarget, resolveTargets, topsis, type TopsisResult } from './topsis.ts';

export type TopsisBdCriterion = {
  id: string;
  name: string;
  unit: string;
  /** tipo declarado por quien decide (beneficio, costo u objetivo) */
  kind: MatrixKind;
  /** tipo efectivo que ve TOPSIS: 'target' cuenta como costo (su valor pasa a ser la distancia al objetivo) */
  type: MatrixType;
  target: TargetSpec | null;
  /** true si es 'objetivo': la matriz efectiva trae la distancia al objetivo y no el valor ingresado */
  isDistance: boolean;
  weight: number;
};

export type TopsisBreakdown = {
  criteria: TopsisBdCriterion[];
  alts: { id: string; name: string }[];
  /** valores tal cual se ingresaron (null = celda vacía; TOPSIS la cuenta como 0) */
  raw: (number | null)[][];
  /** matriz efectiva x_ij (criterios objetivo ya convertidos en distancia; vacías = 0), la que entra a topsis() */
  eff: number[][];
  /** resultado de topsis(): pesos renormalizados, normas, matriz ponderada v, A⁺ y A⁻, D⁺, D⁻, C, orden */
  res: TopsisResult;
  /** matriz normalizada r_ij = x_ij / ‖x_j‖ (antes de ponderar) */
  r: number[][];
  /** |v_ij − A⁺_j| y |v_ij − A⁻_j|: lo que se eleva al cuadrado dentro de la raíz de D⁺ y D⁻ */
  diffPlus: number[][];
  diffMinus: number[][];
  /** posición 1..n (empates comparten posición, igual que topsisSynthesis) */
  rank: number[];
  /** todas las alternativas empatan (sin datos que distingan) */
  tie: boolean;
  /** hay al menos una celda vacía (se cuenta como 0, igual que en toda la plataforma) */
  hasEmpty: boolean;
};

const TIE = 1e-9;

export function topsisBreakdown(criteria: Criterion[], alternatives: Alternative[], dmRaw: DecisionMatrix, weights: number[]): TopsisBreakdown {
  const dm = resolveTargets(criteria, alternatives, dmRaw);
  const raw = alternatives.map((a) => criteria.map((c) => getCell(dmRaw, a.id, c.id)));
  const eff = alternatives.map((a) => criteria.map((c) => getCell(dm, a.id, c.id) ?? 0));
  const types: MatrixType[] = criteria.map((c) => (getKind(dmRaw, c.id) === 'max' ? 'max' : 'min'));
  const res = topsis(eff, weights, types);
  const r = eff.map((row) => row.map((x, j) => x / (res.norms[j] ?? 1)));
  const diffPlus = res.v.map((row) => row.map((x, j) => Math.abs(x - res.best[j])));
  const diffMinus = res.v.map((row) => row.map((x, j) => Math.abs(x - res.worst[j])));
  const c = res.closeness;
  const rank = c.map((ci) => 1 + c.filter((o) => o > ci + TIE).length);
  const tie = c.length < 2 || Math.max(...c) - Math.min(...c) < TIE;
  return {
    criteria: criteria.map((cr, j) => {
      const kind = getKind(dmRaw, cr.id);
      return { id: cr.id, name: cr.name, unit: cr.unit?.trim() ?? '', kind, type: types[j], target: kind === 'target' ? getTarget(dmRaw, cr.id) : null, isDistance: kind === 'target', weight: res.weights[j] ?? 0 };
    }),
    alts: alternatives.map((a) => ({ id: a.id, name: a.name })),
    raw, eff, res, r, diffPlus, diffMinus, rank, tie,
    hasEmpty: raw.some((row) => row.some((x) => x == null)),
  };
}

/** Índice del criterio que más aleja a la alternativa i del ideal (mayor |v − A⁺|), con su parte del D⁺² (0 a 1). */
export function topsisMainGap(bd: TopsisBreakdown, i: number): { j: number; share: number } | null {
  const sq = bd.diffPlus[i]?.map((d) => d * d) ?? [];
  const tot = sq.reduce((a, b) => a + b, 0);
  if (!sq.length || tot <= 0) return null;
  let j = 0;
  sq.forEach((x, k) => { if (x > sq[j] + 1e-12) j = k; });
  return { j, share: sq[j] / tot };
}

/** Datos de la dispersión 2D: alternativas, A⁺ y A⁻ proyectados en dos criterios (por defecto, los de mayor peso). Es solo una
 * proyección: el ranking real usa TODOS los criterios (diapositivas 17 y 46). */
export type TopsisScatterData = {
  jx: number; jy: number; nCriteria: number;
  xName: string; yName: string;
  points: { name: string; x: number; y: number; rank: number; c: number }[];
  ideal: { x: number; y: number };
  anti: { x: number; y: number };
};

export function topsisScatterData(bd: TopsisBreakdown, jx?: number, jy?: number): TopsisScatterData | null {
  const m = bd.criteria.length;
  if (m < 2 || bd.alts.length === 0) return null;
  const byW = bd.criteria.map((_, j) => j).sort((a, b) => bd.criteria[b].weight - bd.criteria[a].weight || a - b);
  const a = jx ?? byW[0], b = jy ?? byW[1];
  return {
    jx: a, jy: b, nCriteria: m,
    xName: bd.criteria[a].name, yName: bd.criteria[b].name,
    points: bd.alts.map((al, i) => ({ name: al.name, x: bd.res.v[i][a], y: bd.res.v[i][b], rank: bd.rank[i], c: bd.res.closeness[i] })),
    ideal: { x: bd.res.best[a], y: bd.res.best[b] },
    anti: { x: bd.res.worst[a], y: bd.res.worst[b] },
  };
}
