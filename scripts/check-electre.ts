// Prueba de humo de ELECTRE I. Compara contra 04_electre_iot_palmor.ipynb del curso: LoRaWAN supera
// a Zigbee, Sigfox supera a GSM/GPRS, y Sigfox/LoRaWAN quedan incomparables entre sí (esas son las
// ÚNICAS dos relaciones de superación con c*=0.65/d*=0.30).
import { electre, electrePairDetail, electreSensitivity, electreKernel, electreKernelText } from '../src/lib/electre.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };

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
  const r = electre(dataset, pesos, tipo, 0.65, 0.30);
  const idx = (n: string) => tecnologias.indexOf(n);

  ok(r.outranks[idx('LoRaWAN')][idx('Zigbee')], 'LoRaWAN supera a Zigbee');
  ok(r.outranks[idx('Sigfox')][idx('GSM/GPRS')], 'Sigfox supera a GSM/GPRS');
  ok(!r.outranks[idx('Sigfox')][idx('LoRaWAN')], 'Sigfox NO supera a LoRaWAN (discordancia alta)');
  ok(!r.outranks[idx('LoRaWAN')][idx('Sigfox')], 'LoRaWAN NO supera a Sigfox');

  const total = r.outranks.reduce((a, row) => a + row.filter(Boolean).length, 0);
  ok(total === 2, `exactamente 2 relaciones de superación en total (hay ${total})`);

  const dSigfoxLoRaWAN = r.discordance[idx('Sigfox')][idx('LoRaWAN')];
  ok(Math.abs(dSigfoxLoRaWAN - 1.0) < 1e-9, `discordancia Sigfox->LoRaWAN = ${dSigfoxLoRaWAN.toFixed(2)} (esperado 1.00)`);
}

{
  // Empate con el umbral: pesos 0.1 + 0.7 suman 0.7999999999999999 en coma flotante; con c* = 0.8 la relación no debe perderse por redondeo.
  const r = electre([[2, 2, 1], [1, 1, 2]], [0.1, 0.7, 0.2], ['max', 'max', 'max'], 0.8, 1);
  ok(r.concordance[0][1] < 0.8 || Math.abs(r.concordance[0][1] - 0.8) < 1e-9, `concordancia A->B = ${r.concordance[0][1]} (≈ 0.8)`);
  ok(r.outranks[0][1], 'A supera a B aunque la concordancia sea 0.7999999999999999 con c* = 0.8 (tolerancia 1e-9)');
  ok(!electre([[2, 2, 1], [1, 1, 2]], [0.1, 0.7, 0.2], ['max', 'max', 'max'], 0.81, 1).outranks[0][1], 'con c* = 0.81 sí deja de superar');
}

{
  // Núcleo (kernel). Caso de un estudiante: ciclo RF↔XGB que además supera a ARIMA y GRU, y MLP aislada (0 ARIMA, 1 RF, 2 XGB, 3 MLP, 4 GRU).
  // «Nadie la supera» daba a MLP como ganadora; el núcleo real son dos bloques y no hay ganador.
  const M = (pairs: [number, number][], n: number) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, k) => pairs.some(([a, b]) => a === i && b === k)));
  const names = ['ARIMA', 'Random Forest', 'XGBoost', 'MLP', 'GRU'];
  const k = electreKernel(M([[1, 0], [1, 2], [1, 4], [2, 1], [2, 4]], 5));
  ok(k.winner === null, 'MLP aislada + ciclo RF↔XGB: no hay ganador único');
  ok(k.blocks.length === 2, `el núcleo tiene 2 bloques (hay ${k.blocks.length})`);
  ok(k.members.join() === '1,2,3', `núcleo = Random Forest, XGBoost y MLP (${k.members.map((i) => names[i]).join(', ')})`);
  ok(k.isolated.join() === '3', 'MLP está aislada');
  ok(k.cycles.length === 1 && k.cycles[0].join() === '1,2', 'el ciclo es {Random Forest, XGBoost}');
  const t = electreKernelText(names, k, true);
  ok(/MLP/.test(t.reasons.join(' ')) && /no hay ganador/.test(t.summary), 'el texto explica por qué MLP está en el núcleo sin ganar');

  const w = electreKernel(M([[0, 1], [0, 2]], 3));
  ok(w.winner === 0 && w.members.join() === '0', 'A supera a B y C: A es la única del núcleo y gana');
  const chain = electreKernel(M([[0, 1], [1, 2]], 3));
  ok(chain.members.join() === '0,2' && chain.winner === null, 'cadena A→B→C sin A→C: núcleo {A, C}, sin ganador (C no es superada por A)');
  const none = electreKernel(M([], 3));
  ok(none.members.length === 3 && none.winner === null && none.isolated.length === 0, 'sin relaciones: todas en el núcleo, sin ganador y sin «aisladas»');
  const tri = electreKernel(M([[0, 1], [1, 2], [2, 0]], 3));
  ok(tri.blocks.length === 1 && tri.blocks[0].length === 3 && tri.winner === null, 'ciclo de 3: un solo bloque, sin ganador');
}

