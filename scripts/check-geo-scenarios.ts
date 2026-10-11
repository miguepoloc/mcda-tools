// Escenarios con nombre del geovisor (G13): construcción y serialización (ida y vuelta por JSON), tope de 5, renombrar,
// eliminar, lectura tolerante, comparación de resúmenes (puntos porcentuales; no compara con otro n de clases ni otra
// dirección), plan de restauración (pesos del panel vs explorados) y filas del Excel / JSON de exportación.
import {
  addScenario, buildScenario, cleanName, compareSummaries, MAX_SCENARIOS, meanIndex, nextScenarioName, removeScenario,
  renameScenario, restorePlan, sanitizeScenarios, scenarioRows, scenariosJson, type GeoScenario,
} from '../src/lib/geo/scenarios.ts';
import { classStats, classify, evaluateIndex, MASK_EXCLUDED, MASK_NODATA, MASK_VALID, type CriterionRule } from '../src/lib/geo/suitability.ts';
import type { ClassSetup } from '../src/lib/geo/classes.ts';

let fails = 0;
const ok = (c: boolean, n: string, extra = '') => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + n + (extra ? ' ' + extra : '')); if (!c) fails++; };
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) < e;

// --- un mapa pequeño con dos criterios, una exclusión y una celda sin dato
const N = 20;
const mask = new Uint8Array(N).fill(MASK_VALID); mask[0] = MASK_NODATA; mask[1] = MASK_EXCLUDED;
const a = new Float32Array(N).map((_, i) => i / (N - 1));
const b = new Float32Array(N).map((_, i) => 1 - i / (N - 1));
const layers = { a, b };
const rulesA: CriterionRule[] = [
  { key: 'a', weight: 0.7, fn: { type: 'up', a: 0, b: 1 } },
  { key: 'b', weight: 0.3, fn: { type: 'up', a: 0, b: 1 } },
];
const setup: ClassSetup = { direction: 'suitability', breaks: [0.4, 0.7], classes: [{}, { name: 'Media' }, {}], cut: 'manual' };
const names = ['No apta', 'Media', 'Alta aptitud'];

function evalSummary(rules: CriterionRule[], s: ClassSetup) {
  const x = evaluateIndex(layers, mask, rules, s.direction);
  const cls = classify(x.s, x.veto, s.breaks);
  return { stats: classStats(cls, x.pct, mask, 2, s.breaks.length + 1, s.direction), mean: meanIndex(x.pct, mask), pct: x.pct };
}
const ev = evalSummary(rulesA, setup);

// --- índice medio: solo celdas evaluadas
{
  let s = 0, n = 0;
  for (let i = 2; i < N; i++) { s += ev.pct[i]; n++; }
  ok(ev.mean !== null && near(ev.mean, s / n), 'meanIndex: promedio de las celdas evaluadas (sin exclusión ni sin dato)');
  ok(meanIndex(new Uint8Array(3).fill(255), new Uint8Array(3).fill(MASK_VALID)) === null, 'meanIndex: sin celdas evaluadas → null');
}

const geoRules: GeoScenario['rules'] = { c1: { layerKey: 'a', fn: { type: 'up', a: 0, b: 1 } }, c2: { layerKey: 'b', fn: { type: 'up', a: 0, b: 1 }, veto: { op: '<', value: 0.05 } } };
const mk = (id: string, name: string, o: Partial<Parameters<typeof buildScenario>[0]> = {}) => buildScenario({
  id, name, date: '2026-10-10T12:00:00.000Z', setup, names, weights: { c1: 0.7, c2: 0.3 }, explored: false, effective: { c1: 0.7, c2: 0.3 },
  rules: geoRules, stats: ev.stats, meanPct: ev.mean, ...o,
});

// --- construcción / serialización
const s1 = mk('s1', '  Base   inicial  ');
ok(s1.name === 'Base inicial', 'el nombre se limpia (espacios)');
ok(cleanName('x'.repeat(80)).length === 40, 'nombre de hasta 40 caracteres');
ok(JSON.stringify(sanitizeScenarios(JSON.parse(JSON.stringify([s1])))) === JSON.stringify([s1]), 'ida y vuelta por JSON sin pérdida');
ok(!('grid' in s1) && JSON.stringify(s1).length < 3000, 'no guarda la grilla (el escenario es pequeño)', String(JSON.stringify(s1).length) + ' bytes');
{
  // copia profunda: mutar el estado vivo no cambia lo guardado
  const live = JSON.parse(JSON.stringify(geoRules)) as GeoScenario['rules'];
  const sc = mk('s0', 'Copia', { rules: live, setup: { ...setup, breaks: setup.breaks.slice(), classes: setup.classes.map((c) => ({ ...c })) } });
  live.c1.layerKey = 'otra';
  ok(sc.rules.c1.layerKey === 'a', 'copia profunda de las reglas');
}
ok(s1.summary.classes.length === 3 && near(s1.summary.classes.reduce((t, c) => t + c.pct, 0), 100, 1e-6) && s1.summary.evaluableHa === ev.stats.evaluableHa, 'resumen: 3 clases, % suman 100, área evaluada');
ok(s1.breaks.join() === '0.4,0.7' && s1.classes[1].name === 'Media' && s1.direction === 'suitability', 'guarda cortes, nombres y dirección');

