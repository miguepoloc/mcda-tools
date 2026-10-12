// Genera un .xlsx de un proyecto PROMETHEE y verifica: (1) trae Matriz de decisión + PROMETHEE, no
// Síntesis/AHP; (2) los valores cacheados de la hoja PROMETHEE (Phi neto, Ranking) coinciden con
// prometheeSynthesis() (mismo caso IoT/Palmor que check-promethee.ts); (3) el viaje de ida y vuelta
// por _datos conserva method/decision_matrix.
import { writeFileSync } from 'node:fs';
import XLSX from 'xlsx-js-style';
import { buildWorkbook } from '../src/lib/excel.ts';
import { fromLegacy, isLegacy } from '../src/lib/legacy.ts';
import { aggMatrix, analyze, indexJudgments, pairsOf } from '../src/lib/ahp.ts';
import { normalizePrio, blankPrio } from '../src/lib/prio.ts';
import { blankMatrix, setCell, setType, type DecisionMatrix } from '../src/lib/topsis.ts';
import { prometheeSynthesis } from '../src/lib/promethee.ts';

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
  title: 'Proyecto PROMETHEE de prueba', objective: 'Elegir tecnología IoT para Palmor', criteria, alternatives, experts,
  idx: indexJudgments(rows), prio: normalizePrio(blankPrio()), method: 'promethee' as const, decisionMatrix: dm,
};
const wb = buildWorkbook(XLSX, study);
writeFileSync('/tmp/plataforma_test_promethee.xlsx', XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
console.log('Hojas:', wb.SheetNames.join(' | '));

ok(wb.SheetNames.includes('Matriz de decisión') && wb.SheetNames.includes('PROMETHEE'), 'trae las hojas Matriz de decisión y PROMETHEE');
ok(!wb.SheetNames.includes('Síntesis') && !wb.SheetNames.some((n: string) => n.startsWith('AHP')), 'no arma la Síntesis ni hojas AHP por criterio');

const weights = analyze(aggMatrix(criteria, [Object.fromEntries(rows.filter((r) => r.sheet === 'crit').map((r) => [r.pair_key, r.value]))])).w;
const expected = prometheeSynthesis(criteria, alternatives, dm, weights);

const ws = wb.Sheets['PROMETHEE'];
const n = alternatives.length;
const colL = (i: number) => { let s = '', k = i + 1; while (k > 0) { const r = (k - 1) % 26; s = String.fromCharCode(65 + r) + s; k = Math.floor((k - 1) / 26); } return s; };
const cPhi = colL(n + 3), cRk = colL(n + 4);
const rPi0 = 5 + n + 2; // rG0=5, rPiHead=rG0+n+1, rPi0=rPiHead+1 (ver prometheeSheet() en excel.ts)
alternatives.forEach((a, i) => {
  const r = rPi0 + i;
  const cell = ws[cPhi + r];
  const exp = expected.rows[i];
  ok(!!cell && cerca(cell.v, exp.phi), `PROMETHEE!${cPhi}${r} Phi(${a.name}) = ${cell?.v?.toFixed?.(4)} (esperado ${exp.phi.toFixed(4)})`);
  const rankCell = ws[cRk + r];
  ok(!!rankCell && rankCell.v === exp.rank, `PROMETHEE!${cRk}${r} Ranking(${a.name}) = ${rankCell?.v} (esperado ${exp.rank})`);
});

const wb2 = XLSX.read(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), { type: 'array' });
let t = ''; for (let r = 1; wb2.Sheets['_datos']['A' + r]; r++) t += wb2.Sheets['_datos']['A' + r].v;
const st = JSON.parse(t);
const imp = isLegacy(st) ? fromLegacy(st) : null;
ok(!!imp, 'la hoja _datos es un respaldo v2 válido');
ok(imp?.method === 'promethee', `method reimportado = ${imp?.method} (esperado promethee)`);
ok(JSON.stringify(imp?.decisionMatrix?.values) === JSON.stringify(dm.values), 'decision_matrix.values sobrevive el viaje de ida y vuelta');

// ---- Seis funciones: configuración por criterio (lineal, U, nivel, gaussiana), PROMETHEE I y viaje por _datos ----
{
  const dmC: DecisionMatrix = { ...dm, prometheeConfig: { k0: { fn: 'linear', q: 2, p: 20 }, k1: { fn: 'ushape', q: 1 }, k2: { fn: 'level', q: 0.5, p: 1.5 }, k3: { fn: 'gaussian', s: 1 } } };
  const wbC = buildWorkbook(XLSX, { ...study, decisionMatrix: dmC });
  const wsC = wbC.Sheets['PROMETHEE'];
  const expC = prometheeSynthesis(criteria, alternatives, dmC, weights);
  alternatives.forEach((a, i) => {
    const c = wsC[cPhi + (rPi0 + i)];
    ok(!!c && cerca(c.v, expC.rows[i].phi, 1e-9), `config mixta: Phi(${a.name}) cacheado = ${c?.v?.toFixed?.(6)} (prometheeSynthesis ${expC.rows[i].phi.toFixed(6)}; vs pyDecision en check-promethee-functions.ts)`);
  });
  const nonPi = Object.keys(wsC).filter((k) => !k.startsWith('!') && wsC[k].f);
  ok(!nonPi.some((k) => /SUMPRODUCT|MEDIAN/.test(wsC[k].f)), 'ninguna fórmula usa SUMPRODUCT ni MEDIAN (celdas reales, sin expresiones-arreglo)');
  ok(nonPi.some((k) => /EXP\(/.test(wsC[k].f) && /"Lineal"/.test(wsC[k].f)), 'la preferencia por criterio es una fórmula escalar con IF anidado y EXP');
  const txt = Object.keys(wsC).filter((k) => !k.startsWith('!')).map((k) => String(wsC[k].v));
  ok(['Lineal', 'U', 'Nivel', 'Gaussiana'].every((f) => txt.includes(f)), 'la hoja muestra la función de cada criterio (Lineal, U, Nivel, Gaussiana)');
  ok(txt.includes('PROMETHEE I — orden parcial') && txt.some((t) => t === 'precede'), 'la hoja trae el bloque PROMETHEE I con relaciones');
  const wbC2 = XLSX.read(XLSX.write(wbC, { bookType: 'xlsx', type: 'array' }), { type: 'array' });
  let tt = ''; for (let r = 1; wbC2.Sheets['_datos']['A' + r]; r++) tt += wbC2.Sheets['_datos']['A' + r].v;
  const stC = JSON.parse(tt);
  const impC = isLegacy(stC) ? fromLegacy(stC) : null;
  ok(JSON.stringify(impC?.decisionMatrix?.prometheeConfig) === JSON.stringify(dmC.prometheeConfig), 'prometheeConfig sobrevive el viaje de ida y vuelta por _datos');
}

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
