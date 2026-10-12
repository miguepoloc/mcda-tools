/** Polígonos de referencia: el FeatureCollection original de un vector de polígonos, guardado como
 * `<key>.geojson.gz` en el bucket `geo-layers` (ver `store.ts`). Se dibuja sobre el mapa (sin rasterizar) y sirve de
 * «zonas» para la estadística zonal; NO entra al modelo. Puro salvo `uploadRef`/`downloadRef`. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadGz, gunzip, gzip, uploadGz } from './store.ts';
import type { FC, Feature, Geom } from './vector.ts';
import { simplifyLine } from './refPublic.ts';

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
type Ring = number[][];

function cleanRing(r: unknown): Ring | null {
  if (!Array.isArray(r)) return null;
  const out: Ring = [];
  for (const p of r) {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    out.push([round6(p[0] as number), round6(p[1] as number)]);
  }
  return out.length >= 4 ? out : null;
}
function cleanPolygon(c: unknown): Ring[] | null {
  if (!Array.isArray(c) || !cleanRing(c[0])) return null; // sin anillo exterior válido no hay polígono
  return c.map(cleanRing).filter((r): r is Ring => !!r);
}

function collectPolygons(g: Geom | null, out: Ring[][]) {
  if (!g) return;
  if (g.type === 'Polygon') { const p = cleanPolygon(g.coordinates); if (p) out.push(p); }
  else if (g.type === 'MultiPolygon') { for (const c of (g.coordinates as unknown[]) ?? []) { const p = cleanPolygon(c); if (p) out.push(p); } }
  else if (g.type === 'GeometryCollection') g.geometries?.forEach((x) => collectPolygons(x, out));
}

/** Atributos que se conservan: solo valores simples (texto corto, número, booleano); el resto no viaja ni se guarda. */
function cleanProps(p: Record<string, unknown> | null | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(p ?? {})) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 200);
  }
  return out;
}

/** Deja solo los polígonos (Polygon/MultiPolygon), con coordenadas a 6 decimales y atributos simples. Un elemento con
 * varias partes pasa a MultiPolygon. `dropped` = elementos que no tenían ningún polígono (puntos, líneas, vacíos). */
export function polygonsOnly(fc: FC): { fc: FC; dropped: number } {
  const features: Feature[] = [];
  let dropped = 0;
  for (const f of fc.features) {
    const polys: Ring[][] = [];
    collectPolygons(f.geometry, polys);
    if (!polys.length) { dropped++; continue; }
    features.push({
      type: 'Feature', properties: cleanProps(f.properties),
      geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys },
    });
  }
  return { fc: { type: 'FeatureCollection', features }, dropped };
}

/** Topes de lo que se guarda de una capa de referencia con líneas/puntos (el archivo del dueño; la vista pública tiene
 * sus propios topes en `refPublic.ts`). */
export const REF_PERSIST = {
  /** Vértices de líneas y puntos; por encima se simplifican las líneas (Douglas–Peucker, tolerancia creciente). */
  maxVertices: 300_000,
  /** Elementos por capa; el resto se omite (primero se conservan polígonos, luego líneas, luego puntos). */
  maxFeatures: 20_000,
  /** Tamaño del JSON antes de gzip; por encima se acortan los textos de los atributos. */
  maxJsonBytes: 12_000_000,
};

export type RefCleanReport = {
  /** Elementos conservados por tipo. */
  polygons: number; lines: number; points: number;
  /** Elementos sin ninguna geometría útil (vacíos o nulos). */
  dropped: number;
  /** Elementos que no cupieron por el tope de elementos. */
  truncated: number;
  /** Tolerancia de simplificación aplicada a las líneas, en metros aproximados (0 = ninguna). */
  tolM: number;
  /** true = hubo que acortar textos de atributos para caber. */
  propsTrimmed: boolean;
};

function collectParts(g: Geom | null, polys: Ring[][], lines: Ring[], pts: number[][], depth = 0) {
  if (!g || depth > 3) return;
  const c = g.coordinates as unknown;
  const line = (raw: unknown) => {
    if (!Array.isArray(raw)) return;
    const out: Ring = [];
    for (const p of raw) {
      if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
      const q = [round6(p[0] as number), round6(p[1] as number)];
      const l = out[out.length - 1];
      if (!l || l[0] !== q[0] || l[1] !== q[1]) out.push(q);
    }
    if (out.length >= 2) lines.push(out);
  };
  const point = (p: unknown) => { if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) pts.push([round6(p[0] as number), round6(p[1] as number)]); };
  switch (g.type) {
    case 'Polygon': case 'MultiPolygon': collectPolygons(g, polys); break;
    case 'LineString': line(c); break;
    case 'MultiLineString': if (Array.isArray(c)) c.forEach(line); break;
    case 'Point': point(c); break;
    case 'MultiPoint': if (Array.isArray(c)) c.forEach(point); break;
    case 'GeometryCollection': g.geometries?.forEach((x) => collectParts(x, polys, lines, pts, depth + 1)); break;
  }
}

