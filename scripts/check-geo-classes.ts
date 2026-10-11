// Modelo de clases variable: lectura de proyectos antiguos, edición (agregar / quitar / mover cortes), códigos y
// estadísticas por clase, y que evaluateGrid (3 clases) siga dando lo mismo que evaluateIndex + classify.
import {
  addClass, applySetup, classLabel, classRange, classSigValue, defaultBreaks, isLegacyEquivalent, removeClass,
  resolveClassModel, setBreak, setClassDef, setupFromGeo,
} from '../src/lib/geo/classes.ts';
import {
  classify, classStats, areaStats, evaluateGrid, evaluateIndex, CLASS_VETO, MASK_EXCLUDED, MASK_NODATA, MASK_VALID, type CriterionRule,
} from '../src/lib/geo/suitability.ts';

import { classStrip, cutFromPct, fmtCut, rangeText, stepCut, stripAlt, stripTicks, validateCut } from '../src/lib/geo/classStrip.ts';

let fails = 0;
const ok = (c: boolean, n: string, extra = '') => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + n + (extra ? ' ' + extra : '')); if (!c) fails++; };
const eq = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

// --- proyecto antiguo: solo {alta, media}
const legacy = { classes: { alta: 0.7, media: 0.45 } };
const m0 = resolveClassModel(legacy);
ok(m0.n === 3 && eq(m0.breaks, [0.45, 0.7]) && m0.direction === 'suitability', 'antiguo = 3 clases, aptitud, cortes [media, alta]');
ok(m0.names.join('|') === 'No apta|Moderada|Alta aptitud', 'nombres por defecto de aptitud', m0.names.join('|'));
ok(isLegacyEquivalent(setupFromGeo(legacy)), 'el modelo antiguo es equivalente al legado (firmas sin cambio)');
const sig = classSigValue(setupFromGeo(legacy)) as { alta: number; media: number };
ok(JSON.stringify(sig) === JSON.stringify({ alta: 0.7, media: 0.45 }), 'firma legado idéntica a JSON.stringify(thresholds)');
const mr = resolveClassModel({ ...legacy, direction: 'risk' });
ok(mr.names.join('|') === 'Riesgo bajo|Riesgo moderado|Riesgo alto', 'nombres por defecto de riesgo');

// --- nuevo proyecto: 3 clases con 45/70
ok(eq(defaultBreaks(3), [0.45, 0.7]) && eq(defaultBreaks(4), [0.25, 0.5, 0.75]) && eq(defaultBreaks(2), [0.5]), 'cortes por defecto');

// --- edición
let s = setupFromGeo(legacy);
s = addClass(s);
ok(s.breaks.length === 3 && s.classes.length === 4, 'agregar clase: 4 clases');
ok(eq(s.breaks, [0.23, 0.45, 0.7]), 'agregar parte por la mitad el tramo más ancho (0–0.45)', JSON.stringify(s.breaks));
ok(s.cut === 'manual', 'editar vuelve a cortes manuales');
for (let i = 0; i < 10; i++) s = addClass(s);
ok(s.breaks.length + 1 === 8, 'máximo 8 clases', String(s.breaks.length + 1));
for (let i = 0; i < 10; i++) s = removeClass(s, 0);
ok(s.breaks.length + 1 === 2, 'mínimo 2 clases', String(s.breaks.length + 1));
ok(removeClass(s, 0).breaks.length === 1, 'no baja de 2');

let t = setupFromGeo(legacy);
t = setClassDef(t, 1, { name: 'Intermedia', color: '#112233' });
t = removeClass(t, 0); // elimina «No apta»; la vecina de arriba hereda el rango
ok(t.classes.length === 2 && t.classes[0].name === 'Intermedia' && eq(t.breaks, [0.7]), 'quitar clase: la vecina absorbe el rango y conserva su nombre', JSON.stringify(t));
ok(JSON.stringify(classRange([0.45, 0.7], 0)) === '[0,0.45]' && JSON.stringify(classRange([0.45, 0.7], 2)) === '[0.7,1]', 'classRange');

