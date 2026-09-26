// Análisis de sensibilidad FIJO (el que va impreso en el informe), no interactivo: ¿qué tan firme es el ganador si los pesos cambian?
// Es la versión reproducible de lo que hace SensitivitySimulator con los sliders y lo que pide la plantilla del informe comparativo
// (§5.4: «sube y baja el peso reescalando los demás proporcionalmente; reporta el punto de quiebre o di que no cambia»).
//
// Regla de reparto de pesos (la MISMA del simulador): al fijar el peso de un criterio en t, los demás se reescalan proporcionalmente
// para que todo siga sumando 1 (`redistribute`). Todos los métodos re-normalizan internamente, así que basta con pasar pesos que sumen 1.
//
// Los números salen de las MISMAS funciones de método que usan Resultados y el simulador (`*Synthesis`); aquí no se reimplementa ninguna fórmula.
// ELECTRE no produce ranking (ver electre.ts): NO se le inventa uno. Su sensibilidad se mide sobre c*/d* (nº de relaciones, incomparables, núcleo).
import type { Alternative, Criterion, DecisionMatrix, Method } from './types.ts';
import { resolveTargets, topsisSynthesis } from './topsis.ts';
import { sawSynthesis } from './saw.ts';
import { vikorSynthesis } from './vikor.ts';
import { prometheeSynthesis } from './promethee.ts';
import { electreSynthesis } from './electre.ts';
import { fuzzyTopsisSynthesis } from './fuzzy_topsis.ts';

export type RankRow = { name: string; score: number; rank: number };
/** Dado un vector de pesos que suma 1, devuelve el ranking (1 = mejor; empates comparten rango) de TODAS las alternativas. */
export type RankFn = (weights: number[]) => RankRow[];

/** Filas de síntesis AHP: prioridades locales por criterio (`loc[c]`), de `synthesis().rows`. */
export type AhpLocalRow = { name: string; loc?: number[] };

const EPS = 1e-9;

/** Igual que `computeRanking` del simulador (que ahora la usa): ranking de un método para unos pesos dados.
 * `dm` puede ser la matriz cruda o la efectiva (`resolveTargets` es idempotente). Devuelve null si el método no da ranking
 * (ELECTRE) o si no hay datos con los que recalcular (AHP sin prioridades locales). */
export function buildRankFn(
  method: Method,
  ctx: { criteria: Criterion[]; alternatives: Alternative[]; dm: DecisionMatrix; ahpRows?: AhpLocalRow[] },
): RankFn | null {
  const { criteria, alternatives } = ctx;
  const dm = resolveTargets(criteria, alternatives, ctx.dm);
  switch (method) {
    case 'topsis': return (w) => topsisSynthesis(criteria, alternatives, dm, w).rows.map((r) => ({ name: r.name, score: r.c, rank: r.rank }));
    case 'saw': return (w) => sawSynthesis(criteria, alternatives, dm, w).rows.map((r) => ({ name: r.name, score: r.value, rank: r.rank }));
    case 'vikor': return (w) => vikorSynthesis(criteria, alternatives, dm, w).rows.map((r) => ({ name: r.name, score: r.q, rank: r.rank }));
    case 'promethee': return (w) => prometheeSynthesis(criteria, alternatives, dm, w).rows.map((r) => ({ name: r.name, score: r.phi, rank: r.rank }));
    case 'fuzzy_topsis': return (w) => fuzzyTopsisSynthesis(criteria, alternatives, dm, w).rows.map((r) => ({ name: r.name, score: r.value, rank: r.rank }));
    case 'ahp': {
      const rows = ctx.ahpRows;
      if (!rows || !rows.length || !rows.some((r) => r.loc && r.loc.length > 0)) return null;
      // g_i(w) = Σ_c w_c · prioridad local_c,i (síntesis de AHP con pesos de criterio distintos a los base)
      return (w) => {
        const scored = rows.map((r) => ({ name: r.name, score: (r.loc ?? []).reduce((acc, l, c) => acc + (w[c] ?? 0) * (l ?? 0), 0) }));
        return scored.map((s) => ({ name: s.name, score: s.score, rank: 1 + scored.filter((o) => o.score > s.score + EPS).length }));
      };
    }
    default: return null; // 'electre': no hay ranking
  }
}

