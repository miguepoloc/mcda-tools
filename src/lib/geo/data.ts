/** Datos en memoria del geovisor: grilla + capas (Float32 en unidades reales) + máscara. Los
 * construyen igual un paquete del catálogo y las capas propias del estudiante. Puro. */
import { MASK_EXCLUDED, MASK_NODATA, MASK_VALID } from './suitability.ts';
import type { GeoGrid } from '../types.ts';
import type { LoadedPack } from './pack.ts';

export type LayerInfo = {
  label: string; unit: string; role: 'criterion' | 'exclusion' | 'area';
  min: number; max: number; origin?: string; source?: string; bytes?: number; license?: string;
};

export type GeoData = {
  grid: GeoGrid;
  layers: Record<string, Float32Array>;
  info: Record<string, LayerInfo>;
  mask: Uint8Array;
  points: Record<string, { lat: number; lon: number }>;
  attribution?: string;
};

/** Máscara: 0 fuera del área de estudio (si hay capa `area`), 2 exclusión (capa `exclusion` > 0), 1 el resto. */
export function buildMask(grid: GeoGrid, layers: Record<string, Float32Array>, info: Record<string, LayerInfo>): Uint8Array {
  const n = grid.width * grid.height;
  const mask = new Uint8Array(n).fill(MASK_VALID);
  for (const [k, inf] of Object.entries(info)) {
    const a = layers[k];
    if (!a) continue;
    if (inf.role === 'area') for (let i = 0; i < n; i++) if (!(a[i] > 0)) mask[i] = MASK_NODATA;
  }
  for (const [k, inf] of Object.entries(info)) {
    const a = layers[k];
    if (!a) continue;
    if (inf.role === 'exclusion') for (let i = 0; i < n; i++) if (a[i] > 0 && mask[i] === MASK_VALID) mask[i] = MASK_EXCLUDED;
  }
  return mask;
}

export type ExtraLayer = { key: string; info: LayerInfo; values: Float32Array };

/** Suma capas propias del estudiante (ya alineadas a la grilla del paquete) a los datos de un paquete
 * de solo lectura, SIN tocar el paquete: devuelve datos nuevos (la máscara se copia). Reglas:
 * - una clave que ya existe en el paquete gana el paquete (la extra se ignora);
 * - una capa con otro tamaño que la grilla se ignora (no está alineada, no se puede combinar);
 * - el rol `area` se ignora: el área de estudio la fija el paquete;
 * - las `exclusion` marcan como excluidas (máscara 2) las celdas válidas donde valen > 0. */
export function mergeExtraLayers(base: GeoData, extras: ExtraLayer[]): GeoData {
  const n = base.grid.width * base.grid.height;
  const use = extras.filter((e) => !(e.key in base.layers) && !(e.key in base.info) && e.info.role !== 'area' && e.values.length === n);
  if (!use.length) return base;
  const layers = { ...base.layers }, info = { ...base.info };
  const mask = base.mask.slice();
  for (const e of use) {
    layers[e.key] = e.values; info[e.key] = e.info;
    if (e.info.role === 'exclusion') for (let i = 0; i < n; i++) if (e.values[i] > 0 && mask[i] === MASK_VALID) mask[i] = MASK_EXCLUDED;
  }
  return { ...base, layers, info, mask };
}

export function fromPack(p: LoadedPack): GeoData {
  const info: Record<string, LayerInfo> = {};
  for (const [k, l] of Object.entries(p.manifest.layers)) info[k] = { label: l.label, unit: l.unit, role: 'criterion', min: l.min, max: l.max, bytes: l.bytes };
  return { grid: p.manifest.grid, layers: p.layers, info, mask: p.mask, points: p.manifest.points, attribution: p.manifest.attribution };
}
