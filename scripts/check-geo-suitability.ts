// Prueba de humo de evaluatePixel/evaluateGrid/hectaresByClass contra los 4 puntos de ejemplo del
// notebook 07 (Palmor/San Pedro/Bonda/Guachaca) — mismos pesos AHP de consenso
// [0.41212532, 0.30423758, 0.16065179, 0.12298531] y mismas reglas que SNSM_CACAO_RULES.
import { SNSM_CACAO_RULES } from '../src/lib/geo/membership.ts';
import {
  CLASS_ALTA, CLASS_EXCLUDED, CLASS_MODERADA, CLASS_NO_APTA, CLASS_VETO,
  coverageStats, evaluateGrid, evaluatePixel, hectaresByClass, usableRules, MASK_EXCLUDED, MASK_NODATA, MASK_VALID,
  type CriterionRule,
} from '../src/lib/geo/suitability.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol = 1e-3) => Math.abs(a - b) <= tol;

const PESOS = { precip: 0.41212532, temp: 0.30423758, ph: 0.16065179, pend: 0.12298531 };
const REGLAS: CriterionRule[] = Object.entries(SNSM_CACAO_RULES).map(([key, r]) => ({
  key, weight: PESOS[key as keyof typeof PESOS], fn: r.fn, veto: r.veto,
}));
const UMBRALES = { alta: 0.70, media: 0.45 }; // convención UPRA del curso

// Los mismos 4 puntos que check-geo-membership.ts, ahora combinados con pesos: S debe coincidir con
// idoneidad_biofisica_250m.npy del notebook a 1e-3 (redondeo de cuantización aparte).
const PUNTOS = {
  Palmor: { temp: 22.687513, precip: 1761.425903, ph: 5.397205, pend: 2.069206, S: 0.988991 },
  'San Pedro': { temp: 22.508139, precip: 1493.080078, ph: 5.51557, pend: 9.764578, S: 0.997148 },
  Bonda: { temp: 27.572132, precip: 913.318115, ph: 6.617826, pend: 1.014364, S: 0.745594 },
  Guachaca: { temp: 27.465155, precip: 955.15564, ph: 6.6017, pend: 4.214322, S: 0.764564 },
};
for (const [nombre, p] of Object.entries(PUNTOS)) {
  const r = evaluatePixel({ temp: p.temp, precip: p.precip, ph: p.ph, pend: p.pend }, REGLAS, UMBRALES, MASK_VALID);
  ok(cerca(r.s, p.S, 2e-3), `${nombre}: S = ${r.s.toFixed(5)} (esperado ${p.S}, notebook 07)`);
  ok(r.cls === CLASS_ALTA, `${nombre}: clase = alta aptitud (S≥0.70)`);
  ok(r.vetoed === false, `${nombre}: sin veto`);
}

// Exclusión legal: gana sobre todo lo demás, sin importar los valores.
{
  const r = evaluatePixel({ temp: 26, precip: 2000, ph: 6, pend: 5 }, REGLAS, UMBRALES, MASK_EXCLUDED);
  ok(r.cls === CLASS_EXCLUDED && Number.isNaN(r.s), 'exclusión legal (PNN/páramo): clase 0, sin S');
}

// Sin dato en la máscara: igual, clase 0.
{
  const r = evaluatePixel({ temp: 26, precip: 2000, ph: 6, pend: 5 }, REGLAS, UMBRALES, MASK_NODATA);
  ok(r.cls === CLASS_EXCLUDED && Number.isNaN(r.s), 'sin dato: clase 0, sin S');
}

// Veto fisiológico (Ley del Mínimo): frío extremo anula el píxel aunque los demás criterios sean óptimos.
{
  const r = evaluatePixel({ temp: 10, precip: 2000, ph: 6, pend: 5 }, REGLAS, UMBRALES, MASK_VALID);
  ok(r.vetoed === true && r.cls === CLASS_VETO && r.s === 0, 'veto térmico (<15°C): clase 4, S=0');
}
{
  const r = evaluatePixel({ temp: 26, precip: 2000, ph: 6, pend: 50 }, REGLAS, UMBRALES, MASK_VALID);
  ok(r.vetoed === true && r.cls === CLASS_VETO, 'veto por pendiente (≥45°): clase 4');
}

