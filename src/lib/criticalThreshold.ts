// Umbral crítico de cada peso (Triantaphyllou y Sánchez, 1997): ¿cuánto tiene que cambiar el peso de UN criterio, con los demás
// reescalados proporcionalmente para que todo siga sumando 1, para que cambie el primer puesto?
//
// No reimplementa ningún método: usa el barrido con bisección de `analyzeSensitivity` (lib/sensitivity.ts) sobre la misma `RankFn`
// que el simulador «what-if», así que sirve igual para TOPSIS, VIKOR, PROMETHEE, SAW, Fuzzy TOPSIS y AHP. ELECTRE no da ranking: no aplica.
import { analyzeSensitivity, redistribute, type RankFn } from './sensitivity.ts';

export type WeightThreshold = {
  /** Sentido del cambio mínimo: el peso baja o sube desde su valor base. */
  direction: 'down' | 'up';
  /** Valor del peso justo donde el 1.er lugar deja de ser el base. */
  weight: number;
  /** |peso en el quiebre − peso base|, en puntos de peso (0 a 1). */
  absChange: number;
  /** absChange / peso base: la «variación relativa» de Triantaphyllou y Sánchez (0.25 = el peso cambia un 25 %). */
  relChange: number;
  /** Quién pasa a ganar justo después del quiebre (más de uno = empate). */
  newWinners: string[];
};

export type CriterionThreshold = {
  criterion: number;
  name: string;
  baseWeight: number;
  /** El cambio MÍNIMO (en variación relativa) que altera el 1.er puesto, en cualquiera de los dos sentidos; null = robusto en [0, 1]. */
  threshold: WeightThreshold | null;
  /** Variación relativa del peso hasta 0 y hasta 1 sin que cambie el primero (para decir «no cambia dentro de [0, 1]»). */
  down: WeightThreshold | null;
  up: WeightThreshold | null;
};

export type CriticalThresholds = {
  baseWinners: string[];
  /** Hay ganador único con los pesos base; si no, no hay «primer puesto» cuya estabilidad medir. */
  hasWinner: boolean;
  /** Del criterio más crítico (menor variación relativa) al más robusto; los robustos al final en su orden original. */
  rows: CriterionThreshold[];
  /** true = ningún peso, movido en todo [0, 1], cambia el primer puesto. */
  robust: boolean;
};

/** Umbrales críticos de cada peso para el ranking que da `rankFn` con los pesos `baseWeights` (que suman 1; se normalizan). */
export function criticalThresholds(rankFn: RankFn, criteriaNames: string[], baseWeights: number[]): CriticalThresholds {
  const res = analyzeSensitivity(rankFn, criteriaNames, baseWeights);
  // Quién gana JUSTO después del quiebre. Se vuelve a sondear aquí: si el quiebre cae exactamente en un punto de la rejilla del barrido,
  // el valor que devuelve analyzeSensitivity es el del empate exacto (dos ganadores) en vez del de quien gana al cruzarlo.
  const winnersBeyond = (j: number, direction: 'down' | 'up', weight: number): string[] => {
    const probe = Math.max(0, Math.min(1, weight + (direction === 'down' ? -1 : 1) * 1e-4));
    return rankFn(redistribute(res.baseWeights, j, probe)).filter((r) => r.rank === 1).map((r) => r.name);
  };
  const mk = (j: number, direction: 'down' | 'up', base: number, flip: { weight: number; newWinners: string[] } | null): WeightThreshold | null => {
    if (!flip) return null;
    const beyond = winnersBeyond(j, direction, flip.weight);
    flip = { weight: flip.weight, newWinners: beyond.length && beyond.join() !== res.baseWinners.join() ? beyond : flip.newWinners };
    const absChange = Math.abs(flip.weight - base);
    return { direction, weight: flip.weight, absChange, relChange: base > 1e-12 ? absChange / base : Infinity, newWinners: flip.newWinners };
  };
  const rows = res.critical.map((c): CriterionThreshold => {
    const down = mk(c.criterion, 'down', c.baseWeight, c.down);
    const up = mk(c.criterion, 'up', c.baseWeight, c.up);
    const cands = [down, up].filter((x): x is WeightThreshold => x != null);
    const threshold = cands.length ? cands.reduce((a, b) => (b.relChange < a.relChange ? b : a)) : null;
    return { criterion: c.criterion, name: c.name, baseWeight: c.baseWeight, threshold, down, up };
  });
  const sorted = [...rows].sort((a, b) => {
    if (a.threshold && b.threshold) return a.threshold.relChange - b.threshold.relChange || a.criterion - b.criterion;
    if (a.threshold) return -1;
    if (b.threshold) return 1;
    return a.criterion - b.criterion;
  });
  return { baseWinners: res.baseWinners, hasWinner: res.hasWinner, rows: sorted, robust: rows.every((r) => !r.threshold) };
}
