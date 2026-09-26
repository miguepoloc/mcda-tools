/* eslint-disable @typescript-eslint/no-explicit-any */
import { colL, stl, W } from './excel-core.ts';
import { getType } from './topsis.ts';
import { fuzzyTopsisSynthesis, LINGUISTIC_ALT, LINGUISTIC_LABELS, type LinguisticLabel } from './fuzzy_topsis.ts';
import type { Alternative, Criterion, DecisionMatrix } from './types.ts';

/** Fuzzy TOPSIS con fórmulas vivas.
 * Referencia: Chen (2000). Evaluaciones lingüísticas VP/P/F/G/VG → TFN (l,m,u).
 * Estructura:
 *   1. Tabla de escala lingüística.
 *   2. Matriz de etiquetas lingüísticas (texto: VP, P, F, G, VG).
 *   3. TFN expandida: cada criterio ocupa 3 columnas (l, m, u).
 *   4. Normalización difusa (max u* para beneficio; min l* para costo).
 *   5. Matriz ponderada v_ij = w_j × r_ij (por columna-triple).
 *   6. Distancias d+ y d- (Vertex Method: √((l1-l2)²+(m1-m2)²+(u1-u2)²)/3).
 *   7. CC_i = d- / (d+ + d-). Mayor CC es mejor.
 * Nota: dado que cada TFN ocupa 3 columnas en Excel, las fórmulas referencian celdas reales
 * (cacheadas) en vez de rangos compuestos, lo que garantiza compatibilidad sin fórmulas matriciales. */
