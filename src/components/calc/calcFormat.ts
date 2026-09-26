import type { MatrixType } from '@/lib/types';

/** Formato de números y textos compartido por los desgloses (sin React ni 'use client': se puede importar desde cualquier componente). */

const fin = (x: number) => Number.isFinite(x);

/** Valor de la matriz a texto sin ceros de más ni notación científica (0.07, 10.5, 40). */
export const fmtVal = (x: number): string => (fin(x) ? String(Number(x.toPrecision(6))) : '—');
/** Redondeo «half-up» a `d` decimales, como se hace a mano en las diapositivas: toFixed() da 0.3562 para 0.35625 porque ese decimal no es
 * exacto en binario, y en clase se escribe 0.3563. El épsilon 1e-9 solo corrige ese error de representación. */
function roundHalfUp(x: number, d: number): string {
  const f = 10 ** d;
  return (Math.round(Math.abs(x) * f + 1e-9) / f).toFixed(d);
}
/** Con signo explícito, como en las diapositivas de flujos: +0.1938 / −0.2188. */
export const sgn = (x: number, d = 4): string => (fin(x) ? (x < 0 && Number(roundHalfUp(x, d)) !== 0 ? '−' : '+') + roundHalfUp(x, d) : '—');
/** Peso o probabilidad a 4 decimales (half-up, igual que las diapositivas). */
export const n4 = (x: number): string => (fin(x) ? (x < 0 && Number(roundHalfUp(x, 4)) !== 0 ? '−' : '') + roundHalfUp(x, 4) : '—');

/** c o d a texto comparado con su umbral: con 2 decimales, salvo que el redondeo haga parecer que cumple (0.648 → «0.65» frente a c* = 0.65)
 * o que no cumple cuando sí; en ese caso 4 decimales, para que el ✓/✗ se entienda a simple vista. */
export function fmtVs(v: number, thr: number, kind: 'c' | 'd'): string {
  const ok = (x: number) => (kind === 'c' ? x >= thr - 1e-9 : x <= thr + 1e-9);
  const r2 = Number(v.toFixed(2));
  return ok(v) === ok(r2) ? v.toFixed(2) : v.toFixed(4);
}

export const typeText = (t: MatrixType) => (t === 'min' ? 'costo ↓' : 'beneficio ↑');
export const typeLong = (t: MatrixType) => (t === 'min' ? 'costo (menos es mejor)' : 'beneficio (más es mejor)');

/** Lista de nombres «A», «B» y «C». */
export function listNames(xs: string[]): string {
  const q = xs.map((x) => `«${x}»`);
  return q.length <= 1 ? q.join('') : q.slice(0, -1).join(', ') + ' y ' + q[q.length - 1];
}

/** Lista sin comillas: a, b y c. */
export function listPlain(xs: string[]): string {
  return xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1];
}

/** Pares no ordenados i < k. */
export function unorderedPairs(n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let k = i + 1; k < n; k++) out.push([i, k]);
  return out;
}
