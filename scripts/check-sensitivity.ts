// Pruebas de la sensibilidad fija (lib/sensitivity.ts) y de la comparación entre rankings (lib/rankCompare.ts).
// Caso Palmor (mismo que check-saw/check-electre); ρ y τ contrastados con el ejemplo de la plantilla del informe comparativo (§4.5):
// AHP = Sigfox, LoRaWAN, GSM/GPRS, Zigbee; VIKOR invierte 2.º y 3.º → ρ = 0.80, τ = 0.67.
import type { Alternative, Criterion, DecisionMatrix } from '../src/lib/types.ts';
import { analyzeSensitivity, buildRankFn, describeElectreSensitivity, describeSensitivity, electreThresholdSensitivity, redistribute, vikorVSensitivity } from '../src/lib/sensitivity.ts';
import { electreCompareInfo, kendall, midRanks, pairwiseAgreement, spearman, summarizeAgreement } from '../src/lib/rankCompare.ts';
import { electreSynthesis } from '../src/lib/electre.ts';
import { topsisSynthesis } from '../src/lib/topsis.ts';
import { sawSynthesis } from '../src/lib/saw.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

// ---- rankCompare: valores conocidos ------------------------------------------------------------------------------------------------
{
  const ahp = [1, 2, 3, 4], vikor = [1, 3, 2, 4]; // alternativas en el orden [Sigfox, LoRaWAN, GSM/GPRS, Zigbee]
  ok(cerca(spearman(ahp, vikor)!, 0.8), `Spearman ρ AHP–VIKOR = ${spearman(ahp, vikor)!.toFixed(4)} (plantilla: 0.80)`);
  ok(cerca(kendall(ahp, vikor)!, 4 / 6), `Kendall τ AHP–VIKOR = ${kendall(ahp, vikor)!.toFixed(4)} (plantilla: 0.67)`);
  ok(cerca(spearman(ahp, ahp)!, 1) && cerca(kendall(ahp, ahp)!, 1), 'mismo orden → ρ = τ = 1');
  ok(cerca(spearman(ahp, [4, 3, 2, 1])!, -1) && cerca(kendall(ahp, [4, 3, 2, 1])!, -1), 'orden invertido → ρ = τ = −1');
  ok(midRanks([1, 2, 2, 4]).join() === '1,2.5,2.5,4', 'puestos promedio con empate: 1, 2.5, 2.5, 4');
  ok(cerca(spearman([1, 2, 2, 4], [1, 2, 3, 4])!, 4.5 / Math.sqrt(22.5)), 'ρ con empate = Pearson de puestos promedio (0.9487)');
  ok(cerca(kendall([1, 2, 2, 4], [1, 2, 3, 4])!, 5 / Math.sqrt(30)), 'τ-b con empate = 5/√30 (0.9129)');
  ok(spearman([1, 1, 1], [1, 2, 3]) === null && kendall([1, 1, 1], [1, 2, 3]) === null, 'ranking constante → null (no se inventa una correlación)');
  ok(spearman([1], [1]) === null, 'una sola alternativa → null');
  // n=5 sin empates, 1 − 6Σd²/[n(n²−1)]: d = [0,1,1,0,0]... (1,2,3,4,5) vs (1,3,2,4,5) → Σd²=2 → 1 − 12/120 = 0.9
  ok(cerca(spearman([1, 2, 3, 4, 5], [1, 3, 2, 4, 5])!, 0.9), 'fórmula 1 − 6Σd²/[n(n²−1)] (n = 5) = 0.90');

  const names = ['Sigfox', 'LoRaWAN', 'GSM/GPRS', 'Zigbee'];
  const methods = [{ key: 'ahp', label: 'AHP', ranks: ahp }, { key: 'vikor', label: 'VIKOR', ranks: vikor }, { key: 'saw', label: 'SAW', ranks: [1, 2, 3, 4] }];
  const pairs = pairwiseAgreement(methods);
  ok(pairs.length === 3, 'tres pares de tres métodos');
  ok(pairs[0].sameFirst && pairs[0].sameLast, 'AHP–VIKOR coinciden en 1.º y último');
  const s = summarizeAgreement(names, methods);
  ok(s.sameFirst && s.sameLast && !s.allSame, 'resumen: coinciden en 1.º y último, no en todo');
  ok(s.differing.join() === 'LoRaWAN,GSM/GPRS', `resumen: difieren en ${s.differing.join(', ')}`);
  ok(/Coinciden en el 1\.º \(Sigfox\) y en el último \(Zigbee\); difieren en la posición de LoRaWAN y GSM\/GPRS/.test(s.headline), 'frase resumen: ' + s.headline);
  const same = summarizeAgreement(names, [methods[0], methods[2]]);
  ok(same.allSame && /mismo orden/.test(same.headline), 'mismos rankings → «mismo orden»');
  const d1 = summarizeAgreement(names, [{ key: 'a', label: 'A', ranks: [1, 2, 3, 4] }, { key: 'b', label: 'B', ranks: [2, 1, 3, 4] }]);
  ok(!d1.sameFirst && /NO en el 1\.º|ni en el 1\.º/.test(d1.headline), 'distinto 1.º se dice sin rodeos');
}

