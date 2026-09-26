// Lector de los Excel del taller de AHP (Sesión 2): `Ejercicio.xlsx`, las `Plantillas_taller/` y las
// entregas de los estudiantes, que parten de ellos. NO son respaldos de la plataforma (no traen la hoja
// oculta `_datos`), así que se reconstruye el proyecto desde su estructura:
//   Notas | Criterios | <una hoja por criterio> | Síntesis
// y en cada hoja de comparación, uno o más bloques «Experto k: descripción» / «Evaluador k — …» en la
// columna A, con la fila de encabezado debajo y la matriz n×n de ese experto.
// Se busca por etiqueta, no por número de fila: las entregas cambian n, el número de expertos y hasta
// el espaciado entre bloques. Solo importan los valores cacheados (lo que ve el estudiante en Excel).
// Solo `import type` + extensión .ts para poder probarlo con `node --experimental-strip-types`.
import type { Imported } from './legacy.ts';
import { blankMatrix } from './topsis.ts';
import { blankPrio } from './prio.ts';

type Ws = Record<string, any>;
/** El subconjunto del libro de SheetJS que se necesita (así este módulo no importa la librería). */
export type Wb = { SheetNames: string[]; Sheets: Record<string, Ws> };

const LABEL = /^\s*(experto|experta|evaluador|evaluadora|panelista)\s*\d*/i;
const LABEL_PREFIX = /^\s*(experto|experta|evaluador|evaluadora|panelista)\s*\d*\s*[:\-—–.]?\s*/i;

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function colName(c: number): string {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
const cell = (ws: Ws, r: number, c: number) => ws[colName(c) + (r + 1)];

function text(ws: Ws, r: number, c: number): string {
  const v = cell(ws, r, c)?.v;
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
}

/** Número de una celda: acepta también texto tipo «1/3» o «0,5», que algunas entregas escribieron a mano. */
function num(ws: Ws, r: number, c: number): number | null {
  const v = cell(ws, r, c)?.v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const m = v.trim().replace(/,/g, '.').match(/^(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?$/);
  if (!m) return null;
  const x = m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]);
  return Number.isFinite(x) ? x : null;
}

function lastRow(ws: Ws): number {
  const m = String(ws['!ref'] ?? '').match(/(\d+)$/);
  return m ? Number(m[1]) : 0;
}

type Block = { label: string; names: string[]; rowLabels: string[]; ratio: (i: number, j: number) => number | null };

/** Bloques «Experto k» de una hoja: etiqueta en la columna A, encabezado en las 3 filas siguientes. */
function blocksOf(ws: Ws): Block[] {
  const out: Block[] = [];
  const last = lastRow(ws);
  for (let r = 0; r < last; r++) {
    const label = text(ws, r, 0);
    if (!LABEL.test(label)) continue;
    for (let h = r + 1; h <= r + 3 && h < last; h++) {
      if (!text(ws, h, 1)) continue;
      const names: string[] = [];
      for (let c = 1; text(ws, h, c); c++) names.push(text(ws, h, c));
      if (names.length < 2) break;
      const at = (i: number, j: number) => num(ws, h + 1 + i, 1 + j);
      out.push({
        label,
        names,
        rowLabels: names.map((_, i) => text(ws, h + 1 + i, 0)),
        // a_ij de la matriz de este experto: el triángulo superior es lo que se digita; si falta, la inversa del inferior.
        ratio: (i, j) => {
          const u = at(i, j);
          if (u != null && u > 0) return u;
          const l = at(j, i);
          return l != null && l > 0 ? 1 / l : null;
        },
      });
      r = h + names.length;
      break;
    }
  }
  return out;
}

/** Razón de Saaty a_ij -> `value` de la plataforma: 0 igual, negativo gana el primero, positivo el segundo. */
function toValue(r: number): { value: number; rounded: boolean } {
  const k = r >= 1 ? r : 1 / r;
  const q = Math.min(9, Math.round(k));
  const rounded = Math.abs(k - q) > 0.05 || k > 9.05;
  if (q <= 1) return { value: 0, rounded: rounded && k > 1.05 };
  return { value: r >= 1 ? -(q - 1) : q - 1, rounded };
}

