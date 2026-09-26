// Cada método tiene su propio color de acento en el Excel (mismo criterio que la landing: familias
// del curso, pero cada uno distinguible — antes TOPSIS y VIKOR compartían el mismo violeta fijo).
// Verifica que buildWorkbook() usa un color distinto por método y que buildPrioWorkbook() (Sesión 1,
// sin método todavía) usa el neutro, no el del último método construido (mutación de estado global).
import XLSX from 'xlsx-js-style';
import { buildWorkbook, buildPrioWorkbook } from '../src/lib/excel.ts';
import { indexJudgments } from '../src/lib/ahp.ts';
import { normalizePrio, blankPrio } from '../src/lib/prio.ts';
import type { Method } from '../src/lib/types.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };

const criteria = [{ id: 'k0', name: 'Costo', hint: '' }, { id: 'k1', name: 'Calidad', hint: '' }];
const alternatives = [{ id: 'a0', name: 'X' }, { id: 'a1', name: 'Y' }];
const experts = [{ id: 'e0', name: 'Experto 1', role_desc: '' }];
const base = {
  title: 'Prueba de colores', objective: 'Probar paleta por método', criteria, alternatives, experts,
  idx: indexJudgments([]), prio: normalizePrio(blankPrio()), decisionMatrix: { values: {}, types: {} },
};

const titleColor = (wb: any) => wb.Sheets['Notas']?.A1?.s?.font?.color?.rgb;

const methods: Method[] = ['ahp', 'topsis', 'vikor', 'promethee', 'electre'];
const colors = new Map<Method, string>();
for (const method of methods) {
  const wb = buildWorkbook(XLSX, { ...base, method });
  const c = titleColor(wb);
  colors.set(method, c);
  ok(!!c, `${method}: hoja Notas tiene color de título (${c})`);
}
ok(colors.get('topsis') !== colors.get('vikor'), `TOPSIS (${colors.get('topsis')}) y VIKOR (${colors.get('vikor')}) ya no comparten color`);
ok(colors.get('promethee') !== colors.get('electre'), `PROMETHEE (${colors.get('promethee')}) y ELECTRE (${colors.get('electre')}) tienen colores distintos`);
ok(new Set(colors.values()).size === methods.length, `los 5 métodos tienen 5 colores distintos (hay ${new Set(colors.values()).size})`);

// Construir un Excel de método no debe "contaminar" el color del Excel de priorización siguiente.
const wbTopsis = buildWorkbook(XLSX, { ...base, method: 'topsis' as const });
const wbPrio = buildPrioWorkbook(XLSX, base as any);
ok(titleColor(wbTopsis) !== titleColor(wbPrio), `priorización (${titleColor(wbPrio)}) no hereda el color del último método construido (${titleColor(wbTopsis)})`);
ok(titleColor(wbPrio) === '7F869C', `priorización usa el neutro del curso (7F869C), da ${titleColor(wbPrio)}`);

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
