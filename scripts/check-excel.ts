// Genera un .xlsx de prueba con datos de ejemplo y verifica: (1) el viaje de ida y vuelta con el
// formato de la herramienta HTML, (2) que el Excel principal ya NO trae las hojas de priorización
// (viven aparte en buildPrioWorkbook, ver check-excel-topsis.ts) pero el respaldo _datos sí conserva
// la priorización completa para reimportar.
import { writeFileSync, readFileSync } from 'node:fs';
import XLSX from 'xlsx-js-style';
import { buildWorkbook, buildPrioWorkbook } from '../src/lib/excel.ts';
import { fromLegacy, isLegacy } from '../src/lib/legacy.ts';
import { indexJudgments, pairsOf } from '../src/lib/ahp.ts';
import { normalizePrio, blankPrio } from '../src/lib/prio.ts';
import { criticWeights, entropyWeights } from '../src/lib/weights.ts';
import { defuzzifyMatrix } from '../src/lib/fuzzy_topsis.ts';
import { resolveTargets } from '../src/lib/topsis.ts';
import type { DecisionMatrix, Method } from '../src/lib/types.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };

const seed = JSON.parse(readFileSync('scripts/fixtures/sample_prioritization.json', 'utf8'));
const evs = [1, 2, 3, 4].map((i) => ({ id: 'v' + i, name: 'Evaluador ' + i }));
const prio = normalizePrio({
  cands: seed.cands.map((c: any) => ({ id: c.id, name: c.name, desc: c.desc ?? '', stage: c.stage, at: c.at ?? '', target: c.target ?? null, reason: c.reason ?? '', evid: c.evid ?? '', qmide: c.qmide ?? '', ind: c.ind ?? '', sq: c.sq ?? [null, null, null, null, null], se: Object.fromEntries((c.se ?? []).map((x: number, i: number) => [evs[i].id, x])), just: c.just ?? '', cutReason: c.cutReason ?? '' })),
  evaluators: evs, questions: seed.questions, mode: 'ev', cutoff: 4,
});
const criteria = ['Eficiencia de datos', 'Métricas WER/CER', 'Madurez y soporte de herramientas', 'Dependencia de anotación', 'Transferibilidad entre lenguas'].map((name, i) => ({ id: 'k' + i, name, hint: '' }));
const alternatives = ['Fine-tuning supervisado', 'Transfer learning cross-lingual', 'Aprendizaje autosupervisado', 'Data augmentation'].map((name, i) => ({ id: 'a' + i, name }));
const experts = [0, 1, 2].map((i) => ({ id: 'e' + i, name: 'Experto ' + (i + 1), role_desc: ['Ingeniero ML/voz', 'Ingeniero electrónico', 'Hablante nativo'][i] }));
const rows: { expert_id: string; sheet: string; pair_key: string; value: number }[] = [];
for (const e of experts) {
  pairsOf(5).forEach(([i, j], n) => rows.push({ expert_id: e.id, sheet: 'crit', pair_key: `k${i}-k${j}`, value: ((n + Number(e.id[1])) % 5) - 2 }));
  criteria.forEach((c) => pairsOf(4).forEach(([i, j], n) => rows.push({ expert_id: e.id, sheet: 'alt:' + c.id, pair_key: `a${i}-a${j}`, value: ((n * 2 + Number(c.id[1])) % 7) - 3 })));
}
const study = {
  title: 'Proyecto de prueba', objective: seed.objective.replace(/\s+/g, ' '), criteria, alternatives, experts,
  idx: indexJudgments(rows), prio, method: 'ahp' as const, decisionMatrix: { values: {}, types: {} },
};
const wb = buildWorkbook(XLSX, study);
writeFileSync('/tmp/plataforma_test.xlsx', XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
console.log('Hojas:', wb.SheetNames.join(' | '));
ok(!wb.SheetNames.some((n: string) => n.startsWith('Prior')), 'el Excel principal no trae hojas de priorización (van aparte)');

// ida y vuelta por la hoja oculta _datos
const wb2 = XLSX.read(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), { type: 'array' });
let t = ''; for (let r = 1; wb2.Sheets['_datos']['A' + r]; r++) t += wb2.Sheets['_datos']['A' + r].v;
const st = JSON.parse(t);
const imp = isLegacy(st) ? fromLegacy(st) : null;
ok(!!imp, 'la hoja _datos es un respaldo v2 válido');
ok(imp?.experts.length === experts.length, `expertos reimportados = ${imp?.experts.length} (esperado ${experts.length})`);
ok(imp?.judgments.length === rows.length, `juicios reimportados = ${imp?.judgments.length} (esperado ${rows.length})`);
ok(imp?.prio.cands.length === prio.cands.length, `candidatos de priorización reimportados = ${imp?.prio.cands.length} (esperado ${prio.cands.length}, aunque el Excel principal no muestre esas hojas)`);

