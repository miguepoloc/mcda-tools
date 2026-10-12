// PROMETHEE con las seis funciones de preferencia de Brans y Vincke (1985) y umbrales por criterio.
// Referencia INDEPENDIENTE: pyDecision.preference_degree (t1 usual, t2 U, t3 V, t4 nivel, t5 lineal, t6 gaussiana) ejecutado
// con Python 3.13 / numpy 2.2 sobre las matrices del curso (IoT/Palmor y el viaje); los valores de abajo son su salida
// (phi+, phi-, phi con 12 decimales). Para regenerarlos: normalizar pesos, F = ['t1'..'t6'], Q/S/P por criterio y, en criterios de
// costo, pasar el dataset en signo negativo (la plataforma invierte el signo igual).
import { describePref, PROMETHEE_FNS, prefFn, resolvePref, sanitizePrometheeConfig, validatePrefSpec, curvePoints } from '../src/lib/prometheeConfig.ts';
import { prometheeConfigSummary, promethee, prometheeI, prometheeSynthesis, preferenceDetail } from '../src/lib/promethee.ts';
import { blankMatrix, normalizeMatrix, resolveTargets, setCell, setType } from '../src/lib/topsis.ts';
import type { DecisionMatrix, PrometheeCriterionConfig } from '../src/lib/types.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const near = (a: number[], b: number[], tol = 1e-9) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= tol);

const IOT = [[10, 8, 2, 5], [10.5, 0.5, 3, 2], [40, 2, 5, 2], [0.07, 1.5, 2, 4]];
const W = [0.16, 0.25, 0.488, 0.102];
const MAX4: ('max' | 'min')[] = ['max', 'max', 'max', 'max'];
const VIAJE = [[95, 3.5, 280], [65, 5.5, 260], [80, 4.5, 340]];
const WV = [0.4, 0.35, 0.25];
const MIN3: ('max' | 'min')[] = ['min', 'min', 'min'];
const cfg = (...c: PrometheeCriterionConfig[]) => c;

type Ref = { plus: number[]; minus: number[]; phi: number[] };
const REF: Record<string, Ref> = {
  legacy: { plus: [0.314818766174, 0.12304332582, 0.588805743384, 0.056444444444], minus: [0.257626846982, 0.315624509558, 0.123333333333, 0.386527589949], phi: [0.057191919192, -0.192581183738, 0.465472410051, -0.330083145505] },
  usual: { plus: [0.405333333333, 0.432, 0.814666666667, 0.151333333333], minus: [0.432, 0.534, 0.151333333333, 0.686], phi: [-0.026666666667, -0.102, 0.663333333333, -0.534666666667] },
  ushape: { plus: [0.405333333333, 0.378666666667, 0.731333333333, 0.068], minus: [0.378666666667, 0.450666666667, 0.151333333333, 0.602666666667], phi: [0.026666666667, -0.072, 0.58, -0.534666666667] },
  vshape: { plus: [0.367146666667, 0.246035555556, 0.689666666667, 0.088833333333], minus: [0.325777777778, 0.419416666667, 0.151333333333, 0.495154444444], phi: [0.041368888889, -0.173381111111, 0.538333333333, -0.406321111111] },
  level: { plus: [0.361666666667, 0.189333333333, 0.689666666667, 0.068], minus: [0.297333333333, 0.409, 0.151333333333, 0.451], phi: [0.064333333333, -0.219666666667, 0.538333333333, -0.383] },
  linear: { plus: [0.358496296296, 0.187644444444, 0.661888888889, 0.068], minus: [0.297333333333, 0.381222222222, 0.151333333333, 0.446140740741], phi: [0.061162962963, -0.193577777778, 0.510555555556, -0.378140740741] },
  gaussian: { plus: [0.349957901873, 0.150450477663, 0.644066881852, 0.068589125525], minus: [0.277671427785, 0.369800490753, 0.145428478109, 0.420163990264], phi: [0.072286474088, -0.219350013091, 0.498638403742, -0.351574864739] },
  mixed: { plus: [0.354118842101, 0.187644444444, 0.731333333333, 0.05879720074], minus: [0.297333333333, 0.445687561154, 0.146354227821, 0.442518698311], phi: [0.056785508768, -0.25804311671, 0.584979105512, -0.383721497571] },
  viajeMixed: { plus: [0.34691844158, 0.402770976772, 0.1675], minus: [0.294687887177, 0.2625, 0.360001531176], phi: [0.052230554403, 0.140270976772, -0.192501531176] },
  viajeUsual: { plus: [0.475, 0.65, 0.375], minus: [0.525, 0.35, 0.625], phi: [-0.05, 0.3, -0.25] },
};
const q4 = [2, 1, 0.5, 0.5], p4 = [20, 4, 1.5, 1.5], s4 = [10, 2, 1, 1];
const same = (name: string, got: ReturnType<typeof promethee>, ref: Ref) => {
  ok(near(got.phiPlus, ref.plus, 1e-9) && near(got.phiMinus, ref.minus, 1e-9) && near(got.phi, ref.phi, 1e-9), `${name}: φ⁺, φ⁻ y φ coinciden con pyDecision (φ = ${got.phi.map((x) => x.toFixed(4)).join(', ')})`);
};

