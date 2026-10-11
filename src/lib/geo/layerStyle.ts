/** Estilo por capa del geovisor (G3): color, rampa, opacidad, grosor, borde y visibilidad de cada capa de entrada o
 * vector, guardado en `geo.styles[id]` (campo aditivo y opcional: un proyecto sin él se ve exactamente igual).
 *
 * `id` es el mismo de la lista de capas: `result`, `l:<clave de capa ráster>` o `v:<clave de vector>`.
 * Puro y sin DOM. Lo que llega de la base de datos NUNCA se asume válido: `sanitizeStyle` acota todo. */
import type { GeoLayerStyle } from '../types.ts';
import { LAYER_RAMP_KEYS, hexToRgb, layerRampStops, stopsCss, type LayerRampKey } from './paint.ts';

export type LayerStyle = GeoLayerStyle;
export type LayerStyles = Record<string, LayerStyle>;
export type VisEntry = { on: boolean; op: number };

export const OPACITY_MIN = 0, OPACITY_MAX = 1;
export const WEIGHT_MIN = 0.5, WEIGHT_MAX = 8;
export const MAX_STYLES = 200;

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** `result`, `l:…` y `v:…`. Las capas virtuales (`parcels`, `diff`) dependen de cálculos de la sesión y no se guardan. */
export const isStyleId = (id: string) => id === 'result' || /^[lv]:[^\s]+$/.test(id);

/** Estilo limpio: solo campos conocidos y válidos, números acotados. */
export function sanitizeStyle(raw: unknown): LayerStyle {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: LayerStyle = {};
  if (typeof r.on === 'boolean') out.on = r.on;
  const op = num(r.op); if (op !== undefined) out.op = clamp(op, OPACITY_MIN, OPACITY_MAX);
  if (typeof r.ramp === 'string' && r.ramp !== 'auto' && (LAYER_RAMP_KEYS as readonly string[]).includes(r.ramp)) out.ramp = r.ramp as LayerStyle['ramp'];
  if (r.rev === true) out.rev = true;
  if (typeof r.color === 'string' && HEX6.test(r.color)) out.color = r.color;
  if (typeof r.border === 'string' && HEX6.test(r.border)) out.border = r.border;
  const w = num(r.weight); if (w !== undefined) out.weight = clamp(w, WEIGHT_MIN, WEIGHT_MAX);
  const f = num(r.fillOp); if (f !== undefined) out.fillOp = clamp(f, 0, 1);
  return out;
}
const isEmpty = (s: LayerStyle) => Object.keys(s).length === 0;

/** Mapa de estilos limpio (ids válidos y tope de entradas); las entradas vacías se descartan. */
export function sanitizeStyles(raw: unknown): LayerStyles {
  const out: LayerStyles = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_STYLES) break;
    if (!isStyleId(id)) continue;
    const s = sanitizeStyle(v);
    if (!isEmpty(s)) out[id] = s;
  }
  return out;
}

/** Aplica un cambio a un estilo (inmutable). Un campo `undefined` en `patch` se quita (y `rev: false`); si el estilo queda
 * vacío, la entrada desaparece: así «Restablecer» deja el proyecto idéntico al original. Devuelve `undefined` si ya
 * no queda ningún estilo (el campo `geo.styles` se elimina). */
export function patchStyle(styles: LayerStyles | undefined, id: string, patch: Partial<Record<keyof LayerStyle, unknown>>): LayerStyles | undefined {
  if (!isStyleId(id)) return styles;
  const cur: Record<string, unknown> = { ...(styles?.[id] ?? {}) };
  for (const [k, v] of Object.entries(patch)) { if (v === undefined || (k === 'rev' && v === false)) delete cur[k]; else cur[k] = v; }
  const next = { ...(styles ?? {}) };
  const clean = sanitizeStyle(cur);
  if (isEmpty(clean)) delete next[id]; else next[id] = clean;
  return Object.keys(next).length ? next : undefined;
}

/** Quita lo visual de un estilo (rampa, colores, grosor…) conservando visibilidad y opacidad. */
export function resetLook(styles: LayerStyles | undefined, id: string): LayerStyles | undefined {
  return patchStyle(styles, id, { ramp: undefined, rev: undefined, color: undefined, border: undefined, weight: undefined, fillOp: undefined });
}

/** Visibilidad y opacidad guardadas, como el `VisState` del panel (solo entradas con AMBOS valores). */
export function visFromStyles(styles: LayerStyles | undefined): Record<string, VisEntry> {
  const out: Record<string, VisEntry> = {};
  for (const [id, s] of Object.entries(styles ?? {})) if (typeof s.on === 'boolean' && typeof s.op === 'number') out[id] = { on: s.on, op: s.op };
  return out;
}

/** Fusiona la visibilidad/opacidad de la sesión dentro de los estilos guardados (conserva lo visual). Devuelve el mismo
 * objeto si no cambió nada, para no disparar un guardado de más. */
export function mergeVis(styles: LayerStyles | undefined, vis: Record<string, VisEntry>): LayerStyles | undefined {
  let next = styles;
  for (const [id, v] of Object.entries(vis)) {
    if (!isStyleId(id)) continue;
    const op = Math.round(v.op * 100) / 100;
    const cur = next?.[id];
    if (cur && cur.on === v.on && cur.op === op) continue;
    next = patchStyle(next, id, { on: v.on, op });
  }
  return next;
}

/** Paradas elegidas para una capa (null = la de siempre). */
export const styleStops = (s: LayerStyle | undefined) => layerRampStops(s?.ramp as LayerRampKey | undefined, !!s?.rev);
/** `linear-gradient` de la rampa elegida, o `fallback` si la capa usa la de siempre. */
export function styleRampCss(s: LayerStyle | undefined, fallback: string): string {
  const st = styleStops(s);
  return st ? stopsCss(st) : fallback;
}
/** Color plano (RGB) de una capa de exclusión/área: el elegido o `def`. */
export const styleRgb = (s: LayerStyle | undefined, def: [number, number, number]): [number, number, number] => (s?.color ? hexToRgb(s.color) : def);

/** Estilo efectivo de un vector (contorno y relleno): lo elegido, luego lo propio de la capa, luego el valor por defecto. */
export type VectorLook = { stroke: string; fill: string; weight: number; fillOpacity: number };
export function vectorLook(s: LayerStyle | undefined, base: { color: string; weight?: number; fillOpacity?: number }): VectorLook {
  const fill = s?.color ?? base.color;
  return { fill, stroke: s?.border ?? s?.color ?? base.color, weight: s?.weight ?? base.weight ?? 1.5, fillOpacity: s?.fillOp ?? base.fillOpacity ?? 0.12 };
}
