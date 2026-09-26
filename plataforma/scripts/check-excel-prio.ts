// Excel de la priorización (Sesión 1, buildPrioWorkbook): contadores del embudo, columnas nuevas de Prior 5 (¿Pasa?, medibilidad),
// brecha con fórmula viva y — si hay LibreOffice (`soffice`) — recálculo REAL con los valores cacheados arruinados a propósito
// (mismo mecanismo que check-excel-recalc.ts): un valor cacheado lo puso el mismo código que se verifica, así que no prueba nada.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx-js-style';
import { buildPrioWorkbook } from '../src/lib/excel.ts';
import { blankMatrix } from '../src/lib/topsis.ts';
import { slideCase } from './prio-case.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: unknown, b: number, tol = 1e-9) => typeof a === 'number' && Math.abs(a - b) <= tol;

const A = slideCase();
A.cands[0].just = 'Rango documentado difiere en órdenes de magnitud';
A.cands[0].measurable = true; A.cands[0].measEvid = 'Datasheets';
A.cands[1].measurable = false;
const study = { title: 'Palmor', objective: 'Elegir tecnología IoT', criteria: [], alternatives: [], experts: [], idx: {}, prio: A, method: 'ahp' as const, decisionMatrix: blankMatrix() };
const wb = buildPrioWorkbook(XLSX, study);
const cell = (w: any, sheet: string, addr: string) => w.Sheets[sheet]?.[addr];
const text = (w: any, sheet: string) => Object.values(w.Sheets[sheet]).map((c: any) => c?.v).filter((v) => typeof v === 'string').join(' | ');

ok(/Pool restante tras tamizaje: 9 candidatos \(de 10\)/.test(text(wb, 'Prior 2. Tamizaje')), 'Prior 2: pool tras tamizaje = 9 de 10 (el tamizaje solo saca al fusionado)');
ok(/Pool que llega al panel: 7 de 9/.test(text(wb, 'Prior 3. Independencia')), 'Prior 3: 7 de 9 llegan al panel');
const P5 = 'Prior 5. Resultado final';
ok(cell(wb, P5, 'D6')?.v === '¿Pasa el corte?' && cell(wb, P5, 'E6')?.v === 'Medible para todas las alternativas' && cell(wb, P5, 'F6')?.v === 'Evidencia de medibilidad', 'Prior 5: encabezados ¿Pasa?, medibilidad y evidencia');
ok(cell(wb, P5, 'D7')?.f?.includes('$B$2') && cell(wb, P5, 'D7')?.v === 'Pasa', 'Prior 5: «Pasa» es una fórmula contra el corte (B2)');
ok(cell(wb, P5, 'E7')?.v === 'Sí' && cell(wb, P5, 'F7')?.v === 'Datasheets' && cell(wb, P5, 'E8')?.v === 'No' && cell(wb, P5, 'E9')?.v === 'Sin verificar', 'Prior 5: medibilidad Sí / No / Sin verificar');
const gapAddr = Object.keys(wb.Sheets[P5]).find((a) => wb.Sheets[P5][a]?.v === 'Brecha = último que pasa − primero que no pasa');
ok(!!gapAddr, 'Prior 5: fila de brecha presente');
const gapVal = gapAddr ? wb.Sheets[P5]['B' + gapAddr.slice(1)] : null;
ok(cerca(gapVal?.v, 0.4, 1e-9) && /^B\d+-'Prior 4\. Panel'!/.test(gapVal?.f ?? ''), 'Prior 5: brecha = 0.40 con fórmula (último finalista − ponderación del primero fuera, en Prior 4)');

// ---- Recálculo real en LibreOffice (se salta si no está instalado) ----
function findSoffice(): string | null {
  for (const c of ['soffice', '/opt/homebrew/bin/soffice', '/usr/bin/soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice']) {
    try { execFileSync(c, ['--version'], { stdio: 'ignore' }); return c; } catch { /* siguiente */ }
  }
  return null;
}
const soffice = findSoffice();
if (!soffice) {
  console.log('SKIP recálculo en LibreOffice: `soffice` no está instalado');
} else {
  const profile = path.join(tmpdir(), 'plataforma_lo_profile');
  const userDir = path.join(profile, 'user');
  mkdirSync(userDir, { recursive: true });
  writeFileSync(path.join(userDir, 'registrymodifications.xcu'), `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
 <item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item>
 <item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="ODFRecalcMode" oor:op="fuse"><value>0</value></prop></item>
</oor:items>`);
  const work = path.join(tmpdir(), 'plataforma_prio_recalc');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  // arruina las cachés de toda celda con fórmula (numérica o texto) en Prior 4 y 5
  const bad = buildPrioWorkbook(XLSX, study);
  let arruinadas = 0;
  for (const name of ['Prior 4. Panel', P5]) {
    for (const [a, c] of Object.entries<any>(bad.Sheets[name])) {
      if (a.startsWith('!') || !c?.f) continue;
      if (c.t === 'n') c.v = -999999; else c.v = 'ARRUINADO';
      arruinadas++;
    }
  }
  const inFile = path.join(work, 'prio.xlsx');
  writeFileSync(inFile, XLSX.write(bad, { bookType: 'xlsx', type: 'buffer' }));
  const out = path.join(work, 'out');
  execFileSync(soffice, ['--headless', '--norestore', '--nolockcheck', '--nodefault', `-env:UserInstallation=file://${profile}`,
    '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', out, inFile], { stdio: 'pipe', timeout: 90_000 });
  const re = XLSX.readFile(path.join(out, 'prio.xlsx'));
  ok(arruinadas >= 10, `arruinó ${arruinadas} cachés (Prior 4 y 5)`);
  ok(cerca(re.Sheets[P5]['B7']?.v, 5, 1e-9) && cerca(re.Sheets[P5]['B10']?.v, 4.2, 1e-9), 'recálculo LibreOffice: ponderaciones de Prior 5 (5.0 … 4.2) vienen de Prior 4');
  ok([7, 8, 9, 10].every((r) => re.Sheets[P5]['D' + r]?.v === 'Pasa'), 'recálculo LibreOffice: «Pasa» de los 4 finalistas');
  ok(gapAddr != null && cerca(re.Sheets[P5]['B' + gapAddr.slice(1)]?.v, 0.4, 1e-9), 'recálculo LibreOffice: brecha = 0.40');
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