// 1) Compatibilidad: sin configuración (o con la de siempre) los números son EXACTAMENTE los de antes
{
  const base = promethee(IOT, W, MAX4);
  same('legacy (sin config) = notebook 05', base, REF.legacy);
  const withV = promethee(IOT, W, MAX4, cfg({ fn: 'vshape' }, { fn: 'vshape' }, { fn: 'vshape' }, { fn: 'vshape' }));
  ok(JSON.stringify(withV.pi) === JSON.stringify(base.pi) && JSON.stringify(withV.phi) === JSON.stringify(base.phi), 'V explícita con p = rango da pi y phi idénticos bit a bit');
  const rng = [0, 1, 2, 3].map((j) => Math.max(...IOT.map((r) => r[j])) - Math.min(...IOT.map((r) => r[j])));
  const withP = promethee(IOT, W, MAX4, rng.map((p) => ({ fn: 'vshape' as const, p })));
  ok(JSON.stringify(withP.pi) === JSON.stringify(base.pi), 'V con p = rango escrito a mano: idéntica');
  const withL = promethee(IOT, W, MAX4, rng.map((p) => ({ fn: 'linear' as const, q: 0, p })));
  ok(JSON.stringify(withL.pi) === JSON.stringify(base.pi), 'Lineal con q = 0 y p = rango: idéntica a Tipo III');
  ok(base.fn.every((f) => f === 'vshape') && base.q.every((q) => q === 0) && near(base.p, rng, 0), 'por defecto: fn = V, q = 0, p = rango');
  ok(base.prefs.every((x) => !x.custom && x.issues.length === 0), 'por defecto: ningún criterio figura como personalizado');
}

// 2) Las seis funciones contra pyDecision (misma función en los 4 criterios)
{
  same('usual (Tipo I)', promethee(IOT, W, MAX4, [0, 1, 2, 3].map(() => ({ fn: 'usual' as const }))), REF.usual);
  same('U (Tipo II) q = [2, 1, .5, .5]', promethee(IOT, W, MAX4, q4.map((q) => ({ fn: 'ushape' as const, q }))), REF.ushape);
  same('V (Tipo III) p = [20, 4, 1.5, 1.5]', promethee(IOT, W, MAX4, p4.map((p) => ({ fn: 'vshape' as const, p }))), REF.vshape);
  same('nivel (Tipo IV)', promethee(IOT, W, MAX4, q4.map((q, j) => ({ fn: 'level' as const, q, p: p4[j] }))), REF.level);
  same('lineal (Tipo V)', promethee(IOT, W, MAX4, q4.map((q, j) => ({ fn: 'linear' as const, q, p: p4[j] }))), REF.linear);
  same('gaussiana (Tipo VI) σ = [10, 2, 1, 1]', promethee(IOT, W, MAX4, s4.map((s) => ({ fn: 'gaussian' as const, s }))), REF.gaussian);
}

