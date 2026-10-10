// El punto consultado coincide con la celda del ráster que calcula evaluateGrid (mismo índice, misma clase),
// y distingue celda evaluada / exclusión / fuera del área / sin dato / veto.
import { evaluateOnePoint } from '../src/lib/geo/pointEval.ts';
import { classify, evaluateGrid, evaluateIndex, MASK_EXCLUDED, MASK_NODATA, MASK_VALID, CLASS_VETO, type CriterionRule } from '../src/lib/geo/suitability.ts';
import type { GeoData } from '../src/lib/geo/data.ts';

let fails = 0;
const ok = (c: boolean, n: string) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + n); if (!c) fails++; };

const W = 6, H = 5, N = W * H;
const a = new Float32Array(N), b = new Float32Array(N);
for (let i = 0; i < N; i++) { a[i] = (i * 37) % 100; b[i] = (i * 13) % 50; }
b[8] = NaN;                       // sin dato en un criterio
b[9] = NaN; a[9] = NaN;           // sin dato en todos
b[10] = 1000;                     // dispara el veto
const mask = new Uint8Array(N).fill(MASK_VALID);
mask[0] = MASK_NODATA; mask[1] = MASK_EXCLUDED;
const grid = { crs: 'EPSG:32618', width: W, height: H, resM: 100, haPerPixel: 1, transform: [100, 0, 600000, 0, -100, 1200000] as [number, number, number, number, number, number] };
const data: GeoData = {
  grid, layers: { a, b }, mask, points: {},
  info: { a: { label: 'A', unit: 'u', role: 'criterion', min: 0, max: 100 }, b: { label: 'B', unit: 'm', role: 'criterion', min: 0, max: 50 } },
};
const rules: CriterionRule[] = [
  { key: 'a', weight: 0.6, fn: { type: 'up', a: 0, b: 100 } },
  { key: 'b', weight: 0.4, fn: { type: 'down', a: 0, b: 50 }, veto: { op: '>', value: 500 } },
];
const thr = { alta: 0.7, media: 0.45 };
const cfg = { breaks: [thr.media, thr.alta] };
const { pct, cls } = evaluateGrid(data.layers, mask, rules, thr);

let same = true, nOk = 0;
for (let i = 0; i < N; i++) {
  const col = i % W, row = Math.floor(i / W);
  const p = evaluateOnePoint(data, rules, cfg, { col, row });
  if (p.status !== 'ok') continue;
  nOk++;
  if (p.pct !== pct[i] || p.cls !== cls[i]) { same = false; console.error('difiere en', i, p.pct, pct[i], p.cls, cls[i]); }
  if (p.s === null || Math.round(p.s * 100) !== p.pct) same = false;
}
ok(same && nOk > 20, `punto = celda del ráster en ${nOk} celdas evaluadas`);
ok(evaluateOnePoint(data, rules, cfg, { col: 0, row: 0 }).status === 'outside', 'fuera del área de estudio');
ok(evaluateOnePoint(data, rules, cfg, { col: 1, row: 0 }).status === 'excluded', 'exclusión');
const nd = evaluateOnePoint(data, rules, cfg, { col: 3, row: 1 }); // i = 9
ok(nd.status === 'nodata' && nd.s === null && nd.pct === null, 'sin dato en todos los criterios');
const ve = evaluateOnePoint(data, rules, cfg, { col: 4, row: 1 }); // i = 10
ok(ve.status === 'ok' && ve.vetoed && ve.cls === CLASS_VETO && ve.s === 0 && ve.rows.some((r) => r.veto), 'veto: índice 0 y clase vetada');
const part = evaluateOnePoint(data, rules, cfg, { col: 2, row: 1 }); // i = 8: b sin dato, solo vota a
ok(part.status === 'ok' && part.rows.some((r) => r.contrib === 'no vota') && Math.abs((part.s as number) - a[8] / 100) < 1e-9, 'criterio sin dato no vota y reescala pesos');
ok(Number.isFinite(part.lat) && Number.isFinite(part.lon), 'devuelve lat/lon');
// N clases y riesgo: el punto sigue coincidiendo con evaluateIndex + classify
{
  const breaks = [0.2, 0.4, 0.6, 0.8];
  for (const direction of ['suitability', 'risk'] as const) {
    const idx = evaluateIndex(data.layers, mask, rules, direction);
    const cl = classify(idx.s, idx.veto, breaks);
    let all = true, n = 0;
    for (let i = 0; i < N; i++) {
      const p = evaluateOnePoint(data, rules, { breaks, direction }, { col: i % W, row: Math.floor(i / W) });
      if (p.status !== 'ok') continue;
      n++;
      if (p.cls !== cl[i] || p.pct !== idx.pct[i]) all = false;
    }
    ok(all && n > 20, `${direction}, 5 clases: punto = celda (${n} celdas)`);
  }
  const rv = evaluateOnePoint(data, rules, { breaks, direction: 'risk' }, { col: 4, row: 1 });
  ok(rv.vetoed && rv.s === 1 && rv.pct === 100 && rv.cls === CLASS_VETO, 'riesgo: el veto fuerza el índice al máximo');
}

