// Ida y vuelta de los exportadores: el GeoTIFF que escribimos se relee con la misma librería que
// usa QGIS/GDAL por debajo (geotiff.js) y trae los mismos valores, origen, resolución y EPSG.
import { fromArrayBuffer } from 'geotiff';
import { unzipSync, strFromU8 } from 'fflate';
import { gridFromBounds } from '../src/lib/geo/grid.ts';
import { kmz, pixelsCsv, qmlClasses, qmlPct, resultRaster, safeName, toGeoTiff, zipFiles, slug } from '../src/lib/geo/export.ts';
import { buildOverlayMap, gather } from '../src/lib/geo/overlay.ts';
import { describeFn, describeVeto } from '../src/lib/geo/membership.ts';

let fails = 0;
const ok = (name: string, cond: boolean, extra = '') => { if (!cond) { fails++; console.error('FALLA', name, extra); } else console.log('ok   ', name, extra); };
const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

const g = gridFromBounds({ west: -74.3, south: 11.1, east: -74.0, north: 11.4 }, 500);
const n = g.width * g.height;
const pct = new Uint8Array(n), cls = new Uint8Array(n), mask = new Uint8Array(n).fill(1);
for (let i = 0; i < n; i++) { pct[i] = i % 101; cls[i] = 1 + (i % 3); }
mask[0] = 0; mask[1] = 2;

const rp = resultRaster(pct, cls, mask, 'pct');
ok('nodata fuera del área = 255', rp[0] === 255 && rp[5] === pct[5]);
const bytes = await toGeoTiff(rp, g, 255);
const tiff = await fromArrayBuffer(ab(bytes));
const img = await tiff.getImage();
ok('tamaño', img.getWidth() === g.width && img.getHeight() === g.height);
ok('origen', Math.abs(img.getOrigin()[0] - g.transform[2]) < 1e-6 && Math.abs(img.getOrigin()[1] - g.transform[5]) < 1e-6);
ok('resolución', Math.abs(img.getResolution()[0] - 500) < 1e-9 && Math.abs(img.getResolution()[1] + 500) < 1e-9);
ok('EPSG', (img.getGeoKeys() as { ProjectedCSTypeGeoKey: number }).ProjectedCSTypeGeoKey === 32618);
ok('nodata', Number(img.getGDALNoData()) === 255);
const back = (await img.readRasters({ samples: [0] }) as unknown as ArrayLike<number>[])[0];
let same = true; for (let i = 0; i < n; i++) if (back[i] !== rp[i]) { same = false; break; }
ok('valores idénticos tras releer', same);

const f32 = new Float32Array(n).map((_, i) => i * 0.25);
const b2 = await toGeoTiff(f32, g, -9999);
const t2 = await fromArrayBuffer(ab(b2));
const r2 = (await (await t2.getImage()).readRasters({ samples: [0] }) as unknown as ArrayLike<number>[])[0];
ok('Float32 idéntico', r2[12345] === f32[12345]);

ok('QML clases', qmlClasses().includes('paletteEntry value="3"') && qmlClasses().includes('Alta aptitud'));
ok('QML pct', qmlPct().includes('colorrampshader'));

const png = new Uint8Array([137, 80, 78, 71]);
const z = unzipSync(kmz('Prueba <&>', { west: -74.3, south: 11.1, east: -74.0, north: 11.4 }, png));
ok('KMZ trae doc.kml + png', !!z['doc.kml'] && z['overlay.png'].length === 4);
ok('KML escapa el título', strFromU8(z['doc.kml']).includes('Prueba &lt;&amp;&gt;') && strFromU8(z['doc.kml']).includes('<west>-74.3</west>'));

const csv = pixelsCsv(pct, cls, mask, g, 500);
const rows = csv.trim().split('\n');
ok('CSV con cabecera y ≤ ~500 filas', rows[0].startsWith('lon,lat') && rows.length > 100 && rows.length <= 520, `${rows.length} filas`);
ok('CSV lon/lat plausibles', (() => { const [lo, la] = rows[1].split(',').map(Number); return lo < -74 && lo > -74.4 && la > 11 && la < 11.5; })());

const zz = unzipSync(zipFiles({ 'a.txt': 'hola', 'b.bin': new Uint8Array([1, 2, 3]) }));
ok('zip', strFromU8(zz['a.txt']) === 'hola' && zz['b.bin'].length === 3);
ok('slug', slug('Aptitud cacaotera — Sierra Nevada') === 'aptitud-cacaotera-sierra-nevada');

const om = buildOverlayMap(g, 'mercator');
ok('overlay: tamaño razonable', om.width > 50 && om.height > 50 && om.width <= 1800);
let inside = 0; for (const i of om.index) if (i >= 0) inside++;
ok('overlay: casi todo el rectángulo cae en la grilla', inside / om.index.length > 0.9, `${(100 * inside / om.index.length).toFixed(1)} %`);
const src = new Uint32Array(n).fill(0xff00ff00);
const gd = gather(om, src);
ok('gather copia el color', gd.filter((v) => v === 0xff00ff00).length === inside);
const og = buildOverlayMap(g, 'geographic');
ok('overlay geográfico cubre las mismas coordenadas', Math.abs(og.bounds.west - om.bounds.west) < 1e-12);

ok('describeFn steps', describeFn({ type: 'steps', breaks: [70, 150], scores: [0, 0.5, 1] }) === 'Rangos: < 70 → 0 · 70–150 → 0.5 · ≥ 150 → 1');
ok('describeVeto', describeVeto({ op: '<', value: 15 }) === 'Veto si valor < 15' && describeVeto(undefined) === '—');

// --- clases: «sin dato» (celda válida sin dato en ningún criterio) no se disfraza de exclusión (0)
{
  const p2 = new Uint8Array([50, 255, 255, 80]), c2 = new Uint8Array([2, 0, 0, 3]), m2 = new Uint8Array([1, 1, 2, 0]);
  const rc = resultRaster(p2, c2, m2, 'classes');
  ok('clases: válida con dato = su clase', rc[0] === 2);
  ok('clases: válida SIN dato = 255 (no 0)', rc[1] === 255);
  ok('clases: exclusión legal = 0', rc[2] === 0);
  ok('clases: fuera del área = 255', rc[3] === 255);
  ok('pct: exclusión y sin dato = 255', resultRaster(p2, c2, m2, 'pct')[1] === 255 && resultRaster(p2, c2, m2, 'pct')[2] === 255);
}
// --- QML coherente con la paleta de pantalla (semáforo y daltonismo)
ok('QML pct semáforo: paradas = rampa de pantalla', qmlPct('semaforo').includes('#d9534f') && qmlPct('semaforo').includes('#f0ad4e') && qmlPct('semaforo').includes('#2e7d32'));
ok('QML pct daltonismo: viridis', qmlPct('daltonismo').includes('#440154') && qmlPct('daltonismo').includes('#fde725'));
ok('QML clases daltonismo: alta = amarillo, no verde', qmlClasses('daltonismo').includes('value="3" color="#fde725"') && qmlClasses('semaforo').includes('value="3" color="#2e7d32"'));
ok('safeName: sin rutas ni acentos', safeName('../Ecosistemas marinos ñ/x') === 'Ecosistemas_marinos_n_x' && safeName('***') === 'capa');

console.log(fails === 0 ? '\nTodo OK (check-geo-export)' : `\n${fails} fallas`);
process.exit(fails ? 1 : 0);
