// Lector de los Excel del taller de AHP (courseExcel.ts): libro sintético con el diseño de Ejercicio.xlsx
// (Notas | Criterios | una hoja por criterio | Síntesis; bloques «Experto k» en la columna A), sin datos de
// estudiantes. Cubre lo que se vio en las entregas reales: fracciones decimales, texto «1/3», triángulo superior
// vacío (se usa la inversa del inferior), hojas fuera de orden respecto a los criterios, valores no enteros,
// «Evaluador k —» y el texto de Palmor heredado en Notas.
import XLSX from 'xlsx-js-style';
import { parseCourseWorkbook } from '../src/lib/courseExcel.ts';
import { indexJudgments, sheetResult } from '../src/lib/ahp.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };

/** Hoja con bloques de experto: cada bloque = etiqueta, encabezado, n filas (triángulo superior en `up`, inferior = 1/x). */
function sheet(title: string, items: string[], experts: { label: string; up: (number | string | null)[][] }[]) {
  const rows: any[][] = [[title], [null, ...items]];
  items.forEach((it) => rows.push([it]));
  rows.push([], ['Juicios individuales de los expertos'], []);
  for (const e of experts) {
    rows.push([e.label], [null, ...items]);
    items.forEach((it, i) => rows.push([it, ...items.map((_, j) => (i === j ? 1 : j > i ? e.up[i][j - i - 1] : null))]));
    rows.push([], []);
  }
  return XLSX.utils.aoa_to_sheet(rows);
}

const crit = ['Cobertura', 'Autonomía', 'Costo'];
const alts = ['LoRaWAN', 'Sigfox'];
const wb: any = { SheetNames: [], Sheets: {} };
const add = (name: string, ws: any) => { wb.SheetNames.push(name); wb.Sheets[name] = ws; };
add('Notas', XLSX.utils.aoa_to_sheet([['Caso: elección de tecnología de comunicación IoT/WSN para Palmor']]));
add('Criterios', sheet('AHP, Criterios', crit, [
  { label: 'Experto 1: Ingeniero electrónico (hardware)', up: [[3, 0.5], [0.333333]] },
  { label: 'Evaluador 2 — Agrónomo', up: [['1/3', 2.5], [null]] },
]));
// hojas en orden distinto al de los criterios: Costo antes que Autonomía
add('Costo', sheet('AHP, Costo', alts, [{ label: 'Experto 1', up: [[0.2]] }, { label: 'Experto 2', up: [[9]] }]));
add('Autonomía', sheet('AHP, Autonomía', alts, [{ label: 'Experto 1', up: [[4]] }, { label: 'Experto 2', up: [[1]] }]));
add('Cobertura', sheet('AHP, Cobertura', alts, [{ label: 'Experto 1', up: [[0.5]] }, { label: 'Experto 2', up: [[null]] }]));
add('Síntesis', XLSX.utils.aoa_to_sheet([['Tecnología'], [null, ...crit, 'Prioridad global', 'Ranking'], ['Peso del criterio'], ['LoRaWAN'], ['Sigfox'], [], ['Ganador']]));

