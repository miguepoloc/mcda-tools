// Exposición de la población: centroide de cada polígono, suma que conserva el total, personas por clase y % en la
// clase más extrema por zona. Grilla sintética 6×5 (100 m) con el resultado calculado a mano.
import { pixelToLonLat } from '../src/lib/geo/crs.ts';
import { exposure, geometryCentroid, populationPoints } from '../src/lib/geo/population.ts';
import { buildZoneGrid, defaultZoneOrder, zonalStats, zonesCsv } from '../src/lib/geo/zonal.ts';
import { MASK_EXCLUDED, MASK_NODATA, MASK_VALID, CLASS_VETO } from '../src/lib/geo/suitability.ts';
import type { FC } from '../src/lib/geo/vector.ts';

let fails = 0;
const ok = (c: boolean, n: string) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + n); if (!c) fails++; };
const near = (a: number | null | undefined, b: number, eps = 1e-6) => a !== null && a !== undefined && Math.abs(a - b) < eps;

// --- centroides
{
  const sq = { type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 2], [0, 2], [0, 0]]] };
  const c = geometryCentroid(sq)!;
  ok(near(c[0], 2) && near(c[1], 1), `centroide de un rectángulo 4×2 = (2, 1): ${c}`);
  const tri = { type: 'Polygon', coordinates: [[[0, 0], [6, 0], [0, 3], [0, 0]]] };
  const t = geometryCentroid(tri)!;
  ok(near(t[0], 2) && near(t[1], 1), `centroide de un triángulo = promedio de vértices (2, 1): ${t}`);
  // sentido horario y antihorario dan el mismo punto
  const cw = { type: 'Polygon', coordinates: [[[0, 0], [0, 2], [4, 2], [4, 0], [0, 0]]] };
  const w = geometryCentroid(cw)!;
  ok(near(w[0], 2) && near(w[1], 1), 'no depende del sentido del anillo');
  // con hueco: cuadrado 0..10 menos el cuadrado 0..4 x 0..4 -> el centroide se corre hacia (+,+)
  const hole = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]] };
  const h = geometryCentroid(hole)!;
  // (100·5 − 16·2) / 84 = 5.5714...
  ok(near(h[0], (100 * 5 - 16 * 2) / 84) && near(h[1], (100 * 5 - 16 * 2) / 84), `centroide con hueco: ${h}`);
  const multi = { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]], [[[10, 10], [14, 10], [14, 14], [10, 14], [10, 10]]]] };
  const m = geometryCentroid(multi)!;
  ok(near(m[0], 12) && near(m[1], 12), 'multipolígono: centroide de la parte de mayor área (cae dentro de una parte real)');
  ok(geometryCentroid(null) === null && geometryCentroid({ type: 'Point', coordinates: [0, 0] }) === null, 'sin polígono no hay centroide');
}

// --- grilla y mapa (los mismos arreglos que check-geo-zonal)
const W = 6, H = 5, N = W * H;
const grid = { crs: 'EPSG:32618', width: W, height: H, resM: 100, haPerPixel: 1, transform: [100, 0, 600000, 0, -100, 1200000] as [number, number, number, number, number, number] };
const pct = new Uint8Array(N), cls = new Uint8Array(N), mask = new Uint8Array(N).fill(MASK_VALID);
for (let i = 0; i < N; i++) { pct[i] = (i * 7) % 101; cls[i] = pct[i] < 45 ? 1 : pct[i] < 70 ? 2 : 3; }
mask[0] = MASK_NODATA; mask[6] = MASK_EXCLUDED; pct[7] = 255; cls[7] = 0;
for (let r = 0; r < H; r++) mask[r * W + 5] = MASK_NODATA;
pct[20] = 0; cls[20] = CLASS_VETO;

const ll = (c: number, r: number) => pixelToLonLat(c, r, grid.transform, grid.crs);
const tiny = (c: number, r: number, props: Record<string, unknown>) => {
  const e = 0.1; // 0.2 celdas de lado: menor que una celda
  const p = (dc: number, dr: number) => ll(c + dc, r + dr);
  return { type: 'Feature' as const, properties: props, geometry: { type: 'Polygon', coordinates: [[p(-e, -e), p(e, -e), p(e, e), p(-e, e), p(-e, -e)]] } };
};
const zone = (c0: number, c1: number, name: string) => {
  const p = (c: number, r: number) => ll(c, r);
  return { type: 'Feature' as const, properties: { nombre: name }, geometry: { type: 'Polygon', coordinates: [[p(c0 - 0.5, -0.5), p(c1 + 0.5, -0.5), p(c1 + 0.5, H - 0.5), p(c0 - 0.5, H - 0.5), p(c0 - 0.5, -0.5)]] } };
};
const zones: FC = { type: 'FeatureCollection', features: [zone(0, 2, 'A'), zone(3, 4, 'B'), zone(5, 5, 'C')] };
const manzanas: FC = {
  type: 'FeatureCollection',
  features: [
    tiny(1, 2, { pob: 100 }),        // A, evaluada, clase 3
    tiny(2, 0, { pob: 50 }),         // A, evaluada, clase 1
    tiny(0, 1, { pob: 30 }),         // A, exclusión
    tiny(0, 0, { pob: 10 }),         // fuera del área de estudio
    tiny(4, 4, { pob: 70 }),         // B, evaluada, clase 3
    tiny(3, 3, { pob: '20' }),       // B, clase 2 (valor como texto)
    { type: 'Feature', properties: { pob: 5 }, geometry: { type: 'Polygon', coordinates: [[[-60, 5], [-59.99, 5], [-59.99, 5.01], [-60, 5.01], [-60, 5]]] } }, // fuera de la grilla
    tiny(2, 3, { pob: 20 }),         // A, celda vetada
    tiny(3, 1, { pob: 'sin dato' }), // valor no numérico: se omite
    tiny(3, 2, { pob: -4 }),         // negativo: se omite
  ],
};

