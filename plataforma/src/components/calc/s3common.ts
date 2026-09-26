// Ayudas de texto compartidas por los desgloses de TOPSIS y VIKOR (Sesión 3): nombres con unidad, dirección de cada criterio y
// expresiones numéricas «a² + b² + c²» escritas con los números reales del proyecto. Solo formato; ningún cálculo nuevo.
import { num } from './CalcKit';

type CritLike = { name: string; unit: string; kind: 'max' | 'min' | 'target'; target: { value: number; tol: number } | null };

export const critLabel = (c: { name: string; unit: string }) => (c.unit ? `${c.name} (${c.unit})` : c.name);

/** Etiqueta corta de la dirección del criterio, para el subtítulo de columna. */
export function kindHint(c: CritLike): string {
  if (c.kind === 'min') return 'costo ▼ menos es mejor';
  if (c.kind === 'target') return c.target ? `objetivo ${fx(c.target.value)}${c.target.tol ? ' ± ' + fx(c.target.tol) : ''}` : 'objetivo (falta el valor)';
  return 'beneficio ▲ más es mejor';
}

/** Número tal cual (sin ceros de relleno) con hasta 6 cifras significativas: 10, 0.07, 40. */
export const fx = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? '—' : String(Number(x.toPrecision(6))));

/** «a + b + c», con «…» si hay más de `max` términos (la suma completa sigue siendo la de la tabla). */
export function joinExpr(items: string[], op = ' + ', max = 8): string {
  if (items.length <= max) return items.join(op);
  return items.slice(0, max - 1).join(op) + op + '… ' + op + items[items.length - 1] + ` (${items.length} términos)`;
}

/** «√(a² + b² + c²)» con `d` decimales (o, con `raw`, los números tal cual, sin ceros de relleno: para valores de la matriz). */
export const sqrtOfSquares = (xs: number[], d = 4, raw = false) => `√(${joinExpr(xs.map((x) => (raw ? fx(x) : num(x, d)) + '²'))})`;

export const pct = (x: number, d = 1) => (Number.isFinite(x) ? (x * 100).toFixed(d) + ' %' : '—');

/** Enumeración en español: «A», «A y B», «A, B y C». */
export function listEs(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1];
}
