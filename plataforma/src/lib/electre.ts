// Cálculo ELECTRE I (implementación manual, misma fórmula y umbrales que
// 04_electre_iot_palmor.ipynb del curso — NO pyDecision.algorithm.electre_i, su discordancia usa una
// normalización distinta a la enseñada en clase). A diferencia de AHP/TOPSIS/VIKOR/PROMETHEE, ELECTRE
// NO produce un ranking total: produce una relación de superación ("a supera a b") donde algunos pares
// pueden quedar incomparables — es el punto pedagógico del método, no una limitación de esta
// implementación. c* (concordancia mínima) y d* (discordancia máxima) SON justo como v en vikor.ts:
// no se derivan de los datos, los elige quien decide, y afectan el resultado (qué pares terminan con
// relación y cuáles quedan incomparables) — por eso se guardan en `decision_matrix` (electreCStar/
// electreDStar, ver types.ts) igual que vikorV, en vez de venir fijos por código.
import type { Alternative, Criterion, DecisionMatrix, MatrixType } from './types.ts';
import { getCell, getType } from './topsis.ts';

/** c* y d* por defecto, convención de esta plataforma (no un estándar de la literatura). */
export const ELECTRE_C_STAR_DEFAULT = 0.65;
export const ELECTRE_D_STAR_DEFAULT = 0.30;

/** c* guardado en la matriz de decisión del proyecto; ELECTRE_C_STAR_DEFAULT si falta o es inválido. */
export function electreCStar(dm: DecisionMatrix): number {
  const c = dm.electreCStar;
  return typeof c === 'number' && Number.isFinite(c) && c >= 0 && c <= 1 ? c : ELECTRE_C_STAR_DEFAULT;
}

/** d* guardado en la matriz de decisión del proyecto; ELECTRE_D_STAR_DEFAULT si falta o es inválido. */
export function electreDStar(dm: DecisionMatrix): number {
  const d = dm.electreDStar;
  return typeof d === 'number' && Number.isFinite(d) && d >= 0 && d <= 1 ? d : ELECTRE_D_STAR_DEFAULT;
}

/** Tolerancia al comparar con c* y d*: sumas de pesos como 0.1 + 0.7 dan 0.7999999999999999, y con c* = 0.8 la relación se perdería por
 * un error de redondeo que en pantalla se ve como «0.80 ≥ 0.80». El Excel usa la misma tolerancia. */
export const EPS = 1e-9;

export type ElectreResult = {
  n: number;
  concordance: number[][]; // concordance[i][k]: qué tan de acuerdo están los criterios en que i >= k
  discordance: number[][]; // discordance[i][k]: la mayor objeción (normalizada) a que i supere a k
  outranks: boolean[][]; // outranks[i][k] = true si i supera a k (concordance>=cStar y discordance<=dStar)
  cStar: number;
  dStar: number;
  /** Detalle intermedio, expuesto para que excel.ts pueda cachear los mismos números que muestran
   * las fórmulas vivas del .xlsx (ver topsis.ts, mismo patrón). g es la misma matriz "dirección
   * beneficio" que usa promethee.ts: en espacio g, "mayor siempre es mejor" sin importar
   * beneficio/costo, lo que deja concordance/discordance como comparaciones simples (>=, diferencia). */
  weights: number[];
  ranges: number[]; // rango por columna (max-min, o 1 si es 0), usado para normalizar la discordancia
  g: number[][];
};

