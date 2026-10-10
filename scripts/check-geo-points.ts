// El punto consultado coincide con la celda del ráster que calcula evaluateGrid (mismo índice, misma clase),
// y distingue celda evaluada / exclusión / fuera del área / sin dato / veto.
import { evaluateOnePoint } from '../src/lib/geo/pointEval.ts';
import { classify, evaluateGrid, evaluateIndex, MASK_EXCLUDED, MASK_NODATA, MASK_VALID, CLASS_VETO, type CriterionRule } from '../src/lib/geo/suitability.ts';
import type { GeoData } from '../src/lib/geo/data.ts';

let fails = 0;
const ok = (c: boolean, n: string) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + n); if (!c) fails++; };

const W = 6, H = 5, N = W * H;
const a = new Float32Array(N), b = new Float32Array(N);
for (let i = 0; i < N; i++) { a[i] = (i * 37) % 100; b[i] = (i * 13) % 50; }
b[8] = NaN;                       // sin dato en un criterio
b[9] = NaN; a[9] = NaN;           // sin dato en todos
b[10] = 1000;                     // dispara el veto
const mask = new Uint8Array(N).fill(MASK_VALID);
mask[0] = MASK_NODATA; mask[1] = MASK_EXCLUDED;
const grid = { crs: 'EPSG:32618', width: W, height: H, resM: 100, haPerPixel: 1, transform: [100, 0, 600000, 0, -100, 1200000] as [number, number, number, number, number, number] };
const data: GeoData = {
  grid, layers: { a, b }, mask, points: {},
  info: { a: { label: 'A', unit: 'u', role: 'criterion', min: 0, max: 100 }, b: { label: 'B', unit: 'm', role: 'criterion', min: 0, max: 50 } },
};
const rules: CriterionRule[] = [
  { key: 'a', weight: 0.6, fn: { type: 'up', a: 0, b: 100 } },
  { key: 'b', weight: 0.4, fn: { type: 'down', a: 0, b: 50 }, veto: { op: '>', value: 500 } },
];
const thr = { alta: 0.7, media: 0.45 };
const cfg = { breaks: [thr.media, thr.alta] };
const { pct, cls } = evaluateGrid(data.layers, mask, rules, thr);

let same = true, nOk = 0;
for (let i = 0; i < N; i++) {
  const col = i % W, row = Math.floor(i / W);
  const p = evaluateOnePoint(data, rules, cfg, { col, row });
  if (p.status !== 'ok') continue;
  nOk++;
  if (p.pct !== pct[i] || p.cls !== cls[i]) { same = false; console.error('difiere en', i, p.pct, pct[i], p.cls, cls[i]); }
  if (p.s === null || Math.round(p.s * 100) !== p.pct) same = false;
}
ok(same && nOk > 20, `punto = celda del ráster en ${nOk} celdas evaluadas`);
ok(evaluateOnePoint(data, rules, cfg, { col: 0, row: 0 }).status === 'outside', 'fuera del área de estudio');
ok(evaluateOnePoint(data, rules, cfg, { col: 1, row: 0 }).status === 'excluded', 'exclusión');
const nd = evaluateOnePoint(data, rules, cfg, { col: 3, row: 1 }); // i = 9
ok(nd.status === 'nodata' && nd.s === null && nd.pct === null, 'sin dato en todos los criterios');
const ve = evaluateOnePoint(data, rules, cfg, { col: 4, row: 1 }); // i = 10
ok(ve.status === 'ok' && ve.vetoed && ve.cls === CLASS_VETO && ve.s === 0 && ve.rows.some((r) => r.veto), 'veto: índice 0 y clase vetada');
const part = evaluateOnePoint(data, rules, cfg, { col: 2, row: 1 }); // i = 8: b sin dato, solo vota a
ok(part.status === 'ok' && part.rows.some((r) => r.contrib === 'no vota') && Math.abs((part.s as number) - a[8] / 100) < 1e-9, 'criterio sin dato no vota y reescala pesos');
ok(Number.isFinite(part.lat) && Number.isFinite(part.lon), 'devuelve lat/lon');
// N clases y riesgo: el punto sigue coincidiendo con evaluateIndex + classify
{
  const breaks = [0.2, 0.4, 0.6, 0.8];
  for (const direction of ['suitability', 'risk'] as const) {
    const idx = evaluateIndex(data.layers, mask, rules, direction);
    const cl = classify(idx.s, idx.veto, breaks);
    let all = true, n = 0;
    for (let i = 0; i < N; i++) {
      const p = evaluateOnePoint(data, rules, { breaks, direction }, { col: i % W, row: Math.floor(i / W) });
      if (p.status !== 'ok') continue;
      n++;
      if (p.cls !== cl[i] || p.pct !== idx.pct[i]) all = false;
    }
    ok(all && n > 20, `${direction}, 5 clases: punto = celda (${n} celdas)`);
  }
  const rv = evaluateOnePoint(data, rules, { breaks, direction: 'risk' }, { col: 4, row: 1 });
  ok(rv.vetoed && rv.s === 1 && rv.pct === 100 && rv.cls === CLASS_VETO, 'riesgo: el veto fuerza el índice al máximo');
}
console.log(fails === 0 ? '\nTodo OK (check-geo-points)' : `\n${fails} fallas`);
process.exit(fails ? 1 : 0);
