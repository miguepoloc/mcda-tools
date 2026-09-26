// Desglose AHP didáctico: fija los números del ejemplo Precio/Calidad/Tiempo de las diapositivas 14-29 de la Sesión 2 y comprueba que
// los helpers nuevos (powerIterations, idealSynthesis, equalWeightsSynthesis, buildAhpBreakdownData) cuadran con `analyze`/`synthesis`.
import type { JIndex } from '../src/lib/ahp.ts';
import { analyze, idealSynthesis, equalWeightsSynthesis, powerIterations, principalEigenvector, synthesis, sheetResult, CRIT_SHEET, altSheet } from '../src/lib/ahp.ts';
import { buildAhpBreakdownData, riFor } from '../src/lib/ahpBreakdown.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const vec = (v: number[], d = 4) => '[' + v.map((x) => x.toFixed(d)).join(', ') + ']';

// Diapositiva 14: matriz Precio / Calidad / Tiempo
const A = [[1, 3, 5], [1 / 3, 1, 3], [1 / 5, 1 / 3, 1]];

{
  const m = analyze(A, 'mean');
  ok(m.wMean.every((x, i) => cerca(x, [0.6333, 0.2605, 0.1062][i], 6e-5)), `promedio de columnas = ${vec(m.wMean)} (diapositiva 16: 63.3 / 26.0 / 10.6 %)`);
  ok(cerca(m.lam, 3.0387, 6e-5) && cerca(m.ci, 0.0194, 6e-5) && cerca(m.cr, 0.0334, 6e-4), `λmax = ${m.lam.toFixed(4)}, CI = ${m.ci.toFixed(4)}, CR = ${m.cr.toFixed(4)} (diapositivas 21-26: 3.04 / 0.020 / ≈3.4 %)`);
  const e = analyze(A, 'eigenvector');
  ok(e.wEigen.every((x, i) => cerca(x, [0.6370, 0.2583, 0.1047][i], 6e-5)) && cerca(e.lam, 3.0385, 6e-5), `eigenvector = ${vec(e.wEigen)}, λmax = ${e.lam.toFixed(4)} (diapositiva 18: 63.7 / 25.8 / 10.5 %)`);
  ok(cerca(m.diff, 0.0037, 6e-4), `diferencia máxima entre procedimientos = ${(m.diff * 100).toFixed(2)} pp (diapositiva 18: ≈0.4 pp)`);
}

{
  const it = powerIterations(A, 6);
  ok(it.length === 7 && it.every((w) => cerca(w.reduce((a, b) => a + b, 0), 1, 1e-12)), 'powerIterations: 7 vectores (w⁰…w⁶), cada uno suma 1');
  ok(it[0].every((x) => cerca(x, 1 / 3, 1e-12)), 'w⁰ = pesos iguales (0.333…)');
  ok(it[1].every((x, i) => cerca(x, [0.605, 0.291, 0.103][i], 6e-4)), `w¹ = ${vec(it[1], 3)} (diapositiva 18: 0.605, 0.291, 0.103)`);
  ok(it[2].every((x, i) => cerca(x, [0.640, 0.257, 0.103][i], 6e-4)), `w² = ${vec(it[2], 3)} (diapositiva 18: 0.640, 0.257, 0.103)`);
  ok(it[6].every((x, i) => cerca(x, [0.63699, 0.25828, 0.10473][i], 6e-5)), `w⁶ = ${vec(it[6], 5)} (diapositiva 18: 0.63699, 0.25828, 0.10473)`);
  const lim = principalEigenvector(A);
  ok(it[6].every((x, i) => cerca(x, lim[i], 5e-5)), 'w⁶ ya coincide con el eigenvector límite a 4 decimales');
  ok(it.slice(1).every((w, k) => Math.max(...w.map((x, i) => Math.abs(x - lim[i]))) <= Math.max(...it[k].map((x, i) => Math.abs(x - lim[i]))) + 1e-12), 'cada iteración se acerca (no se aleja) del límite');
}

