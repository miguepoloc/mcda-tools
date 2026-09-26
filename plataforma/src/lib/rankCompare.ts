// Comparación entre los rankings de varios métodos sobre las MISMAS alternativas: correlación de Spearman (ρ), τ de Kendall y un resumen en
// palabras («coinciden en el 1.º y el último; difieren en…»). Es lo que pide la plantilla del informe comparativo (§4.5).
//
// ELECTRE no entra aquí: no da un ranking (ver electre.ts). `electreCompareInfo` resume su relación de superación aparte, SIN inventar posiciones.
import type { ElectreSynth } from './electre.ts';
import { electreKernelText } from './electre.ts';

/** Posiciones de un método: `ranks[i]` = puesto de la alternativa i (1 = mejor; los empates comparten puesto, p. ej. 1, 2, 2, 4). */
export type RankedMethod = { key: string; label: string; ranks: number[] };

/** Puestos «de competición» (1, 2, 2, 4) → puestos promedio (1, 2.5, 2.5, 4), la base de Spearman con empates. */
export function midRanks(ranks: number[]): number[] {
  return ranks.map((r) => {
    const tied = ranks.filter((x) => x === r).length;
    return r + (tied - 1) / 2;
  });
}

/** ρ de Spearman = correlación de Pearson de los puestos promedio. Sin empates equivale a 1 − 6Σd²/[n(n²−1)]. null si n < 2 o si un ranking es constante. */
export function spearman(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n < 2 || b.length !== n) return null;
  const x = midRanks(a), y = midRanks(b);
  const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  if (sxx < 1e-12 || syy < 1e-12) return null;
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

/** τ-b de Kendall = (concordantes − discordantes) / √((n₀−n₁)(n₀−n₂)); sin empates es (C−D)/[n(n−1)/2], la fórmula de la plantilla. null si n < 2 o ranking constante. */
export function kendall(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n < 2 || b.length !== n) return null;
  let c = 0, d = 0, ta = 0, tb = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const da = Math.sign(a[i] - a[j]), db = Math.sign(b[i] - b[j]);
      if (da === 0 && db === 0) continue;
      if (da === 0) { ta++; continue; }
      if (db === 0) { tb++; continue; }
      if (da === db) c++; else d++;
    }
  }
  const denom = Math.sqrt((c + d + ta) * (c + d + tb));
  if (denom < 1e-12) return null;
  return (c - d) / denom;
}

export type PairAgreement = {
  a: string; b: string; aLabel: string; bLabel: string;
  rho: number | null; tau: number | null;
  /** ¿comparten el mismo conjunto de alternativas en 1.er lugar? */
  sameFirst: boolean;
  /** ¿comparten el mismo conjunto de alternativas en último lugar? */
  sameLast: boolean;
};

const firstSet = (r: number[]) => r.map((x, i) => (x === 1 ? i : -1)).filter((i) => i >= 0);
const lastSet = (r: number[]) => { const mx = Math.max(...r); return r.map((x, i) => (x === mx ? i : -1)).filter((i) => i >= 0); };
const sameSet = (x: number[], y: number[]) => x.length === y.length && x.every((v, i) => v === y[i]);

/** Todas las parejas de métodos (solo los que tienen ranking completo sobre las mismas alternativas). */
export function pairwiseAgreement(methods: RankedMethod[]): PairAgreement[] {
  const out: PairAgreement[] = [];
  for (let i = 0; i < methods.length; i++) {
    for (let j = i + 1; j < methods.length; j++) {
      const A = methods[i], B = methods[j];
      out.push({
        a: A.key, b: B.key, aLabel: A.label, bLabel: B.label,
        rho: spearman(A.ranks, B.ranks), tau: kendall(A.ranks, B.ranks),
        sameFirst: sameSet(firstSet(A.ranks), firstSet(B.ranks)),
        sameLast: sameSet(lastSet(A.ranks), lastSet(B.ranks)),
      });
    }
  }
  return out;
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1]);

export type AgreementSummary = {
  /** Frase resumen para «Qué dice tu caso». */
  headline: string;
  /** Detalle: rango de ρ y τ, y dónde discrepan. */
  points: string[];
  allSame: boolean;
  sameFirst: boolean;
  sameLast: boolean;
  /** Alternativas cuyo puesto no es el mismo en todos los métodos. */
  differing: string[];
};

