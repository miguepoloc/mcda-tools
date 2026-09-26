// Prueba de humo de las funciones de idoneidad del geovisor AHP + SIG. Compara contra
// data/ahp_sig_snsm/membership.py (el notebook 07) y contra los 4 puntos de ejemplo
// (Palmor/San Pedro/Bonda/Guachaca) de idoneidad_biofisica_250m.npy, leídos directo del caché con
// pyproj/rasterio (ver plataforma/docs/PLAN_geovisor_ahp_sig.md § 6.2 sobre `pend`).
import { classes, down, fnIssue, sortedFn, suitability, trapezoid, up, vetoed } from '../src/lib/geo/membership.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol = 1e-3) => Math.abs(a - b) <= tol;

// trapezoid: idoneidad_temperatura(x) = trapezoid(x, 15, 22, 30, 38) — FEDECACAO (2015).
{
  const f = (x: number) => trapezoid(x, 15, 22, 30, 38);
  ok(f(10) === 0, 'trapezoid: 10°C fuera de rango -> 0');
  ok(f(15) === 0, 'trapezoid: borde a -> 0');
  ok(cerca(f(18.5), 0.5), 'trapezoid: rampa de subida a mitad de camino -> 0.5');
  ok(f(22) === 1, 'trapezoid: borde b -> 1');
  ok(f(26) === 1, 'trapezoid: meseta óptima -> 1');
  ok(f(30) === 1, 'trapezoid: borde c -> 1');
  ok(cerca(f(34), 0.5), 'trapezoid: rampa de bajada a mitad de camino -> 0.5');
  ok(f(38) === 0, 'trapezoid: borde d -> 0');
  ok(f(40) === 0, 'trapezoid: fuera de rango por arriba -> 0');
  ok(Number.isNaN(f(NaN)), 'trapezoid: NaN se propaga (sin dato)');
}

// down: la función de pendiente reconstruida por regresión (ver membership.ts, SNSM_CACAO_RULES.pend).
{
  const f = (x: number) => down(x, 12, 45);
  ok(f(0) === 1, 'down(pendiente): terreno plano -> idoneidad 1');
  ok(f(12) === 1, 'down(pendiente): borde a -> 1');
  ok(cerca(f(22.5), 0.682, 5e-3), 'down(pendiente): 22.5° -> ~0.682 (dato real de la grilla)');
  ok(f(45) === 0, 'down(pendiente): borde b (veto) -> 0');
  ok(f(50) === 0, 'down(pendiente): más allá del veto -> 0');
}

// up y classes: primitivas genéricas (no usadas por el caso cacao, pero sí por el caso solar del
// tutorial: irradiación creciente, cobertura del suelo por categoría).
{
  const f = (x: number) => up(x, 100, 300);
  ok(f(100) === 0 && f(300) === 1 && cerca(f(200), 0.5), 'up: irradiación 100→300 W/m² sube linealmente');
  const mapa = { '10': 0.9, '20': 0.1, '30': 0 }; // ej.: cultivo / bosque / urbano (WorldCover simplificado)
  ok(classes(10, mapa) === 0.9 && classes(20, mapa) === 0.1 && classes(99, mapa) === 0, 'classes: reclasificación por categoría, desconocida -> 0');
}

// suitability(): despacha por tipo — mismo resultado que llamar la función concreta.
{
  ok(suitability(26, { type: 'trapezoid', a: 15, b: 22, c: 30, d: 38 }) === 1, 'suitability: despacha trapezoid');
  ok(suitability(50, { type: 'down', a: 12, b: 45 }) === 0, 'suitability: despacha down');
}

// vetoed(): temperatura < 15°C o pendiente >= 45° vetan el píxel (Ley del Mínimo, notebook § 7).
{
  ok(vetoed(10, { op: '<', value: 15 }) === true, 'vetoed: 10°C < 15°C -> true');
  ok(vetoed(20, { op: '<', value: 15 }) === false, 'vetoed: 20°C -> false');
  ok(vetoed(45, { op: '>=', value: 45 }) === true, 'vetoed: pendiente 45° >= 45° -> true');
  ok(vetoed(NaN, { op: '<', value: 15 }) === false, 'vetoed: sin dato nunca veta');
  ok(vetoed(10, undefined) === false, 'vetoed: sin regla de veto -> false');
}

