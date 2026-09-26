/** Combina capas de criterio en un índice de idoneidad biofísica, réplica de la sección 7-8 de
 * `07_ahp_sig_cacao_snsm.ipynb`: S = Σ wᵢ·sᵢ(x) × Π vetos, exclusión legal aparte, clasificado en
 * 4 clases (estándar UPRA). Puro — sin DOM ni fetch, ver `scripts/check-geo-suitability.ts`. */
import { suitability as sFn, vetoed, type FnSpec, type VetoSpec } from './membership.ts';

export type CriterionRule = { key: string; weight: number; fn: FnSpec; veto?: VetoSpec };

/** 0 = sin dato, 1 = válido, 2 = exclusión legal (mismo código que `mask.u8.gz` del paquete). */
export const MASK_NODATA = 0;
export const MASK_VALID = 1;
export const MASK_EXCLUDED = 2;

/** Clases del mapa (convención UPRA del curso): 3 alta, 2 moderada, 1 no apta, 0 exclusión legal,
 * 4 veto (fuera de exclusión legal, pero vetada por algún criterio: frío extremo, pendiente…). */
export const CLASS_EXCLUDED = 0;
export const CLASS_NO_APTA = 1;
export const CLASS_MODERADA = 2;
export const CLASS_ALTA = 3;
export const CLASS_VETO = 4;

export type ClassThresholds = { alta: number; media: number };

export type PixelResult = { s: number; vetoed: boolean; cls: number };

/** Evalúa un único píxel: valores crudos por criterio -> idoneidad 0–1, clase y si hubo veto.
 * `raw[key] = NaN` cuenta como sin dato: ese criterio no vota y no participa en el peso usado. */
export function evaluatePixel(
  raw: Record<string, number>,
  rules: CriterionRule[],
  thresholds: ClassThresholds,
  maskCode: number,
): PixelResult {
  if (maskCode === MASK_NODATA) return { s: NaN, vetoed: false, cls: CLASS_EXCLUDED };
  if (maskCode === MASK_EXCLUDED) return { s: NaN, vetoed: false, cls: CLASS_EXCLUDED };

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
  if (wUsed === 0) return { s: NaN, vetoed: false, cls: CLASS_EXCLUDED };
  const s = anyVeto ? 0 : sum / wUsed;
  const cls = anyVeto ? CLASS_VETO : s >= thresholds.alta ? CLASS_ALTA : s >= thresholds.media ? CLASS_MODERADA : CLASS_NO_APTA;
  return { s, vetoed: anyVeto, cls };
}

/** Corre `evaluatePixel` sobre una grilla completa. `layers[key][i]` ya en unidades reales
 * (deshecha la cuantización del paquete), `mask[i]` con los códigos de arriba. Devuelve dos planos
 * paralelos a `mask`: `pct` (0–100, 255 sin dato — mismo formato que `geo_results.grid_b64` del
 * plan) y `cls` (0–4). */
/** Reglas cuya capa existe y tiene el tamaño de la grilla. Una capa ausente o de otro tamaño (p. ej. borrada
 * mientras `useDeferredValue` aún sostiene las reglas anteriores, o una capa corrupta) no debe romper el
 * cálculo: simplemente no vota. */
export function usableRules(layers: Record<string, Float32Array>, n: number, rules: CriterionRule[]): CriterionRule[] {
  return rules.filter((r) => layers[r.key] && layers[r.key].length === n);
}

export function evaluateGrid(
  layers: Record<string, Float32Array>,
  mask: Uint8Array,
  allRules: CriterionRule[],
  thresholds: ClassThresholds,
): { pct: Uint8Array; cls: Uint8Array } {
  const n = mask.length;
  const rules = usableRules(layers, n, allRules);
  const pct = new Uint8Array(n);
  const cls = new Uint8Array(n);
  const raw: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    for (const r of rules) raw[r.key] = layers[r.key][i];
    const px = evaluatePixel(raw, rules, thresholds, mask[i]);
    pct[i] = Number.isNaN(px.s) ? 255 : Math.round(px.s * 100);
    cls[i] = px.cls;
  }
  return { pct, cls };
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

/** Hectáreas por clase (0–4) sobre un plano `cls` ya calculado. */
export function hectaresByClass(cls: Uint8Array, haPerPixel: number): Record<number, number> {
  const out: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  for (let i = 0; i < cls.length; i++) out[cls[i]] = (out[cls[i]] ?? 0) + haPerPixel;
  return out;
}

/** Hectáreas por clase respetando la máscara: `cls` vale 0 tanto para "exclusión legal" como para
 * "fuera del área", así que se separan con `mask`. `evaluable` = alta + moderada + no apta (la base
 * de los porcentajes, como el 62.36 % / 30.88 % / 6.76 % del artículo de la boya). */
export function areaStats(cls: Uint8Array, pct: Uint8Array, mask: Uint8Array, haPerPixel: number) {
  let alta = 0, media = 0, noapta = 0, excl = 0;
  for (let i = 0; i < cls.length; i++) {
    if (mask[i] === MASK_NODATA) continue;
    if (mask[i] === MASK_EXCLUDED) { excl++; continue; }
    if (pct[i] === 255) continue;
    if (cls[i] === CLASS_ALTA) alta++;
    else if (cls[i] === CLASS_MODERADA) media++;
    else noapta++;
  }
  const evaluable = alta + media + noapta;
  const ha = (n: number) => n * haPerPixel;
  const pc = (n: number) => (evaluable ? (100 * n) / evaluable : 0);
  return {
    alta: { ha: ha(alta), pct: pc(alta) }, media: { ha: ha(media), pct: pc(media) },
    noapta: { ha: ha(noapta), pct: pc(noapta) }, excl: { ha: ha(excl), pct: 0 },
    evaluableHa: ha(evaluable), totalHa: ha(evaluable + excl),
  };
}
export type AreaStats = ReturnType<typeof areaStats>;
