// Real expert panel (2019 buoy study, 4 experts x 5 criteria; see scripts/validation/data/encuesta-2019.json).
// Reference values: numpy.linalg.eig on the same matrices + the consensus equations of Goepel (2018) in Python.
// It shows why the diagnostics exist: two experts are very inconsistent (CR 0.69 and 0.49) and consensus is low,
// yet the geometric-mean aggregate looks fine (CR 0.035).
import fixture from './validation/data/encuesta-2019.json' with { type: 'json' };
import { analyze } from '../src/lib/ahp.ts';
import { consensus, weightUncertainty } from '../src/lib/ahpGroup.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol = 1e-5) => Math.abs(a - b) <= tol;

const Ms: number[][][] = fixture.experts.map((e) => e.matrix);
const n = fixture.criteria.length;
const ref = {
  per: [[0.409588, 0.103024, 0.167217, 0.040485, 0.279686], [0.530686, 0.186304, 0.15513, 0.109401, 0.01848], [0.351736, 0.091217, 0.09791, 0.05039, 0.408747], [0.0544, 0.061345, 0.046425, 0.24587, 0.59196]],
  crs: [0.059248, 0.686348, 0.060153, 0.491905],
  group: [0.354934, 0.120158, 0.131741, 0.115836, 0.277331], groupCr: 0.035237, sStar: 0.587361,
};

const per = Ms.map((M) => analyze(M, 'eigenvector'));
ok(Ms.every((M) => M.every((r, i) => r.every((x, j) => cerca(x * M[j][i], 1, 1e-6)))), 'las 4 matrices son recíprocas (las celdas con formato de hora eran fracciones: 8:00 = 1/3)');
per.forEach((a, i) => ok(a.w.every((w, j) => cerca(w, ref.per[i][j])) && cerca(a.cr, ref.crs[i]), `experto ${i + 1}: pesos y CR (${a.cr.toFixed(4)}) coinciden con numpy`));

const G = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => Math.exp(Ms.reduce((s, M) => s + Math.log(M[i][j]), 0) / Ms.length)));
const g = analyze(G, 'eigenvector');
ok(g.w.every((w, j) => cerca(w, ref.group[j])) && cerca(g.cr, ref.groupCr), `grupo (media geométrica): pesos y CR = ${g.cr.toFixed(4)} coinciden con numpy`);

const c = consensus(per.map((a) => a.w))!;
ok(cerca(c.sStar, ref.sStar) && c.category === 'low', `consenso S* = ${(c.sStar * 100).toFixed(1)} % (${c.category}); Python ${(ref.sStar * 100).toFixed(1)} %`);
ok(per.filter((a) => !a.ok).length === 2 && g.ok, 'dos expertos inconsistentes (CR ≥ 0.1) y el agregado sí «consistente»: el agregado esconde el desacuerdo');

const u = weightUncertainty(G, Ms.length, { seed: 2019, method: 'eigenvector' });
ok(u.accepted > 900 && u.w.every((w, i) => u.min[i] <= w && w <= u.max[i]), `Monte Carlo: ${u.accepted}/${u.runs} variaciones aceptadas; el peso base cae en [mín, máx]`);
console.log('     ' + fixture.criteria.map((name, i) => `${name}: ${(u.w[i] * 100).toFixed(1)} % (−${(u.minus[i] * 100).toFixed(1)} / +${(u.plus[i] * 100).toFixed(1)}), P(1.º) ${(u.rankProb[i][0] * 100).toFixed(0)} %`).join('\n     '));

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK (check-ahp-encuesta)');
process.exit(fallos ? 1 : 0);
