// Orden agregado cuando los métodos discrepan: Borda y Copeland sobre los rankings que la Comparativa ya calcula.
// Funciones puras: NO recalculan ningún método, solo combinan los puestos que cada uno ya dio.
//
// ELECTRE no entra: no produce ranking (ver electre.ts), solo una relación de superación con incomparables.
//
// Empates DENTRO de un método (puestos de competición 1, 2, 2, 4): se usan puestos promedio (1, 2.5, 2.5, 4), el tratamiento estándar
// de Borda/Spearman con empates. En Copeland, si un método empata a i y j, ese método se abstiene en ese par.
// Empates en el orden AGREGADO: comparten puesto (1, 2, 2, 4) y se declaran; nunca se desempata en silencio.
import { midRanks } from './rankCompare.ts';

/** Mismo contrato que `RankedMethod` de rankCompare: `ranks[i]` = puesto (1 = mejor) de la alternativa i. */
export type AggMethod = { key: string; label: string; ranks: number[] };
export type AggRule = 'borda' | 'copeland';

export type AggRow = {
  /** Índice de la alternativa en el orden de entrada. */
  index: number;
  name: string;
  /** Borda: Σ (n − puesto promedio) sobre los métodos. Copeland: victorias − derrotas por mayoría de métodos. */
  score: number;
  /** Puesto agregado (1 = mejor; los empates comparten puesto). */
  rank: number;
  /** ¿Comparte puesto con otra alternativa? */
  tied: boolean;
};

export type AggResult = {
  rule: AggRule;
  /** Alternativas ordenadas de mejor a peor (los empates conservan el orden de entrada). */
  rows: AggRow[];
  /** Nombres en 1.er lugar (más de uno = empate en la cima). */
  winners: string[];
  hasTie: boolean;
  methodCount: number;
  /** Alternativa que vence por mayoría a todas las demás (ganador de Condorcet), o null si no existe. */
  condorcetWinner: string | null;
  /** ¿La relación de mayoría tiene un ciclo (paradoja de Condorcet: A gana a B, B a C y C a A)? */
  cycle: boolean;
  /** wins[i][j] = nº de métodos que ponen a i estrictamente por encima de j. */
  wins: number[][];
};

/** Matriz de preferencias por pares: wins[i][j] = métodos con puesto(i) < puesto(j). Los métodos que empatan i y j no suman a ninguno. */
export function pairwiseWins(methods: AggMethod[], n: number): number[][] {
  const wins = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
  for (const m of methods) {
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && m.ranks[i] < m.ranks[j]) wins[i][j]++;
  }
  return wins;
}

/** Ordena por puntaje (mayor = mejor) con puestos de competición; los empates conservan el orden de entrada. */
function rankScores(names: string[], scores: number[]): AggRow[] {
  const EPS = 1e-9;
  const rows = scores.map((score, index) => ({
    index, name: names[index], score,
    rank: 1 + scores.filter((o) => o > score + EPS).length,
    tied: scores.filter((o) => Math.abs(o - score) <= EPS).length > 1,
  }));
  return rows.sort((a, b) => a.rank - b.rank || a.index - b.index);
}

/** Cierre transitivo de la relación «i vence por mayoría a j» (Floyd–Warshall) para detectar ciclos. */
function majorityCycle(beats: boolean[][]): boolean {
  const n = beats.length;
  const reach = beats.map((r) => [...r]);
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) if (reach[i][k]) for (let j = 0; j < n; j++) if (reach[k][j]) reach[i][j] = true;
  return reach.some((r, i) => r[i]);
}

/**
 * Agrega los rankings con Borda o Copeland. Necesita ≥ 2 métodos y ≥ 2 alternativas, y todos los `ranks` del mismo largo; si no, null
 * (no se inventa un orden con un solo método).
 */
export function aggregateRanking(names: string[], methods: AggMethod[], rule: AggRule = 'borda'): AggResult | null {
  const n = names.length;
  if (n < 2 || methods.length < 2 || methods.some((m) => m.ranks.length !== n)) return null;
  const wins = pairwiseWins(methods, n);
  // mayoría estricta: i vence a j si más métodos prefieren i que j
  const beats = wins.map((row, i) => row.map((w, j) => i !== j && w > wins[j][i]));
  let scores: number[];
  if (rule === 'borda') {
    scores = Array.from({ length: n }, () => 0);
    for (const m of methods) midRanks(m.ranks).forEach((r, i) => { scores[i] += n - r; });
  } else {
    scores = names.map((_, i) => {
      let s = 0;
      for (let j = 0; j < n; j++) if (j !== i) s += beats[i][j] ? 1 : beats[j][i] ? -1 : 0;
      return s;
    });
  }
  const rows = rankScores(names, scores);
  const condorcet = names.findIndex((_, i) => names.every((__, j) => j === i || beats[i][j]));
  return {
    rule, rows,
    winners: rows.filter((r) => r.rank === 1).map((r) => r.name),
    hasTie: rows.some((r) => r.tied),
    methodCount: methods.length,
    condorcetWinner: condorcet >= 0 ? names[condorcet] : null,
    cycle: majorityCycle(beats),
    wins,
  };
}

/** La regla, en una frase, con los números reales (se muestra junto al resultado). */
export function describeAggregationRule(rule: AggRule, n: number, methodCount: number): string {
  if (rule === 'borda') {
    return `Borda: cada método reparte ${n - 1} puntos a la mejor alternativa, ${n - 2 >= 0 ? n - 2 : 0} a la siguiente y así hasta 0 a la última (los empates reparten el promedio); `
      + `gana la que más puntos suma entre los ${methodCount} métodos (máximo ${(n - 1) * methodCount}).`;
  }
  return `Copeland: se compara cada par de alternativas y gana la que más métodos ponen por encima (de ${methodCount}); `
    + 'el puntaje es victorias menos derrotas en esos duelos (máximo ' + (n - 1) + ').';
}