// ---- Caso Palmor: sensibilidad con las funciones reales de los métodos ------------------------------------------------------------
const criteria: Criterion[] = ['Alcance', 'Autonomía', 'Infraestructura', 'Madurez'].map((n, i) => ({ id: 'c' + i, name: n, hint: '' }));
const alternatives: Alternative[] = ['LoRaWAN', 'GSM/GPRS', 'Sigfox', 'Zigbee'].map((n, i) => ({ id: 'a' + i, name: n }));
const data = [[10, 8, 2, 5], [10.5, 0.5, 3, 2], [40, 2, 5, 2], [0.07, 1.5, 2, 4]];
const dm: DecisionMatrix = { values: {}, types: {} };
alternatives.forEach((a, i) => { dm.values[a.id] = {}; criteria.forEach((c, j) => { dm.values[a.id][c.id] = data[i][j]; }); });
criteria.forEach((c) => { dm.types[c.id] = 'max'; });
const W = [0.16, 0.25, 0.488, 0.102];
const names = criteria.map((c) => c.name);

{
  const r = redistribute(W, 2, 0.3);
  ok(cerca(r.reduce((a, b) => a + b, 0), 1) && cerca(r[2], 0.3), 'redistribute: suma 1 y fija el peso pedido');
  ok(cerca(r[0] / r[1], W[0] / W[1]), 'redistribute: los demás conservan su proporción');
  ok(cerca(redistribute([0, 0, 1], 2, 0.4).reduce((a, b) => a + b, 0), 1) && cerca(redistribute([0, 0, 1], 2, 0.4)[0], 0.3), 'redistribute: si los demás eran 0, reparte a partes iguales');
}

for (const method of ['saw', 'topsis', 'promethee', 'vikor'] as const) {
  const fn = buildRankFn(method, { criteria, alternatives, dm })!;
  const rows = fn(W);
  // coincide con la síntesis que muestra la pantalla
  const ref = method === 'saw' ? sawSynthesis(criteria, alternatives, dm, W).rows.map((r) => r.rank) : method === 'topsis' ? topsisSynthesis(criteria, alternatives, dm, W).rows.map((r) => r.rank) : rows.map((r) => r.rank);
  ok(rows.map((r) => r.rank).join() === ref.join(), `${method}: buildRankFn(pesos base) = síntesis de la pantalla`);
  ok(rows.find((r) => r.rank === 1)!.name === 'Sigfox', `${method}: ganador base = Sigfox`);
  const res = analyzeSensitivity(fn, names, W);
  ok(res.scenarios[0].kind === 'base' && res.scenarios[1].kind === 'equal', `${method}: escenarios base + pesos iguales primero`);
  ok(res.scenarios.length === 2 + 2 * criteria.length && res.total === res.scenarios.length - 1, `${method}: 1 base + 1 iguales + 2 por criterio (${res.scenarios.length})`);
  ok(res.scenarios.every((s) => cerca(s.weights.reduce((a, b) => a + b, 0), 1)), `${method}: todos los escenarios suman 1`);
  const up2 = res.scenarios.find((s) => s.id === 'up2')!;
  ok(cerca(up2.weights[2], W[2] * 1.2), `${method}: «Infraestructura +20 %» fija el peso en ${(W[2] * 1.2).toFixed(4)}`);
  ok(res.kept === res.scenarios.slice(1).filter((s) => s.winners.join() === 'Sigfox').length, `${method}: kept = escenarios con el mismo ganador (${res.kept}/${res.total})`);
  // el punto crítico es un punto de quiebre real: justo antes gana el base, justo después otro
  res.critical.forEach((c) => {
    (['down', 'up'] as const).forEach((dir) => {
      const fl = c[dir];
      if (!fl) return;
      const eps = 2e-4;
      const before = fn(redistribute(res.baseWeights, c.criterion, fl.weight + (dir === 'down' ? eps : -eps))).find((r) => r.rank === 1)!.name;
      const after = fn(redistribute(res.baseWeights, c.criterion, fl.weight + (dir === 'down' ? -eps : eps))).find((r) => r.rank === 1)!.name;
      ok(before === 'Sigfox' && after !== 'Sigfox' && fl.newWinners.length === 1 && fl.newWinners[0] === after, `${method}: quiebre de «${c.name}» ${dir} en ${fl.weight.toFixed(4)} (Sigfox → ${after})`);
    });
  });
  const t = describeSensitivity(res);
  ok(t.headline.length > 20 && /Sigfox/.test(t.headline), `${method}: texto «${t.headline}»`);
}

