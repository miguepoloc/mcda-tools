/** Lectura de archivos que sube el estudiante: GeoJSON, shapefile (.zip con .shp/.dbf/.prj), KML,
 * GPX y GeoTIFF. Solo cliente (usa File, DOMParser y librerías cargadas bajo demanda). Devuelve
 * lo justo para mostrar una ficha y, después de fijada la grilla, para alinear el archivo a ella. */
import { crsDef, projector, registerCrs, type Transform } from './crs.ts';
import { fcBounds, geomKinds, numericFields, type FC } from './vector.ts';
import type { Bounds } from './grid.ts';
import type { GeoGrid } from '../types.ts';
import type { SourceRaster } from './raster.ts';

export const MAX_FILE_BYTES = 200 * 1024 * 1024;

export type ParsedVector = {
  kind: 'vector'; name: string; fc: FC; bounds: Bounds; count: number;
  geoms: ('point' | 'line' | 'polygon')[]; fields: string[];
};
export type ParsedRaster = {
  kind: 'raster'; name: string; bounds: Bounds; crs: string; width: number; height: number;
  res: number; unit: string; nodata: number | null;
  /** Bandas del archivo: solo se usa la primera (una imagen RGB o multibanda no es un mapa de un valor por celda). */
  bands: number;
  read: (grid: GeoGrid) => Promise<SourceRaster | null>;
};
export type Parsed = ParsedVector | ParsedRaster;

/** Ejecuta `fn` y, si lanza, devuelve un error en español con el nombre del archivo (los de las librerías vienen en inglés y sin contexto). */
async function reading<T>(name: string, what: string, fn: () => T | Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    throw new Error(`«${name}»: no se pudo leer ${what} (${m}). Ábrelo en QGIS y vuelve a exportarlo.`);
  }
}

/** Un GeoJSON puede declarar su CRS con el miembro (obsoleto) `crs`; solo aceptamos los equivalentes a lon/lat WGS84/SIRGAS. */
function assertLonLat(name: string, x: unknown) {
  const nm = (x as { crs?: { properties?: { name?: string } } })?.crs?.properties?.name;
  if (nm && !/(CRS84|4326|4686|WGS ?84)/i.test(nm)) {
    throw new Error(`«${name}» está en el sistema ${nm}, no en lon/lat. Reproyecta la capa a WGS84 (EPSG:4326) en QGIS antes de subirla.`);
  }
}

function normalizeFc(x: unknown): FC {
  const o = x as { type?: string; features?: unknown[]; geometry?: unknown };
  if (o?.type === 'FeatureCollection') return o as FC;
  if (o?.type === 'Feature') return { type: 'FeatureCollection', features: [o as never] };
  if (o?.type) return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: o as never, properties: {} }] };
  throw new Error('No es un GeoJSON válido.');
}

function vectorFrom(name: string, fc: FC): ParsedVector {
  const bounds = fcBounds(fc);
  if (!bounds) throw new Error(`«${name}» no tiene geometrías.`);
  if (bounds.west < -180.01 || bounds.east > 180.01 || bounds.south < -90.01 || bounds.north > 90.01) {
    throw new Error(`«${name}»: las coordenadas no parecen lon/lat. Reproyecta la capa a WGS84 (EPSG:4326) en QGIS o incluye el archivo .prj dentro del .zip.`);
  }
  return { kind: 'vector', name, fc, bounds, count: fc.features.length, geoms: [...geomKinds(fc)], fields: numericFields(fc) };
}

async function fetchProj4(code: string): Promise<string | null> {
  try {
    const n = code.replace('EPSG:', '');
    const res = await fetch(`https://epsg.io/${n}.proj4`);
    if (!res.ok) return null;
    const t = (await res.text()).trim();
    return t.startsWith('+') ? t : null;
  } catch { return null; }
}

