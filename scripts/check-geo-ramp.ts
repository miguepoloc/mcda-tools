// Rampa continua construida desde el modelo de clases: cortes, puntos medios, 2–8 clases, riesgo, defecto y coherencia con los puntos.
import { defaultBreaks, resolveClassModel, resolveModel, setupFromGeo, setDirection } from '../src/lib/geo/classes.ts';
import { PALETTES, classRamp, classRgb, modelRampColor, modelRampCss, modelRampHex, paintResult, rampColor, rgbToHex } from '../src/lib/geo/paint.ts';
import { MASK_VALID } from '../src/lib/geo/suitability.ts';

let fails = 0;
const ok = (c: boolean, n: string, extra = '') => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + n + (extra ? ' ' + extra : '')); if (!c) fails++; };
const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const dist = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

const user = resolveModel({ direction: 'suitability', breaks: [0.8, 0.9], classes: [{}, {}, {}], cut: 'manual' });
for (const pal of ['semaforo', 'daltonismo'] as const) {
  const cr = classRgb(user, pal);
  // punto medio de cada clase = su color
  const mids = [0.4, 0.85, 0.95];
  mids.forEach((t, i) => ok(same(modelRampColor(t, user, pal), cr[i + 1]), `${pal}: punto medio ${t} = color clase ${i + 1}`));
  ok(same(modelRampColor(0, user, pal), cr[1]) && same(modelRampColor(1, user, pal), cr[3]), `${pal}: extremos = clases extremas`);
  // en el corte hay una transición (ni un color ni el otro)
  const at80 = modelRampColor(0.8, user, pal);
  ok(!same(at80, cr[1]) && !same(at80, cr[2]), `${pal}: el corte 0.8 es una transición`);
  ok(modelRampHex(0.7, user, pal) === rgbToHex(modelRampColor(0.7, user, pal)), `${pal}: hex == rgb`);
}
// 2, 3, 5 y 8 clases, aptitud y riesgo
for (const dir of ['suitability', 'risk'] as const) for (const n of [2, 3, 5, 8]) {
  const m = resolveModel({ direction: dir, breaks: defaultBreaks(n), classes: Array.from({ length: n }, () => ({})), cut: 'manual' });
  ok(m.n === n, `${dir} n=${n}: modelo con ${n} clases`);
  const cr = classRgb(m, 'semaforo');
  const edges = [0, ...m.breaks, 1];
  let allMid = true;
  for (let i = 0; i < n; i++) if (!same(modelRampColor((edges[i] + edges[i + 1]) / 2, m, 'semaforo'), cr[i + 1])) allMid = false;
  ok(allMid, `${dir} n=${n}: cada punto medio = color de su clase`);
  const st = classRamp(m, 'semaforo');
  ok(st.length === n + 2 && st.every(([t], i) => i === 0 || t >= st[i - 1][0]) && st[0][0] === 0 && st[st.length - 1][0] === 1, `${dir} n=${n}: paradas ordenadas 0–1`);
  ok(modelRampCss(m, 'semaforo').startsWith('linear-gradient(90deg, rgb('), `${dir} n=${n}: CSS`);
  if (n === 2) {
    const g = PALETTES.semaforo.stops;
    const lo = dir === 'risk' ? g[2][1] : g[0][1], hi = dir === 'risk' ? g[0][1] : g[2][1];
    ok(same(modelRampColor(0, m, 'semaforo'), lo) && same(modelRampColor(1, m, 'semaforo'), hi), `${dir} n=2: extremos de la paleta (riesgo invertido)`);
  }
}
// riesgo: bajo = verde, alto = rojo
const risk = resolveModel(setDirection(setupFromGeo({}), 'risk'));
ok(same(modelRampColor(0, risk), PALETTES.semaforo.stops[2][1]) && same(modelRampColor(1, risk), PALETTES.semaforo.stops[0][1]), 'riesgo 3 clases: 0 verde, 1 rojo');
// colores personalizados
const custom = resolveModel({ direction: 'suitability', breaks: [0.5], classes: [{ color: '#112233' }, { color: '#445566' }], cut: 'manual' });
ok(same(modelRampColor(0.25, custom), [0x11, 0x22, 0x33]) && same(modelRampColor(0.75, custom), [0x44, 0x55, 0x66]), 'colores personalizados respetados');
// cortes iguales (clase de ancho 0): sin NaN
const degen = resolveModel({ direction: 'suitability', breaks: [0.5, 0.5], classes: [{}, {}, {}], cut: 'manual' });
ok(Array.from({ length: 101 }, (_, i) => modelRampColor(i / 100, degen)).every((c) => c.every((v) => Number.isFinite(v))), 'cortes iguales: sin NaN');
// modelo por defecto: parecido a la rampa fija anterior
const def = resolveClassModel({ classes: { alta: 0.7, media: 0.45 } });
const worst = Math.max(...Array.from({ length: 21 }, (_, i) => dist(modelRampColor(i / 20, def), rampColor(i / 20))));
ok(worst <= 60, 'defecto 45/70: parecido a la rampa fija anterior', `(dif. máx. ${worst})`);
// coherencia: pixel continuo == color de la rampa en su índice; en clases, el de la clase
const pct = Uint8Array.from([0, 30, 70, 85, 95, 100]);
const cls = Uint8Array.from(pct, (p) => (p < 80 ? 1 : p < 90 ? 2 : 3));
const mask = new Uint8Array(pct.length).fill(MASK_VALID);
const img = paintResult(pct, cls, mask, 'continuous', 'semaforo', user);
const imgC = paintResult(pct, cls, mask, 'classes', 'semaforo', user);
const px = (c: number[]) => ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
ok(Array.from(pct).every((p, i) => img[i] === px(modelRampColor(p / 100, user))), 'continuo: pixel == modelRampColor(índice)');
ok(Array.from(cls).every((c, i) => imgC[i] === px(classRgb(user)[c])), 'clases: pixel == color de la clase');
console.log(fails ? `\n${fails} fallas` : '\nTodo OK');
process.exit(fails ? 1 : 0);
