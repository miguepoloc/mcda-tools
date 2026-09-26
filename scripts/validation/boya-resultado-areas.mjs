// Areas by suitability class of the published buoy result (Polo-Castañeda et al. 2021), from Final/Resultado.shp.
// Compares (a) the sum of the `area` ATTRIBUTE (what a field statistic in a GIS would give) with (b) the area of the
// GEOMETRY. The DBF field is 10 characters wide: the largest polygon's value overflows and is stored as "**********",
// so an attribute-based sum silently drops it. Data are NOT in this repository. Usage:
//   BOYA_RESULTADO="…/Mapas/TESIS/Final/Resultado" node scripts/validation/boya-resultado-areas.mjs   (path without extension)
import fs from 'node:fs';

const base = process.env.BOYA_RESULTADO;
if (!base) { console.log('BOYA_RESULTADO not set: skipped (the shapefile is not distributed with the code).'); process.exit(0); }
globalThis.self = globalThis; // shpjs expects a browser-like global
const shp = await import('shpjs');
const geoms = shp.parseShp(fs.readFileSync(base + '.shp'));
const rows = shp.parseDbf(fs.readFileSync(base + '.dbf'));

const ringArea = (r) => { let s = 0; for (let j = 0; j < r.length - 1; j++) s += r[j][0] * r[j + 1][1] - r[j + 1][0] * r[j][1]; return Math.abs(s / 2); };
const areaOf = (g) => (g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [])
  .reduce((a, poly) => a + poly.reduce((b, ring, k) => b + (k === 0 ? 1 : -1) * ringArea(ring), 0), 0);

const attr = {}, geom = {}, dropped = [];
geoms.forEach((g, i) => {
  const dn = String(rows[i].DN);
  const v = Number(rows[i].area);
  geom[dn] = (geom[dn] ?? 0) + areaOf(g);
  if (Number.isFinite(v) && String(rows[i].area).trim() !== '' && !String(rows[i].area).includes('*')) attr[dn] = (attr[dn] ?? 0) + v;
  else dropped.push({ i, dn, geomKm2: areaOf(g) / 1e6, raw: rows[i].area });
});
const pct = (o) => { const t = Object.values(o).reduce((a, b) => a + b, 0); return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, (100 * v / t).toFixed(2) + ' %'])); };
console.log('Sum of the `area` attribute (overflowed records skipped):', pct(attr));
console.log('Area of the geometries:                                  ', pct(geom));
console.log('Records whose attribute overflowed:', JSON.stringify(dropped));