export function electre(matrix: number[][], weights: number[], types: MatrixType[], cStar = ELECTRE_C_STAR_DEFAULT, dStar = ELECTRE_D_STAR_DEFAULT): ElectreResult {
  const n = matrix.length;
  const m = weights.length;
  if (n === 0 || m === 0) return { n, concordance: [], discordance: [], outranks: [], cStar, dStar, weights: [], ranges: [], g: [] };
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const w = weights.map((x) => x / wsum);

  const colOf = (j: number) => matrix.map((row) => row[j]);
  const ranges = Array.from({ length: m }, (_, j) => {
    const col = colOf(j);
    return Math.max(...col) - Math.min(...col) || 1;
  });
  const g = matrix.map((row) => row.map((x, j) => (types[j] === 'min' ? -x : x)));
  const betterOrEqual = (a: number, b: number, j: number) => (types[j] === 'min' ? a <= b : a >= b);
  const strictlyBetter = (a: number, b: number, j: number) => (types[j] === 'min' ? a < b : a > b);

  const concordance = matrix.map((rowA, i) => matrix.map((rowB, k) => {
    if (i === k) return 1;
    let c = 0;
    for (let j = 0; j < m; j++) if (betterOrEqual(rowA[j], rowB[j], j)) c += w[j];
    return c;
  }));

  const discordance = matrix.map((rowA, i) => matrix.map((rowB, k) => {
    if (i === k) return 0;
    let d = 0;
    for (let j = 0; j < m; j++) {
      if (strictlyBetter(rowB[j], rowA[j], j)) {
        const diff = Math.abs(rowB[j] - rowA[j]) / ranges[j];
        if (diff > d) d = diff;
      }
    }
    return d;
  }));

  const outranks = concordance.map((row, i) => row.map((c, k) => i !== k && c >= cStar - EPS && discordance[i][k] <= dStar + EPS));
  return { n, concordance, discordance, outranks, cStar, dStar, weights: w, ranges, g };
}

export type ElectreSynth = {
  names: string[];
  result: ElectreResult;
  relations: { winner: string; loser: string }[];
  incomparable: [string, string][]; // pares sin relación en ningún sentido (i,j con i<j)
  /** cuántas alternativas supera cada una netamente (para una intuición de "quién va mejor", no un ranking real) */
  netOutdegree: number[];
  /** núcleo de la relación (ver electreKernel): de aquí sale el «ganador» de ELECTRE, si lo hay */
  kernel: ElectreKernel;
};

export function electreSynthesis(criteria: Criterion[], alternatives: Alternative[], dm: DecisionMatrix, weights: number[], cStar: number = electreCStar(dm), dStar: number = electreDStar(dm)): ElectreSynth {
  const matrix = alternatives.map((a) => criteria.map((c) => getCell(dm, a.id, c.id) ?? 0));
  const types = criteria.map((c) => getType(dm, c.id));
  const result = electre(matrix, weights, types, cStar, dStar);
  const names = alternatives.map((a) => a.name);
  const relations: { winner: string; loser: string }[] = [];
  const incomparable: [string, string][] = [];
  for (let i = 0; i < names.length; i++) {
    for (let k = 0; k < names.length; k++) {
      if (i === k) continue;
      if (result.outranks[i]?.[k]) relations.push({ winner: names[i], loser: names[k] });
    }
  }
  for (let i = 0; i < names.length; i++) {
    for (let k = i + 1; k < names.length; k++) {
      const aOverB = result.outranks[i]?.[k];
      const bOverA = result.outranks[k]?.[i];
      if (!aOverB && !bOverA) incomparable.push([names[i], names[k]]);
    }
  }
  const netOutdegree = names.map((_, i) => {
    const out = result.outranks[i]?.filter(Boolean).length ?? 0;
    const inn = result.outranks.filter((row) => row[i]).length;
    return out - inn;
  });
  return { names, result, relations, incomparable, netOutdegree, kernel: electreKernel(result.outranks) };
}

/** Núcleo (kernel) de la relación de superación, en el sentido de ELECTRE I (Roy): conjunto N tal que ninguna alternativa de N
 * supera a otra de N (estabilidad interna) y toda alternativa fuera de N es superada por alguna de N (estabilidad externa).
 * Los ciclos (A supera a B y B supera a A, directa o por una cadena) se tratan como un solo bloque, como en Roy: dentro de
 * un bloque no se puede decir cuál va primero.
 *
 * NO es «las que nadie supera»: una alternativa que se supera mutuamente con otra queda superada aunque sea de las mejores, y una
 * alternativa aislada (ni supera ni es superada) entra al núcleo sin haber ganado nada. Por eso el núcleo puede tener varios
 * bloques, y solo hay un ganador cuando es una única alternativa. */
