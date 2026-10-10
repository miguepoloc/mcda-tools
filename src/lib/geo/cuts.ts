/** Cortes de clase calculados sobre la distribución del índice: cuantiles (misma cantidad de celdas por clase) y
 * rupturas naturales de Jenks (mínima varianza dentro de cada clase). Trabajan sobre el índice entero 0–100 (`pct`,
 * 255 = sin dato), el mismo que ve el usuario, con un histograma de 101 casillas: costo O(celdas) y no dependen del
 * orden. Devuelven cortes 0–1 ascendentes (N−1): una celda con índice ≥ corte pasa a la clase de arriba. Puros. */

export const BINS = 101;

/** Histograma del índice (0–100) de las celdas con dato que `include` deje pasar (por defecto todas). */
export function histogram(pct: Uint8Array, include?: (i: number) => boolean): number[] {
  const h = new Array<number>(BINS).fill(0);
  for (let i = 0; i < pct.length; i++) {
    const v = pct[i];
    if (v > 100) continue;
    if (include && !include(i)) continue;
    h[v]++;
  }
  return h;
}

/** Cuantiles: el corte j (1..N−1) es el índice del elemento en la posición ⌊n·j/N⌋ del orden ascendente, de modo
 * que cada clase recibe ≈ n/N celdas. Con muchos empates los cortes pueden repetirse (alguna clase queda vacía). */
export function quantileBreaks(hist: number[], nClasses: number): number[] {
  const n = hist.reduce((a, b) => a + b, 0);
  const out: number[] = [];
  if (n === 0 || nClasses < 2) return out;
  for (let j = 1; j < nClasses; j++) {
    const idx = Math.floor((n * j) / nClasses);
    let cum = 0, v = 0;
    for (; v < hist.length; v++) { cum += hist[v]; if (cum > idx) break; }
    out.push(Math.min(v, BINS - 1) / 100);
  }
  return out;
}

/** Rupturas naturales de Jenks (Fisher–Jenks exacto sobre el histograma ponderado): minimiza la suma de
 * cuadrados de las desviaciones dentro de las clases. El corte es el menor valor de la clase de arriba. */
export function jenksBreaks(hist: number[], nClasses: number): number[] {
  // Solo los valores con datos, ponderados por su frecuencia.
  const vals: number[] = [], w: number[] = [];
  hist.forEach((c, v) => { if (c > 0) { vals.push(v); w.push(c); } });
  const m = vals.length;
  if (m === 0 || nClasses < 2) return [];
  const k = Math.min(nClasses, m);
  // Sumas acumuladas para la varianza ponderada de un tramo [a..b] en O(1).
  const W = [0], S = [0], Q = [0];
  for (let i = 0; i < m; i++) { W.push(W[i] + w[i]); S.push(S[i] + w[i] * vals[i]); Q.push(Q[i] + w[i] * vals[i] * vals[i]); }
  const cost = (a: number, b: number) => { // tramo a..b inclusivo
    const ww = W[b + 1] - W[a], ss = S[b + 1] - S[a], qq = Q[b + 1] - Q[a];
    return ww > 0 ? qq - (ss * ss) / ww : 0;
  };
  // d[c][i] = mínimo costo de partir los primeros i+1 valores en c+1 clases; back para reconstruir.
  const d: number[][] = Array.from({ length: k }, () => new Array<number>(m).fill(Infinity));
  const back: number[][] = Array.from({ length: k }, () => new Array<number>(m).fill(0));
  for (let i = 0; i < m; i++) d[0][i] = cost(0, i);
  for (let c = 1; c < k; c++) {
    for (let i = c; i < m; i++) {
      for (let j = c; j <= i; j++) {
        const v = d[c - 1][j - 1] + cost(j, i);
        if (v < d[c][i]) { d[c][i] = v; back[c][i] = j; }
      }
    }
  }
  const starts: number[] = [];
  let i = m - 1;
  for (let c = k - 1; c >= 1; c--) { const j = back[c][i]; starts.push(vals[j]); i = j - 1; }
  const out = starts.reverse().map((v) => v / 100);
  // Si hay menos valores distintos que clases pedidas, se completan repitiendo el último corte (clases vacías).
  while (out.length < nClasses - 1) out.push(out.length ? out[out.length - 1] : 0);
  return out;
}
