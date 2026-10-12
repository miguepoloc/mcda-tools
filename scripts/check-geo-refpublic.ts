// Capas de referencia en la vista pública: simplificación y topes, privacidad (solo geometría + nombre), meta aditivo,
// saneado de lo que llega de la base, firma y avisos de Compartir.
import { REF_LIMITS, activeRefIds, buildPublishedRefs, publishedRefs, refsAfterDrop, refsAfterReplace, refsSpec, simplifyForPublic, simplifyLine, toggleRef, type RefInput } from '../src/lib/geo/refPublic.ts';
import { changedParts, publishParts, PUNTOS_OFF, type SigInput } from '../src/lib/geo/publishSig.ts';
import { refShareRows } from '../src/lib/geo/share.ts';
import type { FC } from '../src/lib/geo/vector.ts';

let fails = 0;
const ok = (c: boolean, n: string) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + n); if (!c) fails++; };

const circle = (n: number, r = 0.01, cx = -74, cy = 11): number[][] => {
  const o: number[][] = [];
  for (let i = 0; i < n; i++) { const a = (2 * Math.PI * i) / n; o.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  o.push(o[0]);
  return o;
};
const wavy = (n: number): number[][] => Array.from({ length: n }, (_, i) => [-74 + i * 0.00005, 11 + 0.0005 * Math.sin(i / 7)]);
const fc: FC = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { nombre: 'Resguardo X', dueno: 'Fulano', doc: '123' }, geometry: { type: 'Polygon', coordinates: [circle(3000)] } },
    { type: 'Feature', properties: { via: 'Troncal' }, geometry: { type: 'LineString', coordinates: wavy(3000) } },
    { type: 'Feature', properties: { p: 1 }, geometry: { type: 'Point', coordinates: [-74, 11] } },
    { type: 'Feature', properties: {}, geometry: null },
  ],
};

// --- simplificación
{
  ok(simplifyLine(wavy(500), 0.01).length === 2, 'tolerancia grande reduce a los extremos');
  ok(simplifyLine(wavy(500), 0).length === 500, 'tolerancia 0 no toca la línea');
  const s = simplifyForPublic(fc, 800);
  ok(s.verticesIn > 5000, 'cuenta los vértices de entrada (polígono + línea)');
  ok(s.verticesOut <= 800 && s.verticesOut > 0, 'cabe en el cupo de vértices');
  ok(s.tolM > 0, 'informa la tolerancia aplicada');
  ok(s.droppedFeatures === 2, 'punto y geometría nula no se publican (cuentan como sin publicar)');
  const types = s.fc.features.map((f) => f.geometry?.type).sort().join();
  ok(types === 'MultiLineString,MultiPolygon', 'a lo sumo un MultiPolygon y un MultiLineString');
  ok(s.fc.features.every((f) => Object.keys(f.properties ?? {}).length === 0), 'sin atributos');
  const small = simplifyForPublic({ type: 'FeatureCollection', features: [fc.features[1]] }, 100000);
  ok(small.tolM === 0 && small.verticesOut === small.verticesIn, 'si ya cabe, solo se redondea');
}

// --- anillos que colapsan y huecos
{
  const tiny = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [0.000001, 0], [0.000001, 0.000001], [0, 0]]] } }] } as FC;
  ok(simplifyForPublic(tiny, 100).verticesOut === 0, 'polígono menor a 1 m se descarta, no se publica a medias');
  const holed = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circle(40, 0.1), circle(20, 0.02)] } }] } as FC;
  const h = simplifyForPublic(holed, 100);
  ok(h.verticesOut === 62 && h.tolM === 0, 'polígono con hueco que cabe se conserva completo');
}

// --- topes por capas, vértices y bytes
{
  const inp = (i: number): RefInput => ({ id: `k${i}`, name: `Capa ${i}`, fc, color: '#22D3EE', weight: 2 });
  const b = buildPublishedRefs([inp(1), inp(2), inp(3)]);
  ok(b.refs.length === 3 && b.report.length === 3, 'una entrada por capa');
  ok(b.report.reduce((a, r) => a + r.verticesOut, 0) <= REF_LIMITS.maxVerticesTotal, 'el total respeta el tope de vértices');
  ok(b.bytes <= REF_LIMITS.maxBytes, 'el tamaño respeta el tope de bytes');
  ok(b.report.every((r) => r.trimmed), 'avisa que se simplificó');
  const many = buildPublishedRefs(Array.from({ length: 9 }, (_, i) => inp(i)));
  ok(many.refs.length === REF_LIMITS.maxLayers && many.skipped.length === 3, 'tope de capas: el resto se avisa como omitido');
  const tight = buildPublishedRefs([inp(1)], { ...REF_LIMITS, maxBytes: 5000 });
  ok(tight.bytes <= 5000 || tight.report[0].verticesOut <= 100, 'con tope de bytes bajo reduce más (hasta el mínimo)');
  ok(!/Fulano|Resguardo X|Troncal|dueno/.test(JSON.stringify(b.refs)), 'ningún atributo viaja en el meta');
  ok(buildPublishedRefs([]).refs.length === 0, 'sin capas elegidas: nada');
}

