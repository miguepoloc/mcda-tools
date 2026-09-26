// Verifica la matemática de capas propias: grilla UTM, rasterizado, distancia euclidiana,
// remuestreo con reproyección y la regla por rangos. Sin DOM ni red.
import { steps, suitability } from '../src/lib/geo/membership.ts';
import { boundsIssue, boundsWarning, gridFromBounds, gridBoundsLonLat, suggestRes, estimatePixels } from '../src/lib/geo/grid.ts';
import { burn, distanceTransform, distanceLayer, distanceLayerPadded, distancePad, fcBounds, paddedGrid, type FC } from '../src/lib/geo/vector.ts';
import { aggregateSource, resampleToGrid, sourcePerCell } from '../src/lib/geo/raster.ts';
import { interpolatedMap } from '../src/lib/geo/mapper.ts';
import { pixelToLonLat, utmCrsFor } from '../src/lib/geo/crs.ts';

let fails = 0;
const ok = (name: string, cond: boolean, extra = '') => { if (!cond) { fails++; console.error('FALLA', name, extra); } else console.log('ok   ', name, extra); };
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

// --- regla por rangos: Tabla VI del artículo (distancia a ecosistemas: <70 m no apta, 70–150 media, >150 apta)
ok('steps <70', steps(50, [70, 150], [0, 0.5, 1]) === 0);
ok('steps 70', steps(70, [70, 150], [0, 0.5, 1]) === 0.5);
ok('steps 149', steps(149, [70, 150], [0, 0.5, 1]) === 0.5);
ok('steps 150', steps(150, [70, 150], [0, 0.5, 1]) === 1);
ok('steps NaN', Number.isNaN(steps(NaN, [1], [0, 1])));
ok('suitability steps', suitability(200, { type: 'steps', breaks: [70, 150], scores: [0, 0.5, 1] }) === 1);

// --- grilla: Santa Marta, UTM 18N
const B = { west: -74.3, south: 11.1, east: -74.0, north: 11.4 };
ok('utm zona', utmCrsFor(-74.15, 11.25) === 'EPSG:32618');
ok('utm sur', utmCrsFor(-60, -10) === 'EPSG:32721');
const g = gridFromBounds(B, 250);
ok('grilla ~ 33 km / 250 m', near(g.width, 133, 6) && near(g.height, 133, 6), `${g.width}x${g.height}`);
ok('haPerPixel', g.haPerPixel === 6.25);
const gb = gridBoundsLonLat(g);
ok('grilla cubre el rectángulo', gb.west <= B.west + 1e-9 && gb.east >= B.east - 1e-9 && gb.south <= B.south + 1e-9 && gb.north >= B.north - 1e-9);
ok('estimatePixels == w*h', estimatePixels(B, 250) === g.width * g.height);
ok('suggestRes respeta el tope', estimatePixels(B, suggestRes(B, 20000)) <= 20000);

// --- rasterizado de un polígono con hueco: el área rasterizada debe acercarse al área real
const g2 = gridFromBounds({ west: -74.3, south: 11.1, east: -74.0, north: 11.4 }, 100);
const sq = (w: number, s: number, e: number, n: number) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
const poly: FC = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [sq(-74.2, 11.15, -74.1, 11.35), sq(-74.16, 11.2, -74.14, 11.3)] } }] };
const b1 = burn(poly, g2, { kind: 'presence' });
let n1 = 0; for (const v of b1) if (!Number.isNaN(v)) n1++;
// área real (m²) por la grilla UTM: 0.1°×0.2° menos 0.02°×0.1°
const kx = 111_320 * Math.cos((11.25 * Math.PI) / 180), ky = 110_574;
const areaTrue = (0.1 * 0.2 - 0.02 * 0.1) * kx * ky;
const areaRas = n1 * g2.resM * g2.resM;
ok('área rasterizada ±2 %', near(areaRas / areaTrue, 1, 0.02), `${(areaRas / areaTrue).toFixed(4)}`);
// el centro del hueco está vacío y un punto del anillo interno también dentro del polígono queda lleno
const holeIdx = (() => { for (let r = 0; r < g2.height; r++) for (let c = 0; c < g2.width; c++) { const [lo, la] = pixelToLonLat(c, r, g2.transform, g2.crs); if (near(lo, -74.15, 0.0005) && near(la, 11.25, 0.0005)) return r * g2.width + c; } return -1; })();
ok('hueco vacío', holeIdx >= 0 && Number.isNaN(b1[holeIdx]));
const fb = fcBounds(poly)!;
ok('fcBounds', near(fb.west, -74.2, 1e-9) && near(fb.north, 11.35, 1e-9));

