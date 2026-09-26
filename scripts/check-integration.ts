// Prueba de humo de la INTEGRACIÓN de los desgloses en Results (pantalla) y en el Informe ejecutivo. Igual que check-outranking-breakdown.ts: sin
// bundler, se transpilan lib/ y components/ a un directorio temporal con TypeScript, se renderiza a HTML con react-dom/server y se comprueba que
// Con DUMP_DIR=<carpeta> vuelca el HTML renderizado de cada pantalla para revisarlo a ojo.
// (1) no aparece NaN/undefined/Infinity, (2) cada método muestra su desglose paso a paso y el resto de secciones nuevas, y (3) el informe trae el
// apéndice de cálculo, la sensibilidad y la comparación con todo abierto (sin <details> cerrados, que no se imprimen).
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };

const ROOT = join(process.cwd(), 'src');
const OUT = join(process.cwd(), 'node_modules', '.cache', 'check-integration');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'package.json'), '{"type":"module"}');

const want = (f: string) => /src\/lib\/[^/]+\.ts$/.test(f) || /src\/components\/(calc\/)?[^/]+\.tsx?$/.test(f);
const files: string[] = [];
(function walk(d: string) { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) { if (!/(geo|admin|supabase|app)$/.test(p)) walk(p); } else if (want(p.replaceAll('\\', '/'))) files.push(p); } })(ROOT);
for (const f of files) {
  const out = ts.transpileModule(readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, fileName: f }).outputText;
  const outFile = join(OUT, relative(ROOT, f)).replace(/\.tsx?$/, '.js');
  const fixed = out.replace(/from ['"]([^'"]+)['"]/g, (_m, s: string) => {
    let t = s;
    if (s.startsWith('@/')) t = relative(dirname(outFile), join(OUT, s.slice(2)));
    if (t.startsWith('.') || s.startsWith('@/')) { if (!t.startsWith('.')) t = './' + t; t = t.replace(/\.tsx?$/, ''); if (!t.endsWith('.js')) t += '.js'; }
    return `from '${t.replaceAll('\\', '/')}'`;
  });
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, fixed);
}

const { createElement: h } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const load = async (p: string) => (await import(pathToFileURL(join(OUT, p)).href));
const Results = (await load('components/Results.js')).default;
const Report = (await load('components/ExecutiveReportModal.js')).default;
const lib = {
  ahp: await load('lib/ahp.js'), topsis: await load('lib/topsis.js'), vikor: await load('lib/vikor.js'), promethee: await load('lib/promethee.js'),
  electre: await load('lib/electre.js'), saw: await load('lib/saw.js'), bd: await load('lib/ahpBreakdown.js'), rc: await load('lib/rankCompare.js'),
  prio: await load('lib/prio.js'),
};

