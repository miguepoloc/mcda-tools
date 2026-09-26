/** Exportadores del mapa de aptitud: GeoTIFF georreferenciado, estilo QGIS (.qml), KML/KMZ, CSV y
 * zip. Solo bytes/strings — la descarga la hace la UI. Sin DOM (el PNG lo genera el navegador). */
import { zipSync, strToU8 } from 'fflate';
import { CLASS_LABEL, PALETTES, classHex, type PaletteKey } from './paint.ts';
import { MASK_EXCLUDED, MASK_NODATA } from './suitability.ts';
import { pixelToLonLat } from './crs.ts';
import type { Bounds } from './grid.ts';
import type { GeoGrid } from '../types.ts';

export function epsgNumber(crs: string): number {
  const m = /^EPSG:(\d+)$/.exec(crs);
  if (!m) throw new Error(`No sé escribir el CRS «${crs}» en un GeoTIFF (solo códigos EPSG).`);
  return Number(m[1]);
}

/** GeoTIFF de una banda, sin compresión, georreferenciado en el CRS de la grilla (UTM/EPSG). */
export async function toGeoTiff(values: Float32Array | Uint8Array | Uint16Array, grid: GeoGrid, nodata: number): Promise<Uint8Array> {
  const { writeArrayBuffer } = await import('geotiff');
  const [a, , c, , e, f] = grid.transform;
  const isGeographic = grid.crs === 'EPSG:4326' || grid.crs === 'EPSG:4686';
  const meta: Record<string, unknown> = {
    width: grid.width, height: grid.height,
    GTRasterTypeGeoKey: 1,
    ModelPixelScale: [a, -e, 0],
    ModelTiepoint: [0, 0, 0, c, f, 0],
    GDAL_NODATA: String(nodata),
  };
  if (isGeographic) { meta.GTModelTypeGeoKey = 2; meta.GeographicTypeGeoKey = epsgNumber(grid.crs); }
  else { meta.GTModelTypeGeoKey = 1; meta.ProjectedCSTypeGeoKey = epsgNumber(grid.crs); }
  const buf = await writeArrayBuffer(values, meta as never);
  return new Uint8Array(buf as ArrayBuffer);
}

/** Resultado como GeoTIFF UInt8: idoneidad 0–100 (255 = sin dato: fuera del área, exclusión o sin dato en todos los
 * criterios) o clases (0 = exclusión, 1–4 = clases, 255 = sin dato: fuera del área o sin dato en todos los criterios).
 * Es el mismo criterio que `paintResult` (lo que ves en pantalla) y `areaStats` (las hectáreas que se reportan). */
export function resultRaster(pct: Uint8Array, cls: Uint8Array, mask: Uint8Array, kind: 'pct' | 'classes'): Uint8Array {
  const out = new Uint8Array(pct.length);
  for (let i = 0; i < out.length; i++) {
    if (mask[i] === MASK_NODATA) out[i] = 255;
    else if (kind === 'pct') out[i] = pct[i];
    else out[i] = mask[i] !== MASK_EXCLUDED && pct[i] === 255 ? 255 : cls[i];
  }
  return out;
}

const hexA = (hex: string) => hex.toLowerCase();

/** Estilo de QGIS para el GeoTIFF de clases (Capa → Propiedades → Simbología → Estilo → Cargar). */
export function qmlClasses(pal: PaletteKey = 'semaforo'): string {
  const hex = classHex(pal);
  const entries = [0, 1, 2, 3, 4].map((k) => `        <paletteEntry value="${k}" color="${hexA(hex[k])}" label="${CLASS_LABEL[k]}" alpha="255"/>`).join('\n');
  return `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.28.0" styleCategories="Symbology">
  <pipe>
    <rasterrenderer type="paletted" band="1" opacity="1" alphaBand="-1" nodataColor="">
      <colorPalette>
${entries}
      </colorPalette>
    </rasterrenderer>
    <brightnesscontrast brightness="0" contrast="0" gamma="1"/>
    <huesaturation colorizeOn="0" grayscaleMode="0" saturation="0"/>
    <rasterresampler maxOversampling="2"/>
  </pipe>
  <blendMode>0</blendMode>
</qgis>
`;
}