export type ElectreKernel = {
  /** Bloques del núcleo; cada bloque es una alternativa, o varias que se superan en ciclo. */
  blocks: number[][];
  /** Todas las alternativas del núcleo (los bloques aplanados). */
  members: number[];
  /** Alternativas sin ninguna relación (ni superan ni son superadas) mientras el resto sí tiene: están en el núcleo solo por eso. */
  isolated: number[];
  /** Bloques con varias alternativas que se superan en ciclo (estén o no en el núcleo). */
  cycles: number[][];
  /** Índice de la única alternativa del núcleo; null si el núcleo tiene varios bloques, un bloque cíclico o no hay relaciones. */
  winner: number | null;
};

export function electreKernel(outranks: boolean[][]): ElectreKernel {
  const n = outranks.length;
  const beats = (i: number, k: number) => i !== k && !!outranks[i]?.[k];
  // alcanzabilidad (cierre transitivo) para hallar los ciclos; n es pequeño
  const reach = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, k) => beats(i, k)));
  for (let m = 0; m < n; m++) for (let i = 0; i < n; i++) if (reach[i][m]) for (let k = 0; k < n; k++) if (reach[m][k]) reach[i][k] = true;
  const compOf: number[] = Array(n).fill(-1);
  const comps: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (compOf[i] >= 0) continue;
    const members = [i];
    for (let k = i + 1; k < n; k++) if (compOf[k] < 0 && reach[i][k] && reach[k][i]) members.push(k);
    members.forEach((k) => { compOf[k] = comps.length; });
    comps.push(members);
  }
  // en el grafo condensado (acíclico): un bloque entra al núcleo si ningún bloque del núcleo lo supera
  const preds = comps.map((c, ci) => {
    const set = new Set<number>();
    c.forEach((k) => { for (let i = 0; i < n; i++) if (beats(i, k) && compOf[i] !== ci) set.add(compOf[i]); });
    return [...set];
  });
  const memo: (boolean | undefined)[] = Array(comps.length).fill(undefined);
  const inKernel = (ci: number): boolean => {
    const cached = memo[ci];
    if (cached !== undefined) return cached;
    const res = !preds[ci].some(inKernel);
    memo[ci] = res;
    return res;
  };
  const blocks = comps.filter((_, ci) => inKernel(ci));
  const members = blocks.flat().sort((a, b) => a - b);
  const anyRelation = outranks.some((row, i) => row.some((_, k) => beats(i, k)));
  const isolated = anyRelation
    ? Array.from({ length: n }, (_, i) => i).filter((i) => !outranks[i].some((_, k) => beats(i, k)) && !outranks.some((_, j) => beats(j, i)))
    : [];
  const cycles = comps.filter((c) => c.length > 1);
  const winner = anyRelation && blocks.length === 1 && blocks[0].length === 1 ? blocks[0][0] : null;
  return { blocks, members, isolated, cycles, winner };
}

