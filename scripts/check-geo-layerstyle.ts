// Estilo por capa del geovisor (G3): saneado tolerante de lo guardado, parches inmutables que no dejan basura,
// restablecer, fusión de visibilidad/opacidad de la sesión, rampas elegidas por capa y estilo efectivo de vectores.
import {
  isStyleId, mergeVis, patchStyle, resetLook, sanitizeStyle, sanitizeStyles, styleRampCss, styleRgb, styleStops, vectorLook, visFromStyles,
  WEIGHT_MAX, WEIGHT_MIN,
} from '../src/lib/geo/layerStyle.ts';
import { LAYER_RAMPS, paintCriterion, paintRaw, rgba, seqColor } from '../src/lib/geo/paint.ts';
import { MASK_VALID } from '../src/lib/geo/suitability.ts';

let fails = 0;
const ok = (c: boolean, n: string, extra = '') => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + n + (extra ? ' ' + extra : '')); if (!c) fails++; };

// --- ids
ok(isStyleId('result') && isStyleId('l:temp') && isStyleId('v:zonas'), 'ids válidos: result, l:, v:');
ok(!isStyleId('diff') && !isStyleId('parcels') && !isStyleId('x') && !isStyleId('l:') && !isStyleId('l:a b'), 'ids inválidos: virtuales, sueltos o con espacios');

// --- saneado tolerante
const dirty = sanitizeStyle({ on: 'sí', op: 7, ramp: 'arcoiris', rev: 'true', color: 'rojo', border: '#12ab3F', weight: 99, fillOp: -2, extra: 1 });
ok(dirty.on === undefined && dirty.op === 1 && dirty.ramp === undefined && dirty.rev === undefined && dirty.color === undefined, 'saneado: descarta tipos y valores inválidos y acota la opacidad');
ok(dirty.border === '#12ab3F' && dirty.weight === WEIGHT_MAX && dirty.fillOp === 0 && !('extra' in dirty), 'saneado: conserva hex válido, acota grosor/relleno y quita campos desconocidos');
ok(sanitizeStyle({ weight: 0 }).weight === WEIGHT_MIN, 'saneado: grosor mínimo');
ok(sanitizeStyle({ ramp: 'auto' }).ramp === undefined, '«auto» no se guarda (es la ausencia de rampa)');
ok(Object.keys(sanitizeStyle(null)).length === 0 && Object.keys(sanitizeStyle('x')).length === 0 && Object.keys(sanitizeStyle([1])).length === 0, 'saneado: null, texto y arreglos dan {}');
const many = sanitizeStyles({ 'l:a': { op: 0.5 }, 'l:b': {}, 'diff': { op: 0.5 }, 'v:c': 'basura', result: { on: false } });
ok(Object.keys(many).sort().join() === 'l:a,result', 'saneado de mapa: descarta ids virtuales, vacíos y basura');
ok(Object.keys(sanitizeStyles(undefined)).length === 0, 'sanitizeStyles(undefined) = {}');

// --- parches inmutables
const base = { 'l:a': { ramp: 'azules' as const } };
const p1 = patchStyle(base, 'l:a', { rev: true });
ok(p1?.['l:a'].ramp === 'azules' && p1?.['l:a'].rev === true && !('rev' in base['l:a']), 'parche: suma el campo y no muta el original');
const p2 = patchStyle(p1, 'l:a', { ramp: undefined, rev: undefined });
ok(p2 === undefined, 'parche: al quedar vacío, la entrada y el mapa desaparecen (geo.styles se quita)');
const p3 = patchStyle(undefined, 'l:b', { color: '#112233' });
ok(p3?.['l:b'].color === '#112233', 'parche sobre undefined crea el mapa');
ok(patchStyle(p3, 'diff', { op: 0.3 }) === p3, 'parche con id inválido no hace nada');
ok(patchStyle(p3, 'l:b', { color: 'azul' }) === undefined, 'parche con valor inválido no deja basura');
ok(patchStyle({ 'l:a': { rev: true } }, 'l:a', { rev: false }) === undefined, 'false quita un booleano');

// --- restablecer conserva visibilidad y opacidad
const mixed = { 'v:z': { on: true, op: 0.6, color: '#ff0000', border: '#00ff00', weight: 4, fillOp: 0.3 } };
const rs = resetLook(mixed, 'v:z');
ok(JSON.stringify(rs) === JSON.stringify({ 'v:z': { on: true, op: 0.6 } }), 'restablecer quita lo visual y conserva on/op');
ok(resetLook({ 'v:z': { color: '#ff0000' } }, 'v:z') === undefined, 'restablecer sin on/op deja geo.styles vacío (undefined)');