// --- tope de 5, renombrar, eliminar
{
  let list: GeoScenario[] = [];
  for (let k = 1; k <= MAX_SCENARIOS; k++) {
    const r = addScenario(list, mk(`s${k}`, nextScenarioName(list)));
    ok(r.ok, `agregar escenario ${k}`);
    list = r.list;
  }
  ok(list.map((s) => s.name).join() === 'Escenario 1,Escenario 2,Escenario 3,Escenario 4,Escenario 5', 'nombres por defecto consecutivos');
  const full = addScenario(list, mk('s6', 'Sexto'));
  ok(!full.ok && full.reason === 'full' && full.list.length === 5 && !full.list.some((s) => s.id === 's6'), 'el sexto se rechaza (tope de 5)');
  const rn = renameScenario(list, 's2', '  Pesos del sector  ');
  ok(rn.find((s) => s.id === 's2')?.name === 'Pesos del sector' && rn.find((s) => s.id === 's1')?.name === 'Escenario 1', 'renombrar solo el elegido');
  ok(renameScenario(list, 's2', '   ').find((s) => s.id === 's2')?.name === 'Escenario 2', 'un nombre vacío no se aplica');
  const del = removeScenario(list, 's3');
  ok(del.length === 4 && !del.some((s) => s.id === 's3'), 'eliminar');
  ok(nextScenarioName(del) === 'Escenario 3', 'el nombre por defecto reutiliza el hueco');
  ok(addScenario(del, mk('s7', 'Nuevo')).ok, 'tras eliminar se puede guardar otro');
  ok(addScenario(undefined, s1).ok && addScenario(undefined, s1).list.length === 1, 'proyecto sin scenarios: lista vacía');
}

// --- lectura tolerante
ok(sanitizeScenarios(undefined).length === 0 && sanitizeScenarios('x').length === 0 && sanitizeScenarios([null, 3, {}, { id: 'x' }]).length === 0, 'sanitize: basura → []');
ok(sanitizeScenarios(Array.from({ length: 9 }, (_, i) => ({ ...s1, id: `k${i}` }))).length === 5, 'sanitize: recorta a 5');
ok(sanitizeScenarios([{ ...s1, summary: { ...s1.summary, classes: s1.summary.classes.slice(0, 2) } }]).length === 0, 'sanitize: resumen con otro número de clases se descarta');

// --- comparación
{
  // el «ahora» cambia pesos: más peso a b
  const rulesB: CriterionRule[] = [{ ...rulesA[0], weight: 0.2 }, { ...rulesA[1], weight: 0.8 }];
  const now = evalSummary(rulesB, setup);
  const cmp = compareSummaries(s1, { direction: 'suitability', names, stats: now.stats, meanPct: now.mean });
  ok(cmp.comparable, 'mismo n y dirección: comparable');
  if (cmp.comparable) {
    ok(cmp.rows.length === 3 && near(cmp.rows.reduce((t, r) => t + r.dPp, 0), 0, 1e-6), 'Δ pp de las clases suma 0 (mismo área evaluada)');
    ok(cmp.rows.every((r) => near(r.dHa, r.haB - r.haA) && near(r.dPp, r.pctB - r.pctA)), 'Δ ha y Δ pp = ahora − escenario');
    ok(cmp.dMean !== null && now.mean !== null && ev.mean !== null && near(cmp.dMean, now.mean - ev.mean), 'Δ índice medio');
    ok(cmp.rows.some((r) => r.dHa !== 0), 'hay diferencia real al cambiar los pesos');
  }
  const same = compareSummaries(s1, { direction: 'suitability', names, stats: ev.stats, meanPct: ev.mean });
  ok(same.comparable && same.rows.every((r) => r.dHa === 0 && r.dPp === 0) && same.dMean === 0, 'sin cambios: todas las diferencias son 0');
  const four: ClassSetup = { ...setup, breaks: [0.25, 0.5, 0.75], classes: [{}, {}, {}, {}] };
  const now4 = evalSummary(rulesA, four);
  const c4 = compareSummaries(s1, { direction: 'suitability', names: ['a', 'b', 'c', 'd'], stats: now4.stats, meanPct: now4.mean });
  ok(!c4.comparable && c4.reason === 'classes' && c4.savedN === 3 && c4.nowN === 4, 'otro número de clases: no compara, avisa');
  const cr = compareSummaries(s1, { direction: 'risk', names, stats: ev.stats, meanPct: ev.mean });
  ok(!cr.comparable && cr.reason === 'direction', 'otra dirección: no compara');
  const renamed = compareSummaries(s1, { direction: 'suitability', names: ['Baja', 'Media', 'Alta'], stats: ev.stats, meanPct: ev.mean });
  ok(renamed.comparable && renamed.rows[0].savedName === 'No apta' && renamed.rows[1].savedName === undefined, 'clase renombrada: conserva el nombre guardado');
}

