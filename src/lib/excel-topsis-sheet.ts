/* eslint-disable @typescript-eslint/no-explicit-any */
import { colL, qs, stl, W, type MatInfo } from './excel-core.ts';
import { getCell, getType, topsis } from './topsis.ts';
import type { Alternative, Criterion, DecisionMatrix } from './types.ts';

/** TOPSIS con fórmulas vivas: normalización vectorial, ponderación (peso de la hoja Criterios),
 * ideal mejor/peor por columna según el tipo de la hoja de matriz, distancia euclidiana y cercanía
 * relativa Ci. Misma matemática que topsis() en topsis.ts (ver check-topsis.ts para la verificación
 * contra el notebook del curso); se recalcula aquí en JS solo para cachear el valor de cada celda. */
export function topsisSheet(criteria: Criterion[], alternatives: Alternative[], dm: DecisionMatrix, weights: number[], matInfo: MatInfo, matName: string, critInfo: { rN0: number; vc: number }) {
  const m = criteria.length, n = alternatives.length, { put, fin } = W();
  const matrix = alternatives.map((a) => criteria.map((c) => getCell(dm, a.id, c.id) ?? 0));
  const types = criteria.map((c) => getType(dm, c.id));
  const r = topsis(matrix, weights, types);
  const rHead = 2, rW = 3, rNorm = 4, rV0 = 5, rAplus = rV0 + n, rAminus = rAplus + 1;
  const cDp = m + 1, cDm = m + 2, cCi = m + 3, cRk = m + 4;
  const MN = qs(matName);
  put(1, 0, 'TOPSIS — cercanía relativa a la solución ideal', { s: stl.title });
  put(1, 1, 'Distancia euclidiana a un ideal (A+) y a un anti-ideal (A-) tras normalizar y ponderar la matriz de decisión. Ci cerca de 1 = cerca del ideal. Peso de cada criterio: hoja Criterios.', { s: stl.note });
  put(rHead, 0, 'Alternativa', { s: stl.hdrL });
  criteria.forEach((c, j) => put(rHead, 1 + j, c.name, { s: stl.hdr }));
  put(rHead, cDp, 'Distancia D+', { s: stl.hdr }); put(rHead, cDm, 'Distancia D-', { s: stl.hdr });
  put(rHead, cCi, 'Cercanía Ci', { s: stl.hdr }); put(rHead, cRk, 'Ranking', { s: stl.hdr });
  put(rW, 0, 'Peso (hoja Criterios)', { s: stl.b });
  criteria.forEach((_, j) => put(rW, 1 + j, r.weights[j], { f: `Criterios!${colL(critInfo.vc)}${critInfo.rN0 + j}`, z: '0.0000' }));
  put(rNorm, 0, 'Norma euclidiana de la columna', { s: stl.b });
  criteria.forEach((_, j) => {
    const L = colL(1 + j);
    put(rNorm, 1 + j, r.norms[j], { f: `SQRT(SUMSQ(${MN}${L}${matInfo.rData0}:${L}${matInfo.rData0 + n - 1}))`, z: '0.0000' });
  });
  alternatives.forEach((a, i) => {
    const rr = rV0 + i, last = colL(m);
    put(rr, 0, a.name, { s: stl.hdrL });
    criteria.forEach((_, j) => {
      const L = colL(1 + j);
      put(rr, 1 + j, r.v[i][j], { f: `(${MN}${L}${matInfo.rData0 + i}/${L}$${rNorm})*${L}$${rW}`, z: '0.0000' });
    });
    put(rr, cDp, r.distPlus[i], { f: `SQRT(SUMPRODUCT((B${rr}:${last}${rr}-B$${rAplus}:${last}$${rAplus})^2))`, z: '0.0000' });
    put(rr, cDm, r.distMinus[i], { f: `SQRT(SUMPRODUCT((B${rr}:${last}${rr}-B$${rAminus}:${last}$${rAminus})^2))`, z: '0.0000' });
    put(rr, cCi, r.closeness[i], { f: `IFERROR(${colL(cDm)}${rr}/(${colL(cDp)}${rr}+${colL(cDm)}${rr}),0)`, s: stl.key, z: '0.0000' });
    put(rr, cRk, 1 + r.order.indexOf(i), { f: `RANK(${colL(cCi)}${rr},${colL(cCi)}$${rV0}:${colL(cCi)}$${rV0 + n - 1})`, s: stl.c });
  });
  put(rAplus, 0, 'Ideal mejor (A+)', { s: stl.b });
  put(rAminus, 0, 'Ideal peor (A-)', { s: stl.b });
  criteria.forEach((_, j) => {
    const L = colL(1 + j), rng = `${L}${rV0}:${L}${rV0 + n - 1}`, typeCell = `${MN}${L}$${matInfo.rType}`;
    put(rAplus, 1 + j, r.best[j], { f: `IF(${typeCell}="Costo",MIN(${rng}),MAX(${rng}))`, z: '0.0000' });
    put(rAminus, 1 + j, r.worst[j], { f: `IF(${typeCell}="Costo",MAX(${rng}),MIN(${rng}))`, z: '0.0000' });
  });
  const g = rAminus + 2, top = alternatives[r.order[0]], tie = n < 2 || Math.max(...r.closeness) - Math.min(...r.closeness) < 1e-9;
  put(g, 0, 'Ganador', { s: stl.gain });
  put(g, 1, tie ? 'Empate (sin datos)' : top?.name ?? '', { f: `INDEX(A${rV0}:A${rV0 + n - 1},MATCH(MAX(${colL(cCi)}${rV0}:${colL(cCi)}${rV0 + n - 1}),${colL(cCi)}${rV0}:${colL(cCi)}${rV0 + n - 1},0))`, s: stl.gkey });
  put(g, 2, 'con cercanía Ci de');
  put(g, 3, r.closeness[r.order[0]] ?? 0, { f: `MAX(${colL(cCi)}${rV0}:${colL(cCi)}${rV0 + n - 1})`, z: '0.0000' });
  const colsW = [30, ...Array.from({ length: Math.max(m, 1) }, () => 16), 15, 15, 14, 12];
  return fin(colsW, [{ hpt: 30 }], [{ s: { r: 0, c: 1 }, e: { r: 0, c: cRk } }]);
}
