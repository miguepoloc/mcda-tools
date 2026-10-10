/** Puntos con ranking del geovisor: lista de puntos del usuario (`geo.points`), su evaluación con el MISMO cálculo que la
 * celda del mapa (`pointEval.ts`) y el orden por índice. Puro — ver `scripts/check-geo-points.ts`.
 *
 * Reglas del ranking (decididas por el docente):
 *  - Orden descendente por índice (0–100, el valor que muestra el mapa); en riesgo el puesto 1 es el MAYOR riesgo,
 *    en aptitud el más apto. Empates con ranking de competencia (1, 2, 2, 4).
 *  - Los puntos que no se pueden evaluar (excluido, fuera del área, sin dato) van al final, SIN puesto y sin índice:
 *    nunca como 0 %.
 *  - Un veto es un punto evaluado: en aptitud su índice es 0 (último puesto) y en riesgo 100 (primero); se rotula
 *    «Vetada» / «Condición crítica». */
import { lonLatToPixel } from './crs.ts';
import type { GeoData } from './data.ts';
import { DIR_TEXT } from './classes.ts';
import { evaluateOnePoint, type PointEval, type PointRow, type PointStatus } from './pointEval.ts';
import type { CriterionRule, Direction } from './suitability.ts';

export const MAX_POINTS = 300;

export type GeoPoint = { id: string; name: string; lat: number; lon: number };

export type RankedPoint = GeoPoint & {
  status: PointStatus;
  /** Índice 0–100 (null si no se pudo evaluar). */
  pct: number | null;
  /** Código de clase del mapa (1..N, `CLASS_VETO`); 0 si no se pudo evaluar. */
  cls: number;
  vetoed: boolean;
  /** Puesto (ranking de competencia); null si no se pudo evaluar. */
  rank: number | null;
  /** Texto de la clase (o del estado cuando no se pudo evaluar). */
  label: string;
  /** Desglose por criterio del MISMO `PointEval` (solo en puntos evaluados); lo usa la publicación. */
  rows?: PointRow[];
};

export const STATUS_LABEL: Record<Exclude<PointStatus, 'ok'>, string> = {
  excluded: 'Excluido',
  outside: 'Fuera del área evaluada',
  nodata: 'Sin dato',
};

/** Encabezado de la columna de orden según la dirección del índice. */
export const rankHeading = (d: Direction) => (d === 'risk' ? 'Mayor riesgo primero' : 'Más apto primero');

/** Evalúa un punto lon/lat: la celda que lo contiene (la misma que elige el clic del mapa) o «fuera del área». */
export function evaluateLonLat(data: GeoData, rules: CriterionRule[], cfg: { breaks: number[]; direction?: Direction }, p: { lat: number; lon: number }): PointEval {
  const outside: PointEval = { status: 'outside', s: null, pct: null, cls: 0, vetoed: false, lat: p.lat, lon: p.lon, rows: [] };
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return outside;
  const [c, r] = lonLatToPixel(p.lon, p.lat, data.grid.transform, data.grid.crs);
  const col = Math.round(c), row = Math.round(r);
  if (!(col >= 0 && row >= 0 && col < data.grid.width && row < data.grid.height)) return outside;
  return { ...evaluateOnePoint(data, rules, cfg, { col, row }), lat: p.lat, lon: p.lon };
}

/** Evalúa y ordena. `evalOne` evalúa un punto (ver `evaluateLonLat`); `labelOf(cls)` da el nombre de la clase. */
export function rankPoints(points: GeoPoint[], evalOne: (p: GeoPoint) => PointEval, labelOf: (cls: number) => string): RankedPoint[] {
  const rows: RankedPoint[] = points.map((p) => {
    const e = evalOne(p);
    const ok = e.status === 'ok' && e.pct !== null;
    const status: PointStatus = ok ? 'ok' : e.status === 'ok' ? 'nodata' : e.status;
    return {
      ...p, status, pct: ok ? e.pct : null, cls: ok ? e.cls : 0, vetoed: ok && e.vetoed,
      rank: null, label: status === 'ok' ? labelOf(e.cls) : STATUS_LABEL[status],
      ...(ok && e.rows.length ? { rows: e.rows } : {}),
    };
  });
  const evaluated = rows.filter((r) => r.status === 'ok');
  // `sort` es estable: a igual índice se conserva el orden en que el usuario los agregó.
  evaluated.sort((a, b) => (b.pct as number) - (a.pct as number));
  for (const r of evaluated) r.rank = 1 + evaluated.filter((o) => (o.pct as number) > (r.pct as number)).length;
  return [...evaluated, ...rows.filter((r) => r.status !== 'ok')];
}

/** Nombre por defecto «Punto N»: N sigue al mayor «Punto N» existente (no se repite tras borrar). */
export function nextPointName(points: { name: string }[], offset = 0): string {
  let max = 0;
  for (const p of points) { const m = /^Punto (\d+)$/.exec(p.name.trim()); if (m) max = Math.max(max, Number(m[1])); }
  return `Punto ${max + 1 + offset}`;
}