// Excel de priorización aparte: trae Prior 1-5, no trae Criterios/_datos.
const wbPrio = buildPrioWorkbook(XLSX, study);
console.log('Hojas (priorización):', wbPrio.SheetNames.join(' | '));
ok(['Prior 1. Lluvia de ideas', 'Prior 2. Tamizaje', 'Prior 3. Independencia', 'Prior 4. Panel', 'Prior 5. Resultado final'].every((n) => wbPrio.SheetNames.includes(n)), 'trae las 5 hojas de priorización');
ok(!wbPrio.SheetNames.includes('Criterios') && !wbPrio.SheetNames.includes('_datos'), 'no trae Criterios ni _datos (eso vive en el Excel principal)');

// Pesos objetivos (CRITIC/Entropía): la hoja Criterios se reemplaza por una que los calcula con fórmulas vivas desde
// la matriz; el valor cacheado debe ser el de weights.ts (lo que usa la app) y la hoja no debe hablar de juicios por pares.
// El recálculo REAL de las fórmulas lo prueba check-excel-recalc.ts (npm run test:excel:recalc).
{
  const cs = ['Costo', 'Alcance', 'Constante', 'Voltaje', 'Latencia'].map((name, i) => ({ id: 'k' + i, name, hint: '' }));
  const as = ['A', 'B', 'C', 'D'].map((name, i) => ({ id: 'a' + i, name }));
  const data = [[100, 8, 5, 108, 0], [250, 3, 5, 112, 20], [180, 9, 5, 120, 35], [90, 5, 5, 127, 12]];
  let numDm: DecisionMatrix = { values: {}, types: { k0: 'min', k1: 'max', k2: 'max', k3: 'target', k4: 'min' }, targets: { k3: { value: 110, tol: 2 } } };
  as.forEach((a, i) => cs.forEach((c, j) => { numDm = { ...numDm, values: { ...numDm.values, [a.id]: { ...numDm.values[a.id], [c.id]: data[i][j] } } }; }));
  const labels = [['G', 'VG', 'F', 'P', 'VP'], ['F', 'G', 'F', 'G', 'P'], ['VG', 'P', 'F', 'VG', 'VG'], ['P', 'F', undefined, 'F', 'G']];
  const fzDm: DecisionMatrix = { values: {}, types: { k0: 'max', k1: 'max', k2: 'min', k3: 'max', k4: 'max' } };
  as.forEach((a, i) => { fzDm.values[a.id] = {}; cs.forEach((c, j) => { const l = labels[i][j]; if (l) fzDm.values[a.id][c.id] = l; }); });
  const base = { title: 'Pesos objetivos', objective: 'Elegir', criteria: cs, alternatives: as, experts: [], idx: {}, prio: normalizePrio(blankPrio()) };
  const sheetText = (wsx: any) => Object.values(wsx).map((c: any) => (c && typeof c === 'object' ? String(c.v ?? '') : '')).join(' ');
  for (const method of ['topsis', 'fuzzy_topsis'] as Method[]) {
    for (const weighting of ['critic', 'entropy'] as const) {
      const dm = method === 'fuzzy_topsis' ? fzDm : numDm, tag = `${method}/${weighting}`;
      const study = { ...base, method, decisionMatrix: dm, weighting };
      const wbw = buildWorkbook(XLSX, study);
      const wsC = wbw.Sheets['Criterios'];
      const eff = resolveTargets(cs, as, dm);
      const num = method === 'fuzzy_topsis' ? defuzzifyMatrix(eff, cs, as) : eff;
      const exp = weighting === 'critic' ? criticWeights(cs, as, num) : entropyWeights(cs, as, num);
      const got = cs.map((_, j) => wsC['B' + (4 + j)]?.v as number);
      ok(got.every((g, j) => Math.abs(g - exp[j]) < 1e-9), `${tag}: pesos cacheados en Criterios!B4.. = weights.ts (${got.map((g) => g?.toFixed?.(4)).join(', ')})`);
      ok(cs.every((_, j) => typeof wsC['B' + (4 + j)]?.f === 'string' && wsC['B' + (4 + j)].f.length > 5), `${tag}: los pesos son fórmulas vivas`);
      ok(Math.abs(got.reduce((a, b) => a + b, 0) - 1) < 1e-9 && wsC['B' + (4 + cs.length)]?.f?.startsWith('SUM('), `${tag}: suma de pesos = 1 con fórmula de comprobación`);
      const txt = sheetText(wsC);
      ok(!/GEOMEAN|Consistente|media geométrica|Juicios individuales/i.test(txt) && txt.includes(weighting === 'critic' ? 'CRITIC' : 'Shannon'), `${tag}: la hoja Criterios no habla de juicios por pares y cita el método`);
      if (method === 'fuzzy_topsis') ok(txt.includes('VLOOKUP') || Object.values(wsC).some((c: any) => c?.f?.includes?.('VLOOKUP')), `${tag}: desdifusifica etiquetas con VLOOKUP sobre la escala`);
      const notas = sheetText(wbw.Sheets['Notas']);
      ok(!/media geométrica|GEOMEAN|Consistente/i.test(notas) && notas.includes(weighting === 'critic' ? 'CRITIC' : 'Entropía'), `${tag}: Notas describe pesos objetivos, no juicios por pares`);
      const sheetName = method === 'fuzzy_topsis' ? 'Fuzzy TOPSIS' : 'TOPSIS';
      ok(wbw.SheetNames.join('|') === ['Notas', 'Criterios', 'Matriz de decisión', sheetName, '_datos'].join('|'), `${tag}: mismas hojas que con AHP`);
      // El respaldo _datos conserva la ponderación para volver a importar
      const w2 = XLSX.read(XLSX.write(wbw, { bookType: 'xlsx', type: 'array' }), { type: 'array' });
      let tt = ''; for (let r = 1; w2.Sheets['_datos']['A' + r]; r++) tt += w2.Sheets['_datos']['A' + r].v;
      const back = fromLegacy(JSON.parse(tt));
      ok(back.weighting === weighting && back.method === method, `${tag}: _datos conserva la ponderación (${back.weighting})`);
    }
  }
  // Con AHP (o sin `weighting`) sigue saliendo la hoja de juicios por pares, y el respaldo no arrastra `wm`
  const wbA = buildWorkbook(XLSX, { ...base, method: 'topsis' as const, decisionMatrix: numDm, weighting: 'ahp' as const });
  ok(sheetText(wbA.Sheets['Criterios']).includes('Consistente') && sheetText(wbA.Sheets['Notas']).includes('media geométrica'), 'weighting=ahp: Criterios y Notas son los de juicios por pares');
  const wbAhpMethod = buildWorkbook(XLSX, { ...base, method: 'ahp' as const, decisionMatrix: numDm, weighting: 'critic' as const });
  ok(sheetText(wbAhpMethod.Sheets['Criterios']).includes('Consistente'), 'método AHP ignora weighting (siempre juicios por pares)');
}

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
