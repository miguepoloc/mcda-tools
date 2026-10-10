/** Estadística zonal: por cada polígono de referencia («zona»), cuánto vale el índice y cómo se reparte entre las clases
 * del modelo. Una sola pasada O(celdas) sobre la grilla ya evaluada (`pct`, `cls`, `mask`) y un índice de zona por celda
 * (`buildZoneGrid`, que reutiliza `burn`: una celda pertenece a la zona que contiene su CENTRO; si dos zonas se
 * superponen gana la última del archivo). Puro — ver `scripts/check-geo-zonal.ts`.
 *
 * Reglas (decididas por el docente):
 *  - Solo cuentan las celdas evaluadas (máscara válida y con índice): exclusión y «fuera del área» nunca son 0 %.
 *  - Una zona sin celdas evaluadas se rotula «Sin área evaluada»: sin índice ni porcentajes (nunca 0 %).
 *  - Las celdas vetadas cuentan en la clase extrema de la dirección (igual que `classStats`).
 *  - Un punto cuenta en la zona de su celda; un punto fuera de la grilla o fuera del área de estudio no cuenta en ninguna. */
import { lonLatToPixel } from './crs.ts';
import { DIR_TEXT } from './classes.ts';
import { MASK_EXCLUDED, MASK_NODATA, CLASS_VETO, type Direction } from './suitability.ts';
import { burn, type FC } from './vector.ts';
import type { GeoGrid } from '../types.ts';

/** Más polígonos que esto: la tabla y el mapa se vuelven pesados; la interfaz lo advierte (no lo impide). */
export const ZONE_WARN = 200;
export const NO_AREA = 'Sin área evaluada';

export type ZoneGrid = {
  /** Índice del elemento (de `fc.features`) que contiene el centro de cada celda; -1 = ninguno. */
  zone: Int32Array;
  /** Nombre de cada elemento (`Zona N` si el atributo falta o está vacío). */
  names: string[];
  count: number;
};

export function zoneName(f: { properties?: Record<string, unknown> | null }, i: number, nameField?: string): string {
  const v = nameField ? f.properties?.[nameField] : undefined;
  const t = v === undefined || v === null ? '' : String(v).trim();
  return t || `Zona ${i + 1}`;
}

/** Asigna a cada celda de la grilla el índice de la zona que la contiene (-1 = ninguna). */
export function buildZoneGrid(fc: FC, grid: GeoGrid, nameField?: string): ZoneGrid {
  const feats = fc.features.map((f, i) => ({ type: 'Feature' as const, geometry: f.geometry, properties: { __z: i } }));
  const raw = burn({ type: 'FeatureCollection', features: feats }, grid, { kind: 'attr', field: '__z' });
  const zone = new Int32Array(raw.length);
  for (let i = 0; i < raw.length; i++) zone[i] = Number.isNaN(raw[i]) ? -1 : Math.round(raw[i]);
  return { zone, names: fc.features.map((f, i) => zoneName(f, i, nameField)), count: fc.features.length };
}

/** Índice de la celda (fila * ancho + columna) que contiene el punto, o null si cae fuera de la grilla.
 * Misma regla que `evaluateLonLat` (redondeo al centro de celda más cercano). */
export function cellOf(grid: GeoGrid, lon: number, lat: number): number | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const [c, r] = lonLatToPixel(lon, lat, grid.transform, grid.crs);
  const col = Math.round(c), row = Math.round(r);
  return col >= 0 && row >= 0 && col < grid.width && row < grid.height ? row * grid.width + col : null;
}

export type ZoneStat = {
  index: number; name: string;
  /** Celdas evaluadas y su superficie. 0 = «Sin área evaluada». */
  cells: number; ha: number;
  /** Hectáreas de la zona en exclusión (informativo; no entra en los porcentajes). */
  exclHa: number;
  /** Índice medio 0–100 de las celdas evaluadas; null sin área evaluada. */
  meanPct: number | null;
  /** Hectáreas y % del área evaluada de la zona por clase (de menor a mayor índice; % null sin área evaluada). */
  classHa: number[];
  classPct: (number | null)[];
  /** Puntos del proyecto cuya celda es de esta zona (y está dentro del área de estudio). */
  points: number;
};