let seq = 0;
export function newPointId(): string {
  seq++;
  return `p${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Coordenadas con 6 decimales (~0.1 m): suficiente y estable para firmas y archivos. */
export const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

const csvCell = (s: string) => (/[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Texto de estado del punto: evaluado, vetado (según la dirección) o el motivo por el que no se evaluó. */
export function pointState(r: Pick<RankedPoint, 'status' | 'vetoed'>, direction: Direction): string {
  return r.status === 'ok' ? (r.vetoed ? DIR_TEXT[direction].critical : 'Evaluado') : STATUS_LABEL[r.status];
}

/** CSV del ranking: puesto vacío para los no evaluados; índice vacío (nunca 0) cuando no hay. */
export function rankingCsv(rows: RankedPoint[], direction: Direction): string {
  const lines = [`puesto,nombre,lat,lon,${DIR_TEXT[direction].csvIdx},clase,estado`];
  for (const r of rows) {
    lines.push([r.rank ?? '', csvCell(r.name), r.lat.toFixed(6), r.lon.toFixed(6), r.pct ?? '', r.status === 'ok' ? csvCell(r.label) : '', csvCell(pointState(r, direction))].join(','));
  }
  return lines.join('\n') + '\n';
}

/** Línea del desglose publicado: SOLO el nombre del criterio (el mismo de `meta.weights`), su valor ya con unidad y los
 * números del aporte. Nunca la clave de la capa ni su archivo. `suit`/`weight`/`contrib` son null si el criterio no tenía
 * dato en ese punto (no vota). `veto` solo aparece cuando es true. */
export type PublishedRow = { label: string; value: string; suit: number | null; weight: number | null; contrib: number | null; veto?: boolean };

/** Punto tal como viaja en la publicación (`meta.points`). Sin ids: la vista pública no los necesita. `rows` es aditivo y
 * opcional: publicaciones anteriores no lo traen y los puntos sin evaluar tampoco. */
export type PublishedPoint = { name: string; lat: number; lon: number; pct: number | null; cls: number; status: PointStatus; rank: number | null; rows?: PublishedRow[] };

/** Tope de puntos con desglose en la publicación (por tamaño del meta: ver informe). Los mejor ubicados primero. */
export const MAX_PUBLISHED_BREAKDOWN = 100;

const round3 = (v: number) => Math.round(v * 1e3) / 1e3;

/** `nameOfKey` traduce la clave interna de la capa al nombre del CRITERIO; sin traducción la línea se rotula «Criterio N»
 * (nunca el nombre de la capa o del archivo). Con `breakdown: false` no viaja ningún desglose. */
export function toPublishedPoints(rows: RankedPoint[], opts: { breakdown?: boolean; nameOfKey?: (key: string) => string | undefined } = {}): PublishedPoint[] {
  const withRows = opts.breakdown === false ? 0 : MAX_PUBLISHED_BREAKDOWN;
  let n = 0;
  return rows.map((r) => {
    const base: PublishedPoint = { name: r.name, lat: round6(r.lat), lon: round6(r.lon), pct: r.pct, cls: r.cls, status: r.status, rank: r.rank };
    if (r.status !== 'ok' || !r.rows?.length || n >= withRows) return base;
    n++;
    base.rows = r.rows.map((x, i): PublishedRow => ({
      label: (x.key !== undefined ? opts.nameOfKey?.(x.key) : undefined) ?? `Criterio ${i + 1}`,
      value: x.value,
      suit: x.suit == null ? null : round3(x.suit),
      weight: x.weight == null ? null : round3(x.weight),
      contrib: x.part == null ? null : round3(x.part),
      ...(x.veto ? { veto: true } : {}),
    }));
    return base;
  });
}

/** Normaliza un desglose publicado (viene de `meta`, o sea de fuera): descarta lo mal formado y no deja pasar claves extra. */
export function sanitizePublishedRows(rows: unknown): PublishedRow[] {
  if (!Array.isArray(rows)) return [];
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const out: PublishedRow[] = [];
  for (const x of rows as Partial<PublishedRow>[]) {
    if (!x || typeof x.label !== 'string' || typeof x.value !== 'string') continue;
    const suit = num(x.suit), weight = num(x.weight), contrib = num(x.contrib);
    const votes = suit !== null && weight !== null && contrib !== null;
    out.push({ label: x.label, value: x.value, suit: votes ? suit : null, weight: votes ? weight : null, contrib: votes ? contrib : null, ...(x.veto === true ? { veto: true } : {}) });
  }
  return out;
}

/** Desglose publicado → `PointRow[]` para `PointFicha`. */
export function publishedRowsToPointRows(rows: unknown): PointRow[] {
  return sanitizePublishedRows(rows).map((x) => ({
    label: x.label, value: x.value, veto: x.veto === true, suit: x.suit, weight: x.weight, part: x.contrib,
    contrib: x.suit !== null && x.weight !== null ? `${x.suit.toFixed(2)} × ${x.weight.toFixed(2)}${x.veto ? ' · VETO' : ''}` : 'no vota',
  }));
}

/** Normaliza lo guardado en `geo.points` (jsonb: puede venir con basura o pasar del tope). */
export function sanitizePoints(raw: unknown): GeoPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: GeoPoint[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    const o = x as Partial<GeoPoint> | null;
    if (!o || typeof o.lat !== 'number' || typeof o.lon !== 'number' || !Number.isFinite(o.lat) || !Number.isFinite(o.lon)) continue;
    if (Math.abs(o.lat) > 90 || Math.abs(o.lon) > 180) continue;
    let id = typeof o.id === 'string' && o.id ? o.id : newPointId();
    if (seen.has(id)) id = newPointId();
    seen.add(id);
    out.push({ id, name: typeof o.name === 'string' ? o.name : '', lat: o.lat, lon: o.lon });
    if (out.length >= MAX_POINTS) break;
  }
  return out;
}