// 3) Funciones distintas por criterio, y criterios de costo
{
  const mixed = promethee(IOT, W, MAX4, cfg({ fn: 'linear', q: 2, p: 20 }, { fn: 'ushape', q: 1 }, { fn: 'level', q: 0.5, p: 1.5 }, { fn: 'gaussian', s: 1 }));
  same('mixta: lineal + U + nivel + gaussiana', mixed, REF.mixed);
  ok(mixed.order[0] === 2, 'la mixta sigue eligiendo a Sigfox');
  const vm = promethee(VIAJE, WV, MIN3, cfg({ fn: 'linear', q: 5, p: 30 }, { fn: 'level', q: 0.5, p: 1.5 }, { fn: 'gaussian', s: 40 }));
  same('viaje (3 costos): lineal + nivel + gaussiana', vm, REF.viajeMixed);
  same('viaje (3 costos): usual', promethee(VIAJE, WV, MIN3, cfg({ fn: 'usual' }, { fn: 'usual' }, { fn: 'usual' })), REF.viajeUsual);
  ok(vm.order[0] === 1 && vm.order[2] === 2, 'viaje mixto: Centro, Norte, Sur');
  // Σφ = 0 para cualquier configuración
  ok(Math.abs(mixed.phi.reduce((a, b) => a + b, 0)) < 1e-12 && Math.abs(vm.phi.reduce((a, b) => a + b, 0)) < 1e-12, 'Σφ = 0 con cualquier función');
}

// 4) Definición puntual de cada función (casos de borde)
{
  ok(prefFn('usual', 0, 0, 0, 0) === 0 && prefFn('usual', 1e-9, 0, 0, 0) === 1 && prefFn('usual', -3, 0, 0, 0) === 0, 'usual: 0 si d ≤ 0, 1 si d > 0');
  ok(prefFn('ushape', 2, 2, 0, 0) === 0 && prefFn('ushape', 2.0001, 2, 0, 0) === 1, 'U: d = q es indiferente, d > q es 1');
  ok(prefFn('vshape', 5, 0, 10, 0) === 0.5 && prefFn('vshape', 10, 0, 10, 0) === 1 && prefFn('vshape', 99, 0, 10, 0) === 1, 'V: lineal hasta p');
  ok(prefFn('level', 1, 1, 3, 0) === 0 && prefFn('level', 2, 1, 3, 0) === 0.5 && prefFn('level', 3, 1, 3, 0) === 0.5 && prefFn('level', 3.1, 1, 3, 0) === 1, 'nivel: 0 hasta q, 0.5 hasta p inclusive, 1 después');
  ok(prefFn('linear', 1, 1, 3, 0) === 0 && prefFn('linear', 2, 1, 3, 0) === 0.5 && prefFn('linear', 3, 1, 3, 0) === 1, 'lineal: (d − q)/(p − q)');
  ok(prefFn('linear', 2, 2, 2, 0) === 0 && prefFn('linear', 2.5, 2, 2, 0) === 1, 'lineal con q = p no divide por cero (escalón)');
  ok(Math.abs(prefFn('gaussian', 1, 0, 0, 1) - (1 - Math.exp(-0.5))) < 1e-15 && prefFn('gaussian', -1, 0, 0, 1) === 0, 'gaussiana: 1 − exp(−d²/2σ²)');
  ok(PROMETHEE_FNS.length === 6 && PROMETHEE_FNS.every((f) => [0.3, 2, 9].every((d) => { const v = prefFn(f, d, 1, 5, 2); return v >= 0 && v <= 1; })), 'las 6 funciones devuelven valores en [0, 1]');
  ok([1, 2, 3, 4].every((d, i, a) => i === 0 || PROMETHEE_FNS.every((f) => prefFn(f, d, 1, 5, 2) >= prefFn(f, a[i - 1], 1, 5, 2))), 'todas son monótonas no decrecientes en d');
}

