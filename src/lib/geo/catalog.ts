/** Catálogo de paquetes del docente: configuración en `geo_packs` + capas alineadas (Float32+gzip) en
 * el bucket PÚBLICO `geo-catalog`. Solo cliente. Un paquete se comporta como las capas propias pero de
 * solo lectura para el estudiante (`geo.packId = 'cat:<id>'`). */
import type { SupabaseClient } from '@supabase/supabase-js';
import { uid } from '../types.ts';
import type { Criterion, GeoConfig, GeoGrid, GeoLayerMeta } from '../types.ts';
import type { Example } from './examples.ts';
import { gunzip, gzip } from './store.ts';

export const CATALOG_BUCKET = 'geo-catalog';
export const CAT_PREFIX = 'cat:';

export type CatalogDef = { criteria: Criterion[]; geo: { grid: GeoGrid; layers: Record<string, GeoLayerMeta>; rules: GeoConfig['rules']; classes: GeoConfig['classes']; minPatchHa?: number } };
export type CatalogRow = { id: string; title: string; description: string; attribution: string; is_active: boolean; definition: CatalogDef; created_at?: string };

export async function listCatalog(sb: SupabaseClient): Promise<CatalogRow[]> {
  const { data, error } = await sb.from('geo_packs').select('id,title,description,attribution,is_active,definition,created_at').order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as CatalogRow[];
}

export async function getCatalogRow(sb: SupabaseClient, id: string): Promise<CatalogRow | null> {
  const { data } = await sb.from('geo_packs').select('id,title,description,attribution,is_active,definition').eq('id', id).maybeSingle();
  return (data as CatalogRow | null) ?? null;
}

/** Ejemplo listo para crear un proyecto: criterios con ids nuevos (las reglas se remapean). */
export function catalogExample(row: CatalogRow): Example {
  const remap: Record<string, string> = {};
  const criteria = row.definition.criteria.map((c) => { const id = uid('k'); remap[c.id] = id; return { ...c, id }; });
  const rules: GeoConfig['rules'] = {};
  for (const [cid, r] of Object.entries(row.definition.geo.rules)) if (remap[cid]) rules[remap[cid]] = r;
  return {
    id: CAT_PREFIX + row.id, source: 'catalog', label: row.title, hasData: true,
    blurb: row.description || 'Paquete del curso con datos ya preparados.',
    title: row.title, objective: '', criteria, geo: { packId: CAT_PREFIX + row.id, rules, classes: { ...row.definition.geo.classes } },
  };
}

export function publicUrl(sb: SupabaseClient, path: string): string {
  return sb.storage.from(CATALOG_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function loadCatalogLayer(sb: SupabaseClient, path: string): Promise<Float32Array> {
  const res = await fetch(publicUrl(sb, path));
  if (!res.ok) throw new Error(`No se pudo descargar la capa del catálogo (${res.status})`);
  const raw = await gunzip(new Uint8Array(await res.arrayBuffer()));
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

export type PublishInput = {
  id: string; title: string; description: string; attribution: string; userId: string;
  criteria: Criterion[]; geo: GeoConfig; layers: Record<string, Float32Array>;
  /** Licencia / condiciones de uso por capa (clave de capa → texto). */
  licenses?: Record<string, string>;
};

/** Copia las capas propias del docente al bucket del catálogo y registra (o reemplaza) el paquete. */
export async function publishToCatalog(sb: SupabaseClient, inp: PublishInput, onProgress?: (done: number, total: number) => void): Promise<void> {
  const grid = inp.geo.grid;
  if (!grid) throw new Error('El proyecto no tiene área de estudio.');
  const metas: Record<string, GeoLayerMeta> = {};
  const keys = Object.keys(inp.geo.layers ?? {}).filter((k) => inp.layers[k]);
  if (!keys.length) throw new Error('No hay capas para publicar.');
  let done = 0;
  for (const k of keys) {
    const arr = inp.layers[k];
    const gz = await gzip(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
    const path = `cat/${inp.id}/${k}.f32.gz`;
    const { error } = await sb.storage.from(CATALOG_BUCKET).upload(path, new Blob([gz as BlobPart], { type: 'application/gzip' }), { upsert: true, contentType: 'application/gzip' });
    if (error) throw new Error(error.message);
    const license = inp.licenses?.[k]?.trim();
    metas[k] = { ...(inp.geo.layers as Record<string, GeoLayerMeta>)[k], path, bytes: gz.byteLength, ...(license ? { license } : {}) };
    onProgress?.(++done, keys.length);
  }
  const definition: CatalogDef = { criteria: inp.criteria, geo: { grid, layers: metas, rules: inp.geo.rules, classes: inp.geo.classes, ...(inp.geo.minPatchHa ? { minPatchHa: inp.geo.minPatchHa } : {}) } };
  const { error } = await sb.from('geo_packs').upsert({ id: inp.id, title: inp.title, description: inp.description, attribution: inp.attribution, definition, is_active: true, created_by: inp.userId });
  if (error) throw new Error(error.message);
}

export async function deleteCatalogPack(sb: SupabaseClient, row: CatalogRow): Promise<void> {
  const paths = Object.values(row.definition.geo.layers).map((l) => l.path).filter(Boolean);
  if (paths.length) await sb.storage.from(CATALOG_BUCKET).remove(paths);
  const { error } = await sb.from('geo_packs').delete().eq('id', row.id);
  if (error) throw new Error(error.message);
}
