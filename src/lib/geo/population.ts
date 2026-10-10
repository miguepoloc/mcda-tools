/** Exposición de la población: cuántas personas quedan en cada clase del mapa. Cada polígono con población (p. ej. una
 * manzana) se asigna entera a la celda de su CENTROIDE. Es la elección que conserva el total: rasterizar con `burn`
 * muestrea el centro de cada celda y pierde los polígonos menores que una celda (las manzanas de ~50 m en una grilla de
 * 100 m), y repartir por intersección exigiría geometría que aquí no se hace. El costo: una manzana grande que cruza
 * varias celdas cuenta toda en una. Puro — ver `scripts/check-geo-population.ts`. */
import { cellOf, type ZoneGrid } from './zonal.ts';
import { CLASS_VETO, MASK_EXCLUDED, MASK_NODATA, type Direction } from './suitability.ts';
import type { FC, Geom } from './vector.ts';
import type { GeoGrid } from '../types.ts';

type Ring = number[][];

/** Área con signo y momento de primer orden del anillo (fórmula del zapato), en grados: basta para ubicar un centroide. */
function ringMoments(r: Ring): { a: number; cx: number; cy: number } {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < r.length - 1; i++) {
    const [x0, y0] = r[i], [x1, y1] = r[i + 1];
    const k = x0 * y1 - x1 * y0;
    a += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k;
  }
  return { a: a / 2, cx, cy };
}

/** Centroide (lon, lat) de un polígono con huecos; null si no tiene vértices válidos. */
function polygonCentroid(rings: Ring[]): { c: [number, number]; area: number } | null {
  let A = 0, CX = 0, CY = 0;
  rings.forEach((r, i) => {
    if (!Array.isArray(r) || r.length < 3) return;
    const m = ringMoments(r);
    const sign = i === 0 ? 1 : -1; // el exterior suma y los huecos restan, sea cual sea el sentido del anillo
    const area = Math.abs(m.a);
    if (area === 0) return;
    // cx/cy están multiplicados por 6·a; el centroide del anillo es cx/(6a)
    A += sign * area;
    CX += sign * area * (m.cx / (6 * m.a));
    CY += sign * area * (m.cy / (6 * m.a));
  });
  if (A > 0) return { c: [CX / A, CY / A], area: A };
  // Degenerado (área 0): promedio de los vértices del anillo exterior.
  const ext = rings[0]?.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])) ?? [];
  if (!ext.length) return null;
  return { c: [ext.reduce((s, p) => s + p[0], 0) / ext.length, ext.reduce((s, p) => s + p[1], 0) / ext.length], area: 0 };
}

/** Centroide de un polígono o multipolígono (el de la parte de mayor área: así siempre cae en una parte real). */
export function geometryCentroid(g: Geom | null): [number, number] | null {
  if (!g) return null;
  let best: { c: [number, number]; area: number } | null = null;
  const consider = (rings: Ring[]) => { const r = polygonCentroid(rings); if (r && (!best || r.area > best.area)) best = r; };
  const walk = (x: Geom) => {
    if (x.type === 'Polygon') consider(x.coordinates as Ring[]);
    else if (x.type === 'MultiPolygon') for (const p of (x.coordinates as Ring[][]) ?? []) consider(p);
    else if (x.type === 'GeometryCollection') x.geometries?.forEach(walk);
  };
  walk(g);
  return (best as { c: [number, number] } | null)?.c ?? null;
}

export type PopPoint = { lon: number; lat: number; value: number; feature: number };

/** Población por polígono: valor numérico ≥ 0 del campo y centroide. `skipped` = elementos sin valor numérico válido o
 * sin geometría (no suman); `total` = suma de lo que sí entra. */
export function populationPoints(fc: FC, field: string): { pts: PopPoint[]; skipped: number; total: number } {
  const pts: PopPoint[] = [];
  let skipped = 0, total = 0;
  fc.features.forEach((f, i) => {
    const raw = f.properties?.[field];
    const v = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw.replace(',', '.')) : NaN;
    const c = geometryCentroid(f.geometry);
    if (!Number.isFinite(v) || v < 0 || !c) { skipped++; return; }
    pts.push({ lon: c[0], lat: c[1], value: v, feature: i });
    total += v;
  });
  return { pts, skipped, total };
}

export type PopBreakdown = {
  /** Personas por clase (de menor a mayor índice), solo en celdas evaluadas. */
  byClass: number[];
  /** Personas cuya celda es exclusión o no tiene dato. */
  notEvaluated: number;
};
export type PopExposure = PopBreakdown & {
  /** Todo lo asignado a alguna celda o fuera: `total = Σ byClass + notEvaluated + outside` (se conserva). */
  total: number;
  /** Personas cuyo centroide cae fuera de la grilla o del área de estudio. */
  outside: number;
  evaluated: number;
  /** Por zona (mismo orden que `zones.names`); vacío si no se pidieron zonas. Las personas fuera de toda zona no figuran aquí. */
  perZone: (PopBreakdown & { evaluated: number; extremePct: number | null })[];
  /** Índice de la clase «más extrema» de la dirección: riesgo = la más alta; aptitud = la menos apta (la más baja). */
  extremeClass: number;
};

export type ExposureInput = {
  pts: PopPoint[]; grid: GeoGrid;
  pct: Uint8Array; cls: Uint8Array; mask: Uint8Array;
  nClasses: number; direction: Direction;
  zones?: ZoneGrid | null;
};

export function exposure(inp: ExposureInput): PopExposure {
  const { nClasses: N, mask, pct, cls } = inp;
  const extreme = inp.direction === 'risk' ? N - 1 : 0;
  const Z = inp.zones?.count ?? 0;
  const byClass = new Array<number>(N).fill(0);
  const zBy = Array.from({ length: Z }, () => new Array<number>(N).fill(0));
  const zNot = new Array<number>(Z).fill(0);
  let notEvaluated = 0, outside = 0, total = 0;
  for (const p of inp.pts) {
    total += p.value;
    const cell = cellOf(inp.grid, p.lon, p.lat);
    if (cell === null || mask[cell] === MASK_NODATA) { outside += p.value; continue; }
    const z = inp.zones && Z ? inp.zones.zone[cell] : -1;
    if (mask[cell] === MASK_EXCLUDED || pct[cell] === 255) {
      notEvaluated += p.value;
      if (z >= 0 && z < Z) zNot[z] += p.value;
      continue;
    }
    const c = cls[cell];
    const k = c === CLASS_VETO ? extreme : c >= 1 && c <= N ? c - 1 : 0;
    byClass[k] += p.value;
    if (z >= 0 && z < Z) zBy[z][k] += p.value;
  }
  const evaluated = byClass.reduce((a, b) => a + b, 0);
  const perZone = zBy.map((b, z) => {
    const ev = b.reduce((a, x) => a + x, 0);
    return { byClass: b, notEvaluated: zNot[z], evaluated: ev, extremePct: ev > 0 ? (100 * b[extreme]) / ev : null };
  });
  return { total, byClass, notEvaluated, outside, evaluated, perZone, extremeClass: extreme };
}
