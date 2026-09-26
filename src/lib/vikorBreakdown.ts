// Desglose numérico de VIKOR para «paso a paso» (Resultados) y el apéndice del informe. No recalcula con otra fórmula: llama a
// `vikor()`, `vikorVerdict()`, `vikorSensitivity()` y `vikorFirstPlaceChanges()` (vikor.ts) y solo deriva lo que esas funciones no
// exponen (qué criterio fija R, porcentaje, partes normalizadas de Q, conjunto de compromiso con números, tramos de v).
// Sesión 3 del curso, diapositivas 19-30 y 47-52.
import type { Alternative, Criterion, DecisionMatrix, MatrixType } from './types.ts';
import { getCell, getKind, getTarget, resolveTargets } from './topsis.ts';
import { vikor, vikorFirstPlaceChanges, vikorSensitivity, vikorVerdict, type VikorResult, type VikorSensRow, type VikorVerdict } from './vikor.ts';

/** Cita del parámetro v tal como la usa el curso (diapositivas 24-25). El título completo no está verificado en el repo. */
export const VIKOR_V_SOURCE = 'Alidrisi, H. (2021). Journal of Risk and Financial Management, 14(6), 271';

const TIE = 1e-9;
export const sameV = (a: number, b: number) => Math.abs(a - b) < 1e-6;

export type VikorBdCriterion = {
  id: string; name: string; unit: string; kind: ReturnType<typeof getKind>; type: MatrixType;
  target: { value: number; tol: number } | null; isDistance: boolean; weight: number;
};

export type VikorBreakdown = {
  criteria: VikorBdCriterion[];
  alts: { id: string; name: string }[];
  raw: (number | null)[][];
  /** matriz efectiva (criterios objetivo ya convertidos en distancia) */
  eff: number[][];
  types: MatrixType[];
  res: VikorResult;
  v: number;
  /** partes normalizadas de Q: (S−S*)/(S⁻−S*) y (R−R*)/(R⁻−R*) */
  sPart: number[];
  rPart: number[];
  sMin: number; sMax: number; rMin: number; rMax: number;
  /** por alternativa: criterios que fijan R (el máximo del aporte; normalmente 1, varios si empatan) y su parte de S */
  rCrit: number[][];
  rShare: number[];
  /** posición por Q, por S y por R (1 = mejor; empates comparten posición) */
  rankQ: number[]; rankS: number[]; rankR: number[];
  verdict: VikorVerdict | null;
  tie: boolean;
  /** Q(i) − Q(1º) por alternativa y si entra al conjunto de compromiso (solo con veredicto) */
  gap: number[];
  inSet: boolean[];
  /** hay al menos una celda vacía (se cuenta como 0) */
  hasEmpty: boolean;
};

const rankOf = (xs: number[]) => xs.map((x) => 1 + xs.filter((o) => o < x - TIE).length);

export function vikorBreakdown(criteria: Criterion[], alternatives: Alternative[], dmRaw: DecisionMatrix, weights: number[], v: number): VikorBreakdown {
  const dm = resolveTargets(criteria, alternatives, dmRaw);
  const raw = alternatives.map((a) => criteria.map((c) => getCell(dmRaw, a.id, c.id)));
  const eff = alternatives.map((a) => criteria.map((c) => getCell(dm, a.id, c.id) ?? 0));
  const types: MatrixType[] = criteria.map((c) => (getKind(dmRaw, c.id) === 'max' ? 'max' : 'min'));
  const res = vikor(eff, weights, types, v);
  const sMin = Math.min(...res.s), sMax = Math.max(...res.s), rMin = Math.min(...res.r), rMax = Math.max(...res.r);
  const sPart = res.s.map((s) => (sMax - sMin === 0 ? 0 : (s - sMin) / (sMax - sMin)));
  const rPart = res.r.map((r) => (rMax - rMin === 0 ? 0 : (r - rMin) / (rMax - rMin)));
  const rCrit = res.contrib.map((row, i) => row.map((x, j) => (x >= res.r[i] - TIE ? j : -1)).filter((j) => j >= 0));
  const rShare = res.contrib.map((_, i) => (res.s[i] > 0 ? res.r[i] / res.s[i] : 0));
  const qs = res.q;
  const tie = qs.length < 2 || Math.max(...qs) - Math.min(...qs) < TIE;
  const verdict = tie ? null : vikorVerdict(res);
  const q1 = res.order.length ? qs[res.order[0]] : 0;
  const gap = qs.map((q) => q - q1);
  const inSet = qs.map((_, i) => !!verdict && verdict.set.includes(i));
  return {
    criteria: criteria.map((cr, j) => {
      const kind = getKind(dmRaw, cr.id);
      return { id: cr.id, name: cr.name, unit: cr.unit?.trim() ?? '', kind, type: types[j], target: kind === 'target' ? getTarget(dmRaw, cr.id) : null, isDistance: kind === 'target', weight: res.weights[j] ?? 0 };
    }),
    alts: alternatives.map((a) => ({ id: a.id, name: a.name })),
    raw, eff, types, res, v, sPart, rPart, sMin, sMax, rMin, rMax, rCrit, rShare,
    rankQ: rankOf(res.q), rankS: rankOf(res.s), rankR: rankOf(res.r),
    verdict, tie, gap, inSet,
    hasEmpty: raw.some((row) => row.some((x) => x == null)),
  };
}

