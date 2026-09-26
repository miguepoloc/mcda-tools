// Group-AHP diagnostics: consensus indicator and Monte Carlo weight uncertainty.
//
// Both follow Goepel, K.D. (2018), "Implementation of an Online Software Tool for the Analytic Hierarchy
// Process (AHP-OS)", Int. J. Analytic Hierarchy Process 10(3), 469-487 (eq. 11-21 for consensus,
// eq. 22-25 for weight uncertainty). Equation numbers below refer to that paper. The consensus indicator
// is a direct implementation; the Monte Carlo is *our* implementation of the scheme described there
// (see `perturb`), so its numbers are analogous to AHP-OS, not identical to them.
//
// Unlike the core AHP maths, these diagnostics are TypeScript-only: the Excel export and the HTML tool
// do not replicate them (they do not feed any ranking, they only describe how trustworthy it is).
import { analyze, DEFAULT_WEIGHT_METHOD, type WeightMethod } from './ahp.ts';

/** Largest value of the judgment scale (M in eq. 16). 9 for the Saaty fundamental scale. */
export const SCALE_MAX = 9;

export type ConsensusCategory = 'very-low' | 'low' | 'moderate' | 'high' | 'very-high';

export type Consensus = {
  /** Number of participants k and of elements n the weights refer to. */
  k: number;
  n: number;
  hGamma: number;
  hAlpha: number;
  hBeta: number;
  /** Relative homogeneity S = exp(-Hβ) = 1/Dβ (eq. 14). */
  s: number;
  /** AHP group consensus indicator S*, 0 (no consensus) .. 1 (full consensus) (eq. 21). */
  sStar: number;
  category: ConsensusCategory;
};

const xlogx = (p: number) => (p > 0 ? -p * Math.log(p) : 0);
const entropy = (w: number[]) => w.reduce((a, p) => a + xlogx(p), 0);

/** Interpretation of S* (Goepel 2018, Table 2). */
export function consensusCategory(sStar: number): ConsensusCategory {
  if (sStar <= 0.5) return 'very-low';
  if (sStar <= 0.65) return 'low';
  if (sStar <= 0.75) return 'moderate';
  if (sStar < 0.85) return 'high';
  return 'very-high';
}

/**
 * Consensus of `W[k][j]` = local priority of element j according to participant k.
 * Returns null with fewer than two participants or two elements (consensus is undefined).
 */
export function consensus(W: number[][], M = SCALE_MAX): Consensus | null {
  const k = W.length;
  const n = k ? W[0].length : 0;
  if (k < 2 || n < 2) return null;
  const avg = Array.from({ length: n }, (_, j) => W.reduce((a, w) => a + w[j], 0) / k);
  const hGamma = entropy(avg); // eq. 11
  const hAlpha = W.reduce((a, w) => a + entropy(w), 0) / k; // eq. 12
  const hBeta = Math.max(0, hGamma - hAlpha); // eq. 13 (clamped: rounding can leave -1e-17)
  const s = Math.exp(-hBeta); // eq. 14
  // Minimum alpha entropy: one element M times more important than each of the other n-1 (eq. 16).
  const d = n + M - 1;
  const hAlphaMin = -(M / d) * Math.log(M / d) - ((n - 1) / d) * Math.log(1 / d);
  const cor = Math.exp(hAlphaMin) / n; // eq. 18
  const sStar = Math.min(1, Math.max(0, (s - cor) / (1 - cor))); // eq. 21
  return { k, n, hGamma, hAlpha, hBeta, s, sStar, category: consensusCategory(sStar) };
}

// ---------------------------------------------------------------------------------------------------
// Monte Carlo weight uncertainty

/** Small, fast, seedable PRNG (mulberry32): the same seed always gives the same experiment. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type MonteCarloOptions = {
  /** Number of random variations of the judgments (AHP-OS uses 1000). */
  nvar?: number;
  /** Half-width of the perturbation in scale steps before dividing by √K (eq. 23 uses 0.5). */
  amplitude?: number;
  /** Seed of the pseudo-random generator, for reproducibility. */
  seed?: number;
  /** Variations whose consistency ratio exceeds this are discarded (eq. 24 uses 0.25). */
  crMax?: number;
  /** How weights are obtained from each perturbed matrix (see `WeightMethod`). */
  method?: WeightMethod;
};

