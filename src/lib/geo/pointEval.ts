/** Evaluación de UNA celda (el punto consultado): el mismo cálculo que `evaluateGrid` (delega en `evaluatePixel`)
 * más el desglose por criterio para mostrarlo. Puro — ver `scripts/check-geo-points.ts`. */
import { pixelToLonLat } from './crs.ts';
import type { GeoData } from './data.ts';
import { suitability, vetoed } from './membership.ts';
import { evaluatePixel, MASK_EXCLUDED, MASK_NODATA, usableRules, type ClassThresholds, type CriterionRule } from './suitability.ts';

export type PointRow = { label: string; value: string; contrib: string; veto: boolean };
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

export function evaluateOnePoint(data: GeoData, allRules: CriterionRule[], thr: ClassThresholds, sel: { col: number; row: number }): PointEval {
  const i = sel.row * data.grid.width + sel.col;
  const [lon, lat] = pixelToLonLat(sel.col, sel.row, data.grid.transform, data.grid.crs);
  const m = data.mask[i];
  const none = { s: null, pct: null, cls: 0, vetoed: false, lat, lon, rows: [] as PointRow[] };
  if (m === MASK_NODATA) return { status: 'outside', ...none };
  if (m === MASK_EXCLUDED) return { status: 'excluded', ...none };
  const rules = usableRules(data.layers, data.mask.length, allRules);
  const raw: Record<string, number> = {};
  for (const r of rules) raw[r.key] = data.layers[r.key][i];
  const px = evaluatePixel(raw, rules, thr, m);
  // Desglose: los criterios sin dato no votan y los pesos se reescalan entre los que sí (igual que `evaluatePixel`).
  const wUsed = rules.reduce((a, r) => (Number.isNaN(raw[r.key]) ? a : a + r.weight), 0);
  const rows = rules.map((r) => {
    const info = data.info[r.key];
    const x = raw[r.key];
    const s = suitability(x, r.fn);
    const veto = vetoed(x, r.veto);
    const wn = wUsed > 0 ? r.weight / wUsed : 0;
    const value = Number.isNaN(x) ? 'sin dato' : `${Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(2)} ${info?.unit ?? ''}`.trim();
    return { label: info?.label ?? r.key, value, contrib: Number.isNaN(x) ? 'no vota' : `${s.toFixed(2)} × ${wn.toFixed(2)}${veto ? ' · VETO' : ''}`, veto };
  });
  if (Number.isNaN(px.s)) return { status: 'nodata', ...none, rows };
  return { status: 'ok', s: px.s, pct: Math.round(px.s * 100), cls: px.cls, vetoed: px.vetoed, lat, lon, rows };
}