const r = parseCourseWorkbook(wb);
ok(!!r, 'reconoce el libro del taller');
const { imp, warnings } = r!;
ok(imp.criteria.map((c) => c.name).join('|') === crit.join('|'), 'criterios desde el encabezado: ' + imp.criteria.map((c) => c.name).join(', '));
ok(imp.alternatives.map((a) => a.name).join('|') === alts.join('|'), 'alternativas desde la primera hoja de criterio');
ok(imp.experts.length === 2 && imp.experts[0].role_desc === 'Ingeniero electrónico (hardware)' && imp.experts[1].role_desc === 'Agrónomo', 'expertos y su descripción (prefijo «Experto/Evaluador k:/—» quitado)');
ok(imp.objective === '', 'el objetivo de Palmor heredado de la plantilla se descarta');
const J = (sheetKey: string, ex: string, pair: string) => imp.judgments.find((j) => j.sheet === sheetKey && j.legacyId === ex && j.pair_key === pair)?.value;
ok(J('crit', 'e1', 'k1-k2') === -2, 'a12 = 3 → gana el primero con intensidad 3 (value −2)');
ok(J('crit', 'e1', 'k1-k3') === 1, 'a13 = 0.5 → gana el segundo con intensidad 2 (value +1)');
ok(J('crit', 'e1', 'k2-k3') === 2, 'a23 = 0.333333 → gana el segundo con intensidad 3 (value +2)');
ok(J('crit', 'e2', 'k1-k2') === 2, 'texto «1/3» se lee como 0.333');
ok(J('crit', 'e2', 'k1-k3') === -2, '2.5 se redondea a 3 (value −2)');
ok(J('crit', 'e2', 'k2-k3') === undefined, 'par sin juicio en ambos triángulos no se inventa');
ok(J('alt:k1', 'e1', 'a1-a2') === 1, 'hojas fuera de orden: «Cobertura» va con el criterio Cobertura (0.5 → +1)');
ok(J('alt:k2', 'e1', 'a1-a2') === -3, 'hojas fuera de orden: «Autonomía» (4 → −3)');
ok(J('alt:k3', 'e2', 'a1-a2') === -8, 'hojas fuera de orden: «Costo» (9 → −8, tope de la escala)');
ok(warnings.some((w) => /redondearon/.test(w)), 'avisa del redondeo');
ok(warnings.some((w) => /objetivo/.test(w)), 'avisa que no detectó el objetivo');

// la matemática de la plataforma sobre lo importado: A = [[1,3,.5],[1/3,1,.333],[2,3,1]] (experto 1) es coherente
const idx = indexJudgments(imp.judgments.map((j) => ({ expert_id: j.legacyId, sheet: j.sheet, pair_key: j.pair_key, value: j.value })));
const res = sheetResult('crit', imp.criteria, ['e1'], idx).agg;
ok(Math.abs(res.w.reduce((a, b) => a + b, 0) - 1) < 1e-9 && Number.isFinite(res.cr), 'los juicios importados alimentan el cálculo AHP (pesos suman 1)');

// Nombres de plantilla sin renombrar en los bloques de experto («Criterio 3» pesa más letras que «Educación»):
// debe ganar el nombre real de la matriz agregada, no el de plantilla por más largo.
{
  const items = ['Acceso', 'Obras', 'Educación'];
  const mk = (head: string[]) => {
    const w = XLSX.utils.aoa_to_sheet([['AHP, Criterios'], [null, ...items], ...items.map((n) => [n]), [], ['Experto 1'], [null, ...head], ...head.map((h, i) => [h, ...head.map((_, j) => (i === j ? 1 : j > i ? 2 : null))])]);
    return w;
  };
  const w2: any = { SheetNames: ['Criterios', 'Acceso', 'Síntesis'], Sheets: { Criterios: mk(['Criterio 1', 'Criterio 2', 'Criterio 3']), Acceso: sheet('AHP, Acceso', ['Alternativa 1', 'Alternativa 2'], [{ label: 'Experto 1', up: [[3]] }]), 'Síntesis': XLSX.utils.aoa_to_sheet([['x']]) } };
  const got = parseCourseWorkbook(w2)?.imp.criteria.map((c) => c.name).join('|');
  ok(got === items.join('|'), 'nombre real de la matriz agregada gana a «Criterio N» de plantilla: ' + got);
}

ok(parseCourseWorkbook({ SheetNames: ['Hoja1'], Sheets: { Hoja1: XLSX.utils.aoa_to_sheet([['x']]) } }) === null, 'un libro sin hoja Criterios no se reconoce');
if (fallos) { console.error(`\n${fallos} comprobación(es) fallaron`); process.exit(1); }
console.log('\nTodo bien.');
