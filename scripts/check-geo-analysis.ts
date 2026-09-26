// Interpolación de superficies desde isolíneas, regla de valor objetivo y parcelas contiguas mínimas.
import { interpolateSurface, nearestSource, numericFields, type FC } from '../src/lib/geo/vector.ts';
import { describeFn, suitability, target } from '../src/lib/geo/membership.ts';
import { findParcels } from '../src/lib/geo/patches.ts';
import { CLASS_ALTA, CLASS_MODERADA, MASK_EXCLUDED, MASK_VALID } from '../src/lib/geo/suitability.ts';

let fails = 0;
const ok = (n: string, c: boolean, e = '') => { if (!c) { fails++; console.error('FALLA', n, e); } else console.log('ok   ', n, e); };

// --- vecino más cercano
{
  const W = 20, H = 10, src = new Uint8Array(W * H); src[2 * W + 3] = 1; src[8 * W + 17] = 1;
  const near = nearestSource(src, W, H);
  ok('nearestSource: la celda (4,3) apunta a la fuente (3,2)', near[3 * W + 4] === 2 * W + 3);
  ok('nearestSource: la celda (16,7) apunta a la fuente (17,8)', near[7 * W + 16] === 8 * W + 17);
  ok('nearestSource sin fuentes = -1', nearestSource(new Uint8Array(4), 2, 2)[0] === -1);
}