async function parseTiff(file: File): Promise<ParsedRaster> {
  const { fromBlob } = await import('geotiff');
  const img = await reading(file.name, 'el GeoTIFF (¿está dañado o usa una compresión poco común?)', async () => (await fromBlob(file)).getImage());
  const dir = img.fileDirectory as unknown as Record<string, unknown>;
  if (dir.ModelTransformation) throw new Error(`«${file.name}» está rotado o inclinado: remuéstralo a norte-arriba en QGIS (Ráster → Proyecciones → Reproyectar).`);
  const keys = img.getGeoKeys() as Record<string, number> | null;
  let code = keys?.ProjectedCSTypeGeoKey && keys.ProjectedCSTypeGeoKey !== 32767 ? keys.ProjectedCSTypeGeoKey : keys?.GeographicTypeGeoKey && keys.GeographicTypeGeoKey !== 32767 ? keys.GeographicTypeGeoKey : 0;
  if (!code) throw new Error(`«${file.name}» no trae sistema de coordenadas (CRS). Asígnaselo en QGIS y vuelve a exportarlo.`);
  const crs = `EPSG:${code}`;
  if (!crsDef(crs)) {
    const def = await fetchProj4(crs);
    if (!def) throw new Error(`No conozco el CRS ${crs} de «${file.name}». Reproyéctalo a EPSG:4326 o a UTM en QGIS.`);
    registerCrs(crs, def);
  }
  const [[ox0, oy0], [rx, ry]] = await reading(file.name, 'la georreferenciación del GeoTIFF', () => [img.getOrigin() as number[], img.getResolution() as number[]]);
  if (!Number.isFinite(ox0) || !Number.isFinite(oy0) || !Number.isFinite(rx) || !Number.isFinite(ry) || rx === 0 || ry === 0) {
    throw new Error(`«${file.name}» no trae georreferenciación (origen y tamaño de píxel). Asígnala en QGIS y vuelve a exportarlo.`);
  }
  // GTRasterTypeGeoKey = 2 (PixelIsPoint): la esquina que trae el archivo es el CENTRO del primer píxel. GDAL lo
  // corre medio píxel; sin esto la capa quedaría desplazada media celda (≈ 19 m en un ráster de 38 m).
  const pixelIsPoint = keys?.GTRasterTypeGeoKey === 2;
  const ox = pixelIsPoint ? ox0 - rx / 2 : ox0, oy = pixelIsPoint ? oy0 - ry / 2 : oy0;
  const width = img.getWidth(), height = img.getHeight();
  const x1 = ox + rx * width, y1 = oy + ry * height;
  const f = projector(crs, 'EPSG:4326');
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
    const [lon, lat] = f(ox + ((x1 - ox) * i) / 8, oy + ((y1 - oy) * j) / 8);
    west = Math.min(west, lon); east = Math.max(east, lon); south = Math.min(south, lat); north = Math.max(north, lat);
  }
  const nodata = img.getGDALNoData();
  const geographic = code === 4326 || code === 4686;
  return {
    kind: 'raster', name: file.name, bounds: { west, south, east, north }, crs, width, height, bands: img.getSamplesPerPixel(),
    res: Math.abs(rx), unit: geographic ? '°' : 'm', nodata: nodata === null || nodata === undefined ? null : Number(nodata),
    async read(grid) {
      // ventana del ráster que cubre la grilla, y lectura remuestreada si es enorme
      const g = projector(grid.crs, crs);
      const [a, b, c, d, e, ff] = grid.transform;
      let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
      for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
        const col = (grid.width * i) / 10, row = (grid.height * j) / 10;
        const [x, y] = g(a * col + b * row + c, d * col + e * row + ff);
        xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
      }
      if (![xmin, xmax, ymin, ymax].every(Number.isFinite)) return null; // la grilla queda fuera del dominio de la proyección del ráster
      const px0 = Math.max(0, Math.floor((xmin - ox) / rx) - 2), px1 = Math.min(width, Math.ceil((xmax - ox) / rx) + 2);
      const py0 = Math.max(0, Math.floor((ymax - oy) / ry) - 2), py1 = Math.min(height, Math.ceil((ymin - oy) / ry) + 2);
      const ww = px1 - px0, wh = py1 - py0;
      if (!(ww > 0) || !(wh > 0)) return null;
      // Se reduce con vecino más cercano (no bilineal): mezclar valores «sin dato» (-9999) con valores reales inventa
      // números y en un mapa categórico inventa clases; la agregación fina (promedio/moda) la hace `resampleToGrid`.
      const MAXPX = 6_000_000;
      const k = Math.max(1, Math.sqrt((ww * wh) / MAXPX));
      const rw = Math.max(1, Math.round(ww / k)), rh = Math.max(1, Math.round(wh / k));
      const rast = await img.readRasters({ window: [px0, py0, px1, py1], width: rw, height: rh, samples: [0], resampleMethod: 'nearest' });
      const band = (Array.isArray(rast) ? rast[0] : (rast as unknown as ArrayLike<number>[])[0]) as ArrayLike<number>;
      const tr: Transform = [(rx * ww) / rw, 0, ox + px0 * rx, 0, (ry * wh) / rh, oy + py0 * ry];
      return { data: band, width: rw, height: rh, transform: tr, crs, nodata: nodata === null || nodata === undefined ? null : Number(nodata) };
    },
  };
}