export type ZonalInput = {
  zones: ZoneGrid;
  pct: Uint8Array; cls: Uint8Array; mask: Uint8Array;
  haPerPixel: number; nClasses: number; direction: Direction;
  /** Celda de cada punto del proyecto (`cellOf`); null = fuera de la grilla. */
  pointCells?: (number | null)[];
};

export function zonalStats(inp: ZonalInput): ZoneStat[] {
  const { zones, pct, cls, mask, nClasses: N } = inp;
  const Z = zones.count;
  const cells = new Float64Array(Z), sum = new Float64Array(Z), excl = new Float64Array(Z);
  const byClass = new Float64Array(Z * N);
  const extreme = inp.direction === 'risk' ? N - 1 : 0;
  for (let i = 0; i < zones.zone.length; i++) {
    const z = zones.zone[i];
    if (z < 0 || z >= Z) continue;
    if (mask[i] === MASK_NODATA) continue;
    if (mask[i] === MASK_EXCLUDED) { excl[z]++; continue; }
    if (pct[i] === 255) continue;
    const c = cls[i];
    const k = c === CLASS_VETO ? extreme : c >= 1 && c <= N ? c - 1 : 0;
    cells[z]++; sum[z] += pct[i]; byClass[z * N + k]++;
  }
  const pts = new Int32Array(Z);
  for (const cell of inp.pointCells ?? []) {
    if (cell === null || cell < 0 || cell >= zones.zone.length) continue;
    const z = zones.zone[cell];
    if (z >= 0 && z < Z && mask[cell] !== MASK_NODATA) pts[z]++;
  }
  const ha = inp.haPerPixel;
  return Array.from({ length: Z }, (_, z) => {
    const n = cells[z];
    return {
      index: z, name: zones.names[z], cells: n, ha: n * ha, exclHa: excl[z] * ha,
      meanPct: n ? sum[z] / n : null,
      classHa: Array.from({ length: N }, (_, k) => byClass[z * N + k] * ha),
      classPct: Array.from({ length: N }, (_, k) => (n ? (100 * byClass[z * N + k]) / n : null)),
      points: pts[z],
    };
  });
}

/** Comparador con los valores ausentes (null) SIEMPRE al final, en cualquier sentido. Desempata por nombre. */
export function compareNullsLast(a: number | string | null, b: number | string | null, dir: 'asc' | 'desc', nameA = '', nameB = ''): number {
  if (a === null && b === null) return nameA.localeCompare(nameB, 'es');
  if (a === null) return 1;
  if (b === null) return -1;
  const c = typeof a === 'string' || typeof b === 'string' ? String(a).localeCompare(String(b), 'es') : a - b;
  return (dir === 'asc' ? c : -c) || nameA.localeCompare(nameB, 'es');
}

/** Orden por defecto: índice medio descendente (en riesgo = «mayor riesgo primero»; en aptitud = «más apto primero»). */
export const defaultZoneOrder = (rows: ZoneStat[]): ZoneStat[] => rows.slice().sort((a, b) => compareNullsLast(a.meanPct, b.meanPct, 'desc', a.name, b.name));

export const zoneOrderHeading = (d: Direction) => (d === 'risk' ? 'Mayor riesgo primero' : 'Más apto primero');

const csvCell = (s: string) => (/[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const num = (v: number | null, d: number) => (v === null ? '' : v.toFixed(d));

/** CSV (coma, punto decimal): una fila por zona, en el orden dado; celdas vacías (nunca 0) cuando no hay área evaluada. */
export function zonesCsv(rows: ZoneStat[], classNames: string[], direction: Direction): string {
  const head = ['zona', DIR_TEXT[direction].csvIdx + '_medio', 'ha_evaluadas', 'ha_excluidas', ...classNames.map((n) => csvCell(`pct_${n}`)), 'puntos', 'estado'];
  const lines = [head.join(',')];
  for (const r of rows) {
    lines.push([
      csvCell(r.name), num(r.meanPct, 1), r.cells ? r.ha.toFixed(2) : '', r.exclHa.toFixed(2),
      ...r.classPct.map((p) => num(p, 1)), r.points, r.cells ? 'Evaluada' : NO_AREA,
    ].join(','));
  }
  return lines.join('\n') + '\n';
}
