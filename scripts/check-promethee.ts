// Prueba de humo de PROMETHEE II. Compara contra 05_promethee_iot_palmor.ipynb del curso.
import { n4, sgn, fmtVs } from '../src/components/calc/calcFormat.ts';
import { pref3, preferenceDetail, promethee, prometheeI } from '../src/lib/promethee.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol = 5e-3) => Math.abs(a - b) <= tol;

// Resultado esperado (notebook): Sigfox +0.465, LoRaWAN +0.057, GSM/GPRS -0.193, Zigbee -0.330.
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
  const r = promethee(dataset, pesos, tipo);
  const esperado = [0.057, -0.193, 0.465, -0.330];
  tecnologias.forEach((t, i) => ok(cerca(r.phi[i], esperado[i]), `phi_${t} = ${r.phi[i].toFixed(3)} (esperado ${esperado[i]})`));
  ok(tecnologias[r.order[0]] === 'Sigfox', `ganador = ${tecnologias[r.order[0]]} (esperado Sigfox)`);
  const suma = r.phi.reduce((a, b) => a + b, 0);
  ok(cerca(suma, 0, 1e-6), `suma de flujos netos = ${suma.toFixed(6)} (esperado ~0, propiedad de PROMETHEE II)`);
}

// Ejemplo del viaje (diapositivas 32-35 de la sesión 4): Norte, Centro, Sur; Precio/Tiempo/Distancia, los 3 de costo; pesos 0.40/0.35/0.25.
{
  const rutas = ['Norte', 'Centro', 'Sur'];
  const M = [[95, 3.5, 280], [65, 5.5, 260], [80, 4.5, 340]];
  const w = [0.4, 0.35, 0.25];
  const t: ('max' | 'min')[] = ['min', 'min', 'min'];
  const r = promethee(M, w, t);
  const c4 = (a: number, b: number, tol = 5e-5) => Math.abs(a - b) <= tol;
  ok(c4(r.pi[1][0], 0.4625), `π(Centro, Norte) = ${r.pi[1][0].toFixed(4)} (diap. 32: 0.4625)`);
  ok(c4(r.pi[0][1], 0.35), `π(Norte, Centro) = ${r.pi[0][1].toFixed(4)} (0.3500)`);
  ok(c4(r.pi[0][2], 0.3625) && c4(r.pi[1][2], 0.45) && c4(r.pi[2][0], 0.2) && c4(r.pi[2][1], 0.175), 'matriz π completa (diap. 33): 0.3625, 0.4500, 0.2000, 0.1750');
  ok(c4(r.phiPlus[1], 0.45625) && c4(r.phiMinus[1], 0.2625), `Centro: φ+ ${r.phiPlus[1].toFixed(4)} (0.4563) · φ− ${r.phiMinus[1].toFixed(4)} (0.2625)`);
  ok(c4(r.phi[1], 0.19375) && c4(r.phi[0], 0.025) && c4(r.phi[2], -0.21875), `φ = +0.1938, +0.0250, −0.2188 (hay ${r.phi.map((x) => x.toFixed(4)).join(', ')})`);
  ok(rutas[r.order[0]] === 'Centro' && rutas[r.order[2]] === 'Sur', 'ranking: Centro, Norte, Sur');
  // desglose de un par (diap. 32): Centro vs Norte
  const d = preferenceDetail(M, t, r, 1, 0);
  ok(d.rows.map((x) => x.P.toFixed(2)).join() === '1.00,0.00,0.25', `P por criterio Centro vs Norte = ${d.rows.map((x) => x.P.toFixed(2)).join()} (1.00, 0.00, 0.25)`);
  ok(d.rows[0].d === 30 && d.rows[2].d === 20 && d.rows[1].d === -2, `ventajas d = ${d.rows.map((x) => x.d).join(', ')} (30, −2, 20)`);
  ok(d.pi === r.pi[1][0], 'preferenceDetail().pi coincide exactamente con promethee().pi');
  ok(c4(d.rows.reduce((a, x) => a + x.contrib, 0), 0.4625), 'la suma de aportes peso × P es π(Centro, Norte)');
  ok(pref3(-1, 0, 2) === 0 && pref3(1, 0, 2) === 0.5 && pref3(2, 0, 2) === 1 && pref3(5, 0, 2) === 1, 'pref3 Tipo III (q=0): 0 · lineal · 1');
  // PROMETHEE I: Centro precede a Norte y a Sur, Norte a Sur → ranking completo
  const p1 = prometheeI(r.phiPlus, r.phiMinus);
  ok(p1.complete && p1.precedes.length === 3 && p1.rel[1][0] === 'precedes' && p1.rel[0][1] === 'preceded', 'PROMETHEE I del viaje: completo (Centro > Norte > Sur)');
}

