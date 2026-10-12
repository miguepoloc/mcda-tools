// Funciones de preferencia de PROMETHEE (Brans & Vincke, 1985) y su configuración por criterio. Lógica pura, sin
// dependencias de otros módulos de cálculo (la importan topsis.ts —para sanear lo que llega de la base— y promethee.ts).
//
// Definiciones (d = ventaja de a sobre b en la dirección «mayor es mejor»; en todas P(d) = 0 si d ≤ 0), idénticas a
// pyDecision.preference_degree (t1…t6; ver scripts/check-promethee-functions.ts):
//   I   usual      P = 1 si d > 0
//   II  en U       P = 0 si d ≤ q, 1 si d > q
//   III en V       P = d/p si d < p, 1 si d ≥ p          (q = 0)
//   IV  por niveles P = 0 si d ≤ q; 1/2 si q < d ≤ p; 1 si d > p
//   V   lineal     P = 0 si d ≤ q; (d − q)/(p − q) si q < d < p; 1 si d ≥ p
//   VI  gaussiana  P = 1 − exp(−d² / (2σ²))
// Lo que la plataforma hacía antes de este módulo (Tipo III con q = 0 y p = rango) es el valor por defecto, y da EXACTAMENTE
// los mismos números: cualquier proyecto guardado sin `prometheeConfig` sigue igual.
import type { PrometheeCriterionConfig, PrometheeFn } from './types.ts';

export type { PrometheeCriterionConfig, PrometheeFn };

export const PROMETHEE_FNS: PrometheeFn[] = ['usual', 'ushape', 'vshape', 'level', 'linear', 'gaussian'];
export const DEFAULT_PROMETHEE_FN: PrometheeFn = 'vshape';

export type PrometheeFnInfo = {
  fn: PrometheeFn;
  /** Tipo de Brans & Vincke (1985), en romano. */
  type: string;
  label: string;
  /** Nombre corto (y también el texto que lleva la celda «Función» del Excel: se compara en las fórmulas). */
  xl: string;
  /** Qué umbrales usa. */
  q: boolean; p: boolean; s: boolean;
  formula: string;
  desc: string;
};

export const PROMETHEE_FN_INFO: Record<PrometheeFn, PrometheeFnInfo> = {
  usual: {
    fn: 'usual', type: 'I', label: 'Usual', xl: 'Usual', q: false, p: false, s: false,
    formula: 'P(d) = 0 si d ≤ 0;  P(d) = 1 si d > 0',
    desc: 'Cualquier ventaja, por pequeña que sea, es preferencia total. Sin umbrales.',
  },
  ushape: {
    fn: 'ushape', type: 'II', label: 'En U (cuasi-criterio)', xl: 'U', q: true, p: false, s: false,
    formula: 'P(d) = 0 si d ≤ q;  P(d) = 1 si d > q',
    desc: 'Ventajas hasta q son indiferentes; pasado q la preferencia es total.',
  },
  vshape: {
    fn: 'vshape', type: 'III', label: 'En V (lineal)', xl: 'V', q: false, p: true, s: false,
    formula: 'P(d) = 0 si d ≤ 0;  P(d) = d ÷ p si 0 < d < p;  P(d) = 1 si d ≥ p',
    desc: 'La preferencia crece en línea recta hasta p. Es la del curso (con p = rango del criterio).',
  },
  level: {
    fn: 'level', type: 'IV', label: 'Por niveles', xl: 'Nivel', q: true, p: true, s: false,
    formula: 'P(d) = 0 si d ≤ q;  P(d) = 0.5 si q < d ≤ p;  P(d) = 1 si d > p',
    desc: 'Tres niveles: indiferente hasta q, preferencia débil (0.5) hasta p y total después.',
  },
  linear: {
    fn: 'linear', type: 'V', label: 'Lineal con indiferencia', xl: 'Lineal', q: true, p: true, s: false,
    formula: 'P(d) = 0 si d ≤ q;  P(d) = (d − q) ÷ (p − q) si q < d < p;  P(d) = 1 si d ≥ p',
    desc: 'Indiferente hasta q, crece en línea recta entre q y p y es total desde p.',
  },
  gaussian: {
    fn: 'gaussian', type: 'VI', label: 'Gaussiana', xl: 'Gaussiana', q: false, p: false, s: true,
    formula: 'P(d) = 0 si d ≤ 0;  P(d) = 1 − exp(−d² ÷ (2σ²)) si d > 0',
    desc: 'Curva suave sin saltos; σ marca la escala (entre q y p en las otras funciones).',
  },
};