/** Limpia una capa de referencia conservando polígonos, líneas (vías, ríos) y puntos. Los elementos salen SIEMPRE en el
 * orden polígonos → líneas → puntos, así los índices de los polígonos no cambian aunque haya líneas detrás (la
 * estadística zonal usa solo los polígonos: ver `polygonView`). Un elemento con polígonos y líneas (colección) se parte
 * en un elemento por tipo, con los mismos atributos. Topes en `REF_PERSIST`; todo recorte queda en el informe. */
export function referenceFeatures(fc: FC, limits: typeof REF_PERSIST = REF_PERSIST): { fc: FC; report: RefCleanReport } {
  const P: Feature[] = [], L: Feature[] = [], T: Feature[] = [];
  let dropped = 0;
  for (const f of fc.features) {
    const polys: Ring[][] = [], lines: Ring[] = [], pts: number[][] = [];
    collectParts(f.geometry, polys, lines, pts);
    if (!polys.length && !lines.length && !pts.length) { dropped++; continue; }
    const properties = cleanProps(f.properties);
    if (polys.length) P.push({ type: 'Feature', properties, geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys } });
    if (lines.length) L.push({ type: 'Feature', properties: { ...properties }, geometry: lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines } });
    if (pts.length) T.push({ type: 'Feature', properties: { ...properties }, geometry: pts.length === 1 ? { type: 'Point', coordinates: pts[0] } : { type: 'MultiPoint', coordinates: pts } });
  }
  const all = [...P, ...L, ...T];
  const kept = all.length > limits.maxFeatures ? all.slice(0, limits.maxFeatures) : all;
  const truncated = all.length - kept.length;
  const nP = Math.min(P.length, kept.length), nL = Math.min(L.length, Math.max(0, kept.length - nP)), nT = kept.length - nP - nL;

  // Vértices de líneas y puntos: sobre el tope se simplifican las líneas con tolerancia creciente (~1 m, 2 m, 4 m…).
  const verts = (f: Feature) => {
    const g = f.geometry; if (!g) return 0;
    const c = g.coordinates as unknown;
    if (g.type === 'LineString') return (c as number[][]).length;
    if (g.type === 'MultiLineString') return (c as number[][][]).reduce((a, r) => a + r.length, 0);
    if (g.type === 'MultiPoint') return (c as number[][]).length;
    return 1;
  };
  let tolDeg = 0;
  const lineFeats = kept.slice(nP, nP + nL), ptFeats = kept.slice(nP + nL);
  const total = () => lineFeats.reduce((a, f) => a + verts(f), 0) + ptFeats.reduce((a, f) => a + verts(f), 0);
  if (total() > limits.maxVertices) {
    const origin = lineFeats.map((f) => f.geometry);
    for (tolDeg = 1e-5; tolDeg <= 0.02; tolDeg *= 2) {
      lineFeats.forEach((f, i) => {
        const g = origin[i] as Geom;
        f.geometry = g.type === 'LineString'
          ? { type: 'LineString', coordinates: simplifyLine(g.coordinates as number[][], tolDeg) }
          : { type: 'MultiLineString', coordinates: (g.coordinates as number[][][]).map((r) => simplifyLine(r, tolDeg)) };
      });
      if (total() <= limits.maxVertices) break;
    }
  }

  // Tamaño del JSON: si pasa el tope, textos de atributos más cortos.
  let propsTrimmed = false;
  const out: FC = { type: 'FeatureCollection', features: kept };
  if (JSON.stringify(out).length > limits.maxJsonBytes) {
    propsTrimmed = true;
    for (const f of kept) for (const [k, v] of Object.entries(f.properties ?? {})) if (typeof v === 'string' && v.length > 40) (f.properties as Record<string, unknown>)[k] = v.slice(0, 40);
  }
  return {
    fc: out,
    report: { polygons: nP, lines: nL, points: nT, dropped, truncated, tolM: tolDeg > 0 ? Math.round(tolDeg * 111_320) : 0, propsTrimmed },
  };
}

/** Aviso corto (o '') con lo que se recortó al guardar la referencia. */
export function referenceNotes(r: RefCleanReport): string[] {
  const n: string[] = [];
  if (r.dropped) n.push(`${r.dropped} elementos sin geometría se omitieron`);
  if (r.truncated) n.push(`se guardaron solo los primeros ${REF_PERSIST.maxFeatures} elementos (${r.truncated} no cupieron)`);
  if (r.tolM) n.push(`las líneas se simplificaron (tolerancia ≈ ${r.tolM} m) para no pasar de ${REF_PERSIST.maxVertices.toLocaleString('es')} vértices`);
  if (r.propsTrimmed) n.push('los textos largos de los atributos se acortaron a 40 caracteres');
  return n;
}

