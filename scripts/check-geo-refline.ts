// Referencias con líneas y puntos (G7) y consulta de atributos al clic (G8): persistencia, retrocompatibilidad,
// publicación (solo geometría, sin atributos) y consulta.
import { decodeFC, encodeFC, polygonView, polygonsOnly, referenceFeatures, referenceNotes, referenceSummary, REF_PERSIST } from '../src/lib/geo/refLayer.ts';
import { buildPublishedRefs } from '../src/lib/geo/refPublic.ts';
import { queryRefs, tolDegAtZoom } from '../src/lib/geo/refQuery.ts';
import { buildZoneGrid } from '../src/lib/geo/zonal.ts';
import type { FC } from '../src/lib/geo/vector.ts';

let fails = 0;
const ok = (c: boolean, n: string) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + n); if (!c) fails++; };

const sq = (x: number, y: number, s: number) => [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]];
const road = (n: number, x0 = -74.2, y0 = 11.2): number[][] => Array.from({ length: n }, (_, i) => [x0 + i * 0.00001, y0 + 0.01 * Math.sin(i / 50)]);
const mixed: FC = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { nombre: 'Vía 1', clase: 'primaria' }, geometry: { type: 'LineString', coordinates: [[-74.2, 11.2], [-74.1, 11.2], [-74.0, 11.25]] } },
    { type: 'Feature', properties: { nombre: 'Comuna 1', pob: 1200 }, geometry: { type: 'Polygon', coordinates: sq(-74.15, 11.1, 0.1) } },
    { type: 'Feature', properties: { nombre: 'Río' }, geometry: { type: 'MultiLineString', coordinates: [[[-74.3, 11.0], [-74.2, 11.05]], [[-74.2, 11.05], [-74.1, 11.0]]] } },
    { type: 'Feature', properties: { nombre: 'Estación' }, geometry: { type: 'Point', coordinates: [-74.12, 11.15] } },
    { type: 'Feature', properties: { nombre: 'Nulo' }, geometry: null },
    { type: 'Feature', properties: { nombre: 'Mixta' }, geometry: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', coordinates: sq(-73.5, 11.0, 0.1) }, { type: 'LineString', coordinates: [[0, 0], [1, 1]] }] } },
  ],
} as FC;

// --- persistencia: se conservan líneas y puntos; polígonos primero
const { fc, report } = referenceFeatures(mixed);
ok(report.polygons === 2 && report.lines === 3 && report.points === 1 && report.dropped === 1, `conserva ${referenceSummary(report)}; omite ${report.dropped} vacío`);
ok(fc.features.slice(0, 2).every((f) => f.geometry?.type === 'Polygon') && fc.features[2].geometry?.type === 'LineString', 'orden polígonos → líneas → puntos');
ok(fc.features.find((f) => f.properties?.nombre === 'Río')?.geometry?.type === 'MultiLineString', 'MultiLineString se conserva');
ok(report.tolM === 0 && !report.propsTrimmed && report.truncated === 0 && referenceNotes(report).length === 1, 'sin recortes extra: solo avisa de lo omitido');
{
  const back = await decodeFC(await encodeFC(fc));
  ok(JSON.stringify(back) === JSON.stringify(fc), 'ida y vuelta gzip idéntica (líneas y puntos incluidos)');
  ok(Object.keys(back.features[2].properties ?? {}).join() === 'nombre,clase', 'atributos del dueño se conservan para consultarlos');
}

// --- retrocompatibilidad: una referencia ya guardada (solo polígonos) se carga y se ve igual
{
  const legacy = polygonsOnly(mixed).fc;
  ok(polygonView(legacy) === legacy, 'polygonView devuelve el mismo objeto si ya es solo de polígonos');
  const pv = polygonView(fc);
  ok(pv.features.length === 2 && pv.features[0] === fc.features[0] && pv.features[1] === fc.features[1], 'polygonView conserva los índices de los polígonos');
  ok(polygonView(fc) === pv, 'polygonView cacheada');
  const grid = { width: 3, height: 3, transform: [-74.2, 0.1, 0, 11.4, 0, -0.1], crs: 'EPSG:4326' } as never;
  let ok2 = true;
  try { ok2 = buildZoneGrid(pv, grid).count === 2; } catch { ok2 = false; }
  ok(ok2, 'las zonas se construyen solo con polígonos');
}

