// Prueba SAW contra resultado calculado manualmente con el caso IoT/Palmor del curso.
// Dataset idéntico al de check-topsis.ts (mismos pesos y tipos).
// SAW con normalización Min-Max (beneficio): normalizar → suma ponderada.
// Cálculo manual verificado paso a paso en la sesión de diseño del 20 sep 2026.
import { saw, sawSynthesis } from '../src/lib/saw.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol = 5e-3) => Math.abs(a - b) <= tol;

// Caso IoT/Palmor: LoRaWAN, GSM/GPRS, Sigfox, Zigbee x Alcance, Autonomía, Infraestructura, Madurez.
// Todos max, pesos [0.16, 0.25, 0.488, 0.102].
// Normalización Min-Max:
//   Alcance:          [10, 10.5, 40, 0.07] → min=0.07, max=40 → [0.249, 0.262, 1.000, 0.000]
//   Autonomía:        [8, 0.5, 2, 1.5]     → min=0.5, max=8   → [1.000, 0.000, 0.200, 0.133]
//   Infraestructura:  [2, 3, 5, 2]         → min=2, max=5      → [0.000, 0.333, 1.000, 0.000]
//   Madurez:          [5, 2, 2, 4]         → min=2, max=5      → [1.000, 0.000, 0.000, 0.667]
// Scores:
//   LoRaWAN:  0.16*0.249 + 0.25*1.000 + 0.488*0.000 + 0.102*1.000 = 0.040+0.250+0.000+0.102 = 0.392
//   GSM/GPRS: 0.16*0.262 + 0.25*0.000 + 0.488*0.333 + 0.102*0.000 = 0.042+0.000+0.163+0.000 = 0.205
//   Sigfox:   0.16*1.000 + 0.25*0.200 + 0.488*1.000 + 0.102*0.000 = 0.160+0.050+0.488+0.000 = 0.698
//   Zigbee:   0.16*0.000 + 0.25*0.133 + 0.488*0.000 + 0.102*0.667 = 0.000+0.033+0.000+0.068 = 0.101
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
  const r = saw(dataset, pesos, tipo);
  const esperado = [0.392, 0.205, 0.698, 0.101];
  tecnologias.forEach((t, i) =>
    ok(cerca(r.scores[i], esperado[i]), `SAW_${t} = ${r.scores[i].toFixed(3)} (esperado ${esperado[i]})`)
  );
  ok(tecnologias[r.order[0]] === 'Sigfox', `ganador = ${tecnologias[r.order[0]]} (esperado Sigfox)`);
  ok(tecnologias[r.order[1]] === 'LoRaWAN', `2º = ${tecnologias[r.order[1]]} (esperado LoRaWAN)`);
  ok(tecnologias[r.order[2]] === 'GSM/GPRS', `3º = ${tecnologias[r.order[2]]} (esperado GSM/GPRS)`);
  ok(tecnologias[r.order[3]] === 'Zigbee', `4º = ${tecnologias[r.order[3]]} (esperado Zigbee)`);
}

// Mismo caso vía sawSynthesis (con criteria/alternatives/DecisionMatrix).
{
  const criteria = ['Alcance', 'Autonomia', 'Infraestructura', 'Madurez'].map((name, i) => ({ id: 'k' + i, name, hint: '' }));
  const alternatives = ['LoRaWAN', 'GSM/GPRS', 'Sigfox', 'Zigbee'].map((name, i) => ({ id: 'a' + i, name }));
  const dataset = [[10, 8, 2, 5], [10.5, 0.5, 3, 2], [40, 2, 5, 2], [0.07, 1.5, 2, 4]];
  const dm = { values: {} as Record<string, Record<string, number | string>>, types: {} as Record<string, 'max' | 'min'> };
  alternatives.forEach((a, i) => {
    dm.values[a.id] = {};
    criteria.forEach((c, j) => { dm.values[a.id][c.id] = dataset[i][j]; });
  });
  criteria.forEach((c) => { dm.types[c.id] = 'max'; });
  const weights = [0.16, 0.25, 0.488, 0.102];
  const s = sawSynthesis(criteria, alternatives, dm, weights);
  ok(alternatives[s.order[0]].name === 'Sigfox', `sawSynthesis: ganador = ${alternatives[s.order[0]].name} (esperado Sigfox)`);
  ok(cerca(s.rows[2].value, 0.698), `sawSynthesis: SAW_Sigfox = ${s.rows[2].value.toFixed(3)} (esperado 0.698)`);
  ok(s.rows[2].rank === 1, `sawSynthesis: rank_Sigfox = ${s.rows[2].rank} (esperado 1)`);
}

// Vacío: no debe fallar.
{
  const r = saw([], [], []);
  ok(r.scores.length === 0, 'matriz vacía: no falla');
}

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
