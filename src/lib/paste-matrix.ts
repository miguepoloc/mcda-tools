/**
 * Pegado de un bloque copiado de una hoja de cálculo (Excel, Sheets, LibreOffice) en la matriz de decisión.
 * Función pura, sin React: separa el texto en celdas (TSV), detecta encabezados, interpreta números con
 * coma o punto decimal y devuelve qué celdas se pueden escribir y cuáles no (y por qué), sin tocar nada
 * fuera de la matriz.
 */

export type PasteIssueKind = 'empty' | 'nan' | 'overflow' | 'ambiguous';

export interface PasteIssue {
  kind: PasteIssueKind;
  /** Fila / columna dentro del bloque pegado (0-based, ya sin encabezados). */
  srcRow: number;
  srcCol: number;
  /** Fila / columna destino en la matriz (0-based). */
  row: number;
  col: number;
  /** Texto original de la celda (en `overflow`: cuántas celdas se descartaron). */
  raw: string;
}

export interface PasteCell { row: number; col: number; value: number; }

export interface PasteResult {
  cells: PasteCell[];
  issues: PasteIssue[];
  /** Se omitió la primera fila / primera columna por ser encabezados de texto. */
  skippedHeaderRow: boolean;
  skippedHeaderCol: boolean;
  /** Tamaño del bloque de datos pegado (sin encabezados). */
  blockRows: number;
  blockCols: number;
  /** Celdas del bloque que cayeron fuera de la matriz y se descartaron. */
  droppedOutside: number;
}

const NUMBER_SHAPE = /^-?(\d[\d.,]*|[.,]\d+)(e[-+]?\d+)?$/i;

/** Interpreta un número escrito como en una hoja de cálculo. `null` si no es un número. */
export function parseSheetNumber(raw: string): { value: number; ambiguous: boolean } | null {
  let s = raw.replace(/[  \s]/g, '').replace(/−/g, '-');
  if (s.startsWith('+')) s = s.slice(1);
  if (s === '' || !NUMBER_SHAPE.test(s)) return null;
  let ambiguous = false;
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  if (dots && commas) {
    // el último separador es el decimal; el otro es de miles
    const dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    const thou = dec === ',' ? '.' : ',';
    if ((dec === ',' ? commas : dots) > 1) return null;
    s = s.split(thou).join('').replace(dec, '.');
  } else if (commas) {
    if (commas > 1) {
      if (!/^-?\d{1,3}(,\d{3})+(e[-+]?\d+)?$/i.test(s)) return null;
      s = s.replace(/,/g, '');
    } else {
      if (/^-?\d{1,3},\d{3}$/.test(s)) ambiguous = true; // «1,234»: ¿1.234 o 1234? se toma como decimal (convención del curso)
      s = s.replace(',', '.');
    }
  } else if (dots > 1) {
    if (!/^-?\d{1,3}(\.\d{3})+(e[-+]?\d+)?$/i.test(s)) return null;
    s = s.replace(/\./g, '');
  } else if (/^-?\d{1,3}\.\d{3}$/.test(s)) {
    ambiguous = true; // «1.234»: se toma como decimal
  }
  const n = Number(s);
  return Number.isFinite(n) ? { value: n, ambiguous } : null;
}

/** Divide el texto del portapapeles en filas y celdas. Tabuladores (Excel/Sheets); si no hay, «;». */
export function splitClipboard(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  const sep = lines.some((l) => l.includes('\t')) ? '\t' : lines.some((l) => l.includes(';')) ? ';' : '\t';
  const rows = lines.map((l) => l.split(sep));
  // Excel agrega a veces una columna vacía al final de todas las filas
  const w = Math.max(0, ...rows.map((r) => r.length));
  let end = w;
  while (end > 0 && rows.every((r) => (r[end - 1] ?? '').trim() === '')) end--;
  return rows.map((r) => Array.from({ length: end }, (_, i) => r[i] ?? ''));
}

/** ¿Vale la pena tratar este pegado como bloque (varias celdas) y no como un valor suelto? */
export function isBlockPaste(text: string): boolean {
  const t = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  return t.includes('\t') || t.includes('\n');
}

const isTextCell = (c: string): boolean => c.trim() !== '' && parseSheetNumber(c) === null;

/**
 * Convierte el texto pegado en celdas de la matriz.
 * @param origin celda destino de la esquina superior izquierda del bloque (0-based).
 * @param size   filas (alternativas) y columnas (criterios) de la matriz: nada se escribe fuera.
 */
export function parsePastedBlock(
  text: string,
  origin: { row: number; col: number },
  size: { rows: number; cols: number },
): PasteResult {
  let grid = splitClipboard(text);
  const result: PasteResult = { cells: [], issues: [], skippedHeaderRow: false, skippedHeaderCol: false, blockRows: 0, blockCols: 0, droppedOutside: 0 };
  if (grid.length === 0 || grid[0].length === 0) return result;

  // encabezado de columnas: primera fila sin ningún número y con algún texto
  if (grid.length > 1 && grid[0].some(isTextCell) && !grid[0].some((c) => parseSheetNumber(c) !== null)) {
    grid = grid.slice(1);
    result.skippedHeaderRow = true;
  }
  // encabezado de filas: primera columna toda de texto (nombres de alternativas)
  if (grid[0].length > 1 && grid.every((r) => isTextCell(r[0]))) {
    grid = grid.map((r) => r.slice(1));
    result.skippedHeaderCol = true;
  }
  result.blockRows = grid.length;
  result.blockCols = grid[0].length;

  grid.forEach((line, i) => line.forEach((raw, j) => {
    const row = origin.row + i, col = origin.col + j;
    const base = { srcRow: i, srcCol: j, row, col, raw };
    if (row >= size.rows || col >= size.cols) {
      result.droppedOutside++;
      return;
    }
    if (raw.trim() === '') { result.issues.push({ kind: 'empty', ...base }); return; }
    const p = parseSheetNumber(raw);
    if (!p) { result.issues.push({ kind: 'nan', ...base }); return; }
    if (p.ambiguous) result.issues.push({ kind: 'ambiguous', ...base });
    result.cells.push({ row, col, value: p.value });
  }));
  if (result.droppedOutside > 0) {
    result.issues.push({ kind: 'overflow', srcRow: 0, srcCol: 0, row: origin.row, col: origin.col, raw: String(result.droppedOutside) });
  }
  return result;
}