/** Un archivo puede traer varias capas (un .zip con varios shapefiles). */
export async function parseFile(file: File): Promise<Parsed[]> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`«${file.name}» pesa ${(file.size / 1048576).toFixed(0)} MB; el máximo es ${MAX_FILE_BYTES / 1048576} MB. Recórtalo al área de estudio en QGIS.`);
  if (file.size === 0) throw new Error(`«${file.name}» está vacío.`);
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const base = file.name.replace(/\.[^.]+$/, '');
  if (ext === 'tif' || ext === 'tiff') return [await parseTiff(file)];
  if (ext === 'json' || ext === 'geojson') {
    const x = await reading(file.name, 'el GeoJSON (¿está incompleto o no es JSON?)', async () => JSON.parse(await file.text()));
    assertLonLat(file.name, x);
    return [vectorFrom(base, normalizeFc(x))];
  }
  if (ext === 'kml' || ext === 'gpx' || ext === 'kmz') {
    const tg = await import('@tmcw/togeojson');
    let text: string;
    if (ext === 'kmz') {
      // Un KMZ es un .zip con un .kml dentro (doc.kml por convención).
      const { unzipSync, strFromU8 } = await import('fflate');
      text = await reading(file.name, 'el KMZ', async () => {
        const z = unzipSync(new Uint8Array(await file.arrayBuffer()));
        const name = z['doc.kml'] ? 'doc.kml' : Object.keys(z).find((k) => k.toLowerCase().endsWith('.kml'));
        if (!name) throw new Error('no trae ningún .kml');
        return strFromU8(z[name]);
      });
    } else text = await file.text();
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error(`«${file.name}» no es un ${ext.toUpperCase()} válido (XML mal formado).`);
    return [vectorFrom(base, normalizeFc(ext === 'gpx' ? tg.gpx(doc) : tg.kml(doc)))];
  }
  if (ext === 'zip') {
    const shp = (await import('shpjs')).default;
    const out = await reading(file.name, 'el shapefile (el .zip debe traer .shp, .dbf, .shx y .prj)', async () => shp(await file.arrayBuffer()));
    const list = (Array.isArray(out) ? out : [out]) as (FC & { fileName?: string })[];
    if (!list.length) throw new Error(`«${file.name}» no contiene ningún shapefile (.shp).`);
    return list.map((fc, i) => vectorFrom(list.length > 1 ? fc.fileName || `${base}-${i + 1}` : base, normalizeFc(fc)));
  }
  if (ext === 'shp' || ext === 'dbf' || ext === 'prj' || ext === 'shx') throw new Error('Un shapefile son varios archivos: comprime .shp, .dbf, .shx y .prj juntos en un .zip y sube ese .zip.');
  throw new Error(`Formato «.${ext}» no soportado. Sube GeoTIFF (.tif), GeoJSON, KML/KMZ, GPX o un shapefile en .zip.`);
}