// --- isolíneas: dos curvas (fila 10 = 0 m, fila 50 = 100 m) -> rampa lineal entre ellas
{
  const W = 40, H = 61, v = new Float32Array(W * H).fill(NaN);
  for (let x = 0; x < W; x++) { v[10 * W + x] = 0; v[50 * W + x] = 100; }
  const s = interpolateSurface(v, W, H, 2000, 1e-5);
  let maxErr = 0;
  for (let y = 10; y <= 50; y++) maxErr = Math.max(maxErr, Math.abs(s[y * W + 20] - (y - 10) * 2.5));
  ok('rampa lineal entre isolíneas (error máx < 1.5 de 100)', maxErr < 1.5, `err=${maxErr.toFixed(3)}`);
  ok('las celdas conocidas no cambian', s[10 * W + 5] === 0 && s[50 * W + 5] === 100);
  ok('fuera de las isolíneas es plano (no extrapola)', Math.abs(s[2 * W + 20]) < 0.5 && Math.abs(s[58 * W + 20] - 100) < 0.5);
  let mono = true; for (let y = 11; y <= 50; y++) if (s[y * W + 20] < s[(y - 1) * W + 20] - 1e-3) mono = false;
  ok('monótona entre las isolíneas', mono);
}
// --- puntos sueltos: el valor interpolado queda dentro del rango, sin NaN
{
  const W = 30, H = 30, v = new Float32Array(W * H).fill(NaN);
  v[5 * W + 5] = 10; v[25 * W + 25] = 30; v[5 * W + 25] = 20;
  const s = interpolateSurface(v, W, H);
  let inRange = true, nan = false; for (const x of s) { if (Number.isNaN(x)) nan = true; if (x < 10 - 1e-3 || x > 30 + 1e-3) inRange = false; }
  ok('puntos: sin NaN y dentro del rango de los datos', !nan && inRange);
  ok('sin ningún dato -> todo NaN', Number.isNaN(interpolateSurface(new Float32Array(9).fill(NaN), 3, 3)[4]));
  ok('un único valor -> plano', interpolateSurface(Float32Array.from([NaN, 7, NaN, NaN]), 2, 2).every((x) => x === 7));
}
// --- rendimiento: 1 M de celdas
{
  const W = 1000, H = 1000, v = new Float32Array(W * H).fill(NaN);
  for (let k = 0; k < 8; k++) for (let x = 0; x < W; x++) v[(100 + k * 110) * W + x] = k * 100;
  const t = performance.now(); interpolateSurface(v, W, H); const ms = performance.now() - t;
  ok('1 M de celdas con 8 isolíneas en < 6 s', ms < 6000, `${ms.toFixed(0)} ms`);
}
// --- campos numéricos con nulos (las isolíneas de la tesis traen filas sin valor)
{
  const fc: FC = { type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: null, properties: { prof: 100, fuente: 'x', vacio: null } },
    { type: 'Feature', geometry: null, properties: { prof: null, fuente: 'y', vacio: null } },
    { type: 'Feature', geometry: null, properties: { prof: 200, fuente: 'z' } }] };
  const f = numericFields(fc);
  ok('numericFields acepta nulos y descarta texto y vacíos', f.length === 1 && f[0] === 'prof', JSON.stringify(f));
}
// --- valor objetivo
{
  ok('objetivo: 1 dentro de la tolerancia', target(110, 110, 5, 20) === 1 && target(114, 110, 5, 20) === 1 && target(105, 110, 5, 20) === 1);
  ok('objetivo: cae linealmente', Math.abs(target(125, 110, 5, 20) - 0.5) < 1e-9 && Math.abs(target(95, 110, 5, 20) - 0.5) < 1e-9);
  ok('objetivo: 0 lejos', target(200, 110, 5, 20) === 0 && target(0, 110, 5, 20) === 0);
  ok('objetivo: sin caída = escalón', target(115.1, 110, 5, 0) === 0 && target(115, 110, 5, 0) === 1);
  ok('objetivo: NaN se propaga', Number.isNaN(target(NaN, 1, 1, 1)));
  ok('suitability despacha target', suitability(110, { type: 'target', value: 110, tol: 5, falloff: 20 }) === 1);
  ok('describeFn target', describeFn({ type: 'target', value: 110, tol: 5, falloff: 20 }).startsWith('Valor objetivo 110 ± 5'));
}
// --- parcelas
{
  const W = 30, H = 20, n = W * H, cls = new Uint8Array(n).fill(CLASS_MODERADA), pct = new Uint8Array(n).fill(50), mask = new Uint8Array(n).fill(MASK_VALID);
  const paint = (x0: number, y0: number, x1: number, y1: number, p: number) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { cls[y * W + x] = CLASS_ALTA; pct[y * W + x] = p; } };
  paint(2, 2, 7, 7, 90);          // 36 celdas
  paint(12, 3, 14, 4, 80);        // 6 celdas
  paint(20, 10, 21, 10, 85);      // 2 celdas
  cls[15 * W + 15] = CLASS_ALTA; pct[15 * W + 15] = 95; cls[16 * W + 16] = CLASS_ALTA; pct[16 * W + 16] = 95; // diagonal: 8 vecinos las une
  mask[3 * W + 3] = MASK_EXCLUDED;   // un hueco de exclusión dentro de la 1ª parcela
  const r = findParcels(cls, pct, mask, W, H, 5, 4);
  ok('parcelas ≥ 5 celdas: quedan 2 (la de 35 y la de 6)', r.parcels.length === 2, r.parcels.map((p) => p.cells).join(','));
  ok('ordenadas de mayor a menor', r.parcels[0].cells === 35 && r.parcels[1].cells === 6);
  ok('hectáreas = celdas × ha/celda', r.parcels[0].ha === 140);
  ok('idoneidad media y mínima', Math.abs(r.parcels[0].meanPct - 90) < 1e-9 && r.parcels[0].minPct === 90);
  ok('las celdas de parcelas chicas quedan en 0', r.labels[10 * W + 20] === 0 && r.labels[15 * W + 15] === 0);
  ok('la exclusión no entra a la parcela', r.labels[3 * W + 3] === 0 && r.labels[2 * W + 2] === 1);
  const r2 = findParcels(cls, pct, mask, W, H, 2, 4);
  ok('con mínimo de 2 celdas entran las 4 (la diagonal cuenta como una)', r2.parcels.length === 4, r2.parcels.map((p) => p.cells).join(','));
  ok('centroide de la parcela 1 dentro de su caja', r.parcels[0].col > 2 && r.parcels[0].col < 7 && r.parcels[0].row > 2 && r.parcels[0].row < 7);
}
console.log(fails === 0 ? '\nTodo OK (check-geo-analysis)' : `\n${fails} fallas`);
process.exit(fails ? 1 : 0);
