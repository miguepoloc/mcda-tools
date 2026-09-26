// Prueba de humo de los desgloses ElectreBreakdown y PrometheeBreakdown (sesión 4). No hay bundler en el proyecto, así que se transpilan a un
// directorio temporal con TypeScript (sin comprobar tipos: eso lo hace `npm run typecheck`), se renderizan a HTML con react-dom/server en los dos
// modos (screen y report) y se comprueba que (1) no aparece NaN/undefined/Infinity, (2) los números de las diapositivas de la sesión 4 salen
// escritos en la página (viaje y caso IoT/Palmor) y (3) el informe (todo abierto) trae los pasos completos, sin <details> cerrados.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };

const ROOT = join(process.cwd(), 'src');
const OUT = join(process.cwd(), 'node_modules', '.cache', 'check-outranking');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'package.json'), '{"type":"module"}');

const want = (f: string) => /src\/lib\/[^/]+\.ts$/.test(f) || /src\/components\/calc\/[^/]+\.tsx?$/.test(f) || /src\/components\/(Electre[A-Za-z]*|PrometheeFlows)\.tsx$/.test(f);
const files: string[] = [];
(function walk(d: string) { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p); else if (want(p.replaceAll('\\', '/'))) files.push(p); } })(ROOT);
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
const load = async (p: string) => (await import(pathToFileURL(join(OUT, p)).href)).default;
const ElectreBreakdown = await load('components/calc/ElectreBreakdown.js');
const PrometheeBreakdown = await load('components/calc/PrometheeBreakdown.js');

type Ds = { criteria: { id: string; name: string; hint: string; unit?: string }[]; alternatives: { id: string; name: string }[]; dm: { values: Record<string, Record<string, number>>; types: Record<string, string> } };
function ds(alts: string[], crits: string[], M: number[][], types: string[], units?: string[]): Ds {
  const criteria = crits.map((c, j) => ({ id: 'c' + j, name: c, hint: '', unit: units?.[j] }));
  const alternatives = alts.map((a, i) => ({ id: 'a' + i, name: a }));
  const dm: Ds['dm'] = { values: {}, types: {} };
  alternatives.forEach((a, i) => { dm.values[a.id] = {}; criteria.forEach((c, j) => { dm.values[a.id][c.id] = M[i][j]; }); });
  criteria.forEach((c, j) => { dm.types[c.id] = types[j]; });
  return { criteria, alternatives, dm };
}
const text = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/\s+/g, ' ');

