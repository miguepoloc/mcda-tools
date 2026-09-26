// Fija los números que muestran los desgloses «paso a paso» de TOPSIS y VIKOR (topsisBreakdown / vikorBreakdown) contra las
// diapositivas de la Sesión 3 (ejemplo del viaje y caso real IoT/Palmor) y contra el JSON del caso (Caso_Palmor_TOPSIS_VIKOR.json).
import { readFileSync, existsSync } from 'node:fs';
import { topsisBreakdown, topsisMainGap, topsisScatterData } from '../src/lib/topsisBreakdown.ts';
import { vikorBreakdown, vikorSensView, vikorRegimeText, vikorRegimesFromEnds } from '../src/lib/vikorBreakdown.ts';
import { topsisSynthesis } from '../src/lib/topsis.ts';
import { vikorSynthesis } from '../src/lib/vikor.ts';
import type { DecisionMatrix } from '../src/lib/types.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol = 5e-4) => Math.abs(a - b) <= tol;
const mk = (critNames: string[], altNames: string[], data: number[][], types: ('max' | 'min')[]) => {
  const criteria = critNames.map((name, i) => ({ id: 'k' + i, name, hint: '' }));
  const alternatives = altNames.map((name, i) => ({ id: 'a' + i, name }));
  const dm: DecisionMatrix = { values: {}, types: {} };
  alternatives.forEach((a, i) => { dm.values[a.id] = {}; criteria.forEach((c, j) => { dm.values[a.id][c.id] = data[i][j]; }); });
  criteria.forEach((c, j) => { dm.types[c.id] = types[j]; });
  return { criteria, alternatives, dm };
};