/** Fija el peso del criterio `j` en `target` y reparte el resto proporcionalmente a los demás (suma 1). Misma regla que el simulador. */
export function redistribute(weights: number[], j: number, target: number): number[] {
  const m = weights.length;
  if (m <= 1) return m === 1 ? [1] : [];
  const t = Math.max(0, Math.min(1, target));
  const otherSum = weights.reduce((s, w, i) => (i === j ? s : s + w), 0);
  const rest = 1 - t;
  const next = weights.map((w, i) => {
    if (i === j) return t;
    return otherSum > 1e-9 ? (w / otherSum) * rest : rest / (m - 1);
  });
  const sum = next.reduce((a, b) => a + b, 0) || 1;
  return next.map((w) => w / sum);
}

const normalize = (w: number[]) => {
  const s = w.reduce((a, b) => a + b, 0) || 1;
  return w.map((x) => x / s);
};

export type Scenario = {
  id: string;
  kind: 'base' | 'equal' | 'up' | 'down' | 'user';
  label: string;
  /** Índice del criterio movido (up/down); null en base/equal/user. */
  criterion: number | null;
  weights: number[];
  rows: RankRow[];
  /** Nombres en 1.er lugar (más de uno = empate). */
  winners: string[];
  winnerScore: number | null;
  /** Alternativas de mejor a peor (los empates conservan el orden original). */
  order: string[];
  /** ¿El ganador es el mismo que en el escenario base? */
  sameWinner: boolean;
};

export type Flip = { weight: number; newWinners: string[] };
export type CriticalWeight = {
  criterion: number;
  name: string;
  baseWeight: number;
  /** Primer cambio de ganador al BAJAR el peso desde el base (null = no cambia en [0, base]). */
  down: Flip | null;
  /** Primer cambio de ganador al SUBIR el peso desde el base (null = no cambia en [base, 1]). */
  up: Flip | null;
};

export type SensitivityResult = {
  criteria: string[];
  baseWeights: number[];
  /** Variación relativa usada en los escenarios ±X (0.2 = ±20 %). */
  delta: number;
  baseWinners: string[];
  /** Base primero, luego pesos iguales y ±X por criterio. */
  scenarios: Scenario[];
  /** Escenarios definidos por el usuario (aparte: no cuentan en kept/total). */
  userScenarios: Scenario[];
  /** Escenarios alternativos (sin contar el base) en que el ganador NO cambia / total. */
  kept: number;
  total: number;
  critical: CriticalWeight[];
  /** true = ningún escenario cambia el ganador Y ningún peso entre 0 y 1 lo cambia. */
  robust: boolean;
  /** true = hay ganador único en el escenario base (si no, no hay nada que «mantener»). */
  hasWinner: boolean;
};

function winnersOf(rows: RankRow[]): { names: string[]; score: number | null } {
  const top = rows.filter((r) => r.rank === 1);
  return { names: top.map((r) => r.name), score: top.length ? top[0].score : null };
}
const keyOf = (rows: RankRow[]) => winnersOf(rows).names.join('\u0001');

function orderOf(rows: RankRow[]): string[] {
  return rows.map((r, i) => ({ r, i })).sort((a, b) => a.r.rank - b.r.rank || a.i - b.i).map((x) => x.r.name);
}

/** Busca desde el peso base hacia 0 (dir -1) o hacia 1 (dir +1) el primer valor donde el ganador deja de ser el base; afina con bisección. */
function findFlip(rankFn: RankFn, weights: number[], j: number, baseKey: string, dir: -1 | 1, step: number): Flip | null {
  const w0 = weights[j];
  const at = (t: number) => rankFn(redistribute(weights, j, t));
  const pts: number[] = [];
  for (let k = 1; ; k++) {
    const t = w0 + dir * step * k;
    if (dir < 0 ? t <= EPS : t >= 1 - EPS) break;
    pts.push(t);
  }
  const limit = dir < 0 ? 0 : 1;
  if (Math.abs(limit - w0) > EPS) pts.push(limit);
  let prev = w0;
  for (const t of pts) {
    if (keyOf(at(t)) !== baseKey) {
      let same = prev, diff = t; // `same`: sigue ganando el base; `diff`: ya cambió
      for (let it = 0; it < 30; it++) {
        const mid = (same + diff) / 2;
        if (keyOf(at(mid)) === baseKey) same = mid; else diff = mid;
      }
      // quién gana JUSTO después del quiebre (en el punto exacto hay un empate de ~1e-9 entre los dos)
      const probe = diff + Math.sign(t - diff) * Math.min(1e-4, Math.abs(t - diff));
      return { weight: (same + diff) / 2, newWinners: winnersOf(at(probe)).names };
    }
    prev = t;
  }
  return null;
}