/** Texto explicativo del núcleo para la pantalla, la comparación y el informe (una sola redacción para los tres). */
export function electreKernelText(names: string[], kernel: ElectreKernel, hasRelations: boolean): { summary: string; reasons: string[] } {
  const list = (ix: number[]) => ix.map((i) => names[i]).join(', ');
  const blockLabel = (b: number[]) => (b.length === 1 ? names[b[0]] : `{${list(b)}}`);
  const reasons: string[] = [];
  if (!hasRelations) {
    return {
      summary: 'Ninguna alternativa supera a otra con estos umbrales, así que todas quedan en el núcleo y no hay ganador.',
      reasons: ['Sube d* o baja c* si esperabas más relaciones de superación.'],
    };
  }
  if (kernel.winner != null) {
    return {
      summary: `${names[kernel.winner]} es la única alternativa del núcleo: nadie la supera y las demás quedan superadas por ella (directa o por una cadena).`,
      reasons: ['ELECTRE no da un puntaje: esto es «no superada», no «la de mayor valor».'],
    };
  }
  const blocks = kernel.blocks.map(blockLabel);
  const single = kernel.blocks.length === 1;
  const summary = single
    ? `El núcleo es un solo bloque, ${blocks[0]}, cuyas alternativas se superan entre sí: no hay ganador único.`
    : `El núcleo tiene ${kernel.blocks.length} bloques: ${blocks.join(' y ')}. ELECTRE no puede decidir entre ellos, así que no hay ganador único.`;
  kernel.isolated.forEach((i) => reasons.push(
    `${names[i]} está en el núcleo solo porque no se relaciona con ninguna: no supera a nadie y nadie la supera (contra cada una falla la concordancia c* o la discordancia d*). Que nadie la supere no significa que sea la mejor.`,
  ));
  kernel.cycles.forEach((c) => reasons.push(
    `${list(c)} se superan entre sí (ciclo): se tratan como un solo bloque, porque con estos umbrales el método no dice cuál de ellas va primero.`,
  ));
  reasons.push('Núcleo = conjunto de alternativas que ninguna otra del núcleo supera y que, juntas, superan a todas las demás. Puede tener varios elementos: pertenecer al núcleo no es ganar.');
  return { summary, reasons };
}

// ---- Desglose para pantalla e informe (solo lectura: NO cambian ningún resultado de electre()) ----

/** Matriz de decisión y tipos de criterio tal como los lee `electre()` (mismo patrón que vikorInputs). Pasar la matriz EFECTIVA (con los
 * criterios «objetivo» ya convertidos a costo por resolveTargets). */
export function electreInputs(criteria: Criterion[], alternatives: Alternative[], dm: DecisionMatrix): { matrix: number[][]; types: MatrixType[] } {
  const matrix = alternatives.map((a) => criteria.map((c) => getCell(dm, a.id, c.id) ?? 0));
  const types = criteria.map((c) => getType(dm, c.id));
  return { matrix, types };
}

/** Un criterio dentro de la comparación de un par (a, b), con todo lo que las diapositivas escriben a mano. */
export type ElectrePairCriterion = {
  j: number;
  /** Peso normalizado del criterio (el mismo que usa electre()). */
  w: number;
  /** Rango del criterio (máx − mín entre alternativas, o 1 si es 0). */
  range: number;
  xa: number;
  xb: number;
  /** a es al menos tan buena como b en este criterio (beneficio: xa ≥ xb; costo: xa ≤ xb): su peso cuenta en c(a,b). */
  aAtLeast: boolean;
  /** b es al menos tan buena como a (cuenta en c(b,a)). Con empate en el criterio las dos son true. */
  bAtLeast: boolean;
  /** b es estrictamente mejor que a: este criterio puede objetar «a supera a b» (entra a d(a,b)). */
  bWins: boolean;
  /** a es estrictamente mejor que b (entra a d(b,a)). */
  aWins: boolean;
  /** |xa − xb| en la unidad del criterio (0 si empatan). */
  gap: number;
  /** gap ÷ range. */
  norm: number;
};

/** Comparación completa del par ordenado (a = i, b = k): criterio por criterio, más c(a,b), d(a,b) y el criterio donde ocurre el
 * máximo de d (dCrit, -1 si b no gana en ninguno). c y d coinciden EXACTAMENTE con electre().concordance/discordance (mismas sumas). */
