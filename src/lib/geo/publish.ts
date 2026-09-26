/** Codificación del mapa publicado (vista pública `/p/<token>`): dos planos Uint8 (idoneidad 0–100 y
 * clase) concatenados, gzip y base64, guardados en `geo_results.grid_b64` (ver migración 12). Puro
 * salvo por `CompressionStream`/`btoa`, presentes en navegadores y en Node ≥ 18. */
import { MASK_EXCLUDED, MASK_NODATA, MASK_VALID } from './suitability.ts';
import type { Bounds } from './grid.ts';
import type { GeoGrid } from '../types.ts';
import type { AhpSummary } from './ahpSummary.ts';

/** Códigos del plano de clase publicado. */
export const CODE_EXCLUDED = 0;
export const CODE_NODATA = 254;

export type PublishedMeta = {
  v: 1;
  grid: GeoGrid;
  bounds: Bounds;
  weights: { name: string; weight: number }[];
  cr: number;
  nExperts: number;
  weightsOrigin: string;
  thresholds: { alta: number; media: number };
  classes: { alta: number; media: number; noapta: number; excl: number };     // hectáreas
  pct: { alta: number; media: number; noapta: number };                       // % del área evaluada
  evaluableHa: number;
  attribution?: string;
  /** AHP de los criterios (matriz, λmax, CR, consenso, incertidumbre, expertos sin nombre). Ausente en publicaciones anteriores. */
  ahp?: AhpSummary;
  /** Firma de lo que produjo este mapa (pesos, reglas, umbrales, capas): para avisar si quedó desactualizado. */
  sig?: string;
};

async function pipe(bytes: Uint8Array, s: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const src = new Blob([bytes as BlobPart]).stream().pipeThrough(s as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(src).arrayBuffer());
}

export function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(t: string): Uint8Array {
  const s = atob(t);
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

/** `pct` (255 = sin dato), `cls` (0–4) y `mask` del cálculo -> texto base64 publicable. */
export async function encodePlanes(pct: Uint8Array, cls: Uint8Array, mask: Uint8Array): Promise<string> {
  const n = pct.length;
  const buf = new Uint8Array(2 * n);
  for (let i = 0; i < n; i++) {
    if (mask[i] === MASK_NODATA || (mask[i] === MASK_VALID && pct[i] === 255)) { buf[i] = 255; buf[n + i] = CODE_NODATA; }
    else if (mask[i] === MASK_EXCLUDED) { buf[i] = 255; buf[n + i] = CODE_EXCLUDED; }
    else { buf[i] = pct[i]; buf[n + i] = cls[i]; }
  }
  return toBase64(await pipe(buf, new CompressionStream('gzip')));
}

/** Inversa: devuelve planos listos para `paintResult` / `areaStats` (mask con los códigos de suitability.ts). */
export async function decodePlanes(b64: string, n: number): Promise<{ pct: Uint8Array; cls: Uint8Array; mask: Uint8Array }> {
  const raw = await pipe(fromBase64(b64), new DecompressionStream('gzip'));
  if (raw.length !== 2 * n) throw new Error('El mapa publicado está dañado (tamaño inesperado).');
  const pct = raw.slice(0, n), code = raw.subarray(n);
  const cls = new Uint8Array(n), mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (code[i] === CODE_NODATA) { mask[i] = MASK_NODATA; }
    else if (code[i] === CODE_EXCLUDED) { mask[i] = MASK_EXCLUDED; }
    else { mask[i] = MASK_VALID; cls[i] = code[i]; }
  }
  return { pct, cls, mask };
}
