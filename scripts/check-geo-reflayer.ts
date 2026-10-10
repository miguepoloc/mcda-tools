// Polígonos de referencia: limpieza del FC, ida y vuelta gzip (cargador/guardador), ruta y copia al duplicar.
import { decodeFC, encodeFC, nameFields, parseFC, polygonsOnly, zonalAfterDrop, zonalAfterReplace } from '../src/lib/geo/refLayer.ts';
import { cloneLayers, isRefPath, layerPath, refPath } from '../src/lib/geo/store.ts';
import type { FC } from '../src/lib/geo/vector.ts';

let fails = 0;
const ok = (c: boolean, n: string) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + n); if (!c) fails++; };

const sq = (x: number, y: number, s: number) => [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]];
const fc: FC = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { nombre: 'Comuna 1', pob: 1200, obj: { a: 1 }, ok: true }, geometry: { type: 'Polygon', coordinates: sq(-74.2, 11.2, 0.1234567891) } },
    { type: 'Feature', properties: { nombre: 'Comuna 2' }, geometry: { type: 'MultiPolygon', coordinates: [sq(-74.0, 11.2, 0.05), sq(-73.9, 11.2, 0.05)] } },
    { type: 'Feature', properties: { nombre: 'Punto' }, geometry: { type: 'Point', coordinates: [-74, 11] } },
    { type: 'Feature', properties: { nombre: 'Nulo' }, geometry: null },
    { type: 'Feature', properties: { nombre: 'Colección' }, geometry: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', coordinates: sq(-73.5, 11.0, 0.1) }, { type: 'Point', coordinates: [0, 0] }] } },
  ],
};

// --- limpieza
const { fc: clean, dropped } = polygonsOnly(fc);
ok(clean.features.length === 3 && dropped === 2, `solo polígonos: ${clean.features.length} conservados, ${dropped} omitidos`);
ok(clean.features[1].geometry?.type === 'MultiPolygon' && clean.features[2].geometry?.type === 'Polygon', 'MultiPolygon se conserva; GeometryCollection aporta su polígono');
const c0 = (clean.features[0].geometry!.coordinates as number[][][])[0][2];
ok(c0[0] === -74.076543 && c0[1] === 11.323457, `coordenadas a 6 decimales (${c0})`);
ok(JSON.stringify(Object.keys(clean.features[0].properties ?? {})) === JSON.stringify(['nombre', 'pob', 'ok']), 'atributos: solo valores simples (el objeto anidado no viaja)');

// --- ida y vuelta (cargador / guardador)
{
  const gz = await encodeFC(clean);
  const back = await decodeFC(gz);
  ok(gz[0] === 0x1f && gz[1] === 0x8b, 'encodeFC produce gzip (cabecera 1f 8b)');
  ok(JSON.stringify(back) === JSON.stringify(clean), 'decodeFC(encodeFC(fc)) devuelve el mismo FeatureCollection');
  ok(gz.byteLength < JSON.stringify(clean).length, 'el gzip es más pequeño que el JSON');
  let err = '';
  try { parseFC('{"type":"Feature"}'); } catch (e) { err = String(e); }
  ok(/FeatureCollection/.test(err), 'un JSON que no es FeatureCollection se rechaza');
}

// --- rutas
ok(refPath('u1', 'p1', 'comunas') === 'u1/p1/comunas.geojson.gz' && isRefPath('u1/p1/comunas.geojson.gz') && !isRefPath(layerPath('u1', 'p1', 'x')), 'ruta .geojson.gz distinguible de la .f32.gz');

// --- duplicar: la referencia se copia con su extensión (cuota incluida) y las rasters con la suya
{
  const copied: [string, string][] = [];
  const checked: string[] = [];
  const sb = {
    rpc: async (_n: string, a: { p_path: string }) => { checked.push(a.p_path); return { error: null }; },
    storage: { from: () => ({ copy: async (from: string, to: string) => { copied.push([from, to]); return { error: null }; } }) },
  };
  const out = await cloneLayers(sb as never, 'u1', 'p1', 'p2', {
    comunas: { path: 'u1/p1/comunas.geojson.gz', bytes: 900, role: 'reference' },
    temp: { path: 'u1/p1/temp.f32.gz', bytes: 5000, role: 'criterion' },
    pack: { path: '', bytes: 0, role: 'criterion' },
  });
  ok(out.comunas.path === 'u1/p2/comunas.geojson.gz' && out.temp.path === 'u1/p2/temp.f32.gz' && out.pack.path === '', 'cloneLayers: extensión conservada y sin ruta propia intacta');
  ok(copied.length === 2 && checked.length === 2 && checked[0] === 'u1/p2/comunas.geojson.gz', 'cloneLayers: cada copia pasa por la cuota');
}

// --- zonas seleccionadas al borrar / reemplazar
{
  const g = { zonal: { layer: 'comunas', nameField: 'nombre', popLayer: 'manzanas', popField: 'pob' }, otro: 1 };
  ok(zonalAfterDrop(g, 'comunas').zonal === undefined, 'borrar la capa de zonas quita la selección');
  const d = zonalAfterDrop(g, 'manzanas').zonal;
  ok(d?.layer === 'comunas' && d.nameField === 'nombre' && d.popLayer === undefined && d.popField === undefined, 'borrar la capa de población solo quita esa parte');
  ok(zonalAfterDrop(g, 'otra') === g, 'borrar otra capa no toca la selección');
  const r = zonalAfterReplace(g, 'comunas', 'comunas-2').zonal;
  ok(r?.layer === 'comunas-2' && r.popLayer === 'manzanas', 'reemplazar sigue a la capa nueva');
}

// --- atributo con el nombre
{
  const f: FC = { type: 'FeatureCollection', features: [0, 1, 2].map((i) => ({ type: 'Feature' as const, properties: { OBJECTID: i, COD: 'x', NOMBRE: `Z${i}` }, geometry: null })) };
  ok(nameFields(f)[0] === 'NOMBRE', `nameFields prefiere «NOMBRE»: ${nameFields(f).join(',')}`);
}

if (fails) { console.error(`\n${fails} verificaciones fallaron`); process.exit(1); }
console.log('\nTodo OK');
