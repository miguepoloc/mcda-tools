// Sensibilidad espacial de pesos (G15): reescalado proporcional de pesos, paridad con el motor del mapa (evaluateIndex +
// classify) celda por celda, conteos de celdas que cambian y ha por clase, vetos que no cambian, riesgo, selección del
// mapa de cambios, pintado y filas de la hoja de Excel.
import {
  changeCount, deltaLabel, perturbWeights, runSensitivity, sensitivityRows, sensitivitySteps, SENS_DELTAS, type SensitivityInput,
} from '../src/lib/geo/sensitivity.ts';
import { paintChange } from '../src/lib/geo/paint.ts';
import {
  classStats, classify, evaluateIndex, MASK_EXCLUDED, MASK_NODATA, MASK_VALID, type CriterionRule, type Direction,
} from '../src/lib/geo/suitability.ts';

let fails = 0;
const ok = (c: boolean, n: string, extra = '') => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + n + (extra ? ' ' + extra : '')); if (!c) fails++; };
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) < e;

// --- perturbWeights
{
  const w = [0.5, 0.3, 0.2];
  const p = perturbWeights(w, 0, 0.2);
  ok(near(p[0], 0.6) && near(p.reduce((a, b) => a + b, 0), 1), '+20 % sobre 0.5 da 0.6 y la suma se conserva');
  ok(near(p[1] / p[2], 0.3 / 0.2), 'los demás conservan su proporción');
  const m = perturbWeights(w, 2, -0.1);
  ok(near(m[2], 0.18) && near(m.reduce((a, b) => a + b, 0), 1) && near(m[0] / m[1], 0.5 / 0.3), '−10 % sobre 0.2 da 0.18');
  const big = perturbWeights([0.9, 0.1], 0, 0.2);
  ok(near(big[0], 1) && near(big[1], 0), 'el peso variado no pasa del total');
  ok(perturbWeights([1, 0], 0, 0.2).join() === '1,0' && perturbWeights([0, 0], 0, 0.2).join() === '0,0', 'sin a quién compensar: sin cambios');
  ok(near(perturbWeights([2, 1, 1], 0, 0.1).reduce((a, b) => a + b, 0), 4), 'también conserva el total si no está normalizado');
  ok(deltaLabel(0.2) === '+20 %' && deltaLabel(-0.1) === '−10 %', 'rótulos de variación');
}

// --- grilla pequeña con 3 criterios, una exclusión, una celda sin dato, vetos y datos faltantes
const W = 30, H = 20, N = W * H;
const mask = new Uint8Array(N).fill(MASK_VALID);
mask[0] = MASK_NODATA; mask[1] = MASK_EXCLUDED; mask[2] = MASK_EXCLUDED;
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const mkLayer = () => Float32Array.from({ length: N }, () => rnd());
const a = mkLayer(), b = mkLayer(), c = mkLayer();
b[10] = NaN; b[11] = NaN; c[11] = NaN; a[11] = NaN; // celda 11: sin dato en todos
c[50] = NaN;
const layers = { a, b, c };
const rules: CriterionRule[] = [
  { key: 'a', weight: 0.5, fn: { type: 'up', a: 0, b: 1 } },
  { key: 'b', weight: 0.3, fn: { type: 'up', a: 0, b: 1 }, veto: { op: '<', value: 0.05 } },
  { key: 'c', weight: 0.2, fn: { type: 'down', a: 0, b: 1 } },
];
const labels = ['Pendiente', 'Distancia', 'Clima'];
const breaks = [0.4, 0.6];

function brute(direction: Direction) {
  const ix = evaluateIndex(layers, mask, rules, direction);
  return { ix, cls: classify(ix.s, ix.veto, breaks) };
}

