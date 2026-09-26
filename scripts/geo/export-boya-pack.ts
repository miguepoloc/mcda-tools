// Genera el paquete `public/geo-packs/boya-wsn-v1/` (caso de la boya, Polo-Castañeda et al. 2021, IJASEIT 11(5)) a partir
// del archivo del autor: los 4 criterios ya clasificados 1/2/3 (rásteres float32 en MAGNA Bogotá, EPSG:3116, celda 38.68 × 17.89 m)
// y los polígonos del área de trabajo (con y sin concesiones). Los datos originales NO están en el repositorio: este script solo
// corre en el equipo del autor; el resultado (≈ cientos de KB) sí se versiona. Uso, desde `plataforma/`:
//   BOYA_RASTER_DIR=".../Mapas/TESIS/Raster" BOYA_AREA_DIR=".../Mapas/TESIS/Area de trabajo" \
//     node --experimental-strip-types --no-warnings scripts/geo/export-boya-pack.ts
//
// Reducción de 10 000 × 10 000 celdas a 250 m (1 548 × 716): la clase de cada celda es la MODA de los píxeles originales que caen
// en ella (son clases, no valores continuos: promediar no tiene sentido) y la celda es válida si ≥ 50 % de sus píxeles lo eran.
// Máscara: 0 = fuera del área de trabajo; 1 = válida; 2 = dentro del área de trabajo pero sin dato = concesiones (exclusión).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fromFile } from 'geotiff';
import { quantize } from '../../src/lib/geo/quant.ts';

const RES = 250;
const rasterDir = process.env.BOYA_RASTER_DIR, areaDir = process.env.BOYA_AREA_DIR;
if (!rasterDir || !areaDir) { console.error('Faltan BOYA_RASTER_DIR y BOYA_AREA_DIR.'); process.exit(1); }
const OUT = path.resolve(import.meta.dirname, '../../public/geo-packs/boya-wsn-v1');

const LAYERS = [
  { key: 'eco', file: 'Ecosistemas_Marinos', label: 'Distancia a ecosistemas marinos', hint: '>150 m · 70–150 m · <70 m' },
  { key: 'trafico', file: 'Lanchas', label: 'Distancia al tráfico marítimo', hint: '>100 m · 50–100 m · <50 m' },
  { key: 'pesca', file: 'Pesca_Artesanal', label: 'Distancia a zonas de pesca', hint: '>1 milla náutica · <1 milla · en zona de pesca' },
  { key: 'bati', file: 'Batimetria', label: 'Zona batimétrica', hint: '50–200 m · 20–50 m · <20 m' },
];

// ---- 1. rejilla destino (misma esquina y CRS que los rásteres)
const first = await (await fromFile(path.join(rasterDir, LAYERS[0].file + '.tif'))).getImage();
const [W, H] = [first.getWidth(), first.getHeight()];
const [X0, Y0] = first.getOrigin();
const [dx, dyNeg] = first.getResolution(); const dy = Math.abs(dyNeg);
const width = Math.ceil((W * dx) / RES), height = Math.ceil((H * dy) / RES);
const tcol = new Int32Array(W); for (let i = 0; i < W; i++) tcol[i] = Math.min(width - 1, Math.floor(((i + 0.5) * dx) / RES));
const trow = (j: number) => Math.min(height - 1, Math.floor(((j + 0.5) * dy) / RES));
console.log(`fuente ${W}×${H}, celda ${dx.toFixed(3)}×${dy.toFixed(3)} m → destino ${width}×${height} a ${RES} m`);

// ---- 2. clase modal y validez por celda destino
const cls: Record<string, Uint8Array> = {}, validCount = new Uint32Array(width * height), total = new Uint32Array(width * height);
for (const L of LAYERS) cls[L.key] = new Uint8Array(width * height); // 0 = sin dato
const images = await Promise.all(LAYERS.map(async (L) => (await fromFile(path.join(rasterDir, L.file + '.tif'))).getImage()));
let j = 0;
for (let r = 0; r < height; r++) {
  const j0 = j; while (j < H && trow(j) === r) j++;
  if (j === j0) continue;
  const bands = await Promise.all(images.map(async (im) => (await im.readRasters({ window: [0, j0, W, j], samples: [0] }))[0] as Float32Array));
  const counts = LAYERS.map(() => new Uint16Array(width * 4)); // por columna: [n1, n2, n3, nvalid]
  for (let jj = 0; jj < j - j0; jj++) {
    for (let i = 0; i < W; i++) {
      const c = tcol[i], o = jj * W + i;
      total[r * width + c]++;
      let ok = true;
      for (let k = 0; k < LAYERS.length; k++) { const v = bands[k][o]; if (v !== 1 && v !== 2 && v !== 3) ok = false; }
      if (!ok) continue;
      validCount[r * width + c]++;
      for (let k = 0; k < LAYERS.length; k++) counts[k][c * 4 + bands[k][o] - 1]++;
    }
  }
  for (let c = 0; c < width; c++) {
    if (validCount[r * width + c] * 2 < total[r * width + c]) continue; // < 50 % válido
    LAYERS.forEach((L, k) => { const n = counts[k]; let best = 1; for (let m = 2; m <= 3; m++) if (n[c * 4 + m - 1] > n[c * 4 + best - 1]) best = m; cls[L.key][r * width + c] = best; });
  }
  if (r % 100 === 0) console.error('fila destino', r, '/', height);
}

