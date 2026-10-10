// Dirección del índice (aptitud / riesgo): paleta, etiquetas, exportaciones, Excel y firma de publicación.
import { DIR_TEXT, publishClassSig, resolveClassModel, setupFromGeo, setDirection, addClass } from '../src/lib/geo/classes.ts';
import { PALETTES, classHexOf, classRgb, paintDiff, paintResult, rampColor, rampCss } from '../src/lib/geo/paint.ts';
import { pixelsCsv, qmlClasses, qmlPct, resultRaster } from '../src/lib/geo/export.ts';
import { buildGeoWorkbook, type GeoSummary } from '../src/lib/geoExcel.ts';
import { changedParts, publishParts, type SigInput } from '../src/lib/geo/publishSig.ts';
import { CLASS_ALTA, CLASS_EXCLUDED, CLASS_MODERADA, CLASS_NO_APTA, CLASS_VETO, MASK_VALID } from '../src/lib/geo/suitability.ts';
import XLSX from 'xlsx-js-style';

let fails = 0;
const ok = (c: boolean, n: string, extra = '') => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + n + (extra ? ' ' + extra : '')); if (!c) fails++; };
const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

// --- paleta: lo existente (aptitud, 3 clases) no cambia de color
for (const pal of ['semaforo', 'daltonismo'] as const) {
  const m = classRgb(undefined, pal);
  const P = PALETTES[pal].cls;
  ok(same(m[CLASS_NO_APTA], P[CLASS_NO_APTA]) && same(m[CLASS_MODERADA], P[CLASS_MODERADA]) && same(m[CLASS_ALTA], P[CLASS_ALTA]) && same(m[CLASS_EXCLUDED], P[CLASS_EXCLUDED]) && same(m[CLASS_VETO], P[CLASS_VETO]),
    `${pal}: 3 clases de aptitud = colores de siempre`);
}
// --- riesgo: la rampa va al revés (alto = rojo)
ok(same(rampColor(0, 'semaforo', 'risk'), rampColor(1, 'semaforo', 'suitability')) && same(rampColor(1, 'semaforo', 'risk'), PALETTES.semaforo.stops[0][1]), 'rampColor riesgo: 0 = verde, 1 = rojo');
ok(rampCss('semaforo', 'risk') !== rampCss('semaforo', 'suitability') && rampCss('semaforo', 'risk').startsWith('linear-gradient(90deg, rgb(46,125,50)'), 'rampCss riesgo empieza en verde');
const risk3 = resolveClassModel({ classes: { alta: 0.7, media: 0.45 }, direction: 'risk' });
const rc = classRgb(risk3, 'semaforo');
ok(same(rc[1], [46, 125, 50]) && same(rc[3], [217, 83, 79]) && same(rc[CLASS_VETO], rc[3]), 'riesgo 3 clases: baja = verde, alta = roja; el veto toma el de la clase más alta');
const suit3 = classRgb(resolveClassModel({ classes: { alta: 0.7, media: 0.45 } }), 'semaforo');
ok(same(suit3[CLASS_VETO], suit3[1]), 'aptitud: el veto toma el color de la clase más baja');
// N=5 y color propio
const m5 = resolveClassModel({ classes: { alta: 0.7, media: 0.45 }, classModel: { breaks: [0.2, 0.4, 0.6, 0.8], classes: [{}, { color: '#112233' }] } });
const c5 = classRgb(m5, 'semaforo');
ok(m5.n === 5 && same(c5[2], [0x11, 0x22, 0x33]) && new Set([1, 3, 4, 5].map((k) => c5[k].join())).size === 4, 'N=5: color propio respetado y las demás distintas');
ok(classHexOf(m5, 'semaforo')[2] === '#112233', 'classHexOf');

// --- pintado
{
  const pct = Uint8Array.from([0, 100]), cls = Uint8Array.from([1, 3]), mask = Uint8Array.from([MASK_VALID, MASK_VALID]);
  const a = paintResult(pct, cls, mask, 'continuous', 'semaforo');
  const r = paintResult(pct, cls, mask, 'continuous', 'semaforo', risk3);
  ok(a[0] === r[1] && a[1] === r[0], 'continuo: el riesgo invierte la rampa');
  const d1 = paintDiff(Uint8Array.from([80]), Uint8Array.from([40]), Uint8Array.from([1]), 1, 30, 'semaforo', 'suitability');
  const d2 = paintDiff(Uint8Array.from([80]), Uint8Array.from([40]), Uint8Array.from([1]), 1, 30, 'semaforo', 'risk');
  ok(d1[0] !== d2[0], 'diferencia: subir el índice es mejora en aptitud y empeora en riesgo');
}