for (const direction of ['suitability', 'risk'] as Direction[]) {
  const inp: SensitivityInput = { layers, mask, rules, labels, direction, breaks, haPerPixel: 2.5 };
  const r = runSensitivity(inp);
  const base = brute(direction);
  const bs = classStats(base.cls, base.ix.pct, mask, 2.5, 3, direction);
  ok(r.cases.length === 3 * SENS_DELTAS.length && r.criteria.length === 3, `${direction}: 3 criterios × 4 variaciones = 12 casos`);
  ok(near(r.evaluableHa, bs.evaluableHa) && r.baseClassHa.every((h, i) => near(h, bs.classes[i].ha)), `${direction}: ha base por clase idéntico a classStats`);

  // Contraste celda por celda contra el motor del mapa con los pesos variados.
  let allSame = true, vetoStable = true, sumsOk = true;
  for (const cs of r.cases) {
    const w = perturbWeights(rules.map((x) => x.weight), cs.criterion, cs.delta);
    const rr = rules.map((x, i) => ({ ...x, weight: w[i] }));
    const aix = evaluateIndex(layers, mask, rr, direction);
    const alt = { ix: aix, cls: classify(aix.s, aix.veto, breaks) };
    let changed = 0;
    for (let i = 0; i < N; i++) {
      const should = base.cls[i] !== 0 && base.ix.pct[i] !== 255 && alt.cls[i] !== base.cls[i] ? 1 : 0;
      if (cs.map[i] !== should) allSame = false;
      changed += should;
      if (base.ix.veto[i] && cs.map[i]) vetoStable = false;
    }
    const st = classStats(alt.cls, alt.ix.pct, mask, 2.5, 3, direction);
    if (cs.changed !== changed || !cs.classHa.every((h, i) => near(h, st.classes[i].ha))) allSame = false;
    if (!near(cs.classHa.reduce((x, y) => x + y, 0), r.evaluableHa)) sumsOk = false;
  }
  ok(allSame, `${direction}: mapa de cambios, conteos y ha por clase coinciden con recalcular el mapa completo`);
  ok(vetoStable, `${direction}: una celda vetada nunca cambia de clase`);
  ok(sumsOk, `${direction}: las ha por clase suman el área evaluada en cada caso`);
  ok(r.cases.some((cs) => cs.changed > 0), `${direction}: hay celdas que cambian`, String(r.cases.map((x) => x.changed).join(',')));
  ok(r.cases.every((cs) => cs.up + cs.down === cs.changed && near(cs.changedPct, (100 * cs.changed) / r.evaluableCells)), `${direction}: suben + bajan = cambian; % sobre el área evaluada`);
  // Exclusión, sin dato y celda sin ningún criterio nunca cuentan.
  ok(r.cases.every((cs) => cs.map[0] === 0 && cs.map[1] === 0 && cs.map[2] === 0 && cs.map[11] === 0), `${direction}: exclusión, sin dato y celda sin criterios no cambian`);
  ok(base.ix.veto.some((v) => v === 1), `${direction}: la grilla de prueba sí tiene celdas vetadas`);
  // Mayor variación → al menos tantas celdas cambian como con la menor (misma dirección del cambio).
  const fx = (k: number, d: number) => r.cases.find((x) => x.criterion === k && Math.abs(x.delta - d) < 1e-9)!;
  ok([0, 1, 2].every((k) => fx(k, 0.2).changed >= fx(k, 0.1).changed && fx(k, -0.2).changed >= fx(k, -0.1).changed), `${direction}: ±20 % mueve al menos tantas celdas como ±10 %`);
  ok(r.maxChangedPct.every((m, k) => near(m, Math.max(...r.cases.filter((x) => x.criterion === k).map((x) => x.changedPct)))), `${direction}: maxChangedPct por criterio`);
}

// --- el generador cede entre casos y avanza el progreso
{
  const g = sensitivitySteps({ layers, mask, rules, labels, direction: 'suitability', breaks, haPerPixel: 1 });
  let steps = 0, last = 0, total = 0, res;
  for (;;) { const s = g.next(); if (s.done) { res = s.value; break; } steps++; last = s.value.done; total = s.value.total; }
  ok(steps === 13 && last === total && total === 13 && res.cases.length === 12, 'generador: 1 paso de base + 12 casos, progreso hasta el total');
}