// ---------- Ejemplo del viaje (diapositivas 10-18, 21-23, 26-28): 3 rutas, 3 criterios de costo, pesos 40/35/25 ----------
{
  const { criteria, alternatives, dm } = mk(['Precio', 'Tiempo', 'Distancia'], ['Ruta Norte', 'Ruta Centro', 'Ruta Sur'], [[95, 3.5, 280], [65, 5.5, 260], [80, 4.5, 340]], ['min', 'min', 'min']);
  const w = [0.4, 0.35, 0.25];
  const t = topsisBreakdown(criteria, alternatives, dm, w);
  // diapositiva 13: matriz ponderada y A+/A-
  const v13 = [[0.271, 0.155, 0.137], [0.186, 0.243, 0.127], [0.228, 0.199, 0.166]];
  ok(t.res.v.every((row, i) => row.every((x, j) => cerca(x, v13[i][j], 6e-4))), 'viaje: matriz ponderada = diapositiva 13');
  ok([0.186, 0.155, 0.127].every((x, j) => cerca(t.res.best[j], x, 6e-4)) && [0.271, 0.243, 0.166].every((x, j) => cerca(t.res.worst[j], x, 6e-4)), 'viaje: A+ = (0.186, 0.155, 0.127) y A- = (0.271, 0.243, 0.166), costo = mínimo/máximo');
  // r = x/norma, v = w·r
  ok(t.r.every((row, i) => row.every((x, j) => cerca(t.res.v[i][j], w[j] * x, 1e-12))), 'viaje: v_ij = w_j · r_ij');
  ok(cerca(t.r[0][0], 95 / Math.sqrt(95 ** 2 + 65 ** 2 + 80 ** 2), 1e-12), 'viaje: r_11 = 95/√(95²+65²+80²)');
  // diapositiva 18: D+ = √(0.086²+0.000²+0.010²), √(0.000²+0.088²+0.000²), √(0.043²+0.044²+0.039²)
  const d18 = [[0.086, 0.0, 0.010], [0.0, 0.088, 0.0], [0.043, 0.044, 0.039]];
  ok(t.diffPlus.every((row, i) => row.every((x, j) => cerca(x, d18[i][j], 6e-4))), 'viaje: términos de D+ = diapositiva 18');
  ok(cerca(Math.sqrt(t.diffPlus[0].reduce((a, x) => a + x * x, 0)), t.res.distPlus[0], 1e-12), 'viaje: D+ = √Σ(v−A+)² coincide con topsis()');
  // diapositiva 16: C y D±
  [[0.086, 0.093, 0.519], [0.088, 0.094, 0.516], [0.073, 0.062, 0.458]].forEach(([dp, dm_, c], i) => {
    ok(cerca(t.res.distPlus[i], dp, 6e-4) && cerca(t.res.distMinus[i], dm_, 6e-4) && cerca(t.res.closeness[i], c, 6e-4), `viaje: ${alternatives[i].name} D+ ${dp} D- ${dm_} C ${c} (diapositiva 16)`);
  });
  ok(t.rank.join() === '1,2,3', 'viaje: ranking TOPSIS Norte, Centro, Sur');
  const s = topsisSynthesis(criteria, alternatives, dm, w);
  ok(s.rows.every((row, i) => row.c === t.res.closeness[i] && row.rank === t.rank[i]), 'viaje: el desglose coincide con topsisSynthesis');
  ok(topsisMainGap(t, 2)?.j === 1, 'viaje: lo que más aleja a Ruta Sur del ideal es Tiempo (0.044)');
  const sc = topsisScatterData(t);
  ok(!!sc && sc.jx === 0 && sc.jy === 1 && sc.nCriteria === 3, 'viaje: dispersión 2D en los 2 criterios de mayor peso (Precio, Tiempo)');

  const k = vikorBreakdown(criteria, alternatives, dm, w, 0.5);
  // diapositiva 21: S, R, Q
  [[0.463, 0.400, 0.705], [0.350, 0.350, 0.333], [0.625, 0.250, 0.500]].forEach(([s_, r, q], i) => {
    ok(cerca(k.res.s[i], s_, 6e-4) && cerca(k.res.r[i], r, 6e-4) && cerca(k.res.q[i], q, 6e-4), `viaje VIKOR: ${alternatives[i].name} S ${s_} R ${r} Q ${q} (diapositiva 21)`);
  });
  ok(k.verdict?.kind === 'set' && !k.verdict.c1 && k.verdict.c2, 'viaje VIKOR: falla C1, cumple C2 → conjunto de compromiso');
  ok(cerca(k.gap[2], 0.167, 6e-4) && cerca(k.gap[0], 0.372, 1e-3) && cerca(k.verdict!.dq, 0.5), 'viaje VIKOR: ΔQ(Sur) = 0.167 y ΔQ(Norte) = 0.372, DQ = 0.5 (diapositiva 23)');
  ok(k.inSet.every(Boolean), 'viaje VIKOR: entran las 3 rutas al conjunto de compromiso');
  ok(k.rCrit[0].join() === '0' && k.rCrit[2].join() === '2' && cerca(k.rShare[0], 0.4 / 0.4625, 1e-9), 'viaje VIKOR: R de Norte lo fija Precio (0.400 de S = 0.463); R de Sur, Distancia');
  ok(cerca(k.sPart[0], (0.4625 - 0.35) / (0.625 - 0.35), 1e-9) && cerca(k.res.q[0], 0.5 * k.sPart[0] + 0.5 * k.rPart[0], 1e-12), 'viaje VIKOR: Q = v·(S−S*)/(S⁻−S*) + (1−v)·(R−R*)/(R⁻−R*)');
  const sv = vikorSensView(k.eff, k.res.weights, k.types, 0.5);
  ok(sv.regimes.length === 2 && sv.regimes[0].winner === 2 && sv.regimes[1].winner === 1 && cerca(sv.regimes[0].to, 0.4, 1e-3), 'viaje VIKOR: gana Ruta Sur con v < 0.40 y Ruta Centro con v > 0.40 (diapositiva 27)');
  const fe = vikorRegimesFromEnds(sv.ends[0].q, sv.ends[1].q);
  ok(fe.breaks.length === sv.breaks.length && fe.breaks.every((b, i) => cerca(b.v, sv.breaks[i].v, 1e-9) && b.from === sv.breaks[i].from && b.to === sv.breaks[i].to), 'viaje VIKOR: los cruces desde los extremos coinciden con vikorFirstPlaceChanges');
  ok(vikorRegimeText(sv, alternatives.map((a) => a.name)).includes('Ruta Sur gana si v < 0.40'), 'viaje VIKOR: frase de lectura por tramos');
  ok(sv.vs.includes(0.4) && sv.vs.includes(0.5) && sv.vs.length === 6, `viaje VIKOR: v de la tabla = 0, 0.25, 0.4, 0.5, 0.75, 1 (${sv.vs.join(', ')})`);
  const vs = vikorSynthesis(criteria, alternatives, dm, w, 0.5);
  ok(vs.rows.every((row, i) => row.q === k.res.q[i] && row.rank === k.rankQ[i]), 'viaje VIKOR: el desglose coincide con vikorSynthesis');
}

