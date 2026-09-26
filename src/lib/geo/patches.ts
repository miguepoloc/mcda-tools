/** Parcelas contiguas de alta aptitud con un área mínima (p. ej. "≥ 20 ha" para una finca solar). Puro.
 * Componentes conexos (8 vecinos) de las celdas de clase alta; las más chicas que `minCells` se
 * descartan. Las que quedan se numeran de mayor a menor (id 1 = la más grande). */
import { CLASS_ALTA, MASK_VALID } from './suitability.ts';

export type Parcel = { id: number; cells: number; ha: number; meanPct: number; minPct: number; col: number; row: number };

export function findParcels(
  cls: Uint8Array, pct: Uint8Array, mask: Uint8Array, w: number, h: number, minCells: number, haPerPixel: number,
): { labels: Uint32Array; parcels: Parcel[] } {
  const n = w * h;
  const ok = (i: number) => mask[i] === MASK_VALID && pct[i] !== 255 && cls[i] === CLASS_ALTA;
  const comp = new Int32Array(n).fill(-1);
  const found: { cells: number[]; }[] = [];
  const stack: number[] = [];
  for (let s = 0; s < n; s++) {
    if (comp[s] !== -1 || !ok(s)) continue;
    const id = found.length, cells: number[] = [];
    comp[s] = id; stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      cells.push(i);
      const x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (comp[j] === -1 && ok(j)) { comp[j] = id; stack.push(j); }
      }
    }
    found.push({ cells });
  }
  const kept = found.filter((c) => c.cells.length >= Math.max(1, minCells)).sort((a, b) => b.cells.length - a.cells.length);
  const labels = new Uint32Array(n);
  const parcels: Parcel[] = kept.map((c, k) => {
    let sx = 0, sy = 0, sp = 0, mp = 255;
    for (const i of c.cells) {
      const x = i % w, y = (i - x) / w;
      sx += x; sy += y; sp += pct[i]; if (pct[i] < mp) mp = pct[i];
      labels[i] = k + 1;
    }
    const m = c.cells.length;
    return { id: k + 1, cells: m, ha: m * haPerPixel, meanPct: sp / m, minPct: mp, col: sx / m, row: sy / m };
  });
  return { labels, parcels };
}
