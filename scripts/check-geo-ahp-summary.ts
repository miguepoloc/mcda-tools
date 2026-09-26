// Resumen AHP que se publica con el mapa (vista pública): con los 4 expertos de la encuesta de la boya debe dar la Tabla IV, los pesos
// publicados, el consenso y los CR por experto; y no debe filtrar nombres de expertos.
import { CRIT_SHEET, indexJudgments, sheetResult } from '../src/lib/ahp.ts';
import { ahpSummary } from '../src/lib/geo/ahpSummary.ts';
import { buildExample } from '../src/lib/geo/examples.ts';
import fixture from './validation/data/encuesta-2021.json' with { type: 'json' };

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };

const ex = buildExample('boya-2021');
const ids = ex.experts!.map((_, k) => 'e' + k);
const rows = ex.experts!.flatMap((e, k) => e.judgments.map((j) => ({ expert_id: 'e' + k, sheet: CRIT_SHEET, pair_key: j.key, value: j.value })));
const r = sheetResult(CRIT_SHEET, ex.criteria, ids, indexJudgments(rows));
const s = ahpSummary(ex.criteria, r)!;

const T4 = fixture.aggregate_todo as number[][];
ok(s.matrix.every((row, i) => row.every((x, j) => Math.abs(x - T4[i][j]) < 1e-4)), 'la matriz publicada es la Tabla IV (media geométrica de los 4 expertos)');
ok([0.5482, 0.1423, 0.2020, 0.1075].every((w, i) => Math.abs(s.weights[i] - w) < 2e-4) && Math.abs(s.cr - 0.0652) < 1e-3 && s.method === 'eigenvector', `pesos ${s.weights.map((x) => x.toFixed(4)).join(' / ')}, CR ${s.cr.toFixed(4)}, eigenvector`);
ok(s.lambda > 4 && Math.abs(s.ci - (s.lambda - 4) / 3) < 1e-12 && s.ri === 0.9, `λmax ${s.lambda.toFixed(4)}, CI ${s.ci.toFixed(4)}, RI ${s.ri}`);
ok(s.consensus !== null && Math.abs(s.consensus.sStar - 0.822) < 5e-3 && s.consensus.category === 'high', `consenso S* ${(s.consensus!.sStar * 100).toFixed(1)} % (alto)`);
ok(s.experts.length === 4 && s.experts.map((e) => e.cr.toFixed(2)).join(',') === '0.09,0.07,0.06,0.38', `CR por experto ${s.experts.map((e) => e.cr.toFixed(3)).join(', ')} (el 4.º es inconsistente)`);
ok(s.uncertainty !== null && s.uncertainty.accepted > 900 && s.uncertainty.minus.every((x) => x >= 0) && s.uncertainty.plus.every((x) => x >= 0), 'incertidumbre Monte Carlo presente y no negativa');
const json = JSON.stringify(s);
ok(s.experts.every((e, i) => e.label === `Experto ${i + 1}`) && !/Silvia|Julio|Migue|Jorge/.test(json) && json.length < 4000, `sin nombres de expertos; ${json.length} B en el JSON publicado`);
ok(JSON.stringify(ahpSummary(ex.criteria, sheetResult(CRIT_SHEET, ex.criteria, [], {}))) === 'null', 'sin expertos con respuestas no se publica resumen (null)');

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK (check-geo-ahp-summary)');
process.exit(fallos ? 1 : 0);
