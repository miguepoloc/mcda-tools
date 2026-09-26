// Genera un .xlsx de un proyecto Fuzzy TOPSIS y verifica: (1) trae Matriz de decisión + Fuzzy TOPSIS,
// no Síntesis/AHP; (2) los valores cacheados de la hoja Fuzzy TOPSIS (CC, Ranking) coinciden con
// fuzzyTopsisSynthesis() (mismo caso y etiquetas lingüísticas que check-fuzzy-topsis.ts); (3) el viaje
// de ida y vuelta por _datos conserva method/decision_matrix (con VALORES DE TEXTO, no numéricos).
// Fuzzy TOPSIS no tenía su check-excel-*.ts todavía (auditoría 20 sep 2026).
import { writeFileSync } from 'node:fs';
import XLSX from 'xlsx-js-style';
import { buildWorkbook, colL } from '../src/lib/excel.ts';
import { fromLegacy, isLegacy } from '../src/lib/legacy.ts';
import { aggMatrix, analyze, indexJudgments, pairsOf } from '../src/lib/ahp.ts';
import { normalizePrio, blankPrio } from '../src/lib/prio.ts';
import type { DecisionMatrix } from '../src/lib/types.ts';
import { fuzzyTopsisSynthesis } from '../src/lib/fuzzy_topsis.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol = 5e-3) => Math.abs(a - b) <= tol;

const criteria = ['Alcance', 'Autonomía', 'Infraestructura', 'Madurez'].map((name, i) => ({ id: 'k' + i, name, hint: '' }));
const alternatives = ['LoRaWAN', 'GSM/GPRS', 'Sigfox', 'Zigbee'].map((name, i) => ({ id: 'a' + i, name }));
// Mismas etiquetas que scripts/check-fuzzy-topsis.ts (Sigfox = VG en todo → ganador claro).
const labels: Record<string, Record<string, string>> = {
  a0: { k0: 'G', k1: 'G', k2: 'P', k3: 'VG' },
  a1: { k0: 'G', k1: 'VP', k2: 'F', k3: 'P' },
  a2: { k0: 'VG', k1: 'VG', k2: 'VG', k3: 'VG' },
  a3: { k0: 'VP', k1: 'P', k2: 'P', k3: 'G' },
};
const dm: DecisionMatrix = {
  values: labels as Record<string, Record<string, string | number>>,
  types: { k0: 'max', k1: 'max', k2: 'max', k3: 'max' },
};

const experts = [{ id: 'e0', name: 'Experto 1', role_desc: 'Ingeniero de redes' }];
const rows: { expert_id: string; sheet: string; pair_key: string; value: number }[] = [];
pairsOf(4).forEach(([i, j], n) => rows.push({ expert_id: 'e0', sheet: 'crit', pair_key: `k${i}-k${j}`, value: ((n * 3) % 7) - 3 }));

const study = {
  title: 'Proyecto Fuzzy TOPSIS de prueba', objective: 'Elegir tecnología IoT para Palmor', criteria, alternatives, experts,
  idx: indexJudgments(rows), prio: normalizePrio(blankPrio()), method: 'fuzzy_topsis' as const, decisionMatrix: dm,
};
const wb = buildWorkbook(XLSX, study);
writeFileSync('/tmp/plataforma_test_fuzzy_topsis.xlsx', XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
console.log('Hojas:', wb.SheetNames.join(' | '));

ok(wb.SheetNames.includes('Matriz de decisión') && wb.SheetNames.includes('Fuzzy TOPSIS'), 'trae las hojas Matriz de decisión y Fuzzy TOPSIS');
ok(!wb.SheetNames.includes('Síntesis') && !wb.SheetNames.some((n: string) => n.startsWith('AHP')), 'no arma la Síntesis ni hojas AHP por criterio');

const weights = analyze(aggMatrix(criteria, [Object.fromEntries(rows.filter((r) => r.sheet === 'crit').map((r) => [r.pair_key, r.value]))])).w;
const expected = fuzzyTopsisSynthesis(criteria, alternatives, dm, weights);

const ws = wb.Sheets['Fuzzy TOPSIS'];
const m = criteria.length, n = alternatives.length;
// Layout real de fuzzyTopsisSheet() en excel.ts: cada criterio ocupa 3 cols (l,m,u); tras ellas
// vienen d+, d-, CC, Ranking. Filas: escala(5) → pesos → encabezado → etiquetas(n) → FDM(n) →
// normalizada(n) → ponderada(n) → FPIS/FNIS(2) → distancias/CC(n).
const totalCritCols = 3 * m;
const cCC = colL(totalCritCols + 3), cRk = colL(totalCritCols + 4);
const rScale0 = 2, rW = rScale0 + 5 + 1, rHead = rW + 1, rLblHead = rHead + 1, rLbl0 = rLblHead + 1,
  rFDMHead = rLbl0 + n + 1, rFDM0 = rFDMHead + 1, rNHead = rFDM0 + n + 1, rN0 = rNHead + 1,
  rVHead = rN0 + n + 1, rV0 = rVHead + 1, rFPIS = rV0 + n, rFNIS = rFPIS + 1, rDistHead = rFNIS + 2,
  rDist0 = rDistHead + 1;

alternatives.forEach((a, i) => {
  const r = rDist0 + i;
  const cell = ws[cCC + r];
  const exp = expected.rows[i];
  ok(!!cell && cerca(cell.v, exp.value), `Fuzzy TOPSIS!${cCC}${r} CC(${a.name}) = ${cell?.v?.toFixed?.(4)} (esperado ${exp.value.toFixed(4)})`);
  const rankCell = ws[cRk + r];
  ok(!!rankCell && rankCell.v === exp.rank, `Fuzzy TOPSIS!${cRk}${r} Ranking(${a.name}) = ${rankCell?.v} (esperado ${exp.rank})`);
});
ok(alternatives[expected.order[0]].name === 'Sigfox', `ganador = ${alternatives[expected.order[0]].name} (esperado Sigfox)`);

const wb2 = XLSX.read(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), { type: 'array' });
let t = ''; for (let r = 1; wb2.Sheets['_datos']['A' + r]; r++) t += wb2.Sheets['_datos']['A' + r].v;
const st = JSON.parse(t);
const imp = isLegacy(st) ? fromLegacy(st) : null;
ok(!!imp, 'la hoja _datos es un respaldo v2 válido');
ok(imp?.method === 'fuzzy_topsis', `method reimportado = ${imp?.method} (esperado fuzzy_topsis)`);
ok(JSON.stringify(imp?.decisionMatrix?.values) === JSON.stringify(dm.values), 'decision_matrix.values (etiquetas de texto) sobrevive el viaje de ida y vuelta');

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
