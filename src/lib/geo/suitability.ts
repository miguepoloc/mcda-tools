/** Combina capas de criterio en un índice de idoneidad (o de riesgo) biofísico, réplica de la sección 7-8 de
 * `07_ahp_sig_cacao_snsm.ipynb`: S = Σ wᵢ·sᵢ(x) × Π vetos, exclusión legal aparte, clasificado en N clases
 * (por defecto 3, estándar UPRA). Puro — sin DOM ni fetch, ver `scripts/check-geo-suitability.ts`.
 *
 * El cálculo del índice (`evaluateIndex`) está separado de la clasificación (`classify`): así los cortes se pueden
 * calcular sobre la distribución del índice (cuantiles, Jenks) sin recalcular el mapa. */
import { suitability as sFn, vetoed, type FnSpec, type VetoSpec } from './membership.ts';

export type CriterionRule = { key: string; weight: number; fn: FnSpec; veto?: VetoSpec };

/** Qué significa un valor alto del índice: más apto (mejor) o más riesgo (peor). Ausente = 'suitability'. */
export type Direction = 'suitability' | 'risk';

/** 0 = sin dato, 1 = válido, 2 = exclusión legal (mismo código que `mask.u8.gz` del paquete). */
export const MASK_NODATA = 0;
export const MASK_VALID = 1;
export const MASK_EXCLUDED = 2;

/** Códigos del plano de clase `cls`: 0 = exclusión legal (o fuera del área), 1..N = clases evaluadas en orden
 * ascendente del índice (1 = la de índice más bajo, N = la más alta; con 3 clases en aptitud: 1 no apta, 2 moderada,
 * 3 alta), `CLASS_VETO` = vetada por algún criterio (frío extremo, pendiente…; en aptitud cuenta como la clase 1,
 * en riesgo como la N). El veto usa un código fuera de 1..8 para que no choque con el número de clases. */
export const CLASS_EXCLUDED = 0;
export const CLASS_NO_APTA = 1;
export const CLASS_MODERADA = 2;
export const CLASS_ALTA = 3;
export const CLASS_VETO = 253;

/** Máximo y mínimo de clases evaluadas que admite el mapa. */
export const MIN_CLASSES = 2;
export const MAX_CLASSES = 8;

export type ClassThresholds = { alta: number; media: number };

export type PixelResult = { s: number; vetoed: boolean; cls: number };

/** Índice de un píxel sin clasificar: `s` en 0–1 (NaN = sin dato) y si hubo veto. En riesgo el veto fuerza el índice
 * al máximo (1); en aptitud, a 0. `raw[key] = NaN` cuenta como sin dato: ese criterio no vota ni pesa. */
export function indexPixel(
  raw: Record<string, number>,
  rules: CriterionRule[],
  maskCode: number,
  direction: Direction = 'suitability',
): { s: number; vetoed: boolean } {
  if (maskCode === MASK_NODATA || maskCode === MASK_EXCLUDED) return { s: NaN, vetoed: false };
  let sum = 0;
  let wUsed = 0;
  let anyVeto = false;
  for (const r of rules) {
    const x = raw[r.key];
    if (Number.isNaN(x)) continue;
    if (vetoed(x, r.veto)) anyVeto = true;
    sum += r.weight * sFn(x, r.fn);
    wUsed += r.weight;
  }
  if (wUsed === 0) return { s: NaN, vetoed: false };
  const s = anyVeto ? (direction === 'risk' ? 1 : 0) : sum / wUsed;
  return { s, vetoed: anyVeto };
}

/** Clase (1..N) de un índice `s` (0–1) con `breaks` ascendentes (N−1 cortes, 0–1): 1 + cuántos cortes alcanza. */
export function classOf(s: number, breaks: number[]): number {
  let c = 1;
  for (const b of breaks) if (s >= b) c++;
  return c;
}

/** Evalúa un único píxel: valores crudos por criterio -> idoneidad 0–1, clase y si hubo veto (3 clases con
 * los umbrales `alta`/`media`; para N clases, `indexPixel` + `classOf`). */