export type SensitivityOptions = {
  /** Variación relativa de cada peso en los escenarios ±X. Default 0.2 (±20 %). */
  delta?: number;
  /** Escenarios de pesos definidos por quien decide (p. ej. un panel alterno). Nunca se inventan aquí. */
  userWeights?: { label: string; weights: number[] }[];
  /** Paso del barrido del peso crítico. Default 0.01. */
  step?: number;
};

export function analyzeSensitivity(rankFn: RankFn, criteriaNames: string[], baseWeightsIn: number[], opts: SensitivityOptions = {}): SensitivityResult {
  const m = criteriaNames.length;
  const delta = opts.delta ?? 0.2;
  const step = opts.step ?? 0.01;
  const base = normalize(baseWeightsIn.length === m ? baseWeightsIn : Array.from({ length: m }, () => 1 / (m || 1)));
  const baseRows = rankFn(base);
  const baseKey = keyOf(baseRows);
  const baseWinners = winnersOf(baseRows).names;
  const hasWinner = baseWinners.length === 1;
  const pct = (x: number) => `${Math.round(x * 100)} %`;

  const mk = (id: string, kind: Scenario['kind'], label: string, criterion: number | null, weights: number[]): Scenario => {
    const rows = rankFn(weights);
    const w = winnersOf(rows);
    return { id, kind, label, criterion, weights, rows, winners: w.names, winnerScore: w.score, order: orderOf(rows), sameWinner: keyOf(rows) === baseKey };
  };

  const scenarios: Scenario[] = [mk('base', 'base', 'Pesos base', null, base)];
  if (m > 1) scenarios.push(mk('equal', 'equal', `Pesos iguales (1/${m})`, null, Array.from({ length: m }, () => 1 / m)));
  for (let j = 0; j < m && m > 1; j++) {
    if (base[j] < 1e-9) continue; // un peso 0 no se puede mover en términos relativos
    scenarios.push(mk(`up${j}`, 'up', `${criteriaNames[j]} +${pct(delta)}`, j, redistribute(base, j, Math.min(1, base[j] * (1 + delta)))));
    scenarios.push(mk(`down${j}`, 'down', `${criteriaNames[j]} −${pct(delta)}`, j, redistribute(base, j, base[j] * (1 - delta))));
  }
  const alt = scenarios.slice(1);
  const kept = alt.filter((s) => s.sameWinner).length;

  const critical: CriticalWeight[] = criteriaNames.map((name, j) => ({
    criterion: j, name, baseWeight: base[j],
    down: m > 1 ? findFlip(rankFn, base, j, baseKey, -1, step) : null,
    up: m > 1 ? findFlip(rankFn, base, j, baseKey, 1, step) : null,
  }));

  const userScenarios = (opts.userWeights ?? [])
    .filter((u) => u.weights.length === m && u.weights.some((x) => x > 0))
    .map((u, i) => mk(`user${i}`, 'user', u.label, null, normalize(u.weights)));

  return {
    criteria: criteriaNames, baseWeights: base, delta, baseWinners, scenarios, userScenarios, kept, total: alt.length, critical,
    robust: kept === alt.length && critical.every((c) => !c.down && !c.up), hasWinner,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Texto «Qué dice tu caso»: una redacción única para la pantalla y el informe, con los números reales.

export type SensitivityVerdict = 'robust' | 'moderate' | 'sensitive' | 'none';
export type SensitivityText = { verdict: SensitivityVerdict; headline: string; points: string[] };

const f2 = (x: number) => x.toFixed(2);
const f3 = (x: number) => x.toFixed(3);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1]);

