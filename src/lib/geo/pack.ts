/** Carga un paquete del catálogo (`public/geo-packs/<id>/manifest.json`) en el navegador: fetch +
 * descompresión gzip nativa (`DecompressionStream`, sin dependencias nuevas) + deshacer la
 * cuantización. Solo corre en cliente — no lo importa ningún `check-*.ts`. Generado por
 * `scripts/geo/export_pack.py` a partir de `data/ahp_sig_snsm/cache/` (ver ese script y
 * `plataforma/docs/PLAN_geovisor_ahp_sig.md`). */
import { dequantizeLayer } from './quant.ts';
import type { GeoGrid } from '../types.ts';

export type GeoManifest = {
  id: string;
  title: string;
  attribution: string;
  grid: GeoGrid;
  layers: Record<string, { min: number; max: number; path: string; bytes: number; label: string; unit: string }>;
  mask: { path: string; legend: Record<string, string> };
  base: string;
  points: Record<string, { lat: number; lon: number }>;
};

export type LoadedPack = {
  manifest: GeoManifest;
  layers: Record<string, Float32Array>;
  mask: Uint8Array;
};

async function fetchGunzip(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
  if (!res.body) throw new Error(`Respuesta sin cuerpo: ${url}`);
  const ds = new DecompressionStream('gzip');
  const stream = res.body.pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/** `onProgress(loaded, total)` en capas, para una barra de progreso simple. */
export async function loadPack(packId: string, onProgress?: (loaded: number, total: number) => void): Promise<LoadedPack> {
  const base = `/geo-packs/${packId}/`;
  const manifest: GeoManifest = await fetch(base + 'manifest.json').then((r) => {
    if (!r.ok) throw new Error(`Paquete «${packId}» no encontrado`);
    return r.json();
  });
  const keys = Object.keys(manifest.layers);
  const total = keys.length + 1;
  let loaded = 0;
  const layers: Record<string, Float32Array> = {};
  for (const key of keys) {
    const meta = manifest.layers[key];
    const u8 = await fetchGunzip(base + meta.path);
    layers[key] = dequantizeLayer(u8, meta.min, meta.max);
    loaded++; onProgress?.(loaded, total);
  }
  const mask = await fetchGunzip(base + manifest.mask.path);
  loaded++; onProgress?.(loaded, total);
  return { manifest, layers, mask };
}