// Ejemplo del viaje (diapositivas 9-19 de la sesión 4), c* = 0.50 y d* = 0.50 como en clase.
{
  const M = [[95, 3.5, 280], [65, 5.5, 260], [80, 4.5, 340]];
  const w = [0.4, 0.35, 0.25];
  const t: ('max' | 'min')[] = ['min', 'min', 'min'];
  const r = electre(M, w, t, 0.5, 0.5);
  const c2 = (a: number, b: number) => Math.abs(a - b) < 5e-3;
  ok(c2(r.concordance[0][1], 0.35) && c2(r.concordance[0][2], 0.6) && c2(r.concordance[1][0], 0.65) && c2(r.concordance[1][2], 0.65) && c2(r.concordance[2][0], 0.4) && c2(r.concordance[2][1], 0.35), 'matriz de concordancia del viaje (diap. 11): 0.35 0.60 / 0.65 0.65 / 0.40 0.35');
  ok(c2(r.discordance[0][1], 1) && c2(r.discordance[0][2], 0.5) && c2(r.discordance[1][0], 1) && c2(r.discordance[1][2], 0.5) && c2(r.discordance[2][0], 0.75) && c2(r.discordance[2][1], 1), 'matriz de discordancia del viaje (diap. 16): 1.00 0.50 / 1.00 0.50 / 0.75 1.00');
  ok(r.outranks[0][2] && r.outranks[1][2] && r.outranks.flat().filter(Boolean).length === 2, 'con 0.50/0.50: Norte→Sur y Centro→Sur, nada más (diap. 18-19)');
  ok(!r.outranks[0][1] && !r.outranks[1][0], 'Norte y Centro son incomparables (diap. 19)');
  ok(r.ranges.join() === '30,2,80', `rangos del viaje = ${r.ranges.join(', ')} (30, 2, 80)`);
  // desglose del par Norte vs Centro (diap. 9 y 14)
  const p = electrePairDetail(M, t, r, 0, 1);
  ok(c2(p.c, 0.35) && c2(p.cRev, 0.65) && Math.abs(p.c + p.cRev - 1) < 1e-9 && !p.hasTies, 'par Norte–Centro: c(N,C) 0.35, c(C,N) 0.65, suman 1.00');
  ok(p.rows.map((x) => x.aAtLeast).join() === 'false,true,false' && p.rows.map((x) => x.bAtLeast).join() === 'true,false,true', '¿Norte ≤ Centro? No, Sí, No');
  ok(p.rows.map((x) => x.norm.toFixed(2)).join() === '1.00,1.00,0.25', 'ventaja ÷ rango = 1.00, 1.00, 0.25 (diap. 14)');
  ok(c2(p.d, 1) && p.dCrit === 0 && c2(p.dRev, 1) && p.dCritRev === 1, 'd(Norte,Centro) = 1.00 (Precio) · d(Centro,Norte) = 1.00 (Tiempo)');
  // el desglose coincide EXACTAMENTE con electre() en todos los pares
  let igual = true;
  for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) if (i !== k) { const q = electrePairDetail(M, t, r, i, k); if (q.c !== r.concordance[i][k] || q.d !== r.discordance[i][k]) igual = false; }
  ok(igual, 'electrePairDetail() coincide bit a bit con concordancia y discordancia de electre() en los 6 pares');
  const s = electreSensitivity(M, w, t, { cStar: 0.5, dStar: 0.5 });
  ok(s[0].current && s[0].relations === 2 && s.length === 4, `sensibilidad: la fila actual va primero y sin duplicados (${s.length} filas)`);
}

