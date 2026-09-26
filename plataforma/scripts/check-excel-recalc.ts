// Recálculo REAL en LibreOffice headless para SAW y Fuzzy TOPSIS, mismo mecanismo que el README
// documenta para VIKOR/PROMETHEE/ELECTRE (20 sep 2026 noche): arruina a propósito el valor cacheado
// de cada celda con fórmula (deja la fórmula intacta), fuerza un recálculo real en un motor de hoja de
// cálculo de verdad (no el mismo JS que armó el archivo), y confirma que el resultado recalculado
// coincide con el esperado. Si esto pasara solo por comparar contra el valor cacheado, no probaría nada:
// ese valor lo puso el mismo código que se está verificando.
//
// Requiere LibreOffice (`soffice`) instalado. Usa un perfil de usuario temporal con
// "recalcular siempre al abrir" forzado (por defecto LibreOffice NO recalcula fórmulas con valor
// cacheado al abrir un .xlsx).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx-js-style';
import { buildWorkbook, colL } from '../src/lib/excel.ts';
import { aggMatrix, analyze, indexJudgments, pairsOf } from '../src/lib/ahp.ts';
import { normalizePrio, blankPrio } from '../src/lib/prio.ts';
import { blankMatrix, setCell, setTarget, setType, resolveTargets, type DecisionMatrix } from '../src/lib/topsis.ts';
import { sawSynthesis } from '../src/lib/saw.ts';
import { fuzzyTopsisSynthesis } from '../src/lib/fuzzy_topsis.ts';
import { vikorSynthesis } from '../src/lib/vikor.ts';
import { electreSynthesis } from '../src/lib/electre.ts';
import { criticWeights, entropyWeights } from '../src/lib/weights.ts';
import { defuzzifyMatrix } from '../src/lib/fuzzy_topsis.ts';
import type { DecisionMatrix as DM, Method } from '../src/lib/types.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol = 5e-3) => Math.abs(a - b) <= tol;

function findSoffice(): string {
  for (const candidate of ['soffice', '/opt/homebrew/bin/soffice', '/usr/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice']) {
    try { execFileSync(candidate, ['--version'], { stdio: 'ignore' }); return candidate; } catch { /* probar el siguiente */ }
  }
  throw new Error('LibreOffice (soffice) no encontrado — instálalo para correr este chequeo.');
}

const profileDir = path.join(tmpdir(), 'plataforma_lo_profile');
function setupProfile() {
  const userDir = path.join(profileDir, 'user');
  mkdirSync(userDir, { recursive: true });
  // OOXMLRecalcMode/ODFRecalcMode = 0 → "recalcular siempre al abrir" (por defecto LibreOffice
  // confía en el valor cacheado de un .xlsx y no recalcula nada).
  writeFileSync(path.join(userDir, 'registrymodifications.xcu'), `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
 <item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item>
 <item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="ODFRecalcMode" oor:op="fuse"><value>0</value></prop></item>
</oor:items>`);
}

function recalcViaLibreOffice(soffice: string, corruptedPath: string, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  execFileSync(soffice, [
    '--headless', '--norestore', '--nolockcheck', '--nodefault',
    `-env:UserInstallation=file://${profileDir}`,
    '--convert-to', 'xlsx:Calc MS Excel 2007 XML',
    '--outdir', outDir, corruptedPath,
  ], { stdio: 'pipe', timeout: 60_000 });
  return path.join(outDir, path.basename(corruptedPath));
}

/** Arruina el valor cacheado (`.v`) de toda celda con fórmula en la hoja `sheetName`, deja `.f` intacta. */
function corruptCachedValues(wb: any, sheetName: string): number {
  const ws = wb.Sheets[sheetName];
  let n = 0;
  for (const addr of Object.keys(ws)) {
    if (addr.startsWith('!')) continue;
    const cell = ws[addr];
    if (cell && cell.f && cell.t === 'n') { cell.v = -999999; n++; }
  }
  return n;
}