/** Descripción corta del contenido, p. ej. «12 polígonos, 340 líneas». */
export function referenceSummary(r: Pick<RefCleanReport, 'polygons' | 'lines' | 'points'>): string {
  const parts: string[] = [];
  if (r.polygons) parts.push(`${r.polygons} polígono${r.polygons === 1 ? '' : 's'}`);
  if (r.lines) parts.push(`${r.lines} línea${r.lines === 1 ? '' : 's'}`);
  if (r.points) parts.push(`${r.points} punto${r.points === 1 ? '' : 's'}`);
  return parts.join(', ');
}

const isPoly = (f: Feature) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon';
const polyCache = new WeakMap<FC, FC>();
/** Solo los polígonos de la capa, en el mismo orden y con los mismos índices que en la capa completa (por eso las líneas
 * y los puntos se guardan después). Las zonas, la población y el coroplético usan esta vista. Devuelve el mismo objeto
 * si la capa ya es solo de polígonos (referencias guardadas antes de las líneas). */
export function polygonView(fc: FC): FC {
  if (fc.features.every(isPoly)) return fc;
  let v = polyCache.get(fc);
  if (!v) { v = { type: 'FeatureCollection', features: fc.features.filter(isPoly) }; polyCache.set(fc, v); }
  return v;
}

export function parseFC(text: string): FC {
  const j = JSON.parse(text) as { type?: string; features?: unknown };
  if (j?.type !== 'FeatureCollection' || !Array.isArray(j.features)) throw new Error('El archivo guardado no es un FeatureCollection.');
  return j as FC;
}

/** FeatureCollection -> JSON -> gzip (lo que se sube a Storage). */
export async function encodeFC(fc: FC): Promise<Uint8Array> {
  return gzip(new TextEncoder().encode(JSON.stringify(fc)));
}

/** Inverso de `encodeFC`. Lanza si el contenido no es un FeatureCollection. */
export async function decodeFC(gz: Uint8Array): Promise<FC> {
  return parseFC(new TextDecoder().decode(await gunzip(gz)));
}

export async function uploadRef(sb: SupabaseClient, path: string, fc: FC): Promise<number> {
  return uploadGz(sb, path, await encodeFC(fc));
}

export async function downloadRef(sb: SupabaseClient, path: string): Promise<FC> {
  return parseFC(new TextDecoder().decode(await downloadGz(sb, path)));
}

/** Atributos candidatos a «nombre de la zona», con el que parece más probable primero (nombre/comuna/…, y valores únicos). */
export function nameFields(fc: FC): string[] {
  const seen = new Map<string, { n: number; distinct: Set<string> }>();
  for (const f of fc.features.slice(0, 500)) {
    for (const [k, v] of Object.entries(f.properties ?? {})) {
      if (v === null || v === undefined || v === '') continue;
      const cur = seen.get(k) ?? { n: 0, distinct: new Set<string>() };
      cur.n++; cur.distinct.add(String(v));
      seen.set(k, cur);
    }
  }
  const pref = /(^|[^a-z])(nombre|name|comuna|barrio|zona|sector|municipio|localidad|label)([^a-z]|$)/i;
  const score = (k: string, r: { n: number; distinct: Set<string> }) => (pref.test(k) ? 2 : 0) + (r.distinct.size === r.n ? 1 : 0);
  return [...seen.entries()].sort((a, b) => score(b[0], b[1]) - score(a[0], a[1])).map(([k]) => k);
}

type WithZonal = { zonal?: { layer: string; nameField?: string; popLayer?: string; popField?: string } };

/** Al borrar una capa: si era la de zonas se quita la selección; si era la de población solo se quita esa parte. */
export function zonalAfterDrop<T extends WithZonal>(g: T, key: string): T {
  const z = g.zonal;
  if (!z || (z.layer !== key && z.popLayer !== key)) return g;
  const out = { ...g };
  if (z.layer === key) delete out.zonal;
  else out.zonal = { layer: z.layer, ...(z.nameField ? { nameField: z.nameField } : {}) };
  return out;
}

/** Al reemplazar una capa (mismo archivo): la selección de zonas sigue a la capa nueva. */
export function zonalAfterReplace<T extends WithZonal>(g: T, oldKey: string, newKey: string): T {
  const z = g.zonal;
  if (!z || (z.layer !== oldKey && z.popLayer !== oldKey)) return g;
  return { ...g, zonal: { ...z, ...(z.layer === oldKey ? { layer: newKey } : {}), ...(z.popLayer === oldKey ? { popLayer: newKey } : {}) } };
}