/** «Coinciden en el 1.º y el último; difieren en…» con los nombres reales. Necesita ≥ 2 métodos con ranking. */
export function summarizeAgreement(names: string[], methods: RankedMethod[]): AgreementSummary {
  if (methods.length < 2 || names.length < 2) {
    return { headline: 'Hace falta al menos dos métodos con ranking para comparar su acuerdo.', points: [], allSame: false, sameFirst: false, sameLast: false, differing: [] };
  }
  const firsts = methods.map((m) => firstSet(m.ranks));
  const lasts = methods.map((m) => lastSet(m.ranks));
  const sameFirst = firsts.every((f) => sameSet(f, firsts[0]));
  const sameLast = lasts.every((l) => sameSet(l, lasts[0]));
  const differing = names.filter((_, i) => new Set(methods.map((m) => m.ranks[i])).size > 1);
  const allSame = differing.length === 0;
  const M = methods.length;
  const nm = (ix: number[]) => list(ix.map((i) => names[i]));
  const points: string[] = [];
  const pairs = pairwiseAgreement(methods);
  const rhos = pairs.map((p) => p.rho).filter((x): x is number => x != null);
  const taus = pairs.map((p) => p.tau).filter((x): x is number => x != null);
  if (rhos.length) points.push(`Spearman ρ entre pares de métodos: de ${Math.min(...rhos).toFixed(2)} a ${Math.max(...rhos).toFixed(2)}; Kendall τ: de ${Math.min(...taus).toFixed(2)} a ${Math.max(...taus).toFixed(2)} (1 = mismo orden, −1 = orden invertido).`);
  let headline: string;
  if (allSame) {
    headline = `Los ${M} métodos dan exactamente el mismo orden de las ${names.length} alternativas.`;
  } else {
    const parts: string[] = [];
    if (sameFirst && sameLast) parts.push(`Coinciden en el 1.º (${nm(firsts[0])}) y en el último (${nm(lasts[0])})`);
    else if (sameFirst) parts.push(`Coinciden en el 1.º (${nm(firsts[0])}) pero no en el último`);
    else if (sameLast) parts.push(`Coinciden en el último (${nm(lasts[0])}) pero NO en el 1.º`);
    else parts.push('No coinciden ni en el 1.º ni en el último');
    headline = `${parts[0]}; difieren en la posición de ${list(differing)}.`;
    if (!sameFirst) {
      const groups = new Map<string, string[]>();
      methods.forEach((m, k) => { const key = nm(firsts[k]); groups.set(key, [...(groups.get(key) ?? []), m.label]); });
      points.push('1.er lugar por método: ' + [...groups.entries()].map(([who, ms]) => `${who} (${list(ms)})`).join('; ') + '.');
    }
  }
  return { headline, points, allSame, sameFirst, sameLast, differing };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// ELECTRE: relación de superación, no ranking.

export type ElectreCompareInfo = {
  names: string[];
  cStar: number; dStar: number;
  /** out[i] = a cuántas alternativas supera i; inn[i] = por cuántas es superada. */
  out: number[]; inn: number[];
  relations: { winner: string; loser: string }[];
  incomparable: [string, string][];
  /** Única alternativa del núcleo, o null si no hay ganador único. */
  winner: string | null;
  inKernel: boolean[];
  isolated: boolean[];
  kernelSummary: string;
  kernelReasons: string[];
};

export function electreCompareInfo(syn: ElectreSynth): ElectreCompareInfo {
  const n = syn.names.length;
  const out = Array.from({ length: n }, (_, i) => syn.result.outranks[i]?.filter(Boolean).length ?? 0);
  const inn = Array.from({ length: n }, (_, i) => syn.result.outranks.filter((row) => row[i]).length);
  const hasRel = syn.relations.length > 0;
  const text = electreKernelText(syn.names, syn.kernel, hasRel);
  return {
    names: syn.names, cStar: syn.result.cStar, dStar: syn.result.dStar, out, inn,
    relations: syn.relations, incomparable: syn.incomparable,
    winner: syn.kernel.winner != null ? syn.names[syn.kernel.winner] : null,
    inKernel: syn.names.map((_, i) => hasRel && syn.kernel.members.includes(i)),
    isolated: syn.names.map((_, i) => syn.kernel.isolated.includes(i)),
    kernelSummary: text.summary, kernelReasons: text.reasons,
  };
}

/** Parámetros (no salen de los datos) que cada método usó, en texto llano, para declararlos en el informe. */
export function describeMethodParams(key: string, o: { vikorV?: number; cStar?: number; dStar?: number } = {}): string {
  switch (key) {
    case 'ahp': return 'Juicios por pares en la escala de Saaty; pesos = eigenvector principal (o promedio de columnas si así se eligió).';
    case 'topsis': return 'Normalización vectorial; distancia euclidiana al ideal y al anti-ideal. Sin parámetros a elegir.';
    case 'vikor': return `v = ${(o.vikorV ?? 0.5).toFixed(2)} (peso de la utilidad de grupo; lo elige quien decide, no sale de los datos). Normalización por rango.`;
    case 'promethee': return 'Función de preferencia Tipo III (lineal): q = 0 y p = rango de cada criterio; la plataforma no ofrece otra función.';
    case 'saw': return 'Normalización mín–máx; puntaje = suma ponderada. Sin parámetros a elegir.';
    case 'fuzzy_topsis': return 'Etiquetas lingüísticas convertidas a números triangulares difusos; distancia entre vértices.';
    case 'electre': return `c* = ${(o.cStar ?? 0.65).toFixed(2)} (concordancia mínima) y d* = ${(o.dStar ?? 0.3).toFixed(2)} (discordancia máxima); los elige quien decide.`;
    default: return '';
  }
}
