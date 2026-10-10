// Verifica el parseo de bloques pegados desde Excel/Sheets en la matriz de decisión.
import { parseSheetNumber, parsePastedBlock, isBlockPaste, splitClipboard } from '../src/lib/paste-matrix.ts';

let fails = 0;
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.error(`FAIL ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
}
const num = (s: string) => parseSheetNumber(s)?.value ?? null;

eq('punto', num('12.5'), 12.5);
eq('coma decimal', num('12,5'), 12.5);
eq('miles es', num('1.234,56'), 1234.56);
eq('miles en', num('1,234.56'), 1234.56);
eq('miles varios', num('1.234.567'), 1234567);
eq('negativo', num('-3,2'), -3.2);
eq('menos unicode', num('−3'), -3);
eq('exp', num('1e3'), 1000);
eq('espacios', num('  7 '), 7);
eq('texto', num('abc'), null);
eq('unidad', num('12 km'), null);
eq('vacio', num(''), null);
eq('solo coma', num(','), null);
eq('doble coma decimal', num('1,2,3'), null);
eq('ambigua', parseSheetNumber('1,234')?.ambiguous, true);
eq('no ambigua', parseSheetNumber('12,5')?.ambiguous, false);

eq('isBlock tab', isBlockPaste('1\t2'), true);
eq('isBlock simple', isBlockPaste('12,5'), false);
eq('isBlock salto final', isBlockPaste('12\n'), false);
eq('split CRLF + filas vacías finales', splitClipboard('1\t2\r\n3\t4\r\n\r\n'), [['1', '2'], ['3', '4']]);
eq('split columna vacía final de Excel', splitClipboard('1\t2\t\n3\t4\t\n'), [['1', '2'], ['3', '4']]);

// bloque simple con coma decimal
let r = parsePastedBlock('1,5\t2\n3\t4,25\n', { row: 0, col: 0 }, { rows: 3, cols: 3 });
eq('cells', r.cells, [{ row: 0, col: 0, value: 1.5 }, { row: 0, col: 1, value: 2 }, { row: 1, col: 0, value: 3 }, { row: 1, col: 1, value: 4.25 }]);
eq('sin issues', r.issues.length, 0);

// encabezados de fila y columna
r = parsePastedBlock('Alt\tPrecio\tVida\nA\t10\t5,5\nB\t20\t6\n', { row: 0, col: 0 }, { rows: 2, cols: 2 });
eq('header row', r.skippedHeaderRow, true);
eq('header col', r.skippedHeaderCol, true);
eq('header cells', r.cells.map((c) => c.value), [10, 5.5, 20, 6]);

// solo encabezado de columnas (sin nombres de fila)
r = parsePastedBlock('Precio\tVida\n10\t5\n', { row: 0, col: 0 }, { rows: 1, cols: 2 });
eq('solo header fila', [r.skippedHeaderRow, r.skippedHeaderCol, r.cells.length], [true, false, 2]);

// origen desplazado y desbordamiento: nada fuera de la matriz
r = parsePastedBlock('1\t2\t3\n4\t5\t6\n', { row: 1, col: 1 }, { rows: 2, cols: 3 });
eq('overflow cells', r.cells, [{ row: 1, col: 1, value: 1 }, { row: 1, col: 2, value: 2 }]);
eq('overflow dropped', r.droppedOutside, 4);
eq('overflow issue', r.issues.some((i) => i.kind === 'overflow'), true);
eq('nada fuera', r.cells.every((c) => c.row < 2 && c.col < 3), true);

// vacías y no numéricas se reportan con su ubicación y no se escriben
r = parsePastedBlock('1\t\tabc\n4\t5\t6', { row: 0, col: 0 }, { rows: 2, cols: 3 });
eq('vacía', r.issues.filter((i) => i.kind === 'empty').map((i) => [i.row, i.col]), [[0, 1]]);
eq('nan', r.issues.filter((i) => i.kind === 'nan').map((i) => [i.row, i.col, i.raw]), [[0, 2, 'abc']]);
eq('válidas', r.cells.length, 4);

// filas vacías al final no cuentan
r = parsePastedBlock('1\t2\n\n\n', { row: 0, col: 0 }, { rows: 5, cols: 2 });
eq('filas vacías finales', [r.blockRows, r.issues.length], [1, 0]);

// texto vacío
eq('vacío total', parsePastedBlock('', { row: 0, col: 0 }, { rows: 2, cols: 2 }).cells.length, 0);

if (fails > 0) { console.error(`${fails} fallos`); process.exit(1); }
console.log('check-paste-matrix: OK');
