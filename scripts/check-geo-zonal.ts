// Estadística zonal sobre una grilla sintética 6×5 (celdas de 100 m = 1 ha) con el resultado calculado a mano:
// media, % por clase, zona sin celdas evaluadas, exclusión / sin dato / veto, puntos por zona y orden.
import { pixelToLonLat } from '../src/lib/geo/crs.ts';
import { buildZoneGrid, cellOf, compareNullsLast, defaultZoneOrder, NO_AREA, zonalStats, zonesCsv, zoneName } from '../src/lib/geo/zonal.ts';
import { MASK_EXCLUDED, MASK_NODATA, MASK_VALID, CLASS_VETO } from '../src/lib/geo/suitability.ts';
import type { FC } from '../src/lib/geo/vector.ts';

let fails = 0;
const ok = (c: boolean, n: string) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + n); if (!c) fails++; };
const near = (a: number | null, b: number, eps = 1e-9) => a !== null && Math.abs(a - b) < eps;

const W = 6, H = 5, N = W * H;
const grid = { crs: 'EPSG:32618', width: W, height: H, resM: 100, haPerPixel: 1, transform: [100, 0, 600000, 0, -100, 1200000] as [number, number, number, number, number, number] };

// Rectángulo en coordenadas de celda [c0-½, c1+½] × [r0-½, r1+½] -> lon/lat
const rect = (c0: number, c1: number, r0: number, r1: number) => {
  const p = (c: number, r: number) => pixelToLonLat(c, r, grid.transform, grid.crs);
  return [[p(c0 - 0.5, r0 - 0.5), p(c1 + 0.5, r0 - 0.5), p(c1 + 0.5, r1 + 0.5), p(c0 - 0.5, r1 + 0.5), p(c0 - 0.5, r0 - 0.5)]];
};
const feat = (props: Record<string, unknown>, coordinates: number[][][]) => ({ type: 'Feature' as const, properties: props, geometry: { type: 'Polygon', coordinates } });
const fc: FC = {
  type: 'FeatureCollection',
  features: [
    feat({ nombre: 'A' }, rect(0, 2, 0, 4)),                  // columnas 0–2
    feat({ nombre: 'B' }, rect(3, 4, 0, 4)),                  // columnas 3–4
    feat({ nombre: 'C' }, rect(5, 5, 0, 4)),                  // columna 5: toda fuera del área de estudio
    feat({ nombre: '  ' }, [[[-60, 5], [-59.9, 5], [-59.9, 5.1], [-60, 5.1], [-60, 5]]]), // lejos de la grilla, sin nombre
  ],
};

// Índice y clases a mano: pct = (7 i) mod 101; clase 1 si < 45, 2 si < 70, 3 en otro caso.
const pct = new Uint8Array(N), cls = new Uint8Array(N), mask = new Uint8Array(N).fill(MASK_VALID);
for (let i = 0; i < N; i++) { pct[i] = (i * 7) % 101; cls[i] = pct[i] < 45 ? 1 : pct[i] < 70 ? 2 : 3; }
mask[0] = MASK_NODATA;                        // fuera del área (celda de A)
mask[6] = MASK_EXCLUDED;                      // exclusión (celda de A)
pct[7] = 255; cls[7] = 0;                     // sin dato en todos los criterios (celda de A)
for (let r = 0; r < H; r++) mask[r * W + 5] = MASK_NODATA; // toda la columna 5
pct[20] = 0; cls[20] = CLASS_VETO;            // celda vetada en A (c2, r3)

const zg = buildZoneGrid(fc, grid, 'nombre');
{
  const cnt = [0, 0, 0, 0];
  for (const z of zg.zone) if (z >= 0) cnt[z]++;
  ok(cnt[0] === 15 && cnt[1] === 10 && cnt[2] === 5 && cnt[3] === 0, `celdas por zona 15/10/5/0 (${cnt.join('/')})`);
  ok(zg.names.join('|') === 'A|B|C|Zona 4', `nombres: ${zg.names.join('|')} (vacío -> «Zona 4»)`);
  ok(zoneName({ properties: { n: 7 } }, 0, 'n') === '7' && zoneName({ properties: null }, 2) === 'Zona 3', 'zoneName: número a texto y respaldo');
}

// Puntos: (1,2) en A evaluada; (0,0) en A pero fuera del área; (0,1) en A en exclusión; (4,4) en B; (5,1) en C fuera del área; lejos.
const at = (c: number, r: number) => { const [lon, lat] = pixelToLonLat(c, r, grid.transform, grid.crs); return cellOf(grid, lon, lat); };
const pointCells = [at(1, 2), at(0, 0), at(0, 1), at(4, 4), at(5, 1), cellOf(grid, -60, 5)];
ok(pointCells[0] === 13 && pointCells[3] === 28 && pointCells[5] === null, `cellOf: celdas ${JSON.stringify(pointCells)}`);