// Los 4 puntos de ejemplo del notebook (Sierra Nevada de Santa Marta), leídos de
// idoneidad_biofisica_250m.npy vía pyproj/rasterio — ver la celda de generación en
// scripts/geo/export_pack.py para cómo se obtuvieron temp/precip/ph/pend por punto.
const PUNTOS = {
  Palmor: { temp: 22.687513, precip: 1761.425903, ph: 5.397205, pend: 2.069206, s_temp: 1, s_precip: 1, s_ph: 0.93147, s_pend: 1 },
  'San Pedro': { temp: 22.508139, precip: 1493.080078, ph: 5.51557, pend: 9.764578, s_temp: 1, s_precip: 0.99308, s_ph: 1, s_pend: 1 },
  Bonda: { temp: 27.572132, precip: 913.318115, ph: 6.617826, pend: 1.014364, s_temp: 1, s_precip: 0.413318, s_ph: 0.92145, s_pend: 1 },
  Guachaca: { temp: 27.465155, precip: 955.15564, ph: 6.6017, pend: 4.214322, s_temp: 1, s_precip: 0.455156, s_ph: 0.9322, s_pend: 1 },
};
for (const [nombre, p] of Object.entries(PUNTOS)) {
  const sT = trapezoid(p.temp, 15, 22, 30, 38);
  const sP = trapezoid(p.precip, 500, 1500, 2500, 4000);
  const sH = trapezoid(p.ph, 4.0, 5.5, 6.5, 8.0);
  const sPe = down(p.pend, 12, 45);
  ok(cerca(sT, p.s_temp), `${nombre}: s_temp = ${sT.toFixed(5)} (esperado ${p.s_temp})`);
  ok(cerca(sP, p.s_precip), `${nombre}: s_precip = ${sP.toFixed(5)} (esperado ${p.s_precip})`);
  ok(cerca(sH, p.s_ph), `${nombre}: s_ph = ${sH.toFixed(5)} (esperado ${p.s_ph})`);
  ok(cerca(sPe, p.s_pend), `${nombre}: s_pend = ${sPe.toFixed(5)} (esperado ${p.s_pend})`);
}

// --- coherencia de reglas (fnIssue / sortedFn): parámetros desordenados no deben pasar en silencio
{
  ok(fnIssue({ type: 'trapezoid', a: 15, b: 22, c: 30, d: 38 }) === null, 'fnIssue: trapecio ordenado = sin problema');
  ok(fnIssue({ type: 'trapezoid', a: 22, b: 15, c: 30, d: 38 }) !== null, 'fnIssue: trapecio con b < a se avisa');
  ok(fnIssue({ type: 'trapezoid', a: 1, b: 1, c: 1, d: 1 }) === null, 'fnIssue: trapecio degenerado (todo igual) es válido');
  ok(fnIssue({ type: 'down', a: 45, b: 12 }) !== null && fnIssue({ type: 'down', a: 12, b: 45 }) === null, 'fnIssue: down con a > b se avisa');
  ok(fnIssue({ type: 'up', a: NaN, b: 3 }) !== null, 'fnIssue: parámetro vacío (NaN) se avisa');
  ok(fnIssue({ type: 'steps', breaks: [150, 70], scores: [0, 0.5, 1] }) !== null, 'fnIssue: cortes desordenados');
  ok(fnIssue({ type: 'steps', breaks: [70, 150], scores: [0, 1] }) !== null, 'fnIssue: faltan puntajes');
  ok(fnIssue({ type: 'classes', map: { '1': 1, '2': 1.5 } }) !== null, 'fnIssue: idoneidad de clase > 1');
  const t = sortedFn({ type: 'trapezoid', a: 22, b: 15, c: 38, d: 30 });
  ok(t.type === 'trapezoid' && t.a === 15 && t.b === 22 && t.c === 30 && t.d === 38 && fnIssue(t) === null, 'sortedFn ordena el trapecio');
  const dn = sortedFn({ type: 'down', a: 45, b: 12 });
  ok(dn.type === 'down' && dn.a === 12 && dn.b === 45, 'sortedFn intercambia a y b en up/down');
}

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
