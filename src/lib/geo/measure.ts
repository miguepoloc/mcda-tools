/** Regla del Geovisor: distancias y áreas sobre el elipsoide WGS84 (nunca planares en grados). Puro (sin DOM).
 *
 * - Distancia: haversine sobre la esfera de radio medio 6 371 008,8 m (error < 0,5 % frente a la geodésica del
 *   elipsoide; sobra para medir en un mapa).
 * - Área: proyección cilíndrica equivalente (latitud autálica, Snyder) del elipsoide WGS84, de modo que el
 *   área del polígono es exacta para el elipsoide y no depende de la latitud como lo haría un cálculo en grados.
 *   Cada arista se densifica sobre el círculo máximo (≤ 10 km) antes de integrar.
 * - Limitación: un polígono que rodea un polo no se mide bien (no hay caso de uso en un mapa de estudio). */
import type { FC, Feature } from './vector.ts';

export type LL = { lat: number; lon: number };

export const R_MEAN = 6371008.8;
export const WGS84_A = 6378137;
export const WGS84_F = 1 / 298.257223563;
const E2 = WGS84_F * (2 - WGS84_F);
const E = Math.sqrt(E2);
/** Tope de vértices: una medición a mano nunca los necesita y acota el coste del área. */
export const MAX_VERTICES = 500;
const RAD = Math.PI / 180;

/** Longitud llevada a [-180, 180). */
export const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

export function haversine(a: LL, b: LL): number {
  const p1 = a.lat * RAD, p2 = b.lat * RAD;
  const dp = p2 - p1, dl = (b.lon - a.lon) * RAD;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R_MEAN * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Largo de la línea quebrada; con `closed` suma también el tramo de cierre. */
export function pathLength(pts: LL[], closed = false): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += haversine(pts[i - 1], pts[i]);
  if (closed && pts.length > 2) s += haversine(pts[pts.length - 1], pts[0]);
  return s;
}

/** Función q de la latitud autálica: dA = (a²/2) dq dλ sobre el elipsoide. */
function qAuth(phi: number): number {
  const s = Math.sin(phi);
  return (1 - E2) * (s / (1 - E2 * s * s) - Math.log((1 - E * s) / (1 + E * s)) / (2 * E));
}

type Vec = [number, number, number];
const toVec = (p: LL): Vec => { const f = p.lat * RAD, l = p.lon * RAD; return [Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f)]; };

/** Puntos intermedios (con el inicial, sin el final) sobre el círculo máximo de a a b, a ≤ ~10 km entre sí. */
function densify(a: LL, b: LL): LL[] {
  const d = haversine(a, b);
  const n = Math.min(500, Math.max(1, Math.ceil(d / 10_000)));
  if (n === 1) return [a];
  const va = toVec(a), vb = toVec(b);
  const w = d / R_MEAN;
  const sw = Math.sin(w);
  const out: LL[] = [a];
  if (sw < 1e-12) return out;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const ka = Math.sin((1 - t) * w) / sw, kb = Math.sin(t * w) / sw;
    const x = ka * va[0] + kb * vb[0], y = ka * va[1] + kb * vb[1], z = ka * va[2] + kb * vb[2];
    out.push({ lat: Math.atan2(z, Math.hypot(x, y)) / RAD, lon: Math.atan2(y, x) / RAD });
  }
  return out;
}

/** Área (m²) del polígono de vértices `pts` (anillo implícitamente cerrado), en el elipsoide WGS84. */
export function polygonArea(pts: LL[]): number {
  if (pts.length < 3) return 0;
  const ring: LL[] = [];
  for (let i = 0; i < pts.length; i++) ring.push(...densify(pts[i], pts[(i + 1) % pts.length]));
  // longitudes «desenvueltas» respecto al primer punto (cruce del antimeridiano)
  let acc = 0, prev = ring[0].lon;
  const xs: number[] = [], qs: number[] = [];
  for (const p of ring) {
    let d = p.lon - prev;
    d = ((((d + 180) % 360) + 360) % 360) - 180;
    acc += d; prev = p.lon;
    xs.push(acc * RAD);
    qs.push(qAuth(p.lat * RAD));
  }
  // relativo a q0 para conservar precisión
  const q0 = qs[0];
  let sum = 0;
  for (let i = 0; i < xs.length; i++) {
    const j = (i + 1) % xs.length;
    sum += xs[i] * (qs[j] - q0) - xs[j] * (qs[i] - q0);
  }
  return (WGS84_A * WGS84_A / 2) * Math.abs(sum) / 2;
}

/** ¿Alguna arista cruza a otra no contigua? (aproximado, en lon/lat; basta para avisar que el área es neta.) */
export function selfIntersects(pts: LL[]): boolean {
  const n = pts.length;
  if (n < 4) return false;
  const o = (a: LL, b: LL, c: LL) => (b.lon - a.lon) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lon - a.lon);
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const c = pts[j], d = pts[(j + 1) % n];
      if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- estado de la herramienta (reductor puro)
export type MeasureState = { pts: LL[]; closed: boolean };
export const EMPTY: MeasureState = { pts: [], closed: false };

const validLL = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 1080;

/** Añade un vértice. Se ignoran: datos no válidos, polígono ya cerrado, tope alcanzado y un punto idéntico al anterior
 * (el doble clic del mapa llega como dos clics). */