{
  // Plantilla §5.4: bajando Infraestructura, LoRaWAN pasa a ganar en TOPSIS «por debajo de ≈ 39 %» (los demás reescalados). Aquí se comprueba el orden de magnitud.
  const fn = buildRankFn('topsis', { criteria, alternatives, dm })!;
  const res = analyzeSensitivity(fn, names, W);
  const infra = res.critical[2];
  console.log(`     (informativo) TOPSIS, quiebre bajando Infraestructura: ${infra.down ? infra.down.weight.toFixed(3) + ' → ' + infra.down.newWinners.join('/') : 'no cambia'}; subiendo: ${infra.up ? infra.up.weight.toFixed(3) : 'no cambia'}`);
  ok(!!infra.down && infra.down.newWinners.includes('LoRaWAN') && infra.down.weight > 0.3 && infra.down.weight < 0.45, 'TOPSIS: al bajar Infraestructura gana LoRaWAN, cerca del 0.39 de la plantilla');
}

{
  // Robusto: una alternativa que domina en todo gana con cualquier peso
  const dom: DecisionMatrix = { values: { a0: { c0: 9, c1: 9 }, a1: { c0: 5, c1: 5 }, a2: { c0: 1, c1: 2 } }, types: { c0: 'max', c1: 'max' } };
  const cr = [{ id: 'c0', name: 'X', hint: '' }, { id: 'c1', name: 'Y', hint: '' }];
  const al = [{ id: 'a0', name: 'Dominante' }, { id: 'a1', name: 'Medio' }, { id: 'a2', name: 'Malo' }];
  const res = analyzeSensitivity(buildRankFn('topsis', { criteria: cr, alternatives: al, dm: dom })!, ['X', 'Y'], [0.5, 0.5]);
  ok(res.robust && res.kept === res.total && res.critical.every((c) => !c.down && !c.up), 'alternativa dominante: robusto, sin puntos de quiebre');
  const t = describeSensitivity(res);
  ok(t.verdict === 'robust' && /robusta/.test(t.headline) && /Ningún criterio/.test(t.points.join(' ')), 'texto de robustez: ' + t.headline);
}

{
  // Empate en el escenario base (sin datos): no hay «ganador» que medir
  const empty: DecisionMatrix = { values: {}, types: {} };
  const res = analyzeSensitivity(buildRankFn('saw', { criteria, alternatives, dm: empty })!, names, W);
  ok(!res.hasWinner && describeSensitivity(res).verdict === 'none', 'sin datos: no hay ganador único ni veredicto de sensibilidad');
}

