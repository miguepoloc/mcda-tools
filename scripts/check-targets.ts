// Criterio de tipo OBJETIVO ("nominal-the-best", Taguchi): lo óptimo es un valor específico (ej. 110 V), no
// "más" ni "menos". Se convierte en su distancia al objetivo max(0, |x − objetivo| − tolerancia), que es un
// costo normal, ANTES de que cualquier método vea la matriz (resolveTargets). Los valores esperados son los del
// ejemplo de los sitios para paneles solares del deck de la Sesión 3 (datos inventados), calculados con NumPy.
import { getKind, getTarget, getType, missingTargets, normalizeMatrix, resolveTargets, setTarget, setType, setCell, blankMatrix, targetDistance, topsisSynthesis } from '../src/lib/topsis.ts';
import type { DecisionMatrix } from '../src/lib/types.ts';
import { vikorSynthesis } from '../src/lib/vikor.ts';
import { prometheeSynthesis } from '../src/lib/promethee.ts';
import { electreSynthesis } from '../src/lib/electre.ts';
import { sawSynthesis } from '../src/lib/saw.ts';
import { criticWeights, entropyWeights } from '../src/lib/weights.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol = 5e-4) => Math.abs(a - b) <= tol;

const criteria = [{ id: 'kv', name: 'Voltaje (V)', hint: '' }, { id: 'kg', name: 'Irradiación', hint: '' }];
const sitios = ['Sitio A', 'Sitio B', 'Sitio C', 'Sitio D'].map((name, i) => ({ id: 'a' + i, name }));
const V = [108, 112, 120, 127], G = [5.2, 4.6, 5.8, 5.0];
const w = [0.5, 0.5];

function build(kindV: 'max' | 'min' | 'target', tol = 0, conObjetivo = true): DecisionMatrix {
  let dm: DecisionMatrix = blankMatrix();
  sitios.forEach((a, i) => { dm = setCell(dm, a.id, 'kv', V[i]); dm = setCell(dm, a.id, 'kg', G[i]); });
  dm = setType(dm, 'kv', kindV);
  dm = setType(dm, 'kg', 'max');
  if (kindV === 'target' && conObjetivo) dm = setTarget(dm, 'kv', { value: 110, tol });
  return dm;
}
const ci = (dm: DecisionMatrix) => topsisSynthesis(criteria, sitios, resolveTargets(criteria, sitios, dm), w).rows.map((r) => r.c);
const lista = (xs: number[]) => xs.map((x) => x.toFixed(3)).join(', ');

// ---- la función de distancia ----
ok(targetDistance(108, 110, 0) === 2 && targetDistance(112, 110, 0) === 2 && targetDistance(110, 110, 0) === 0, 'distancia puntual: |x − 110|');
ok(targetDistance(115, 110, 5.5) === 0 && cerca(targetDistance(120, 110, 5.5), 4.5, 1e-9) && targetDistance(104.5, 110, 5.5) === 0, 'con tolerancia ±5.5: 0 dentro de la banda, distancia al borde fuera');

// ---- resolveTargets ----
{
  const dm = build('target', 0);
  const ef = resolveTargets(criteria, sitios, dm);
  ok(sitios.every((a, i) => ef.values[a.id].kv === Math.abs(V[i] - 110)), 'valores efectivos de voltaje = [2, 2, 10, 17]');
  ok(sitios.every((a, i) => ef.values[a.id].kg === G[i]), 'los criterios normales no se tocan');
  ok(getType(ef, 'kv') === 'min' && getKind(ef, 'kv') === 'min', 'el criterio objetivo pasa a costo en la matriz efectiva');
  ok(ef.targets === undefined, 'la matriz efectiva no conserva el objetivo (no se vuelve a resolver)');
  ok(dm.values.a0.kv === 108 && getKind(dm, 'kv') === 'target', 'la matriz cruda no se modifica');
  const sin = build('max');
  ok(resolveTargets(criteria, sitios, sin) === sin, 'sin criterios objetivo devuelve la misma matriz');
  ok(resolveTargets(criteria, sitios, { ...dm, vikorV: 0.3 }).vikorV === 0.3, 'conserva el v de VIKOR');
}