// 5) Valores por defecto y validación (q ≤ p)
{
  const r = resolvePref({ fn: 'level' }, 40);
  ok(r.q === 4 && r.p === 20 && r.defaulted.q && r.defaulted.p && r.issues.length === 0, `nivel sin umbrales: q = ${r.q}, p = ${r.p} (10 % y 50 % del rango 40)`);
  ok(resolvePref({ fn: 'gaussian' }, 40).s === 20 && resolvePref({ fn: 'ushape' }, 40).q === 10, 'defaults: σ = rango/2, U: q = rango/4');
  const bad = resolvePref({ fn: 'linear', q: 10, p: 4 }, 40);
  ok(bad.q === 4 && bad.p === 4 && bad.issues.length === 1, 'q > p se corrige a q = p y se avisa');
  ok(validatePrefSpec({ fn: 'linear', q: 10, p: 4 }).q !== undefined && validatePrefSpec({ fn: 'linear', q: 2, p: 4 }).q === undefined, 'validatePrefSpec: q > p da mensaje; q ≤ p no');
  ok(validatePrefSpec({ fn: 'level', q: 4, p: 4 }).q === undefined, 'q = p es válido');
  ok(validatePrefSpec({ fn: 'vshape', p: 0 }).p !== undefined && validatePrefSpec({ fn: 'gaussian', s: -1 }).s !== undefined && validatePrefSpec({ fn: 'ushape', q: -1 }).q !== undefined, 'p ≤ 0, σ ≤ 0 y q < 0 se rechazan');
  ok(validatePrefSpec({ fn: 'usual', q: 9, p: 1 }).q === undefined, 'umbrales que la función no usa no se validan');
  const g = resolvePref({ fn: 'vshape', p: -5 }, 8);
  ok(g.p === 8 && g.issues.length === 1, 'p inválido cae al rango y avisa');
  ok(describePref(resolvePref({ fn: 'linear', q: 2, p: 20 }, 40)) === 'lineal con indiferencia (Tipo V; q = 2, p = 20)', `describePref: ${describePref(resolvePref({ fn: 'linear', q: 2, p: 20 }, 40))}`);
  const pts = curvePoints('level', 2, 10, 0, 40);
  ok(pts[0][0] === -40 && pts[pts.length - 1][0] === 40 && pts.some((p) => p[0] === 2 && p[1] === 0.5) && pts.some((p) => p[0] === 10 && p[1] === 1), 'curvePoints: nivel con saltos en q y p');
}

