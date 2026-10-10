/** Codificación del mapa publicado (vista pública `/p/<token>`): dos planos Uint8 (idoneidad 0–100 y
 * clase) concatenados, gzip y base64, guardados en `geo_results.grid_b64` (ver migración 12). Puro
 * salvo por `CompressionStream`/`btoa`, presentes en navegadores y en Node ≥ 18. */
import { CLASS_VETO, MASK_EXCLUDED, MASK_NODATA, MASK_VALID, type Direction } from './suitability.ts';
import type { Bounds } from './grid.ts';
import type { GeoGrid } from '../types.ts';
import type { AhpSummary } from './ahpSummary.ts';
import type { SigParts } from './publishSig.ts';
import { sanitizePublishedRows, type PublishedPoint } from './points.ts';
import type { PublishedZones } from './zonal.ts';

/** Puntos que la vista pública debe mostrar: solo con `showPoints` y una lista válida (publicaciones anteriores → null). */
export function publishedPoints(meta: { showPoints?: boolean; points?: unknown }): PublishedPoint[] | null {
  if (meta.showPoints !== true || !Array.isArray(meta.points)) return null;
  const out = (meta.points as Partial<PublishedPoint>[]).filter((p) => p && typeof p.name === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lon)).map((p) => {
    // `rows` es opcional (publicaciones anteriores no lo traen) y se valida: lo mal formado se descarta sin tumbar el punto.
    const { rows, ...rest } = p as PublishedPoint;
    const clean = sanitizePublishedRows(rows);
    return (clean.length ? { ...rest, rows: clean } : rest) as PublishedPoint;
  });
  return out.length ? out : null;
}

/** Resumen por zonas que la vista pública debe mostrar: solo con `showZones` y filas válidas (publicaciones anteriores → null). */
export function publishedZones(meta: { showZones?: boolean; zones?: unknown }): PublishedZones | null {
  if (meta.showZones !== true || !meta.zones || typeof meta.zones !== 'object') return null;
  const z = meta.zones as Partial<PublishedZones>;
  if (!Array.isArray(z.rows) || !z.rows.length) return null;
  const rows = z.rows.filter((r) => r && typeof r.name === 'string' && Array.isArray(r.classPct));
  return rows.length ? { layer: typeof z.layer === 'string' ? z.layer : '', rows, ...(typeof z.extremeName === 'string' ? { extremeName: z.extremeName } : {}) } : null;
}

/** Códigos del plano de clase publicado. */
export const CODE_EXCLUDED = 0;
export const CODE_NODATA = 254;

/** Una clase evaluada tal como se publica (v2): nombre, color propio opcional (sin él la vista pública usa la
 * paleta del lector), rango del índice 0–1 `[from, to)` (la última, cerrada), hectáreas y % del área evaluada. */
export type PublishedClass = { name: string; color?: string; from: number; to: number; ha: number; pct: number };

type PublishedBase = {
  grid: GeoGrid;
  bounds: Bounds;
  weights: { name: string; weight: number }[];
  cr: number;
  nExperts: number;
  weightsOrigin: string;
  evaluableHa: number;
  attribution?: string;
  /** AHP de los criterios (matriz, λmax, CR, consenso, incertidumbre, expertos sin nombre). Ausente en publicaciones anteriores. */
  ahp?: AhpSummary;
  /** Firma de lo que produjo este mapa (pesos, reglas, umbrales, capas): para avisar si quedó desactualizado. */
  sig?: string;
  /** Firma por partes (pesos, reglas, umbrales, capas, área) para decir QUÉ cambió. Ausente en publicaciones anteriores. */
  sigParts?: SigParts;
  /** Puntos con su ranking, ya calculados. SOLO viajan si el dueño activó «mostrar puntos y ranking» (`showPoints`):
   * el meta completo lo recibe cualquiera con el enlace. Campos opcionales y aditivos: no suben la versión del meta. */
  points?: PublishedPoint[];
  showPoints?: boolean;
  /** Resumen por zonas (agregados). SOLO viaja con el interruptor `showZones` (por defecto apagado). Aditivo: no sube `v`. */
  zones?: PublishedZones;
  showZones?: boolean;
};

/** v1: siempre aptitud con 3 clases (alta / moderada / no apta); el plano de clase codifica la vetada como 4. */
export type PublishedMetaV1 = PublishedBase & {
  v: 1;
  thresholds: { alta: number; media: number };
  classes: { alta: number; media: number; noapta: number; excl: number };     // hectáreas
  pct: { alta: number; media: number; noapta: number };                       // % del área evaluada
};

/** v2: dirección del índice y N clases (2–8). El plano de clase usa 1..N (ascendente por índice), `CLASS_VETO` (253)
 * para vetada, 0 = exclusión y 254 = sin dato. */
export type PublishedMetaV2 = PublishedBase & {
  v: 2;
  direction: Direction;
  classes: PublishedClass[];
  /** Hectáreas vetadas (ya sumadas a la clase extrema de la dirección) y exclusión. */
  vetoHa: number;
  exclHa: number;
};

export type PublishedMeta = PublishedMetaV1 | PublishedMetaV2;

/** Lo que la vista pública necesita, igual para v1 y v2 (v1 = aptitud de 3 clases con los nombres de siempre). */
export type PublishedView = { direction: Direction; classes: PublishedClass[]; exclHa: number; vetoHa: number; legacyVeto: boolean };
export function publishedView(meta: PublishedMeta): PublishedView {
  if (meta.v === 2) return { direction: meta.direction, classes: meta.classes, exclHa: meta.exclHa, vetoHa: meta.vetoHa, legacyVeto: false };
  const { media, alta } = meta.thresholds;
  return {
    direction: 'suitability', legacyVeto: true, exclHa: meta.classes.excl, vetoHa: 0,
    classes: [
      { name: 'No apta', from: 0, to: media, ha: meta.classes.noapta, pct: meta.pct.noapta },
      { name: 'Moderada', from: media, to: alta, ha: meta.classes.media, pct: meta.pct.media },
      { name: 'Alta aptitud', from: alta, to: 1, ha: meta.classes.alta, pct: meta.pct.alta },
    ],
  };
}

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
export async function decodePlanes(b64: string, n: number, opts: { legacyVeto?: boolean } = {}): Promise<{ pct: Uint8Array; cls: Uint8Array; mask: Uint8Array }> {
  const raw = await pipe(fromBase64(b64), new DecompressionStream('gzip'));
  if (raw.length !== 2 * n) throw new Error('El mapa publicado está dañado (tamaño inesperado).');
  const pct = raw.slice(0, n), code = raw.subarray(n);
  const cls = new Uint8Array(n), mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (code[i] === CODE_NODATA) { mask[i] = MASK_NODATA; }
    else if (code[i] === CODE_EXCLUDED) { mask[i] = MASK_EXCLUDED; }
    // Publicaciones v1 codificaban «vetada» como 4; hoy es CLASS_VETO (el 4 pasó a ser una clase más cuando hay ≥ 4).
    else { mask[i] = MASK_VALID; cls[i] = opts.legacyVeto && code[i] === 4 ? CLASS_VETO : code[i]; }
  }
  return { pct, cls, mask };
}