/** ¿La hoja `sheet` es la del criterio `crit`? Los nombres de hoja se truncan a 31 caracteres o se abrevian
 * («Multit», «CP»): basta que uno empiece por el otro, o que uno contenga al otro si tiene ≥ 4 letras. */
function sameName(sheet: string, crit: string): boolean {
  const a = norm(sheet), b = norm(crit);
  if (!a || !b) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return long.startsWith(short) || (short.length >= 4 && long.includes(short));
}

/** Nombres de la hoja Síntesis: criterios (fila de encabezado) y alternativas (filas bajo «Peso del criterio»). */
function synthNames(ws: Ws | undefined): { crit: string[]; alt: string[] } {
  const out = { crit: [] as string[], alt: [] as string[] };
  if (!ws) return out;
  const last = lastRow(ws);
  for (let r = 1; r < last; r++) {
    if (!norm(text(ws, r, 0)).startsWith('pesodelcriterio')) continue;
    for (let c = 1; text(ws, r - 1, c) && !/^(prioridad|ranking)/i.test(norm(text(ws, r - 1, c))); c++) out.crit.push(text(ws, r - 1, c));
    for (let k = r + 1; k < last && text(ws, k, 0) && !norm(text(ws, k, 0)).startsWith('ganador'); k++) out.alt.push(text(ws, k, 0));
    break;
  }
  return out;
}

/** Nombre sin renombrar que dejó la plantilla («Criterio 3», «Alternativa 1»). */
const isPlaceholder = (s: string) => /^(criterio|alternativa|opcion|opción)\s*\d+$/i.test(s.trim());

/** De varias fuentes del mismo nombre (encabezado, etiqueta de fila, Síntesis, hoja) el más descriptivo: los
 * estudiantes renombraron unas y otras no (p. ej. «PC-1» arriba y «PC-1 Lote baldío» en la Síntesis). Un nombre
 * de plantilla sin renombrar solo vale si no hay otro: «Criterio 3» no debe ganarle a «Educación» por más largo. */
function best(...c: (string | undefined)[]): string {
  const longest = (xs: string[]) => xs.reduce((a, x) => (x.length > a.length ? x : a), '');
  const all = c.map((x) => (x ?? '').trim()).filter(Boolean);
  return longest(all.filter((x) => !isPlaceholder(x))) || longest(all);
}

/** Encabezado y etiquetas de fila de la matriz agregada que hay arriba de la hoja (filas 2 y 3+): es donde
 * el estudiante suele escribir primero los nombres. */
function topNames(ws: Ws | undefined): { head: string[]; rows: string[] } {
  const out = { head: [] as string[], rows: [] as string[] };
  if (!ws) return out;
  for (let c = 1; text(ws, 1, c); c++) out.head.push(text(ws, 1, c));
  for (let r = 2; r < 2 + out.head.length; r++) out.rows.push(text(ws, r, 0));
  return out;
}

