/** Persistencia de capas propias: Float32 + gzip en Supabase Storage (bucket privado `geo-layers`,
 * carpeta = uid del dueño; ver migración 20240101000011_geo_storage.sql). Solo cliente. */
import type { SupabaseClient } from '@supabase/supabase-js';

export const BUCKET = 'geo-layers';
/** Cuota real del usuario (la fija el administrador, ver `geo_quota()` en la migración 12). */
export type Quota = { used_bytes: number; quota_bytes: number; layers: number; max_layers: number; max_pixels: number };

export async function getQuota(sb: SupabaseClient): Promise<Quota | null> {
  const { data, error } = await sb.rpc('geo_quota');
  return error || !data ? null : (data as Quota);
}

/** Errores de cuota/tope: la capa NO se acepta ni siquiera «solo en esta sesión». */
export const isQuotaError = (m: string) => /Cuota de mapas|Máximo de \d+ capas/i.test(m);

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const src = new Blob([bytes as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(src).arrayBuffer());
}
export const gzip = (b: Uint8Array) => pipe(b, new CompressionStream('gzip'));
export const gunzip = (b: Uint8Array) => pipe(b, new DecompressionStream('gzip'));

export const layerPath = (ownerId: string, projectId: string, key: string) => `${ownerId}/${projectId}/${key}.f32.gz`;

export async function uploadLayer(sb: SupabaseClient, path: string, data: Float32Array): Promise<number> {
  const gz = await gzip(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  const chk = await sb.rpc('geo_check_upload', { p_path: path, p_bytes: gz.byteLength });
  if (chk.error) throw new Error(chk.error.message);
  const { error } = await sb.storage.from(BUCKET).upload(path, new Blob([gz as BlobPart], { type: 'application/gzip' }), { upsert: true, contentType: 'application/gzip' });
  if (error) throw new Error(error.message);
  return gz.byteLength;
}

export async function downloadLayer(sb: SupabaseClient, path: string): Promise<Float32Array> {
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(error?.message ?? 'No se pudo descargar la capa');
  const raw = await gunzip(new Uint8Array(await data.arrayBuffer()));
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

export async function removeLayers(sb: SupabaseClient, paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await sb.storage.from(BUCKET).remove(paths);
  if (error) throw new Error(error.message);
}

/** Borra todos los archivos de un proyecto (`<uid>/<proyecto>/…`). Mejor esfuerzo: si falla, el admin
 * los ve como huérfanos y los limpia desde /admin. */
export async function removeProjectFolder(sb: SupabaseClient, ownerId: string, projectId: string): Promise<void> {
  const prefix = `${ownerId}/${projectId}`;
  const { data } = await sb.storage.from(BUCKET).list(prefix, { limit: 200 });
  const names = (data ?? []).map((o) => `${prefix}/${o.name}`);
  if (names.length) await removeLayers(sb, names);
}

/** Lista TODOS los archivos de un usuario (`<uid>/<proyecto>/…`), paginando. Lanza si la API falla:
 * al eliminar la cuenta es preferible detenerse y reintentar que dejar archivos sin dueño. */
async function listAll(sb: SupabaseClient, prefix: string): Promise<{ name: string; isFolder: boolean }[]> {
  const out: { name: string; isFolder: boolean }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(error.message);
    for (const o of data ?? []) out.push({ name: o.name, isFolder: o.id == null });
    if ((data?.length ?? 0) < 1000) return out;
  }
}

/** Borra todas las capas de un usuario, de todos sus proyectos, para «Eliminar mi cuenta». El SQL no
 * puede hacerlo (borrar filas de storage.objects deja el archivo huérfano en el almacenamiento).
 * Devuelve cuántos archivos borró. */
export async function removeAllUserLayers(sb: SupabaseClient, uid: string): Promise<number> {
  const paths: string[] = [];
  for (const top of await listAll(sb, uid)) {
    if (!top.isFolder) { paths.push(`${uid}/${top.name}`); continue; }
    for (const f of await listAll(sb, `${uid}/${top.name}`)) if (!f.isFolder) paths.push(`${uid}/${top.name}/${f.name}`);
  }
  for (let i = 0; i < paths.length; i += 100) await removeLayers(sb, paths.slice(i, i + 100));
  return paths.length;
}

/** Copia las capas propias de un proyecto a la carpeta de otro (duplicar). Cada copia pasa por la
 * cuota (`geo_check_upload`); si algo falla se borran las ya copiadas y se lanza el error. Devuelve
 * las capas con sus rutas nuevas. Los paquetes del catálogo/estáticos no se copian (no hay `path` propio). */
export async function cloneLayers<T extends { path: string; bytes: number }>(
  sb: SupabaseClient, ownerId: string, fromProject: string, toProject: string, layers: Record<string, T>,
): Promise<Record<string, T>> {
  const out: Record<string, T> = {};
  const done: string[] = [];
  try {
    for (const [key, meta] of Object.entries(layers)) {
      if (!meta.path) { out[key] = meta; continue; }
      const dest = layerPath(ownerId, toProject, key);
      const chk = await sb.rpc('geo_check_upload', { p_path: dest, p_bytes: meta.bytes });
      if (chk.error) throw new Error(chk.error.message);
      const { error } = await sb.storage.from(BUCKET).copy(meta.path, dest);
      if (error) throw new Error(error.message);
      done.push(dest);
      out[key] = { ...meta, path: dest };
    }
  } catch (e) {
    if (done.length) { try { await removeLayers(sb, done); } catch { /* huérfanos: los limpia el admin */ } }
    throw e;
  }
  void fromProject;
  return out;
}