// ---- 3. área de trabajo (con concesiones) por relleno de polígono en el CRS de la rejilla
(globalThis as { self?: unknown }).self = globalThis; // shpjs espera un global de navegador
const shp = await import('shpjs');
const geoms = shp.parseShp(fs.readFileSync(path.join(areaDir, 'Area_De_Trabajo_V1.shp')));
const inside = new Uint8Array(width * height);
for (const g of geoms) {
  const polys = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];
  for (const rings of polys) {
    for (let r = 0; r < height; r++) {
      const y = Y0 - (r + 0.5) * RES, xs: number[] = [];
      for (const ring of rings) for (let a = 0; a < ring.length - 1; a++) {
        const [x1, y1] = ring[a], [x2, y2] = ring[a + 1];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - X0) / RES - 0.5)), c1 = Math.min(width - 1, Math.floor((xs[k + 1] - X0) / RES - 0.5));
        for (let c = c0; c <= c1; c++) inside[r * width + c] ^= 1; // par-impar: los agujeros se restan solos
      }
    }
  }
}
const mask = new Uint8Array(width * height);
let nValid = 0, nExcl = 0;
for (let i = 0; i < mask.length; i++) {
  const valid = cls[LAYERS[0].key][i] > 0;
  mask[i] = valid ? 1 : inside[i] ? 2 : 0;
  if (valid) nValid++; else if (inside[i]) nExcl++;
}
const ha = (n: number) => ((n * RES * RES) / 1e6).toFixed(1);
console.log(`válido ${ha(nValid)} km² (fuente 8 466.3) · concesiones ${ha(nExcl)} km² · área de trabajo ${ha(nValid + nExcl)} km² (polígono: 9 893.6; artículo ≈ 9 887)`);

// ---- 4. escribir el paquete
fs.mkdirSync(path.join(OUT, 'layers'), { recursive: true });
const gz = (b: Uint8Array) => zlib.gzipSync(Buffer.from(b), { level: 9 });
const layers: Record<string, unknown> = {};
for (const L of LAYERS) {
  const u8 = Uint8Array.from(cls[L.key], (v) => (v === 0 ? 255 : quantize(v, 1, 3)));
  const buf = gz(u8);
  fs.writeFileSync(path.join(OUT, 'layers', `${L.key}.u8.gz`), buf);
  layers[L.key] = { min: 1, max: 3, path: `layers/${L.key}.u8.gz`, bytes: buf.length, label: `${L.label} (clase 1 apto · 3 no apto)`, unit: 'clase' };
}
fs.writeFileSync(path.join(OUT, 'layers', 'mask.u8.gz'), gz(mask));
const manifest = {
  id: 'boya-wsn-v1',
  title: 'Zonas aptas para una boya de monitoreo oceanográfico — Caribe sur, zona de surgencia',
  attribution: 'Polo-Castañeda, Gómez-Rojas & Linero-Cueto (2021), IJASEIT 11(5), doi:10.18517/ijaseit.11.5.14293. Datos: SIAM/INVEMAR, Wikiloc y Shipmap, ANH/DIMAR. Clases 1/2/3 del autor, reducidas a 250 m (moda)',
  grid: { crs: 'EPSG:3116', width, height, resM: RES, haPerPixel: (RES * RES) / 10000, transform: [RES, 0, X0, 0, -RES, Y0] },
  layers,
  mask: { path: 'layers/mask.u8.gz', legend: { '0': 'fuera del área de trabajo (isóbata de 200 m)', '1': 'válido', '2': 'concesión / zona de fondeo (exclusión)' } },
  base: '',
  points: {
    'Santa Marta': { lat: 11.2408, lon: -74.199 }, 'Taganga': { lat: 11.2703, lon: -74.19 },
    'Riohacha': { lat: 11.5444, lon: -72.9072 }, 'Barranquilla': { lat: 10.9685, lon: -74.7813 },
  },
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log('paquete escrito en', OUT, '·', Object.values(layers as Record<string, { bytes: number }>).reduce((a, l) => a + l.bytes, 0), 'B de capas');
