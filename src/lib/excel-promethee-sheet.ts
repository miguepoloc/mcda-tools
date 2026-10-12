/* eslint-disable @typescript-eslint/no-explicit-any */
import { colL, qs, stl, W, type MatInfo } from './excel-core.ts';
import { getCell, getType } from './topsis.ts';
import { promethee, prometheeCfgFor, prometheeI, type PrometheeIRel } from './promethee.ts';
import { PROMETHEE_DEFAULTS, PROMETHEE_FN_INFO, prefFn } from './prometheeConfig.ts';
import type { Alternative, Criterion, DecisionMatrix } from './types.ts';

/** PROMETHEE I y II con fórmulas vivas. Matriz "dirección beneficio" g (columnas de costo invertidas, así "mayor siempre es
 * mejor"); por criterio, función de preferencia (usual, U, V, Nivel, Lineal, Gaussiana) con umbrales q, p y σ en CELDAS editables
 * (por defecto: Tipo III, q = 0, p = rango, lo de siempre). La preferencia P_j(i, k) de cada criterio es una grilla de celdas
 * reales con una fórmula escalar (IF anidado, sin rangos dentro de funciones): π[i][k] suma w_j × P_j de esas celdas. La lección de
 * VIKOR/ELECTRE (CLAUDE.md) es que IF/MEDIAN/MAX aplicados a un rango no se evalúan elemento a elemento sin modo matricial; una
 * grilla de celdas lo evita por construcción. PROMETHEE I (relación parcial por φ⁺ y φ⁻) también son celdas y COUNTIF.
 * Verificado en check-excel-promethee.ts y check-excel-recalc.ts (LibreOffice recalcula con valores cacheados arruinados). */
