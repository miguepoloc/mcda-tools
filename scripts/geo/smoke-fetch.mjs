// Smoke test manual (no forma parte de npm test): reproduce exactamente lo que hace
// src/lib/geo/pack.ts en el navegador (fetch + DecompressionStream('gzip') + dequantize), pero
// contra un `next start` real, para probar el servido estático + la decodificación de verdad, sin
// levantar un navegador. Uso: node scripts/geo/smoke-fetch.mjs <base-url>
const base = process.argv[2] ?? 'http://localhost:3917';

async function fetchGunzip(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const ds = new DecompressionStream('gzip');
  const buf = await new Response(res.body.pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}
function dequantize(q, lo, hi) { return q === 255 ? NaN : lo + (q / 254) * (hi - lo); }

const manifest = await fetch(`${base}/geo-packs/snsm-cacao-v1/manifest.json`).then((r) => r.json());
console.log('manifest.grid:', manifest.grid);

const temp = await fetchGunzip(`${base}/geo-packs/snsm-cacao-v1/${manifest.layers.temp.path}`);
console.log('temp.u8.gz descomprimido:', temp.length, 'bytes (esperado', manifest.grid.width * manifest.grid.height, ')');
if (temp.length !== manifest.grid.width * manifest.grid.height) throw new Error('tamaño no coincide');

// Palmor: row=318, col=95 (mismo píxel que scripts/check-geo-suitability.ts) — temp esperado 22.687513°C.
const { width } = manifest.grid;
const i = 318 * width + 95;
const raw = temp[i];
const real = dequantize(raw, manifest.layers.temp.min, manifest.layers.temp.max);
console.log(`Palmor: crudo=${raw} -> ${real.toFixed(3)}°C (esperado 22.688°C, ±medio paso de cuantización u8 ≈ 0.055°C)`);
if (Math.abs(real - 22.687513) > 0.06) throw new Error('FALLA: temperatura de Palmor no coincide (más allá del error de cuantización esperado)');

const mask = await fetchGunzip(`${base}/geo-packs/snsm-cacao-v1/${manifest.mask.path}`);
console.log('mask descomprimida:', mask.length, 'bytes, código en Palmor =', mask[i], '(esperado 1 = válido)');
if (mask[i] !== 1) throw new Error('FALLA: máscara de Palmor no es válida');

const base_png = await fetch(`${base}/geo-packs/snsm-cacao-v1/${manifest.base}`);
console.log('base.png:', base_png.status, base_png.headers.get('content-type'), base_png.headers.get('content-length'), 'bytes');

console.log('\nOK: fetch + gzip real + dequantize reproduce el dato del notebook.');
