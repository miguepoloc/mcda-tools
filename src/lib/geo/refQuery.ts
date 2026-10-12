/** Consulta de atributos de las capas de referencia al hacer clic en el mapa del dueño (G8). Puro: sin React ni E/S.
 *
 * Los atributos NUNCA se publican (ver `refPublic.ts`): esto solo corre en el navegador del dueño, sobre el
 * FeatureCollection que él mismo guardó. */
import type { FC, Geom } from './vector.ts';

export type RefQueryLayer = { id: string; name: string; fc: FC; /** Atributo con el nombre de la entidad (opcional). */ nameField?: string };

export type RefHit = {
  layerId: string; layerName: string;
  kind: 'polygon' | 'line' | 'point';
  /** Índice del elemento dentro de la capa. */
  index: number;
  /** Nombre de la entidad (atributo de nombre, o «Elemento N»). */
  title: string;
  /** Pares atributo / valor (texto), con tope. */
  rows: [string, string][];
  /** Atributos que no cupieron en `rows`. */
  more: number;
};

export const REF_QUERY_LIMITS = { maxHits: 6, maxRows: 8, valueLen: 80 };

/** Tolerancia (grados) equivalente a `px` píxeles de pantalla en el zoom dado (mapa Web Mercator de teselas de 256 px). */
export function tolDegAtZoom(zoom: number, px = 10): number {
  const z = Number.isFinite(zoom) ? Math.max(0, Math.min(24, zoom)) : 10;
  return (px * 360) / (256 * 2 ** z);
}

type Pos = number[];

function inRing(x: number, y: number, ring: Pos[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Dentro del exterior y fuera de los huecos. */
function inPolygon(x: number, y: number, rings: Pos[][]): boolean {
  if (!Array.isArray(rings) || !rings.length || !inRing(x, y, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) if (inRing(x, y, rings[i])) return false;
  return true;
}
/** Distancia (grados, con la longitud escalada por cos(lat)) del punto al segmento a–b. */
function segDist(px: number, py: number, a: Pos, b: Pos, k: number): number {
  const ax = a[0] * k, bx = b[0] * k, x = px * k;
  const dx = bx - ax, dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (py - a[1]) * dy) / L));
  return Math.hypot(x - (ax + t * dx), py - (a[1] + t * dy));
}
function nearLine(x: number, y: number, pts: Pos[], tol: number, k: number): boolean {
  for (let i = 1; i < pts.length; i++) if (segDist(x, y, pts[i - 1], pts[i], k) <= tol) return true;
  return false;
}

/** ¿El clic cae sobre la geometría? Polígono: dentro. Línea/punto: a menos de `tol` grados. */
function hitKind(g: Geom | null, x: number, y: number, tol: number, k: number, depth = 0): RefHit['kind'] | null {
  if (!g || depth > 3) return null;
  const c = g.coordinates as unknown;
  switch (g.type) {
    case 'Polygon': return inPolygon(x, y, c as Pos[][]) ? 'polygon' : null;
    case 'MultiPolygon': return (c as Pos[][][]).some((p) => inPolygon(x, y, p)) ? 'polygon' : null;
    case 'LineString': return nearLine(x, y, c as Pos[], tol, k) ? 'line' : null;
    case 'MultiLineString': return (c as Pos[][]).some((l) => nearLine(x, y, l, tol, k)) ? 'line' : null;
    case 'Point': return Math.hypot(((c as Pos)[0] - x) * k, (c as Pos)[1] - y) <= tol ? 'point' : null;
    case 'MultiPoint': return (c as Pos[]).some((p) => Math.hypot((p[0] - x) * k, p[1] - y) <= tol) ? 'point' : null;
    case 'GeometryCollection': {
      for (const q of g.geometries ?? []) { const h = hitKind(q, x, y, tol, k, depth + 1); if (h) return h; }
      return null;
    }
  }
  return null;
}

const NAME_RE = /(^|[^a-z])(nombre|name|nom|label|title|titulo)([^a-z]|$)/i;
const fmt = (v: unknown): string => {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e4) / 1e4);
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  return String(v).replace(/\s+/g, ' ').trim().slice(0, REF_QUERY_LIMITS.valueLen);
};

/** Entidades bajo el clic en las capas dadas (las visibles): los polígonos que lo contienen y las líneas/puntos a menos
 * de `tolDeg`. Primero puntos y líneas (más específicos), luego polígonos; como mucho `maxHits`. */
export function queryRefs(layers: RefQueryLayer[], lat: number, lon: number, tolDeg: number): RefHit[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  const k = Math.cos((lat * Math.PI) / 180) || 1;
  const hits: RefHit[] = [];
  for (const L of layers) {
    L.fc.features.forEach((f, index) => {
      const kind = hitKind(f.geometry, lon, lat, tolDeg, k);
      if (!kind) return;
      const props = Object.entries(f.properties ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== '');
      const nameKey = (L.nameField && props.find(([key]) => key === L.nameField)?.[0]) || props.find(([key]) => NAME_RE.test(key))?.[0];
      const nameVal = nameKey ? props.find(([key]) => key === nameKey)?.[1] : undefined;
      const rest = props.filter(([key]) => key !== nameKey);
      hits.push({
        layerId: L.id, layerName: L.name, kind, index,
        title: nameVal !== undefined ? fmt(nameVal) : `Elemento ${index + 1}`,
        rows: rest.slice(0, REF_QUERY_LIMITS.maxRows).map(([key, v]) => [key.slice(0, 40), fmt(v)] as [string, string]),
        more: Math.max(0, rest.length - REF_QUERY_LIMITS.maxRows),
      });
    });
  }
  const order = { point: 0, line: 1, polygon: 2 } as const;
  return hits.sort((a, b) => order[a.kind] - order[b.kind]).slice(0, REF_QUERY_LIMITS.maxHits);
}