const pp = populationPoints(manzanas, 'pob');
ok(pp.pts.length === 8 && pp.skipped === 2 && pp.total === 305, `8 polígonos con población, 2 omitidos, total 305 (${pp.pts.length}/${pp.skipped}/${pp.total})`);

const zg = buildZoneGrid(zones, grid, 'nombre');
{
  const ex = exposure({ pts: pp.pts, grid, pct, cls, mask, nClasses: 3, direction: 'suitability', zones: zg });
  ok(JSON.stringify(ex.byClass) === '[70,20,170]', `personas por clase [70,20,170] (la vetada cuenta en la clase menos apta): ${JSON.stringify(ex.byClass)}`);
  ok(ex.evaluated === 260 && ex.notEvaluated === 30 && ex.outside === 15, `evaluadas 260, sin evaluar 30 (exclusión), fuera 15: ${ex.evaluated}/${ex.notEvaluated}/${ex.outside}`);
  ok(ex.total === 305 && ex.evaluated + ex.notEvaluated + ex.outside === ex.total, 'el total se conserva: evaluadas + sin evaluar + fuera = total');
  ok(ex.extremeClass === 0, 'aptitud: la clase más extrema (la menos apta) es la 1');
  const [a, b, c] = ex.perZone;
  ok(JSON.stringify(a.byClass) === '[70,0,100]' && a.evaluated === 170 && a.notEvaluated === 30 && near(a.extremePct, (100 * 70) / 170), `zona A: [70,0,100], 170 evaluadas, 41.18 % en la clase menos apta (${a.extremePct?.toFixed(2)})`);
  ok(JSON.stringify(b.byClass) === '[0,20,70]' && b.evaluated === 90 && b.extremePct === 0, 'zona B: [0,20,70]; 0 % real en la clase menos apta (hay población evaluada)');
  ok(c.evaluated === 0 && c.extremePct === null, 'zona C sin población evaluada: % nulo (no 0 %)');
}
{
  const ex = exposure({ pts: pp.pts, grid, pct, cls, mask, nClasses: 3, direction: 'risk', zones: zg });
  ok(JSON.stringify(ex.byClass) === '[50,20,190]' && ex.extremeClass === 2, `riesgo: la vetada va a la clase más alta [50,20,190]: ${JSON.stringify(ex.byClass)}`);
  ok(near(ex.perZone[0].extremePct, (100 * 120) / 170) && near(ex.perZone[1].extremePct, (100 * 70) / 90), 'riesgo: % en la clase de mayor riesgo A = 70.59, B = 77.78');
}
// sin zonas
{
  const ex = exposure({ pts: pp.pts, grid, pct, cls, mask, nClasses: 3, direction: 'suitability' });
  ok(ex.perZone.length === 0 && ex.total === 305, 'sin zonas: solo totales');
}
// CSV con población
{
  const st = zonalStats({ zones: zg, pct, cls, mask, haPerPixel: 1, nClasses: 3, direction: 'risk' });
  const ex = exposure({ pts: pp.pts, grid, pct, cls, mask, nClasses: 3, direction: 'risk', zones: zg });
  const csv = zonesCsv(defaultZoneOrder(st), ['Bajo', 'Medio', 'Alto'], 'risk', ex.perZone, 'Alto').split('\n');
  ok(csv[0].includes('personas_Bajo,personas_Medio,personas_Alto,poblacion_evaluada,poblacion_sin_evaluar,pct_poblacion_Alto'), `cabecera con población: ${csv[0]}`);
  ok(csv[1].startsWith('A,52.4,12.00,1.00,33.3,16.7,50.0,0,50,0,120,170,30,70.6,'), `fila A: ${csv[1]}`);
  ok(csv[3].startsWith('C,,,0.00,,,,0,0,0,0,0,0,,'), `fila C (sin área): ${csv[3]}`);
}

if (fails) { console.error(`\n${fails} verificaciones fallaron`); process.exit(1); }
console.log('\nTodo OK');
