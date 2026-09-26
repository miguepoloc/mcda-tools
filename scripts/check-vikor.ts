// Prueba de humo de VIKOR. Compara contra 03_vikor_iot_palmor.ipynb del curso (caso IoT/Palmor).
import { vikor, vikorSensitivity, vikorFirstPlaceChanges, vikorVerdict, vikorV } from '../src/lib/vikor.ts';
import { normalizeMatrix } from '../src/lib/topsis.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol = 5e-3) => Math.abs(a - b) <= tol;

// Resultado esperado (notebook, salida cacheada): Sigfox S=0.302 R=0.200 Q=0.000,
// GSM/GPRS S=0.796 R=0.325 Q=0.631, LoRaWAN S=0.608 R=0.488 Q=0.757, Zigbee S=0.899 R=0.488 Q=1.000.
{
  const tecnologias = ['LoRaWAN', 'GSM/GPRS', 'Sigfox', 'Zigbee'];
  const dataset = [
    [10, 8, 2, 5],
    [10.5, 0.5, 3, 2],
    [40, 2, 5, 2],
    [0.07, 1.5, 2, 4],
  ];
  const pesos = [0.16, 0.25, 0.488, 0.102];
  const tipo: ('max' | 'min')[] = ['max', 'max', 'max', 'max'];
  const r = vikor(dataset, pesos, tipo);
  const esperadoS = [0.608, 0.796, 0.302, 0.899];
  const esperadoR = [0.488, 0.325, 0.200, 0.488];
  const esperadoQ = [0.757, 0.631, 0.000, 1.000];
  tecnologias.forEach((t, i) => {
    ok(cerca(r.s[i], esperadoS[i]), `S_${t} = ${r.s[i].toFixed(3)} (esperado ${esperadoS[i]})`);
    ok(cerca(r.r[i], esperadoR[i]), `R_${t} = ${r.r[i].toFixed(3)} (esperado ${esperadoR[i]})`);
    ok(cerca(r.q[i], esperadoQ[i]), `Q_${t} = ${r.q[i].toFixed(3)} (esperado ${esperadoQ[i]})`);
  });
  ok(tecnologias[r.order[0]] === 'Sigfox', `ganador (menor Q) = ${tecnologias[r.order[0]]} (esperado Sigfox)`);
}

// ---- v y condiciones de Opricovic & Tzeng (2004), deck de la Sesión 3 (diapositivas 22-29 y 47) ----
// Caso real (IoT/Palmor): Sigfox es el mejor en S y en R a la vez, gana con CUALQUIER v y es ganador único.
{
  const dataset = [[10, 8, 2, 5], [10.5, 0.5, 3, 2], [40, 2, 5, 2], [0.07, 1.5, 2, 4]];
  const pesos = [0.16, 0.25, 0.488, 0.102];
  const tipo: ('max' | 'min')[] = ['max', 'max', 'max', 'max'];
  const filas = vikorSensitivity(dataset, pesos, tipo, [0, 0.25, 0.5, 0.75, 1]);
  ok(filas.every((f) => f.order[0] === 2 && Math.abs(f.q[2]) < 1e-9), 'caso real: Sigfox tiene Q = 0 y es 1º con todo v');
  ok(filas.every((f) => f.verdict?.kind === 'unique'), 'caso real: ganador único (C1 y C2) con todo v');
  ok(cerca(filas[2].verdict!.deltaQ, 0.631) && cerca(filas[2].verdict!.dq, 1 / 3), `caso real v=0.5: ΔQ = ${filas[2].verdict!.deltaQ.toFixed(3)} ≥ DQ = ${filas[2].verdict!.dq.toFixed(3)}`);
  ok(cerca(filas[0].q[1], 0.435) && cerca(filas[4].q[0], 0.513), 'caso real: Q GSM/GPRS (v=0) = 0.435, Q LoRaWAN (v=1) = 0.513');
  const cambios = vikorFirstPlaceChanges(dataset, pesos, tipo);
  ok(cambios.length === 0, 'caso real: el 1er lugar nunca cambia con v');
}
// Ejemplo del viaje (3 rutas, 3 criterios de costo, pesos 40/35/25): el 1º depende de v.
{
  const viaje = [[95, 3.5, 280], [65, 5.5, 260], [80, 4.5, 340]]; // Norte, Centro, Sur
  const pesos = [0.4, 0.35, 0.25];
  const tipo: ('max' | 'min')[] = ['min', 'min', 'min'];
  const f = vikorSensitivity(viaje, pesos, tipo, [0, 0.25, 0.4, 0.5, 0.75, 1]);
  const esperadoQ = [[1.0, 0.667, 0.0], [0.852, 0.5, 0.25], [0.764, 0.4, 0.4], [0.705, 0.333, 0.5], [0.557, 0.167, 0.75], [0.409, 0.0, 1.0]];
  f.forEach((fila, k) => ok(fila.q.every((q, i) => cerca(q, esperadoQ[k][i])), `viaje v=${fila.v}: Q = [${fila.q.map((q) => q.toFixed(3)).join(', ')}]`));
  ok(f[0].order[0] === 2 && f[1].order[0] === 2, 'viaje: con v < 0.4 gana Ruta Sur');
  ok(f[3].order[0] === 1 && f[4].order[0] === 1 && f[5].order[0] === 1, 'viaje: con v > 0.4 gana Ruta Centro');
  const v05 = f[3].verdict!;
  ok(!v05.c1 && v05.c2 && v05.kind === 'set', 'viaje v=0.5: falla C1 (ΔQ = 0.167 < 0.5), cumple C2, conjunto de compromiso');
  ok(v05.set.length === 3, `viaje v=0.5: el conjunto de compromiso son las 3 rutas (Norte entra: 0.705 − 0.333 = 0.372 < 0.5), tiene ${v05.set.length}`);
  const cambios = vikorFirstPlaceChanges(viaje, pesos, tipo);
  ok(cambios.length === 1 && cerca(cambios[0].v, 0.4, 1e-3) && cambios[0].from === 2 && cambios[0].to === 1, `viaje: el 1º cambia en v = ${cambios[0]?.v.toFixed(3)} (de Ruta Sur a Ruta Centro)`);
}
// v guardado en la matriz: se conserva si es válido en [0, 1], si no rige 0.5
{
  ok(vikorV(normalizeMatrix({ values: {}, types: {}, vikorV: 0.3 })) === 0.3, 'normalizeMatrix conserva vikorV = 0.3');
  ok(vikorV(normalizeMatrix({ values: {}, types: {}, vikorV: 1.5 })) === 0.5, 'vikorV fuera de [0, 1] se ignora (0.5)');
  ok(vikorV(normalizeMatrix({ values: {}, types: {} })) === 0.5, 'sin vikorV rige 0.5');
  ok(vikorVerdict({ s: [1], r: [1], q: [0], order: [0] }) === null, 'una sola alternativa: sin veredicto');
}

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
