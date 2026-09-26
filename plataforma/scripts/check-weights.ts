// Prueba de los métodos de ponderación objetiva CRITIC y Entropía.
// Dataset: caso IoT/Palmor (LoRaWAN, GSM/GPRS, Sigfox, Zigbee x Alcance, Autonomía, Infraestr., Madurez).
// Valores de referencia verificados con la implementación manual en Python (numpy) el 20 sep 2026.
import { criticSteps, criticWeights, entropySteps, entropyWeights } from '../src/lib/weights.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol = 5e-3) => Math.abs(a - b) <= tol;
const sumaUno = (w: number[]) => cerca(w.reduce((a, b) => a + b, 0), 1.0, 1e-9);

const criteria = ['Alcance', 'Autonomia', 'Infraestructura', 'Madurez'].map((name, i) => ({ id: 'k' + i, name, hint: '' }));
const alternatives = ['LoRaWAN', 'GSM/GPRS', 'Sigfox', 'Zigbee'].map((name, i) => ({ id: 'a' + i, name }));
const dataset = [[10, 8, 2, 5], [10.5, 0.5, 3, 2], [40, 2, 5, 2], [0.07, 1.5, 2, 4]];
const dm = { values: {} as Record<string, Record<string, number | string>>, types: {} as Record<string, 'max' | 'min'> };
alternatives.forEach((a, i) => {
  dm.values[a.id] = {};
  criteria.forEach((c, j) => { dm.values[a.id][c.id] = dataset[i][j]; });
});
criteria.forEach((c) => { dm.types[c.id] = 'max'; });

// ---- CRITIC ----
{
  const w = criticWeights(criteria, alternatives, dm);
  ok(w.length === 4, `CRITIC: devuelve 4 pesos (actual: ${w.length})`);
  ok(sumaUno(w), `CRITIC: pesos suman 1 (actual: ${w.reduce((a, b) => a + b, 0).toFixed(6)})`);
  // CRITIC da mayor peso al criterio con mayor variación Y menor correlación con los demás.
  // En este dataset, Madurez (idx 3) es el que tiene la combinación de σ alta y baja correlación → mayor peso.
  // Este valor fue calculado con la implementación y verificado como correcto CRITIC behavior.
  const iMax = w.indexOf(Math.max(...w));
  ok(iMax === 3, `CRITIC: mayor peso en Madurez (idx 3, actual idx ${iMax}, pesos: ${w.map((x) => x.toFixed(3)).join(', ')})`);
  console.log('  CRITIC pesos:', w.map((x) => x.toFixed(4)).join(', '));
}

// ---- Entropía ----
{
  const w = entropyWeights(criteria, alternatives, dm);
  ok(w.length === 4, `Entropía: devuelve 4 pesos (actual: ${w.length})`);
  ok(sumaUno(w), `Entropía: pesos suman 1 (actual: ${w.reduce((a, b) => a + b, 0).toFixed(6)})`);
  // Alcance tiene la distribución más desigual en el dataset → mayor entropía de divergencia → mayor peso.
  const iMax = w.indexOf(Math.max(...w));
  ok(iMax === 0, `Entropía: mayor peso en Alcance (idx 0, actual idx ${iMax}, pesos: ${w.map((x) => x.toFixed(3)).join(', ')})`);
  console.log('  Entropía pesos:', w.map((x) => x.toFixed(4)).join(', '));
}

// Vacios: no deben fallar.
{
  const w = criticWeights([], [], { values: {}, types: {} });
  ok(w.length === 0, 'CRITIC vacío: no falla');
  const w2 = entropyWeights([], [], { values: {}, types: {} });
  ok(w2.length === 0, 'Entropía vacía: no falla');
}


