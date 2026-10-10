// Resumen por zonas en Excel, zip y publicación: solo agregados, meta aditivo (sin zonas = igual que antes), firma.
import { buildGeoWorkbook } from '../src/lib/geoExcel.ts';
import { publishedZones, type PublishedMeta } from '../src/lib/geo/publish.ts';
import { changedParts, publishParts, PUNTOS_OFF, type SigInput } from '../src/lib/geo/publishSig.ts';
import { defaultZoneOrder, toPublishedZones, zonesCsv, type ZoneStat } from '../src/lib/geo/zonal.ts';

let fails = 0;
const ok = (c: boolean, n: string) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + n); if (!c) fails++; };

const stats: ZoneStat[] = [
  { index: 0, name: 'Comuna 1', cells: 12, ha: 12, exclHa: 1, meanPct: 52.4166, classHa: [5, 2, 5], classPct: [41.6667, 16.6667, 41.6667], points: 2 },
  { index: 1, name: 'Comuna 2', cells: 10, ha: 10, exclHa: 0, meanPct: 47.9, classHa: [4, 3, 3], classPct: [40, 30, 30], points: 1 },
  { index: 2, name: 'Comuna 3', cells: 0, ha: 0, exclHa: 0, meanPct: null, classHa: [0, 0, 0], classPct: [null, null, null], points: 0 },
];
const pop = [
  { evaluated: 170, byClass: [70, 0, 100], notEvaluated: 30, extremePct: 41.18 },
  { evaluated: 90, byClass: [0, 20, 70], notEvaluated: 0, extremePct: 0 },
  { evaluated: 0, byClass: [0, 0, 0], notEvaluated: 0, extremePct: null },
];

// --- lo que se publica: solo agregados, redondeados, sin puntos ni población salvo que se pida
{
  const a = toPublishedZones(stats, { layer: 'Comunas', withPoints: false });
  ok(a.rows.length === 3 && a.rows[0].name === 'Comuna 1' && a.rows[0].meanPct === 52.4 && a.rows[0].classPct[0] === 41.7, 'publicable: orden por índice descendente y 1 decimal');
  ok(a.rows[2].meanPct === null && a.rows[2].classPct.every((p) => p === null), 'publicable: zona sin área evaluada con nulos (no 0)');
  ok(a.rows.every((r) => r.points === undefined && r.pop === undefined) && a.extremeName === undefined, 'sin interruptor de puntos ni población: no viajan');
  const b = toPublishedZones(stats, { layer: 'Comunas', withPoints: true, pop, extremeName: 'Alto' });
  ok(b.rows[0].points === 2 && b.rows[0].pop === 170 && b.rows[0].popExtremePct === 41.2 && b.extremeName === 'Alto', 'con puntos y población: agregados por zona');
  const json = JSON.stringify(b);
  ok(!/coordinates|geometry|Feature|lat|lon/.test(json), 'el meta de zonas no contiene geometrías ni coordenadas');
}

// --- publishedZones: compatibilidad
{
  ok(publishedZones({}) === null && publishedZones({ zones: { rows: [] } }) === null, 'meta sin zonas -> null (publicaciones anteriores)');
  const z = toPublishedZones(stats, { layer: 'Comunas', withPoints: false });
  ok(publishedZones({ showZones: false, zones: z }) === null, 'sin showZones no se muestra aunque venga la lista');
  ok(publishedZones({ showZones: true, zones: z })?.rows.length === 3, 'con showZones se muestra');
  ok(publishedZones({ showZones: true, zones: { rows: [{ name: 5 }, null, { name: 'ok', classPct: [] }] } as never })?.rows.length === 1, 'filas inválidas se descartan');
  // un meta v1 antiguo (sin los campos nuevos) sigue siendo un PublishedMeta válido
  const old = { v: 1 } as unknown as PublishedMeta;
  ok(publishedZones(old as never) === null, 'meta v1 sin zonas');
}