// --- fusión de visibilidad/opacidad
const m0 = mergeVis(undefined, { result: { on: true, op: 0.9 } });
ok(m0?.result.on === true && m0?.result.op === 0.9, 'mergeVis crea la entrada');
ok(mergeVis(m0, { result: { on: true, op: 0.9 } }) === m0, 'mergeVis idéntico devuelve el mismo objeto (sin guardado de más)');
ok(mergeVis(m0, {}) === m0, 'mergeVis sin cambios devuelve el mismo objeto');
const m1 = mergeVis({ 'l:a': { ramp: 'grises' as const } }, { 'l:a': { on: false, op: 0.4567 } });
ok(m1?.['l:a'].ramp === 'grises' && m1?.['l:a'].on === false && m1?.['l:a'].op === 0.46, 'mergeVis conserva lo visual y redondea la opacidad a 2 decimales');
ok(mergeVis(undefined, { diff: { on: true, op: 1 } }) === undefined, 'mergeVis ignora capas virtuales');
const back = visFromStyles({ 'l:a': { on: false, op: 0.4 }, 'l:b': { ramp: 'azules' }, 'l:c': { on: true } });
ok(Object.keys(back).join() === 'l:a' && back['l:a'].on === false && back['l:a'].op === 0.4, 'visFromStyles solo devuelve entradas con on y op');
ok(Object.keys(visFromStyles(undefined)).length === 0, 'visFromStyles(undefined) = {}');
// ida y vuelta por JSON (lo que pasa al guardar en Supabase)
const rt = sanitizeStyles(JSON.parse(JSON.stringify(m1)));
ok(JSON.stringify(rt) === JSON.stringify(m1), 'ida y vuelta por JSON y saneado no altera el estilo');

// --- rampas por capa
ok(styleStops(undefined) === null && styleStops({}) === null, 'sin rampa elegida: null (se usa la de siempre)');
const st = styleStops({ ramp: 'azules' })!;
ok(st === LAYER_RAMPS.azules.stops, 'rampa elegida: paradas de la tabla');
const rv = styleStops({ ramp: 'azules', rev: true })!;
ok(rv[0][0] === 0 && rv[0][1].join() === st[st.length - 1][1].join() && rv[rv.length - 1][1].join() === st[0][1].join(), 'invertida: el primer color es el último de la rampa y las posiciones siguen ascendiendo');
ok(rv.every(([t], i) => i === 0 || t >= rv[i - 1][0]), 'invertida: posiciones monótonas');
ok(styleRampCss(undefined, 'FALLBACK') === 'FALLBACK' && styleRampCss({ ramp: 'grises' }, 'FALLBACK').startsWith('linear-gradient('), 'CSS de rampa: la de siempre o la elegida');
ok(styleRgb(undefined, [1, 2, 3]).join() === '1,2,3' && styleRgb({ color: '#ff0000' }, [1, 2, 3]).join() === '255,0,0', 'color plano: el elegido o el de siempre');

// --- pintado: la rampa cambia colores y respeta máscara; sin rampa es idéntico a antes
const layer = new Float32Array([0, 5, 10, NaN]);
const mask = new Uint8Array(4).fill(MASK_VALID);
const plain = paintRaw(layer, 0, 10);
const same = paintRaw(layer, 0, 10, null);
ok(Array.from(plain).join() === Array.from(same).join(), 'paintRaw sin rampa elegida = comportamiento anterior');
const [r0, g0, b0] = seqColor(0);
ok(plain[0] === rgba(r0, g0, b0), 'paintRaw por defecto usa la rampa azul–amarillo');
const grey = paintRaw(layer, 0, 10, LAYER_RAMPS.grises.stops);
ok(grey[0] === rgba(245, 245, 245) && grey[2] === rgba(37, 37, 37) && grey[3] === 0, 'paintRaw con rampa gris: extremos y NaN transparente');
const crit = paintCriterion(new Float32Array([0, 10]), new Uint8Array(2).fill(MASK_VALID), { type: 'up', a: 0, b: 10 }, 'semaforo', 'suitability', LAYER_RAMPS.viridis.stops);
ok(crit[0] === rgba(68, 1, 84) && crit[1] === rgba(253, 231, 37), 'paintCriterion con rampa elegida: 0 y 1 en los extremos de la rampa');
const critRisk = paintCriterion(new Float32Array([0, 10]), new Uint8Array(2).fill(MASK_VALID), { type: 'up', a: 0, b: 10 }, 'semaforo', 'risk', LAYER_RAMPS.viridis.stops);
ok(critRisk[0] === crit[0], 'con rampa elegida la dirección no la invierte (la inversión es explícita)');
void mask;

// --- vectores: lo elegido > lo propio de la capa > por defecto
const d = vectorLook(undefined, { color: '#22D3EE' });
ok(d.fill === '#22D3EE' && d.stroke === '#22D3EE' && d.weight === 1.5 && d.fillOpacity === 0.12, 'vector sin estilo: valores de siempre');
const rf = vectorLook(undefined, { color: '#22D3EE', weight: 2, fillOpacity: 0 });
ok(rf.weight === 2 && rf.fillOpacity === 0, 'referencia sin estilo: contorno sin relleno, como antes');
const c1 = vectorLook({ color: '#112233' }, { color: '#22D3EE' });
ok(c1.fill === '#112233' && c1.stroke === '#112233', 'solo color: relleno y contorno iguales');
const c2 = vectorLook({ color: '#112233', border: '#ffffff', weight: 5, fillOp: 0.6 }, { color: '#22D3EE', fillOpacity: 0 });
ok(c2.fill === '#112233' && c2.stroke === '#ffffff' && c2.weight === 5 && c2.fillOpacity === 0.6, 'color + borde + grosor + opacidad de relleno');
const c3 = vectorLook({ fillOp: 0 }, { color: '#22D3EE' });
ok(c3.fillOpacity === 0, 'opacidad de relleno 0 es válida (no cae al valor por defecto)');

console.log(fails === 0 ? '\nTodo OK (check-geo-layerstyle)' : `\n${fails} fallas`);
process.exit(fails ? 1 : 0);