export function prometheeSheet(criteria: Criterion[], alternatives: Alternative[], dm: DecisionMatrix, weights: number[], matInfo: MatInfo, matName: string, critInfo: { rN0: number; vc: number }) {
  const m = criteria.length, n = alternatives.length, { put, fin } = W();
  const matrix = alternatives.map((a) => criteria.map((c) => getCell(dm, a.id, c.id) ?? 0));
  const types = criteria.map((c) => getType(dm, c.id));
  const r = promethee(matrix, weights, types, prometheeCfgFor(criteria, dm));
  const p1 = prometheeI(r.phiPlus, r.phiMinus);
  const rHead = 2, rP = 3, rW = 4, rG0 = 5, rPiHead = rG0 + n + 1, rPi0 = rPiHead + 1;
  const cPhiP = n + 1, cPhiM = n + 2, cPhi = n + 3, cRk = n + 4;
  const MN = qs(matName), denom = Math.max(1, n - 1);
  const rGan = rPi0 + n + 1;
  // bloques añadidos debajo (las filas de arriba no se mueven)
  const rCfgTitle = rGan + 2, rCfgHead = rCfgTitle + 1, rFn = rCfgHead + 1, rQ = rFn + 1, rS = rQ + 1, rRange = rS + 1;
  const rITitle = rRange + 2, rIHead = rITitle + 1, rI0 = rIHead + 1;
  const rBlk0 = rI0 + n + 1, blkTitle = (j: number) => rBlk0 + j * (n + 3), blkData0 = (j: number) => blkTitle(j) + 2;
  const noteCols = Math.max(m, n + 4, 4);
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [{ s: { r: 0, c: 1 }, e: { r: 0, c: Math.max(m, cRk) } }];
  const note = (row: number, text: string) => { put(row, 1, text, { s: stl.note }); merges.push({ s: { r: row - 1, c: 1 }, e: { r: row - 1, c: noteCols } }); };

  put(1, 0, 'PROMETHEE I y II — flujos de preferencia', { s: stl.title });
  put(1, 1, 'g convierte cada criterio a "mayor es mejor" (invierte los de costo). Cada criterio tiene su función de preferencia (ver "Función de preferencia por criterio" más abajo; por defecto Tipo III con q = 0 y p = rango). pi[i,k] = preferencia de i sobre k, entre 0 y 1. Phi+ = cuánto supera i al resto; Phi- = cuánto lo superan; Phi neto = Phi+ - Phi-, mayor es mejor (PROMETHEE II). Más abajo, PROMETHEE I: orden parcial con preferencia, indiferencia e incomparabilidad.', { s: stl.note });
  put(rHead, 0, 'Alternativa', { s: stl.hdrL });
  criteria.forEach((c, j) => put(rHead, 1 + j, c.name, { s: stl.hdr }));
  put(rP, 0, 'p (umbral de preferencia)', { s: stl.b });
  put(rW, 0, 'Peso (hoja Criterios)', { s: stl.b });
  criteria.forEach((_, j) => {
    const L = colL(1 + j), rng = `${MN}${L}${matInfo.rData0}:${L}${matInfo.rData0 + n - 1}`;
    const pr = r.prefs[j], dfl = PROMETHEE_DEFAULTS[pr.fn];
    // p: constante si el usuario lo fijó; si no, el valor por defecto de la función como fórmula sobre el rango
    if (pr.defaulted.p) put(rP, 1 + j, pr.p, { f: dfl.p === 1 ? `${L}${rRange}` : `${L}${rRange}*${dfl.p}`, z: '0.0000' });
    else put(rP, 1 + j, pr.p, { z: '0.0000' });
    put(rW, 1 + j, r.weights[j], { f: `Criterios!${colL(critInfo.vc)}${critInfo.rN0 + j}`, z: '0.0000' });
    put(rRange, 1 + j, pr.range, { f: `IF(MAX(${rng})-MIN(${rng})=0,1,MAX(${rng})-MIN(${rng}))`, z: '0.0000' });
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
    const rr = rPi0 + i;
    put(rr, 0, a.name, { s: stl.hdrL });
    alternatives.forEach((_, k) => {
      if (i === k || m === 0) { put(rr, 1 + k, 0, { s: stl.c, z: '0.0000' }); return; }
      // π[i][k] = Σ_j w_j × P_j[i][k], con P_j leída de la grilla real del criterio j (celdas, no expresiones-arreglo)
      const f = criteria.map((_c, j) => `${colL(1 + j)}$${rW}*${colL(1 + k)}${blkData0(j) + i}`).join('+');
      put(rr, 1 + k, r.pi[i][k], { f, s: stl.c, z: '0.0000' });
    });
    const last = colL(n);
    put(rr, cPhiP, r.phiPlus[i], { f: `SUM(B${rr}:${last}${rr})/${denom}`, z: '0.0000' });
    put(rr, cPhiM, r.phiMinus[i], { f: `SUM(${colL(1 + i)}${rPi0}:${colL(1 + i)}${rPi0 + n - 1})/${denom}`, z: '0.0000' });
    put(rr, cPhi, r.phi[i], { f: `${colL(cPhiP)}${rr}-${colL(cPhiM)}${rr}`, s: stl.key, z: '0.0000' });
    put(rr, cRk, 1 + r.order.indexOf(i), { f: `RANK(${colL(cPhi)}${rr},${colL(cPhi)}$${rPi0}:${colL(cPhi)}$${rPi0 + n - 1})`, s: stl.c });
  });
  const top = alternatives[r.order[0]], tie = n < 2 || Math.max(...r.phi) - Math.min(...r.phi) < 1e-9;
  put(rGan, 0, 'Ganador', { s: stl.gain });
  put(rGan, 1, tie ? 'Empate (sin datos)' : top?.name ?? '', { f: `INDEX(A${rPi0}:A${rPi0 + n - 1},MATCH(MAX(${colL(cPhi)}${rPi0}:${colL(cPhi)}${rPi0 + n - 1}),${colL(cPhi)}${rPi0}:${colL(cPhi)}${rPi0 + n - 1},0))`, s: stl.gkey });
  put(rGan, 2, 'con flujo neto de');
  put(rGan, 3, r.phi[r.order[0]] ?? 0, { f: `MAX(${colL(cPhi)}${rPi0}:${colL(cPhi)}${rPi0 + n - 1})`, z: '0.0000' });

  // ---- Función de preferencia por criterio (celdas editables) ----
  put(rCfgTitle, 0, 'Función de preferencia por criterio', { s: stl.sub });
  note(rCfgTitle, 'Cambia el texto de «Función» (Usual, U, V, Nivel, Lineal o Gaussiana) o los umbrales q, p y σ y todo se recalcula. p está en la fila 3, arriba. Usual: sin umbrales. U: q. V: p (q = 0). Nivel y Lineal: q ≤ p. Gaussiana: σ. Brans y Vincke (1985).');
  put(rCfgHead, 0, 'Parámetro', { s: stl.hdrL });
  criteria.forEach((c, j) => put(rCfgHead, 1 + j, c.name, { s: stl.hdr }));
  put(rFn, 0, 'Función', { s: stl.b });
  put(rQ, 0, 'q (umbral de indiferencia)', { s: stl.b });
  put(rS, 0, 'σ (escala de la gaussiana)', { s: stl.b });
  put(rRange, 0, 'Rango del criterio (máx − mín)', { s: stl.b });
  criteria.forEach((_, j) => {
    const L = colL(1 + j), pr = r.prefs[j], dfl = PROMETHEE_DEFAULTS[pr.fn];
    put(rFn, 1 + j, PROMETHEE_FN_INFO[pr.fn].xl, { s: stl.c });
    if (pr.defaulted.q) put(rQ, 1 + j, dfl.q * pr.range, { f: dfl.q === 0 ? `0*${L}${rRange}` : `${L}${rRange}*${dfl.q}`, z: '0.0000' });
    else put(rQ, 1 + j, pr.q, { z: '0.0000' });
    if (pr.defaulted.s) put(rS, 1 + j, dfl.s * pr.range, { f: `${L}${rRange}*${dfl.s}`, z: '0.0000' });
    else put(rS, 1 + j, pr.s, { z: '0.0000' });
  });

  // ---- PROMETHEE I: orden parcial ----
  put(rITitle, 0, 'PROMETHEE I — orden parcial', { s: stl.sub });
  note(rITitle, 'A precede a B si Phi+(A) ≥ Phi+(B) y Phi-(A) ≤ Phi-(B) con al menos una estricta; indiferentes si los dos flujos coinciden; incomparables si un flujo favorece a A y el otro a B (tolerancia 1e-9). Cada celda es la relación de la fila respecto de la columna. PROMETHEE II siempre ordena; PROMETHEE I puede dejar pares sin relación.');
  put(rIHead, 0, 'Fila respecto de columna', { s: stl.hdrL });
  alternatives.forEach((a, k) => put(rIHead, 1 + k, a.name, { s: stl.hdr }));
  const cPrec = n + 1, cPrecd = n + 2, cInd = n + 3, cInc = n + 4;
  put(rIHead, cPrec, 'Precede a', { s: stl.hdr }); put(rIHead, cPrecd, 'Es precedida por', { s: stl.hdr });
  put(rIHead, cInd, 'Indiferente con', { s: stl.hdr }); put(rIHead, cInc, 'Incomparable con', { s: stl.hdr });
  const REL: Record<string, string> = { precedes: 'precede', preceded: 'es precedida', indifferent: 'indiferentes', incomparable: 'incomparables', self: '—' };
  const plusC = (i: number) => `$${colL(cPhiP)}$${rPi0 + i}`, minusC = (i: number) => `$${colL(cPhiM)}$${rPi0 + i}`;
  alternatives.forEach((a, i) => {
    const rr = rI0 + i;
    put(rr, 0, a.name, { s: stl.hdrL });
    alternatives.forEach((_, k) => {
      if (i === k) { put(rr, 1 + k, '—', { s: stl.c }); return; }
      const Pi = plusC(i), Pk = plusC(k), Mi = minusC(i), Mk = minusC(k), e = '1E-9';
      const f = `IF(AND(ABS(${Pi}-${Pk})<=${e},ABS(${Mi}-${Mk})<=${e}),"indiferentes",IF(AND(${Pi}>=${Pk}-${e},${Mi}<=${Mk}+${e}),"precede",IF(AND(${Pi}<=${Pk}+${e},${Mi}>=${Mk}-${e}),"es precedida","incomparables")))`;
      put(rr, 1 + k, REL[p1.rel[i][k]], { f, s: stl.c });
    });
    const rng = `B${rr}:${colL(n)}${rr}`;
    const cnt = (rel: PrometheeIRel) => alternatives.filter((_, k) => k !== i && p1.rel[i][k] === rel).length;
    put(rr, cPrec, cnt('precedes'), { f: `COUNTIF(${rng},"precede")`, s: stl.c });
    put(rr, cPrecd, cnt('preceded'), { f: `COUNTIF(${rng},"es precedida")`, s: stl.c });
    put(rr, cInd, cnt('indifferent'), { f: `COUNTIF(${rng},"indiferentes")`, s: stl.c });
    put(rr, cInc, cnt('incomparable'), { f: `COUNTIF(${rng},"incomparables")`, s: stl.c });
  });

  // ---- Preferencia por criterio: una grilla de celdas reales por criterio ----
  criteria.forEach((c, j) => {
    const L = colL(1 + j), t = blkTitle(j), d0 = blkData0(j);
    put(t, 0, `P por criterio: ${c.name}`, { s: stl.sub });
    put(t + 1, 0, 'i (fila) vs k (columna)', { s: stl.hdrL });
    alternatives.forEach((a, k) => put(t + 1, 1 + k, a.name, { s: stl.hdr }));
    const F = `$${L}$${rFn}`, q = `$${L}$${rQ}`, p = `$${L}$${rP}`, sg = `$${L}$${rS}`;
    alternatives.forEach((a, i) => {
      put(d0 + i, 0, a.name, { s: stl.hdrL });
      alternatives.forEach((_, k) => {
        if (i === k) { put(d0 + i, 1 + k, 0, { s: stl.c, z: '0.0000' }); return; }
        const D = `(${L}$${rG0 + i}-${L}$${rG0 + k})`;
        const f = `IF(${D}<=0,0,IF(${F}="Usual",1,IF(${F}="U",IF(${D}>${q},1,0),IF(${F}="V",IF(${D}>=${p},1,${D}/${p}),IF(${F}="Nivel",IF(${D}<=${q},0,IF(${D}<=${p},0.5,1)),IF(${F}="Lineal",IF(${D}<=${q},0,IF(${D}>=${p},1,(${D}-${q})/(${p}-${q}))),1-EXP(-(${D}^2)/(2*${sg}^2))))))))`;
        const val = prefFn(r.fn[j], r.g[i][j] - r.g[k][j], r.q[j], r.p[j], r.s[j]);
        put(d0 + i, 1 + k, val, { f, s: stl.c, z: '0.0000' });
      });
    });
  });
  const colsW = [30, ...Array.from({ length: Math.max(m, n, 1) }, () => 16), 12, 12, 12, 12];
  return fin(colsW, [{ hpt: 30 }], merges);
}