// Clasificación por umbral: moderada y no apta.
{
  const moderada = evaluatePixel({ temp: 26, precip: 700, ph: 6, pend: 5 }, REGLAS, UMBRALES, MASK_VALID);
  ok(moderada.s >= 0.45 && moderada.s < 0.70 && moderada.cls === CLASS_MODERADA, `S=${moderada.s.toFixed(3)} -> clase moderada`);
  const noApta = evaluatePixel({ temp: 26, precip: 400, ph: 3, pend: 5 }, REGLAS, UMBRALES, MASK_VALID);
  ok(noApta.s < 0.45 && noApta.cls === CLASS_NO_APTA, `S=${noApta.s.toFixed(3)} -> clase no apta`);
}

// evaluateGrid + hectaresByClass: ejemplo de juguete de 4 píxeles (1 de cada clase), como en la
// diapositiva de S5 — ha/píxel = 6.25 (250×250 m).
{
  const layers = {
    temp: new Float32Array([22.7, 22.7, 26, 10]),
    precip: new Float32Array([1761, 700, 400, 2000]),
    ph: new Float32Array([5.4, 6, 3, 6]),
    pend: new Float32Array([2, 5, 5, 5]),
  };
  const mask = new Uint8Array([MASK_VALID, MASK_VALID, MASK_VALID, MASK_VALID]);
  const { pct, cls } = evaluateGrid(layers, mask, REGLAS, UMBRALES);
  ok(cls[0] === CLASS_ALTA && pct[0] >= 98, 'evaluateGrid: píxel 0 alta aptitud');
  ok(cls[1] === CLASS_MODERADA, 'evaluateGrid: píxel 1 moderada');
  ok(cls[2] === CLASS_NO_APTA, 'evaluateGrid: píxel 2 no apta');
  ok(cls[3] === CLASS_VETO && pct[3] === 0, 'evaluateGrid: píxel 3 vetado por frío, 0%');

  const ha = hectaresByClass(cls, 6.25);
  ok(ha[CLASS_ALTA] === 6.25 && ha[CLASS_MODERADA] === 6.25 && ha[CLASS_NO_APTA] === 6.25 && ha[CLASS_VETO] === 6.25,
    `hectaresByClass: 6.25 ha por clase (${JSON.stringify(ha)})`);
}

// --- robustez: capa ausente / de otro tamaño no debe romper el cálculo, y la cobertura se cuenta
{
  const layers: Record<string, Float32Array> = {
    a: new Float32Array([1, 1, NaN, NaN]),
    b: new Float32Array([1, NaN, 1, NaN]),
  };
  const rules: CriterionRule[] = [
    { key: 'a', weight: 0.5, fn: { type: 'up', a: 0, b: 1 } },
    { key: 'b', weight: 0.5, fn: { type: 'up', a: 0, b: 1 } },
    { key: 'borrada', weight: 0.9, fn: { type: 'up', a: 0, b: 1 } },      // capa que ya no existe (useDeferredValue sostiene reglas viejas)
    { key: 'chica', weight: 0.9, fn: { type: 'up', a: 0, b: 1 } },        // capa de otro tamaño (corrupta)
  ];
  layers.chica = new Float32Array(3);
  ok(usableRules(layers, 4, rules).length === 2, 'usableRules descarta capas ausentes o de otro tamaño');
  let threw = false; let out: ReturnType<typeof evaluateGrid> | null = null;
  try { out = evaluateGrid(layers, new Uint8Array(4).fill(MASK_VALID), rules, UMBRALES); } catch { threw = true; }
  ok(!threw && out !== null, 'evaluateGrid no lanza con una capa ausente');
  ok(out!.pct[0] === 100 && out!.pct[1] === 100 && out!.pct[2] === 100, 'con un criterio sin dato en la celda, los pesos se reescalan entre los que sí tienen dato');
  ok(out!.pct[3] === 255, 'celda sin dato en TODOS los criterios = sin dato (255), no 0');
  const cov = coverageStats(layers, new Uint8Array([MASK_VALID, MASK_VALID, MASK_VALID, MASK_VALID]), rules);
  ok(cov.valid === 4 && cov.partial === 2 && cov.none === 1, `coverageStats: 4 evaluables, 2 parciales, 1 sin dato (${JSON.stringify(cov)})`);
  const cov2 = coverageStats(layers, new Uint8Array([MASK_EXCLUDED, MASK_NODATA, MASK_VALID, MASK_VALID]), rules);
  ok(cov2.valid === 2, 'coverageStats ignora exclusión y fuera del área');
}

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
