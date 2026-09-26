// Genera un .xlsx de un proyecto SAW y verifica: (1) trae Matriz de decisión + SAW, no Síntesis/AHP;
// (2) los valores cacheados de la hoja SAW (Puntaje, Ranking) coinciden con sawSynthesis() (mismo
// caso IoT/Palmor que check-saw.ts); (3) el viaje de ida y vuelta por _datos conserva
// method/decision_matrix. SAW no tenía su check-excel-*.ts todavía (auditoría 20 sep 2026).
import { writeFileSync } from 'node:fs';
import XLSX from 'xlsx-js-style';
import { buildWorkbook, colL } from '../src/lib/excel.ts';
import { fromLegacy, isLegacy } from '../src/lib/legacy.ts';
import { aggMatrix, analyze, indexJudgments, pairsOf } from '../src/lib/ahp.ts';
import { normalizePrio, blankPrio } from '../src/lib/prio.ts';
import { blankMatrix, setCell, setType, type DecisionMatrix } from '../src/lib/topsis.ts';
import { sawSynthesis } from '../src/lib/saw.ts';

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
  title: 'Proyecto SAW de prueba', objective: 'Elegir tecnología IoT para Palmor', criteria, alternatives, experts,
  idx: indexJudgments(rows), prio: normalizePrio(blankPrio()), method: 'saw' as const, decisionMatrix: dm,
};
const wb = buildWorkbook(XLSX, study);
writeFileSync('/tmp/plataforma_test_saw.xlsx', XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
console.log('Hojas:', wb.SheetNames.join(' | '));

ok(wb.SheetNames.includes('Matriz de decisión') && wb.SheetNames.includes('SAW'), 'trae las hojas Matriz de decisión y SAW');
ok(!wb.SheetNames.includes('Síntesis') && !wb.SheetNames.some((n: string) => n.startsWith('AHP')), 'no arma la Síntesis ni hojas AHP por criterio');

const weights = analyze(aggMatrix(criteria, [Object.fromEntries(rows.filter((r) => r.sheet === 'crit').map((r) => [r.pair_key, r.value]))])).w;
const expected = sawSynthesis(criteria, alternatives, dm, weights);

const ws = wb.Sheets['SAW'];
const m = criteria.length, n = alternatives.length;
// Layout real de sawSheet() en excel.ts: rN0=6, rV0=rN0+n+1; cScore=m+1, cRk=m+2.
const rV0 = 6 + n + 1;
const cScore = colL(m + 1), cRk = colL(m + 2);
alternatives.forEach((a, i) => {
  const r = rV0 + i;
  const cell = ws[cScore + r];
  const exp = expected.rows[i];
  ok(!!cell && cerca(cell.v, exp.value), `SAW!${cScore}${r} Puntaje(${a.name}) = ${cell?.v?.toFixed?.(4)} (esperado ${exp.value.toFixed(4)})`);
  const rankCell = ws[cRk + r];
  ok(!!rankCell && rankCell.v === exp.rank, `SAW!${cRk}${r} Ranking(${a.name}) = ${rankCell?.v} (esperado ${exp.rank})`);
});

const wb2 = XLSX.read(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), { type: 'array' });
let t = ''; for (let r = 1; wb2.Sheets['_datos']['A' + r]; r++) t += wb2.Sheets['_datos']['A' + r].v;
const st = JSON.parse(t);
const imp = isLegacy(st) ? fromLegacy(st) : null;
ok(!!imp, 'la hoja _datos es un respaldo v2 válido');
ok(imp?.method === 'saw', `method reimportado = ${imp?.method} (esperado saw)`);
ok(JSON.stringify(imp?.decisionMatrix?.values) === JSON.stringify(dm.values), 'decision_matrix.values sobrevive el viaje de ida y vuelta');

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
