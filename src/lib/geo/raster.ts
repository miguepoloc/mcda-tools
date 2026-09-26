/** Remuestreo de un ráster fuente (GeoTIFF ya leído) a la grilla del proyecto. Puro. La
 * reproyección se evalúa en una retícula gruesa (`interpolatedMap`), no celda por celda. */
import { mapToPixel, pixelToMap, projector, type Transform } from './crs.ts';
import { interpolatedMap } from './mapper.ts';
import type { GeoGrid } from '../types.ts';

export type SourceRaster = {
  data: ArrayLike<number>;
  width: number;
  height: number;
  transform: Transform; // norte arriba: [res, 0, x0, 0, -res, y0]
  crs: string;
  nodata: number | null;
};

function isNoData(v: number, nodata: number | null): boolean {
  return Number.isNaN(v) || !Number.isFinite(v) || (nodata !== null && v === nodata) || v < -3e38;
}

/** Cuántos píxeles de la fuente caben, por columna (`sx`) y por fila (`sy`), en una celda de la grilla (medido en el centro
 * de la grilla). > 1 = la fuente es más fina que la grilla (p. ej. 38 m -> 250 m); < 1 = más gruesa. Se miden por separado
 * porque hay rásteres con píxel NO cuadrado (el de la boya: 38.68 × 17.89 m). */
export function sourcePerCell(src: SourceRaster, grid: GeoGrid): { sx: number; sy: number } {
  const f = src.crs === grid.crs ? null : projector(grid.crs, src.crs);
  const at = (c: number, r: number) => {
    const [x, y] = pixelToMap(c, r, grid.transform);
    const [sx, sy] = f ? f(x, y) : [x, y];
    return mapToPixel(sx, sy, src.transform);
  };
  const c0 = grid.width / 2, r0 = grid.height / 2;
  const [u0, v0] = at(c0, r0), [u1, v1] = at(c0 + 1, r0), [u2, v2] = at(c0, r0 + 1);
  const sx = Math.max(Math.abs(u1 - u0), Math.abs(u2 - u0)), sy = Math.max(Math.abs(v1 - v0), Math.abs(v2 - v0));
  return { sx: Number.isFinite(sx) ? sx : 1, sy: Number.isFinite(sy) ? sy : 1 };
}

/** Reduce la fuente por bloques `nx × ny`: promedio (continua) o moda (categórica). Ignora los sin dato; un bloque
 * sin ningún dato queda NaN. Es lo que evita el aliasing al pasar de un ráster fino a una grilla gruesa: sin esto,
 * tomar 1 píxel de cada ~40 (vecino más cercano o bilineal) descarta casi todos los datos y una capa categórica
 * o una máscara de exclusión pierde franjas enteras. */
export function aggregateSource(src: SourceRaster, nx: number, ny: number, mode: 'mean' | 'mode'): SourceRaster {
  const w = Math.ceil(src.width / nx), h = Math.ceil(src.height / ny);
  const out = new Float32Array(w * h);
  const [a, b, c, d, e, f] = src.transform;
  for (let R = 0; R < h; R++) {
    const r0 = R * ny, r1 = Math.min(src.height, r0 + ny);
    for (let C = 0; C < w; C++) {
      const c0 = C * nx, c1 = Math.min(src.width, c0 + nx);
      if (mode === 'mean') {
        let sum = 0, cnt = 0;
        for (let r = r0; r < r1; r++) for (let cc = c0; cc < c1; cc++) {
          const v = src.data[r * src.width + cc];
          if (!isNoData(v, src.nodata)) { sum += v; cnt++; }
        }
        out[R * w + C] = cnt ? sum / cnt : NaN;
      } else {
        const counts = new Map<number, number>();
        for (let r = r0; r < r1; r++) for (let cc = c0; cc < c1; cc++) {
          const v = src.data[r * src.width + cc];
          if (!isNoData(v, src.nodata)) counts.set(v, (counts.get(v) ?? 0) + 1);
        }
        let best = NaN, bc = 0;
        for (const [v, k] of counts) if (k > bc || (k === bc && v < best)) { best = v; bc = k; }
        out[R * w + C] = best;
      }
    }
  }
  return { data: out, width: w, height: h, transform: [a * nx, b * ny, c, d * nx, e * ny, f], crs: src.crs, nodata: null };
}

/** Tope del factor de reducción por bloques (pasado esto la fuente ya es enorme respecto a la grilla). */
const MAX_BLOCK = 512;

export function resampleToGrid(input: SourceRaster, grid: GeoGrid, method: 'nearest' | 'bilinear'): Float32Array {
  const { width: W, height: H } = grid;
  // Fuente bastante más fina que la grilla: se agrega antes de muestrear (promedio o moda, según el método).
  const { sx, sy } = sourcePerCell(input, grid);
  const nx = Math.min(MAX_BLOCK, Math.max(1, Math.floor(sx))), ny = Math.min(MAX_BLOCK, Math.max(1, Math.floor(sy)));
  const src = sx >= 2 || sy >= 2 ? aggregateSource(input, nx, ny, method === 'nearest' ? 'mode' : 'mean') : input;
  const same = src.crs === grid.crs;
  const f = same ? null : projector(grid.crs, src.crs);
  const { u, v } = interpolatedMap(W, H, (c, r) => {
    const [x, y] = pixelToMap(c, r, grid.transform);
    const [sx, sy] = f ? f(x, y) : [x, y];
    return mapToPixel(sx, sy, src.transform);
  }, 6);
  const out = new Float32Array(W * H);
  const sw = src.width, sh = src.height;
  for (let k = 0; k < out.length; k++) {
    const fc = u[k], fr = v[k];
    if (!(fc > -0.5 && fr > -0.5 && fc < sw - 0.5 && fr < sh - 0.5)) { out[k] = NaN; continue; }
    if (method === 'nearest') {
      const val = src.data[Math.round(fr) * sw + Math.round(fc)];
      out[k] = isNoData(val, src.nodata) ? NaN : val;
      continue;
    }
    const c0 = Math.floor(fc), r0 = Math.floor(fr), tx = fc - c0, ty = fr - r0;
    let sum = 0, wsum = 0;
    for (let dr = 0; dr <= 1; dr++) {
      for (let dc = 0; dc <= 1; dc++) {
        const cc = c0 + dc, rr = r0 + dr;
        if (cc < 0 || rr < 0 || cc >= sw || rr >= sh) continue;
        const val = src.data[rr * sw + cc];
        if (isNoData(val, src.nodata)) continue;
        const wt = (dc ? tx : 1 - tx) * (dr ? ty : 1 - ty);
        sum += val * wt; wsum += wt;
      }
    }
    out[k] = wsum > 1e-6 ? sum / wsum : NaN;
  }
  return out;
}

/** Mín/máx de una capa ignorando NaN. */
export function layerRange(a: Float32Array): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min === Infinity ? { min: 0, max: 0 } : { min, max };
}