/** Estilo de QGIS para el GeoTIFF de idoneidad 0–100: la misma rampa de 3 paradas (0, 50, 100) que la leyenda de pantalla. */
export function qmlPct(pal: PaletteKey = 'semaforo'): string {
  const c = (i: number) => '#' + PALETTES[pal].stops[i][1].map((v) => v.toString(16).padStart(2, '0')).join('');
  return `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.28.0" styleCategories="Symbology">
  <pipe>
    <rasterrenderer type="singlebandpseudocolor" band="1" opacity="1" alphaBand="-1" classificationMin="0" classificationMax="100">
      <rastershader>
        <colorrampshader colorRampType="INTERPOLATED" classificationMode="1" clip="0" minimumValue="0" maximumValue="100">
          <item value="0" label="0" color="${c(0)}" alpha="255"/>
          <item value="50" label="50" color="${c(1)}" alpha="255"/>
          <item value="100" label="100" color="${c(2)}" alpha="255"/>
        </colorrampshader>
      </rastershader>
    </rasterrenderer>
    <brightnesscontrast brightness="0" contrast="0" gamma="1"/>
    <huesaturation colorizeOn="0" grayscaleMode="0" saturation="0"/>
    <rasterresampler maxOversampling="2"/>
  </pipe>
  <blendMode>0</blendMode>
</qgis>
`;
}

const xml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] as string));

/** KMZ (Google Earth): un GroundOverlay con el PNG en lon/lat lineal. */
export function kmz(title: string, bounds: Bounds, png: Uint8Array): Uint8Array {
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <GroundOverlay>
    <name>${xml(title)}</name>
    <Icon><href>overlay.png</href></Icon>
    <LatLonBox><north>${bounds.north}</north><south>${bounds.south}</south><east>${bounds.east}</east><west>${bounds.west}</west><rotation>0</rotation></LatLonBox>
  </GroundOverlay>
</kml>
`;
  return zipSync({ 'doc.kml': strToU8(kml), 'overlay.png': [png, { level: 0 }] });
}

/** CSV de píxeles (lon, lat, idoneidad 0–100, clase) para importar como puntos en QGIS/Excel. Toma
 * 1 de cada `stride` píxeles para no pasar de `maxRows`. */
export function pixelsCsv(pct: Uint8Array, cls: Uint8Array, mask: Uint8Array, grid: GeoGrid, maxRows = 200_000): string {
  let valid = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] !== MASK_NODATA && pct[i] !== 255) valid++;
  const stride = Math.max(1, Math.ceil(valid / maxRows));
  const lines = ['lon,lat,idoneidad_0_100,clase'];
  let seen = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === MASK_NODATA || pct[i] === 255) continue;
    if (seen++ % stride) continue;
    const row = Math.floor(i / grid.width), col = i - row * grid.width;
    const [lon, lat] = pixelToLonLat(col, row, grid.transform, grid.crs);
    lines.push(`${lon.toFixed(6)},${lat.toFixed(6)},${pct[i]},${CLASS_LABEL[cls[i]] ?? cls[i]}`);
  }
  return lines.join('\n') + '\n';
}

/** CSV de parcelas contiguas de alta aptitud (id, ha, idoneidad media/mínima, lon, lat del centroide). */
export function parcelsCsv(parcels: { id: number; ha: number; meanPct: number; minPct: number; col: number; row: number }[], grid: GeoGrid): string {
  const lines = ['id,hectareas,idoneidad_media,idoneidad_minima,lon,lat'];
  for (const p of parcels) {
    const [lon, lat] = pixelToLonLat(p.col, p.row, grid.transform, grid.crs);
    lines.push(`${p.id},${p.ha.toFixed(2)},${p.meanPct.toFixed(1)},${p.minPct},${lon.toFixed(6)},${lat.toFixed(6)}`);
  }
  return lines.join('\n') + '\n';
}

/** Nombre de archivo seguro para meter dentro de un .zip (sin rutas, sin caracteres que rompen en Windows). */
export const safeName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+|[._]+$/g, '').slice(0, 60) || 'capa';

export function zipFiles(files: Record<string, Uint8Array | string>): Uint8Array {
  const o: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) o[k] = typeof v === 'string' ? strToU8(v) : v;
  return zipSync(o, { level: 6 });
}

export const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mapa';
