// Prueba del umbral crítico de cada peso (lib/criticalThreshold.ts) con un caso lineal de 2 criterios calculado a mano,
// y comprobación de coherencia con un método real (SAW) sobre el caso Palmor.
import type { Alternative, Criterion, DecisionMatrix } from '../src/lib/types.ts';
import { criticalThresholds } from '../src/lib/criticalThreshold.ts';
import { buildRankFn, redistribute, type RankFn } from '../src/lib/sensitivity.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol = 1e-3) => Math.abs(a - b) <= tol;

const rank = (scores: number[]) => scores.map((s) => 1 + scores.filter((o) => o > s + 1e-9).length);
const linear = (data: number[][]): RankFn => (w) => {
  const sc = data.map((row) => row.reduce((a, x, j) => a + x * w[j], 0));
  const rk = rank(sc);
  return data.map((_, i) => ({ name: 'AB'[i], score: sc[i], rank: rk[i] }));
};

// A = (0.9, 0.2), B = (0.3, 0.8), pesos base (0.6, 0.4): A = 0.62 gana a B = 0.50.
// Con w0 = t: A = 0.2 + 0.7t, B = 0.8 − 0.5t ⇒ iguales en t = 0.5. Bajando w0 de 0.6 a 0.5: cambio 0.1, relativo 1/6 ≈ 16.7 %.
// Con w1 = t: A = 0.9 − 0.7t, B = 0.3 + 0.5t ⇒ iguales en t = 0.5. Subiendo w1 de 0.4 a 0.5: cambio 0.1, relativo 0.25.
// Subir w0 o bajar w1 nunca cambia al ganador (A gana más).
{
  const r = criticalThresholds(linear([[0.9, 0.2], [0.3, 0.8]]), ['C1', 'C2'], [0.6, 0.4]);
  ok(r.hasWinner && r.baseWinners.join() === 'A' && !r.robust, 'ganador base A, no robusto');
  const [first, second] = r.rows;
  ok(first.name === 'C1' && first.threshold?.direction === 'down', 'el más crítico es C1, bajando');
  ok(cerca(first.threshold!.weight, 0.5) && cerca(first.threshold!.absChange, 0.1) && cerca(first.threshold!.relChange, 1 / 6),
    `C1: quiebre en ${first.threshold!.weight.toFixed(4)} (esperado 0.5), cambio ${first.threshold!.absChange.toFixed(4)} (0.1), relativo ${first.threshold!.relChange.toFixed(4)} (0.1667)`);
  ok(first.threshold!.newWinners.join() === 'B', 'al cruzar el umbral pasa a ganar B (obtenido: ' + first.threshold!.newWinners.join('/') + ')');
  ok(first.up === null, 'C1 subiendo no cambia al ganador en [0.6, 1]');
  ok(second.name === 'C2' && second.threshold?.direction === 'up' && cerca(second.threshold.relChange, 0.25) && cerca(second.threshold.weight, 0.5),
    `C2: sube de 0.4 a ${second.threshold!.weight.toFixed(4)}, relativo ${second.threshold!.relChange.toFixed(4)} (0.25)`);
  ok(second.down === null, 'C2 bajando no cambia al ganador en [0, 0.4]');
}

// A domina (0.9, 0.9) a B (0.1, 0.1): ningún peso cambia al primero ⇒ robusto, sin umbral.
{
  const r = criticalThresholds(linear([[0.9, 0.9], [0.1, 0.1]]), ['C1', 'C2'], [0.5, 0.5]);
  ok(r.robust && r.rows.every((x) => x.threshold === null && x.down === null && x.up === null), 'dominancia: robusto, ningún peso tiene umbral en [0, 1]');
}

// Empate en la cima con los pesos base: no hay ganador único cuya estabilidad medir.
{
  const r = criticalThresholds(linear([[0.5, 0.5], [0.5, 0.5]]), ['C1', 'C2'], [0.5, 0.5]);
  ok(!r.hasWinner, 'empate con pesos base: hasWinner = false');
}

// Coherencia con un método real (SAW, caso Palmor): justo antes del umbral gana el base, justo después otro.
{
  const criteria: Criterion[] = ['Alcance', 'Autonomía', 'Infraestructura', 'Madurez'].map((n, i) => ({ id: 'c' + i, name: n, hint: '' }));
  const alternatives: Alternative[] = ['LoRaWAN', 'GSM/GPRS', 'Sigfox', 'Zigbee'].map((n, i) => ({ id: 'a' + i, name: n }));
  const data = [[10, 8, 2, 5], [10.5, 0.5, 3, 2], [40, 2, 5, 2], [0.07, 1.5, 2, 4]];
  const dm: DecisionMatrix = { values: {}, types: {} };
  alternatives.forEach((a, i) => { dm.values[a.id] = {}; criteria.forEach((c, j) => { dm.values[a.id][c.id] = data[i][j]; }); });
  criteria.forEach((c) => { dm.types[c.id] = 'max'; });
  const W = [0.16, 0.25, 0.488, 0.102];
  const fn = buildRankFn('saw', { criteria, alternatives, dm })!;
  const r = criticalThresholds(fn, criteria.map((c) => c.name), W);
  ok(r.baseWinners.join() === 'Sigfox', 'SAW Palmor: ganador base Sigfox');
  ok(r.rows.every((x, i, a) => i === 0 || !a[i - 1].threshold || !x.threshold || a[i - 1].threshold!.relChange <= x.threshold.relChange), 'filas ordenadas del más crítico al más robusto');
  r.rows.forEach((x) => {
    const t = x.threshold;
    if (!t) return;
    const eps = 2e-4, s = t.direction === 'down' ? 1 : -1;
    const before = fn(redistribute(W, x.criterion, t.weight + s * eps)).find((q) => q.rank === 1)!.name;
    const after = fn(redistribute(W, x.criterion, t.weight - s * eps)).find((q) => q.rank === 1)!.name;
    ok(before === 'Sigfox' && after !== 'Sigfox', `SAW «${x.name}»: umbral ${t.weight.toFixed(4)} (${(t.relChange * 100).toFixed(1)} % relativo) es un quiebre real (Sigfox → ${after})`);
  });
}

if (fallos) { console.error(`\n${fallos} verificaciones fallaron.`); process.exit(1); }
console.log('\nTodas las verificaciones de criticalThreshold pasaron.');