// --- exportaciones
{
  const q = qmlClasses('semaforo', risk3 as never);
  ok(q.includes('value="3"') && q.includes('value="4"') && q.includes('Condición crítica') && q.includes('Riesgo alto') && !q.includes('Alta aptitud'), 'QML riesgo: nombres de riesgo y N+1 = condición crítica');
  const q5 = qmlClasses('semaforo', m5 as never);
  ok((q5.match(/<paletteEntry/g) ?? []).length === 7 && q5.includes('value="6"') && q5.includes('value="2" color="#112233"'), 'QML N=5: 0..5 + vetada = 7 entradas');
  const qp = qmlPct('semaforo', 'risk');
  ok(qp.indexOf('item value="0"') < qp.indexOf('#2e7d32') && qp.includes('item value="100" label="100" color="#d9534f"'), 'QML índice en riesgo: 0 verde, 100 rojo');
  const rr = resultRaster(Uint8Array.from([50, 90]), Uint8Array.from([2, CLASS_VETO]), Uint8Array.from([1, 1]), 'classes', 5);
  ok(rr[0] === 2 && rr[1] === 6, 'resultRaster: vetada = N+1');
  const g = { crs: 'EPSG:4326', width: 2, height: 1, resM: 100, haPerPixel: 1, transform: [0.001, 0, -74, 0, -0.001, 11] as [number, number, number, number, number, number] };
  const model = { ...m5, names: ['Uno, con coma', 'Dos', 'Tres', 'Cuatro', 'Cinco'] };
  const csv = pixelsCsv(Uint8Array.from([50, 90]), Uint8Array.from([1, CLASS_VETO]), Uint8Array.from([1, 1]), g, 100, model as never);
  ok(csv.startsWith('lon,lat,idoneidad_0_100,clase') && csv.includes('"Uno, con coma"') && csv.includes('Vetada'), 'CSV: cabecera de aptitud y nombres escapados');
  const csvR = pixelsCsv(Uint8Array.from([50]), Uint8Array.from([2]), Uint8Array.from([1]), g, 100, risk3 as never);
  ok(csvR.startsWith('lon,lat,riesgo_0_100,clase') && csvR.includes('Riesgo moderado'), 'CSV riesgo: cabecera y nombre');
}

// --- Excel
{
  const base: GeoSummary = {
    title: 'P', objective: '', date: '2026-10-10', crs: 'EPSG:32618', resM: 100, width: 2, height: 2, cr: 0.05, nExperts: 2, weightsOrigin: 'Panel',
    criteria: [{ name: 'A', weight: 1, effective: 1, layer: 'a', rule: 'r', veto: '—' }], thresholds: { alta: 0.7, media: 0.45 },
    classes: [{ label: 'x', ha: 1, pct: 100 }], layers: [],
  };
  const flat = (s: GeoSummary) => JSON.stringify(buildGeoWorkbook(XLSX, s).Sheets.Resumen && XLSX.utils.sheet_to_json(buildGeoWorkbook(XLSX, s).Sheets.Resumen, { header: 1 }));
  const a = flat(base);
  ok(a.includes('Mapa de aptitud (AHP + SIG)') && a.includes('Umbral clase alta') && a.includes('Aptitud: un valor alto'), 'Excel aptitud legado intacto');
  const b = flat({ ...base, direction: 'risk', ranges: [{ label: 'Bajo', from: 0, to: 0.3 }, { label: 'Alto', from: 0.3, to: 1 }] });
  ok(b.includes('Mapa de riesgo (AHP + SIG)') && b.includes('Clase «Bajo»') && b.includes('0 – 30') && b.includes('30 – 100') && !b.includes('Umbral clase alta') && b.includes('condición crítica'), 'Excel riesgo: título, rangos por clase y nota de veto');
}

// --- firma de publicación
{
  const inp: SigInput = { criteria: [{ id: 'a' }], weights: [1], rules: { a: { layerKey: 'l', fn: { type: 'up', a: 0, b: 1 } } }, thresholds: { alta: 0.7, media: 0.45 }, layers: { l: { role: 'criterion', min: 0, max: 1 } } };
  const legacy = setupFromGeo({ classes: { alta: 0.7, media: 0.45 } });
  const p0 = publishParts({ ...inp, classSig: publishClassSig(legacy) });
  ok(JSON.stringify(p0) === JSON.stringify(publishParts(inp)), 'firma: 3 clases de aptitud sin tocar = la de antes (no marca «desactualizado»)');
  const risk = setDirection(legacy, 'risk');
  ok(changedParts(p0, publishParts({ ...inp, classSig: publishClassSig(risk) })).join() === 'umbrales', 'firma: cambiar la dirección salta en «umbrales»');
  const four = addClass(legacy);
  ok(changedParts(p0, publishParts({ ...inp, classSig: publishClassSig(four) })).join() === 'umbrales', 'firma: agregar una clase salta');
  const renamed = { ...legacy, classes: [{ name: 'Mala' }, {}, {}] };
  ok(changedParts(p0, publishParts({ ...inp, classSig: publishClassSig(renamed) })).join() === 'umbrales', 'firma: renombrar una clase salta');
}
ok(DIR_TEXT.risk.critical === 'Condición crítica' && DIR_TEXT.suitability.critical === 'Vetada', 'rótulo del veto por dirección');
console.log(fails === 0 ? '\nTodo OK (check-geo-direction)' : `\n${fails} fallas`);
process.exit(fails ? 1 : 0);