// --- lectura de lo publicado (nunca se asume válido)
{
  const b = buildPublishedRefs([{ id: 'a', name: '  Vías   principales ', fc, color: '#112233', fill: '#445566', fillOp: 0.3, weight: 3 }]);
  ok(publishedRefs({}) === null && publishedRefs({ refs: b.refs }) === null, 'publicaciones anteriores o sin showRefs: null');
  const r = publishedRefs({ showRefs: true, refs: b.refs });
  ok(r?.length === 1 && r[0].name === 'Vías principales' && r[0].fill === '#445566' && r[0].fillOp === 0.3, 'con showRefs se lee, con nombre normalizado y estilo');
  const bad = publishedRefs({ showRefs: true, refs: [
    { name: 5 }, null, 'x',
    { name: 'Mala', color: 'javascript:alert(1)', weight: 9999, fill: 'red', fc: { type: 'FeatureCollection', features: [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1], [NaN, 2], [999, 5]] }, properties: { secreto: 1 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] } },
    ] } },
  ] });
  ok(bad?.length === 1 && bad[0].color === '#22D3EE' && bad[0].weight === 8 && bad[0].fill === undefined, 'color y grosor inválidos se corrigen');
  const geom = bad![0].fc.features[0].geometry as { type: string; coordinates: number[][][] };
  ok(bad![0].fc.features.length === 1 && geom.type === 'MultiLineString' && geom.coordinates[0].length === 2, 'coordenadas no finitas o fuera de rango se descartan; los puntos no se publican');
  ok(!JSON.stringify(bad).includes('secreto'), 'atributos que lleguen se eliminan');
  const huge = { name: 'H', color: '#000000', weight: 1, fc: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: wavy(REF_LIMITS.maxVerticesLayer + 500) } }] } };
  ok(publishedRefs({ showRefs: true, refs: [huge] }) === null, 'un meta manipulado con demasiados vértices no se dibuja (tope de seguridad)');
  ok(publishedRefs({ showRefs: true, refs: Array.from({ length: 20 }, () => b.refs[0]) })!.length <= REF_LIMITS.maxLayers, 'tope de capas al leer');
}

// --- selección y limpieza
{
  ok(JSON.stringify(activeRefIds(['b', 'zz', 'a'], ['a', 'b', 'c'])) === '["a","b"]', 'activeRefIds: solo capas que existen, en el orden de la lista');
  ok(toggleRef(undefined, 'a', true)!.join() === 'a' && toggleRef(['a'], 'a', false) === undefined && toggleRef(['b'], 'a', true)!.join() === 'a,b', 'toggleRef');
  ok(refsAfterDrop({ publicRefs: ['a', 'b'] }, 'a').publicRefs!.join() === 'b' && refsAfterDrop({ publicRefs: ['a'] }, 'a').publicRefs === undefined, 'borrar capa: sale de la selección');
  ok(refsAfterReplace({ publicRefs: ['a', 'b'] }, 'a', 'z').publicRefs!.join() === 'z,b', 'reemplazar capa: la selección la sigue');
}

// --- firma
{
  const inp: SigInput = {
    criteria: [{ id: 'c1' }], weights: [1], rules: { c1: { layerKey: 'a', fn: { type: 'up', a: 0, b: 1 } } as never },
    thresholds: { alta: 0.7, media: 0.45 }, layers: { a: { role: 'criterion', min: 0, max: 1 } },
  };
  const base = publishParts(inp);
  ok(base.referencias === PUNTOS_OFF, 'sin referencias: parte «apagado»');
  const spec = refsSpec([{ id: 'r1', name: 'Vías', color: '#111111', weight: 2, path: 'p/r1.geojson.gz', bytes: 10 }]);
  const off = publishParts({ ...inp, refs: { show: false, spec } });
  ok(JSON.stringify(off) === JSON.stringify(base), 'interruptor apagado: la firma no cambia');
  const on = publishParts({ ...inp, refs: { show: true, spec } });
  ok(on.referencias !== base.referencias && on.pesos === base.pesos && on.zonas === base.zonas && on.puntos === base.puntos, 'encendido: solo cambia «referencias»');
  const spec2 = refsSpec([{ id: 'r1', name: 'Vías', color: '#222222', weight: 2, path: 'p/r1.geojson.gz', bytes: 10 }]);
  ok(publishParts({ ...inp, refs: { show: true, spec: spec2 } }).referencias !== on.referencias, 'cambiar el color publicado marca cambios');
  ok(refsSpec([]) === null, 'refsSpec vacío = null');
  const legacy = { ...base } as Partial<typeof base>; delete legacy.referencias;
  ok(changedParts(legacy, base).length === 0, 'publicación anterior sin la parte y sin referencias: al día');
  ok(changedParts(legacy, on).join() === 'referencias', 'publicación anterior + activar el interruptor: «referencias» cambió');
  ok(changedParts(on, base).join() === 'referencias', 'quitar capas publicadas también marca cambios');
}

// --- Compartir
{
  const layers = [{ id: 'r1', label: 'Vías', count: 12 }, { id: 'r2', label: 'Ríos', count: 4 }];
  const none = refShareRows(layers, [], null, false);
  ok(none.rows.length === 2 && none.rows.every((r) => !r.checked) && none.warn === '', 'sin selección: filas por capa y sin aviso');
  const b = buildPublishedRefs([{ id: 'r1', name: 'Vías', fc, color: '#22D3EE', weight: 2 }]);
  const some = refShareRows(layers, ['r1'], b, false);
  ok(some.rows[0].checked && !some.rows[1].checked, 'marca la elegida');
  ok(some.warn.includes('«Vías»') && some.warn.includes('No se publican los atributos') && some.warn.includes('Publicar el mapa') && some.kb > 0, 'aviso con nombre, privacidad y tamaño');
  ok(some.notes.length === 1 && some.notes[0].includes('simplificada'), 'avisa el recorte por capa');
}

console.log(fails ? `\n${fails} FALLA(S)` : '\nTodo OK');
process.exit(fails ? 1 : 0);
