/* eslint-disable @typescript-eslint/no-explicit-any */
import { colL, qs, stl, W, type MatInfo } from './excel-core.ts';
import { getCell, getType } from './topsis.ts';
import { electre, electreCStar, electreDStar, electreKernelText, electreSynthesis } from './electre.ts';
import type { Alternative, Criterion, DecisionMatrix } from './types.ts';

/** ELECTRE I con fórmulas vivas: misma matriz "dirección beneficio" g y rango P que PROMETHEE.
 * Concordancia[i,k] = peso acumulado de los criterios donde i es al menos tan bueno como k (g_i>=g_k);
 * eso sí es un SUMPRODUCT normal sobre rangos (--(rango>=rango)), confiable. Discordancia[i,k] = mayor
 * objeción normalizada, y "mayor" es un MAX — a diferencia de SUM/SUMPRODUCT, MAX() envolviendo una
 * expresión-arreglo (en vez de celdas de verdad) NO se evalúa elemento a elemento en Excel/LibreOffice
 * sin entrarse como fórmula matricial (comprobado aquí con LibreOffice headless forzando el recálculo
 * real). Por eso primero se arma una grilla de "candidato a discordancia" POR CRITERIO (celda real por
 * cada (i,k,criterio)), y la discordancia final es MAX de esas celdas reales — un MAX de números
 * sueltos, no de un rango ni de una expresión, la forma más básica y confiable de usarlo. "Relación"
 * marca Sí cuando concordancia>=c* y discordancia<=d* (i != k) — puede quedar incomparable, ELECTRE no
 * da un ranking (ver electre.ts). La superación neta (para intuición, no un ranking real) se calcula
 * directamente de las grillas de concordancia/discordancia, no de la grilla "Relación" (que es texto):
 * la diagonal (i=k) siempre cumple concordancia=1/discordancia=0 en la aritmética cruda, pero se cancela
 * sola al restar superaciones-a-favor menos superaciones-en-contra. c* y d* son 2 CELDAS editables (las
 * que guardan `decision_matrix.electreCStar`/`electreDStar`, ver electre.ts) y las fórmulas de Relación
 * y Superación neta apuntan a ellas — mismo patrón que v en excel-vikor-sheet.ts. Verificado en
 * check-excel-electre.ts. */
