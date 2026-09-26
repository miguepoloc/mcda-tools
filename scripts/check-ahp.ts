// Prueba de humo de la matemática AHP. Compara contra valores obtenidos con la herramienta HTML / el Excel del ejercicio.
import { effectiveWeighting, expertsWithJudgments, isObjectiveFor, resultsGate, usesExpertJudgments } from '../src/lib/weightingMode.ts';
import { moveItem } from '../src/lib/reorder.ts';
import { CRIT_SHEET, altSheet, analyze, expertMatrix, indexJudgments, pairsOf, synthesis, sheetResult } from '../src/lib/ahp.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol = 5e-4) => Math.abs(a - b) <= tol;

// 1) Matriz 2x2 [[1,3],[1/3,1]] -> pesos 0.75 / 0.25, CR = 0
{
  const items = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const an = analyze(expertMatrix(items, { 'a-b': -2 })); // a es 3 veces b
  ok(cerca(an.w[0], 0.75) && cerca(an.w[1], 0.25) && an.cr === 0, 'matriz 2x2: pesos 0.75/0.25 y CR = 0');
}
// 2) Matriz perfectamente consistente 3x3 (razones 4:2:1) -> CR ~ 0
{
  const items = ['a', 'b', 'c'].map((id) => ({ id, name: id }));
  const an = analyze(expertMatrix(items, { 'a-b': -1, 'a-c': -3, 'b-c': -1 }));
  ok(cerca(an.w[0], 4 / 7) && an.cr < 1e-9 && an.ok, 'matriz 3x3 consistente (2, 4, 2): CR ≈ 0');
}
// 3) Caso completo del ejemplo (5 criterios × 4 estrategias × 3 expertos) — mismos juicios que "Cargar juicios de ejemplo"
{
  const crit = ['k0', 'k1', 'k2', 'k3', 'k4'].map((id) => ({ id, name: id, hint: '' }));
  const alt = ['a0', 'a1', 'a2', 'a3'].map((id, i) => ({ id, name: ['FT', 'TL', 'SSL', 'DA'][i] }));
  const cs = [5, 4, 2, 3, 2.5];
  const as = [[2, 5, 6, 4], [3, 5, 6, 3], [8, 6, 5, 7], [1.5, 4, 7, 4], [2, 8, 6, 2]];
  const toV = (r: number) => (r >= 1 ? -(Math.min(9, Math.max(1, Math.round(r))) - 1) : Math.min(9, Math.max(1, Math.round(1 / r))) - 1);
  const fac = (e: number, i: number, j: number) => (e % 3 === 0 ? 1 : e % 3 === 1 ? ((i + j) % 2 ? 1.35 : 0.8) : ((i * 2 + j) % 3 === 0 ? 0.75 : 1.3));
  const rows: { expert_id: string; sheet: string; pair_key: string; value: number }[] = [];
  const mk = (items: { id: string }[], sc: (i: number) => number, e: number, sheet: string) =>
    pairsOf(items.length).forEach(([i, j]) => rows.push({ expert_id: 'e' + e, sheet, pair_key: items[i].id + '-' + items[j].id, value: toV((sc(i) / sc(j)) * fac(e, i, j)) }));
  for (let e = 0; e < 3; e++) {
    mk(crit, (i) => cs[i], e, CRIT_SHEET);
    crit.forEach((c, ci) => mk(alt, (i) => as[ci][i], e, altSheet(c.id)));
  }
  const idx = indexJudgments(rows), ids = ['e0', 'e1', 'e2'];
  // Promedio de columnas (procedimiento a mano del curso, Excel y notebook 01): valores de la herramienta HTML / el Excel del ejercicio.
  const rm = sheetResult(CRIT_SHEET, crit, ids, idx, 'mean');
  ok(cerca(rm.agg.cr, 0.0086, 1e-4), `[promedio] CR de criterios = ${rm.agg.cr.toFixed(4)} (esperado 0.0086)`);
  ['0.3204', '0.2378', '0.1170', '0.1875', '0.1373'].forEach((w, i) => ok(cerca(rm.agg.w[i], Number(w), 1e-4), `[promedio] peso criterio ${i + 1} = ${rm.agg.w[i].toFixed(4)} (esperado ${w})`));
  const sm = synthesis(crit, alt, ids, idx, 'mean');
  ok(alt[sm.order[0]].name === 'SSL' && cerca(sm.rows[2].g, 0.349, 1e-3), `[promedio] ganador = ${alt[sm.order[0]].name} con ${sm.rows[sm.order[0]].g.toFixed(4)} (esperado SSL 0.3490)`);
  // Eigenvector de Saaty (predeterminado de la plataforma): valores de numpy.linalg.eig sobre las mismas matrices agregadas.
  const rc = sheetResult(CRIT_SHEET, crit, ids, idx);
  ok(rc.agg.method === 'eigenvector', 'el método predeterminado es el eigenvector');
  ok(cerca(rc.agg.cr, 0.0086, 1e-4), `[eigenvector] CR de criterios = ${rc.agg.cr.toFixed(4)} (esperado 0.0086)`);
  ['0.3207', '0.2381', '0.1166', '0.1872', '0.1374'].forEach((w, i) => ok(cerca(rc.agg.w[i], Number(w), 1e-4), `[eigenvector] peso criterio ${i + 1} = ${rc.agg.w[i].toFixed(4)} (numpy ${w})`));
  const s = synthesis(crit, alt, ids, idx);
  ok(alt[s.order[0]].name === 'SSL' && cerca(s.rows[2].g, 0.3497, 1e-4), `[eigenvector] ganador = ${alt[s.order[0]].name} con ${s.rows[s.order[0]].g.toFixed(4)} (numpy SSL 0.3497)`);
  ok(cerca(s.rows.reduce((a, r) => a + r.g, 0), 1, 1e-9), 'las prioridades globales suman 1');
}
// 4) Sin expertos: no debe fallar (NaN)
{
  const items = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const r = sheetResult(CRIT_SHEET, items, [], {});
  ok(r.agg.w.every((x) => Number.isFinite(x)), 'sin expertos: pesos finitos');
}
// 5) Pesos objetivos (CRITIC/Entropía): los juicios de expertos guardados no deben influir en nada ni bloquear nada
{
  const idx = indexJudgments([
    { expert_id: 'e1', sheet: CRIT_SHEET, pair_key: 'a-b', value: -2 },
    { expert_id: 'e2', sheet: altSheet('a'), pair_key: 'x-y', value: 1 }, // solo hoja de alternativas (sobrante de una fase AHP)
  ]);
  const ids = ['e1', 'e2', 'e3'];
  ok(effectiveWeighting('ahp', 'critic') === 'ahp', 'AHP como método ignora weighting_method');
  ok(effectiveWeighting('topsis', undefined) === 'ahp' && effectiveWeighting('topsis', null) === 'ahp', 'sin weighting_method se asume AHP');
  ok(isObjectiveFor('topsis', 'critic') && isObjectiveFor('fuzzy_topsis', 'entropy') && !isObjectiveFor('topsis', 'ahp') && !isObjectiveFor('ahp', 'critic'), 'objetivo solo con método de matriz + CRITIC/Entropía');
  ok(usesExpertJudgments('vikor', 'ahp') && !usesExpertJudgments('vikor', 'entropy'), 'los juicios cuentan solo con pesos AHP');
  ok(expertsWithJudgments(ids, idx, 'topsis', 'critic').length === 0, 'con CRITIC ningún experto cuenta (aunque tengan juicios guardados)');
  ok(expertsWithJudgments(ids, idx, 'topsis', 'ahp').join() === 'e1', 'método de matriz + AHP: solo cuenta quien pesó la hoja Criterios');
  ok(expertsWithJudgments(ids, idx, 'ahp', 'critic').join() === 'e1,e2', 'AHP: cuenta cualquier hoja (y weighting_method no influye)');
  const g = (mode: 'single' | 'compare', method: 'ahp' | 'topsis', weighting: 'ahp' | 'critic', matrixFilled: boolean, expertCount: number, decidableCount = 0) =>
    resultsGate({ mode, method, weighting, matrixFilled, expertCount, decidableCount });
  ok(g('single', 'topsis', 'critic', true, 0) === null, 'CRITIC con matriz llena y sin expertos: no se bloquea');
  ok(g('single', 'topsis', 'critic', false, 3) === 'no-matrix', 'CRITIC sin matriz: se bloquea solo por la matriz aunque haya expertos');
  ok(g('single', 'topsis', 'ahp', true, 0) === 'no-weight-judgments', 'AHP en método de matriz sin juicios de criterios: mensaje a Expertos, no pesos iguales en silencio');
  ok(g('single', 'topsis', 'ahp', true, 2) === null && g('single', 'topsis', 'ahp', false, 2) === 'no-matrix', 'AHP en método de matriz con juicios: solo depende de la matriz');
  ok(g('single', 'ahp', 'critic', true, 0) === 'no-judgments' && g('single', 'ahp', 'ahp', false, 1) === null, 'AHP como método: bloquea sin juicios');
  ok(g('compare', 'topsis', 'critic', true, 0, 5) === null && g('compare', 'topsis', 'critic', false, 0, 0) === 'compare-nothing', 'Comparativa con CRITIC: depende solo de la matriz');
  ok(g('compare', 'topsis', 'ahp', true, 0, 5) === 'no-weight-judgments', 'Comparativa con AHP y sin juicios: no compara con pesos iguales');
}
// 6) Reordenar criterios/alternativas: los pesos y la síntesis de AHP no deben cambiar (solo el orden en que se muestran)
{
  const items = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
  const juicios = { 'a-b': -2, 'a-c': -4, 'b-c': -1 }; // A gana a B y a C; B gana a C
  const w1 = analyze(expertMatrix(items, juicios)).w;
  const orden = moveItem(items, 0, 2); // B, C, A: las claves guardadas quedan «al revés» respecto del nuevo orden
  const w2 = analyze(expertMatrix(orden, juicios)).w;
  const porId = (its: typeof items, w: number[]) => Object.fromEntries(its.map((x, i) => [x.id, w[i]]));
  const a = porId(items, w1), b = porId(orden, w2);
  ok(['a', 'b', 'c'].every((k) => cerca(a[k], b[k], 1e-9)), 'reordenar los elementos no cambia el peso de ninguno (getV acepta la clave invertida)');
  ok(moveItem([1, 2, 3, 4], 0, 2).join() === '2,3,1,4' && moveItem([1, 2, 3, 4], 3, 0).join() === '4,1,2,3', 'moveItem mueve hacia adelante y hacia atrás');
  ok(moveItem([1, 2, 3], 1, 1).join() === '1,2,3' && moveItem([1, 2, 3], -1, 2).join() === '1,2,3' && moveItem([1, 2, 3], 0, 9).join() === '1,2,3', 'moveItem deja igual lo que está fuera de rango o no se mueve');
  const orig = [1, 2, 3]; moveItem(orig, 0, 2);
  ok(orig.join() === '1,2,3', 'moveItem no modifica el arreglo original');
}
console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