// --- atributo
const attr: FC = { type: 'FeatureCollection', features: [
  { type: 'Feature', properties: { cls: 2 }, geometry: { type: 'Polygon', coordinates: [sq(-74.2, 11.15, -74.1, 11.25)] } },
  { type: 'Feature', properties: { cls: 3 }, geometry: { type: 'Polygon', coordinates: [sq(-74.15, 11.2, -74.05, 11.3)] } },
] };
const ba = burn(attr, g2, { kind: 'attr', field: 'cls' });
let has2 = false, has3 = false; for (const v of ba) { if (v === 2) has2 = true; if (v === 3) has3 = true; }
ok('atributo: ambos valores presentes', has2 && has3);

// --- distancia: un punto -> distancia exacta euclidiana
const W = 41, H = 31, m = new Uint8Array(W * H); m[15 * W + 20] = 1;
const d = distanceTransform(m, W, H, 250);
ok('dist en el punto = 0', d[15 * W + 20] === 0);
ok('dist (3,4) = 5 celdas', near(d[19 * W + 23], 5 * 250, 1e-3));
ok('dist esquina', near(d[0], Math.hypot(20, 15) * 250, 1e-2));
ok('dist sin elementos -> NaN', Number.isNaN(distanceTransform(new Uint8Array(4), 2, 2, 10)[0]));

// --- distancia real a una línea N-S: a 0.05° de longitud ≈ 5.45 km al este
const line: FC = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[-74.2, 11.1], [-74.2, 11.4]] } }] };
const dl = distanceLayer(line, g2);
let checked = 0, bad = 0;
for (let r = 40; r < 260; r += 55) for (let c = 0; c < g2.width; c += 13) {
  const [lo] = pixelToLonLat(c, r, g2.transform, g2.crs);
  const exp = Math.abs(lo - -74.2) * kx;
  checked++; if (Math.abs(dl[r * g2.width + c] - exp) > 250) bad++;
}
ok('distancia a una línea (±250 m)', bad === 0, `${checked} puntos`);

// --- remuestreo: ráster lon/lat lineal en EPSG:4326 -> la grilla UTM recupera la longitud
const sw = 300, sh = 300, sdata = new Float32Array(sw * sh);
const x0 = -74.4, y0 = 11.5, res = 0.001;
for (let r = 0; r < sh; r++) for (let c = 0; c < sw; c++) sdata[r * sw + c] = x0 + (c + 0.5) * res;
const out = resampleToGrid({ data: sdata, width: sw, height: sh, transform: [res, 0, x0, 0, -res, y0], crs: 'EPSG:4326', nodata: null }, g, 'bilinear');
let worst = 0, cnt = 0;
for (let r = 3; r < g.height - 3; r += 9) for (let c = 3; c < g.width - 3; c += 9) {
  const [lo] = pixelToLonLat(c, r, g.transform, g.crs);
  const v = out[r * g.width + c];
  if (!Number.isNaN(v)) { worst = Math.max(worst, Math.abs(v - lo)); cnt++; }
}
ok('remuestreo 4326->UTM recupera lon (<2e-4°≈22 m)', cnt > 50 && worst < 2e-4, `${cnt} pts, peor ${worst.toExponential(2)}`);
const outNN = resampleToGrid({ data: sdata, width: sw, height: sh, transform: [res, 0, x0, 0, -res, y0], crs: 'EPSG:4326', nodata: null }, g, 'nearest');
ok('nearest fuera del ráster = NaN', Number.isNaN(resampleToGrid({ data: sdata, width: sw, height: sh, transform: [res, 0, -10, 0, -res, 50], crs: 'EPSG:4326', nodata: null }, g, 'nearest')[0]) && !Number.isNaN(outNN[g.width * 60 + 60]));
// nodata
const nd = new Float32Array(sw * sh).fill(-9999);
ok('nodata -> NaN', Number.isNaN(resampleToGrid({ data: nd, width: sw, height: sh, transform: [res, 0, x0, 0, -res, y0], crs: 'EPSG:4326', nodata: -9999 }, g, 'bilinear')[g.width * 60 + 60]));