// Formato de las diapositivas: redondeo half-up a 4 decimales (φ⁺ Norte = 0.35625 se escribe 0.3563, no 0.3562).
{
  ok(n4(0.35625) === '0.3563' && n4(0.45625) === '0.4563', `n4(0.35625) = ${n4(0.35625)} (0.3563), n4(0.45625) = ${n4(0.45625)} (0.4563)`);
  ok(sgn(0.19375) === '+0.1938' && sgn(-0.21875) === '−0.2188' && sgn(0.025) === '+0.0250', `sgn: ${sgn(0.19375)} ${sgn(-0.21875)} ${sgn(0.025)}`);
  ok(n4(0) === '0.0000' && n4(-1e-12) === '0.0000' && n4(NaN) === '—', 'ceros, casi-ceros y NaN se muestran limpios');
  ok(fmtVs(0.648, 0.65, 'c') === '0.6480' && fmtVs(0.65, 0.65, 'c') === '0.65' && fmtVs(0.6499999999, 0.65, 'c') === '0.65', 'fmtVs: 0.648 frente a c* = 0.65 no se redondea a 0.65 (parecería cumplir)');
}

// Caso real IoT/Palmor (diapositivas 38-39): π con los pesos de AHP.
{
  const T = ['LoRaWAN', 'GSM/GPRS', 'Sigfox', 'Zigbee'];
  const M = [[10, 8, 2, 5], [10.5, 0.5, 3, 2], [40, 2, 5, 2], [0.07, 1.5, 2, 4]];
  const r = promethee(M, [0.16, 0.25, 0.488, 0.102], ['max', 'max', 'max', 'max']);
  const c3 = (a: number, b: number) => Math.abs(a - b) <= 6e-4;
  ok(c3(r.pi[0][1], 0.352) && c3(r.pi[0][2], 0.302) && c3(r.pi[0][3], 0.29), `π LoRaWAN → GSM, Sigfox, Zigbee = ${[1, 2, 3].map((k) => r.pi[0][k].toFixed(3)).join(', ')} (0.352, 0.302, 0.290)`);
  ok(c3(r.pi[2][0], 0.608) && c3(r.pi[2][1], 0.494) && c3(r.pi[2][3], 0.665), `π Sigfox → LoRaWAN, GSM, Zigbee = ${[0, 1, 3].map((k) => r.pi[2][k].toFixed(3)).join(', ')} (0.608, 0.494, 0.665)`);
  ok(c3(r.pi[1][0], 0.165) && c3(r.pi[1][2], 0) && c3(r.pi[1][3], 0.204) && c3(r.pi[3][0], 0) && c3(r.pi[3][1], 0.101) && c3(r.pi[3][2], 0.068), 'π de GSM/GPRS y Zigbee (diap. 38)');
  ok(c3(r.phiPlus[2], 0.589) && c3(r.phiMinus[2], 0.123), `Sigfox φ+ ${r.phiPlus[2].toFixed(3)} (0.589) · φ− ${r.phiMinus[2].toFixed(3)} (0.123)`);
  ok(c3(r.phiPlus[0], 0.315) && c3(r.phiMinus[0], 0.258) && c3(r.phiPlus[1], 0.123) && c3(r.phiMinus[1], 0.316) && c3(r.phiPlus[3], 0.056) && c3(r.phiMinus[3], 0.387), 'φ+ y φ− del resto (diap. 39)');
  const p1 = prometheeI(r.phiPlus, r.phiMinus);
  ok(p1.complete, 'PROMETHEE I del caso real es completo (mayor φ+ ⇒ menor φ−, diap. 37)');
  ok(T[r.order[0]] === 'Sigfox', 'ganador Sigfox');
  // dos alternativas con flujos contrarios quedan incomparables en PROMETHEE I aunque PROMETHEE II las ordene
  const q = prometheeI([0.5, 0.3, 0.2], [0.4, 0.1, 0.2]);
  ok(q.rel[0][1] === 'incomparable' && q.incomparable.length >= 1 && !q.complete, 'PROMETHEE I: φ+ mayor pero φ− también mayor ⇒ incomparables');
  ok(prometheeI([0.3, 0.3], [0.2, 0.2]).rel[0][1] === 'indifferent', 'PROMETHEE I: flujos iguales ⇒ indiferentes');
}

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
