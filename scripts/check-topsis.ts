// Prueba de humo de la matemática TOPSIS. Compara contra 02_topsis_iot_palmor.ipynb del curso
// (caso IoT/Palmor, mismo dataset/pesos que el notebook de referencia con pyDecision.topsis_method).
import { topsis, topsisSynthesis } from '../src/lib/topsis.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol = 5e-3) => Math.abs(a - b) <= tol;

// Caso IoT/Palmor: LoRaWAN, GSM/GPRS, Sigfox, Zigbee x Alcance, Autonomía, Infraestructura, Madurez.
// Resultado esperado (Sesión 3 del curso): Sigfox 0.599, LoRaWAN 0.477, GSM/GPRS 0.224, Zigbee 0.111.
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
  const r = topsis(dataset, pesos, tipo);
  const esperado = [0.477, 0.224, 0.599, 0.111];
  tecnologias.forEach((t, i) => ok(cerca(r.closeness[i], esperado[i]), `C_${t} = ${r.closeness[i].toFixed(3)} (esperado ${esperado[i]})`));
  ok(tecnologias[r.order[0]] === 'Sigfox', `ganador = ${tecnologias[r.order[0]]} (esperado Sigfox)`);
}

// Mismo caso vía topsisSynthesis (con criteria/alternatives/DecisionMatrix, como lo usará la UI).
{
  const criteria = ['Alcance', 'Autonomia', 'Infraestructura', 'Madurez'].map((name, i) => ({ id: 'k' + i, name, hint: '' }));
  const alternatives = ['LoRaWAN', 'GSM/GPRS', 'Sigfox', 'Zigbee'].map((name, i) => ({ id: 'a' + i, name }));
  const dataset = [
    [10, 8, 2, 5],
    [10.5, 0.5, 3, 2],
    [40, 2, 5, 2],
    [0.07, 1.5, 2, 4],
  ];
  let dm = { values: {} as Record<string, Record<string, number>>, types: {} as Record<string, 'max' | 'min'> };
  alternatives.forEach((a, i) => {
    dm.values[a.id] = {};
    criteria.forEach((c, j) => { dm.values[a.id][c.id] = dataset[i][j]; });
  });
  criteria.forEach((c) => { dm.types[c.id] = 'max'; });
  const weights = [0.16, 0.25, 0.488, 0.102];
  const s = topsisSynthesis(criteria, alternatives, dm, weights);
  ok(alternatives[s.order[0]].name === 'Sigfox', `topsisSynthesis: ganador = ${alternatives[s.order[0]].name} (esperado Sigfox)`);
  ok(cerca(s.rows[2].c, 0.599), `topsisSynthesis: C_Sigfox = ${s.rows[2].c.toFixed(3)} (esperado 0.599)`);
}

// Vacío: no debe fallar (NaN/Infinity).
{
  const r = topsis([], [], []);
  ok(r.closeness.length === 0, 'matriz vacía: no falla, cercanía vacía');
}

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