export function describeSensitivity(res: SensitivityResult): SensitivityText {
  if (res.criteria.length < 2) return { verdict: 'none', headline: 'Con un solo criterio los pesos no pueden cambiar el resultado: no hay sensibilidad que analizar.', points: [] };
  if (!res.hasWinner) {
    return { verdict: 'none', headline: 'Con los pesos base no hay una alternativa ganadora única (empate o datos insuficientes), así que no hay un ganador cuya firmeza medir.', points: [] };
  }
  const w = res.baseWinners[0];
  const changed = res.scenarios.slice(1).filter((s) => !s.sameWinner);
  const points: string[] = [];
  let verdict: SensitivityVerdict;
  let headline: string;
  if (changed.length === 0) {
    headline = `${w} se mantiene en 1.er lugar en los ${res.total} escenarios probados (pesos iguales y cada criterio ±${Math.round(res.delta * 100)} %).`;
  } else {
    headline = `${w} se mantiene en 1.er lugar en ${res.kept} de ${res.total} escenarios probados; ${changed.length === 1 ? 'en el otro' : `en los otros ${changed.length}`} cambia el ganador.`;
    changed.forEach((s) => points.push(`«${s.label}»: pasa a ganar ${list(s.winners)}${s.winners.length > 1 ? ' (empate)' : ''}.`));
  }
  // puntos de quiebre, del más cercano al peso base al más lejano
  type Br = { name: string; dir: 'baja' | 'sube'; from: number; at: number; to: string[] };
  const brs: Br[] = [];
  res.critical.forEach((c) => {
    if (c.down) brs.push({ name: c.name, dir: 'baja', from: c.baseWeight, at: c.down.weight, to: c.down.newWinners });
    if (c.up) brs.push({ name: c.name, dir: 'sube', from: c.baseWeight, at: c.up.weight, to: c.up.newWinners });
  });
  brs.sort((a, b) => Math.abs(a.at - a.from) / (a.from || 1) - Math.abs(b.at - b.from) / (b.from || 1));
  brs.slice(0, 3).forEach((b) => points.push(
    `Punto de quiebre: si el peso de «${b.name}» ${b.dir === 'baja' ? 'baja' : 'sube'} de ${f2(b.from)} a ${b.dir === 'baja' ? 'menos de' : 'más de'} ${f3(b.at)}, pasa a ganar ${list(b.to)}.`,
  ));
  if (brs.length > 3) points.push(`Hay ${brs.length - 3} punto${brs.length - 3 === 1 ? '' : 's'} de quiebre más, en la tabla de pesos críticos.`);
  const stable = res.critical.filter((c) => !c.down && !c.up).map((c) => c.name);
  if (brs.length === 0) points.push(`Ningún criterio, movido entre 0 y 1 con los demás reescalados, cambia al ganador: ${w} gana con cualquier peso de un solo criterio.`);
  else if (stable.length) points.push(`Sin punto de quiebre (el ganador no cambia en todo el rango 0–1): ${list(stable.map((s) => `«${s}»`))}.`);

  if (changed.length > 0) verdict = 'sensitive';
  else if (brs.length > 0) verdict = 'moderate';
  else verdict = 'robust';
  if (verdict === 'moderate') headline += ' Aun así, un cambio grande de algún peso lo haría perder.';
  if (verdict === 'robust') headline += ' La decisión es robusta frente a estos cambios de peso.';
  if (verdict === 'sensitive') headline += ' La decisión depende de cuánto se valore cada criterio: conviene validar los pesos.';
  return { verdict, headline, points };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Parámetros propios del método (los pide la plantilla: «VIKOR v = 0.25/0.5/0.75; ELECTRE con otros c*/d*»).

export type VikorVRow = { v: number; winners: string[]; kind: 'unique' | 'two' | 'set' | null; compromise: string[]; sameAsBase: boolean };

/** VIKOR con otros valores de v (mismos datos y pesos). `sameAsBase` compara el ganador por Q con el de `baseV`. */
export function vikorVSensitivity(criteria: Criterion[], alternatives: Alternative[], dmIn: DecisionMatrix, weights: number[], baseV: number, vs: number[] = [0.25, 0.5, 0.75]): VikorVRow[] {
  const dm = resolveTargets(criteria, alternatives, dmIn);
  const baseKey = keyOf(vikorSynthesis(criteria, alternatives, dm, weights, baseV).rows.map((r) => ({ name: r.name, score: r.q, rank: r.rank })));
  const all = [...vs];
  if (!all.some((v) => Math.abs(v - baseV) < 1e-9)) all.push(baseV);
  return all.sort((a, b) => a - b).map((v) => {
    const s = vikorSynthesis(criteria, alternatives, dm, weights, v);
    const rows = s.rows.map((r) => ({ name: r.name, score: r.q, rank: r.rank }));
    return {
      v, winners: winnersOf(rows).names, kind: s.verdict?.kind ?? null,
      compromise: s.verdict ? s.verdict.set.map((i) => s.rows[i].name) : [], sameAsBase: keyOf(rows) === baseKey,
    };
  });
}

export type ElectreThresholdRow = {
  label: string; cStar: number; dStar: number; isBase: boolean;
  relations: number; incomparable: number; pairs: number;
  kernelWinner: string | null; kernelMembers: string[];
};

const r2 = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 100) / 100;