// Caso real IoT/Palmor (diapositivas 22-25), c* = 0.65 y d* = 0.70 como en clase.
{
  const T = ['LoRaWAN', 'GSM/GPRS', 'Sigfox', 'Zigbee'];
  const M = [[10, 8, 2, 5], [10.5, 0.5, 3, 2], [40, 2, 5, 2], [0.07, 1.5, 2, 4]];
  const w = [0.16, 0.25, 0.488, 0.102];
  const t: ('max' | 'min')[] = ['max', 'max', 'max', 'max'];
  const r = electre(M, w, t, 0.65, 0.7);
  const c2 = (a: number, b: number) => Math.abs(a - b) < 6e-3;
  ok(c2(r.concordance[0][1], 0.35) && c2(r.concordance[0][2], 0.35) && c2(r.concordance[0][3], 1) && c2(r.concordance[1][0], 0.65) && c2(r.concordance[1][2], 0.1) && c2(r.concordance[2][0], 0.65) && c2(r.concordance[2][1], 1) && c2(r.concordance[2][3], 0.9) && c2(r.concordance[3][0], 0.49), 'concordancia del caso real (diap. 23)');
  ok(c2(r.discordance[0][1], 0.33) && c2(r.discordance[0][2], 1) && c2(r.discordance[1][0], 1) && c2(r.discordance[1][2], 0.74) && c2(r.discordance[2][3], 0.67) && c2(r.discordance[3][0], 0.87) && c2(r.discordance[3][2], 1), 'discordancia del caso real (diap. 24)');
  ok(r.outranks[2][1] && r.outranks[2][3] && r.outranks[0][3] && r.outranks.flat().filter(Boolean).length === 3, 'con 0.65/0.70: Sigfox→GSM, Sigfox→Zigbee, LoRaWAN→Zigbee (3 de 12, diap. 25)');
  ok(!r.outranks[2][0] && !r.outranks[0][2], 'Sigfox y LoRaWAN incomparables');
  // OJO: la diapositiva 25 dice que el veto de LoRaWAN sobre Sigfox está en Autonomía, pero con estos datos el máximo (1.00) está en Madurez
  // (5 vs 2 = todo el rango) y Autonomía da 0.80 (6 ÷ 7.5). Además c(Sigfox, LoRaWAN) = 0.648 (la diapositiva lo redondea a 0.65) y por eso
  // NI SIQUIERA llega a c* = 0.65 en rigor. El desglose de la plataforma muestra el criterio real.
  const p = electrePairDetail(M, t, r, 2, 0);
  ok(Math.abs(p.c - 0.648) < 1e-9 && c2(p.cRev, 0.35), `Sigfox→LoRaWAN: c = ${p.c.toFixed(4)} (0.648, que la diap. 25 redondea a 0.65)`);
  ok(Math.abs(p.d - 1) < 1e-9 && p.dCrit === 3 && Math.abs(p.rows[1].norm - 0.8) < 1e-9, `d(Sigfox, LoRaWAN) = ${p.d.toFixed(2)} y su máximo está en Madurez (criterio 4), no en Autonomía (${p.rows[1].norm.toFixed(2)})`);
  ok(p.dCrits.join() === '3' && p.dCritsRev.join() === '2', `criterios donde ocurre el máximo: d(Sigfox,LoRaWAN) en ${p.dCrits.join()} (Madurez), d(LoRaWAN,Sigfox) en ${p.dCritsRev.join()} (Infraestructura)`);
  const empate = electrePairDetail(M, t, r, 1, 0); // GSM/GPRS vs LoRaWAN: Autonomía y Madurez empatan en 1.00 para d(GSM, LoRaWAN)
  ok(empate.dCrits.join() === '1,3' && Math.abs(empate.d - 1) < 1e-9, `empate en el máximo de d(GSM/GPRS, LoRaWAN): criterios ${empate.dCrits.join()} (Autonomía y Madurez, ambos 1.00)`);
  const k = electreKernel(r.outranks);
  ok(k.winner === null && k.members.join() === '0,2', `núcleo = LoRaWAN y Sigfox (${k.members.map((i) => T[i]).join(', ')}): sin ganador único`);
}

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
