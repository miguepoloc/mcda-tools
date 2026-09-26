/** Conversión píxel (col,row) de una grilla -> coordenadas del CRS -> lon/lat (EPSG:4326). Puro
 * (proj4 no toca el DOM), ver `scripts/check-geo-crs.ts`. Reconoce EPSG:4326/4686, UTM WGS84
 * (326xx/327xx), 3857, los orígenes colombianos comunes (9377, 3115–3118) y cualquier cadena proj4
 * cruda (`+proj=…`). Un EPSG desconocido se puede registrar en caliente con `registerCrs`. */
import proj4 from 'proj4';

const EPSG_9377 = '+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs';

const DEFS: Record<string, string> = {
  'EPSG:4326': 'WGS84',
  'EPSG:4686': '+proj=longlat +ellps=GRS80 +no_defs',
  'EPSG:3857': '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs',
  'EPSG:9377': EPSG_9377,
  'EPSG:3116': '+proj=tmerc +lat_0=4.596200416666666 +lon_0=-74.07750791666666 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +units=m +no_defs',
  'EPSG:3115': '+proj=tmerc +lat_0=4.596200416666666 +lon_0=-77.07750791666666 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +units=m +no_defs',
  'EPSG:3117': '+proj=tmerc +lat_0=4.596200416666666 +lon_0=-71.07750791666666 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +units=m +no_defs',
  'EPSG:3118': '+proj=tmerc +lat_0=4.596200416666666 +lon_0=-68.07750791666666 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +units=m +no_defs',
};

export type Transform = [number, number, number, number, number, number]; // a,b,c,d,e,f (afín GDAL)

export function registerCrs(code: string, def: string) { DEFS[code] = def; }

/** Definición proj4 de un CRS, o `null` si no lo conocemos. */
export function crsDef(crs: string): string | null {
  if (crs.startsWith('+')) return crs;
  if (DEFS[crs]) return DEFS[crs];
  const m = /^EPSG:(32[67])(\d\d)$/.exec(crs);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 60) return `+proj=utm +zone=${Number(m[2])}${m[1] === '327' ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`;
  return null;
}

/** CRS métrico UTM (WGS84) de la zona de un punto — el que usa la grilla de un proyecto propio. */
export function utmCrsFor(lon: number, lat: number): string {
  const zone = Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1));
  return `EPSG:${(lat >= 0 ? 32600 : 32700) + zone}`;
}

type Fwd = (x: number, y: number) => [number, number];
const cache = new Map<string, Fwd>();

function converter(from: string, to: string): Fwd {
  const key = from + '>' + to;
  let f = cache.get(key);
  if (!f) {
    const a = crsDef(from), b = crsDef(to);
    if (!a) throw new Error(`CRS sin definición proj4: ${from}`);
    if (!b) throw new Error(`CRS sin definición proj4: ${to}`);
    const p = proj4(a, b);
    f = (x, y) => p.forward([x, y]) as [number, number];
    cache.set(key, f);
  }
  return f;
}

/** Función de reproyección `crsA -> crsB`, memoizada (crear un `proj4()` por punto es lo caro). */
export function projector(from: string, to: string): Fwd { return converter(from, to); }

/** x,y del CRS en el centro del píxel (col,row). */
export function pixelToMap(col: number, row: number, t: Transform): [number, number] {
  const [a, b, c, d, e, f] = t;
  return [a * (col + 0.5) + b * (row + 0.5) + c, d * (col + 0.5) + e * (row + 0.5) + f];
}

/** (col,row) -> [lon, lat] en EPSG:4326. */
export function pixelToLonLat(col: number, row: number, t: Transform, crs: string): [number, number] {
  const [x, y] = pixelToMap(col, row, t);
  return converter(crs, 'EPSG:4326')(x, y);
}

/** x,y del CRS -> (col,row) exacto (sin redondear; el centro del píxel cae en enteros). */
export function mapToPixel(x: number, y: number, t: Transform): [number, number] {
  const [a, b, c, d, e, f] = t;
  const det = a * e - b * d;
  const col = (e * (x - c) - b * (y - f)) / det - 0.5;
  const row = (a * (y - f) - d * (x - c)) / det - 0.5;
  return [col, row];
}

/** [lon,lat] -> (col,row) exacto. */
export function lonLatToPixel(lon: number, lat: number, t: Transform, crs: string): [number, number] {
  const [x, y] = converter('EPSG:4326', crs)(lon, lat);
  return mapToPixel(x, y, t);
}
