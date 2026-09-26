/** Mapas de coordenadas por interpolación: evalúa una transformación costosa (reproyección con
 * proj4) solo en una retícula gruesa y la interpola bilinealmente al resto de las celdas. La
 * proyección es suave, así que el error es de una fracción de píxel y se ahorra ~step² llamadas.
 * Puro. */
export function interpolatedMap(
  w: number, h: number, f: (col: number, row: number) => [number, number], step = 8,
): { u: Float32Array; v: Float32Array } {
  const nx = w <= 1 ? 1 : Math.ceil((w - 1) / step) + 1;
  const ny = h <= 1 ? 1 : Math.ceil((h - 1) / step) + 1;
  const cs = Array.from({ length: nx }, (_, i) => Math.min(i * step, w - 1));
  const rs = Array.from({ length: ny }, (_, j) => Math.min(j * step, h - 1));
  const LU = new Float64Array(nx * ny), LV = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const [x, y] = f(cs[i], rs[j]);
      LU[j * nx + i] = x; LV[j * nx + i] = y;
    }
  }
  const u = new Float32Array(w * h), v = new Float32Array(w * h);
  for (let r = 0; r < h; r++) {
    const gj = ny === 1 ? 0 : Math.min(Math.floor(r / step), ny - 2);
    const ty = ny === 1 ? 0 : (r - rs[gj]) / (rs[gj + 1] - rs[gj]);
    for (let c = 0; c < w; c++) {
      const gi = nx === 1 ? 0 : Math.min(Math.floor(c / step), nx - 2);
      const tx = nx === 1 ? 0 : (c - cs[gi]) / (cs[gi + 1] - cs[gi]);
      const dx = nx === 1 ? 0 : 1, dy = ny === 1 ? 0 : nx;
      const i00 = gj * nx + gi, i10 = i00 + dx, i01 = i00 + dy, i11 = i00 + dx + dy;
      const k = r * w + c;
      u[k] = (LU[i00] * (1 - tx) + LU[i10] * tx) * (1 - ty) + (LU[i01] * (1 - tx) + LU[i11] * tx) * ty;
      v[k] = (LV[i00] * (1 - tx) + LV[i10] * tx) * (1 - ty) + (LV[i01] * (1 - tx) + LV[i11] * tx) * ty;
    }
  }
  return { u, v };
}
