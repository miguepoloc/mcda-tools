// Ida y vuelta del mapa publicado: lo que la vista pública decodifica es exactamente lo calculado.
import { CODE_EXCLUDED, CODE_NODATA, decodePlanes, encodePlanes, fromBase64, publishedView, toBase64, type PublishedMeta } from '../src/lib/geo/publish.ts';
import { areaStats, CLASS_VETO, MASK_EXCLUDED, MASK_NODATA, MASK_VALID } from '../src/lib/geo/suitability.ts';

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
// --- v1 y v2 del meta publicado
{
  const base = { grid: { crs: 'EPSG:32618', width: 4, height: 1, resM: 100, haPerPixel: 1, transform: [100, 0, 0, 0, -100, 0] as [number, number, number, number, number, number] },
    bounds: { west: 0, south: 0, east: 1, north: 1 }, weights: [], cr: 0, nExperts: 0, weightsOrigin: '', evaluableHa: 100 };
  const v1: PublishedMeta = { ...base, v: 1, thresholds: { alta: 0.7, media: 0.45 }, classes: { alta: 30, media: 20, noapta: 50, excl: 7 }, pct: { alta: 30, media: 20, noapta: 50 } };
  const a1 = publishedView(v1);
  ok('v1 se lee como aptitud de 3 clases', a1.direction === 'suitability' && a1.classes.length === 3 && a1.classes[0].name === 'No apta' && a1.classes[2].name === 'Alta aptitud' && a1.classes[2].from === 0.7 && a1.legacyVeto === true && a1.exclHa === 7);
  const v2: PublishedMeta = { ...base, v: 2, direction: 'risk', vetoHa: 3, exclHa: 9,
    classes: [{ name: 'Bajo', from: 0, to: 0.25, ha: 10, pct: 10 }, { name: 'Medio', color: '#112233', from: 0.25, to: 0.5, ha: 20, pct: 20 }, { name: 'Alto', from: 0.5, to: 0.75, ha: 30, pct: 30 }, { name: 'Muy alto', from: 0.75, to: 1, ha: 40, pct: 40 }] };
  const a2 = publishedView(v2);
  ok('v2: dirección, clases y veto', a2.direction === 'risk' && a2.classes.length === 4 && a2.classes[1].color === '#112233' && a2.vetoHa === 3 && a2.legacyVeto === false && a2.exclHa === 9);
  ok('v2 sobrevive a JSON (lo que viaja a Supabase)', JSON.stringify(publishedView(JSON.parse(JSON.stringify(v2)))) === JSON.stringify(a2));

  // planos: v1 codificaba la vetada como 4; v2 la codifica como CLASS_VETO y puede usar 1..8
  const p = Uint8Array.from([10, 20, 30, 40, 50, 60]);
  const mk = Uint8Array.from([MASK_VALID, MASK_VALID, MASK_VALID, MASK_VALID, MASK_EXCLUDED, MASK_NODATA]);
  const old = await decodePlanes(await encodePlanes(p, Uint8Array.from([1, 2, 3, 4, 0, 0]), mk), 6, { legacyVeto: true });
  ok('v1: el 4 se lee como vetada', old.cls[3] === CLASS_VETO && old.cls[0] === 1 && old.cls[2] === 3 && old.mask[4] === MASK_EXCLUDED && old.mask[5] === MASK_NODATA);
  const nw = await decodePlanes(await encodePlanes(p, Uint8Array.from([1, 4, 8, CLASS_VETO, 0, 0]), mk), 6);
  ok('v2: 4 y 8 son clases; la vetada conserva su código; 0 y 254 se mantienen', nw.cls[1] === 4 && nw.cls[2] === 8 && nw.cls[3] === CLASS_VETO && nw.mask[4] === MASK_EXCLUDED && nw.mask[5] === MASK_NODATA);
  ok('códigos consecutivos: CLASS_VETO y CODE_NODATA no chocan con 1..8', CLASS_VETO > 8 && CLASS_VETO !== CODE_NODATA && CODE_EXCLUDED === 0 && CODE_NODATA === 254);
}
console.log(fails === 0 ? '\nTodo OK (check-geo-publish)' : `\n${fails} fallas`);
process.exit(fails ? 1 : 0);