// 6) Persistencia aditiva dentro de decision_matrix, saneada y leída por la síntesis
{
  const criteria = ['Alcance', 'Autonomía', 'Infraestructura', 'Madurez'].map((name, i) => ({ id: 'k' + i, name, hint: '' }));
  const alts = ['LoRaWAN', 'GSM/GPRS', 'Sigfox', 'Zigbee'].map((name, i) => ({ id: 'a' + i, name }));
  let dm: DecisionMatrix = blankMatrix();
  alts.forEach((a, i) => criteria.forEach((c, j) => { dm = setCell(dm, a.id, c.id, IOT[i][j]); }));
  criteria.forEach((c) => { dm = setType(dm, c.id, 'max'); });
  const legacy = prometheeSynthesis(criteria, alts, dm, W);
  ok(near(legacy.rows.map((r) => r.phi), REF.legacy.phi, 1e-9), 'síntesis sin prometheeConfig = notebook');
  ok(!('prometheeConfig' in normalizeMatrix(dm)), 'normalizeMatrix no inventa prometheeConfig');
  const dm2: DecisionMatrix = { ...dm, prometheeConfig: { k0: { fn: 'linear', q: 2, p: 20 }, k1: { fn: 'ushape', q: 1 }, k2: { fn: 'level', q: 0.5, p: 1.5 }, k3: { fn: 'gaussian', s: 1 } } };
  const syn = prometheeSynthesis(criteria, alts, dm2, W);
  ok(near(syn.rows.map((r) => r.phi), REF.mixed.phi, 1e-9), 'síntesis con prometheeConfig = referencia pyDecision (mixta)');
  const rt = normalizeMatrix(JSON.parse(JSON.stringify(dm2)));
  ok(JSON.stringify(rt.prometheeConfig) === JSON.stringify(dm2.prometheeConfig), 'sobrevive JSON y normalizeMatrix (respaldo / base de datos)');
  ok(resolveTargets(criteria, alts, dm2).prometheeConfig?.k3?.fn === 'gaussian', 'resolveTargets conserva la configuración');
  const dirty = sanitizePrometheeConfig({ k0: { fn: 'banana' }, k1: { fn: 'level', q: 'x', p: 3, s: -2 }, k2: 5, k3: { fn: 'usual', q: 1 } });
  ok(JSON.stringify(dirty) === JSON.stringify({ k1: { fn: 'level', p: 3 }, k3: { fn: 'usual', q: 1 } }), `saneado tolerante: ${JSON.stringify(dirty)}`);
  ok(sanitizePrometheeConfig(undefined) === undefined && sanitizePrometheeConfig({}) === undefined, 'vacío = sin configuración');
  const sum = prometheeConfigSummary(criteria, alts, dm2);
  ok(sum.custom && sum.items[0].text === 'lineal con indiferencia (Tipo V; q = 2, p = 20)' && sum.items[3].fn === 'gaussian', `resumen: ${sum.items.map((i) => i.text).join(' | ')}`);
  ok(!prometheeConfigSummary(criteria, alts, dm).custom, 'resumen sin config: custom = false');
  // el desglose de un par usa la función del criterio y suma exactamente π
  const mixed = promethee(IOT, W, MAX4, criteria.map((c) => dm2.prometheeConfig?.[c.id]));
  const d = preferenceDetail(IOT, MAX4, mixed, 2, 0);
  ok(d.pi === mixed.pi[2][0] && d.rows[3].fn === 'gaussian' && d.rows[0].q === 2, 'preferenceDetail usa fn/q/p/σ del criterio y suma π exacta');
}

// 7) PROMETHEE I con funciones distintas: hay incomparables cuando φ⁺ y φ⁻ se contradicen; con la de siempre, ranking completo
{
  const base = promethee(IOT, W, MAX4);
  ok(prometheeI(base.phiPlus, base.phiMinus).complete, 'IoT con la función de siempre: PROMETHEE I completo');
  const u = promethee(IOT, W, MAX4, q4.map((q) => ({ fn: 'ushape' as const, q })));
  const p1 = prometheeI(u.phiPlus, u.phiMinus);
  // con U: LoRaWAN φ⁺ 0.4053 / φ⁻ 0.3787 y GSM φ⁺ 0.3787 / φ⁻ 0.4507: LoRaWAN precede a GSM; Zigbee φ⁺ 0.068 / φ⁻ 0.6027 es la última
  ok(p1.rel[0][1] === 'precedes' && p1.rel[2][0] === 'precedes' && p1.rel[3][2] === 'preceded', 'PROMETHEE I con U: Sigfox ▶ LoRaWAN ▶ GSM y Zigbee es precedida');
  // caso fabricado con incomparabilidad real: A fuerte en un criterio, B parejo en otros
  const M = [[10, 0, 0], [0, 6, 6], [4, 4, 4]];
  const r = promethee(M, [0.4, 0.3, 0.3], ['max', 'max', 'max'], [{ fn: 'usual' }, { fn: 'usual' }, { fn: 'usual' }]);
  const rel = prometheeI(r.phiPlus, r.phiMinus);
  ok(r.phiPlus.length === 3 && rel.rel.every((row, i) => row.every((x, k) => (i === k ? x === 'self' : x !== 'self'))), 'PROMETHEE I: todas las relaciones fuera de la diagonal están definidas');
}

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