// --- firma
{
  const inp: SigInput = {
    criteria: [{ id: 'c1' }], weights: [1], rules: { c1: { layerKey: 'a', fn: { type: 'up', a: 0, b: 1 } } },
    thresholds: { alta: 0.7, media: 0.45 }, layers: { a: { role: 'criterion', min: 0, max: 1 } },
  };
  const base = publishParts(inp);
  ok(base.zonas === PUNTOS_OFF, 'sin zonas la parte «zonas» es la de «apagado»');
  const off = publishParts({ ...inp, zones: { show: false, spec: ['x'] } });
  ok(off.zonas === base.zonas && JSON.stringify(off) === JSON.stringify(base), 'interruptor apagado: la firma no cambia aunque haya zonas elegidas');
  const on = publishParts({ ...inp, zones: { show: true, spec: ['comunas', 10, 'nombre', '', false] } });
  ok(on.zonas !== base.zonas && on.pesos === base.pesos && on.puntos === base.puntos, 'encendido: solo cambia la parte «zonas»');
  const on2 = publishParts({ ...inp, zones: { show: true, spec: ['comunas', 10, 'otro', '', false] } });
  ok(on2.zonas !== on.zonas, 'otro atributo de nombre cambia la firma');
  // una publicación anterior a las zonas no trae la parte: activar el interruptor sí la marca como desactualizada
  const legacy = { ...base } as Partial<typeof base>; delete legacy.zonas;
  ok(changedParts(legacy, base).length === 0, 'publicación antigua + sin zonas: al día');
  ok(JSON.stringify(changedParts(legacy, on)) === '["zonas"]', 'publicación antigua + zonas activadas: «zonas» cambió');
}

// --- Excel
{
  const XLSX = (await import('xlsx-js-style')).default as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const ordered = defaultZoneOrder(stats);
  const summary = {
    title: 'T', objective: '', date: '2026-10-10', crs: 'EPSG:32618', resM: 100, width: 6, height: 5, cr: 0, nExperts: 0, weightsOrigin: '',
    criteria: [], classes: [], layers: [], direction: 'risk' as const,
    zones: {
      layer: 'Comunas', order: 'Mayor riesgo primero', classNames: ['Bajo', 'Medio', 'Alto'], extremeName: 'Alto',
      rows: ordered.map((z) => ({ name: z.name, meanPct: z.meanPct, ha: z.ha, exclHa: z.exclHa, classPct: z.classPct, points: z.points, pop: pop[z.index] })),
    },
  };
  const wb = buildGeoWorkbook(XLSX, summary);
  ok(wb.SheetNames.includes('Zonas'), 'Excel: existe la hoja «Zonas»');
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets.Zonas, { header: 1, defval: '' }) as unknown[][];
  ok(String(aoa[0][0]).includes('Mayor riesgo primero') && aoa[2][0] === 'Zona' && String(aoa[2][1]).includes('Riesgo medio'), 'Excel: encabezado con la dirección');
  ok(aoa[3][0] === 'Comuna 1' && aoa[3][1] === 52.42 && aoa[3][2] === 12 && aoa[3][4] === 41.67, `Excel: fila Comuna 1 (${aoa[3].slice(0, 5)})`);
  const none = aoa[5];
  ok(none[0] === 'Comuna 3' && none[1] === '' && none[2] === '' && none.slice(4, 7).every((c) => c === '') && none[none.length - 1] === 'Sin área evaluada', 'Excel: zona sin área evaluada con celdas vacías (nunca 0) y rotulada');
  ok(aoa.some((r) => String(r[1]).includes('no son fórmulas vivas')) && aoa.some((r) => String(r[1]).includes('centroide')), 'Excel: notas de valores calculados y de centroide');
  ok(!buildGeoWorkbook(XLSX, { ...summary, zones: undefined }).SheetNames.includes('Zonas'), 'Excel: sin zonas no hay hoja');
}

// --- zip: CSV sin población no lleva sus columnas
{
  const csv = zonesCsv(defaultZoneOrder(stats), ['Bajo', 'Medio', 'Alto'], 'suitability').split('\n')[0];
  ok(csv === 'zona,idoneidad_0_100_medio,ha_evaluadas,ha_excluidas,pct_Bajo,pct_Medio,pct_Alto,puntos,estado', 'CSV sin población: columnas básicas');
}

if (fails) { console.error(`\n${fails} verificaciones fallaron`); process.exit(1); }
console.log('\nTodo OK');
