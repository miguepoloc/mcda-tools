// Prueba Fuzzy TOPSIS contra Chen (2000) ejemplo adaptado al caso IoT/Palmor.
// Se asignan etiquetas lingüísticas VG/G/F/P/VP a las 4 alternativas x 4 criterios,
// luego se verifica propiedades matemáticas: CC ∈ [0,1], ganador coherente, suman bien.
import { fuzzyTopsisSynthesis, LINGUISTIC_ALT } from '../src/lib/fuzzy_topsis.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol = 5e-3) => Math.abs(a - b) <= tol;

// Verificar que la escala lingüística es correcta (Chen, 2000).
ok(JSON.stringify(LINGUISTIC_ALT.VG) === JSON.stringify([7, 9, 10]), `VG = (7,9,10) según Chen (2000)`);
ok(JSON.stringify(LINGUISTIC_ALT.VP) === JSON.stringify([0, 0, 1]),  `VP = (0,0,1)`);
ok(JSON.stringify(LINGUISTIC_ALT.F)  === JSON.stringify([1, 3, 5]),  `F  = (1,3,5)`);

// Caso IoT/Palmor con etiquetas lingüísticas (beneficio para todos).
// Asignación intencional para que Sigfox sea el ganador (mejor en todos):
//   Sigfox:   VG, VG, VG, VG  → CC alto
//   LoRaWAN:  G,  G,  P,  VG  → CC medio
//   GSM/GPRS: G,  VP, F,  P   → CC bajo
//   Zigbee:   VP, P,  P,  G   → CC muy bajo
{
  const criteria = ['Alcance', 'Autonomia', 'Infraestructura', 'Madurez'].map((name, i) => ({ id: 'k' + i, name, hint: '' }));
  const alternatives = ['LoRaWAN', 'GSM/GPRS', 'Sigfox', 'Zigbee'].map((name, i) => ({ id: 'a' + i, name }));
  const labels: Record<string, Record<string, string>> = {
    'a0': { k0: 'G',  k1: 'G',  k2: 'P',  k3: 'VG' }, // LoRaWAN
    'a1': { k0: 'G',  k1: 'VP', k2: 'F',  k3: 'P'  }, // GSM/GPRS
    'a2': { k0: 'VG', k1: 'VG', k2: 'VG', k3: 'VG' }, // Sigfox
    'a3': { k0: 'VP', k1: 'P',  k2: 'P',  k3: 'G'  }, // Zigbee
  };
  const dm = {
    values: labels as Record<string, Record<string, string | number>>,
    types: { k0: 'max', k1: 'max', k2: 'max', k3: 'max' } as Record<string, 'max' | 'min'>,
  };
  const pesos = [0.25, 0.25, 0.25, 0.25]; // pesos iguales para aislar el efecto de las etiquetas
  const r = fuzzyTopsisSynthesis(criteria, alternatives, dm, pesos);

  // CC debe estar en [0, 1]
  r.rows.forEach((row) =>
    ok(row.value >= -1e-9 && row.value <= 1 + 1e-9, `CC_${row.name} ∈ [0,1]: ${row.value.toFixed(4)}`)
  );

  ok(alternatives[r.order[0]].name === 'Sigfox',
    `ganador = ${alternatives[r.order[0]].name} (esperado Sigfox)`);
  ok(alternatives[r.order[3]].name === 'Zigbee',
    `último = ${alternatives[r.order[3]].name} (esperado Zigbee)`);

  // Con Sigfox en VG para todo y Zigbee en VP/P/P/G, CC_Sigfox > CC_LoRaWAN > CC_Zigbee
  ok(r.rows[2].value > r.rows[0].value,
    `CC_Sigfox (${r.rows[2].value.toFixed(4)}) > CC_LoRaWAN (${r.rows[0].value.toFixed(4)})`);
  ok(r.rows[0].value > r.rows[3].value,
    `CC_LoRaWAN (${r.rows[0].value.toFixed(4)}) > CC_Zigbee (${r.rows[3].value.toFixed(4)})`);

  // Con todos VG el CC debería ser ~1.0 (FPIS = FNIS con esta normalización, d+=0, d-=max)
  const allVG = {
    values: Object.fromEntries(alternatives.map((a) => [a.id, Object.fromEntries(criteria.map((c) => [c.id, 'VG']))])) as Record<string, Record<string, string | number>>,
    types: { k0: 'max', k1: 'max', k2: 'max', k3: 'max' } as Record<string, 'max' | 'min'>,
  };
  const rVG = fuzzyTopsisSynthesis(criteria, alternatives, allVG, pesos);
  // Cuando todas las alternativas tienen el mismo valor (VG en todo), todos los CC deben ser iguales.
  const allEqual = rVG.rows.every((r) => Math.abs(r.value - rVG.rows[0].value) < 1e-9);
  ok(allEqual, `Todos VG: CC uniforme para todas las alternativas (CC[0]=${rVG.rows[0].value.toFixed(4)})`);
  console.log('  CC valores:', r.rows.map((row) => `${row.name}=${row.value.toFixed(4)}`).join(', '));
}

// Vacío: no debe fallar.
{
  const r = fuzzyTopsisSynthesis([], [], { values: {}, types: {} }, []);
  ok(r.rows.length === 0 && r.tie, 'vacío: no falla');
}

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