const text = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/\s+/g, ' ');
const clean = (html: string) => !/NaN|undefined|Infinity|\[object/.test(text(html));

// Caso del curso (Palmor, sesión 3/4): 4 tecnologías × 4 criterios, todos de beneficio.
const alts = ['LoRaWAN', 'GSM/GPRS', 'Sigfox', 'Zigbee'].map((name, i) => ({ id: 'a' + i, name }));
const crits = ['Alcance', 'Autonomía', 'Infraestructura', 'Madurez'].map((name, j) => ({ id: 'c' + j, name, hint: '' }));
const M = [[10, 8, 2, 5], [10.5, 0.5, 3, 2], [40, 2, 5, 2], [0.07, 1.5, 2, 4]];
const dm: { values: Record<string, Record<string, number>>; types: Record<string, string> } = { values: {}, types: {} };
alts.forEach((a, i) => { dm.values[a.id] = {}; crits.forEach((c, j) => { dm.values[a.id][c.id] = M[i][j]; }); });
crits.forEach((c) => { dm.types[c.id] = 'max'; });

// Juicios de 2 expertos (AHP): criterios y una hoja por criterio, todos los pares, valores pequeños y distintos por experto.
const experts = [{ id: 'e1', label: 'Experto 1 · ML', role: 'ML' }, { id: 'e2', label: 'Experto 2 · Campo', role: 'Campo' }];
const judgments: { expert_id: string; sheet: string; pair_key: string; value: number }[] = [];
const sheets = [{ key: 'crit', items: crits }, ...crits.map((c) => ({ key: 'alt:' + c.id, items: alts }))];
sheets.forEach((sh, si) => experts.forEach((e, ei) => {
  for (let i = 0; i < sh.items.length; i++) for (let j = i + 1; j < sh.items.length; j++) {
    judgments.push({ expert_id: e.id, sheet: sh.key, pair_key: `${sh.items[i].id}-${sh.items[j].id}`, value: ((i * 3 + j * 5 + si + ei * 2) % 5) - 2 });
  }
}));

// Parte A (priorización) mínima pero real
const prio = lib.prio.normalizePrio({
  cands: [
    { id: 'p1', name: 'Alcance', at: 'keep', keep: true, ratings: { v1: 5, v2: 5, v3: 4 } },
    { id: 'p2', name: 'Autonomía', at: 'keep', keep: true, ratings: { v1: 5, v2: 4, v3: 5 } },
    { id: 'p3', name: 'Infraestructura', at: 'keep', keep: true, ratings: { v1: 4, v2: 4, v3: 4 } },
    { id: 'p4', name: 'Madurez', at: 'keep', keep: true, ratings: { v1: 4, v2: 5, v3: 4 } },
    { id: 'p5', name: 'Color', at: 'drop', keep: false, reason: 'irrelevante', evidence: 'no afecta el despliegue' },
  ],
  evaluators: [{ id: 'v1', name: 'A' }, { id: 'v2', name: 'B' }, { id: 'v3', name: 'C' }], cutoff: 4.0,
});

const baseProps = (method: string, extra: object = {}) => ({
  mode: 'single', criteria: crits, alternatives: alts, experts, judgments, method, weightingMethod: 'ahp', decisionMatrix: dm, showPerExpert: true,
  projectTitle: 'Palmor', projectObjective: 'Elegir la tecnología de comunicación', prio, ...extra,
});

for (const method of ['ahp', 'topsis', 'vikor', 'promethee', 'electre', 'saw']) {
  const html = renderToStaticMarkup(h(Results, baseProps(method)));
  if (process.env.DUMP_DIR) writeFileSync(join(process.env.DUMP_DIR, `results-${method}.html`), html);
  const t = text(html);
  ok(clean(html), `Results ${method}: sin NaN/undefined/Infinity`);
  ok(/id="desglose"/.test(html), `Results ${method}: ancla «desglose» presente`);
  ok(/Selección de criterios/.test(t), `Results ${method}: muestra la selección de criterios (Parte A)`);
  ok(/Análisis de sensibilidad|Sensibilidad|sensibilidad/.test(t), `Results ${method}: muestra sensibilidad`);
  ok(!/<details class="calc-sec calc-sec-fold"[^>]* open/.test(html) && /<details class="calc-sec calc-sec-fold"/.test(html), `Results ${method}: los bloques del desglose empiezan CERRADOS`);
  ok(/<nav class="calc-index"/.test(html), `Results ${method}: índice fijo del desglose presente`);
  {
    const iM = html.search(/id="desglose-metodo"/), iP = html.search(/id="desglose-pesos"/), iS = html.search(/id="desglose-seleccion"/), iSens = html.search(/id="desglose-sensibilidad"/);
    const seq = [iM, iP, iS, iSens].filter((x) => x >= 0);
    ok(seq.every((x, i) => i === 0 || x > seq[i - 1]) && iSens >= 0, `Results ${method}: orden método → pesos → selección → sensibilidad`);
  }
  if (method === 'ahp') ok(/Matriz de comparación|comparación pareada|Matriz agregada|λ ?max/i.test(t) && /pesos iguales|1\/n/i.test(t), 'Results ahp: matrices, λmax y comparación con pesos iguales');
  if (method === 'topsis') ok(/ideal/i.test(t) && /ponderada/i.test(t) && /D⁺|D\+/.test(t), 'Results topsis: matriz ponderada, ideales y distancias');
  if (method === 'vikor') ok(/ΔQ|DQ/.test(t) && /más corta/i.test(t), 'Results vikor: condiciones C1/C2 y barra «más corta = mejor»');
  if (method === 'promethee') ok(/φ/.test(t) && /π/.test(t), 'Results promethee: matriz π y flujos');
  if (method === 'electre') ok(/Concordancia/i.test(t) && /Discordancia/i.test(t) && /núcleo/i.test(t), 'Results electre: concordancia, discordancia y núcleo');
}

// Sin priorización (vista pública): no revienta y no muestra la selección
{
  const html = renderToStaticMarkup(h(Results, baseProps('topsis', { prio: undefined })));
  ok(clean(html) && !/Selección de criterios/.test(text(html)), 'Results sin prio (vista pública): no muestra la selección de criterios y no revienta');
}
// Comparativa
{
  const html = renderToStaticMarkup(h(Results, baseProps('topsis', { mode: 'compare' })));
  const t = text(html);
  ok(clean(html) && /Spearman|Kendall/i.test(t), 'Results comparativa: incluye concordancia entre rankings (Spearman/Kendall)');
}

// Informe: se arma con los mismos datos que Results le pasa
function reportProps(method: string) {
  const w = lib.ahp.sheetResult('crit', crits, ['e1', 'e2'], lib.ahp.indexJudgments(judgments), 'eigenvector').agg.w;
  const idx = lib.ahp.indexJudgments(judgments);
  const syn = lib.ahp.synthesis(crits, alts, ['e1', 'e2'], idx, 'eigenvector');
  const rmap: Record<string, { name: string; score: number; rank: number }[]> = {
    ahp: syn.rows.map((r: { name: string; g: number; rank: number }) => ({ name: r.name, score: r.g, rank: r.rank })),
    topsis: lib.topsis.topsisSynthesis(crits, alts, dm, w).rows.map((r: { name: string; c: number; rank: number }) => ({ name: r.name, score: r.c, rank: r.rank })),
    vikor: lib.vikor.vikorSynthesis(crits, alts, dm, w).rows.map((r: { name: string; q: number; rank: number }) => ({ name: r.name, score: r.q, rank: r.rank })),
    promethee: lib.promethee.prometheeSynthesis(crits, alts, dm, w).rows.map((r: { name: string; phi: number; rank: number }) => ({ name: r.name, score: r.phi, rank: r.rank })),
    saw: lib.saw.sawSynthesis(crits, alts, dm, w).rows.map((r: { name: string; value: number; rank: number }) => ({ name: r.name, score: r.value, rank: r.rank })),
    electre: [],
  };
  const el = lib.electre.electreSynthesis(crits, alts, dm, w, 0.65, 0.3);
  const breakdown = method === 'ahp' || true
    ? lib.bd.buildAhpBreakdownData({ criteria: crits, alternatives: alts, experts: experts.map((e) => ({ id: e.id, label: e.label, role: e.role })), used: ['e1', 'e2'], idx, weightMethod: 'eigenvector', withAlternatives: method === 'ahp' })
    : undefined;
  const cmpMethods = ['topsis', 'vikor', 'promethee', 'saw'].map((k) => ({
    key: k, label: k, ranks: alts.map((a) => rmap[k].find((r) => r.name === a.name)?.rank ?? null), scores: alts.map((a) => rmap[k].find((r) => r.name === a.name)?.score ?? null),
    params: lib.rc.describeMethodParams(k, { vikorV: 0.5 }),
  }));
  return {
    projectTitle: 'Palmor', projectObjective: 'Elegir la tecnología', method, criteria: crits, alternatives: alts, decisionMatrix: dm, weights: w, weightingMethod: 'ahp',
    rankingRows: rmap[method],
    ahp: method === 'ahp' || true ? { weightMethod: 'eigenvector', expertCount: 2, criteriaSheet: { label: 'Criterios', n: 4, cr: 0.05, ok: true, answered: 12, total: 12, perExpert: [] }, altSheets: [], local: method === 'ahp' ? syn.rows.map((r: { loc: number[] }) => r.loc) : [] } : undefined,
    electre: method === 'electre' ? { names: el.names, outranks: el.result.outranks, concordance: el.result.concordance, discordance: el.result.discordance, cStar: 0.65, dStar: 0.3 } : undefined,
    vikorV: method === 'vikor' ? 0.5 : undefined,
    prio, ahpBreakdown: breakdown, comparison: { methods: cmpMethods, electre: lib.rc.electreCompareInfo(el), weightsNote: 'AHP' }, onClose: () => {},
  };
}
for (const method of ['ahp', 'topsis', 'vikor', 'promethee', 'electre']) {
  const html = renderToStaticMarkup(h(Report, reportProps(method)));
  const t = text(html);
  ok(clean(html), `Informe ${method}: sin NaN/undefined/Infinity`);
  ok(/Selección de Criterios/.test(t) && /Estructura de la Decisión/.test(t), `Informe ${method}: selección de criterios y estructura de la decisión`);
  ok(/Apéndice de Cálculo/.test(t) && /Análisis de Sensibilidad/.test(t) && /Comparación con Otros Métodos/.test(t), `Informe ${method}: apéndice de cálculo, sensibilidad y comparación`);
  ok(!/<details/.test(html), `Informe ${method}: sin <details> (todo abierto para imprimir)`);
  ok(!/id="desglose-/.test(html), `Informe ${method}: sin anclas duplicadas con la página de fondo`);
  if (method !== 'ahp') {
    const iM = t.search(method === 'topsis' ? /Cómo se calculó TOPSIS/ : method === 'vikor' ? /Cómo se calculó VIKOR/ : method === 'promethee' ? /Cálculo de PROMETHEE/ : /Cálculo de ELECTRE/);
    const iW = t.search(/Cómo se obtuvieron los pesos con AHP/);
    ok(iM >= 0 && iW > iM, `Informe ${method}: en el apéndice va primero el método y después los pesos AHP`);
  }
  ok(!/no incluye un análisis de sensibilidad/.test(t), `Informe ${method}: ya no dice que carece de sensibilidad`);
  if (process.env.DUMP_DIR) writeFileSync(join(process.env.DUMP_DIR, `informe-${method}.html`), html);
  const nums = [...html.matchAll(/<h3 class="rpt-h"[^>]*>(\d+)\./g)].map((m) => Number(m[1]));
  ok(nums.length > 5 && nums.every((n, i) => n === i + 1), `Informe ${method}: secciones numeradas consecutivas (${nums.join(',')})`);
}

rmSync(OUT, { recursive: true, force: true });
console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