const viaje = ds(['Ruta Norte', 'Ruta Centro', 'Ruta Sur'], ['Precio', 'Tiempo', 'Distancia'], [[95, 3.5, 280], [65, 5.5, 260], [80, 4.5, 340]], ['min', 'min', 'min'], ['$ miles', 'h', 'km']);
const real = ds(['LoRaWAN', 'GSM/GPRS', 'Sigfox', 'Zigbee'], ['Alcance', 'Autonomía', 'Infraestructura', 'Madurez'], [[10, 8, 2, 5], [10.5, 0.5, 3, 2], [40, 2, 5, 2], [0.07, 1.5, 2, 4]], ['max', 'max', 'max', 'max'], ['km', 'años', '1-5', '1-5']);
const grande = ds(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'], ['X', 'Y', 'Z'], [[1, 5, 3], [2, 4, 3], [3, 3, 9], [4, 2, 1], [5, 1, 2], [2.5, 2.5, 2.5], [3.3, 4.4, 1.1]], ['max', 'min', 'max']);
const vacio = ds(['Solo una'], ['X'], [[1]], ['max']);

const render = (C: unknown, mode: string, d: Ds, weights: number[], extra: object = {}) =>
  renderToStaticMarkup(h(C as never, { mode, criteria: d.criteria, alternatives: d.alternatives, dm: d.dm, weights, ...extra } as never));
const clean = (html: string) => !/NaN|undefined|Infinity|\[object/.test(text(html));

for (const mode of ['screen', 'report']) {
  const e = render(ElectreBreakdown, mode, viaje, [0.4, 0.35, 0.25], { cStar: 0.5, dStar: 0.5, showGraph: true });
  const t = text(e);
  ok(clean(e), `ELECTRE viaje (${mode}): sin NaN/undefined`);
  ok(t.includes('0.3500') && t.includes('0.6500') && t.includes('1.0000 en «Precio ($ miles)»'), `ELECTRE viaje (${mode}): c(Norte,Centro)=0.35, c(Centro,Norte)=0.65 y d=1.00 con su criterio (diap. 9 y 14)`);
  ok(/Ruta Norte y Ruta Centro son incomparables/.test(t) && /Ruta Norte supera a Ruta Sur|Ruta Norte → Ruta Sur/.test(t), `ELECTRE viaje (${mode}): incomparables Norte–Centro y relación Norte→Sur (diap. 18-19)`);
  ok(/c\* = 0\.65 y d\* = 0\.30/.test(t) && /c\* = 0\.50 y d\* = 0\.50/.test(t), `ELECTRE viaje (${mode}): la nota de umbrales cita el defecto de la plataforma y los valores de clase`);
  ok(mode === 'report' ? !/<details/.test(e) : /<details/.test(e), `ELECTRE viaje (${mode}): ${mode === 'report' ? 'sin <details> (todo abierto, imprimible)' : 'pasos desplegables'}`);
  ok(mode === 'report' ? !/<select/.test(e) : /<select/.test(e), `ELECTRE viaje (${mode}): ${mode === 'report' ? 'sin selector (se listan los pares)' : 'con selector de par'}`);
  ok((e.match(/class="calc-no"/g) ?? []).length === 6 && /Cómo leerlo/.test(t) && /Qué dice tu caso/.test(t), `ELECTRE viaje (${mode}): 6 pasos con «Cómo leerlo» y «Qué dice tu caso»`);

  const r = render(ElectreBreakdown, mode, real, [0.16, 0.25, 0.488, 0.102], { cStar: 0.65, dStar: 0.7 });
  const tr = text(r);
  ok(clean(r) && tr.includes('LoRaWAN y Sigfox son incomparables') && /máximo está en «Madurez/.test(tr), `ELECTRE caso real (${mode}): Sigfox–LoRaWAN incomparables con el criterio del máximo (Madurez)`);
  ok(tr.includes('0.6480'), `ELECTRE caso real (${mode}): c = 0.6480 escrito con 4 decimales frente a c* = 0.65 (no «0.65 ✗»)`);

  const g = render(ElectreBreakdown, mode, grande, [0.5, 0.3, 0.2], { cStar: 0.65, dStar: 0.3 });
  ok(clean(g) && text(g).includes('42 pares ordenados'), `ELECTRE 7 alternativas (${mode}): tabla completa de los 42 pares ordenados, sin recortar`);

  const p = render(PrometheeBreakdown, mode, viaje, [0.4, 0.35, 0.25]);
  const tp = text(p);
  ok(clean(p), `PROMETHEE viaje (${mode}): sin NaN/undefined`);
  ok(['0.4625', '0.3500', '0.3625', '0.4500', '0.2000', '0.1750'].every((x) => tp.includes(x)), `PROMETHEE viaje (${mode}): matriz π completa (diap. 33)`);
  ok(['0.3563', '0.4563', '0.1875', '0.3313', '0.2625', '0.4063', '+0.1938', '+0.0250', '−0.2188'].every((x) => tp.includes(x)), `PROMETHEE viaje (${mode}): φ⁺, φ⁻ y φ como en las diapositivas 34-35`);
  ok(/Σφ = 0\.0000/.test(tp) && /0\.0000 ✓/.test(tp), `PROMETHEE viaje (${mode}): comprobación Σφ = 0`);
  ok((p.match(/class="ob-curve"/g) ?? []).length === 3, `PROMETHEE viaje (${mode}): una curva P(d) por criterio`);
  ok(/PROMETHEE I da un ranking completo/.test(tp) && (p.match(/class="calc-no"/g) ?? []).length === 7, `PROMETHEE viaje (${mode}): 7 pasos y PROMETHEE I completo`);
  ok(/mejora aparte/.test(tp), `PROMETHEE viaje (${mode}): la nota aclara que elegir tipos 1-6 es una mejora aparte`);

  const pr = render(PrometheeBreakdown, mode, real, [0.16, 0.25, 0.488, 0.102]);
  ok(clean(pr) && ['0.3520', '0.3020', '0.6082', '0.6647'].every((x) => text(pr).includes(x)) && /1º Sigfox/.test(text(pr)), `PROMETHEE caso real (${mode}): Sigfox 1º y π de la diap. 38 (0.352, 0.302, 0.608, 0.665)`);
  ok(clean(render(PrometheeBreakdown, mode, grande, [0.5, 0.3, 0.2])), `PROMETHEE 7 alternativas (${mode}): sin NaN/undefined`);
  ok(clean(render(ElectreBreakdown, mode, vacio, [1], { cStar: 0.65, dStar: 0.3 })) && clean(render(PrometheeBreakdown, mode, vacio, [1])), `datos insuficientes (${mode}): no revienta`);
}

rmSync(OUT, { recursive: true, force: true });
console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
