/** Grilla de análisis de un proyecto espacial: se define a partir de un rectángulo lon/lat y una
 * resolución en metros, en el UTM de la zona (distancias y áreas en metros de verdad). Puro. */
import { projector, utmCrsFor, type Transform } from './crs.ts';
import type { GeoGrid } from '../types.ts';

export type Bounds = { west: number; south: number; east: number; north: number };

/** Tope de píxeles: cada capa Float32 pesa 4 B/píxel sin comprimir y el geovisor evalúa todo en el
 * navegador. 1.5 M ≈ 1220×1220. */
export const MAX_PIXELS = 1_500_000;

const NICE_RES = [1, 2, 5, 10, 20, 25, 30, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 25000, 50000, 100000];

function utmExtent(b: Bounds, crs: string): { xmin: number; xmax: number; ymin: number; ymax: number } {
  const f = projector('EPSG:4326', crs);
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  const N = 8;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      if (i > 0 && i < N && j > 0 && j < N) continue;
      const [x, y] = f(b.west + ((b.east - b.west) * i) / N, b.south + ((b.north - b.south) * j) / N);
      xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
    }
  }
  return { xmin, xmax, ymin, ymax };
}

/** Mensaje en español si el rectángulo no sirve para una grilla, o `null`. UTM no está definido en los polos. */
export function boundsIssue(b: Bounds): string | null {
  if (![b.west, b.south, b.east, b.north].every(Number.isFinite)) return 'Faltan coordenadas del área de estudio.';
  if (b.west < -180 || b.east > 180 || b.south < -84 || b.north > 84) return 'Las coordenadas deben estar entre -180° y 180° de longitud y entre -84° y 84° de latitud.';
  if (b.east <= b.west || b.north <= b.south) return 'El rectángulo no es válido: el este debe ser mayor que el oeste y el norte mayor que el sur.';
  if (b.east - b.west > 30) return 'El área abarca más de 30° de longitud: la proyección UTM de una sola zona distorsionaría distancias y áreas. Usa un área más pequeña.';
  return null;
}

/** Aviso (no error) si el ancho en longitud hace que una sola zona UTM distorsione de forma apreciable. */
export function boundsWarning(b: Bounds): string | null {
  if (boundsIssue(b)) return null;
  const w = b.east - b.west;
  if (w <= 12) return null;
  const k = 0.9996 * (1 + Math.pow((w / 2) * (Math.PI / 180) * Math.cos((Math.max(Math.abs(b.south), Math.abs(b.north)) * Math.PI) / 180), 2) / 2);
  return `El área abarca ${w.toFixed(0)}° de longitud: en los bordes las distancias y áreas de la zona UTM se desvían ~${Math.abs((k - 1) * 100).toFixed(1)} %. Para un análisis fino usa un área más angosta.`;
}

export function gridFromBounds(b: Bounds, resM: number): GeoGrid {
  const issue = boundsIssue(b);
  if (issue) throw new Error(issue);
  if (!(resM > 0)) throw new Error('La resolución debe ser mayor que 0 metros.');
  const crs = utmCrsFor((b.west + b.east) / 2, (b.south + b.north) / 2);
  const { xmin, xmax, ymin, ymax } = utmExtent(b, crs);
  const width = Math.max(1, Math.ceil((xmax - xmin) / resM));
  const height = Math.max(1, Math.ceil((ymax - ymin) / resM));
  const transform: Transform = [resM, 0, xmin, 0, -resM, ymax];
  return { crs, width, height, resM, haPerPixel: (resM * resM) / 10000, transform };
}

/** Píxeles que tendría la grilla con esa resolución (sin construirla). */
export function estimatePixels(b: Bounds, resM: number): number {
  if (boundsIssue(b) || !(resM > 0)) return 0;
  const crs = utmCrsFor((b.west + b.east) / 2, (b.south + b.north) / 2);
  const { xmin, xmax, ymin, ymax } = utmExtent(b, crs);
  return Math.ceil((xmax - xmin) / resM) * Math.ceil((ymax - ymin) / resM);
}

/** La resolución "redonda" más fina que deja la grilla por debajo de `targetPx` píxeles. */
export function suggestRes(b: Bounds, targetPx = 500_000): number {
  if (boundsIssue(b)) return 250;
  for (const r of NICE_RES) if (estimatePixels(b, r) <= targetPx) return r;
  return NICE_RES[NICE_RES.length - 1];
}

/** Extensión lon/lat de la grilla (muestreando los bordes: el UTM inclinado no es un rectángulo). */
export function gridBoundsLonLat(g: GeoGrid): Bounds {
  const f = projector(g.crs, 'EPSG:4326');
  const [a, b, c, d, e, ff] = g.transform;
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  const N = 12;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      if (i > 0 && i < N && j > 0 && j < N) continue;
      const col = (g.width * i) / N, row = (g.height * j) / N;
      const [lon, lat] = f(a * col + b * row + c, d * col + e * row + ff);
      west = Math.min(west, lon); east = Math.max(east, lon); south = Math.min(south, lat); north = Math.max(north, lat);
    }
  }
  return { west, south, east, north };
}

/** Une dos extensiones (para tomar el área de estudio de los archivos que se van cargando). */
export function unionBounds(a: Bounds | null, b: Bounds): Bounds {
  if (!a) return { ...b };
  return { west: Math.min(a.west, b.west), south: Math.min(a.south, b.south), east: Math.max(a.east, b.east), north: Math.max(a.north, b.north) };
}

export function padBounds(b: Bounds, frac: number): Bounds {
  const dx = (b.east - b.west) * frac, dy = (b.north - b.south) * frac;
  return { west: b.west - dx, east: b.east + dx, south: Math.max(-89.9, b.south - dy), north: Math.min(89.9, b.north + dy) };
}
