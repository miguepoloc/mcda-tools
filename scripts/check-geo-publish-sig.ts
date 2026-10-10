// Firma de publicación: solo lo que cambia el resultado publicado debe marcarla como desactualizada.
import { changedParts, describeChanges, publishParts, type SigInput } from '../src/lib/geo/publishSig.ts';

let fails = 0;
const ok = (n: string, c: boolean, e = '') => { if (!c) { fails++; console.error('FALLA', n, e); } else console.log('ok   ', n, e); };

const grid = { width: 10, height: 8, resM: 250, haPerPixel: 6.25, crs: 'EPSG:32618' } as never;
const base = (): SigInput => ({
  criteria: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
  weights: [0.5, 0.3, 0.2],
  rules: {
    c1: { layerKey: 'temp', fn: { type: 'up', a: 0, b: 10 } as never },
    c2: { layerKey: 'prec', fn: { type: 'down', a: 0, b: 10 } as never, veto: { op: '<', value: 2 } },
  },
  thresholds: { alta: 0.7, media: 0.45 },
  layers: {
    temp: { role: 'criterion', min: 0, max: 30, bytes: 100 },
    prec: { role: 'criterion', min: 0, max: 900, bytes: 120 },
    sobra: { role: 'criterion', min: 1, max: 2, bytes: 50 },
    nogo: { role: 'exclusion', min: 0, max: 1, bytes: 10 },
  },
  packId: undefined,
  grid,
});
const P0 = publishParts(base());
const diff = (m: (i: SigInput) => void) => { const i = base(); m(i); return changedParts(P0, publishParts(i)); };

ok('misma entrada, misma firma', diff(() => {}).length === 0);
ok('orden de las capas no cuenta', diff((i) => { i.layers = Object.fromEntries(Object.entries(i.layers).reverse()); }).length === 0);
ok('claves del fn en otro orden no cuentan', diff((i) => { i.rules.c1 = { layerKey: 'temp', fn: { b: 10, a: 0, type: 'up' } as never }; }).length === 0);
ok('capa de criterio sin regla no cuenta', diff((i) => { i.layers.sobra = { role: 'criterion', min: 5, max: 9, bytes: 1 }; }).length === 0);
ok('peso de criterio sin mapa no cuenta', diff((i) => { i.weights = [0.5, 0.3, 0.9]; }).length === 0);
ok('pesos proporcionales entre criterios con mapa: sin cambio', diff((i) => { i.weights = [0.25, 0.15, 0.2]; }).length === 0);
ok('cambiar un peso -> pesos', diff((i) => { i.weights = [0.4, 0.4, 0.2]; }).join() === 'pesos');
ok('cambiar la función -> reglas', diff((i) => { i.rules.c1 = { layerKey: 'temp', fn: { type: 'up', a: 0, b: 12 } as never }; }).join() === 'reglas');
ok('quitar el veto -> reglas', diff((i) => { delete i.rules.c2.veto; }).join() === 'reglas');
ok('umbral -> umbrales', diff((i) => { i.thresholds = { alta: 0.75, media: 0.45 }; }).join() === 'umbrales');
ok('capa de exclusión cambia -> capas', diff((i) => { i.layers.nogo = { role: 'exclusion', min: 0, max: 1, bytes: 11 }; }).join() === 'capas');
ok('nueva exclusión -> capas', diff((i) => { i.layers.otra = { role: 'exclusion', min: 0, max: 1 }; }).join() === 'capas');
ok('capa que alimenta cambia de rango -> capas', diff((i) => { i.layers.temp = { role: 'criterion', min: 0, max: 31, bytes: 100 }; }).join() === 'capas');
ok('otra grilla -> área', diff((i) => { i.grid = { ...(grid as object), width: 11 } as never; }).join() === 'area');
ok('varios cambios, en orden fijo', diff((i) => { i.thresholds.alta = 0.8; i.weights = [0.1, 0.3, 0.2]; }).join() === 'pesos,umbrales');
ok('sin partes publicadas (publicación antigua) no se afirma nada', changedParts(null, P0).length === 0);
ok('mensaje', describeChanges(['pesos', 'reglas', 'area']) === 'los pesos de los criterios, las reglas de idoneidad (funciones o vetos) y el área de estudio');

if (fails) { console.error(`${fails} falla(s)`); process.exit(1); }
console.log('check-geo-publish-sig: todo bien');