// --- criterio con peso 0 y un solo criterio: nada cambia
{
  const r0 = runSensitivity({ layers, mask, rules: [{ ...rules[0] }, { ...rules[1], weight: 0 }], labels, direction: 'suitability', breaks, haPerPixel: 1 });
  ok(r0.cases.filter((x) => x.criterion === 1).every((x) => x.changed === 0), 'un criterio con peso 0 no mueve nada (×1.2 de 0 sigue siendo 0)');
  const r1 = runSensitivity({ layers, mask, rules: [rules[0]], labels, direction: 'suitability', breaks, haPerPixel: 1 });
  ok(r1.cases.every((x) => x.changed === 0), 'un único criterio: sin con quién compensar, nada cambia');
  // Capa ausente: la regla no vota ni genera casos.
  const r2 = runSensitivity({ layers: { a }, mask, rules, labels, direction: 'suitability', breaks, haPerPixel: 1 });
  ok(r2.criteria.length === 1 && r2.criteria[0].label === 'Pendiente', 'regla sin capa se omite y conserva su rótulo');
}

// --- selección del mapa y pintado
{
  const r = runSensitivity({ layers, mask, rules, labels, direction: 'suitability', breaks, haPerPixel: 2.5 });
  const one = changeCount(r, { criterion: 0, delta: 0.2 }, N);
  const cs = r.cases.find((x) => x.criterion === 0 && Math.abs(x.delta - 0.2) < 1e-9)!;
  ok(one.cases === 1 && one.max <= 1 && one.count.reduce((s, v) => s + v, 0) === cs.changed, 'selección criterio + variación = ese caso');
  const all = changeCount(r, { criterion: 'all', delta: 'any' }, N);
  ok(all.cases === 12 && all.max >= 1 && all.max <= 12, 'todos los criterios, cualquier variación = 12 casos');
  const anyCells = all.count.reduce((s, v) => s + (v > 0 ? 1 : 0), 0);
  ok(r.cases.every((x) => x.changed <= anyCells), 'la unión de cambios abarca cada caso individual');
  const crit = changeCount(r, { criterion: 1, delta: 'any' }, N);
  ok(crit.cases === 4, 'un criterio, cualquier variación = 4 casos');
  const px = paintChange(all.count, all.max, mask);
  const painted = px.reduce((s, v) => s + (v ? 1 : 0), 0);
  ok(painted === anyCells, 'paintChange pinta exactamente las celdas que cambian (y no la exclusión)');
  ok(paintChange(new Uint8Array(N), 0, mask).every((v) => v === 0), 'sin cambios: todo transparente');
}

// --- filas del Excel
{
  const r = runSensitivity({ layers, mask, rules, labels, direction: 'suitability', breaks, haPerPixel: 2.5 });
  const rows = sensitivityRows(r, ['No apta', 'Moderada', 'Alta']);
  ok(rows.length === 7 + 12 && rows[5].length === 11 && rows[7][2] === deltaLabel(-0.2), 'filas: encabezado, base y 12 casos');
  ok(String(rows[0][0]).includes('no son fórmulas vivas'), 'nota de solo valores');
  const { buildGeoWorkbook } = await import('../src/lib/geoExcel.ts');
  const XLSX = (await import('xlsx-js-style')).default as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const summary = { title: 'T', objective: '', date: '2026-10-10', crs: 'EPSG:32618', resM: 100, width: 5, height: 4, cr: 0, nExperts: 0, weightsOrigin: '', criteria: [], classes: [], layers: [] };
  ok(buildGeoWorkbook(XLSX, { ...summary, sensitivityRows: rows }).SheetNames.includes('Sensibilidad'), 'Excel: existe la hoja «Sensibilidad»');
  ok(!buildGeoWorkbook(XLSX, summary).SheetNames.includes('Sensibilidad'), 'Excel: sin análisis no hay hoja');
}

console.log(fails === 0 ? '\nTodo OK (check-geo-sensitivity)' : `\n${fails} fallas`);
process.exit(fails ? 1 : 0);