/** Q, ranking y veredicto para v = 0, 0.25, 0.5, 0.75, 1, el v actual y cada v donde cambia el 1er lugar (los «cruces»). Es la
 * lógica que antes vivía dentro de VikorPanel; ahora la comparten el panel, el desglose y el informe. */
export type VikorSensView = {
  vs: number[];
  rows: VikorSensRow[];
  breaks: { v: number; from: number; to: number }[];
  /** Q en v = 0 y v = 1 (Q es una recta en v: con 2 puntos alcanza para dibujarla) */
  ends: VikorSensRow[];
  /** tramos de v en que gana cada alternativa: gana `winner` con v entre `from` y `to` */
  regimes: { from: number; to: number; winner: number }[];
};

export function vikorSensView(matrix: number[][], weights: number[], types: MatrixType[], v: number, tie = false): VikorSensView {
  const breaks = tie ? [] : vikorFirstPlaceChanges(matrix, weights, types);
  const all = [0, 0.25, 0.5, 0.75, 1, v, ...breaks.map((b) => b.v)].sort((a, b) => a - b);
  const vs = all.filter((x, i) => i === 0 || !sameV(x, all[i - 1]));
  const rows = vikorSensitivity(matrix, weights, types, vs);
  const ends = vikorSensitivity(matrix, weights, types, [0, 1]);
  const regimes = tie || matrix.length === 0 ? [] : vikorRegimesFromEnds(ends[0].q, ends[1].q).regimes;
  return { vs, rows, breaks, ends, regimes };
}

/** Frases de lectura por tramos de v («gana X si v < 0.40; Y si v > 0.40»), a partir de `regimes`. */
export function vikorRegimeText(view: Pick<VikorSensView, 'regimes' | 'breaks'>, names: string[]): string {
  const f = (x: number) => x.toFixed(2);
  const rs = view.regimes;
  if (rs.length === 0) return '';
  if (rs.length === 1) return `${names[rs[0].winner]} gana con cualquier v entre 0 y 1.`;
  const parts = rs.map((r, k) => {
    if (k === 0) return `${names[r.winner]} gana si v < ${f(r.to)}`;
    if (k === rs.length - 1) return `${names[r.winner]} gana si v > ${f(r.from)}`;
    return `${names[r.winner]} gana si ${f(r.from)} < v < ${f(r.to)}`;
  });
  const ties = view.breaks.map((b) => `con v = ${f(b.v)} empatan ${names[b.from]} y ${names[b.to]}`);
  return parts.join('; ') + '; ' + ties.join('; ') + '.';
}

/** Tramos de v en que gana cada alternativa, calculados solo con Q en v = 0 y en v = 1 (Q es una recta en v). Sirve a las gráficas,
 * que reciben únicamente esos dos extremos. Coincide con `vikorFirstPlaceChanges` (lo verifica check-breakdown-s3.ts). */
export function vikorRegimesFromEnds(q0: number[], q1: number[]): { regimes: { from: number; to: number; winner: number }[]; breaks: { v: number; from: number; to: number }[] } {
  const n = q0.length;
  if (n === 0) return { regimes: [], breaks: [] };
  const line = (i: number, v: number) => q0[i] + (q1[i] - q0[i]) * v;
  const cuts = new Set<number>([0, 1]);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const den = (q1[i] - q0[i]) - (q1[j] - q0[j]);
      if (Math.abs(den) < TIE) continue;
      const v = (q0[j] - q0[i]) / den;
      if (v > TIE && v < 1 - TIE) cuts.add(Math.round(v * 1e9) / 1e9);
    }
  }
  const pts = [...cuts].sort((a, b) => a - b);
  const winnerAt = (v: number) => { let b = 0; for (let i = 1; i < n; i++) if (line(i, v) < line(b, v) - TIE) b = i; return b; };
  const regimes: { from: number; to: number; winner: number }[] = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const w = winnerAt((pts[k] + pts[k + 1]) / 2);
    const last = regimes[regimes.length - 1];
    if (last && last.winner === w) last.to = pts[k + 1];
    else regimes.push({ from: pts[k], to: pts[k + 1], winner: w });
  }
  const breaks = regimes.slice(1).map((r, k) => ({ v: r.from, from: regimes[k].winner, to: r.winner }));
  return { regimes, breaks };
}