export function electreSheet(criteria: Criterion[], alternatives: Alternative[], dm: DecisionMatrix, weights: number[], matInfo: MatInfo, matName: string, critInfo: { rN0: number; vc: number }) {
  const m = criteria.length, n = alternatives.length, { put, fin } = W();
  const matrix = alternatives.map((a) => criteria.map((c) => getCell(dm, a.id, c.id) ?? 0));
  const types = criteria.map((c) => getType(dm, c.id));
  const cStar = electreCStar(dm), dStar = electreDStar(dm);
  const r = electre(matrix, weights, types, cStar, dStar);
  const syn = electreSynthesis(criteria, alternatives, dm, weights, cStar, dStar);
  const rHead = 2, rP = 3, rW = 4, rCStarCell = rW + 1, rDStarCell = rCStarCell + 1, rG0 = rDStarCell + 1;
  const rConHead = rG0 + n + 1, rCon0 = rConHead + 1;
  // Discordancia por criterio, una grilla n×n por cada uno, ANTES de la grilla combinada: MAX() solo
  // es confiable sobre celdas reales (aquí, una por criterio), no sobre una expresión-arreglo armada
  // en la misma fórmula — ver la nota de arriba, comprobado con LibreOffice en modo headless.
  const rDisCritHead = criteria.map((_, j) => rCon0 + n + 1 + j * (n + 2));
  const rDisCrit0 = rDisCritHead.map((rh) => rh + 1);
  const rDisHead = rDisCritHead[m - 1] + n + 2, rDis0 = rDisHead + 1;
  const rRelHead = rDis0 + n + 1, rRel0 = rRelHead + 1;
  const MN = qs(matName), lastCrit = colL(m), lastAlt = colL(n), cNet = n + 1;
  put(1, 0, 'ELECTRE I — relación de superación', { s: stl.title });
  put(1, 1, `g convierte cada criterio a "mayor es mejor". Concordancia[i,k]: peso de los criterios donde i >= k. Discordancia[i,k]: mayor objeción normalizada a que i supere a k. i supera a k si concordancia >= c* (celda B${rCStarCell}, editable) y discordancia <= d* (celda B${rDStarCell}, editable) — ninguno se deriva de los datos, los elige quien decide. Puede no haber relación en ningún sentido (incomparables), ELECTRE no da un ranking.`, { s: stl.note });
  put(rHead, 0, 'Alternativa', { s: stl.hdrL });
  criteria.forEach((c, j) => put(rHead, 1 + j, c.name, { s: stl.hdr }));
  put(rP, 0, 'P (rango del criterio)', { s: stl.b });
  put(rW, 0, 'Peso (hoja Criterios)', { s: stl.b });
  criteria.forEach((_, j) => {
    const L = colL(1 + j), rng = `${MN}${L}${matInfo.rData0}:${L}${matInfo.rData0 + n - 1}`;
    put(rP, 1 + j, r.ranges[j], { f: `IF(MAX(${rng})-MIN(${rng})=0,1,MAX(${rng})-MIN(${rng}))`, z: '0.0000' });
    put(rW, 1 + j, r.weights[j], { f: `Criterios!${colL(critInfo.vc)}${critInfo.rN0 + j}`, z: '0.0000' });
  });
  put(rCStarCell, 0, 'c* (editable, concordancia mínima)', { s: stl.b });
  put(rCStarCell, 1, cStar, { s: stl.key, z: '0.00' });
  put(rDStarCell, 0, 'd* (editable, discordancia máxima)', { s: stl.b });
  put(rDStarCell, 1, dStar, { s: stl.key, z: '0.00' });
  alternatives.forEach((a, i) => {
    put(rG0 + i, 0, a.name, { s: stl.hdrL });
    criteria.forEach((_, j) => {
      const L = colL(1 + j), typeCell = `${MN}${L}$${matInfo.rType}`;
      put(rG0 + i, 1 + j, r.g[i][j], { f: `IF(${typeCell}="Costo",-1,1)*${MN}${L}${matInfo.rData0 + i}`, z: '0.0000' });
    });
  });
  const gridHead = (rh: number, label: string) => {
    put(rh, 0, label, { s: stl.hdrL });
    alternatives.forEach((a, k) => put(rh, 1 + k, a.name, { s: stl.hdr }));
  };
  gridHead(rConHead, 'Concordancia i \\ k');
  alternatives.forEach((a, i) => {
    const rr = rCon0 + i, gi = rG0 + i;
    put(rr, 0, a.name, { s: stl.hdrL });
    alternatives.forEach((_, k) => {
      if (i === k) { put(rr, 1 + k, 1, { s: stl.c, z: '0.0000' }); return; }
      const gk = rG0 + k;
      put(rr, 1 + k, r.concordance[i][k], { f: `SUMPRODUCT($B$${rW}:$${lastCrit}$${rW},--(B${gi}:${lastCrit}${gi}>=B${gk}:${lastCrit}${gk}))`, s: stl.c, z: '0.0000' });
    });
  });
  // Objeción de cada criterio por separado (candidato a discordancia): una celda real por (i,k,j), no
  // un rango — así el MAX() final de más abajo es MAX de celdas de verdad, no de una expresión.
  criteria.forEach((c, j) => {
    gridHead(rDisCritHead[j], `Discordancia — ${c.name}`);
    const L = colL(1 + j);
    alternatives.forEach((a, i) => {
      const rr = rDisCrit0[j] + i, giCell = `${L}${rG0 + i}`;
      put(rr, 0, a.name, { s: stl.hdrL });
      alternatives.forEach((_, k) => {
        if (i === k) { put(rr, 1 + k, 0, { s: stl.c, z: '0.0000' }); return; }
        const gkCell = `${L}${rG0 + k}`, pCell = `${L}$${rP}`;
        const cand = r.g[k][j] > r.g[i][j] ? Math.abs(r.g[k][j] - r.g[i][j]) / r.ranges[j] : 0;
        put(rr, 1 + k, cand, { f: `(${gkCell}>${giCell})*ABS(${gkCell}-${giCell})/${pCell}`, s: stl.c, z: '0.0000' });
      });
    });
  });
  gridHead(rDisHead, 'Discordancia i \\ k (máximo de los criterios de arriba)');
  alternatives.forEach((a, i) => {
    const rr = rDis0 + i;
    put(rr, 0, a.name, { s: stl.hdrL });
    alternatives.forEach((_, k) => {
      if (i === k) { put(rr, 1 + k, 0, { s: stl.c, z: '0.0000' }); return; }
      const cells = criteria.map((_, j) => colL(1 + k) + (rDisCrit0[j] + i));
      put(rr, 1 + k, r.discordance[i][k], { f: `MAX(${cells.join(',')})`, s: stl.c, z: '0.0000' });
    });
  });
  put(rRelHead, 0, 'Relación i \\ k', { s: stl.hdrL });
  alternatives.forEach((a, k) => put(rRelHead, 1 + k, a.name, { s: stl.hdr }));
  put(rRelHead, cNet, 'Superación neta', { s: stl.hdr });
  alternatives.forEach((a, i) => {
    const rr = rRel0 + i, conRow = rCon0 + i, disRow = rDis0 + i;
    put(rr, 0, a.name, { s: stl.hdrL });
    alternatives.forEach((_, k) => {
      if (i === k) { put(rr, 1 + k, '', { s: stl.c }); return; }
      const cCell = colL(1 + k) + conRow, dCell = colL(1 + k) + disRow;
      put(rr, 1 + k, r.outranks[i][k] ? 'Sí' : '', { f: `IF(AND(${cCell}>=$B$${rCStarCell}-1E-9,${dCell}<=$B$${rDStarCell}+1E-9),"Sí","")`, s: stl.c });
    });
    put(rr, cNet, syn.netOutdegree[i], {
      f: `SUMPRODUCT((B${conRow}:${lastAlt}${conRow}>=$B$${rCStarCell}-1E-9)*(B${disRow}:${lastAlt}${disRow}<=$B$${rDStarCell}+1E-9))-SUMPRODUCT((${colL(1 + i)}${rCon0}:${colL(1 + i)}${rCon0 + n - 1}>=$B$${rCStarCell}-1E-9)*(${colL(1 + i)}${rDis0}:${colL(1 + i)}${rDis0 + n - 1}<=$B$${rDStarCell}+1E-9))`,
      s: stl.key, z: '0',
    });
  });
  const rRelSum = rRel0 + n, tie = syn.relations.length === 0 && syn.incomparable.length === 0 && n > 1;
  put(rRelSum, 0, 'Relaciones (i supera a k)', { s: stl.b12 });
  if (syn.relations.length) syn.relations.forEach((rel, i) => put(rRelSum + 1 + i, 0, `${rel.winner} supera a ${rel.loser}`, { s: stl.wrap }));
  else put(rRelSum + 1, 0, tie ? 'Sin datos suficientes todavía.' : 'Ninguna alternativa supera a otra con estos umbrales.', { s: stl.wrap });
  const rInc = rRelSum + 2 + syn.relations.length;
  put(rInc, 0, 'Pares incomparables (ninguna supera a la otra)', { s: stl.b12 });
  if (syn.incomparable.length) syn.incomparable.forEach(([x, y], i) => put(rInc + 1 + i, 0, `${x} — ${y}`, { s: stl.wrap }));
  else put(rInc + 1, 0, 'Ninguno: cada par tiene relación en algún sentido.', { s: stl.wrap });
  // Núcleo de la relación (Roy): conjunto que ninguna otra alternativa del núcleo supera y que, juntas, supera a todas las demás (los ciclos son un solo bloque).
  // Las columnas «Supera a», «Es superada por» y «Estado» son fórmulas vivas sobre la grilla «Relación» (cambian si cambias c* o d*). La pertenencia al núcleo
  // NO es una fórmula: exige hallar ciclos (cierre transitivo), que en una celda no es confiable; se guarda como VALOR calculado al exportar con los c*/d*
  // del proyecto, y la nota de la hoja lo dice. Mismo criterio que electreKernel() (electre.ts): «que nadie la supere» NO basta para ganar.
  const kernel = syn.kernel, kernelText = electreKernelText(syn.names, kernel, syn.relations.length > 0);
  const rKerHead = rInc + 1 + Math.max(1, syn.incomparable.length) + 1, rKer0 = rKerHead + 1;
  put(rKerHead - 1, 0, 'Núcleo de la relación de superación', { s: stl.b12 });
  put(rKerHead, 0, 'Alternativa', { s: stl.hdrL });
  ['Supera a (nº)', 'Es superada por (nº)', 'Estado (según la grilla Relación)', 'En el núcleo (valor al exportar)'].forEach((h, c) => put(rKerHead, 1 + c, h, { s: stl.hdr }));
  alternatives.forEach((a, i) => {
    const rr = rKer0 + i, relRow = rRel0 + i, colI = colL(1 + i);
    const out = r.outranks[i].filter(Boolean).length, inn = r.outranks.filter((row) => row[i]).length;
    const estado = out === 0 && inn === 0 ? 'Sin relación' : inn === 0 ? 'Nadie la supera' : out === 0 ? 'Solo es superada' : 'Supera y es superada';
    put(rr, 0, a.name, { s: stl.hdrL });
    put(rr, 1, out, { f: `COUNTIF(B${relRow}:${lastAlt}${relRow},"Sí")`, s: stl.c, z: '0' });
    put(rr, 2, inn, { f: `COUNTIF(${colI}${rRel0}:${colI}${rRel0 + n - 1},"Sí")`, s: stl.c, z: '0' });
    put(rr, 3, estado, { f: `IF(AND(B${rr}=0,C${rr}=0),"Sin relación",IF(C${rr}=0,"Nadie la supera",IF(B${rr}=0,"Solo es superada","Supera y es superada")))`, s: stl.c });
    put(rr, 4, kernel.members.includes(i) ? 'Sí' : 'No', { s: stl.key });
  });
  const rKerSum = rKer0 + n;
  put(rKerSum, 0, kernelText.summary, { s: stl.wrap });
  kernelText.reasons.forEach((t, i) => put(rKerSum + 1 + i, 0, t, { s: stl.wrap }));
  put(rKerSum + 1 + kernelText.reasons.length, 0, 'Nota: «Nadie la supera» no significa «gana». La columna «En el núcleo» es un valor calculado al exportar con los c*/d* del proyecto: si cambias c* o d* en esta hoja, las demás columnas se recalculan pero esa no. Solo hay ganador si el núcleo es una única alternativa.', { s: stl.note });
  const colsW = [30, ...Array.from({ length: Math.max(m, n, 4, 1) }, () => 18)];
  return fin(colsW, [{ hpt: 30 }], [{ s: { r: 0, c: 1 }, e: { r: 0, c: Math.max(m, n) } }]);
}