export type WeightUncertainty = {
  /** Weights of the unperturbed matrix. */
  w: number[];
  /** Δw(+) = max(w_j) − w and Δw(−) = w − min(w_j) over the accepted variations (eq. 24-25). */
  plus: number[];
  minus: number[];
  min: number[];
  max: number[];
  mean: number[];
  sd: number[];
  /** rankProb[i][r] = share of accepted variations in which element i is ranked r+1 by weight. */
  rankProb: number[][];
  /** Pairs (i<j) whose [min, max] weight ranges overlap: they cannot be told apart within the uncertainty. */
  overlaps: [number, number][];
  runs: number;
  accepted: number;
  /** Half-width actually used, after dividing by √K. */
  delta: number;
};

/**
 * Vary every judgment of the (upper triangle of the) consolidated matrix `A` by ΔX ~ amplitude·U(−1,+1)/√K
 * on the intensity scale, keeping reciprocity. Judgments are signed steps s = a−1 (a ≥ 1: first element
 * preferred) or s = −(1/a−1); the perturbed step is clamped to ±(M−1) and crossing 0 flips the preferred
 * side, which is the continuous reading of the a₁ rule after eq. 22.
 */
export function perturb(A: number[][], delta: number, rand: () => number, M = SCALE_MAX): number[][] {
  const n = A.length;
  const B = A.map((r) => r.slice());
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = A[i][j];
      const s = a >= 1 ? a - 1 : -(1 / a - 1);
      const t = Math.max(-(M - 1), Math.min(M - 1, s + delta * (2 * rand() - 1)));
      const b = t >= 0 ? 1 + t : 1 / (1 + -t);
      B[i][j] = b;
      B[j][i] = 1 / b;
    }
  }
  return B;
}

/**
 * Weight uncertainty of a consolidated pairwise matrix supported by `k` participants
 * (more participants → a smaller perturbation, eq. 23).
 */
export function weightUncertainty(A: number[][], k: number, opts: MonteCarloOptions = {}): WeightUncertainty {
  const { nvar = 1000, amplitude = 0.5, seed = 1, crMax = 0.25, method = DEFAULT_WEIGHT_METHOD } = opts;
  const n = A.length;
  const base = analyze(A, method);
  const delta = amplitude / Math.sqrt(Math.max(1, k));
  const rand = rng(seed);
  const min = base.w.slice();
  const max = base.w.slice();
  const sum = Array(n).fill(0) as number[];
  const sum2 = Array(n).fill(0) as number[];
  const rankCount = Array.from({ length: n }, () => Array(n).fill(0) as number[]);
  let accepted = 0;
  for (let v = 0; v < nvar; v++) {
    const an = analyze(perturb(A, delta, rand), method);
    if (an.cr >= crMax) continue;
    accepted++;
    const order = an.w.map((x, i) => [x, i] as const).sort((p, q) => q[0] - p[0]);
    order.forEach(([, i], r) => rankCount[i][r]++);
    an.w.forEach((x, i) => {
      if (x < min[i]) min[i] = x;
      if (x > max[i]) max[i] = x;
      sum[i] += x;
      sum2[i] += x * x;
    });
  }
  const mean = accepted ? sum.map((s) => s / accepted) : base.w.slice();
  const sd = accepted ? sum2.map((s2, i) => Math.sqrt(Math.max(0, s2 / accepted - mean[i] ** 2))) : Array(n).fill(0);
  const overlaps: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (min[i] <= max[j] && min[j] <= max[i]) overlaps.push([i, j]);
  return {
    w: base.w,
    plus: max.map((m, i) => m - base.w[i]),
    minus: min.map((m, i) => base.w[i] - m),
    min,
    max,
    mean,
    sd,
    rankProb: rankCount.map((r) => r.map((c) => (accepted ? c / accepted : 0))),
    overlaps,
    runs: nvar,
    accepted,
    delta,
  };
}