export const isPrometheeFn = (x: unknown): x is PrometheeFn => typeof x === 'string' && (PROMETHEE_FNS as string[]).includes(x);

/** P(d) para la función `fn` con umbrales q, p y σ = s (d ya en dirección «mayor es mejor»). */
export function prefFn(fn: PrometheeFn, d: number, q: number, p: number, s: number): number {
  if (!(d > 0)) return 0;
  switch (fn) {
    case 'usual': return 1;
    case 'ushape': return d > q ? 1 : 0;
    case 'vshape': return d >= p ? 1 : d / p;
    case 'level': return d <= q ? 0 : d <= p ? 0.5 : 1;
    case 'linear': {
      if (d <= q) return 0;
      if (d >= p) return 1;
      const span = p - q;
      return span === 0 ? 1 : (d - q) / span;
    }
    case 'gaussian': return 1 - Math.exp(-(d * d) / (2 * s * s));
  }
}

/** Función de Tipo III con umbrales q y p (la que usaba la plataforma): 0 si d ≤ q, 1 si d ≥ p, lineal entre medio. */
export function pref3(d: number, q: number, p: number): number {
  if (d <= q) return 0;
  if (d >= p) return 1;
  const span = p - q;
  return span === 0 ? 1 : (d - q) / span;
}

/** Valores por defecto de cada umbral, como fracción del rango R del criterio (el rango de los datos, o 1 si es 0). Tipo III y V
 * conservan p = R (lo de siempre; q = 0). */
export const PROMETHEE_DEFAULTS: Record<PrometheeFn, { q: number; p: number; s: number }> = {
  usual: { q: 0, p: 1, s: 0.5 },
  ushape: { q: 0.25, p: 1, s: 0.5 },
  vshape: { q: 0, p: 1, s: 0.5 },
  level: { q: 0.1, p: 0.5, s: 0.5 },
  linear: { q: 0, p: 1, s: 0.5 },
  gaussian: { q: 0, p: 1, s: 0.5 },
};

export type ResolvedPref = {
  fn: PrometheeFn;
  q: number; p: number; s: number;
  /** Rango (máx − mín) de los datos del criterio, o 1 si es 0: referencia de los valores por defecto. */
  range: number;
  /** true si el criterio trae una configuración guardada (fn o algún umbral); false = lo de siempre (Tipo III, p = rango). */
  custom: boolean;
  /** Umbral que el usuario dejó vacío y tomó su valor por defecto. */
  defaulted: { q: boolean; p: boolean; s: boolean };
  /** Problemas de validación (el cálculo usa ya los valores corregidos). */
  issues: string[];
};

const okNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Resuelve la configuración de un criterio con el rango R de sus datos. Valida: q ≥ 0, p > 0, σ > 0 y q ≤ p (en las funciones que
 * usan q y p). Un valor inválido cae al valor por defecto y q > p se corrige a q = p; en ambos casos se anota en `issues`. */
export function resolvePref(spec: PrometheeCriterionConfig | undefined, rangeRaw: number): ResolvedPref {
  const range = rangeRaw > 0 && Number.isFinite(rangeRaw) ? rangeRaw : 1;
  const fn = spec && isPrometheeFn(spec.fn) ? spec.fn : DEFAULT_PROMETHEE_FN;
  const info = PROMETHEE_FN_INFO[fn], def = PROMETHEE_DEFAULTS[fn];
  const issues: string[] = [];
  const pick = (v: unknown, used: boolean, ok: (x: number) => boolean, dflt: number, name: string, rule: string) => {
    if (!used || v == null) return { v: dflt, defaulted: true };
    if (!okNum(v) || !ok(v)) { issues.push(`${name} ${rule}: se usa el valor por defecto`); return { v: dflt, defaulted: true }; }
    return { v, defaulted: false };
  };
  const qr = pick(spec?.q, info.q, (x) => x >= 0, def.q * range, 'q', 'debe ser mayor o igual a 0');
  const pr = pick(spec?.p, info.p, (x) => x > 0, def.p * range, 'p', 'debe ser mayor que 0');
  const sr = pick(spec?.s, info.s, (x) => x > 0, def.s * range, 'σ', 'debe ser mayor que 0');
  let q = info.q ? qr.v : 0;
  const p = info.p ? pr.v : def.p * range;
  const s = sr.v;
  if (info.q && info.p && q > p) { issues.push(`q (${q}) no puede ser mayor que p (${p}): se usa q = p`); q = p; }
  const custom = !!spec && (spec.fn !== DEFAULT_PROMETHEE_FN || okNum(spec.q) || okNum(spec.p) || okNum(spec.s));
  return { fn, q, p, s, range, custom, defaulted: { q: qr.defaulted, p: pr.defaulted, s: sr.defaulted }, issues };
}