/** Reconstruye un proyecto AHP desde un Excel del taller. `null` si no tiene esa estructura. */
export function parseCourseWorkbook(wb: Wb): { imp: Imported; warnings: string[] } | null {
  const names = wb.SheetNames;
  const ci = names.findIndex((n) => norm(n) === 'criterios');
  if (ci < 0) return null;
  let si = names.findIndex((n, i) => i > ci && norm(n).startsWith('sintesis'));
  if (si < 0) si = names.length;
  const critWs = wb.Sheets[names[ci]];
  const critBlocks = critWs ? blocksOf(critWs) : [];
  if (!critBlocks.length) return null;

  const warnings: string[] = [];
  const syn = synthNames(wb.Sheets[names[si]]);
  const top = topNames(critWs);
  const critNames = critBlocks[0].names.map((h, i) => best(h, critBlocks[0].rowLabels[i], top.head[i], top.rows[i], syn.crit[i]));
  const criteria = critNames.map((name, i) => ({ id: 'k' + (i + 1), name, hint: '', src: null }));

  // Hojas de alternativas: entre Criterios y Síntesis. Primero por nombre, lo que sobre por orden.
  const altSheets = names.slice(ci + 1, si).filter((n) => wb.Sheets[n] && blocksOf(wb.Sheets[n]).length);
  const sheetOf: (string | undefined)[] = criteria.map(() => undefined);
  const used = new Set<string>();
  criteria.forEach((c, i) => {
    const s = altSheets.find((n) => !used.has(n) && sameName(n, c.name));
    if (s) { sheetOf[i] = s; used.add(s); }
  });
  const rest = altSheets.filter((n) => !used.has(n));
  criteria.forEach((_, i) => { if (!sheetOf[i]) sheetOf[i] = rest.shift(); });
  if (!altSheets.length) return null;
  if (altSheets.length !== criteria.length) {
    warnings.push(`Hay ${criteria.length} criterios pero ${altSheets.length} hojas de alternativas: los criterios sin hoja quedan sin juicios de alternativas.`);
  }

  const firstAlt = blocksOf(wb.Sheets[altSheets[0]])[0];
  const topAlt = topNames(wb.Sheets[altSheets[0]]);
  const alternatives = firstAlt.names.map((h, i) => ({ id: 'a' + (i + 1), name: best(h, firstAlt.rowLabels[i], topAlt.head[i], topAlt.rows[i], syn.alt[i]) }));

  const perSheet: { sheet: 'crit' | string; blocks: Block[]; ids: string[] }[] = [
    { sheet: 'crit', blocks: critBlocks, ids: criteria.map((c) => c.id) },
  ];
  criteria.forEach((c, i) => {
    const s = sheetOf[i];
    if (!s) return;
    const blocks = blocksOf(wb.Sheets[s]);
    if (blocks[0].names.length !== alternatives.length) {
      warnings.push(`La hoja «${s}» compara ${blocks[0].names.length} alternativas y la primera ${alternatives.length}: se omitió.`);
      return;
    }
    perSheet.push({ sheet: 'alt:' + c.id, blocks, ids: alternatives.map((a) => a.id) });
  });

  const nExperts = Math.max(...perSheet.map((p) => p.blocks.length));
  const experts = Array.from({ length: nExperts }, (_, e) => {
    const label = perSheet.map((p) => p.blocks[e]?.label).find((l) => l) ?? '';
    return { legacyId: 'e' + (e + 1), name: 'Experto ' + (e + 1), role_desc: label.replace(LABEL_PREFIX, '').trim() };
  });

  const judgments: Imported['judgments'] = [];
  let rounded = 0;
  let example = '';
  for (const p of perSheet) {
    p.blocks.forEach((b, e) => {
      for (let i = 0; i < p.ids.length; i++) {
        for (let j = i + 1; j < p.ids.length; j++) {
          const r = b.ratio(i, j);
          if (r == null) continue;
          const v = toValue(r);
          if (v.rounded) { rounded++; example ||= `${Math.round(r * 1000) / 1000}`; }
          judgments.push({ legacyId: experts[e].legacyId, sheet: p.sheet, pair_key: `${p.ids[i]}-${p.ids[j]}`, value: v.value });
        }
      }
    });
  }
  if (!judgments.length) warnings.push('El archivo no trae juicios (¿es la plantilla en blanco?): se importó solo la estructura.');
  if (rounded) {
    warnings.push(`${rounded} juicio(s) no estaban en la escala entera de Saaty 1–9 (p. ej. ${example}) y se redondearon al entero más cercano.`);
  }

  // Objetivo: «Caso: …» de la hoja Notas, salvo que sea el texto de Palmor heredado de la plantilla.
  const note = names[0] && norm(names[0]) === 'notas' ? text(wb.Sheets[names[0]], 0, 0) : '';
  const caso = note.match(/^caso\s*:\s*(.+)$/i)?.[1] ?? '';
  const stale = /palmor/i.test(caso) && !critNames.some((n) => norm(n) === 'alcance');
  const objective = caso && !stale ? caso.charAt(0).toUpperCase() + caso.slice(1) : '';
  if (!objective) warnings.push('No se detectó el objetivo de decisión en la hoja Notas: escríbelo en el proyecto.');

  return {
    imp: { objective, criteria, alternatives, prio: blankPrio(), experts, judgments, method: 'ahp', decisionMatrix: blankMatrix() },
    warnings,
  };
}
