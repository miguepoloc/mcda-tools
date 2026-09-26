// Validation of the buoy case (Polo-Castañeda et al. 2021, IJASEIT 11(5) 1696-1703).
// Reads the four classified criterion rasters and the published result raster (Final.tif) from the author's
// local archive and recovers the weights of the weighted linear combination S = Σ w_i·x_i by least squares.
// Data are NOT in this repository. Usage:
//   BOYA_RASTER_DIR=".../Mapas/TESIS/Raster" node scripts/validation/boya-map-algebra.mjs
// Expected (paper, Table V): ecosystems 0.5482, boat traffic 0.1423, fishing 0.2020, bathymetry 0.1075.
import { fromFile } from 'geotiff';

const dir = process.env.BOYA_RASTER_DIR;
if (!dir) { console.log('BOYA_RASTER_DIR not set: skipped (the rasters are not distributed with the code).'); process.exit(0); }
const names = ['Ecosistemas_Marinos', 'Lanchas', 'Pesca_Artesanal', 'Batimetria'];
const expected = [0.5482, 0.1423, 0.2020, 0.1075];
const ims = [];
for (const f of [...names, 'Final']) ims.push(await (await fromFile(`${dir}/${f}.tif`)).getImage());
const [W, H] = [ims[0].getWidth(), ims[0].getHeight()];
const CH = 500, K = names.length;
const XtX = Array.from({ length: K }, () => Array(K).fill(0));
const Xty = Array(K).fill(0);
let n = 0, maxAbsRes = 0;
const cum = new Map();
for (let y = 0; y < H; y += CH) {
  const b = [];
  for (const im of ims) b.push((await im.readRasters({ window: [0, y, W, Math.min(y + CH, H)], samples: [0] }))[0]);
  for (let i = 0; i < b[4].length; i++) {
    const f = b[4][i];
    if (!(f > -1e30) || b[0][i] === 0) continue; // nodata in Final (−3.4e38) and in the inputs (0)
    const x = names.map((_, k) => b[k][i] - 1);
    n++;
    for (let a = 0; a < K; a++) { Xty[a] += x[a] * (f - 1); for (let c = 0; c < K; c++) XtX[a][c] += x[a] * x[c]; }
    const key = f.toFixed(4); cum.set(key, (cum.get(key) ?? 0) + 1);
  }
}
const solve = (A, v) => { const m = A.map((r, i) => [...r, v[i]]); for (let i = 0; i < K; i++) { let p = i; for (let r = i + 1; r < K; r++) if (Math.abs(m[r][i]) > Math.abs(m[p][i])) p = r; [m[i], m[p]] = [m[p], m[i]]; for (let r = 0; r < K; r++) { if (r === i) continue; const q = m[r][i] / m[i][i]; for (let c = i; c <= K; c++) m[r][c] -= q * m[i][c]; } } return m.map((r, i) => r[K] / r[i]); };
const w = solve(XtX, Xty);
console.log('valid pixels', n, '| cell', ims[0].getResolution().slice(0, 2).map((v) => Math.abs(v).toFixed(3)).join(' x '), 'm');
names.forEach((nm, k) => console.log(nm.padEnd(22), w[k].toFixed(5), 'expected', expected[k].toFixed(4), Math.abs(w[k] - expected[k]) < 5e-4 ? 'OK' : 'DIFFERENT'));
console.log('sum of weights', w.reduce((a, b) => a + b, 0).toFixed(6));