// ---------------------------------------------------------------- ranking de puntos (lib/geo/points.ts)
{
  const { evaluateLonLat, rankPoints, rankHeading, rankingCsv, nextPointName, sanitizePoints, toPublishedPoints, sanitizePublishedRows, publishedRowsToPointRows, MAX_PUBLISHED_BREAKDOWN, STATUS_LABEL, MAX_POINTS } = await import('../src/lib/geo/points.ts');
  const { pixelToLonLat } = await import('../src/lib/geo/crs.ts');
  const A = new Float32Array(N).fill(50), B = new Float32Array(N).fill(0);
  const cell = (c: number, r: number) => r * W + c;
  A[cell(2, 2)] = 90; A[cell(3, 2)] = 70; A[cell(4, 2)] = 70; A[cell(5, 2)] = 10;
  B[cell(0, 3)] = 1000;            // veto
  A[cell(1, 3)] = NaN; B[cell(1, 3)] = NaN; // sin dato en todo
  const m2 = new Uint8Array(N).fill(MASK_VALID);
  m2[cell(0, 0)] = MASK_NODATA; m2[cell(1, 0)] = MASK_EXCLUDED;
  const d2: GeoData = {
    grid, layers: { a: A, b: B }, mask: m2, points: {},
    info: { a: { label: 'A', unit: 'u', role: 'criterion', min: 0, max: 100 }, b: { label: 'B', unit: 'm', role: 'criterion', min: 0, max: 1000 } },
  };
  const r2: CriterionRule[] = [
    { key: 'a', weight: 0.5, fn: { type: 'up', a: 0, b: 100 } },
    { key: 'b', weight: 0.5, fn: { type: 'up', a: 0, b: 2000 }, veto: { op: '>', value: 500 } },
  ];
  const at = (c: number, r: number, name: string) => { const [lon, lat] = pixelToLonLat(c, r, grid.transform, grid.crs); return { id: name, name, lat, lon }; };
  const pts = [
    at(5, 2, 'bajo'), at(3, 2, 'empate1'), at(2, 2, 'alto'), at(4, 2, 'empate2'),
    at(0, 0, 'fuera-mascara'), at(1, 0, 'excl'), at(1, 3, 'sin-dato'), at(0, 3, 'veto'),
    { id: 'lejos', name: 'lejos', lat: 40, lon: 10 },
  ];
  const label = (c: number) => `clase ${c}`;
  for (const direction of ['suitability', 'risk'] as const) {
    const cfg2 = { breaks: [0.45, 0.7], direction };
    const rows = rankPoints(pts, (p) => evaluateLonLat(d2, r2, cfg2, p), label);
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    const ev = rows.filter((r) => r.status === 'ok');
    ok(ev.every((r, i) => i === 0 || (ev[i - 1].pct as number) >= (r.pct as number)), `${direction}: orden descendente por índice`);
    ok(by.empate1.pct === by.empate2.pct && by.empate1.rank === by.empate2.rank, `${direction}: empate con el mismo puesto`);
    const top = direction === 'risk' ? 'veto' : 'alto';
    ok(by[top].rank === 1, `${direction}: puesto 1 = ${direction === 'risk' ? 'mayor riesgo (el veto fuerza 100)' : 'más apto'}`);
    const ranks = ev.map((r) => r.rank);
    const expectDown = direction === 'risk' ? [1, 2, 3, 3, 5] : [1, 2, 2, 4, 5];
    ok(JSON.stringify(ranks) === JSON.stringify(expectDown), `${direction}: ranking de competencia ${JSON.stringify(ranks)}`);
    ok(by.veto.vetoed && by.veto.status === 'ok' && by.veto.pct === (direction === 'risk' ? 100 : 0), `${direction}: veto evaluado con índice ${direction === 'risk' ? 100 : 0}`);
    const tail = rows.slice(-4);
    ok(tail.every((r) => r.status !== 'ok' && r.rank === null && r.pct === null && r.cls === 0), `${direction}: no evaluados al final, sin puesto, sin índice (nunca 0 %)`);
    ok(by['fuera-mascara'].status === 'outside' && by.lejos.status === 'outside' && by.excl.status === 'excluded' && by['sin-dato'].status === 'nodata', `${direction}: fuera / excluido / sin dato`);
    ok(by.excl.label === STATUS_LABEL.excluded && by.lejos.label === 'Fuera del área evaluada' && by['sin-dato'].label === 'Sin dato', `${direction}: rótulos de estado`);
    // coincide con la celda del ráster
    const idx = evaluateIndex(d2.layers, m2, r2, direction);
    ok(by.alto.pct === idx.pct[cell(2, 2)] && by.empate1.pct === idx.pct[cell(3, 2)], `${direction}: índice del punto = índice de la celda`);
    ok(rankHeading(direction) === (direction === 'risk' ? 'Mayor riesgo primero' : 'Más apto primero'), `${direction}: encabezado`);
    const csv = rankingCsv(rows, direction).split('\n');
    ok(csv[0].includes(direction === 'risk' ? 'riesgo_0_100' : 'idoneidad_0_100') && csv.length === pts.length + 2, `${direction}: CSV con cabecera de la dirección`);
    ok(csv.filter((l) => /^,/.test(l)).length === 4 && !csv.some((l) => /,0,,/.test(l) && l.startsWith(',')), `${direction}: CSV deja puesto e índice vacíos si no se evaluó`);
  }
  // las clases del punto salen del mismo modelo
  const e1 = evaluateLonLat(d2, r2, { breaks: [0.45, 0.7], direction: 'suitability' }, pts[2]);
  {
    const ix = evaluateIndex(d2.layers, m2, r2, 'suitability');
    const cl = classify(ix.s, ix.veto, [0.45, 0.7]);
    ok(e1.status === 'ok' && e1.cls === cl[cell(2, 2)], 'clase del punto = clase de la celda');
  }
  // nombres y saneado
  ok(nextPointName([{ name: 'Punto 3' }, { name: 'Casa' }, { name: 'Punto 1' }]) === 'Punto 4', 'siguiente «Punto N» sin repetir tras borrar');
  const san = sanitizePoints([{ id: 'a', name: 'x', lat: 1, lon: 2 }, { id: 'a', name: 'dup', lat: 3, lon: 4 }, { id: 'b', name: 'mal', lat: 95, lon: 0 }, null, { lat: 'x', lon: 1 }]);
  ok(san.length === 2 && san[0].id !== san[1].id, 'saneado: descarta inválidos y repara ids repetidos');
  ok(sanitizePoints(Array.from({ length: 500 }, (_, i) => ({ id: `i${i}`, name: 'n', lat: 0, lon: 0 }))).length === MAX_POINTS, `saneado: tope de ${MAX_POINTS}`);
  const pub = toPublishedPoints(rankPoints(pts, (p) => evaluateLonLat(d2, r2, { breaks: [0.45, 0.7], direction: 'suitability' }, p), label));
  ok(pub.length === pts.length && !('id' in pub[0]) && pub.filter((p) => p.pct === null).length === 4, 'publicables: sin ids y con pct null si no se evaluó');

  // desglose publicado: mismas cifras que pointEval, sin claves de capa ni etiquetas de capa, redondeadas a 3 decimales
  {
    const cfgP = { breaks: [0.45, 0.7], direction: 'suitability' as const };
    const rk = rankPoints(pts, (p) => evaluateLonLat(d2, r2, cfgP, p), label);
    const withB = toPublishedPoints(rk, { nameOfKey: (k) => ({ a: 'Criterio Alfa', b: 'Criterio Beta' } as Record<string, string>)[k] });
    const noB = toPublishedPoints(rk, { breakdown: false });
    const altoPub = withB.find((p) => p.name === 'alto')!;
    const altoEval = evaluateLonLat(d2, r2, cfgP, pts[2]);
    ok(!!altoPub.rows && altoPub.rows.length === 2 && altoPub.rows[0].label === 'Criterio Alfa' && altoPub.rows[1].label === 'Criterio Beta', 'rows: una línea por criterio, rotulada con el nombre del criterio');
    ok(altoPub.rows!.every((r, i) => Math.abs((r.suit as number) - (altoEval.rows[i].suit as number)) < 1e-3 && Math.abs((r.contrib as number) - (altoEval.rows[i].part as number)) < 1e-3 && r.value === altoEval.rows[i].value), 'rows: idoneidad, aporte y valor salen del mismo pointEval');
    ok(altoPub.rows!.every((r) => [r.suit, r.weight, r.contrib].every((n) => n === null || Math.round((n as number) * 1000) / 1000 === n)), 'rows: números a 3 decimales');
    const txt = JSON.stringify(withB);
    ok(!/"key"|layerKey|"a"|"b"/.test(JSON.stringify(altoPub.rows)) && !txt.includes('"A"') && !txt.includes('"B"') && !txt.includes('.tif'), 'rows: sin claves de capa ni etiquetas de capa');
    const unmapped = toPublishedPoints(rk).find((p) => p.name === 'alto')!;
    ok(unmapped.rows![0].label === 'Criterio 1', 'rows: sin nombre de criterio se rotula «Criterio N», nunca la capa');
    ok(withB.filter((p) => p.status !== 'ok').every((p) => !('rows' in p)), 'rows: los puntos sin evaluar no llevan desglose');
    ok(noB.every((p) => !('rows' in p)), 'rows: con breakdown=false no viaja ninguno');
    const vt = withB.find((p) => p.name === 'veto')!;
    ok(vt.rows!.some((r) => r.veto === true) && !altoPub.rows!.some((r) => 'veto' in r), 'rows: veto solo cuando es verdadero');
    // sin dato en un criterio: no vota
    const nd = toPublishedPoints([{ ...rk[0], rows: [{ key: 'a', label: 'A', value: 'sin dato', contrib: 'no vota', veto: false, suit: null, weight: null, part: null }] }], { nameOfKey: () => 'X' })[0];
    ok(nd.rows![0].suit === null && publishedRowsToPointRows(nd.rows)[0].contrib === 'no vota', 'rows: criterio sin dato = no vota');
    // ida y vuelta a PointRow
    const back = publishedRowsToPointRows(JSON.parse(JSON.stringify(altoPub.rows)));
    ok(back.length === 2 && back[0].contrib === `${(altoPub.rows![0].suit as number).toFixed(2)} × ${(altoPub.rows![0].weight as number).toFixed(2)}` && back[0].part === altoPub.rows![0].contrib, 'rows: ida y vuelta a PointRow');
    // tolerancia a basura
    ok(sanitizePublishedRows('x').length === 0 && sanitizePublishedRows(null).length === 0 && sanitizePublishedRows([null, 3, { label: 1 }, { label: 'a' }]).length === 0, 'rows mal formado: se descarta');
    const dirty = sanitizePublishedRows([{ label: 'a', value: '1 m', suit: 'x', weight: 0.5, contrib: 0.2, extra: 'secreto.tif', key: 'k' }]);
    ok(dirty.length === 1 && dirty[0].suit === null && dirty[0].weight === null && !('extra' in dirty[0]) && !('key' in dirty[0]), 'rows: números inválidos = no vota y claves extra no pasan');
    // tamaño: 300 puntos × 6 criterios
    const many = Array.from({ length: 300 }, (_, i) => ({
      ...rk[0], name: `Punto ${i + 1}`, rank: i + 1,
      rows: Array.from({ length: 6 }, (_, j) => ({ key: `k${j}`, label: `x`, value: `${(1234.5678 + i).toFixed(2)} m`, contrib: '', veto: false, suit: 0.1234567 * (j + 1), weight: 1 / 6, part: 0.0123456 })),
    }));
    const big = toPublishedPoints(many, { nameOfKey: (k) => `Distancia al criterio ${k}` });
    const kb = JSON.stringify(big).length / 1024;
    ok(big.filter((p) => p.rows).length === MAX_PUBLISHED_BREAKDOWN, `tope de ${MAX_PUBLISHED_BREAKDOWN} puntos con desglose`);
    ok(kb < 100, `300 puntos × 6 criterios pesa ${kb.toFixed(0)} KB (< 100 KB)`);
  }

  // Excel: hoja «Puntos» solo con valores; los no evaluados con celdas vacías (nunca 0)
  const { buildGeoWorkbook } = await import('../src/lib/geoExcel.ts');
  const { pointState } = await import('../src/lib/geo/points.ts');
  const XLSX = (await import('xlsx-js-style')).default as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const rowsR = rankPoints(pts, (p) => evaluateLonLat(d2, r2, { breaks: [0.45, 0.7], direction: 'risk' }, p), label);
  const summary = {
    title: 'T', objective: '', date: '2026-10-10', crs: 'EPSG:32618', resM: 100, width: W, height: H, cr: 0, nExperts: 0, weightsOrigin: '',
    criteria: [], classes: [], layers: [], direction: 'risk' as const,
    points: rowsR.map((r) => ({ rank: r.rank, name: r.name, lat: r.lat, lon: r.lon, pct: r.pct, classLabel: r.status === 'ok' ? r.label : '', state: pointState(r, 'risk') })),
    pointsOrder: rankHeading('risk'),
  };
  const wb = buildGeoWorkbook(XLSX, summary);
  ok(wb.SheetNames.includes('Puntos'), 'Excel: existe la hoja «Puntos»');
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets.Puntos, { header: 1, defval: '' }) as unknown[][];
  ok(String(aoa[0][0]).includes('Mayor riesgo primero') && aoa[2][0] === 'Puesto' && String(aoa[2][4]).includes('riesgo'), 'Excel: encabezado con la dirección');
  const data = aoa.slice(3, 3 + pts.length);
  ok(data[0][0] === 1 && data[0][1] === 'veto' && data[0][6] === 'Condición crítica', 'Excel: primer puesto = el veto en riesgo, con su estado');
  ok(data.slice(-4).every((r) => r[0] === '' && r[4] === '' && r[5] === ''), 'Excel: no evaluados con puesto, índice y clase vacíos (no 0)');
  ok(aoa.some((r) => String(r[1]).includes('no son fórmulas vivas')), 'Excel: nota de valores calculados');
  const noPts = buildGeoWorkbook(XLSX, { ...summary, points: [] });
  ok(!noPts.SheetNames.includes('Puntos'), 'Excel: sin puntos no hay hoja');
}
console.log(fails === 0 ? '\nTodo OK (check-geo-points)' : `\n${fails} fallas`);
process.exit(fails ? 1 : 0);