// ---- ejemplo del deck: TOPSIS con el voltaje como objetivo, y qué pasa si se trata mal ----
{
  const esperadoObjetivo = [0.929, 0.866, 0.480, 0.049];
  const c = ci(build('target', 0));
  ok(c.every((x, i) => cerca(x, esperadoObjetivo[i])), `objetivo 110 V: Ci = [${lista(c)}] (esperado [${lista(esperadoObjetivo)}])`);
  const orden = (xs: number[]) => xs.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]).map((p) => 'ABCD'[p[1]]).join('');
  ok(orden(c) === 'ABCD', `objetivo: ranking ${orden(c)} (esperado ABCD)`);
  const b = ci(build('max')), k = ci(build('min'));
  const esperadoBen = [0.368, 0.114, 0.809, 0.538], esperadoCos = [0.632, 0.353, 0.700, 0.256];
  ok(b.every((x, i) => cerca(x, esperadoBen[i])), `mal tratado como beneficio: Ci = [${lista(b)}] (esperado [${lista(esperadoBen)}]), gana ${orden(b)[0]}`);
  ok(k.every((x, i) => cerca(x, esperadoCos[i])), `mal tratado como costo: Ci = [${lista(k)}] (esperado [${lista(esperadoCos)}]), gana ${orden(k)[0]}`);
  ok(orden(b)[0] === 'C' && orden(k)[0] === 'C', 'tratado mal, el ganador equivocado es el Sitio C (a 10 V del objetivo)');
  const banda = ci(build('target', 5.5));
  const esperadoBanda = [0.941, 0.889, 0.614, 0.040];
  ok(banda.every((x, i) => cerca(x, esperadoBanda[i])), `objetivo 110 ± 5.5 V (±5 %): Ci = [${lista(banda)}] (esperado [${lista(esperadoBanda)}])`);
}

// ---- todos los métodos funcionan sobre la matriz efectiva (sin NaN) ----
{
  const ef = resolveTargets(criteria, sitios, build('target', 0));
  const finito = (xs: number[]) => xs.every((x) => Number.isFinite(x));
  ok(finito(topsisSynthesis(criteria, sitios, ef, w).rows.map((r) => r.c)), 'TOPSIS: finito');
  ok(finito(vikorSynthesis(criteria, sitios, ef, w).rows.map((r) => r.q)), 'VIKOR: finito');
  ok(finito(prometheeSynthesis(criteria, sitios, ef, w).rows.map((r) => r.phi)), 'PROMETHEE: finito');
  ok(finito(sawSynthesis(criteria, sitios, ef, w).rows.map((r) => r.value)), 'SAW: finito');
  ok(electreSynthesis(criteria, sitios, ef, w).names.length === 4, 'ELECTRE: corre');
  ok(finito(criticWeights(criteria, sitios, ef)) && finito(entropyWeights(criteria, sitios, ef)), 'pesos CRITIC y Entropía: finitos');
}
// ---- columna constante (todos a igual distancia): ningún método debe dar NaN ni romperse ----
{
  let dm = build('target', 0);
  sitios.forEach((a) => { dm = setCell(dm, a.id, 'kv', 110); }); // los 4 sitios exactamente en el objetivo
  const ef = resolveTargets(criteria, sitios, dm);
  const finito = (xs: number[]) => xs.every((x) => Number.isFinite(x));
  ok(finito(topsisSynthesis(criteria, sitios, ef, w).rows.map((r) => r.c)), 'columna constante en 0: TOPSIS finito');
  ok(finito(vikorSynthesis(criteria, sitios, ef, w).rows.map((r) => r.q)), 'columna constante en 0: VIKOR finito');
  ok(finito(prometheeSynthesis(criteria, sitios, ef, w).rows.map((r) => r.phi)), 'columna constante en 0: PROMETHEE finito');
  ok(finito(sawSynthesis(criteria, sitios, ef, w).rows.map((r) => r.value)), 'columna constante en 0: SAW finito');
  ok(finito(criticWeights(criteria, sitios, ef)) && finito(entropyWeights(criteria, sitios, ef)), 'columna constante en 0: CRITIC y Entropía finitos');
}
// ---- falta el objetivo: neutro y se avisa ----
{
  const dm = build('target', 0, false);
  ok(missingTargets(criteria, dm).join() === 'Voltaje (V)', 'sin objetivo: missingTargets lo reporta');
  const ef = resolveTargets(criteria, sitios, dm);
  ok(sitios.every((a) => ef.values[a.id].kv === 0), 'sin objetivo: distancia 0 (neutro) para todas las alternativas');
  ok(missingTargets(criteria, build('target', 0)).length === 0, 'con objetivo: nada que reportar');
}
// ---- persistencia: normalizeMatrix conserva lo válido y descarta lo inválido ----
{
  const n = normalizeMatrix({ values: {}, types: { kv: 'target' }, targets: { kv: { value: 110, tol: 5 }, kg: { value: 'x', tol: 1 }, kz: { value: 3, tol: -2 } } });
  ok(getKind(n, 'kv') === 'target' && getTarget(n, 'kv')?.value === 110 && getTarget(n, 'kv')?.tol === 5, 'normalizeMatrix conserva tipo y objetivo válidos');
  ok(getTarget(n, 'kg') === null, 'un objetivo no numérico se descarta');
  ok(getTarget(n, 'kz')?.tol === 0, 'una tolerancia negativa pasa a 0');
  ok(normalizeMatrix({ values: {}, types: {} }).targets === undefined, 'sin objetivos no crea el campo');
}

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
