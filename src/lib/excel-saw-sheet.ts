/* eslint-disable @typescript-eslint/no-explicit-any */
import { colL, qs, stl, W, type MatInfo } from './excel-core.ts';
import { getCell, getType } from './topsis.ts';
import { saw } from './saw.ts';
import type { Alternative, Criterion, DecisionMatrix } from './types.ts';

/** SAW — Simple Additive Weighting con fórmulas vivas.
 * Normalización Min-Max por columna (beneficio: (x-min)/(max-min); costo: (max-x)/(max-min)).
 * Puntaje = SUMPRODUCT(peso, rij). Mayor puntaje es mejor. Verificado en check-excel-saw.ts. */
export function sawSheet(criteria: Criterion[], alternatives: Alternative[], dm: DecisionMatrix, weights: number[], matInfo: MatInfo, matName: string, critInfo: { rN0: number; vc: number }) {
  const m = criteria.length, n = alternatives.length, { put, fin } = W();
  const matrix = alternatives.map((a) => criteria.map((c) => getCell(dm, a.id, c.id) ?? 0));
  const types = criteria.map((c) => getType(dm, c.id));
  const r = saw(matrix, weights, types);
  const MN = qs(matName);
  const rHead = 2, rW = 3, rLo = 4, rHi = 5, rN0 = 6, rV0 = rN0 + n + 1, cScore = m + 1, cRk = m + 2;
  const lastCrit = colL(m);
  put(1, 0, 'SAW — Suma Aditiva Ponderada (Simple Additive Weighting)', { s: stl.title });
  put(1, 1, 'Normalización Min-Max por criterio (beneficio: (x-min)/(max-min); costo: (max-x)/(max-min)). Puntaje = SUMPRODUCT(peso × r_ij). Mayor puntaje es mejor. Pesos de la hoja Criterios.', { s: stl.note });
  // --- Encabezados ---
  put(rHead, 0, 'Alternativa', { s: stl.hdrL });
  criteria.forEach((c, j) => put(rHead, 1 + j, c.name, { s: stl.hdr }));
  put(rHead, cScore, 'Puntaje SAW', { s: stl.hdr });
  put(rHead, cRk, 'Ranking', { s: stl.hdr });
  // --- Pesos, mínimos y máximos ---
  put(rW, 0, 'Peso (hoja Criterios)', { s: stl.b });
  put(rLo, 0, 'Mínimo de la columna', { s: stl.b });
  put(rHi, 0, 'Máximo de la columna', { s: stl.b });
  criteria.forEach((_, j) => {
    const L = colL(1 + j);
    const rng = `${MN}${L}${matInfo.rData0}:${L}${matInfo.rData0 + n - 1}`;
    put(rW, 1 + j, r.weights[j], { f: `Criterios!${colL(critInfo.vc)}${critInfo.rN0 + j}`, z: '0.0000' });
    put(rLo, 1 + j, Math.min(...matrix.map((row) => row[j])), { f: `MIN(${rng})`, z: '0.0000' });
    put(rHi, 1 + j, Math.max(...matrix.map((row) => row[j])), { f: `MAX(${rng})`, z: '0.0000' });
  });
  // --- Sección: Valores originales (referencia) ---
  put(rN0 - 1, 0, 'Valores originales (de «Matriz de decisión»)', { s: stl.sub });
  alternatives.forEach((a, i) => {
    put(rN0 + i, 0, a.name, { s: stl.hdrL });
    criteria.forEach((_, j) => {
      const L = colL(1 + j);
      put(rN0 + i, 1 + j, matrix[i][j], { f: `${MN}${L}${matInfo.rData0 + i}`, z: '0.0000' });
    });
  });
  // --- Sección: Valores normalizados r_ij ---
  put(rV0 - 1, 0, 'Valores normalizados r_ij (Min-Max)', { s: stl.sub });
  alternatives.forEach((a, i) => {
    const rr = rV0 + i;
    put(rr, 0, a.name, { s: stl.hdrL });
    criteria.forEach((_, j) => {
      const L = colL(1 + j), typeCell = `${MN}${L}$${matInfo.rType}`;
      const loCell = `${L}$${rLo}`, hiCell = `${L}$${rHi}`;
      const span = `IFERROR(${hiCell}-${loCell},1)`;
      // Beneficio: (x-min)/(max-min); Costo: (max-x)/(max-min)
      put(rr, 1 + j, r.normalized[i][j], {
        f: `IF(${typeCell}="Costo",IFERROR((${hiCell}-${L}${rN0 + i})/${span},0),IFERROR((${L}${rN0 + i}-${loCell})/${span},0))`,
        z: '0.0000',
      });
    });
    put(rr, cScore, r.scores[i], { f: `SUMPRODUCT(B$${rW}:${lastCrit}$${rW},B${rr}:${lastCrit}${rr})`, s: stl.key, z: '0.0000' });
    put(rr, cRk, 1 + r.order.indexOf(i), { f: `RANK(${colL(cScore)}${rr},${colL(cScore)}$${rV0}:${colL(cScore)}$${rV0 + n - 1})`, s: stl.c });
  });
  const g = rV0 + n + 1, top = alternatives[r.order[0]], tie = n < 2 || Math.max(...r.scores) - Math.min(...r.scores) < 1e-9;
  put(g, 0, 'Ganador', { s: stl.gain });
  put(g, 1, tie ? 'Empate (sin datos)' : top?.name ?? '', {
    f: `INDEX(A${rV0}:A${rV0 + n - 1},MATCH(MAX(${colL(cScore)}${rV0}:${colL(cScore)}${rV0 + n - 1}),${colL(cScore)}${rV0}:${colL(cScore)}${rV0 + n - 1},0))`,
    s: stl.gkey,
  });
  put(g, 2, 'con puntaje SAW de');
  put(g, 3, r.scores[r.order[0]] ?? 0, { f: `MAX(${colL(cScore)}${rV0}:${colL(cScore)}${rV0 + n - 1})`, z: '0.0000' });
  const colsW = [30, ...Array.from({ length: Math.max(m, 1) }, () => 16), 14, 12];
  return fin(colsW, [{ hpt: 30 }], [{ s: { r: 0, c: 1 }, e: { r: 0, c: cRk } }]);
}