/** Validación para la interfaz, con mensajes que explican qué corregir. Devuelve un mensaje por campo con problema. */
export function validatePrefSpec(spec: PrometheeCriterionConfig | undefined): { q?: string; p?: string; s?: string } {
  const out: { q?: string; p?: string; s?: string } = {};
  if (!spec) return out;
  const info = PROMETHEE_FN_INFO[isPrometheeFn(spec.fn) ? spec.fn : DEFAULT_PROMETHEE_FN];
  if (info.q && spec.q != null && (!okNum(spec.q) || spec.q < 0)) out.q = 'q debe ser un número mayor o igual a 0.';
  if (info.p && spec.p != null && (!okNum(spec.p) || spec.p <= 0)) out.p = 'p debe ser un número mayor que 0.';
  if (info.s && spec.s != null && (!okNum(spec.s) || spec.s <= 0)) out.s = 'σ debe ser un número mayor que 0.';
  if (!out.q && !out.p && info.q && info.p && okNum(spec.q) && okNum(spec.p) && spec.q > spec.p) {
    out.q = `q no puede ser mayor que p (${spec.p}). Baja q o sube p.`;
  }
  return out;
}

/** Sanea lo que llega de la base o de un respaldo: descarta funciones desconocidas y umbrales no numéricos; no inventa nada. */
export function sanitizePrometheeConfig(x: unknown): Record<string, PrometheeCriterionConfig> | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const out: Record<string, PrometheeCriterionConfig> = {};
  for (const [id, raw] of Object.entries(x as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (!isPrometheeFn(r.fn)) continue;
    const c: PrometheeCriterionConfig = { fn: r.fn };
    if (okNum(r.q) && r.q >= 0) c.q = r.q;
    if (okNum(r.p) && r.p > 0) c.p = r.p;
    if (okNum(r.s) && r.s > 0) c.s = r.s;
    out[id] = c;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Puntos (d, P) de la curva para dibujarla: vértices exactos (con los saltos verticales) en [−dom, dom]. */
export function curvePoints(fn: PrometheeFn, q: number, p: number, s: number, dom: number): [number, number][] {
  const pts: [number, number][] = [[-dom, 0]];
  switch (fn) {
    case 'usual': pts.push([0, 0], [0, 1]); break;
    case 'ushape': pts.push([Math.min(q, dom), 0]); if (q < dom) pts.push([q, 1]); break;
    case 'vshape': pts.push([0, 0]); if (p < dom) pts.push([p, 1]); break;
    case 'level':
      pts.push([Math.min(q, dom), 0]);
      if (q < dom) { pts.push([q, 0.5], [Math.min(p, dom), 0.5]); if (p < dom) pts.push([p, 1]); }
      break;
    case 'linear': pts.push([Math.min(q, dom), 0]); if (p < dom) pts.push([p, 1]); break;
    case 'gaussian':
      pts.push([0, 0]);
      for (let k = 1; k <= 48; k++) { const d = (dom * k) / 48; pts.push([d, prefFn('gaussian', d, 0, 0, s)]); }
      return pts;
  }
  pts.push([dom, prefFn(fn, dom, q, p, s)]);
  return pts;
}

/** Texto corto de la configuración de un criterio, p. ej. «lineal con indiferencia (q = 2, p = 20)». */
export function describePref(r: Pick<ResolvedPref, 'fn' | 'q' | 'p' | 's' | 'defaulted'>, fmt: (x: number) => string = (x) => String(Number(x.toPrecision(6)))): string {
  const info = PROMETHEE_FN_INFO[r.fn];
  const parts: string[] = [];
  if (info.q) parts.push(`q = ${fmt(r.q)}`);
  if (info.p) parts.push(`p = ${fmt(r.p)}`);
  if (info.s) parts.push(`σ = ${fmt(r.s)}`);
  return `${info.label.toLowerCase()} (Tipo ${info.type}${parts.length ? '; ' + parts.join(', ') : ''})`;
}
