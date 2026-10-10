/** Evaluación de UNA celda (el punto consultado): el mismo cálculo que `evaluateIndex` + `classify` (delega en `indexPixel`/`classOf`)
 * más el desglose por criterio para mostrarlo. Puro — ver `scripts/check-geo-points.ts`. */
import { pixelToLonLat } from './crs.ts';
import type { GeoData } from './data.ts';
import { suitability, vetoed } from './membership.ts';
import { classOf, CLASS_VETO, indexPixel, MASK_EXCLUDED, MASK_NODATA, usableRules, type CriterionRule, type Direction } from './suitability.ts';

/** `suit` = idoneidad 0–1 de la regla, `weight` = peso reescalado entre los criterios con dato y `part` = suit × weight (su aporte
 * al índice); los tres son null cuando el criterio no tiene dato (no vota). Aditivos: `contrib` sigue siendo el texto de siempre. */
export type PointRow = { label: string; value: string; contrib: string; veto: boolean; suit?: number | null; weight?: number | null; part?: number | null };
export type PointStatus = 'ok' | 'excluded' | 'outside' | 'nodata';
export type PointEval = {
  status: PointStatus;
  /** Índice 0–1 SIN redondear (null si el estado no es `ok`). */
  s: number | null;
  /** Índice 0–100 redondeado (el que muestra el mapa), null si no es `ok`. */
  pct: number | null;
  /** Código de clase (`evaluatePixel`): 0 si no es `ok`. */
  cls: number;
  vetoed: boolean;
  lat: number;
  lon: number;
  rows: PointRow[];
};

export function evaluateOnePoint(data: GeoData, allRules: CriterionRule[], cfg: { breaks: number[]; direction?: Direction }, sel: { col: number; row: number }): PointEval {
  const i = sel.row * data.grid.width + sel.col;
  const [lon, lat] = pixelToLonLat(sel.col, sel.row, data.grid.transform, data.grid.crs);
  const m = data.mask[i];
  const none = { s: null, pct: null, cls: 0, vetoed: false, lat, lon, rows: [] as PointRow[] };
  if (m === MASK_NODATA) return { status: 'outside', ...none };
  if (m === MASK_EXCLUDED) return { status: 'excluded', ...none };
  const rules = usableRules(data.layers, data.mask.length, allRules);
  const raw: Record<string, number> = {};
  for (const r of rules) raw[r.key] = data.layers[r.key][i];
  const px = indexPixel(raw, rules, m, cfg.direction ?? 'suitability');
  // Desglose: los criterios sin dato no votan y los pesos se reescalan entre los que sí (igual que `evaluatePixel`).
  const wUsed = rules.reduce((a, r) => (Number.isNaN(raw[r.key]) ? a : a + r.weight), 0);
  const rows = rules.map((r) => {
    const info = data.info[r.key];
    const x = raw[r.key];
    const s = suitability(x, r.fn);
    const veto = vetoed(x, r.veto);
    const wn = wUsed > 0 ? r.weight / wUsed : 0;
    const value = Number.isNaN(x) ? 'sin dato' : `${Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(2)} ${info?.unit ?? ''}`.trim();
    const votes = !Number.isNaN(x);
    return {
      label: info?.label ?? r.key, value, contrib: votes ? `${s.toFixed(2)} × ${wn.toFixed(2)}${veto ? ' · VETO' : ''}` : 'no vota', veto,
      suit: votes ? s : null, weight: votes ? wn : null, part: votes ? s * wn : null,
    };
  });
  if (Number.isNaN(px.s)) return { status: 'nodata', ...none, rows };
  const cls = px.vetoed ? CLASS_VETO : classOf(px.s, cfg.breaks);
  return { status: 'ok', s: px.s, pct: Math.round(px.s * 100), cls, vetoed: px.vetoed, lat, lon, rows };
}
