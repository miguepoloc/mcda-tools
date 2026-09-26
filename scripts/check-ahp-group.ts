// Group-AHP diagnostics: consensus indicator and Monte Carlo weight uncertainty.
// Reference values: Goepel (2018) IJAHP 10(3) own validation cases, plus hand computations checked in Python.
import { analyze, expertMatrix } from '../src/lib/ahp.ts';
import { consensus, consensusCategory, perturb, rng, weightUncertainty } from '../src/lib/ahpGroup.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

// 1) Goepel §9: one criterion x times more important than all others -> w = x/(x+n-1) (n=4, x=9 -> 75 %).
{
  const items = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id }));
  const an = analyze(expertMatrix(items, { 'a-b': -8, 'a-c': -8, 'a-d': -8, 'b-c': 0, 'b-d': 0, 'c-d': 0 }));
  ok(cerca(an.w[0], 9 / 12, 1e-9), `w = x/(x+n-1): ${an.w[0].toFixed(6)} (esperado 0.75)`);
}

// 2) Goepel §9: identical participants -> 100 %; k participants each pushing a different leaf to the extreme -> 0 % (all n).
{
  const same = consensus([[0.5, 0.3, 0.2], [0.5, 0.3, 0.2], [0.5, 0.3, 0.2]])!;
  ok(cerca(same.sStar, 1), `participantes idénticos: S* = ${same.sStar}`);
  for (const n of [2, 3, 4, 5]) {
    const ext = Array.from({ length: n }, (_, p) => {
      const items = Array.from({ length: n }, (_, i) => ({ id: 'x' + i, name: 'x' + i }));
      const m: Record<string, number> = {};
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) m[`x${i}-x${j}`] = p === i ? -8 : p === j ? 8 : 0;
      return analyze(expertMatrix(items, m)).w;
    });
    const c = consensus(ext)!;
    ok(cerca(c.sStar, 0, 1e-9) && c.category === 'very-low', `${n} participantes extremos sobre hojas distintas: S* = ${c.sStar.toExponential(2)} (esperado 0)`);
  }
}

// 3) Reference values (Python, same equations 11-21).
{
  const a = consensus([[0.75, 0.25], [0.25, 0.75]])!;
  ok(cerca(a.hGamma, 0.6931471805599453) && cerca(a.hAlpha, 0.5623351446188083) && cerca(a.hBeta, 0.130812035941137), 'entropías γ/α/β (2 participantes, n=2)');
  ok(cerca(a.s, 0.8773826753016616) && cerca(a.sStar, 0.6017977544986775), `S = ${a.s.toFixed(6)}, S* = ${a.sStar.toFixed(6)} (esperado 0.877383, 0.601798)`);
  const b = consensus([[0.5, 0.3, 0.2], [0.4, 0.4, 0.2], [0.6, 0.2, 0.2]])!;
  ok(cerca(b.sStar, 0.9544572516491876) && b.category === 'very-high', `3 participantes, n=3: S* = ${b.sStar.toFixed(6)} (esperado 0.954457, muy alto)`);
  ok(consensus([[0.5, 0.5]]) === null && consensus([[1], [1]]) === null, 'sin consenso definido con 1 participante o 1 elemento');
}

// 4) Interpretation thresholds (Table 2).
ok(consensusCategory(0.5) === 'very-low' && consensusCategory(0.51) === 'low' && consensusCategory(0.65) === 'low' && consensusCategory(0.7) === 'moderate'
  && consensusCategory(0.8) === 'high' && consensusCategory(0.85) === 'very-high', 'categorías de S*');

// 5) Monte Carlo: reproducible, bounded by the analytic range, plus/minus non-negative.
{
  const items = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const A = expertMatrix(items, { 'a-b': -2 }); // a is 3 times b
  const u1 = weightUncertainty(A, 1, { seed: 7 });
  const u2 = weightUncertainty(A, 1, { seed: 7 });
  ok(JSON.stringify(u1) === JSON.stringify(u2), 'misma semilla, mismo resultado');
  // a' in [2.5, 3.5] -> w_a in [2.5/3.5, 3.5/4.5]
  const lo = 2.5 / 3.5, hi = 3.5 / 4.5;
  ok(u1.min[0] >= lo - 1e-12 && u1.max[0] <= hi + 1e-12, `w_A dentro de [${lo.toFixed(4)}, ${hi.toFixed(4)}]: [${u1.min[0].toFixed(4)}, ${u1.max[0].toFixed(4)}]`);
  ok(u1.max[0] - u1.min[0] > 0.9 * (hi - lo), 'con 1000 variaciones se recorre casi todo el rango analítico');
  ok(u1.plus.every((x) => x >= 0) && u1.minus.every((x) => x >= 0), 'Δw(+) y Δw(−) no negativos');
  ok(cerca(u1.mean[0], 0.75, 0.01), `media de las variaciones ≈ peso base (${u1.mean[0].toFixed(4)})`);
  ok(u1.accepted === 1000 && cerca(u1.delta, 0.5), 'todas aceptadas (CR=0 en 2×2) y Δ = 0.5 con K=1');
  const u4 = weightUncertainty(A, 4, { seed: 7 });
  ok(cerca(u4.delta, 0.25) && u4.sd[0] < u1.sd[0], `más participantes, menos incertidumbre: sd ${u4.sd[0].toFixed(4)} < ${u1.sd[0].toFixed(4)}`);
  ok(u1.rankProb[0][0] + u1.rankProb[1][0] > 0.999 && u1.rankProb[0][0] > 0.99, 'A es primero en casi todas las variaciones');
}

// 6) Monte Carlo on a 5-criteria matrix: perturbation keeps reciprocity and the ranking probabilities add up.
{
  const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: id }));
  const A = expertMatrix(items, { 'a-b': -2, 'a-c': -3, 'a-d': -1, 'a-e': -4, 'b-c': -1, 'b-d': 1, 'b-e': -2, 'c-d': 1, 'c-e': -1, 'd-e': -2 });
  const B = perturb(A, 0.5, rng(3));
  ok(A.every((r, i) => r.every((_, j) => cerca(B[i][j] * B[j][i], 1, 1e-12))), 'la matriz perturbada sigue siendo recíproca');
  const u = weightUncertainty(A, 3, { seed: 11 });
  ok(u.rankProb.every((r) => cerca(r.reduce((x, y) => x + y, 0), 1, 1e-9)), 'la distribución de rangos de cada elemento suma 1');
  ok(cerca(u.w.reduce((x, y) => x + y, 0), 1, 1e-9) && u.accepted > 0, `pesos suman 1; aceptadas ${u.accepted}/${u.runs}`);
  ok(u.w.every((w, i) => u.min[i] <= w + 1e-12 && u.max[i] >= w - 1e-12), 'el peso base cae dentro de [mín, máx]');
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK (check-ahp-group)');
process.exit(fallos ? 1 : 0);