// ---- Intermedios (criticSteps / entropySteps): mismos pesos que las funciones de siempre ----
{
  // Valores de criticWeights/entropyWeights ANTES de extraer los pasos (26 sep 2026): la extracción no debe cambiarlos ni un decimal.
  const golden = {
    criticMax: [0.2065287854147377, 0.2132810124367046, 0.2656528508225521, 0.31453735132600563],
    entropyMax: [0.463365899304161, 0.391284698644754, 0.07152444942730218, 0.07382495262378282],
    criticMix: [0.2657741931010497, 0.25475442199868253, 0.23148001423469522, 0.24799137066557236],
    entropyMix: [0.5077647112564311, 0.3527795622736989, 0.05855701163386837, 0.08089871483600167],
  };
  const igual = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-12);
  ok(igual(criticWeights(criteria, alternatives, dm), golden.criticMax), 'CRITIC: pesos idénticos a los de antes de extraer los pasos');
  ok(igual(entropyWeights(criteria, alternatives, dm), golden.entropyMax), 'Entropía: pesos idénticos a los de antes de extraer los pasos');
  const dm2 = { values: dm.values, types: { ...dm.types, k1: 'min' as const, k2: 'min' as const } };
  ok(igual(criticWeights(criteria, alternatives, dm2), golden.criticMix), 'CRITIC con costos: idéntico a antes');
  ok(igual(entropyWeights(criteria, alternatives, dm2), golden.entropyMix), 'Entropía con costos: idéntico a antes');

  for (const [tag, d] of [['beneficio', dm], ['con costos', dm2]] as const) {
    const S = criticSteps(criteria, alternatives, d);
    ok(igual(S.w, criticWeights(criteria, alternatives, d)), `CRITIC pasos (${tag}): w coincide con criticWeights`);
    ok(S.norm.length === 4 && S.norm.every((r) => r.length === 4 && r.every((x) => x >= -1e-12 && x <= 1 + 1e-12)), `CRITIC pasos (${tag}): matriz normalizada 4×4 en [0,1]`);
    ok(S.corr.every((r, j) => cerca(r[j], 1, 1e-12) && r.every((x, k) => cerca(x, S.corr[k][j], 1e-12))), `CRITIC pasos (${tag}): correlación simétrica con diagonal 1`);
    ok(S.C.every((c, j) => cerca(c, S.sigma[j] * S.conflict[j], 1e-12)), `CRITIC pasos (${tag}): C_j = σ_j · Σ(1 − ρ_jk)`);
    ok(cerca(S.total, S.C.reduce((a, b) => a + b, 0), 1e-12) && S.w.every((w, j) => cerca(w, S.C[j] / S.total, 1e-12)), `CRITIC pasos (${tag}): w_j = C_j / ΣC`);
    // Recalculo independiente de σ de la primera columna desde los valores originales (sin pasar por la lib)
    const col = S.raw.map((r) => r[0]);
    const lo = Math.min(...col), hi = Math.max(...col);
    const r0 = col.map((x) => (S.types[0] === 'min' ? (hi - x) / (hi - lo) : (x - lo) / (hi - lo)));
    const mu = r0.reduce((a, b) => a + b, 0) / 4;
    ok(cerca(S.sigma[0], Math.sqrt(r0.reduce((a, x) => a + (x - mu) ** 2, 0) / 4), 1e-12), `CRITIC pasos (${tag}): σ de Alcance recalculado a mano`);
    const E = entropySteps(criteria, alternatives, d);
    ok(igual(E.w, entropyWeights(criteria, alternatives, d)), `Entropía pasos (${tag}): w coincide con entropyWeights`);
    ok(E.p[0].map((_, j) => E.p.reduce((a, r) => a + r[j], 0)).every((x) => cerca(x, 1, 1e-12)), `Entropía pasos (${tag}): cada columna de proporciones suma 1`);
    ok(cerca(E.k, 1 / Math.log(4), 1e-15) && E.E.every((e) => e >= -1e-12 && e <= 1 + 1e-12), `Entropía pasos (${tag}): k = 1/ln(4) y E_j en [0,1]`);
    ok(E.d.every((x, j) => cerca(x, 1 - E.E[j], 1e-15)) && E.w.every((w, j) => cerca(w, E.d[j] / E.dTotal, 1e-12)), `Entropía pasos (${tag}): d_j = 1 − E_j y w_j = d_j / Σd`);
  }
  // Sustitución a mano: E de Alcance = −k · Σ p ln p con p = x/Σx (beneficio)
  const xs = dataset.map((r) => r[0]), tot = xs.reduce((a, b) => a + b, 0);
  const E0 = -(1 / Math.log(4)) * xs.map((x) => x / tot).reduce((a, p) => a + p * Math.log(p), 0);
  ok(cerca(entropySteps(criteria, alternatives, dm).E[0], E0, 1e-12), 'Entropía pasos: E de Alcance recalculado a mano');
  // Costo: 1/x antes de repartir
  ok(cerca(entropySteps(criteria, alternatives, dm2).oriented[1][1], 1 / 0.5, 1e-12), 'Entropía pasos: criterio de costo se invierte (1/x)');
  // vacíos
  ok(criticSteps([], [], { values: {}, types: {} }).w.length === 0 && entropySteps([], [], { values: {}, types: {} }).w.length === 0, 'pasos vacíos: no fallan');
}

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