// Diapositiva 29: síntesis A/B con los pesos del ejemplo; y el modo ideal calculado a mano
{
  const wr = analyze(A, 'mean').wMean;
  const loc = [[0.75, 0.25, 0.5], [0.25, 0.75, 0.5]];
  const P = loc.map((r) => r.reduce((a, x, c) => a + wr[c] * x, 0));
  ok(cerca(P[0], 0.593, 1e-3) && cerca(P[1], 0.407, 1e-3), `P_A = ${P[0].toFixed(3)}, P_B = ${P[1].toFixed(3)} (diapositiva 29: 59.3 % / 40.7 %)`);
  const id = idealSynthesis(wr, loc);
  // a mano: mejor por criterio = (0.75, 0.75, 0.5) → L'_A = (1, 1/3, 1), L'_B = (1/3, 1, 1)
  const rawA = wr[0] * 1 + wr[1] / 3 + wr[2] * 1, rawB = wr[0] / 3 + wr[1] * 1 + wr[2] * 1;
  ok(id.best.every((b, c) => cerca(b, [0.75, 0.75, 0.5][c], 1e-12)), 'modo ideal: divisor = mejor local de cada criterio (0.75, 0.75, 0.50)');
  ok(cerca(id.raw[0], rawA, 1e-12) && cerca(id.raw[1], rawB, 1e-12), `modo ideal: P'_A = ${id.raw[0].toFixed(4)}, P'_B = ${id.raw[1].toFixed(4)} (a mano ${rawA.toFixed(4)}, ${rawB.toFixed(4)})`);
  ok(cerca(id.norm[0] + id.norm[1], 1, 1e-12) && id.rank[0] === 1 && id.rank[1] === 2, 'modo ideal: normalizado suma 1 y A sigue 1.º');
  const eq = equalWeightsSynthesis(loc);
  ok(cerca(eq.score[0], (0.75 + 0.25 + 0.5) / 3, 1e-12) && cerca(eq.score[1], (0.25 + 0.75 + 0.5) / 3, 1e-12) && eq.rank[0] === 1 && eq.rank[1] === 1, 'pesos iguales: media de las locales (A y B empatan 0.5 → misma posición)');
  // una alternativa que es la mejor en todo vale exactamente 1 en modo ideal
  const dom = idealSynthesis([0.5, 0.5], [[0.6, 0.7], [0.4, 0.3]]);
  ok(cerca(dom.raw[0], 1, 1e-12) && cerca(dom.raw[1], 0.5 * (0.4 / 0.6) + 0.5 * (0.3 / 0.7), 1e-12), 'modo ideal: la dominante vale 1; la otra, su fracción respecto a la mejor');
}

// buildAhpBreakdownData cuadra con sheetResult / synthesis (un experto que reproduce la matriz de las diapositivas)
{
  // ratio(v): v < 0 gana el primero con intensidad |v|+1 → 3 = −2, 5 = −4
  const crit = [{ id: 'p', name: 'Precio' }, { id: 'c', name: 'Calidad' }, { id: 't', name: 'Tiempo' }] as never[];
  const alts = [{ id: 'a', name: 'Opción A' }, { id: 'b', name: 'Opción B' }] as never[];
  // Opción A vs B por criterio: Precio 3 (A gana), Calidad 1/3 (gana B con 3), Tiempo igual
  const idx: JIndex = { e1: { [CRIT_SHEET]: { 'p-c': -2, 'p-t': -4, 'c-t': -2 }, [altSheet('p')]: { 'a-b': -2 }, [altSheet('c')]: { 'a-b': 2 }, [altSheet('t')]: { 'a-b': 0 } } };
  const d = buildAhpBreakdownData({ criteria: crit, alternatives: alts, experts: [{ id: 'e1', label: 'Experto 1', role: 'ML' }], used: ['e1'], idx, weightMethod: 'mean', withAlternatives: true });
  const ref = sheetResult(CRIT_SHEET, crit, ['e1'], idx, 'mean');
  ok(d.sheets.length === 4 && d.sheets[0].key === CRIT_SHEET && d.sheets[1].key === altSheet('p'), 'hojas: criterios + una por criterio');
  ok(d.sheets[0].agg.w.every((x, i) => cerca(x, ref.agg.w[i], 1e-15)) && d.sheets[0].agg.w.every((x, i) => cerca(x, [0.6333, 0.2605, 0.1062][i], 6e-5)), 'hoja de criterios: pesos idénticos a sheetResult y a la diapositiva 16');
  const s0 = d.sheets[0];
  ok(cerca(s0.ratios.reduce((a, b) => a + b, 0) / 3, s0.agg.lam, 1e-12), 'λmax = promedio de los cocientes (A·w)_i / w_i');
  ok(s0.Aw.every((x, i) => cerca(x, s0.ratios[i] * s0.agg.w[i], 1e-12)), '(A·w)_i = cociente × w_i');
  ok(s0.expertA.length === 1 && s0.totalPairs === 3 && s0.answered[0] === 3, 'un experto, 3 juicios de 3 posibles');
  const syn = synthesis(crit, alts, ['e1'], idx, 'mean');
  ok(d.synthesis!.synth.rows.every((r, i) => cerca(r.g, syn.rows[i].g, 1e-15)) && cerca(d.synthesis!.synth.rows[0].g, 0.593, 1e-3), 'síntesis del desglose = synthesis() y = diapositiva 29 (59.3 %)');
  const sinAlt = buildAhpBreakdownData({ criteria: crit, alternatives: alts, experts: [], used: ['e1'], idx, weightMethod: 'eigenvector', withAlternatives: false });
  ok(sinAlt.sheets.length === 1 && !sinAlt.synthesis && sinAlt.experts[0].label === 'Experto', 'withAlternatives=false: solo hoja de criterios y sin síntesis');
  ok(riFor(3) === 0.58 && riFor(4) === 0.9 && riFor(10) === 1.49 && riFor(12) === 1.49 && riFor(2) === 0, 'riFor coincide con la tabla RI de la plataforma');
}

if (fallos) { console.error(`\n${fallos} comprobación(es) fallaron`); process.exit(1); }
console.log('\nTodo bien.');
