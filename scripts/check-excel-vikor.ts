// Genera un .xlsx de un proyecto VIKOR y verifica: (1) trae Matriz de decisión + VIKOR, no Síntesis/AHP;
// (2) los valores cacheados de la hoja VIKOR (Q, Ranking) coinciden con vikorSynthesis() (mismo caso
// IoT/Palmor que check-vikor.ts); (3) el viaje de ida y vuelta por _datos conserva method/decision_matrix.
import { writeFileSync } from 'node:fs';
import XLSX from 'xlsx-js-style';
import { buildWorkbook } from '../src/lib/excel.ts';
import { fromLegacy, isLegacy } from '../src/lib/legacy.ts';
import { aggMatrix, analyze, indexJudgments, pairsOf } from '../src/lib/ahp.ts';
import { normalizePrio, blankPrio } from '../src/lib/prio.ts';
import { blankMatrix, getKind, getTarget, setCell, setTarget, setType, type DecisionMatrix } from '../src/lib/topsis.ts';
import { vikorSynthesis } from '../src/lib/vikor.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol = 5e-3) => Math.abs(a - b) <= tol;

const criteria = ['Alcance', 'Autonomía', 'Infraestructura', 'Madurez'].map((name, i) => ({ id: 'k' + i, name, hint: '' }));
const alternatives = ['LoRaWAN', 'GSM/GPRS', 'Sigfox', 'Zigbee'].map((name, i) => ({ id: 'a' + i, name }));
const dataset = [[10, 8, 2, 5], [10.5, 0.5, 3, 2], [40, 2, 5, 2], [0.07, 1.5, 2, 4]];
let dm: DecisionMatrix = blankMatrix();
alternatives.forEach((a, i) => criteria.forEach((c, j) => { dm = setCell(dm, a.id, c.id, dataset[i][j]); }));
criteria.forEach((c) => { dm = setType(dm, c.id, 'max'); });

const experts = [{ id: 'e0', name: 'Experto 1', role_desc: 'Ingeniero de redes' }];
const rows: { expert_id: string; sheet: string; pair_key: string; value: number }[] = [];
pairsOf(4).forEach(([i, j], n) => rows.push({ expert_id: 'e0', sheet: 'crit', pair_key: `k${i}-k${j}`, value: ((n * 3) % 7) - 3 }));

