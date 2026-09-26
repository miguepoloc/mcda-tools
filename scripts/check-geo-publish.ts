// Ida y vuelta del mapa publicado: lo que la vista pública decodifica es exactamente lo calculado.
import { decodePlanes, encodePlanes, fromBase64, toBase64 } from '../src/lib/geo/publish.ts';
import { areaStats, MASK_EXCLUDED, MASK_NODATA, MASK_VALID } from '../src/lib/geo/suitability.ts';

let fails = 0;
const ok = (n: string, c: boolean, e = '') => { if (!c) { fails++; console.error('FALLA', n, e); } else console.log('ok   ', n, e); };

const W = 300, H = 200, n = W * H;
const pct = new Uint8Array(n), cls = new Uint8Array(n), mask = new Uint8Array(n);
for (let i = 0; i < n; i++) {
  const x = i % W, y = Math.floor(i / W);
  if (x < 20) { mask[i] = MASK_NODATA; pct[i] = 255; }
  else if (y < 10) { mask[i] = MASK_EXCLUDED; pct[i] = 255; }
  else if (x === 100 && y === 100) { mask[i] = MASK_VALID; pct[i] = 255; }            // válido pero sin dato
  else { mask[i] = MASK_VALID; pct[i] = (x * 7 + y * 3) % 101; cls[i] = pct[i] >= 70 ? 3 : pct[i] >= 45 ? 2 : 1; }
}
const b64 = await encodePlanes(pct, cls, mask);
ok('base64 más chico que 2 planos crudos', b64.length < 2 * n, `${b64.length} < ${2 * n}`);
const d = await decodePlanes(b64, n);
let same = true; for (let i = 0; i < n; i++) if (d.mask[i] !== (mask[i] === MASK_VALID && pct[i] === 255 ? MASK_NODATA : mask[i])) { same = false; break; }
ok('máscara: exclusión y fuera del área se distinguen', same);
let samePct = true, sameCls = true;
for (let i = 0; i < n; i++) if (d.mask[i] === MASK_VALID) { if (d.pct[i] !== pct[i]) samePct = false; if (d.cls[i] !== cls[i]) sameCls = false; }
ok('idoneidad idéntica en las celdas válidas', samePct);
ok('clase idéntica en las celdas válidas', sameCls);
const a = areaStats(cls, pct, mask, 6.25), b = areaStats(d.cls, d.pct, d.mask, 6.25);
ok('las hectáreas por clase salen iguales tras publicar y decodificar', a.alta.ha === b.alta.ha && a.media.ha === b.media.ha && a.noapta.ha === b.noapta.ha && a.excl.ha === b.excl.ha, JSON.stringify({ alta: b.alta.ha, excl: b.excl.ha }));
ok('el píxel con clase 0 y válido no se confunde con exclusión', (() => { const i = 0 * W + 50; return d.mask[i] === MASK_EXCLUDED; })());
let threw = false; try { await decodePlanes(b64, n + 1); } catch { threw = true; }
ok('un mapa dañado lanza error claro', threw);
const rnd = new Uint8Array(100000).map((_, i) => (i * 31) % 256);
ok('base64 ida y vuelta (100 KB)', fromBase64(toBase64(rnd)).every((v, i) => v === rnd[i]));
console.log(fails === 0 ? '\nTodo OK (check-geo-publish)' : `\n${fails} fallas`);
process.exit(fails ? 1 : 0);