// --- aptitud
{
  const st = zonalStats({ zones: zg, pct, cls, mask, haPerPixel: 1, nClasses: 3, direction: 'suitability', pointCells });
  const [a, b, c, d] = st;
  ok(a.cells === 12 && a.ha === 12 && near(a.meanPct, 629 / 12), `A: 12 celdas evaluadas, media ${a.meanPct?.toFixed(3)} (629/12)`);
  ok(JSON.stringify(a.classHa) === '[5,2,5]' && near(a.classPct[0], 100 * 5 / 12) && near(a.classPct[1], 100 * 2 / 12) && near(a.classPct[2], 100 * 5 / 12), 'A: clases 5/2/5 celdas (41.7 / 16.7 / 41.7 %); la vetada cuenta en la clase más baja');
  ok(a.exclHa === 1, 'A: 1 ha excluida (informativa, fuera de los porcentajes)');
  ok(b.cells === 10 && near(b.meanPct, 47.9) && JSON.stringify(b.classHa) === '[4,3,3]' && near(b.classPct[0], 40), 'B: 10 celdas, media 47.9, clases 4/3/3');
  ok(c.cells === 0 && c.meanPct === null && c.classPct.every((p) => p === null) && c.ha === 0, 'C: sin celdas evaluadas -> sin índice ni porcentajes (nunca 0 %)');
  ok(d.cells === 0 && d.meanPct === null, 'zona lejos de la grilla: sin celdas');
  ok(a.points === 2 && b.points === 1 && c.points === 0 && d.points === 0, `puntos por zona A=2 (evaluada + exclusión), B=1, C=0 (fuera del área), lejos=0: ${st.map((s) => s.points).join('/')}`);
  const total = st.reduce((s, z) => s + z.points, 0);
  ok(total === 3, 'de 6 puntos solo 3 caen en una zona dentro del área de estudio');
  const ord = defaultZoneOrder(st).map((s) => s.name).join('|');
  ok(ord === 'A|B|C|Zona 4', `orden por defecto: índice medio descendente, sin área al final (${ord})`);
}

// --- riesgo: la vetada va a la clase MÁS ALTA
{
  const st = zonalStats({ zones: zg, pct, cls, mask, haPerPixel: 1, nClasses: 3, direction: 'risk' });
  ok(JSON.stringify(st[0].classHa) === '[4,2,6]' && near(st[0].classPct[2], 50), 'riesgo, A: la celda vetada cuenta en la clase de mayor riesgo (4/2/6)');
}

// --- ha por celda distinta de 1 y N clases
{
  const st = zonalStats({ zones: zg, pct, cls, mask, haPerPixel: 6.25, nClasses: 4, direction: 'suitability' });
  ok(st[1].ha === 62.5 && st[1].classHa.length === 4 && st[1].classHa[3] === 0 && near(st[1].classPct[3], 0), 'hectáreas = celdas × ha/celda; una clase vacía de una zona con área SÍ vale 0 %');
}

// --- superposición: gana la última
{
  const over: FC = { type: 'FeatureCollection', features: [feat({ n: 'grande' }, rect(0, 4, 0, 4)), feat({ n: 'chica' }, rect(1, 2, 1, 2))] };
  const g2 = buildZoneGrid(over, grid, 'n');
  const cnt = [0, 0]; for (const z of g2.zone) if (z >= 0) cnt[z]++;
  ok(cnt[1] === 4 && cnt[0] === 25 - 4, `superposición: la última zona del archivo gana (${cnt.join('/')})`);
}

// --- comparador y CSV
{
  const rows = [{ n: 'x', v: 5 as number | null }, { n: 'y', v: null }, { n: 'z', v: 9 }, { n: 'w', v: 5 }];
  const asc = rows.slice().sort((p, q) => compareNullsLast(p.v, q.v, 'asc', p.n, q.n)).map((r) => r.n).join('');
  const desc = rows.slice().sort((p, q) => compareNullsLast(p.v, q.v, 'desc', p.n, q.n)).map((r) => r.n).join('');
  ok(asc === 'wxzy' && desc === 'zwxy', `ordenar con nulos al final en ambos sentidos (asc ${asc}, desc ${desc}); empate por nombre`);
  const st = zonalStats({ zones: zg, pct, cls, mask, haPerPixel: 1, nClasses: 3, direction: 'risk', pointCells });
  const csv = zonesCsv(defaultZoneOrder(st), ['Bajo', 'Medio', 'Alto, crítico'], 'risk').split('\n');
  ok(csv[0] === 'zona,riesgo_0_100_medio,ha_evaluadas,ha_excluidas,pct_Bajo,pct_Medio,"pct_Alto, crítico",puntos,estado', `cabecera CSV: ${csv[0]}`);
  ok(csv[1].startsWith('A,52.4,12.00,1.00,33.3,16.7,50.0,2,Evaluada'), `fila A: ${csv[1]}`);
  ok(csv[3] === `C,,,0.00,,,,0,${NO_AREA}`, `zona sin área: celdas vacías y «${NO_AREA}»: ${csv[3]}`);
}

if (fails) { console.error(`\n${fails} verificaciones fallaron`); process.exit(1); }
console.log('\nTodo OK');