const study = {
  title: 'Proyecto VIKOR de prueba', objective: 'Elegir tecnología IoT para Palmor', criteria, alternatives, experts,
  idx: indexJudgments(rows), prio: normalizePrio(blankPrio()), method: 'vikor' as const, decisionMatrix: dm,
};
const wb = buildWorkbook(XLSX, study);
writeFileSync('/tmp/plataforma_test_vikor.xlsx', XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
console.log('Hojas:', wb.SheetNames.join(' | '));

ok(wb.SheetNames.includes('Matriz de decisión') && wb.SheetNames.includes('VIKOR'), 'trae las hojas Matriz de decisión y VIKOR');
ok(!wb.SheetNames.includes('Síntesis') && !wb.SheetNames.some((n: string) => n.startsWith('AHP')), 'no arma la Síntesis ni hojas AHP por criterio');

const weights = analyze(aggMatrix(criteria, [Object.fromEntries(rows.filter((r) => r.sheet === 'crit').map((r) => [r.pair_key, r.value]))])).w;
const expected = vikorSynthesis(criteria, alternatives, dm, weights);

const ws = wb.Sheets['VIKOR'];
const m = criteria.length;
const colL = (i: number) => { let s = '', n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const cQ = colL(m + 3), cRk = colL(m + 4);
alternatives.forEach((a, i) => {
  const r = 6 + i; // rV0 = 6, ver vikorSheet() en excel.ts
  const cell = ws[cQ + r];
  const exp = expected.rows[i];
  ok(!!cell && cerca(cell.v, exp.q), `VIKOR!${cQ}${r} Q(${a.name}) = ${cell?.v?.toFixed?.(4)} (esperado ${exp.q.toFixed(4)})`);
  const rankCell = ws[cRk + r];
  ok(!!rankCell && rankCell.v === exp.rank, `VIKOR!${cRk}${r} Ranking(${a.name}) = ${rankCell?.v} (esperado ${exp.rank})`);
});

const wb2 = XLSX.read(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), { type: 'array' });
let t = ''; for (let r = 1; wb2.Sheets['_datos']['A' + r]; r++) t += wb2.Sheets['_datos']['A' + r].v;
const st = JSON.parse(t);
const imp = isLegacy(st) ? fromLegacy(st) : null;
ok(!!imp, 'la hoja _datos es un respaldo v2 válido');
ok(imp?.method === 'vikor', `method reimportado = ${imp?.method} (esperado vikor)`);
ok(JSON.stringify(imp?.decisionMatrix?.values) === JSON.stringify(dm.values), 'decision_matrix.values sobrevive el viaje de ida y vuelta');

// ---- v editable: la celda de v y las fórmulas de Q usan el v guardado, y sobrevive el respaldo ----
{
  const dm03: DecisionMatrix = { ...dm, vikorV: 0.3 };
  const wb3 = buildWorkbook(XLSX, { ...study, decisionMatrix: dm03 });
  const ws3 = wb3.Sheets['VIKOR'];
  const exp3 = vikorSynthesis(criteria, alternatives, dm03, weights);
  const nAlt = alternatives.length;
  const rVin = 6 + nAlt + 4; // rRmax + 1, ver vikorSheet()
  ok(ws3['B' + rVin]?.v === 0.3, `celda v (B${rVin}) = ${ws3['B' + rVin]?.v} (esperado 0.3)`);
  ok(String(ws3[cQ + 6]?.f).includes('$B$' + rVin), `las fórmulas de Q apuntan a la celda de v ($B$${rVin}), no a un 0.5 escrito a mano`);
  alternatives.forEach((a, i) => ok(cerca(ws3[cQ + (6 + i)].v, exp3.rows[i].q), `v=0.3: Q(${a.name}) = ${ws3[cQ + (6 + i)].v.toFixed(4)} (esperado ${exp3.rows[i].q.toFixed(4)})`));
  ok(exp3.rows.some((r, i) => Math.abs(r.q - expected.rows[i].q) > 1e-3), 'v = 0.3 sí cambia Q respecto a v = 0.5 (la prueba distingue)');
  const wb3b = XLSX.read(XLSX.write(wb3, { bookType: 'xlsx', type: 'array' }), { type: 'array' });
  let t3 = ''; for (let r = 1; wb3b.Sheets['_datos']['A' + r]; r++) t3 += wb3b.Sheets['_datos']['A' + r].v;
  const imp3 = fromLegacy(JSON.parse(t3));
  ok(imp3.decisionMatrix.vikorV === 0.3, `vikorV sobrevive el viaje de ida y vuelta por _datos (= ${imp3.decisionMatrix.vikorV})`);
}

// ---- criterio OBJETIVO: el tipo y el objetivo sobreviven el respaldo _datos ----
{
  let dmT: DecisionMatrix = setType(dm, 'k0', 'target');
  dmT = setTarget(dmT, 'k0', { value: 12, tol: 1.5 });
  const wbT = buildWorkbook(XLSX, { ...study, decisionMatrix: dmT });
  const wbTb = XLSX.read(XLSX.write(wbT, { bookType: 'xlsx', type: 'array' }), { type: 'array' });
  let tt = ''; for (let r = 1; wbTb.Sheets['_datos']['A' + r]; r++) tt += wbTb.Sheets['_datos']['A' + r].v;
  const impT = fromLegacy(JSON.parse(tt));
  ok(getKind(impT.decisionMatrix, 'k0') === 'target' && getTarget(impT.decisionMatrix, 'k0')?.value === 12 && getTarget(impT.decisionMatrix, 'k0')?.tol === 1.5, 'tipo objetivo, valor y tolerancia sobreviven el viaje de ida y vuelta por _datos');
}

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