// --- topes: vértices (se simplifican líneas), elementos y texto
{
  const big: FC = { type: 'FeatureCollection', features: Array.from({ length: 6 }, (_, i) => ({ type: 'Feature' as const, properties: { nombre: `R${i}` }, geometry: { type: 'LineString' as const, coordinates: road(60_000, -74.2, 11 + i * 0.05) } })) };
  const r = referenceFeatures(big);
  const verts = r.fc.features.reduce((a, f) => a + (f.geometry!.coordinates as number[][]).length, 0);
  ok(verts <= REF_PERSIST.maxVertices && r.report.tolM > 0, `360 000 vértices -> ${verts} (tolerancia ≈ ${r.report.tolM} m)`);
  ok(referenceNotes(r.report).some((t) => /simplificaron/.test(t)), 'avisa de la simplificación');
  const many: FC = { type: 'FeatureCollection', features: Array.from({ length: 20_050 }, (_, i) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: [-74 + i * 1e-5, 11] } })) };
  const m = referenceFeatures(many);
  ok(m.fc.features.length === REF_PERSIST.maxFeatures && m.report.truncated === 50, 'tope de elementos con aviso');
  const txt: FC = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { d: 'x'.repeat(500) }, geometry: { type: 'Point', coordinates: [0, 0] } }] };
  ok(referenceFeatures(txt, { ...REF_PERSIST, maxJsonBytes: 100 }).report.propsTrimmed, 'textos largos se acortan al pasar el tope de tamaño');
}

// --- publicación: las líneas viajan, los atributos y los puntos no
{
  const b = buildPublishedRefs([{ id: 'k', name: 'Vías', fc, color: '#22D3EE', weight: 2 }]);
  const pub = b.refs[0].fc.features;
  const types = pub.map((f) => f.geometry?.type).sort().join();
  ok(types === 'MultiLineString,MultiPolygon', `publica un MultiPolygon y un MultiLineString (${types})`);
  ok(pub.every((f) => Object.keys(f.properties ?? {}).length === 0), 'ningún atributo viaja en la publicación');
  ok(!JSON.stringify(b.refs).includes('Estación') && !JSON.stringify(b.refs).includes('primaria'), 'ni nombres ni valores de atributos');
}

// --- consulta de atributos al clic
{
  const lay = [{ id: 'k', name: 'Capa', fc, nameField: 'nombre' }];
  const tol = tolDegAtZoom(12);
  ok(tol > 0.003 && tol < 0.004, `tolerancia a zoom 12 ≈ ${tol.toFixed(5)}°`);
  const inPoly = queryRefs(lay, 11.15, -74.1, 0);
  ok(inPoly.length === 1 && inPoly[0].kind === 'polygon' && inPoly[0].title === 'Comuna 1' && inPoly[0].rows[0][0] === 'pob', 'clic dentro de un polígono: nombre y atributos');
  const nearLine = queryRefs(lay, 11.2001, -74.18, tol);
  ok(nearLine.length === 1 && nearLine[0].kind === 'line' && nearLine[0].title === 'Vía 1' && nearLine[0].rows[0][1] === 'primaria', 'clic junto a una línea');
  ok(queryRefs(lay, 11.4, -74.15, tol).length === 0, 'clic lejos de todo: sin resultados');
  const stack = queryRefs([{ id: 'a', name: 'A', fc }, { id: 'b', name: 'B', fc }], 11.15, -74.12, tol);
  ok(stack[0].kind === 'point' && stack[0].title === 'Estación' && stack.length === 4, 'punto cercano primero, luego polígonos');
  const many: FC = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`c${i}`, i])), geometry: { type: 'Polygon', coordinates: sq(0, 0, 1) } }] };
  const h = queryRefs([{ id: 'x', name: 'X', fc: many }], 0.5, 0.5, 0)[0];
  ok(h.rows.length === 8 && h.more === 4 && h.title === 'Elemento 1', 'tabla corta: 8 atributos y «+N más»');
  const holed: FC = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [sq(0, 0, 10)[0], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] } }] };
  ok(queryRefs([{ id: 'h', name: 'H', fc: holed }], 5, 5, 0).length === 0 && queryRefs([{ id: 'h', name: 'H', fc: holed }], 1, 1, 0).length === 1, 'huecos del polígono no cuentan');
}

if (fails) { console.error(`\n${fails} verificaciones fallaron`); process.exit(1); }
console.log('\nTodo bien.');
