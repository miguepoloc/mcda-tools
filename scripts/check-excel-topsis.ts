// Genera un .xlsx de un proyecto TOPSIS y verifica: (1) trae hojas Matriz de decisión + TOPSIS, no las
// hojas AHP por criterio; (2) los valores cacheados de la hoja TOPSIS coinciden con topsisSynthesis()
// (mismo caso IoT/Palmor que check-topsis.ts); (3) el viaje de ida y vuelta por _datos conserva method
// y decision_matrix (antes de este cambio, un proyecto no-AHP perdía la matriz al reimportar).
import { writeFileSync } from 'node:fs';
import XLSX from 'xlsx-js-style';
import { buildWorkbook } from '../src/lib/excel.ts';
import { fromLegacy, isLegacy } from '../src/lib/legacy.ts';
import { aggMatrix, analyze, indexJudgments, pairsOf } from '../src/lib/ahp.ts';
import { normalizePrio, blankPrio } from '../src/lib/prio.ts';
import { topsisSynthesis, blankMatrix, setCell, setType, type DecisionMatrix } from '../src/lib/topsis.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol = 5e-3) => Math.abs(a - b) <= tol;

const criteria = ['Alcance', 'Autonomía', 'Infraestructura', 'Madurez'].map((name, i) => ({ id: 'k' + i, name, hint: '' }));
const alternatives = ['LoRaWAN', 'GSM/GPRS', 'Sigfox', 'Zigbee'].map((name, i) => ({ id: 'a' + i, name }));
const dataset = [[10, 8, 2, 5], [10.5, 0.5, 3, 2], [40, 2, 5, 2], [0.07, 1.5, 2, 4]];
let dm: DecisionMatrix = blankMatrix();
alternatives.forEach((a, i) => criteria.forEach((c, j) => { dm = setCell(dm, a.id, c.id, dataset[i][j]); }));
criteria.forEach((c) => { dm = setType(dm, c.id, 'max'); });

// Un único experto con juicios por pares parejos en Criterios (para que los pesos no sean todos iguales
// a 1/n de casualidad, y así la hoja Criterios y la hoja TOPSIS de verdad se encadenen).
const experts = [{ id: 'e0', name: 'Experto 1', role_desc: 'Ingeniero de redes' }];
const rows: { expert_id: string; sheet: string; pair_key: string; value: number }[] = [];
pairsOf(4).forEach(([i, j], n) => rows.push({ expert_id: 'e0', sheet: 'crit', pair_key: `k${i}-k${j}`, value: ((n * 3) % 7) - 3 }));

const study = {
  title: 'Proyecto TOPSIS de prueba', objective: 'Elegir tecnología IoT para Palmor', criteria, alternatives, experts,
  idx: indexJudgments(rows), prio: normalizePrio(blankPrio()), method: 'topsis' as const, decisionMatrix: dm,
};
const wb = buildWorkbook(XLSX, study);
writeFileSync('/tmp/plataforma_test_topsis.xlsx', XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
console.log('Hojas:', wb.SheetNames.join(' | '));

ok(wb.SheetNames.includes('Matriz de decisión') && wb.SheetNames.includes('TOPSIS'), 'trae las hojas Matriz de decisión y TOPSIS');
ok(!wb.SheetNames.includes('Síntesis') && !wb.SheetNames.some((n: string) => n.startsWith('AHP')), 'no arma la Síntesis ni hojas AHP por criterio');

// Pesos reales de la hoja Criterios (agregado del único experto) para comparar contra topsisSynthesis().
const weights = analyze(aggMatrix(criteria, [Object.fromEntries(rows.filter((r) => r.sheet === 'crit').map((r) => [r.pair_key, r.value]))])).w;
const expected = topsisSynthesis(criteria, alternatives, dm, weights);

const ws = wb.Sheets['TOPSIS'];
// Fila de cada alternativa: rV0=5 (ver excel.ts), columna Ci = m+4 = 8 (E), Ranking = m+5 = 9 (F)... calculado con colL.
const m = criteria.length;
const colL = (i: number) => { let s = '', n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const cCi = colL(m + 3), cRk = colL(m + 4);
alternatives.forEach((a, i) => {
  const r = 5 + i;
  const cell = ws[cCi + r];
  const exp = expected.rows[i];
  ok(!!cell && cerca(cell.v, exp.c), `TOPSIS!${cCi}${r} Ci(${a.name}) = ${cell?.v?.toFixed?.(4)} (esperado ${exp.c.toFixed(4)})`);
  const rankCell = ws[cRk + r];
  ok(!!rankCell && rankCell.v === exp.rank, `TOPSIS!${cRk}${r} Ranking(${a.name}) = ${rankCell?.v} (esperado ${exp.rank})`);
});

// ida y vuelta por la hoja oculta _datos: method y decision_matrix deben sobrevivir.
const wb2 = XLSX.read(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), { type: 'array' });
let t = ''; for (let r = 1; wb2.Sheets['_datos']['A' + r]; r++) t += wb2.Sheets['_datos']['A' + r].v;
const st = JSON.parse(t);
const imp = isLegacy(st) ? fromLegacy(st) : null;
ok(!!imp, 'la hoja _datos es un respaldo v2 válido');
ok(imp?.method === 'topsis', `method reimportado = ${imp?.method} (esperado topsis)`);
ok(JSON.stringify(imp?.decisionMatrix?.values) === JSON.stringify(dm.values), 'decision_matrix.values sobrevive el viaje de ida y vuelta');
ok(JSON.stringify(imp?.decisionMatrix?.types) === JSON.stringify(dm.types), 'decision_matrix.types sobrevive el viaje de ida y vuelta');

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
