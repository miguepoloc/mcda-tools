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

// --- puntos publicados (parte «puntos»)
{
  const list = [{ name: 'A', lat: 11.2, lon: -74.1 }, { name: 'B', lat: 11.3, lon: -74.2 }];
  const withPts = (show: boolean, l = list) => { const i = base(); i.points = { show, list: l }; return publishParts(i); };
  const off = withPts(false);
  ok('apagado: con o sin puntos la firma es la misma', off.puntos === P0.puntos && withPts(false, []).puntos === off.puntos && withPts(false, [{ name: 'Z', lat: 1, lon: 1 }]).puntos === off.puntos);
  ok('el interruptor cambia la firma', withPts(true).puntos !== off.puntos && changedParts(off, withPts(true)).join() === 'puntos');
  ok('apagado no toca las demás partes', (['pesos', 'reglas', 'umbrales', 'capas', 'area'] as const).every((k) => withPts(true)[k] === P0[k]));
  const on = withPts(true);
  ok('renombrar o mover un punto publicado cambia la firma', withPts(true, [{ ...list[0], name: 'A2' }, list[1]]).puntos !== on.puntos && withPts(true, [{ ...list[0], lat: 11.200001 }, list[1]]).puntos !== on.puntos);
  ok('agregar o quitar un punto publicado cambia la firma', withPts(true, list.slice(0, 1)).puntos !== on.puntos);
  ok('el orden de la lista no cuenta', withPts(true, [...list].reverse()).puntos === on.puntos);
  ok('con puntos publicados, cambiar un peso sigue marcando solo «pesos»', (() => { const i = base(); i.points = { show: true, list }; i.weights = [0.4, 0.4, 0.2]; return changedParts(on, publishParts(i)).join(); })() === 'pesos');
  // Publicaciones anteriores a los puntos no traen la parte: valen «sin puntos».
  const { puntos: _drop, ...legacy } = off;
  void _drop;
  ok('publicación anterior + interruptor apagado: al día', changedParts(legacy, off).length === 0 && changedParts(legacy, P0).length === 0);
  ok('publicación anterior + interruptor encendido: desactualizada por «puntos»', changedParts(legacy, on).join() === 'puntos');
  ok('mensaje de «puntos»', describeChanges(['pesos', 'puntos']) === 'los pesos de los criterios y los puntos y su ranking en la vista pública');
}

if (fails) { console.error(`${fails} falla(s)`); process.exit(1); }
console.log('check-geo-publish-sig: todo bien');
