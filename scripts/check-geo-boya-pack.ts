// Paquete `boya-wsn-v1` (caso de la boya, Polo-Castañeda et al. 2021): el motor del geovisor, con los pesos publicados (Tabla V) y
// las clases 1/2/3 del autor, debe dar los mismos porcentajes que la geometría del polígono de resultado del archivo original.
// Referencia (scripts/validation/boya-resultado-areas.mjs sobre Final/Resultado.shp): 82.89 % apto / 14.03 % moderado / 3.07 % no apto,
// 8 466.3 km². El paquete está reducido de 38.68 × 17.89 m a 250 m (moda de cada bloque), de ahí la tolerancia.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { dequantizeLayer } from '../src/lib/geo/quant.ts';
import { areaStats, evaluateGrid, MASK_EXCLUDED, MASK_NODATA, MASK_VALID, type CriterionRule } from '../src/lib/geo/suitability.ts';
import { BOYA_RULES, BOYA_CLASSES, buildExample } from '../src/lib/geo/examples.ts';
import { CRIT_SHEET, aggMatrix, indexJudgments, sheetResult } from '../src/lib/ahp.ts';
import { consensus } from '../src/lib/ahpGroup.ts';
import fixture from './validation/data/encuesta-2021.json' with { type: 'json' };

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };

const dir = path.resolve(import.meta.dirname, '../public/geo-packs/boya-wsn-v1');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const gunzip = (p: string) => new Uint8Array(zlib.gunzipSync(fs.readFileSync(path.join(dir, p))));
const { width, height, haPerPixel } = manifest.grid;
const mask = gunzip(manifest.mask.path);
const layers: Record<string, Float32Array> = {};
for (const [k, m] of Object.entries<{ min: number; max: number; path: string }>(manifest.layers)) layers[k] = dequantizeLayer(gunzip(m.path), m.min, m.max);

ok(mask.length === width * height && Object.values(layers).every((l) => l.length === mask.length), `rejilla ${width}×${height} coherente en las 4 capas y la máscara`);
const count = (code: number) => mask.reduce((a, m) => a + (m === code ? 1 : 0), 0);
const km2 = (n: number) => (n * haPerPixel) / 100;
ok(Math.abs(km2(count(MASK_VALID)) - 8466.3) < 15, `área válida ${km2(count(MASK_VALID)).toFixed(1)} km² (original 8 466.3)`);
ok(Math.abs(km2(count(MASK_VALID) + count(MASK_EXCLUDED)) - 9893.6) < 20, `área de trabajo ${km2(count(MASK_VALID) + count(MASK_EXCLUDED)).toFixed(1)} km² (polígono 9 893.6; artículo ≈ 9 887)`);
ok(Object.values(layers).every((l) => l.every((v, i) => (mask[i] === MASK_VALID ? v === 1 || v === 2 || v === 3 : Number.isNaN(v)))), 'donde hay dato las clases son exactamente 1/2/3; fuera es sin dato');

// Pesos publicados (Tabla V) con las reglas del ejemplo.
const w = { eco: 0.5482, trafico: 0.1423, pesca: 0.2020, bati: 0.1075 };
const rules: CriterionRule[] = BOYA_RULES.map((r) => ({ key: r.layerKey, weight: w[r.layerKey as keyof typeof w], fn: r.fn }));
const { pct, cls } = evaluateGrid(layers, mask, rules, BOYA_CLASSES);
const st = areaStats(cls, pct, mask, haPerPixel);
const p = [st.alta.pct, st.media.pct, st.noapta.pct];
console.log(`     paquete a 250 m: ${p.map((x) => x.toFixed(2)).join(' / ')} %  ·  original: 82.89 / 14.03 / 3.07 %  ·  evaluable ${(st.evaluableHa / 100).toFixed(1)} km²`);
ok(Math.abs(p[0] - 82.89) < 0.6 && Math.abs(p[1] - 14.03) < 0.6 && Math.abs(p[2] - 3.07) < 0.6, 'los tres porcentajes están a menos de 0.6 puntos de la geometría del resultado original (no del 62.36 % del artículo)');
ok(Math.abs(p[0] - 62.36) > 15, 'y NO reproducen el 62.36 % publicado, que era un artefacto de suma de atributos');
ok(st.excl.ha > 0 && mask.some((m) => m === MASK_NODATA), 'las concesiones quedan como exclusión y fuera del área queda sin dato');

// El ejemplo precargado: criterios ↔ capas del paquete, los 4 expertos de la encuesta y los pesos que salen de ellos.
{
  const ex = buildExample('boya-2021');
  ok(ex.geo.packId === 'boya-wsn-v1' && ex.hasData && ex.criteria.length === 4, 'el ejemplo apunta al paquete y trae 4 criterios');
  ok(ex.criteria.every((c) => ex.geo.rules[c.id] && manifest.layers[ex.geo.rules[c.id].layerKey]), 'cada criterio tiene una regla sobre una capa que existe en el paquete');
  ok(ex.experts?.length === 4 && ex.experts.every((e, i) => e.name === `Experto ${i + 1}`), 'trae los 4 expertos de la encuesta, con identidad reservada (Experto 1..4)');
  const rows = ex.experts!.flatMap((e, k) => e.judgments.map((j) => ({ expert_id: 'e' + k, sheet: CRIT_SHEET, pair_key: j.key, value: j.value })));
  const ids = ex.experts!.map((_, k) => 'e' + k);
  const r = sheetResult(CRIT_SHEET, ex.criteria, ids, indexJudgments(rows));
  // La media geométrica de los 4 expertos es la hoja «Todo» del archivo = Tabla IV del artículo.
  const T4 = fixture.aggregate_todo as number[][];
  const G = aggMatrix(ex.criteria, ids.map((id) => indexJudgments(rows)[id][CRIT_SHEET]));
  ok(G.every((row, i) => row.every((x, j) => Math.abs(x - T4[i][j]) < 1e-4)), 'la media geométrica de los 4 expertos es exactamente la Tabla IV del artículo (hoja «Todo»)');
  const pub = [0.5482, 0.1423, 0.2020, 0.1075];
  ok(r.agg.w.every((x, i) => Math.abs(x - pub[i]) < 2e-4) && Math.abs(r.agg.cr - 0.0652) < 1e-3, `pesos [${r.agg.w.map((x) => x.toFixed(4)).join(', ')}] y CR ${r.agg.cr.toFixed(4)}: son los publicados (0.5482, 0.1423, 0.2020, 0.1075; CR 0.0652)`);
  const c = consensus(r.per.map((a) => a.w))!;
  console.log(`     por experto: ${r.per.map((a) => 'CR ' + a.cr.toFixed(3)).join(' · ')} · consenso S* ${(c.sStar * 100).toFixed(1)} % (${c.category})`);
  ok(ex.geo.classes.alta === 0.75 && ex.geo.classes.media === 0.25, 'cortes 0.75 / 0.25 = los cortes 1.5 y 2.5 del resultado original');
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK (check-geo-boya-pack)');
process.exit(fallos ? 1 : 0);