export function evaluatePixel(
  raw: Record<string, number>,
  rules: CriterionRule[],
  thresholds: ClassThresholds,
  maskCode: number,
): PixelResult {
  const { s, vetoed: anyVeto } = indexPixel(raw, rules, maskCode, 'suitability');
  if (Number.isNaN(s)) return { s: NaN, vetoed: false, cls: CLASS_EXCLUDED };
  const cls = anyVeto ? CLASS_VETO : s >= thresholds.alta ? CLASS_ALTA : s >= thresholds.media ? CLASS_MODERADA : CLASS_NO_APTA;
  return { s, vetoed: anyVeto, cls };
}

/** Reglas cuya capa existe y tiene el tamaño de la grilla. Una capa ausente o de otro tamaño (p. ej. borrada
 * mientras `useDeferredValue` aún sostiene las reglas anteriores, o una capa corrupta) no debe romper el
 * cálculo: simplemente no vota. */
export function usableRules(layers: Record<string, Float32Array>, n: number, rules: CriterionRule[]): CriterionRule[] {
  return rules.filter((r) => layers[r.key] && layers[r.key].length === n);
}

/** Plano del índice sobre toda la grilla, sin clasificar. `s` = 0–1 en doble precisión (NaN = sin dato: exclusión,
 * fuera del área o sin dato en todos los criterios), `pct` = 0–100 redondeado (255 sin dato, mismo formato que
 * `geo_results.grid_b64`) y `veto` = 1 donde algún criterio vetó. */
export function evaluateIndex(
  layers: Record<string, Float32Array>,
  mask: Uint8Array,
  allRules: CriterionRule[],
  direction: Direction = 'suitability',
): { pct: Uint8Array; s: Float64Array; veto: Uint8Array } {
  const n = mask.length;
  const rules = usableRules(layers, n, allRules);
  const pct = new Uint8Array(n);
  const s = new Float64Array(n);
  const veto = new Uint8Array(n);
  const raw: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    for (const r of rules) raw[r.key] = layers[r.key][i];
    const px = indexPixel(raw, rules, mask[i], direction);
    s[i] = px.s;
    veto[i] = px.vetoed ? 1 : 0;
    pct[i] = Number.isNaN(px.s) ? 255 : Math.round(px.s * 100);
  }
  return { pct, s, veto };
}

/** Clasifica el índice con `breaks` (N−1 cortes ascendentes, 0–1) en el plano `cls` (códigos de arriba). Separado
 * del cálculo: cambiar los cortes o el número de clases no obliga a reevaluar los criterios. */
export function classify(s: Float64Array, veto: Uint8Array, breaks: number[]): Uint8Array {
  const cls = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    if (Number.isNaN(s[i])) cls[i] = CLASS_EXCLUDED;
    else if (veto[i]) cls[i] = CLASS_VETO;
    else cls[i] = classOf(s[i], breaks);
  }
  return cls;
}

/** Corre la evaluación sobre una grilla completa con 3 clases (`alta`/`media`). `layers[key][i]` ya en unidades
 * reales (deshecha la cuantización del paquete), `mask[i]` con los códigos de arriba. Devuelve dos planos paralelos a
 * `mask`: `pct` (0–100, 255 sin dato) y `cls`. Para N clases o dirección de riesgo: `evaluateIndex` + `classify`. */
export function evaluateGrid(
  layers: Record<string, Float32Array>,
  mask: Uint8Array,
  allRules: CriterionRule[],
  thresholds: ClassThresholds,
): { pct: Uint8Array; cls: Uint8Array } {
  const { pct, s, veto } = evaluateIndex(layers, mask, allRules, 'suitability');
  return { pct, cls: classify(s, veto, [thresholds.media, thresholds.alta]) };
}