export function fuzzyTopsisSheet(criteria: Criterion[], alternatives: Alternative[], dm: DecisionMatrix, weights: number[], critInfo: { rN0: number; vc: number }) {
  const m = criteria.length, n = alternatives.length, { put, fin } = W();
  const r = fuzzyTopsisSynthesis(criteria, alternatives, dm, weights);
  // Carga TFNs de cada celda (etiqueta → TFN)
  function getLbl(altId: string, critId: string): LinguisticLabel {
    const v = dm.values[altId]?.[critId];
    return (typeof v === 'string' && LINGUISTIC_LABELS.includes(v as LinguisticLabel)) ? (v as LinguisticLabel) : 'F';
  }
  const wSum = weights.reduce((a, b) => a + b, 0) || 1;
  const w = weights.map((x) => x / wSum);
  const fdm = alternatives.map((a) => criteria.map((c) => LINGUISTIC_ALT[getLbl(a.id, c.id)]));
  const types = criteria.map((c) => getType(dm, c.id));
  // Columnas TFN: cada criterio j ocupa columnas 1+3j, 2+3j, 3+3j
  const cL = (j: number) => 1 + 3 * j;  // columna l del criterio j
  const cM = (j: number) => 2 + 3 * j;  // columna m
  const cU = (j: number) => 3 + 3 * j;  // columna u
  const totalCritCols = 3 * m;
  const cDp = totalCritCols + 1, cDm = totalCritCols + 2, cCC = totalCritCols + 3, cRk = totalCritCols + 4;
  // Filas del layout
  const rScaleHead = 1, rScale0 = rScaleHead + 1; // tabla de escala: 1+5 filas
  const rW = rScale0 + LINGUISTIC_LABELS.length + 1; // pesos
  const rHead = rW + 1; // encabezados TFN
  const rLblHead = rHead + 1; // etiquetas lingüísticas (texto)
  const rLbl0 = rLblHead + 1; // datos de etiquetas
  const rFDMHead = rLbl0 + n + 1; // TFN cruda
  const rFDM0 = rFDMHead + 1;
  const rNHead = rFDM0 + n + 1; // normalizada
  const rN0 = rNHead + 1;
  const rVHead = rN0 + n + 1; // ponderada
  const rV0 = rVHead + 1;
  const rFPIS = rV0 + n; // A+ = (1,1,1)
  const rFNIS = rFPIS + 1; // A- = (0,0,0)
  const rDistHead = rFNIS + 2;
  const rDist0 = rDistHead + 1;

  put(1, 0, 'Fuzzy TOPSIS — TOPSIS con evaluaciones lingüísticas (Chen, 2000)', { s: stl.title });
  put(1, 1, 'Las evaluaciones son variables lingüísticas (VP=Muy mala … VG=Muy buena) representadas como Números Difusos Triangulares (l, m, u). Distancia = √((l1-l2)²+(m1-m2)²+(u1-u2)²)/3 (Vertex Method). CC cerca de 1 = mejor alternativa.', { s: stl.note });

  // --- Tabla de escala lingüística ---
  put(rScaleHead, 0, 'Escala lingüística de evaluación', { s: stl.b });
  ['Etiqueta', 'Nombre', 'l', 'm', 'u'].forEach((h, j) => put(rScaleHead, j, h, { s: stl.hdr }));
  const lngNames: Record<LinguisticLabel, string> = { VP: 'Muy mala (Very Poor)', P: 'Mala (Poor)', F: 'Regular (Fair)', G: 'Buena (Good)', VG: 'Muy buena (Very Good)' };
  LINGUISTIC_LABELS.forEach((lbl, i) => {
    const [l, mid, u] = LINGUISTIC_ALT[lbl];
    put(rScale0 + i, 0, lbl, { s: stl.c });
    put(rScale0 + i, 1, lngNames[lbl]);
    put(rScale0 + i, 2, l, { z: '0.0' }); put(rScale0 + i, 3, mid, { z: '0.0' }); put(rScale0 + i, 4, u, { z: '0.0' });
  });

  // --- Pesos ---
  put(rW, 0, 'Peso (hoja Criterios)', { s: stl.b });
  criteria.forEach((_, j) => {
    put(rW, cL(j), w[j], { f: `Criterios!${colL(critInfo.vc)}${critInfo.rN0 + j}`, z: '0.0000' });
  });

  // --- Encabezado TFN: nombre del criterio y (l, m, u) en las 3 columnas ---
  criteria.forEach((c, j) => {
    put(rHead, cL(j), c.name + ' (l)', { s: stl.hdr });
    put(rHead, cM(j), c.name + ' (m)', { s: stl.hdr });
    put(rHead, cU(j), c.name + ' (u)', { s: stl.hdr });
  });
  ['d+', 'd-', 'CC', 'Ranking'].forEach((h, k) => put(rHead, cDp + k, h, { s: stl.hdr }));

  // --- Etiquetas lingüísticas (texto, no TFN) ---
  put(rLblHead, 0, 'Evaluaciones lingüísticas', { s: stl.sub });
  criteria.forEach((c, j) => put(rLblHead, cL(j), c.name, { s: stl.hdrL }));
  alternatives.forEach((a, i) => {
    put(rLbl0 + i, 0, a.name, { s: stl.hdrL });
    criteria.forEach((c, j) => put(rLbl0 + i, cL(j), getLbl(a.id, c.id)));
  });

  // --- FDM: TFN cruda ---
  put(rFDMHead, 0, 'Matriz difusa FDM (l, m, u)', { s: stl.sub });
  criteria.forEach((_, j) => { put(rFDMHead, cL(j), 'l', { s: stl.hdr }); put(rFDMHead, cM(j), 'm', { s: stl.hdr }); put(rFDMHead, cU(j), 'u', { s: stl.hdr }); });
  alternatives.forEach((a, i) => {
    put(rFDM0 + i, 0, a.name, { s: stl.hdrL });
    criteria.forEach((c, j) => {
      const [l, mid, u] = fdm[i][j];
      put(rFDM0 + i, cL(j), l, { z: '0.0' });
      put(rFDM0 + i, cM(j), mid, { z: '0.0' });
      put(rFDM0 + i, cU(j), u, { z: '0.0' });
    });
  });

  // --- Normalización ---
  put(rNHead, 0, 'Matriz normalizada r_ij', { s: stl.sub });
  criteria.forEach((_, j) => { put(rNHead, cL(j), 'l', { s: stl.hdr }); put(rNHead, cM(j), 'm', { s: stl.hdr }); put(rNHead, cU(j), 'u', { s: stl.hdr }); });
  // Máximo u* (para beneficio) o mínimo l* (para costo) de toda la columna
  const uStar = criteria.map((_, j) => {
    if (types[j] === 'max') return Math.max(...fdm.map((row) => row[j][2]));
    return Math.min(...fdm.map((row) => row[j][0]));
  });
  alternatives.forEach((a, i) => {
    put(rN0 + i, 0, a.name, { s: stl.hdrL });
    criteria.forEach((c, j) => {
      const [l, mid, u] = fdm[i][j];
      const us = uStar[j] || 1;
      if (types[j] === 'max') {
        put(rN0 + i, cL(j), l / us, { f: `${colL(cL(j))}${rFDM0 + i}/MAX(${colL(cU(j))}${rFDM0}:${colL(cU(j))}${rFDM0 + n - 1})`, z: '0.0000' });
        put(rN0 + i, cM(j), mid / us, { f: `${colL(cM(j))}${rFDM0 + i}/MAX(${colL(cU(j))}${rFDM0}:${colL(cU(j))}${rFDM0 + n - 1})`, z: '0.0000' });
        put(rN0 + i, cU(j), u / us, { f: `${colL(cU(j))}${rFDM0 + i}/MAX(${colL(cU(j))}${rFDM0}:${colL(cU(j))}${rFDM0 + n - 1})`, z: '0.0000' });
      } else {
        const ls = us; // para costo, uStar es el mínimo l*
        put(rN0 + i, cL(j), u === 0 ? 0 : ls / u, { f: `IFERROR(MIN(${colL(cL(j))}${rFDM0}:${colL(cL(j))}${rFDM0 + n - 1})/${colL(cU(j))}${rFDM0 + i},0)`, z: '0.0000' });
        put(rN0 + i, cM(j), mid === 0 ? 0 : ls / mid, { f: `IFERROR(MIN(${colL(cL(j))}${rFDM0}:${colL(cL(j))}${rFDM0 + n - 1})/${colL(cM(j))}${rFDM0 + i},0)`, z: '0.0000' });
        put(rN0 + i, cU(j), l === 0 ? 0 : ls / l, { f: `IFERROR(MIN(${colL(cL(j))}${rFDM0}:${colL(cL(j))}${rFDM0 + n - 1})/${colL(cL(j))}${rFDM0 + i},0)`, z: '0.0000' });
      }
    });
  });

  // --- Matriz ponderada v_ij = w_j × r_ij ---
  put(rVHead, 0, 'Matriz ponderada v_ij = w_j × r_ij', { s: stl.sub });
  criteria.forEach((_, j) => { put(rVHead, cL(j), 'l', { s: stl.hdr }); put(rVHead, cM(j), 'm', { s: stl.hdr }); put(rVHead, cU(j), 'u', { s: stl.hdr }); });
  put(rFPIS, 0, 'FPIS A+ = (1,1,1)', { s: stl.b });
  put(rFNIS, 0, 'FNIS A- = (0,0,0)', { s: stl.b });
  alternatives.forEach((a, i) => {
    const rr = rV0 + i;
    put(rr, 0, a.name, { s: stl.hdrL });
    criteria.forEach((_, j) => {
      const wCell = `${colL(cL(j))}$${rW}`;
      put(rr, cL(j), r.detail?.dPlus ? undefined : 0, {  // valores cacheados del cálculo real
        f: `${colL(cL(j))}${rN0 + i}*${wCell}`, z: '0.0000',
      });
      put(rr, cM(j), undefined, { f: `${colL(cM(j))}${rN0 + i}*${wCell}`, z: '0.0000' });
      put(rr, cU(j), undefined, { f: `${colL(cU(j))}${rN0 + i}*${wCell}`, z: '0.0000' });
    });
  });
  // Cachear los valores de V reales desde fuzzyTopsisSynthesis (la función ya los calculó internamente)
  // Re-calculamos para caché usando los mismos pasos que fuzzy_topsis.ts:
  const ww = criteria.map((_, j) => w[j]);
  const us2 = uStar;
  alternatives.forEach((a, i) => {
    const rr = rV0 + i;
    criteria.forEach((c, j) => {
      const [l, mid, u] = fdm[i][j];
      const us = us2[j] || 1;
      let rl: number, rm: number, ru: number;
      if (types[j] === 'max') { rl = l / us; rm = mid / us; ru = u / us; }
      else { rl = u === 0 ? 0 : us / u; rm = mid === 0 ? 0 : us / mid; ru = l === 0 ? 0 : us / l; }
      const vl = ww[j] * rl, vm = ww[j] * rm, vu = ww[j] * ru;
      put(rr, cL(j), vl, { f: `${colL(cL(j))}${rN0 + i}*${colL(cL(j))}$${rW}`, z: '0.0000' });
      put(rr, cM(j), vm, { f: `${colL(cM(j))}${rN0 + i}*${colL(cL(j))}$${rW}`, z: '0.0000' });
      put(rr, cU(j), vu, { f: `${colL(cU(j))}${rN0 + i}*${colL(cL(j))}$${rW}`, z: '0.0000' });
    });
  });
  criteria.forEach((_, j) => { put(rFPIS, cL(j), 1, { z: '0.0' }); put(rFPIS, cM(j), 1, { z: '0.0' }); put(rFPIS, cU(j), 1, { z: '0.0' }); });
  criteria.forEach((_, j) => { put(rFNIS, cL(j), 0, { z: '0.0' }); put(rFNIS, cM(j), 0, { z: '0.0' }); put(rFNIS, cU(j), 0, { z: '0.0' }); });

  // --- Distancias y CC ---
  put(rDistHead, 0, 'Alternativa', { s: stl.hdrL });
  put(rDistHead, cDp, 'd+', { s: stl.hdr }); put(rDistHead, cDm, 'd-', { s: stl.hdr });
  put(rDistHead, cCC, 'CC', { s: stl.hdr }); put(rDistHead, cRk, 'Ranking', { s: stl.hdr });
  alternatives.forEach((a, i) => {
    const rr = rDist0 + i;
    put(rr, 0, a.name, { s: stl.hdrL });
    // d+ = Σ_j √((l_ij - 1)² + (m_ij - 1)² + (u_ij - 1)²) / 3
    const dpTerms = criteria.map((_, j) => {
      const Ll = colL(cL(j)), Lm = colL(cM(j)), Lu = colL(cU(j));
      return `SQRT((${Ll}${rV0 + i}-${Ll}$${rFPIS})^2+(${Lm}${rV0 + i}-${Lm}$${rFPIS})^2+(${Lu}${rV0 + i}-${Lu}$${rFPIS})^2)/SQRT(3)`;
    });
    const dmTerms = criteria.map((_, j) => {
      const Ll = colL(cL(j)), Lm = colL(cM(j)), Lu = colL(cU(j));
      return `SQRT((${Ll}${rV0 + i}-${Ll}$${rFNIS})^2+(${Lm}${rV0 + i}-${Lm}$${rFNIS})^2+(${Lu}${rV0 + i}-${Lu}$${rFNIS})^2)/SQRT(3)`;
    });
    put(rr, cDp, r.detail.dPlus[i], { f: dpTerms.join('+'), z: '0.0000' });
    put(rr, cDm, r.detail.dMinus[i], { f: dmTerms.join('+'), z: '0.0000' });
    put(rr, cCC, r.rows[i].value, {
      f: `IFERROR(${colL(cDm)}${rr}/(${colL(cDp)}${rr}+${colL(cDm)}${rr}),0)`,
      s: stl.key, z: '0.0000',
    });
    put(rr, cRk, r.rows[i].rank, { f: `RANK(${colL(cCC)}${rr},${colL(cCC)}$${rDist0}:${colL(cCC)}$${rDist0 + n - 1})`, s: stl.c });
  });
  const g = rDist0 + n + 1, top = r.rows[r.order[0]], tie = r.tie;
  put(g, 0, 'Ganador', { s: stl.gain });
  put(g, 1, tie ? 'Empate (sin datos)' : top?.name ?? '', {
    f: `INDEX(A${rDist0}:A${rDist0 + n - 1},MATCH(MAX(${colL(cCC)}${rDist0}:${colL(cCC)}${rDist0 + n - 1}),${colL(cCC)}${rDist0}:${colL(cCC)}${rDist0 + n - 1},0))`,
    s: stl.gkey,
  });
  put(g, 2, 'con coeficiente CC de');
  put(g, 3, top?.value ?? 0, { f: `MAX(${colL(cCC)}${rDist0}:${colL(cCC)}${rDist0 + n - 1})`, z: '0.0000' });
  const colsW = [30, ...Array.from({ length: Math.max(totalCritCols, 1) }, () => 10), 12, 12, 12, 12];
  return fin(colsW, [{ hpt: 30 }], [{ s: { r: 0, c: 1 }, e: { r: 0, c: totalCritCols } }]);
}