// ---------- Caso real IoT/Palmor (diapositivas 42-52) ----------
{
  const { criteria, alternatives, dm } = mk(['Alcance', 'Autonomía', 'Infraestructura', 'Madurez'], ['LoRaWAN', 'GSM/GPRS', 'Sigfox', 'Zigbee'],
    [[10, 8, 2, 5], [10.5, 0.5, 3, 2], [40, 2, 5, 2], [0.07, 1.5, 2, 4]], ['max', 'max', 'max', 'max']);
  const w = [0.16, 0.25, 0.488, 0.102];
  const t = topsisBreakdown(criteria, alternatives, dm, w);
  const v43 = [[0.038, 0.238, 0.151, 0.073], [0.04, 0.015, 0.226, 0.029], [0.15, 0.06, 0.377, 0.029], [0.0, 0.045, 0.151, 0.058]];
  ok(t.res.v.every((row, i) => row.every((x, j) => cerca(x, v43[i][j], 6e-4))), 'Palmor: matriz ponderada = diapositiva 43');
  ok([0.150, 0.238, 0.377, 0.073].every((x, j) => cerca(t.res.best[j], x, 6e-4)) && [0, 0.015, 0.151, 0.029].every((x, j) => cerca(t.res.worst[j], x, 6e-4)), 'Palmor: A+ = (0.150, 0.238, 0.377, 0.073), A- = (0, 0.015, 0.151, 0.029)');
  [[0.253, 0.231, 0.477], [0.295, 0.085, 0.224], [0.184, 0.275, 0.599], [0.334, 0.042, 0.111]].forEach(([dp, dm_, c], i) => {
    ok(cerca(t.res.distPlus[i], dp, 6e-4) && cerca(t.res.distMinus[i], dm_, 6e-4) && cerca(t.res.closeness[i], c, 6e-4), `Palmor: ${alternatives[i].name} D+ ${dp} D- ${dm_} C ${c} (diapositiva 44)`);
  });
  ok(t.rank.join() === '2,3,1,4', 'Palmor: Sigfox 1º, LoRaWAN 2º, GSM/GPRS 3º, Zigbee 4º');
  const sc = topsisScatterData(t);
  ok(!!sc && sc.jx === 2 && sc.jy === 1, 'Palmor: dispersión 2D en Infraestructura (48.8 %) y Autonomía (25 %) (diapositiva 46)');

  const k = vikorBreakdown(criteria, alternatives, dm, w, 0.5);
  [[0.608, 0.488, 0.757], [0.796, 0.325, 0.631], [0.302, 0.200, 0.0], [0.899, 0.488, 1.0]].forEach(([s_, r, q], i) => {
    ok(cerca(k.res.s[i], s_, 1e-3) && cerca(k.res.r[i], r, 1e-3) && cerca(k.res.q[i], q, 1e-3), `Palmor VIKOR: ${alternatives[i].name} S ${s_} R ${r} Q ${q} (diapositiva 47)`);
  });
  ok(k.verdict?.kind === 'unique' && k.verdict.c1 && k.verdict.c2 && cerca(k.verdict.deltaQ, 0.631, 1e-3) && cerca(k.verdict.dq, 1 / 3, 1e-9), 'Palmor VIKOR: ganador único, ΔQ = 0.631 ≥ DQ = 1/3');
  ok(k.inSet.join() === 'false,false,true,false', 'Palmor VIKOR: el conjunto es solo Sigfox');
  ok(k.rCrit[0].join() === '2' && k.rCrit[3].join() === '2' && cerca(k.res.r[0], k.res.r[3], 1e-9), 'Palmor VIKOR: R de LoRaWAN y Zigbee (0.488) los fija Infraestructura (diapositiva 52)');
  ok(k.rankS[2] === 1 && k.rankR[2] === 1, 'Palmor VIKOR: Sigfox es 1º en S y en R');
  const sv = vikorSensView(k.eff, k.res.weights, k.types, 0.5);
  ok(sv.breaks.length === 0 && sv.regimes.length === 1 && sv.regimes[0].winner === 2, 'Palmor VIKOR: Sigfox gana con cualquier v (diapositiva 50)');
  ok(cerca(sv.rows.find((r) => r.v === 0)!.q[1], 0.435, 1e-3) && cerca(sv.rows.find((r) => r.v === 1)!.q[0], 0.513, 1e-3), 'Palmor VIKOR: Q GSM/GPRS (v=0) = 0.435, Q LoRaWAN (v=1) = 0.513');

  // el JSON del caso del curso (si está en este equipo) da los mismos números
  const ruta = '/Users/miguepoloc/Library/CloudStorage/OneDrive-UniversidaddelMagdalena/Docente/Toma de decisiones/sesiones/sesion-03/Caso_Palmor_TOPSIS_VIKOR.json';
  if (existsSync(ruta)) {
    const j = JSON.parse(readFileSync(ruta, 'utf8'));
    const jt = topsisBreakdown(j.crit, j.alt, j.dm, w);
    ok(jt.rank.join() === '2,3,1,4', 'Caso_Palmor_TOPSIS_VIKOR.json: mismo ranking TOPSIS');
  } else console.log('OMITIDO Caso_Palmor_TOPSIS_VIKOR.json no está en este equipo');
}

// ---------- Criterio objetivo: la matriz efectiva trae la distancia y el desglose lo reconoce ----------
{
  const { criteria, alternatives, dm } = mk(['Voltaje', 'Irradiación'], ['A', 'B', 'C', 'D'], [[112, 5], [108, 5], [120, 6], [127, 4]], ['min', 'max']);
  dm.types.k0 = 'target';
  dm.targets = { k0: { value: 110, tol: 0 } };
  const t = topsisBreakdown(criteria, alternatives, dm, [0.5, 0.5]);
  ok(t.criteria[0].isDistance && t.criteria[0].type === 'min' && t.eff.map((r) => r[0]).join() === '2,2,10,17', 'objetivo: distancia |V − 110| = 2, 2, 10, 17 (diapositiva 35) y se trata como costo');
  ok(t.raw[0][0] === 112, 'objetivo: se conserva el valor ingresado');
  const k = vikorBreakdown(criteria, alternatives, dm, [0.5, 0.5], 0.5);
  ok(k.eff.map((r) => r[0]).join() === '2,2,10,17' && k.types[0] === 'min', 'objetivo (VIKOR): misma matriz efectiva');
}

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
