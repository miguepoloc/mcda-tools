/** Reproyecta una grilla (UTM / origen nacional) a una imagen alineada con el mapa web: Web Mercator
 * (lo que espera Leaflet en `imageOverlay`) o lon/lat lineal (lo que espera un `GroundOverlay` KML).
 * El mapa de índices se calcula UNA vez por grilla (retícula gruesa + interpolación) y recolorear al
 * mover un control es solo un `gather`. Puro. */
import { mapToPixel, projector } from './crs.ts';
import { gridBoundsLonLat, type Bounds } from './grid.ts';
import { interpolatedMap } from './mapper.ts';
import type { GeoGrid } from '../types.ts';

export type OverlayMap = { width: number; height: number; index: Int32Array; bounds: Bounds; mode: 'mercator' | 'geographic' };

const R2D = 180 / Math.PI, D2R = Math.PI / 180;
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * D2R) / 2));
const invMercY = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * R2D;

export function buildOverlayMap(grid: GeoGrid, mode: 'mercator' | 'geographic' = 'mercator', maxDim = 1800): OverlayMap {
  const b = gridBoundsLonLat(grid);
  const dLon = b.east - b.west;
  const yN = mode === 'mercator' ? mercY(b.north) : b.north, yS = mode === 'mercator' ? mercY(b.south) : b.south;
  const xr = dLon * D2R, yr = mode === 'mercator' ? yN - yS : (b.north - b.south) * D2R;
  const w = Math.max(2, Math.min(maxDim, Math.round(grid.width * 1.15)));
  const h = Math.max(2, Math.min(maxDim, Math.round((w * yr) / xr)));
  const toGrid = projector('EPSG:4326', grid.crs);
  const { u, v } = interpolatedMap(w, h, (c, r) => {
    const lon = b.west + ((c + 0.5) / w) * dLon;
    const y = yN - ((r + 0.5) / h) * (yN - yS);
    const lat = mode === 'mercator' ? invMercY(y) : y;
    const [x, yy] = toGrid(lon, lat);
    return mapToPixel(x, yy, grid.transform);
  }, 6);
  const index = new Int32Array(w * h);
  for (let k = 0; k < index.length; k++) {
    const c = Math.round(u[k]), r = Math.round(v[k]);
    index[k] = c >= 0 && c < grid.width && r >= 0 && r < grid.height ? r * grid.width + c : -1;
  }
  return { width: w, height: h, index, bounds: b, mode };
}

/** RGBA de la grilla -> RGBA de la imagen reproyectada. */
export function gather(map: OverlayMap, src: Uint32Array): Uint32Array {
  const out = new Uint32Array(map.index.length);
  for (let k = 0; k < out.length; k++) { const i = map.index[k]; if (i >= 0) out[k] = src[i]; }
  return out;
}