export function addVertex(s: MeasureState, lat: number, lon: number): MeasureState {
  if (s.closed || s.pts.length >= MAX_VERTICES || !validLL(lat, lon)) return s;
  const p = { lat, lon: wrapLon(lon) };
  const last = s.pts[s.pts.length - 1];
  if (last && haversine(last, p) < 0.01) return s;
  return { pts: [...s.pts, p], closed: false };
}

/** Quita el último vértice; si el polígono estaba cerrado, solo lo reabre. */
export function undo(s: MeasureState): MeasureState {
  if (s.closed) return { pts: s.pts, closed: false };
  return s.pts.length ? { pts: s.pts.slice(0, -1), closed: false } : s;
}

export function close(s: MeasureState): MeasureState {
  return s.pts.length >= 3 && !s.closed ? { pts: s.pts, closed: true } : s;
}

export const clear = (): MeasureState => EMPTY;

/** Quita el vértice i (desde la lista); con menos de 3 el polígono se reabre. */
export function removeAt(s: MeasureState, i: number): MeasureState {
  if (i < 0 || i >= s.pts.length) return s;
  const pts = s.pts.filter((_, k) => k !== i);
  return { pts, closed: s.closed && pts.length >= 3 };
}

export type Leg = { from: number; to: number; m: number; cum: number };
export type Measurement = {
  n: number; legs: Leg[];
  /** último tramo (parcial) o null */ last: Leg | null;
  /** largo total de la línea (con el tramo de cierre si está cerrada) */ total: number;
  area: number | null; perimeter: number | null; crosses: boolean;
};

export function measure(s: MeasureState): Measurement {
  const legs: Leg[] = [];
  let cum = 0;
  for (let i = 1; i < s.pts.length; i++) {
    const m = haversine(s.pts[i - 1], s.pts[i]);
    cum += m;
    legs.push({ from: i - 1, to: i, m, cum });
  }
  let total = cum;
  if (s.closed && s.pts.length > 2) {
    const m = haversine(s.pts[s.pts.length - 1], s.pts[0]);
    total += m;
    legs.push({ from: s.pts.length - 1, to: 0, m, cum: total });
  }
  return {
    n: s.pts.length, legs, last: legs.length ? legs[legs.length - 1] : null, total,
    area: s.closed && s.pts.length >= 3 ? polygonArea(s.pts) : null,
    perimeter: s.closed && s.pts.length >= 3 ? total : null,
    crosses: s.closed ? selfIntersects(s.pts) : false,
  };
}

/** Geometría para dibujar sobre el mapa: vértices (con su número como propiedad) y línea o polígono. */
export function toFeatureCollection(s: MeasureState): FC {
  const features: Feature[] = [];
  const c = s.pts.map((p) => [p.lon, p.lat]);
  if (s.closed && c.length >= 3) features.push({ type: 'Feature', properties: { kind: 'area' }, geometry: { type: 'Polygon', coordinates: [[...c, c[0]]] } });
  else if (c.length >= 2) features.push({ type: 'Feature', properties: { kind: 'line' }, geometry: { type: 'LineString', coordinates: c } });
  c.forEach((p, i) => features.push({ type: 'Feature', properties: { kind: 'vertex', n: i + 1 }, geometry: { type: 'Point', coordinates: p } }));
  return { type: 'FeatureCollection', features };
}

// ---------------------------------------------------------------- formato
const nf = (v: number, d: number) => v.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: d });

/** «845 m» / «12,35 km». */
export function fmtLength(m: number): string {
  if (!Number.isFinite(m) || m < 0) return '—';
  if (m < 1000) return `${nf(m, m < 10 ? 1 : 0)} m`;
  const km = m / 1000;
  return `${nf(km, km < 100 ? 2 : 1)} km`;
}

/** Unidad principal según el tamaño: m² (< 1 ha), ha (< 1 km²) o km². */
export function fmtArea(m2: number): string {
  if (!Number.isFinite(m2) || m2 < 0) return '—';
  if (m2 < 1e4) return `${nf(m2, 0)} m²`;
  if (m2 < 1e6) return `${nf(m2 / 1e4, 2)} ha`;
  return `${nf(m2 / 1e6, 2)} km²`;
}

/** Las tres unidades, para quien necesita comparar o copiar. */
export function areaUnits(m2: number): { m2: string; ha: string; km2: string } {
  return { m2: `${nf(m2, 0)} m²`, ha: `${nf(m2 / 1e4, 2)} ha`, km2: `${nf(m2 / 1e6, m2 < 1e6 ? 4 : 2)} km²` };
}

/** Frase completa del resultado (es lo que se anuncia en la región aria-live). */
export function summaryText(s: MeasureState): string {
  const m = measure(s);
  if (m.n === 0) return 'Sin vértices: haz clic en el mapa para empezar.';
  if (m.n === 1) return '1 vértice. Añade otro para medir una distancia.';
  if (s.closed && m.area !== null) {
    const u = areaUnits(m.area);
    return `Polígono de ${m.n} vértices. Área: ${fmtArea(m.area)} (${[u.m2, u.ha, u.km2].filter((t) => t !== fmtArea(m.area as number)).join(' · ')}). Perímetro: ${fmtLength(m.perimeter ?? m.total)}.`
      + (m.crosses ? ' Aviso: los lados se cruzan, el área es neta.' : '');
  }
  return `${m.n} vértices. Último tramo: ${fmtLength(m.last?.m ?? 0)}. Total: ${fmtLength(m.total)}.`;
}

export const fmtCoord =(p: LL) => `${p.lat.toFixed(5)}°, ${p.lon.toFixed(5)}°`;
