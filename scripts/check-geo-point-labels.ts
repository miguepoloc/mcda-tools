// Lista de puntos y etiquetas del mapa: búsqueda por nombre, orden con los sin evaluar al final, texto de la etiqueta
// (nunca «0 %») y descarte voraz de etiquetas solapadas.
import { estimateLabelWidth, filterByName, foldText, labelPriority, labelText, layoutLabels, LABEL_H, MAX_LABELS, orderByRank, type LabelItem } from '../src/lib/geo/pointLabels.ts';

let fails = 0;
const ok = (c: boolean, n: string) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + n); if (!c) fails++; };

// búsqueda
const rows = [{ name: 'Bahía Concha' }, { name: 'Punto 2' }, { name: 'Boya  Norte' }, { name: 'bahia de Gaira' }];
ok(foldText(' BAHÍA ') === 'bahia', 'foldText quita tildes y mayúsculas');
ok(filterByName(rows, '').length === 4 && filterByName(rows, '   ').length === 4, 'búsqueda vacía = todos');
ok(filterByName(rows, 'bahia').map((r) => r.name).join('|') === 'Bahía Concha|bahia de Gaira', 'sin tildes, conserva el orden');
ok(filterByName(rows, 'BOYA norte').length === 1, 'varias palabras, cualquier mayúscula');
ok(filterByName(rows, 'bahia gaira').length === 1 && filterByName(rows, 'zzz').length === 0, 'todas las palabras deben aparecer');

// orden
const rk = [{ id: 'a', rank: null }, { id: 'b', rank: 2 }, { id: 'c', rank: 1 }, { id: 'd', rank: null }, { id: 'e', rank: 2 }];
ok(orderByRank(rk).map((r) => r.id).join('') === 'cbead', 'puestos ascendentes, empates estables y sin puesto al final en su orden');
ok(orderByRank([]).length === 0, 'lista vacía');

// texto de la etiqueta
ok(labelText({ name: 'Boya A', pct: 72 }, 'name') === 'Boya A', 'solo nombre');
ok(labelText({ name: 'Boya A', pct: 72 }, 'namePct') === 'Boya A · 72 %', 'nombre + %');
ok(labelText({ name: 'Boya A', pct: null }, 'namePct') === 'Boya A', 'sin evaluar: nunca 0 %');
ok(labelText({ name: '  ', pct: null }, 'name') === '(sin nombre)', 'nombre vacío');
ok(labelText({ name: '<img src=x onerror=1>', pct: 5 }, 'name') === '<img src=x onerror=1>', 'el texto no se interpreta (se devuelve tal cual)');
ok(estimateLabelWidth('a') < estimateLabelWidth('aaaaaaaaaa') && estimateLabelWidth('x'.repeat(500)) <= 170, 'ancho crece con el texto y tiene tope');

// descarte voraz
const it = (id: string, x: number, y: number, priority: number, w = 60): LabelItem => ({ id, x, y, w, h: LABEL_H, priority });
const W = 400, H = 300;
{
  const r = layoutLabels([it('a', 50, 50, 1), it('b', 200, 200, 2)], { width: W, height: H });
  ok(r.visible.length === 2 && r.hidden === 0, 'separadas: ambas');
}
{
  const r = layoutLabels([it('lo', 52, 52, 5), it('hi', 50, 50, 1)], { width: W, height: H });
  ok(r.visible.join() === 'hi' && r.hidden === 1, 'se solapan: gana la de mejor prioridad (puesto)');
}
{
  const r = layoutLabels([it('a', 50, 50, 3), it('b', 50, 55, 1), it('c', 50, 60, 2)], { width: W, height: H });
  ok(r.visible.join() === 'b' && r.hidden === 2, 'cadena de solapes: solo la primera por prioridad');
}
{
  const r = layoutLabels([it('fuera', -20, 50, 1), it('abajo', 100, 400, 1), it('der', 395, 50, 1), it('ok', 100, 100, 2)], { width: W, height: H });
  ok(r.visible.join() === 'ok', 'fuera del mapa o cortadas por el borde derecho no se muestran');
  ok(r.hidden === 1, 'solo cuenta como oculta la que tiene marcador a la vista (der)');
}
{
  // 300 puntos en una cuadrícula densa: nunca más que el tope y nunca solapadas
  const many: LabelItem[] = [];
  for (let i = 0; i < 300; i++) many.push(it(String(i), 10 + (i % 20) * 19, 10 + Math.floor(i / 20) * 18, labelPriority(i + 1, false, i)));
  const r = layoutLabels(many, { width: W, height: H });
  ok(r.visible.length <= MAX_LABELS && r.visible.length > 0, `300 puntos: ${r.visible.length} etiquetas (≤ ${MAX_LABELS})`);
  ok(r.hidden === 300 - r.visible.length, 'el resto se cuenta como oculto');
  const boxes = r.visible.map((id) => many[Number(id)]);
  let over = false;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.x + 9 < b.x + 9 + b.w && b.x + 9 < a.x + 9 + a.w && a.y - 10 < b.y + 10 && b.y - 10 < a.y + 10) over = true;
  }
  ok(!over, 'ninguna etiqueta visible pisa a otra');
  ok(r.visible.includes('0'), 'el puesto 1 siempre se muestra');
  const r2 = layoutLabels(many, { width: W, height: H, max: 5 });
  ok(r2.visible.length === 5, 'respeta un tope menor');
}
ok(labelPriority(1, true, 50) < labelPriority(1, false, 0), 'el seleccionado va primero');
ok(labelPriority(3, false, 0) < labelPriority(null, false, 0), 'los sin puesto, al final');
{
  const r = layoutLabels([it('b', 100, 100, 9), it('a', 100, 100, 9)], { width: W, height: H });
  ok(r.visible.join() === 'b', 'empate de prioridad: el primero de la lista');
}
console.log(fails ? `\n${fails} FALLA(S)` : '\nTodo OK');
process.exit(fails ? 1 : 0);
