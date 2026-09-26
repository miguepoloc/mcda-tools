// Genera un .xlsx de un proyecto ELECTRE y verifica: (1) trae Matriz de decisión + ELECTRE, no
// Síntesis/AHP; (2) las grillas cacheadas de concordancia/discordancia/relación y la superación neta
// coinciden con electreSynthesis() (mismo caso IoT/Palmor que check-electre.ts); (3) el viaje de ida y
// vuelta por _datos conserva method/decision_matrix.
import { writeFileSync } from 'node:fs';
import XLSX from 'xlsx-js-style';
import { buildWorkbook } from '../src/lib/excel.ts';
import { fromLegacy, isLegacy } from '../src/lib/legacy.ts';
import { aggMatrix, analyze, indexJudgments, pairsOf } from '../src/lib/ahp.ts';
import { normalizePrio, blankPrio } from '../src/lib/prio.ts';
import { blankMatrix, setCell, setType, type DecisionMatrix } from '../src/lib/topsis.ts';
import { electreSynthesis } from '../src/lib/electre.ts';

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
  title: 'Proyecto ELECTRE de prueba', objective: 'Elegir tecnología IoT para Palmor', criteria, alternatives, experts,
  idx: indexJudgments(rows), prio: normalizePrio(blankPrio()), method: 'electre' as const, decisionMatrix: dm,
};
const wb = buildWorkbook(XLSX, study);
writeFileSync('/tmp/plataforma_test_electre.xlsx', XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
console.log('Hojas:', wb.SheetNames.join(' | '));

ok(wb.SheetNames.includes('Matriz de decisión') && wb.SheetNames.includes('ELECTRE'), 'trae las hojas Matriz de decisión y ELECTRE');
ok(!wb.SheetNames.includes('Síntesis') && !wb.SheetNames.some((n: string) => n.startsWith('AHP')), 'no arma la Síntesis ni hojas AHP por criterio');

const weights = analyze(aggMatrix(criteria, [Object.fromEntries(rows.filter((r) => r.sheet === 'crit').map((r) => [r.pair_key, r.value]))])).w;
const expected = electreSynthesis(criteria, alternatives, dm, weights);

const ws = wb.Sheets['ELECTRE'];
const n = alternatives.length;
const colL = (i: number) => { let s = '', k = i + 1; while (k > 0) { const r = (k - 1) % 26; s = String.fromCharCode(65 + r) + s; k = Math.floor((k - 1) / 26); } return s; };
// Mismo cómputo de filas que electreSheet() en excel.ts: concordancia, luego una grilla de discordancia
// POR CRITERIO (m de ellas), luego la discordancia combinada (MAX de las anteriores), luego relación.
const m = criteria.length;
// rG0 = 7: rHead=2, rP=3, rW=4, más 2 filas de celdas editables c*/d* (rCStarCell=5, rDStarCell=6) antes
// de la matriz g — ver electreSheet() en excel-electre-sheet.ts.
const rG0 = 7, rConHead = rG0 + n + 1, rCon0 = rConHead + 1;
const rDisCritHead = criteria.map((_, j) => rCon0 + n + 1 + j * (n + 2));
const rDisHead = rDisCritHead[m - 1] + n + 2, rDis0 = rDisHead + 1, rRelHead = rDis0 + n + 1, rRel0 = rRelHead + 1;
const cNet = colL(n + 1);

alternatives.forEach((a, i) => {
  alternatives.forEach((b, k) => {
    const conCell = ws[colL(1 + k) + (rCon0 + i)], disCell = ws[colL(1 + k) + (rDis0 + i)];
    ok(!!conCell && cerca(conCell.v, expected.result.concordance[i][k]), `ELECTRE concordancia(${a.name},${b.name}) = ${conCell?.v?.toFixed?.(4)} (esperado ${expected.result.concordance[i][k].toFixed(4)})`);
    ok(!!disCell && cerca(disCell.v, expected.result.discordance[i][k]), `ELECTRE discordancia(${a.name},${b.name}) = ${disCell?.v?.toFixed?.(4)} (esperado ${expected.result.discordance[i][k].toFixed(4)})`);
    if (i !== k) {
      const relCell = ws[colL(1 + k) + (rRel0 + i)];
      const esperaSi = expected.result.outranks[i][k];
      ok((relCell?.v === 'Sí') === esperaSi, `ELECTRE relación(${a.name} supera a ${b.name}) = "${relCell?.v ?? ''}" (esperado ${esperaSi ? 'Sí' : 'vacío'})`);
    }
  });
  const netCell = ws[cNet + (rRel0 + i)];
  ok(!!netCell && netCell.v === expected.netOutdegree[i], `ELECTRE superación neta(${a.name}) = ${netCell?.v} (esperado ${expected.netOutdegree[i]})`);
});

// Bloque «Núcleo»: filas tras la lista de relaciones e incomparables (ver electreSheet()).
{
  const rRelSum = rRel0 + n, rInc = rRelSum + 2 + expected.relations.length;
  const rKer0 = rInc + 1 + Math.max(1, expected.incomparable.length) + 2;
  ok(ws['A' + (rKer0 - 2)]?.v === 'Núcleo de la relación de superación', `bloque «Núcleo» en la fila ${rKer0 - 2}`);
  alternatives.forEach((a, i) => {
    const out = expected.result.outranks[i].filter(Boolean).length, inn = expected.result.outranks.filter((row) => row[i]).length;
    ok(ws['B' + (rKer0 + i)]?.v === out && ws['B' + (rKer0 + i)]?.f?.includes('COUNTIF'), `núcleo: «${a.name}» supera a ${ws['B' + (rKer0 + i)]?.v} (esperado ${out}, fórmula viva)`);
    ok(ws['C' + (rKer0 + i)]?.v === inn && ws['C' + (rKer0 + i)]?.f?.includes('COUNTIF'), `núcleo: «${a.name}» es superada por ${ws['C' + (rKer0 + i)]?.v} (esperado ${inn}, fórmula viva)`);
    ok(ws['E' + (rKer0 + i)]?.v === (expected.kernel.members.includes(i) ? 'Sí' : 'No'), `núcleo: «${a.name}» en el núcleo = ${ws['E' + (rKer0 + i)]?.v} (esperado ${expected.kernel.members.includes(i) ? 'Sí' : 'No'})`);
  });
  ok(typeof ws['A' + (rKer0 + n)]?.v === 'string' && /núcleo|ganador/i.test(ws['A' + (rKer0 + n)].v), 'el bloque trae la frase de resumen del núcleo');
}

const wb2 = XLSX.read(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), { type: 'array' });
let t = ''; for (let r = 1; wb2.Sheets['_datos']['A' + r]; r++) t += wb2.Sheets['_datos']['A' + r].v;
const st = JSON.parse(t);
const imp = isLegacy(st) ? fromLegacy(st) : null;
ok(!!imp, 'la hoja _datos es un respaldo v2 válido');
ok(imp?.method === 'electre', `method reimportado = ${imp?.method} (esperado electre)`);
ok(JSON.stringify(imp?.decisionMatrix?.values) === JSON.stringify(dm.values), 'decision_matrix.values sobrevive el viaje de ida y vuelta');

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