/** ELECTRE con otras combinaciones de c* y d*: nº de relaciones de superación, pares incomparables y núcleo. No produce ranking. */
export function electreThresholdSensitivity(
  criteria: Criterion[], alternatives: Alternative[], dmIn: DecisionMatrix, weights: number[], cStar: number, dStar: number,
  combos?: { label: string; c: number; d: number }[],
): ElectreThresholdRow[] {
  const dm = resolveTargets(criteria, alternatives, dmIn);
  const list0 = combos ?? [
    { label: 'Umbrales actuales', c: cStar, d: dStar },
    { label: 'Más exigente (c* +0.10, d* −0.10)', c: cStar + 0.1, d: dStar - 0.1 },
    { label: 'Menos exigente (c* −0.10, d* +0.10)', c: cStar - 0.1, d: dStar + 0.1 },
    { label: 'Solo c* más alto (+0.10)', c: cStar + 0.1, d: dStar },
    { label: 'Solo d* más bajo (−0.10)', c: cStar, d: dStar - 0.1 },
  ];
  const seen = new Set<string>();
  const out: ElectreThresholdRow[] = [];
  list0.forEach((cb, i) => {
    const c = r2(cb.c), d = r2(cb.d);
    const key = c + '|' + d;
    if (seen.has(key)) return; // el recorte a [0, 1] puede repetir una combinación
    seen.add(key);
    const s = electreSynthesis(criteria, alternatives, dm, weights, c, d);
    const n = alternatives.length;
    out.push({
      label: cb.label, cStar: c, dStar: d, isBase: i === 0,
      relations: s.relations.length, incomparable: s.incomparable.length, pairs: (n * (n - 1)) / 2,
      kernelWinner: s.kernel.winner != null ? s.names[s.kernel.winner] : null,
      kernelMembers: s.kernel.members.map((k) => s.names[k]),
    });
  });
  return out;
}

/** «Qué dice tu caso» para ELECTRE: cuánto cambian las relaciones y el núcleo al mover c* y d*. */
export function describeElectreSensitivity(rows: ElectreThresholdRow[]): { headline: string; points: string[] } {
  if (!rows.length) return { headline: 'No hay datos para probar otros umbrales.', points: [] };
  const base = rows[0];
  const rel = rows.map((r) => r.relations);
  const winners = rows.filter((r) => r.kernelWinner != null);
  const headline = `Con c* = ${f2(base.cStar)} y d* = ${f2(base.dStar)} ELECTRE encuentra ${base.relations} ${base.relations === 1 ? 'relación' : 'relaciones'} de superación y deja ${base.incomparable} de ${base.pairs} pares incomparables.`;
  const lo = Math.min(...rel), hi = Math.max(...rel);
  const points: string[] = [lo === hi
    ? `En las ${rows.length} combinaciones de umbrales probadas el número de relaciones no cambia (${lo}): mover c* y d* ±0.10 no altera cuántas superaciones encuentra ELECTRE.`
    : `En las ${rows.length} combinaciones de umbrales probadas el número de relaciones va de ${lo} a ${hi}.`];
  const distinct = [...new Set(winners.map((r) => r.kernelWinner as string))];
  if (winners.length === 0) points.push('En ninguna combinación hay una alternativa ganadora única (núcleo de un solo elemento): ELECTRE no la señala con estos datos y pesos.');
  else if (winners.length === rows.length && distinct.length === 1) points.push(`${distinct[0]} es la única alternativa del núcleo en las ${rows.length} combinaciones: la conclusión no depende de los umbrales elegidos.`);
  else points.push(`Hay una alternativa ganadora única en ${winners.length} de ${rows.length} combinaciones${distinct.length ? ` (${list(distinct)})` : ''}: la conclusión de ELECTRE sí depende de los umbrales; repórtalo así.`);
  return { headline, points };
}
