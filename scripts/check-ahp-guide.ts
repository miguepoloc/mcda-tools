// Guía de consistencia (src/lib/ahpGuide.ts). Referencias independientes calculadas con numpy.linalg.eig
// (eigenvector principal, RI de Saaty) y el mismo residuo |ln a_ij − ln(w_i/w_j)|; ver scripts/ahp-guide-ref.py.
import { CRIT_SHEET, aggMatrix, analyze, expertMatrix, indexJudgments, pairsOf, setV } from '../src/lib/ahp.ts';
import type { JMap } from '../src/lib/ahp.ts';
import { guideConsistency, guideFromMatrix, nearestValue } from '../src/lib/ahpGuide.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol = 1e-4) => Math.abs(a - b) <= tol;

const crit = ['k0', 'k1', 'k2', 'k3', 'k4'].map((id) => ({ id, name: id }));
const cs = [5, 4, 2, 3, 2.5];
const toV = (r: number) => (r >= 1 ? -(Math.min(9, Math.max(1, Math.round(r))) - 1) : Math.min(9, Math.max(1, Math.round(1 / r))) - 1);
const key = (i: number, j: number) => crit[i].id + '-' + crit[j].id;

// 1) Escala: el entero más cercano, en la codificación del repo
ok(nearestValue(1) === 0, 'razón 1 → value 0');
ok(nearestValue(3.2) === -2, 'razón 3.2 → value -2 (gana el primero, intensidad 3)');
ok(nearestValue(1 / 5.4) === 4, 'razón 1/5.4 → value +4 (gana el segundo, intensidad 5)');
ok(nearestValue(40) === -8 && nearestValue(1 / 40) === 8, 'se satura en ±8');
ok(Object.is(nearestValue(0.999), 0), 'sin -0');

// 2) Caso consistente del ejemplo (3 expertos, CR criterios 0.0086): no debe sugerir nada
{
  const fac = (e: number, i: number, j: number) => (e % 3 === 0 ? 1 : e % 3 === 1 ? ((i + j) % 2 ? 1.35 : 0.8) : ((i * 2 + j) % 3 === 0 ? 0.75 : 1.3));
  const rows: { expert_id: string; sheet: string; pair_key: string; value: number }[] = [];
  for (let e = 0; e < 3; e++) pairsOf(5).forEach(([i, j]) => rows.push({ expert_id: 'e' + e, sheet: CRIT_SHEET, pair_key: key(i, j), value: toV((cs[i] / cs[j]) * fac(e, i, j)) }));
  const idx = indexJudgments(rows);
  const A = aggMatrix(crit, ['e0', 'e1', 'e2'].map((e) => idx[e][CRIT_SHEET]));
  ok(cerca(analyze(A).cr, 0.0086, 1e-4), `CR del ejemplo = ${analyze(A).cr.toFixed(4)} (0.0086)`);
  ok(guideFromMatrix(crit, A, () => null) === null, 'matriz consistente (CR 0.0086): sin sugerencia');
  ok(guideConsistency(crit, idx.e0[CRIT_SHEET]) === null, 'experto con CR < 0.10: sin sugerencia');
}

// 3) Inconsistencia conocida: juicios del experto base (CR 0.0166) con k0-k4 cambiado de -1 a +8
{
  let m: JMap = {};
  pairsOf(5).forEach(([i, j]) => { m = setV(m, crit[i].id, crit[j].id, toV(cs[i] / cs[j])); });
  ok(cerca(analyze(expertMatrix(crit, m)).cr, 0.016642, 1e-5), 'base: CR = 0.0166 (numpy 0.016642)');
  m = setV(m, 'k0', 'k4', 8);
  const an = analyze(expertMatrix(crit, m));
  ok(cerca(an.cr, 0.325336, 1e-5), `modificada: CR = ${an.cr.toFixed(6)} (numpy 0.325336)`);
  const g = guideConsistency(crit, m)!;
  ok(g !== null && g.suggestions.length === 3, 'devuelve 3 pares');
  const s = g.suggestions[0];
  ok(s.pairKey === 'k0-k4' && s.current === 8, 'el par más sospechoso es k0-k4 (el que se cambió)');
  ok(cerca(s.residual, 1.470491, 1e-5), `residuo = ${s.residual.toFixed(6)} (numpy 1.470491)`);
  ok(cerca(s.implied, 0.483486, 1e-5), `razón implícita w0/w4 = ${s.implied.toFixed(6)} (numpy 0.483486)`);
  ok(s.suggested === 1, 'valor sugerido +1 (k4 «levemente» preferido; el original era -1)');
  ok(cerca(s.crAfter, 0.083104, 1e-5) && s.fixes, `CR tras el cambio = ${s.crAfter.toFixed(6)} (numpy 0.083104), < 0.10`);
  ok(g.suggestions[1].residual <= s.residual && g.suggestions[2].residual <= g.suggestions[1].residual, 'ordenados por residuo descendente');
  ok(cerca(g.suggestions[1].residual, 1.154395, 1e-5) && cerca(g.suggestions[2].residual, 1.115575, 1e-5), "segundo y tercer residuo = 1.154395 y 1.115575 (numpy)");
  const second = g.suggestions.find((x) => x.pairKey === 'k2-k4')!;
  ok(!!second && second.suggested === 2 && cerca(second.crAfter, 0.258412, 1e-5) && !second.fixes, 'k2-k4: sugerido 2, CR 0.2584 (numpy), no basta');
  ok(m['k0-k4'] === 8, 'la guía no muta los juicios');
  const fixed = setV(m, 'k0', 'k4', s.suggested);
  ok(analyze(expertMatrix(crit, fixed)).ok && guideConsistency(crit, fixed) === null, 'aplicada la sugerencia, la hoja queda consistente y sin guía');
}

// 4) Bordes
{
  ok(guideConsistency([crit[0], crit[1]], { 'k0-k1': 8 }) === null, '2 elementos: sin guía');
  ok(guideConsistency(crit, {}) === null, 'sin juicios (todo 1): consistente, sin guía');
}

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log('\nGuía de consistencia: todo OK');
