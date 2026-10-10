/** Polígonos de referencia: el FeatureCollection original de un vector de polígonos, guardado como
 * `<key>.geojson.gz` en el bucket `geo-layers` (ver `store.ts`). Se dibuja sobre el mapa (sin rasterizar) y sirve de
 * «zonas» para la estadística zonal; NO entra al modelo. Puro salvo `uploadRef`/`downloadRef`. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadGz, gunzip, gzip, uploadGz } from './store.ts';
import type { FC, Feature, Geom } from './vector.ts';

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