// --- interpolatedMap: una función afín se reproduce exacta
const im = interpolatedMap(37, 23, (c, r) => [2 * c + r, c - 3 * r], 8);
let maxErr = 0; for (let r = 0; r < 23; r++) for (let c = 0; c < 37; c++) maxErr = Math.max(maxErr, Math.abs(im.u[r * 37 + c] - (2 * c + r)), Math.abs(im.v[r * 37 + c] - (c - 3 * r)));
ok('interpolatedMap exacto en funciones afines', maxErr < 1e-3, maxErr.toExponential(2));
const one = interpolatedMap(1, 1, (c, r) => [c + 5, r + 7], 8);
ok('interpolatedMap 1×1', one.u[0] === 5 && one.v[0] === 7);

// --- ráster fino -> grilla gruesa: promedio / moda por bloques (sin aliasing)
{
  // Fuente de ~22 m (0.0002°) sobre una grilla de 250 m: ~11 píxeles por celda.
  const sw2 = 1500, sh2 = 1500, r2 = 0.0002, x02 = -74.3, y02 = 11.4;
  const src2 = (fill: (c: number, r: number) => number) => {
    const d = new Float32Array(sw2 * sh2);
    for (let r = 0; r < sh2; r++) for (let c = 0; c < sw2; c++) d[r * sw2 + c] = fill(c, r);
    return { data: d, width: sw2, height: sh2, transform: [r2, 0, x02, 0, -r2, y02] as [number, number, number, number, number, number], crs: 'EPSG:4326', nodata: null };
  };
  const gg = gridFromBounds({ west: -74.28, south: 11.12, east: -74.02, north: 11.38 }, 250);
  const stripes = src2((c) => (c % 10 < 7 ? 2 : 1));                        // 70 % de clase 2 en franjas finas
  ok('sourcePerCell ≈ 11 px por celda (ambos ejes)', near(sourcePerCell(stripes, gg).sx, 11, 1.5) && near(sourcePerCell(stripes, gg).sy, 11, 1.5), JSON.stringify(sourcePerCell(stripes, gg)));
  const cat = resampleToGrid(stripes, gg, 'nearest');
  let all2 = 0, nn = 0; for (let r = 5; r < gg.height - 5; r += 7) for (let c = 5; c < gg.width - 5; c += 7) { const v = cat[r * gg.width + c]; if (!Number.isNaN(v)) { nn++; if (v === 2) all2++; } }
  ok('categórico fino: la moda (clase 2) gana en toda celda', nn > 100 && all2 === nn, `${all2}/${nn}`);
  const checker = src2((c, r) => ((c + r) % 2 ? 10 : 0));                   // tablero 0/10: el promedio es 5
  const mean = resampleToGrid(checker, gg, 'bilinear');
  let worstM = 0, nm = 0; for (let r = 5; r < gg.height - 5; r += 7) for (let c = 5; c < gg.width - 5; c += 7) { const v = mean[r * gg.width + c]; if (!Number.isNaN(v)) { nm++; worstM = Math.max(worstM, Math.abs(v - 5)); } }
  ok('continuo fino: promedio por bloque ≈ 5 (sin aliasing)', nm > 100 && worstM < 1, `peor ${worstM.toFixed(2)}`);
  const ag = aggregateSource({ data: new Float32Array([1, 1, -9999, 3, 3, 3, 3, 3, 3]), width: 3, height: 3, transform: [1, 0, 0, 0, -1, 3], crs: 'EPSG:3116', nodata: -9999 }, 2, 2, 'mode');
  ok('aggregateSource: bloque 2×2 con nodata, moda', ag.width === 2 && ag.height === 2 && ag.data[0] === 1 && ag.data[3] === 3 && ag.transform[0] === 2 && ag.transform[4] === -2);
  const rect = aggregateSource({ data: new Float32Array(8), width: 4, height: 2, transform: [10, 0, 0, 0, -5, 10], crs: 'x', nodata: null }, 2, 1, 'mean');
  ok('aggregateSource: bloques no cuadrados (píxel 10×5 -> 20×5)', rect.width === 2 && rect.height === 2 && rect.transform[0] === 20 && rect.transform[4] === -5);
  const agm = aggregateSource({ data: new Float32Array([1, 3, -9999, -9999]), width: 2, height: 2, transform: [1, 0, 0, 0, -1, 2], crs: 'EPSG:3116', nodata: -9999 }, 2, 2, 'mean');
  ok('aggregateSource: promedio ignora nodata', agm.data[0] === 2);
  ok('aggregateSource: bloque sin datos = NaN', Number.isNaN(aggregateSource({ data: new Float32Array([-9999, -9999]), width: 2, height: 1, transform: [1, 0, 0, 0, -1, 1], crs: 'x', nodata: -9999 }, 2, 1, 'mean').data[0]));
}