{
  // AHP: recalcula con prioridades locales
  const rows = [{ name: 'A', loc: [0.7, 0.2] }, { name: 'B', loc: [0.3, 0.8] }];
  const fn = buildRankFn('ahp', { criteria: criteria.slice(0, 2), alternatives: alternatives.slice(0, 2), dm, ahpRows: rows })!;
  ok(fn([0.6, 0.4]).find((r) => r.rank === 1)!.name === 'A' && fn([0.2, 0.8]).find((r) => r.rank === 1)!.name === 'B', 'AHP: g = Σ peso·local cambia de ganador según los pesos');
  const res = analyzeSensitivity(fn, ['C1', 'C2'], [0.6, 0.4]);
  const c1 = res.critical[0];
  // g_A = 0.7w+0.2(1−w), g_B = 0.3w+0.8(1−w): empatan en w = 0.6/1.0... 0.5w+0.2 = 0.8−0.5w → w = 0.6 → en el peso base hay empate exacto; tomo otro base
  void c1;
  const res2 = analyzeSensitivity(fn, ['C1', 'C2'], [0.8, 0.2]);
  ok(res2.critical[0].down != null && cerca(res2.critical[0].down!.weight, 0.6, 1e-3), `AHP: punto de quiebre analítico w1 = 0.60 (obtenido ${res2.critical[0].down?.weight.toFixed(4)})`);
  ok(buildRankFn('ahp', { criteria, alternatives, dm }) === null && buildRankFn('electre', { criteria, alternatives, dm }) === null, 'AHP sin prioridades locales y ELECTRE: no hay rankFn (no se inventa un ranking)');
}

{
  // Pesos definidos por el usuario: van aparte y no cuentan en kept/total
  const fn = buildRankFn('saw', { criteria, alternatives, dm })!;
  const res = analyzeSensitivity(fn, names, W, { userWeights: [{ label: 'Panel B', weights: [1, 1, 1, 1] }, { label: 'mal tamaño', weights: [1, 2] }] });
  ok(res.userScenarios.length === 1 && res.userScenarios[0].label === 'Panel B' && res.total === 2 + 2 * 4 - 1, 'pesos del usuario: 1 escenario válido, fuera del conteo');
}

{
  // VIKOR v y ELECTRE c*/d*
  const rows = vikorVSensitivity(criteria, alternatives, dm, W, 0.5);
  ok(rows.map((r) => r.v).join() === '0.25,0.5,0.75', 'VIKOR: v = 0.25, 0.5, 0.75');
  ok(rows.every((r) => r.winners.length === 1 && r.winners[0] === 'Sigfox'), 'VIKOR (Palmor): Sigfox primero por Q con v = 0.25/0.5/0.75');
  const th = electreThresholdSensitivity(criteria, alternatives, dm, W, 0.65, 0.3);
  ok(th[0].isBase && th[0].relations === 2 && th[0].incomparable === 4 && th[0].pairs === 6, `ELECTRE c*=0.65/d*=0.30: 2 relaciones, 4 pares incomparables de 6 (${th[0].relations}/${th[0].incomparable})`);
  ok(th.length >= 3 && th.length <= 5, `ELECTRE: ${th.length} combinaciones`);
  const strict = th.find((t) => t.label.startsWith('Más exigente'))!;
  ok(strict.relations <= th[0].relations, 'más exigente → no aparecen relaciones nuevas');
  const loose = th.find((t) => t.label.startsWith('Menos exigente'))!;
  ok(loose.relations >= th[0].relations, 'menos exigente → no desaparecen relaciones');
  const de = describeElectreSensitivity(th);
  ok(/2 relaciones/.test(de.headline) && /4 de 6 pares/.test(de.headline) && de.points.length === 2, 'texto ELECTRE: ' + de.headline);
  const clamp = electreThresholdSensitivity(criteria, alternatives, dm, W, 1, 0);
  ok(new Set(clamp.map((t) => t.cStar + '|' + t.dStar)).size === clamp.length, 'combinaciones recortadas a [0,1] no se repiten');
  const info = electreCompareInfo(electreSynthesis(criteria, alternatives, dm, W, 0.65, 0.3));
  ok(info.relations.length === 2 && info.incomparable.length === 4 && info.winner === null, 'electreCompareInfo: 2 relaciones, 4 incomparables, sin ganador único (Sigfox y LoRaWAN incomparables)');
  ok(info.out[2] === 1 && info.inn[3] === 1, 'electreCompareInfo: Sigfox supera a 1 (GSM/GPRS), Zigbee es superada por 1 (LoRaWAN)');
}

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log('\nSensibilidad y comparación de rankings: todo bien');
