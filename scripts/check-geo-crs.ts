// Prueba de humo de pixelToLonLat: recupera (aprox.) el lon/lat de los 4 puntos de ejemplo del
// notebook 07 a partir de su (row,col) en la grilla real (manifest.json del paquete snsm-cacao-v1)
// — tolerancia de medio píxel (250 m ≈ 0.0022° en esta latitud), porque el punto real no cae
// exacto en el centro del píxel.
import { readFileSync } from 'node:fs';
import { crsDef, lonLatToPixel, pixelToLonLat, projector, registerCrs, utmCrsFor, type Transform } from '../src/lib/geo/crs.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

const manifest = JSON.parse(readFileSync(new URL('../public/geo-packs/snsm-cacao-v1/manifest.json', import.meta.url), 'utf8'));
const t = manifest.grid.transform as Transform;
const crs = manifest.grid.crs as string;

// (row,col) calculados en Python con rasterio.transform.rowcol contra el mismo dem_250m.tif.
const PUNTOS = {
  Palmor: { row: 318, col: 95, lat: 10.7702774, lon: -74.0241478 },
  'San Pedro': { row: 257, col: 85, lat: 10.9069506, lon: -74.0459379 },
  Bonda: { row: 113, col: 51, lat: 11.2343429, lon: -74.1247860 },
  Guachaca: { row: 106, col: 181, lat: 11.2502349, lon: -73.8284338 },
};
const TOL = 0.0025; // ~medio píxel en grados, a esta latitud

for (const [nombre, p] of Object.entries(PUNTOS)) {
  const [lon, lat] = pixelToLonLat(p.col, p.row, t, crs);
  ok(cerca(lon, p.lon, TOL), `${nombre}: lon = ${lon.toFixed(4)} (esperado ${p.lon})`);
  ok(cerca(lat, p.lat, TOL), `${nombre}: lat = ${lat.toFixed(4)} (esperado ${p.lat})`);

  // Ida y vuelta: lonLatToPixel debe recuperar el mismo (col,row) que se usó para generar
  // [lon,lat] arriba (tolerancia de coma flotante, no de redondeo de píxel) — pixelToMap evalúa el
  // afín en (col+0.5,row+0.5) para tomar el CENTRO del píxel, pero mapToPixel devuelve el índice de
  // píxel (col,row), no ese +0.5: son inversas del mismo par de funciones, no de la misma expresión.
  const [col2, row2] = lonLatToPixel(lon, lat, t, crs);
  ok(cerca(col2, p.col, 1e-6), `${nombre}: lonLatToPixel invierte col (${col2.toFixed(4)} ≈ ${p.col})`);
  ok(cerca(row2, p.row, 1e-6), `${nombre}: lonLatToPixel invierte row (${row2.toFixed(4)} ≈ ${p.row})`);
}

{
  let lanzo = false;
  try { pixelToLonLat(0, 0, t, 'EPSG:99999'); } catch { lanzo = true; }
  ok(lanzo, 'CRS sin definición: lanza en vez de devolver basura');
}

// CRS generales: UTM norte/sur, Bogotá (3116), cadena proj4 cruda y registro en caliente.
ok(crsDef('EPSG:32618')?.includes('+zone=18') === true && !crsDef('EPSG:32618')!.includes('+south'), 'UTM 18N');
ok(crsDef('EPSG:32721')?.includes('+zone=21 +south') === true, 'UTM 21S');
ok(crsDef('EPSG:99999') === null, 'EPSG desconocido -> null');
ok(crsDef('+proj=longlat +datum=WGS84') === '+proj=longlat +datum=WGS84', 'cadena proj4 cruda pasa tal cual');
registerCrs('EPSG:99999', '+proj=utm +zone=18 +datum=WGS84 +units=m +no_defs');
ok(crsDef('EPSG:99999') !== null, 'registerCrs');
ok(utmCrsFor(-74.1, 11.2) === 'EPSG:32618' && utmCrsFor(-3.7, 40.4) === 'EPSG:32630' && utmCrsFor(151.2, -33.9) === 'EPSG:32756', 'zona UTM por lon/lat');
{
  // ida y vuelta lon/lat <-> UTM <-> Bogotá a < 1 m (Santa Marta)
  const [x, y] = projector('EPSG:4326', 'EPSG:32618')(-74.2, 11.25);
  const [lon, lat] = projector('EPSG:32618', 'EPSG:4326')(x, y);
  ok(cerca(lon, -74.2, 1e-8) && cerca(lat, 11.25, 1e-8), 'ida y vuelta UTM');
  const [xb, yb] = projector('EPSG:32618', 'EPSG:3116')(x, y);
  ok(xb > 900000 && xb < 1100000 && yb > 1600000 && yb < 1800000, `UTM 18N -> Bogotá plausible (${xb.toFixed(0)}, ${yb.toFixed(0)})`);
}

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