// --- distancia a elementos FUERA de la grilla (antes «desaparecían» y la distancia salía enorme o NaN)
{
  const gp = gridFromBounds({ west: -74.3, south: 11.1, east: -74.2, north: 11.2 }, 250);
  const [xe] = [gridBoundsLonLat(gp).east];
  // línea N-S 2 km al este del borde este de la grilla (0.018° ≈ 1.96 km a esta latitud)
  const lonLine = xe + 0.018;
  const ext: FC = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[lonLine, 11.0], [lonLine, 11.3]] } }] };
  const { values, padM } = distanceLayerPadded(ext, gp);
  ok('margen de distancia > 2 km', padM > 2000, `${padM} m`);
  const kxp = 111_320 * Math.cos((11.15 * Math.PI) / 180);
  const rMid = Math.floor(gp.height / 2), cEdge = gp.width - 1;
  const [loE] = pixelToLonLat(cEdge, rMid, gp.transform, gp.crs);
  const expected = (lonLine - loE) * kxp;
  ok('distancia al borde este ≈ distancia real a la línea externa (±1.5 celdas)', Math.abs(values[rMid * gp.width + cEdge] - expected) < 375, `${values[rMid * gp.width + cEdge].toFixed(0)} vs ${expected.toFixed(0)} m`);
  ok('distanceLayer coincide con la variante con margen', distanceLayer(ext, gp)[rMid * gp.width + cEdge] === values[rMid * gp.width + cEdge]);
  ok('sin elementos ni en el margen = NaN', Number.isNaN(distanceLayer({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-70, 5] } }] }, gp)[0]));
  const pg = paddedGrid(gp, 10);
  ok('paddedGrid: 10 celdas más por lado, misma resolución', pg.width === gp.width + 20 && pg.height === gp.height + 20 && pg.transform[0] === gp.transform[0] && near(pg.transform[2], gp.transform[2] - 10 * gp.resM, 1e-6) && near(pg.transform[5], gp.transform[5] + 10 * gp.resM, 1e-6));
  ok('distancePad: grillas grandes no crecen sin límite', distancePad(1220, 1220) * 2 + 1220 <= 1800 && distancePad(2000, 2000) === 0 && distancePad(100, 100) === 50);
}

// --- una línea que cruza la grilla y se extiende cientos de miles de celdas fuera se recorta (sin bucles enormes)
{
  const long: FC = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[-90, 11.25], [-58, 11.25]] } }] };
  const t0 = Date.now();
  const bl = burn(long, g2, { kind: 'presence' });
  let cnt = 0; for (const v of bl) if (!Number.isNaN(v)) cnt++;
  ok('línea gigante: cruza toda la grilla y termina rápido', cnt >= g2.width && cnt < g2.width * 3 && Date.now() - t0 < 2000, `${cnt} celdas, ${Date.now() - t0} ms`);
}

// --- validación del rectángulo del área de estudio (antes NaN/lat 95° producían una grilla corrupta)
{
  ok('boundsIssue: válido', boundsIssue(B) === null);
  ok('boundsIssue: NaN', boundsIssue({ ...B, north: NaN }) !== null);
  ok('boundsIssue: latitud 95°', boundsIssue({ ...B, north: 95 }) !== null);
  ok('boundsIssue: este < oeste', boundsIssue({ ...B, east: -75 }) !== null);
  ok('boundsIssue: 40° de ancho', boundsIssue({ west: -100, east: -60, south: 0, north: 10 }) !== null);
  ok('boundsWarning: 15° avisa y 1° no', boundsWarning({ west: -80, east: -65, south: 0, north: 5 }) !== null && boundsWarning(B) === null);
  let threw = false; try { gridFromBounds({ ...B, north: NaN }, 250); } catch { threw = true; }
  ok('gridFromBounds lanza con coordenadas inválidas (no devuelve una grilla NaN)', threw);
  ok('estimatePixels de un rectángulo inválido = 0', estimatePixels({ ...B, north: 95 }, 250) === 0);
}

console.log(fails === 0 ? '\nTodo OK (check-geo-raster)' : `\n${fails} fallas`);
process.exit(fails ? 1 : 0);
