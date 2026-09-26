// Eigenvector vs column-mean weights. Reference: Polo-Castañeda, Gómez-Rojas & Linero-Cueto (2021), IJASEIT 11(5),
// Table IV (weighted expert PCM, 4 criteria), Table V (priority vector) and CR = 0.0652.
import { analyze, principalEigenvector } from '../src/lib/ahp.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

// Table IV as printed: only the upper triangle is used (the printed lower triangle is rounded to 2 decimals).
const upper = [[1, 4.05, 4.16, 3.01], [0, 1, 0.58, 1.86], [0, 0, 1, 2.45], [0, 0, 0, 1]];
const T4 = upper.map((r, i) => r.map((_, j) => (i === j ? 1 : j > i ? upper[i][j] : 1 / upper[j][i])));
const published = [0.5482, 0.1423, 0.2020, 0.1075];

{
  const e = analyze(T4, 'eigenvector');
  // The paper's rounded matrix cannot reproduce the published vector better than about 3e-4.
  ok(e.w.every((w, i) => cerca(w, published[i], 3e-4)), `eigenvector = [${e.w.map((x) => x.toFixed(4)).join(', ')}] (publicado ${published.join(', ')})`);
  ok(cerca(e.cr, 0.0652, 1e-3), `CR = ${e.cr.toFixed(4)} (publicado 0.0652)`);
  ok(e.lam > 4 && cerca(e.lam, 4.1744, 5e-4), `λmax = ${e.lam.toFixed(4)} (≈ 4.174 con la Tabla IV)`);
  // Definition: A w = λ w
  const Aw = T4.map((r) => r.reduce((a, x, j) => a + x * e.w[j], 0));
  ok(Aw.every((x, i) => cerca(x, e.lam * e.w[i], 1e-9)), 'A·w = λ·w (es realmente un eigenvector)');
  ok(cerca(e.w.reduce((a, b) => a + b, 0), 1, 1e-12), 'los pesos suman 1');
}

{
  const m = analyze(T4, 'mean');
  const e = analyze(T4, 'eigenvector');
  ok(m.method === 'mean' && analyze(T4).method === 'eigenvector', 'el método por defecto es el eigenvector; el promedio de columnas (curso) se pide explícitamente');
  ok(cerca(m.w[0], 0.5355, 5e-4) && Math.abs(m.w[0] - e.w[0]) > 0.01, `promedio de columnas = ${m.w[0].toFixed(4)}: difiere ${(e.w[0] - m.w[0]).toFixed(4)} del eigenvector en el peso principal`);
  ok(m.wEigen.every((x, i) => cerca(x, e.wEigen[i], 1e-12)) && e.wMean.every((x, i) => cerca(x, m.wMean[i], 1e-12)), 'ambos vectores se exponen siempre (wMean, wEigen)');
}

// On a perfectly consistent matrix both methods coincide.
{
  const w = [4, 2, 1].map((x) => x / 7);
  const A = w.map((a) => w.map((b) => a / b));
  const m = analyze(A, 'mean'), e = analyze(A, 'eigenvector');
  ok(m.w.every((x, i) => cerca(x, e.w[i], 1e-12)) && m.cr < 1e-9 && e.cr < 1e-9, 'matriz consistente: promedio y eigenvector coinciden, CR ≈ 0');
}

// 2×2: reciprocal matrix, weights x/(1+x).
ok(cerca(principalEigenvector([[1, 3], [1 / 3, 1]])[0], 0.75, 1e-12), 'matriz 2×2 [1,3]: peso 0.75');

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK (check-ahp-eigen)');
process.exit(fallos ? 1 : 0);