// mover un corte no pasa a los vecinos
const b = [0.2, 0.5, 0.8];
ok(eq(setBreak(b, 1, 0.9), [0.2, 0.8, 0.8]) && eq(setBreak(b, 1, 0.1), [0.2, 0.2, 0.8]) && eq(setBreak(b, 0, -3), [0, 0.5, 0.8]), 'setBreak: acotado por vecinos y por 0–1');

// guardar y releer
const saved = applySetup({ rules: {}, classes: { alta: 0.7, media: 0.45 } }, setClassDef(addClass(setupFromGeo(legacy)), 0, { name: 'Crítica' }));
const back = resolveClassModel(saved);
ok(back.n === 4 && back.names[0] === 'Crítica' && back.names[3] === 'Alta aptitud', 'ida y vuelta por GeoConfig', back.names.join('|'));
ok(!('direction' in saved) && saved.classes.alta === 0.7, 'aptitud no escribe direction; classes legado intacto con 4 clases');
const riskSaved = applySetup(saved, { ...setupFromGeo(saved), direction: 'risk' });
ok(riskSaved.direction === 'risk' && resolveClassModel(riskSaved).direction === 'risk', 'riesgo se guarda y se lee');

// --- evaluateGrid (3 clases) = evaluateIndex + classify
const W = 40, N = W * W;
const a = new Float32Array(N), c = new Float32Array(N), mask = new Uint8Array(N).fill(MASK_VALID);
for (let i = 0; i < N; i++) { a[i] = (i * 37) % 101; c[i] = (i * 11) % 90; if (i % 97 === 0) c[i] = NaN; if (i % 211 === 0) mask[i] = MASK_EXCLUDED; if (i % 331 === 0) mask[i] = MASK_NODATA; }
const rules: CriterionRule[] = [
  { key: 'a', weight: 0.7, fn: { type: 'up', a: 0, b: 100 } },
  { key: 'c', weight: 0.3, fn: { type: 'down', a: 0, b: 80 }, veto: { op: '>', value: 85 } },
];
const layers = { a, c };
const g = evaluateGrid(layers, mask, rules, { alta: 0.7, media: 0.45 });
const idx = evaluateIndex(layers, mask, rules, 'suitability');
const cl = classify(idx.s, idx.veto, [0.45, 0.7]);
ok(g.cls.every((v, i) => v === cl[i]) && g.pct.every((v, i) => v === idx.pct[i]), 'evaluateGrid = evaluateIndex + classify');
const st = areaStats(g.cls, g.pct, mask, 1);
const cs = classStats(cl, idx.pct, mask, 1, 3, 'suitability');
ok(st.alta.ha === cs.classes[2].ha && st.media.ha === cs.classes[1].ha && st.noapta.ha === cs.classes[0].ha, 'areaStats = classStats con 3 clases');
ok(Math.abs(cs.classes.reduce((x, y) => x + y.pct, 0) - 100) < 1e-9, 'los % de las clases suman 100');
ok(cs.veto.ha > 0 && cl.some((v) => v === CLASS_VETO), 'hay celdas vetadas y se cuentan aparte');

// --- riesgo: veto fuerza el índice al máximo y cae en la clase más alta
const idr = evaluateIndex(layers, mask, rules, 'risk');
const vi = idr.veto.findIndex((v) => v === 1);
ok(vi >= 0 && idr.s[vi] === 1 && idr.pct[vi] === 100 && idx.s[vi] === 0, 'riesgo: veto = índice máximo (aptitud: 0)');
const clr = classify(idr.s, idr.veto, [0.5]);
const csr = classStats(clr, idr.pct, mask, 1, 2, 'risk');
const nVeto = idr.veto.reduce((x, y) => x + y, 0);
ok(csr.veto.ha === nVeto && csr.classes[1].ha >= nVeto, 'riesgo: las vetadas cuentan en la clase más alta');
const css = classStats(cl, idx.pct, mask, 1, 3, 'suitability');
ok(css.classes[0].ha >= css.veto.ha, 'aptitud: las vetadas cuentan en la clase más baja (no apta)');