export type ElectrePairDetail = {
  a: number;
  b: number;
  rows: ElectrePairCriterion[];
  /** c(a,b): suma de los pesos donde a es al menos tan buena como b. */
  c: number;
  /** c(b,a) (sentido contrario), para la comprobación c(a,b) + c(b,a) = 1 cuando no hay empates. */
  cRev: number;
  /** d(a,b): mayor ventaja normalizada de b sobre a. */
  d: number;
  /** d(b,a): mayor ventaja normalizada de a sobre b. */
  dRev: number;
  /** Índice del criterio donde se alcanza d(a,b); -1 si d = 0. */
  dCrit: number;
  /** Ídem para d(b,a). */
  dCritRev: number;
  /** TODOS los criterios que alcanzan el máximo de d(a,b) (hay empate cuando dos criterios dan la misma ventaja normalizada, p. ej. 1.00 y 1.00). */
  dCrits: number[];
  /** Ídem para d(b,a). */
  dCritsRev: number[];
  /** Hay al menos un criterio con empate exacto: en ese caso c(a,b) + c(b,a) > 1. */
  hasTies: boolean;
};

export function electrePairDetail(matrix: number[][], types: MatrixType[], result: ElectreResult, a: number, b: number): ElectrePairDetail {
  const m = result.weights.length;
  const rows: ElectrePairCriterion[] = [];
  let c = 0, cRev = 0, d = 0, dRev = 0, dCrit = -1, dCritRev = -1, hasTies = false;
  for (let j = 0; j < m; j++) {
    const xa = matrix[a][j], xb = matrix[b][j];
    const min = types[j] === 'min';
    const aAtLeast = min ? xa <= xb : xa >= xb;
    const bAtLeast = min ? xb <= xa : xb >= xa;
    const bWins = min ? xb < xa : xb > xa;
    const aWins = min ? xa < xb : xa > xb;
    const gap = Math.abs(xb - xa);
    const norm = gap / result.ranges[j];
    if (aAtLeast) c += result.weights[j];
    if (bAtLeast) cRev += result.weights[j];
    if (bWins && norm > d) { d = norm; dCrit = j; }
    if (aWins && norm > dRev) { dRev = norm; dCritRev = j; }
    if (xa === xb) hasTies = true;
    rows.push({ j, w: result.weights[j], range: result.ranges[j], xa, xb, aAtLeast, bAtLeast, bWins, aWins, gap, norm });
  }
  const atMax = (flag: 'bWins' | 'aWins', max: number) => (max > 0 ? rows.filter((r) => r[flag] && Math.abs(r.norm - max) <= EPS).map((r) => r.j) : []);
  return { a, b, rows, c, cRev, d, dRev, dCrit, dCritRev, dCrits: atMax('bWins', d), dCritsRev: atMax('aWins', dRev), hasTies };
}

/** Qué pasaría con otros umbrales: cuántas relaciones quedan y qué núcleo sale. El curso pide «prueba 2-3 combinaciones y reporta si el
 * resultado es sensible a esa elección». Recalcula con electre() (mismos datos y pesos). */
export type ElectreSensitivityRow = { cStar: number; dStar: number; relations: number; incomparable: number; kernelMembers: number[]; winner: number | null; current: boolean };

export function electreSensitivity(matrix: number[][], weights: number[], types: MatrixType[], current: { cStar: number; dStar: number }, combos: [number, number][] = [[0.5, 0.5], [0.65, 0.7], [0.65, 0.3], [0.75, 0.25]]): ElectreSensitivityRow[] {
  const seen = new Set<string>();
  const all: [number, number][] = [[current.cStar, current.dStar], ...combos];
  const out: ElectreSensitivityRow[] = [];
  for (const [cS, dS] of all) {
    const key = cS.toFixed(4) + '/' + dS.toFixed(4);
    if (seen.has(key)) continue;
    seen.add(key);
    const r = electre(matrix, weights, types, cS, dS);
    const n = r.n;
    let relations = 0, incomparable = 0;
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
      if (i !== k && r.outranks[i][k]) relations++;
      if (i < k && !r.outranks[i][k] && !r.outranks[k][i]) incomparable++;
    }
    const kernel = electreKernel(r.outranks);
    out.push({ cStar: cS, dStar: dS, relations, incomparable, kernelMembers: kernel.members, winner: kernel.winner, current: out.length === 0 });
  }
  return out;
}