const soffice = findSoffice();
setupProfile();

// ---- SAW ----
{
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
  const nCorrupted = corruptCachedValues(wb, 'SAW') + corruptCachedValues(wb, 'Criterios');
  const corruptPath = path.join(tmpdir(), 'plataforma_recalc_saw.xlsx');
  writeFileSync(corruptPath, XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
  console.log(`SAW: ${nCorrupted} celdas con fórmula arruinadas a propósito, recalculando en LibreOffice…`);
  const outDir = path.join(tmpdir(), 'plataforma_recalc_out_saw');
  const recalced = recalcViaLibreOffice(soffice, corruptPath, outDir);
  const wbOut = XLSX.read(readFileSync(recalced), { type: 'buffer' });
  const ws = wbOut.Sheets['SAW'];
  const weights = analyze(aggMatrix(criteria, [Object.fromEntries(rows.filter((r) => r.sheet === 'crit').map((r) => [r.pair_key, r.value]))])).w;
  const expected = sawSynthesis(criteria, alternatives, dm, weights);
  const m = criteria.length, n = alternatives.length, rV0 = 6 + n + 1;
  const cScore = colL(m + 1), cRk = colL(m + 2);
  alternatives.forEach((a, i) => {
    const r = rV0 + i;
    const cell = ws[cScore + r];
    ok(!!cell && cerca(cell.v, expected.rows[i].value),
      `[LibreOffice recalculó] SAW!${cScore}${r} Puntaje(${a.name}) = ${cell?.v?.toFixed?.(4)} (esperado ${expected.rows[i].value.toFixed(4)})`);
    const rankCell = ws[cRk + r];
    ok(!!rankCell && rankCell.v === expected.rows[i].rank,
      `[LibreOffice recalculó] SAW!${cRk}${r} Ranking(${a.name}) = ${rankCell?.v} (esperado ${expected.rows[i].rank})`);
  });
}

// ---- Fuzzy TOPSIS ----
{
  const criteria = ['Alcance', 'Autonomía', 'Infraestructura', 'Madurez'].map((name, i) => ({ id: 'k' + i, name, hint: '' }));
  const alternatives = ['LoRaWAN', 'GSM/GPRS', 'Sigfox', 'Zigbee'].map((name, i) => ({ id: 'a' + i, name }));
  const labels: Record<string, Record<string, string>> = {
    a0: { k0: 'G', k1: 'G', k2: 'P', k3: 'VG' },
    a1: { k0: 'G', k1: 'VP', k2: 'F', k3: 'P' },
    a2: { k0: 'VG', k1: 'VG', k2: 'VG', k3: 'VG' },
    a3: { k0: 'VP', k1: 'P', k2: 'P', k3: 'G' },
  };
  const dm: DM = { values: labels as Record<string, Record<string, string | number>>, types: { k0: 'max', k1: 'max', k2: 'max', k3: 'max' } };
  const experts = [{ id: 'e0', name: 'Experto 1', role_desc: 'Ingeniero de redes' }];
  const rows: { expert_id: string; sheet: string; pair_key: string; value: number }[] = [];
  pairsOf(4).forEach(([i, j], n) => rows.push({ expert_id: 'e0', sheet: 'crit', pair_key: `k${i}-k${j}`, value: ((n * 3) % 7) - 3 }));
  const study = {
    title: 'Proyecto Fuzzy TOPSIS de prueba', objective: 'Elegir tecnología IoT para Palmor', criteria, alternatives, experts,
    idx: indexJudgments(rows), prio: normalizePrio(blankPrio()), method: 'fuzzy_topsis' as const, decisionMatrix: dm,
  };
  const wb = buildWorkbook(XLSX, study);
  const nCorrupted = corruptCachedValues(wb, 'Fuzzy TOPSIS') + corruptCachedValues(wb, 'Criterios');
  const corruptPath = path.join(tmpdir(), 'plataforma_recalc_fuzzy.xlsx');
  writeFileSync(corruptPath, XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
  console.log(`Fuzzy TOPSIS: ${nCorrupted} celdas con fórmula arruinadas a propósito, recalculando en LibreOffice…`);
  const outDir = path.join(tmpdir(), 'plataforma_recalc_out_fuzzy');
  const recalced = recalcViaLibreOffice(soffice, corruptPath, outDir);
  const wbOut = XLSX.read(readFileSync(recalced), { type: 'buffer' });
  const ws = wbOut.Sheets['Fuzzy TOPSIS'];
  const weights = analyze(aggMatrix(criteria, [Object.fromEntries(rows.filter((r) => r.sheet === 'crit').map((r) => [r.pair_key, r.value]))])).w;
  const expected = fuzzyTopsisSynthesis(criteria, alternatives, dm, weights);
  const m = criteria.length, n = alternatives.length, totalCritCols = 3 * m;
  const cCC = colL(totalCritCols + 3), cRk = colL(totalCritCols + 4);
  const rScale0 = 2, rW = rScale0 + 5 + 1, rHead = rW + 1, rLblHead = rHead + 1, rLbl0 = rLblHead + 1,
    rFDMHead = rLbl0 + n + 1, rFDM0 = rFDMHead + 1, rNHead = rFDM0 + n + 1, rN0 = rNHead + 1,
    rVHead = rN0 + n + 1, rV0 = rVHead + 1, rFPIS = rV0 + n, rFNIS = rFPIS + 1, rDistHead = rFNIS + 2,
    rDist0 = rDistHead + 1;
  alternatives.forEach((a, i) => {
    const r = rDist0 + i;
    const cell = ws[cCC + r];
    ok(!!cell && cerca(cell.v, expected.rows[i].value),
      `[LibreOffice recalculó] Fuzzy TOPSIS!${cCC}${r} CC(${a.name}) = ${cell?.v?.toFixed?.(4)} (esperado ${expected.rows[i].value.toFixed(4)})`);
    const rankCell = ws[cRk + r];
    ok(!!rankCell && rankCell.v === expected.rows[i].rank,
      `[LibreOffice recalculó] Fuzzy TOPSIS!${cRk}${r} Ranking(${a.name}) = ${rankCell?.v} (esperado ${expected.rows[i].rank})`);
  });
}

// ---- VIKOR: v editable + condiciones de Opricovic & Tzeng (fórmulas vivas) ----
// Dos casos: IoT/Palmor con v = 0.3 (ganador que cambia el Q respecto a v = 0.5) y el viaje (3 rutas, todos
// costo) con v = 0.5, donde falla la condición 1 y hay conjunto de compromiso. Se arruinan las celdas con
// fórmula y se compara lo que recalcula LibreOffice contra vikorSynthesis().
for (const caso of ['iot', 'viaje', 'solar'] as const) {
  const criteria = (caso === 'iot' ? ['Alcance', 'Autonomía', 'Infraestructura', 'Madurez'] : caso === 'solar' ? ['Voltaje (V)', 'Irradiación'] : ['Precio', 'Tiempo', 'Distancia']).map((name, i) => ({ id: 'k' + i, name, hint: '' }));
  const alternatives = (caso === 'iot' ? ['LoRaWAN', 'GSM/GPRS', 'Sigfox', 'Zigbee'] : caso === 'solar' ? ['Sitio A', 'Sitio B', 'Sitio C', 'Sitio D'] : ['Ruta Norte', 'Ruta Centro', 'Ruta Sur']).map((name, i) => ({ id: 'a' + i, name }));
  const dataset = caso === 'iot' ? [[10, 8, 2, 5], [10.5, 0.5, 3, 2], [40, 2, 5, 2], [0.07, 1.5, 2, 4]] : caso === 'solar' ? [[108, 5.2], [112, 4.6], [120, 5.8], [127, 5.0]] : [[95, 3.5, 280], [65, 5.5, 260], [80, 4.5, 340]];
  let dm: DecisionMatrix = blankMatrix();
  alternatives.forEach((a, i) => criteria.forEach((c, j) => { dm = setCell(dm, a.id, c.id, dataset[i][j]); }));
  criteria.forEach((c) => { dm = setType(dm, c.id, caso === 'iot' || caso === 'solar' ? 'max' : 'min'); });
  if (caso === 'iot') dm = { ...dm, vikorV: 0.3 };
  // solar: el voltaje es un criterio OBJETIVO (110 V ± 5.5, es decir ±5 %), la irradiación es beneficio
  if (caso === 'solar') { dm = setType(dm, 'k0', 'target'); dm = setTarget(dm, 'k0', { value: 110, tol: 5.5 }); }
  const experts = [{ id: 'e0', name: 'Experto 1', role_desc: 'Ingeniero de redes' }];
  const rows: { expert_id: string; sheet: string; pair_key: string; value: number }[] = [];
  pairsOf(criteria.length).forEach(([i, j], n) => rows.push({ expert_id: 'e0', sheet: 'crit', pair_key: `k${i}-k${j}`, value: ((n * 3) % 7) - 3 }));
  const study = {
    title: 'Proyecto VIKOR de prueba', objective: 'Elegir', criteria, alternatives, experts,
    idx: indexJudgments(rows), prio: normalizePrio(blankPrio()), method: 'vikor' as const, decisionMatrix: dm,
  };
  const wb = buildWorkbook(XLSX, study);
  const nCorrupted = corruptCachedValues(wb, 'VIKOR') + corruptCachedValues(wb, 'Criterios') + corruptCachedValues(wb, 'Matriz de decisión');
  const corruptPath = path.join(tmpdir(), `plataforma_recalc_vikor_${caso}.xlsx`);
  writeFileSync(corruptPath, XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
  console.log(`VIKOR (${caso}): ${nCorrupted} celdas con fórmula arruinadas a propósito, recalculando en LibreOffice…`);
  const recalced = recalcViaLibreOffice(soffice, corruptPath, path.join(tmpdir(), `plataforma_recalc_out_vikor_${caso}`));
  const wbRe = XLSX.read(readFileSync(recalced), { type: 'buffer' });
  const ws = wbRe.Sheets['VIKOR'];
  if (caso === 'solar') {
    // matriz efectiva de la hoja «Matriz de decisión»: recalculada por LibreOffice, distancia = MAX(0, |x − 110| − 5.5)
    const wm = wbRe.Sheets['Matriz de decisión'];
    const rEffData0 = 5 + alternatives.length + 1 + 1 + 2 + 1 + 1; // rDataRaw0 + n + (rTarget, rTol) ... ver matrixSheet()
    alternatives.forEach((a, i) => ok(!!wm['B' + (rEffData0 + i)] && cerca(wm['B' + (rEffData0 + i)].v, Math.max(0, Math.abs(dataset[i][0] - 110) - 5.5), 1e-6), `[LibreOffice recalculó] Matriz efectiva: distancia del voltaje de ${a.name} = ${wm['B' + (rEffData0 + i)]?.v} (esperado ${Math.max(0, Math.abs(dataset[i][0] - 110) - 5.5)})`));
  }
  const weights = analyze(aggMatrix(criteria, [Object.fromEntries(rows.filter((r) => r.sheet === 'crit').map((r) => [r.pair_key, r.value]))])).w;
  const dmEff = resolveTargets(criteria, alternatives, dm);
  const exp = vikorSynthesis(criteria, alternatives, dmEff, weights);
  const m = criteria.length, n = alternatives.length, rV0 = 6, rRmax = rV0 + n + 3;
  const rVin = rRmax + 1, rDQ = rVin + 1, rDeltaQ = rDQ + 1, rC1 = rDeltaQ + 1, rC2 = rC1 + 1, rVerd = rC2 + 1;
  const cQ = colL(m + 3), cRk = colL(m + 4), cSet = colL(m + 5);
  ok(ws['B' + rVin]?.v === exp.v, `[LibreOffice] VIKOR!B${rVin} v = ${ws['B' + rVin]?.v} (esperado ${exp.v})`);
  alternatives.forEach((a, i) => {
    const r = rV0 + i;
    ok(!!ws[cQ + r] && cerca(ws[cQ + r].v, exp.rows[i].q), `[LibreOffice recalculó] VIKOR (${caso}) Q(${a.name}) = ${ws[cQ + r]?.v?.toFixed?.(4)} (esperado ${exp.rows[i].q.toFixed(4)})`);
    ok(ws[cRk + r]?.v === exp.rows[i].rank, `[LibreOffice recalculó] VIKOR (${caso}) Ranking(${a.name}) = ${ws[cRk + r]?.v} (esperado ${exp.rows[i].rank})`);
    ok(ws[cSet + r]?.v === (exp.verdict!.set.includes(i) ? 'Sí' : 'No'), `[LibreOffice recalculó] VIKOR (${caso}) En conjunto(${a.name}) = ${ws[cSet + r]?.v} (esperado ${exp.verdict!.set.includes(i) ? 'Sí' : 'No'})`);
  });
  ok(cerca(ws['B' + rDQ]?.v, exp.verdict!.dq), `[LibreOffice recalculó] VIKOR (${caso}) DQ = ${ws['B' + rDQ]?.v} (esperado ${exp.verdict!.dq.toFixed(4)})`);
  ok(cerca(ws['B' + rDeltaQ]?.v, exp.verdict!.deltaQ), `[LibreOffice recalculó] VIKOR (${caso}) ΔQ = ${ws['B' + rDeltaQ]?.v?.toFixed?.(4)} (esperado ${exp.verdict!.deltaQ.toFixed(4)})`);
  ok(ws['B' + rC1]?.v === (exp.verdict!.c1 ? 'Sí' : 'No'), `[LibreOffice recalculó] VIKOR (${caso}) Condición 1 = ${ws['B' + rC1]?.v} (esperado ${exp.verdict!.c1 ? 'Sí' : 'No'})`);
  ok(ws['B' + rC2]?.v === (exp.verdict!.c2 ? 'Sí' : 'No'), `[LibreOffice recalculó] VIKOR (${caso}) Condición 2 = ${ws['B' + rC2]?.v} (esperado ${exp.verdict!.c2 ? 'Sí' : 'No'})`);
  const esperadoVerd = exp.verdict!.kind === 'unique' ? 'Ganador único' : exp.verdict!.kind === 'two' ? 'Sin ganador único: se proponen el 1º y el 2º' : 'Sin ganador único: conjunto de compromiso (columna «En conjunto de compromiso»)';
  ok(ws['B' + rVerd]?.v === esperadoVerd, `[LibreOffice recalculó] VIKOR (${caso}) Veredicto = ${ws['B' + rVerd]?.v}`);
}

// ---- ELECTRE: c*/d* editables (fórmulas vivas) ----
// A diferencia de check-excel-electre.ts (que solo compara contra el valor cacheado, calculado por el
// mismo JS que arma el archivo), aquí se usan c*/d* DISTINTOS del default de la plataforma (0.65/0.30 →
// 0.30/0.90, mucho más laxos: pasa de 2 a 7 relaciones en este dataset) para además comprobar que las
// fórmulas de Relación/Superación neta LEEN las celdas editables ($B$rCStarCell/$B$rDStarCell) en vez de
// tener el umbral incrustado como número fijo.
{
  const criteria = ['Alcance', 'Autonomía', 'Infraestructura', 'Madurez'].map((name, i) => ({ id: 'k' + i, name, hint: '' }));
  const alternatives = ['LoRaWAN', 'GSM/GPRS', 'Sigfox', 'Zigbee'].map((name, i) => ({ id: 'a' + i, name }));
  const dataset = [[10, 8, 2, 5], [10.5, 0.5, 3, 2], [40, 2, 5, 2], [0.07, 1.5, 2, 4]];
  let dm: DecisionMatrix = blankMatrix();
  alternatives.forEach((a, i) => criteria.forEach((c, j) => { dm = setCell(dm, a.id, c.id, dataset[i][j]); }));
  criteria.forEach((c) => { dm = setType(dm, c.id, 'max'); });
  dm = { ...dm, electreCStar: 0.3, electreDStar: 0.9 };
  const experts = [{ id: 'e0', name: 'Experto 1', role_desc: 'Ingeniero de redes' }];
  const rows: { expert_id: string; sheet: string; pair_key: string; value: number }[] = [];
  pairsOf(4).forEach(([i, j], n) => rows.push({ expert_id: 'e0', sheet: 'crit', pair_key: `k${i}-k${j}`, value: ((n * 3) % 7) - 3 }));
  const study = {
    title: 'Proyecto ELECTRE de prueba', objective: 'Elegir tecnología IoT para Palmor', criteria, alternatives, experts,
    idx: indexJudgments(rows), prio: normalizePrio(blankPrio()), method: 'electre' as const, decisionMatrix: dm,
  };
  const wb = buildWorkbook(XLSX, study);
  const nCorrupted = corruptCachedValues(wb, 'ELECTRE') + corruptCachedValues(wb, 'Criterios');
  const corruptPath = path.join(tmpdir(), 'plataforma_recalc_electre.xlsx');
  writeFileSync(corruptPath, XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
  console.log(`ELECTRE: ${nCorrupted} celdas con fórmula arruinadas a propósito, recalculando en LibreOffice…`);
  const recalced = recalcViaLibreOffice(soffice, corruptPath, path.join(tmpdir(), 'plataforma_recalc_out_electre'));
  const ws = XLSX.read(readFileSync(recalced), { type: 'buffer' }).Sheets['ELECTRE'];
  const weights = analyze(aggMatrix(criteria, [Object.fromEntries(rows.filter((r) => r.sheet === 'crit').map((r) => [r.pair_key, r.value]))])).w;
  const exp = electreSynthesis(criteria, alternatives, dm, weights);
  const m = criteria.length, n = alternatives.length;
  const rCStarCell = 5, rDStarCell = 6, rG0 = 7;
  const rConHead = rG0 + n + 1, rCon0 = rConHead + 1;
  const rDisCritHead = criteria.map((_, j) => rCon0 + n + 1 + j * (n + 2));
  const rDisHead = rDisCritHead[m - 1] + n + 2, rDis0 = rDisHead + 1, rRelHead = rDis0 + n + 1, rRel0 = rRelHead + 1;
  const cNet = colL(n + 1);
  ok(cerca(ws['B' + rCStarCell]?.v, 0.3), `[LibreOffice recalculó] ELECTRE!B${rCStarCell} c* = ${ws['B' + rCStarCell]?.v} (esperado 0.30)`);
  ok(cerca(ws['B' + rDStarCell]?.v, 0.9), `[LibreOffice recalculó] ELECTRE!B${rDStarCell} d* = ${ws['B' + rDStarCell]?.v} (esperado 0.90)`);
  alternatives.forEach((a, i) => {
    alternatives.forEach((b, k) => {
      if (i === k) return;
      const relCell = ws[colL(1 + k) + (rRel0 + i)];
      const esperaSi = exp.result.outranks[i][k];
      ok((relCell?.v === 'Sí') === esperaSi, `[LibreOffice recalculó] ELECTRE (c*=0.30, d*=0.90) relación(${a.name} supera a ${b.name}) = "${relCell?.v ?? ''}" (esperado ${esperaSi ? 'Sí' : 'vacío'})`);
    });
    const netCell = ws[cNet + (rRel0 + i)];
    ok(!!netCell && netCell.v === exp.netOutdegree[i], `[LibreOffice recalculó] ELECTRE (c*=0.30, d*=0.90) superación neta(${a.name}) = ${netCell?.v} (esperado ${exp.netOutdegree[i]})`);
  });
  // c*=0.30/d*=0.90 (mucho más laxo que el default 0.65/0.30) debe dar MÁS relaciones que las 2 del
  // default (ver check-excel-electre.ts, verificado en JS puro arriba: da 7) — si esto fallara, sería
  // señal de que las fórmulas ignoraron las celdas editables y siguen usando el umbral incrustado de antes.
  // Bloque «Núcleo»: «Supera a», «Es superada por» y «Estado» son fórmulas vivas (COUNTIF/IF sobre la grilla Relación) y deben salir igual tras recalcular.
  {
    const rRelSum = rRel0 + n, rInc = rRelSum + 2 + exp.relations.length;
    const rKer0 = rInc + 1 + Math.max(1, exp.incomparable.length) + 2;
    alternatives.forEach((a, i) => {
      const out = exp.result.outranks[i].filter(Boolean).length, inn = exp.result.outranks.filter((row) => row[i]).length;
      const estado = out === 0 && inn === 0 ? 'Sin relación' : inn === 0 ? 'Nadie la supera' : out === 0 ? 'Solo es superada' : 'Supera y es superada';
      ok(ws['B' + (rKer0 + i)]?.v === out, `[LibreOffice recalculó] ELECTRE núcleo: «${a.name}» supera a ${ws['B' + (rKer0 + i)]?.v} (esperado ${out})`);
      ok(ws['C' + (rKer0 + i)]?.v === inn, `[LibreOffice recalculó] ELECTRE núcleo: «${a.name}» es superada por ${ws['C' + (rKer0 + i)]?.v} (esperado ${inn})`);
      ok(ws['D' + (rKer0 + i)]?.v === estado, `[LibreOffice recalculó] ELECTRE núcleo: «${a.name}» estado = ${ws['D' + (rKer0 + i)]?.v} (esperado ${estado})`);
    });
  }
  ok(exp.relations.length > 2, `ELECTRE con c*=0.30/d*=0.90 da más relaciones que el default 0.65/0.30 (da ${exp.relations.length})`);
}

// ---- Pesos objetivos CRITIC / Entropía (hoja Criterios con fórmulas vivas) ----
// Numérico (con un criterio de costo, uno OBJETIVO, uno constante —σ = 0, correlación indefinida— y un costo con 0 para
// la rama 1/x→0 de la entropía) y Fuzzy (etiquetas + celda vacía = F). Se arruinan TODAS las fórmulas de Criterios, Matriz
// de decisión y de la hoja del método, LibreOffice recalcula y se compara contra weights.ts (lo que usa la app), tanto en
// la columna de pesos como en la fila «Peso» de la hoja del método (que la lee por Criterios!B<fila>).
{
  const cs = ['Costo', 'Alcance', 'Constante', 'Voltaje', 'Latencia'].map((name, i) => ({ id: 'k' + i, name, hint: '' }));
  const as = ['A', 'B', 'C', 'D'].map((name, i) => ({ id: 'a' + i, name }));
  const data = [[100, 8, 5, 108, 0], [250, 3, 5, 112, 20], [180, 9, 5, 120, 35], [90, 5, 5, 127, 12]];
  const numDm: DM = { values: {}, types: { k0: 'min', k1: 'max', k2: 'max', k3: 'target', k4: 'min' }, targets: { k3: { value: 110, tol: 2 } } };
  as.forEach((a, i) => { numDm.values[a.id] = {}; cs.forEach((c, j) => { numDm.values[a.id][c.id] = data[i][j]; }); });
  const labels = [['G', 'VG', 'F', 'P', 'VP'], ['F', 'G', 'F', 'G', 'P'], ['VG', 'P', 'F', 'VG', 'VG'], ['P', 'F', undefined, 'F', 'G']];
  const fzDm: DM = { values: {}, types: { k0: 'max', k1: 'max', k2: 'min', k3: 'max', k4: 'max' } };
  as.forEach((a, i) => { fzDm.values[a.id] = {}; cs.forEach((c, j) => { const l = labels[i][j]; if (l) fzDm.values[a.id][c.id] = l; }); });
  for (const method of ['topsis', 'fuzzy_topsis'] as Method[]) {
    for (const weighting of ['critic', 'entropy'] as const) {
      const dm = method === 'fuzzy_topsis' ? fzDm : numDm, tag = `${method}/${weighting}`, sheetName = method === 'fuzzy_topsis' ? 'Fuzzy TOPSIS' : 'TOPSIS';
      const study = { title: 'Pesos objetivos', objective: 'Elegir', criteria: cs, alternatives: as, experts: [], idx: {}, prio: normalizePrio(blankPrio()), method, decisionMatrix: dm, weighting };
      const wb = buildWorkbook(XLSX, study);
      const nCorrupted = corruptCachedValues(wb, 'Criterios') + corruptCachedValues(wb, 'Matriz de decisión') + corruptCachedValues(wb, sheetName);
      const corruptPath = path.join(tmpdir(), `plataforma_recalc_w_${method}_${weighting}.xlsx`);
      writeFileSync(corruptPath, XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
      console.log(`Pesos ${tag}: ${nCorrupted} celdas con fórmula arruinadas a propósito, recalculando en LibreOffice…`);
      const recalced = recalcViaLibreOffice(soffice, corruptPath, path.join(tmpdir(), `plataforma_recalc_out_w_${method}_${weighting}`));
      const wbRe = XLSX.read(readFileSync(recalced), { type: 'buffer' });
      const eff = resolveTargets(cs, as, dm);
      const num = method === 'fuzzy_topsis' ? defuzzifyMatrix(eff, cs, as) : eff;
      const exp = weighting === 'critic' ? criticWeights(cs, as, num) : entropyWeights(cs, as, num);
      const wsC = wbRe.Sheets['Criterios'];
      cs.forEach((c, j) => ok(!!wsC['B' + (4 + j)] && cerca(wsC['B' + (4 + j)].v, exp[j], 1e-6), `[LibreOffice recalculó] ${tag} peso(${c.name}) = ${wsC['B' + (4 + j)]?.v?.toFixed?.(6)} (esperado ${exp[j].toFixed(6)})`));
      ok(cerca(wsC['B' + (4 + cs.length)]?.v, 1, 1e-9) && wsC['B' + (5 + cs.length)]?.v === 'Sí, suma 1', `[LibreOffice recalculó] ${tag} suma de pesos = ${wsC['B' + (4 + cs.length)]?.v}, comprobación "${wsC['B' + (5 + cs.length)]?.v}"`);
      // La hoja del método lee los pesos por Criterios!B<fila>: TOPSIS los pone en la fila 3 (B..); Fuzzy en cada 3ª columna de su fila de pesos.
      const wsM = wbRe.Sheets[sheetName];
      const rowW = method === 'fuzzy_topsis' ? 2 + 5 + 1 : 3;
      cs.forEach((c, j) => { const cell = wsM[colL(method === 'fuzzy_topsis' ? 1 + 3 * j : 1 + j) + rowW]; ok(!!cell && cerca(cell.v, exp[j], 1e-6), `[LibreOffice recalculó] ${sheetName}: peso leído de Criterios(${c.name}) = ${cell?.v?.toFixed?.(6)}`); });
    }
  }
}

if (existsSync(profileDir)) rmSync(profileDir, { recursive: true, force: true });
console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron (recálculo real en LibreOffice, no solo el valor cacheado)');
process.exit(fallos ? 1 : 0);