// --- etiquetas
const mm = resolveClassModel({ classes: { alta: 0.7, media: 0.45 }, direction: 'risk' });
ok(classLabel(mm, CLASS_VETO) === 'Condición crítica' && classLabel(m0, CLASS_VETO) === 'Vetada' && classLabel(m0, 0) === 'Exclusión' && classLabel(m0, 3) === 'Alta aptitud', 'classLabel');

// --- franja, textos de rango y validación de cortes del editor
{
  ok(fmtCut(0.64) === '64' && fmtCut(0.645) === '64.5' && fmtCut(0.7) === '70' && cutFromPct(64) === 0.64 && cutFromPct(43.7) === 0.437, 'fmtCut / cutFromPct (hasta un decimal de %)');
  ok(rangeText(0.64, 1, true) === 'de 64 a 100' && rangeText(0.48, 0.64, false) === 'de 48 a menos de 64', 'rangeText: «de 64 a 100» / «de 48 a menos de 64»');
  const segs = classStrip([0.48, 0.64], ['No apta', 'Moderada', 'Alta aptitud']);
  ok(segs.length === 3 && eq(segs.map((x) => x.width), [48, 16, 36]) && Math.abs(segs.reduce((a, x) => a + x.width, 0) - 100) < 1e-9, 'franja: anchos proporcionales que suman 100');
  ok(segs[2].text === 'de 64 a 100' && segs[0].text === 'de 0 a menos de 48', 'franja: texto de cada clase');
  const alt = stripAlt(segs);
  ok(alt.indexOf('Alta aptitud, de 64 a 100') < alt.indexOf('No apta, de 0 a menos de 48'), 'texto alternativo: de la clase más alta a la más baja', alt);
  ok(classStrip([0.5, 0.5], ['a', 'b', 'c'])[1].width === 0, 'franja: dos cortes iguales dejan una clase de ancho 0');
  ok(stripTicks([0.48, 0.64]).map((t) => t.label).join() === '48,64', 'rótulos de cortes');
  ok(stripTicks([0.48, 0.5, 0.97]).map((t) => t.label).join() === '48', 'rótulos: omite el que queda a < 6 puntos del anterior o del extremo');
  // validación
  const br = [0.3, 0.5, 0.8];
  const v1 = validateCut(br, 1, 60);
  ok(v1.ok && v1.value === 0.6, 'validateCut: valor válido entre vecinos');
  const bad = (k: number, pct: number) => { const r = validateCut(br, k, pct); return r.ok ? '' : r.message; };
  ok(/mayor que el anterior \(30\)/.test(bad(1, 30)) && /mayor que el anterior/.test(bad(1, 10)), 'validateCut: no pasa del corte anterior');
  ok(/menor que el siguiente \(80\)/.test(bad(1, 80)) && bad(1, 79.9) === '', 'validateCut: no pasa del corte siguiente');
  ok(/entre 0 y 100/.test(bad(0, 0)) && /entre 0 y 100/.test(bad(2, 100)) && /entre 0 y 100/.test(bad(0, -5)), 'validateCut: fuera de 0–100');
  ok(/número/.test(bad(0, NaN)), 'validateCut: no numérico');
  ok(stepCut(64, 1, false) === 65 && stepCut(64, -1, true) === 59 && stepCut(64.3, 1, true) === 69.3, 'stepCut: ±1 y ±5 con Mayús');
}

console.log(fails === 0 ? '\nTodo OK (check-geo-classes)' : `\n${fails} fallas`);
process.exit(fails ? 1 : 0);