/** Cobertura de datos: cuántas celdas evaluables (máscara válida) no tienen dato en TODOS los criterios.
 * `evaluatePixel` no penaliza un criterio sin dato: lo omite y reescala los pesos de los demás. Eso es razonable
 * en los bordes de una capa, pero puede inflar o desinflar la idoneidad allí, así que se cuenta y se avisa.
 * `partial` = con al menos un criterio sin dato y al menos uno con dato; `none` = ninguno con dato. */
export function coverageStats(layers: Record<string, Float32Array>, mask: Uint8Array, allRules: CriterionRule[]) {
  const n = mask.length;
  const rules = usableRules(layers, n, allRules);
  let valid = 0, partial = 0, none = 0;
  if (!rules.length) return { valid: 0, partial: 0, none: 0 };
  for (let i = 0; i < n; i++) {
    if (mask[i] !== MASK_VALID) continue;
    valid++;
    let missing = 0;
    for (const r of rules) if (Number.isNaN(layers[r.key][i])) missing++;
    if (missing === rules.length) none++;
    else if (missing > 0) partial++;
  }
  return { valid, partial, none };
}

/** Hectáreas por código de clase sobre un plano `cls` ya calculado. */
export function hectaresByClass(cls: Uint8Array, haPerPixel: number): Record<number, number> {
  const out: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, [CLASS_VETO]: 0 };
  for (let i = 0; i < cls.length; i++) out[cls[i]] = (out[cls[i]] ?? 0) + haPerPixel;
  return out;
}

export type ClassStats = {
  /** Una entrada por clase evaluada, en orden ascendente del índice (la 0 es la clase 1). Las celdas vetadas se
   * suman a la clase extrema de la dirección (aptitud: la más baja; riesgo: la más alta). */
  classes: { ha: number; pct: number }[];
  /** Celdas vetadas (ya incluidas en `classes`), por separado para poder rotularlas. */
  veto: { ha: number; pct: number };
  excl: { ha: number; pct: number };
  evaluableHa: number;
  totalHa: number;
};

/** Hectáreas y % por clase respetando la máscara: `cls` vale 0 tanto para "exclusión legal" como para "fuera del
 * área", así que se separan con `mask`. `evaluable` = suma de las clases (la base de los porcentajes, como el
 * 62.36 % / 30.88 % / 6.76 % del artículo de la boya). */
export function classStats(cls: Uint8Array, pct: Uint8Array, mask: Uint8Array, haPerPixel: number, nClasses = 3, direction: Direction = 'suitability'): ClassStats {
  const cnt = new Array<number>(nClasses).fill(0);
  let excl = 0, vetoN = 0;
  for (let i = 0; i < cls.length; i++) {
    if (mask[i] === MASK_NODATA) continue;
    if (mask[i] === MASK_EXCLUDED) { excl++; continue; }
    if (pct[i] === 255) continue;
    const c = cls[i];
    if (c === CLASS_VETO) { vetoN++; cnt[direction === 'risk' ? nClasses - 1 : 0]++; }
    else if (c >= 1 && c <= nClasses) cnt[c - 1]++;
    else cnt[0]++;
  }
  const evaluable = cnt.reduce((a, b) => a + b, 0);
  const ha = (n: number) => n * haPerPixel;
  const pc = (n: number) => (evaluable ? (100 * n) / evaluable : 0);
  return {
    classes: cnt.map((n) => ({ ha: ha(n), pct: pc(n) })),
    veto: { ha: ha(vetoN), pct: pc(vetoN) },
    excl: { ha: ha(excl), pct: 0 },
    evaluableHa: ha(evaluable), totalHa: ha(evaluable + excl),
  };
}

/** Versión de 3 clases (alta / moderada / no apta) de `classStats`, con los nombres históricos. */
export function areaStats(cls: Uint8Array, pct: Uint8Array, mask: Uint8Array, haPerPixel: number) {
  const st = classStats(cls, pct, mask, haPerPixel, 3, 'suitability');
  return {
    alta: st.classes[2], media: st.classes[1], noapta: st.classes[0], excl: st.excl,
    evaluableHa: st.evaluableHa, totalHa: st.totalHa,
  };
}
export type AreaStats = ReturnType<typeof areaStats>;