// --- la diferencia por celdas se reconstruye de las capas (sin guardar la grilla)
{
  const re = evalSummary(rulesA, setup);
  ok(re.pct.every((v, i) => v === ev.pct[i]), 'reevaluar el escenario con las mismas capas reproduce el índice');
}

// --- restauración
{
  const ids = ['c1', 'c2'];
  const same = restorePlan(s1, ids, [0.7, 0.3]);
  ok(!same.exploring && same.weights.join() === '0.7,0.3', 'pesos iguales a los del panel: no activa la exploración');
  const scaled = restorePlan(s1, ids, [7, 3]);
  ok(!scaled.exploring, 'compara pesos normalizados (7/3 = 0.7/0.3)');
  const diff = restorePlan(s1, ids, [0.5, 0.5]);
  ok(diff.exploring && diff.weights.join() === '0.7,0.3', 'pesos distintos del panel: se aplican como exploración');
  ok(diff.setup.breaks.join() === '0.4,0.7' && diff.setup.direction === 'suitability' && diff.setup.classes[1].name === 'Media', 'restaura cortes, clases y dirección');
  ok(diff.rules.c2.veto?.value === 0.05 && Object.keys(diff.rules).length === 2, 'restaura reglas con su veto');
  diff.setup.breaks[0] = 0.9;
  ok(s1.breaks[0] === 0.4, 'el plan no comparte referencias con el escenario');
  const gone = restorePlan(s1, ['c1', 'c9'], [0.5, 0.5]);
  ok(gone.droppedCriteria.join() === 'c2' && gone.newCriteria.join() === 'c9' && !('c2' in gone.rules) && gone.weights.join() === '0.7,0', 'criterio borrado se descarta y el nuevo pesa 0 sin regla');
}

// --- exportación
{
  const rows = scenarioRows([s1, mk('s2', 'Otro', { explored: true })], { criteria: [{ id: 'c1', name: 'Pendiente' }, { id: 'c2', name: 'Distancia' }], layerLabel: (k) => `Capa ${k}` });
  const flat = rows.map((r) => r.join('|'));
  ok(flat.some((l) => l.startsWith('1. Base inicial')) && flat.some((l) => l.startsWith('2. Otro')), 'hoja: un bloque por escenario');
  ok(flat.some((l) => l.startsWith('Pendiente|0.7|0.7|Capa a|')) && flat.some((l) => l.includes('Veto si valor < 0.05')), 'hoja: criterio con peso, capa, regla y veto');
  ok(flat.some((l) => l.startsWith('No apta|0 – 40 (excl.)|')) && flat.some((l) => l.startsWith('Alta aptitud|70 – 100 (incl.)|')), 'hoja: rangos por clase');
  ok(flat.some((l) => l.includes('Explorados a mano')), 'hoja: marca los pesos explorados');
  const j = JSON.parse(scenariosJson([s1], { project: 'P', date: '2026-10-10' })) as { escenarios: GeoScenario[]; proyecto: string };
  ok(j.proyecto === 'P' && j.escenarios.length === 1 && j.escenarios[0].id === 's1', 'escenarios.json: proyecto y escenarios');
}

// --- hoja «Escenarios» del Excel del geovisor: solo si hay alguno
{
  const { buildGeoWorkbook } = await import('../src/lib/geoExcel.ts');
  const XLSX = (await import('xlsx-js-style')).default as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const summary = {
    title: 'T', objective: '', date: '2026-10-10', crs: 'EPSG:32618', resM: 100, width: 5, height: 4, cr: 0, nExperts: 0, weightsOrigin: '',
    criteria: [], classes: [], layers: [],
  };
  const sheetRows = scenarioRows([s1], { criteria: [{ id: 'c1', name: 'Pendiente' }, { id: 'c2', name: 'Distancia' }], layerLabel: (k) => k });
  const wb = buildGeoWorkbook(XLSX, { ...summary, scenarioRows: sheetRows });
  ok(wb.SheetNames.includes('Escenarios'), 'Excel: existe la hoja «Escenarios»');
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets.Escenarios, { header: 1, defval: '' }) as unknown[][];
  ok(String(aoa[0][0]).includes('no son fórmulas vivas') && aoa.some((r) => r[0] === '1. Base inicial'), 'Excel: nota de solo valores y bloque del escenario');
  ok(!buildGeoWorkbook(XLSX, summary).SheetNames.includes('Escenarios') && !buildGeoWorkbook(XLSX, { ...summary, scenarioRows: scenarioRows([], { criteria: [], layerLabel: (k) => k }) }).SheetNames.includes('Escenarios'), 'Excel: sin escenarios no hay hoja');
}

console.log(fails === 0 ? '\nTodo OK (check-geo-scenarios)' : `\n${fails} fallas`);
process.exit(fails ? 1 : 0);
