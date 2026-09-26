/* eslint-disable @typescript-eslint/no-explicit-any */
import { colL, qs, stl, W, type MatInfo } from './excel-core.ts';
import { getCell, getType } from './topsis.ts';
import { promethee } from './promethee.ts';
import type { Alternative, Criterion, DecisionMatrix } from './types.ts';

/** PROMETHEE II con fórmulas vivas: matriz "dirección beneficio" g (columnas de costo invertidas, así
 * "mayor siempre es mejor"), P = rango por columna (Q=0, sin umbral de indiferencia — mismo criterio
 * que promethee.ts), matriz de preferencia pi[i][k] (i vs k) y flujos phi+/phi-/neto. Con Q=0 la
 * función de preferencia Tipo III es un simple clamp a [0,1] de (dif/P); la fórmula lo arma con
 * comparaciones y aritmética pura — (d>0)*(d<1)*d + (d>=1)*1 — en vez de IF()/MEDIAN() envolviendo el
 * rango: funciones aplicadas a un rango completo necesitan entrarse como fórmula matricial
 * (Ctrl+Shift+Enter) para evaluar elemento a elemento, y sin eso Excel/LibreOffice las trata como
 * agregado y da un número sin sentido — comprobado aquí mismo con LibreOffice en modo headless
 * forzando el recálculo real (no solo el valor cacheado) antes de elegir esta forma. Los operadores de
 * comparación (>,<,>=) y aritméticos si vectorizan sobre un rango sin necesitar modo matricial, que es
 * la base del truco SUMPRODUCT de siempre. Verificado en check-excel-promethee.ts. */
export function prometheeSheet(criteria: Criterion[], alternatives: Alternative[], dm: DecisionMatrix, weights: number[], matInfo: MatInfo, matName: string, critInfo: { rN0: number; vc: number }) {
  const m = criteria.length, n = alternatives.length, { put, fin } = W();
  const matrix = alternatives.map((a) => criteria.map((c) => getCell(dm, a.id, c.id) ?? 0));
  const types = criteria.map((c) => getType(dm, c.id));
  const r = promethee(matrix, weights, types);
  const rHead = 2, rP = 3, rW = 4, rG0 = 5, rPiHead = rG0 + n + 1, rPi0 = rPiHead + 1;
  const cPhiP = n + 1, cPhiM = n + 2, cPhi = n + 3, cRk = n + 4;
  const MN = qs(matName), lastCrit = colL(m), denom = Math.max(1, n - 1);
  put(1, 0, 'PROMETHEE II — flujos de preferencia', { s: stl.title });
  put(1, 1, 'g convierte cada criterio a "mayor es mejor" (invierte los de costo). P = rango de cada criterio (max-min). pi[i,k] = preferencia de i sobre k, entre 0 y 1. Phi+ = cuánto supera i al resto; Phi- = cuánto lo superan; Phi neto = Phi+ - Phi-, mayor es mejor.', { s: stl.note });
  put(rHead, 0, 'Alternativa', { s: stl.hdrL });
  criteria.forEach((c, j) => put(rHead, 1 + j, c.name, { s: stl.hdr }));
  put(rP, 0, 'P (rango del criterio)', { s: stl.b });
  put(rW, 0, 'Peso (hoja Criterios)', { s: stl.b });
  criteria.forEach((_, j) => {
    const L = colL(1 + j), rng = `${MN}${L}${matInfo.rData0}:${L}${matInfo.rData0 + n - 1}`;
    put(rP, 1 + j, r.p[j], { f: `IF(MAX(${rng})-MIN(${rng})=0,1,MAX(${rng})-MIN(${rng}))`, z: '0.0000' });
    put(rW, 1 + j, r.weights[j], { f: `Criterios!${colL(critInfo.vc)}${critInfo.rN0 + j}`, z: '0.0000' });
  });
  alternatives.forEach((a, i) => {
    put(rG0 + i, 0, a.name, { s: stl.hdrL });
    criteria.forEach((_, j) => {
      const L = colL(1 + j), typeCell = `${MN}${L}$${matInfo.rType}`;
      put(rG0 + i, 1 + j, r.g[i][j], { f: `IF(${typeCell}="Costo",-1,1)*${MN}${L}${matInfo.rData0 + i}`, z: '0.0000' });
    });
  });
  put(rPiHead, 0, 'i (fila) vs k (columna)', { s: stl.hdrL });
  alternatives.forEach((a, k) => put(rPiHead, 1 + k, a.name, { s: stl.hdr }));
  put(rPiHead, cPhiP, 'Phi+', { s: stl.hdr }); put(rPiHead, cPhiM, 'Phi-', { s: stl.hdr });
  put(rPiHead, cPhi, 'Phi neto', { s: stl.hdr }); put(rPiHead, cRk, 'Ranking', { s: stl.hdr });
  alternatives.forEach((a, i) => {
    const rr = rPi0 + i, gi = `${rG0 + i}`;
    put(rr, 0, a.name, { s: stl.hdrL });
    alternatives.forEach((_, k) => {
      if (i === k) { put(rr, 1 + k, 0, { s: stl.c, z: '0.0000' }); return; }
      const gk = `${rG0 + k}`;
      const d = `((B${gi}:${lastCrit}${gi}-B${gk}:${lastCrit}${gk})/$B$${rP}:$${lastCrit}$${rP})`;
      put(rr, 1 + k, r.pi[i][k], {
        f: `SUMPRODUCT($B$${rW}:$${lastCrit}$${rW},(${d}>0)*(${d}<1)*${d}+(${d}>=1)*1)`,
        s: stl.c, z: '0.0000',
      });
    });
    const last = colL(n);
    put(rr, cPhiP, r.phiPlus[i], { f: `SUM(B${rr}:${last}${rr})/${denom}`, z: '0.0000' });
    put(rr, cPhiM, r.phiMinus[i], { f: `SUM(${colL(1 + i)}${rPi0}:${colL(1 + i)}${rPi0 + n - 1})/${denom}`, z: '0.0000' });
    put(rr, cPhi, r.phi[i], { f: `${colL(cPhiP)}${rr}-${colL(cPhiM)}${rr}`, s: stl.key, z: '0.0000' });
    put(rr, cRk, 1 + r.order.indexOf(i), { f: `RANK(${colL(cPhi)}${rr},${colL(cPhi)}$${rPi0}:${colL(cPhi)}$${rPi0 + n - 1})`, s: stl.c });
  });
  const g = rPi0 + n + 1, top = alternatives[r.order[0]], tie = n < 2 || Math.max(...r.phi) - Math.min(...r.phi) < 1e-9;
  put(g, 0, 'Ganador', { s: stl.gain });
  put(g, 1, tie ? 'Empate (sin datos)' : top?.name ?? '', { f: `INDEX(A${rPi0}:A${rPi0 + n - 1},MATCH(MAX(${colL(cPhi)}${rPi0}:${colL(cPhi)}${rPi0 + n - 1}),${colL(cPhi)}${rPi0}:${colL(cPhi)}${rPi0 + n - 1},0))`, s: stl.gkey });
  put(g, 2, 'con flujo neto de');
  put(g, 3, r.phi[r.order[0]] ?? 0, { f: `MAX(${colL(cPhi)}${rPi0}:${colL(cPhi)}${rPi0 + n - 1})`, z: '0.0000' });
  const colsW = [30, ...Array.from({ length: Math.max(m, n, 1) }, () => 16), 12, 12, 12, 12];
  return fin(colsW, [{ hpt: 30 }], [{ s: { r: 0, c: 1 }, e: { r: 0, c: Math.max(m, cRk) } }]);
}
