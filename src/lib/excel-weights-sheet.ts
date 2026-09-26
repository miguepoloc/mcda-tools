/* eslint-disable @typescript-eslint/no-explicit-any */
import { colL, qs, stl, W, type MatInfo } from './excel-core.ts';
import { getType } from './topsis.ts';
import { criticWeights, entropyWeights } from './weights.ts';
import { defuzzify, defuzzifyMatrix, LINGUISTIC_ALT, LINGUISTIC_LABELS, type LinguisticLabel } from './fuzzy_topsis.ts';
import type { Alternative, Criterion, DecisionMatrix } from './types.ts';

export type ObjectiveWeighting = 'critic' | 'entropy';

/** Nombre corto y cita de cada ponderación objetiva; lo usan esta hoja y la hoja Notas. */
export const OBJECTIVE_WEIGHT_INFO: Record<ObjectiveWeighting, { name: string; cite: string }> = {
  critic: { name: 'CRITIC', cite: 'Diakoulaki et al., 1995' },
  entropy: { name: 'Entropía de Shannon', cite: 'Shannon, 1948' },
};

/** Hoja «Criterios» cuando los pesos son OBJETIVOS (CRITIC o Entropía) en vez de juicios por pares.
 *
 * Se llama igual que la hoja AHP y devuelve la misma forma que ahpSheet() ({ ws, w, vc, rN0 }): todas las hojas de método
 * leen `Criterios!<vc><rN0 + j>`, así que no saben de dónde salen los pesos. Aquí salen de la matriz de decisión (bloque
 * EFECTIVO de «Matriz de decisión», el mismo que leen los métodos, con los criterios Objetivo ya convertidos en costo) con
 * fórmulas vivas: si cambias un valor de la matriz, los pesos y todo el ranking se recalculan.
 *
 * Solo celdas sueltas y bloques auxiliares (nada de fórmulas matriciales ni MEDIAN/MAX envolviendo un arreglo: LibreOffice
 * y Excel no las evalúan elemento a elemento sin modo matricial). Cada cálculo de weights.ts tiene su bloque:
 *   CRITIC:  min-max (costo invertido) → σ (STDEVP, población) → correlación de Pearson (diagonal 1, IFERROR → 0) → C_j → C_j/ΣC.
 *   Entropía: 1/x en costo → proporciones por columna → p·ln p (0 si p ≤ 0) → E_j = −k·Σ → d_j = 1−E_j → d_j/Σd.
 * En Fuzzy TOPSIS la matriz trae etiquetas (VP…VG): se desdifusifican con el centroide (l+m+u)/3 antes de calcular, igual
 * que hace la app (defuzzifyMatrix); una celda vacía cuenta como «Regular» (F). */
export function objectiveWeightsSheet(
  kind: ObjectiveWeighting, fuzzy: boolean, criteria: Criterion[], alternatives: Alternative[],
  dmEff: DecisionMatrix, matInfo: MatInfo, matName: string,
) {
  const m = criteria.length, n = alternatives.length, { put, fin } = W();
  const MN = qs(matName), info = OBJECTIVE_WEIGHT_INFO[kind];
  // Se calcula sobre los mismos números que la app (Results.tsx): matriz resuelta y, en Fuzzy, desdifusificada.
  const num = fuzzy ? defuzzifyMatrix(dmEff, criteria, alternatives) : dmEff;
  const w = kind === 'critic' ? criticWeights(criteria, alternatives, num) : entropyWeights(criteria, alternatives, num);
  const X = alternatives.map((a) => criteria.map((c) => { const v = num.values[a.id]?.[c.id]; return typeof v === 'number' ? v : 0; }));
  const isCost = criteria.map((c) => getType(dmEff, c.id) === 'min');
  const fin0 = (x: number) => (Number.isFinite(x) ? x : 0);

  const vc = 1, rTop = 3, rN0 = 4, rSum = rN0 + m, rChk = rSum + 1;
  const degenerate = m === 0 || n === 0 || (kind === 'entropy' && n < 2);
  const noteBase = kind === 'critic'
    ? `Pesos objetivos por CRITIC (${info.cite}), calculados con fórmulas vivas desde la matriz de decisión de este libro (bloque efectivo de la hoja «${matName}»): un criterio pesa más cuanto más varía entre alternativas (σ) y cuanto menos se correlaciona con los demás. `
    : `Pesos objetivos por Entropía (${info.cite}), calculados con fórmulas vivas desde la matriz de decisión de este libro (bloque efectivo de la hoja «${matName}»): un criterio cuyos valores casi no cambian entre alternativas aporta poca información y recibe poco peso. `;
  const note = noteBase + 'No intervienen juicios de expertos ni comparaciones por pares.'
    + (fuzzy ? ' Las etiquetas lingüísticas se desdifusifican con el centroide (l+m+u)/3 de su número difuso triangular antes de calcular (ul Amin et al., 2022: CRITIC difuso y luego desdifusificación); una celda vacía cuenta como F (Regular).' : '');
  put(1, 0, 'Criterios — pesos objetivos (' + info.name + ')', { s: stl.title });
  put(1, 1, note, { s: stl.note });

  // Tabla principal: una fila por criterio; la columna vc (B) es la que leen las hojas de método.
  put(rTop, 0, 'Criterio', { s: stl.hdrL });
  put(rTop, vc, 'Peso (entra a la hoja del método)', { s: stl.hdr });
  if (kind === 'critic') {
    put(rTop, 2, 'σ_j (desv. estándar, población)', { s: stl.hdr });
    put(rTop, 3, 'Σ_k (1 − r_jk)', { s: stl.hdr });
    put(rTop, 4, 'C_j = σ_j · Σ_k (1 − r_jk)', { s: stl.hdr });
  } else {
    put(rTop, 2, 'E_j (entropía)', { s: stl.hdr });
    put(rTop, 3, 'd_j = 1 − E_j', { s: stl.hdr });
  }
  criteria.forEach((c, j) => put(rN0 + j, 0, c.name, { s: stl.hdrL }));
  put(rSum, 0, 'Suma de pesos', { s: stl.b });
  put(rChk, 0, 'Comprobación (suma = 1)', { s: stl.b });
  const okTxt = (s: number) => (Math.abs(s - 1) < 1e-6 ? 'Sí, suma 1' : 'No, revisar');
  const sumW = w.reduce((a, b) => a + b, 0);

  if (degenerate) {
    // Sin alternativas (o con una sola, donde la entropía no está definida) no hay nada que calcular: pesos como los de la app.
    criteria.forEach((_, j) => put(rN0 + j, vc, fin0(w[j] ?? 0), { s: stl.key, z: '0.0000' }));
    put(rSum, vc, fin0(sumW), { z: '0.0000' });
    put(rChk + 2, 0, kind === 'entropy' ? 'La entropía necesita al menos 2 alternativas con datos.' : 'Se necesitan alternativas con datos para calcular los pesos.', { s: stl.note });
    return { ws: fin([34, ...Array.from({ length: 5 }, () => 18)], [{ hpt: 64 }], [{ s: { r: 0, c: 1 }, e: { r: 0, c: 5 } }]), rN0, vc, w };
  }

  let r = rChk + 2;
  // Fila de la constante k de entropía (una sola celda, referenciada por todas las E_j).
  let rK = 0;
  if (kind === 'entropy') {
    rK = rChk + 1;
    put(rK, 0, 'k = 1 / LN(n)  (n = alternativas)', { s: stl.b });
    put(rK, vc, 1 / Math.log(n), { f: `1/LN(${n})`, z: '0.0000' });
    r = rK + 2;
  }

  // Bloque de datos que alimenta los cálculos: la matriz efectiva tal cual o, en Fuzzy, su versión numérica (centroides).
  let xCell: (i: number, j: number) => string, xCol: (j: number) => string;
  if (fuzzy) {
    put(r, 0, 'Escala lingüística (Chen, 2000) y su valor nítido: el centroide de cada número difuso triangular', { s: stl.b12 }); r++;
    ['Etiqueta', 'l', 'm', 'u', 'Centroide (l+m+u)/3', 'Significado'].forEach((h, k) => put(r, k, h, { s: stl.hdr })); r++;
    const rScale0 = r;
    const names: Record<LinguisticLabel, string> = { VP: 'Muy mala', P: 'Mala', F: 'Regular', G: 'Buena', VG: 'Muy buena' };
    LINGUISTIC_LABELS.forEach((lbl, k) => {
      const [l, mid, u] = LINGUISTIC_ALT[lbl];
      put(rScale0 + k, 0, lbl, { s: stl.c });
      put(rScale0 + k, 1, l, { z: '0.0' }); put(rScale0 + k, 2, mid, { z: '0.0' }); put(rScale0 + k, 3, u, { z: '0.0' });
      put(rScale0 + k, 4, defuzzify(lbl), { f: `(B${rScale0 + k}+C${rScale0 + k}+D${rScale0 + k})/3`, z: '0.0000' });
      put(rScale0 + k, 5, names[lbl]);
    });
    const table = `$A$${rScale0}:$E$${rScale0 + LINGUISTIC_LABELS.length - 1}`;
    const cF = `$E$${rScale0 + LINGUISTIC_LABELS.indexOf('F')}`;
    r += LINGUISTIC_LABELS.length + 1;
    put(r, 0, 'Matriz numérica: centroide de cada etiqueta (número tal cual; celda vacía = F)', { s: stl.b12 }); r++;
    criteria.forEach((c, j) => put(r, 1 + j, c.name, { s: stl.hdr })); put(r, 0, 'Alternativa', { s: stl.hdrL }); r++;
    const d0 = r;
    alternatives.forEach((a, i) => {
      put(d0 + i, 0, a.name, { s: stl.hdrL });
      criteria.forEach((_, j) => {
        const src = `${MN}${colL(1 + j)}${matInfo.rData0 + i}`;
        put(d0 + i, 1 + j, X[i][j], { f: `IF(ISNUMBER(${src}),${src},IFERROR(VLOOKUP(${src},${table},5,FALSE),${cF}))`, z: '0.0000', s: stl.c });
      });
    });
    r = d0 + n + 1;
    xCell = (i, j) => `${colL(1 + j)}${d0 + i}`;
    xCol = (j) => `${colL(1 + j)}$${d0}:${colL(1 + j)}$${d0 + n - 1}`;
  } else {
    xCell = (i, j) => `${MN}${colL(1 + j)}${matInfo.rData0 + i}`;
    xCol = (j) => `${MN}${colL(1 + j)}$${matInfo.rData0}:${colL(1 + j)}$${matInfo.rData0 + n - 1}`;
  }
  const typeCell = (j: number) => `${MN}${colL(1 + j)}$${matInfo.rType}`;

  /** Escribe un bloque alternativas × criterios de fórmulas; devuelve su primera fila de datos. */
  const block = (title: string, cell: (i: number, j: number) => { v: number; f: string }) => {
    put(r, 0, title, { s: stl.b12 }); r++;
    put(r, 0, 'Alternativa', { s: stl.hdrL });
    criteria.forEach((c, j) => put(r, 1 + j, c.name, { s: stl.hdr })); r++;
    const r0 = r;
    alternatives.forEach((a, i) => {
      put(r0 + i, 0, a.name, { s: stl.hdrL });
      criteria.forEach((_, j) => { const { v, f } = cell(i, j); put(r0 + i, 1 + j, fin0(v), { f, z: '0.0000', s: stl.c }); });
    });
    r = r0 + n + 1;
    return r0;
  };
  const col = (r0: number, j: number) => `${colL(1 + j)}$${r0}:${colL(1 + j)}$${r0 + n - 1}`;

  if (kind === 'critic') {
    // Cachés: los mismos pasos de criticWeights (weights.ts), conservando los intermedios que ese archivo no devuelve.
    const Nrm = criteria.map((_, j) => {
      const c = X.map((row) => row[j]), lo = Math.min(...c), hi = Math.max(...c), span = hi - lo || 1;
      return c.map((x) => (isCost[j] ? (hi - x) / span : (x - lo) / span)); // Nrm[j][i]
    });
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    const sigma = Nrm.map((c) => Math.sqrt(c.reduce((s, x) => s + (x - mean(c)) ** 2, 0) / n));
    const corr = Nrm.map((cj, j) => Nrm.map((ck, k) => {
      if (j === k) return 1;
      const mj = mean(cj), mk = mean(ck);
      const numr = cj.reduce((s, v, i) => s + (v - mj) * (ck[i] - mk), 0);
      const den = Math.sqrt(cj.reduce((s, v) => s + (v - mj) ** 2, 0) * ck.reduce((s, v) => s + (v - mk) ** 2, 0));
      return den === 0 ? 0 : numr / den;
    }));
    const dsum = corr.map((row) => row.reduce((s, x) => s + (1 - x), 0));
    const C = sigma.map((s, j) => s * dsum[j]);

    const nrm0 = block('Paso 1. Matriz normalizada min-max (costo invertido; si el criterio no varía, 0)', (i, j) => {
      const c = xCol(j), span = `(MAX(${c})-MIN(${c}))`;
      return { v: Nrm[j][i], f: `IF(MAX(${c})=MIN(${c}),0,IF(${typeCell(j)}="Costo",(MAX(${c})-${xCell(i, j)})/${span},(${xCell(i, j)}-MIN(${c}))/${span}))` };
    });
    put(r, 0, 'Paso 2. Matriz de correlación de Pearson entre criterios (diagonal = 1; sin varianza → 0)', { s: stl.b12 }); r++;
    put(r, 0, 'Criterio', { s: stl.hdrL });
    criteria.forEach((c, j) => put(r, 1 + j, c.name, { s: stl.hdr })); r++;
    const cor0 = r;
    criteria.forEach((cj, j) => {
      put(cor0 + j, 0, cj.name, { s: stl.hdrL });
      criteria.forEach((_, k) => {
        if (j === k) put(cor0 + j, 1 + k, 1, { z: '0.0000', s: stl.c });
        else put(cor0 + j, 1 + k, corr[j][k], { f: `IFERROR(CORREL(${col(nrm0, j)},${col(nrm0, k)}),0)`, z: '0.0000', s: stl.c });
      });
    });
    criteria.forEach((_, j) => {
      const row = rN0 + j;
      put(row, 2, sigma[j], { f: `STDEVP(${col(nrm0, j)})`, z: '0.0000' });
      put(row, 3, dsum[j], { f: `${m}-SUM(B${cor0 + j}:${colL(m)}${cor0 + j})`, z: '0.0000' });
      put(row, 4, C[j], { f: `C${row}*D${row}`, z: '0.0000' });
      put(row, vc, fin0(w[j]), { f: `E${row}/IF(SUM(E$${rN0}:E$${rN0 + m - 1})=0,1,SUM(E$${rN0}:E$${rN0 + m - 1}))`, s: stl.key, z: '0.0000' });
    });
  } else {
    const Y = X.map((row) => row.map((x, j) => (isCost[j] ? (x === 0 ? 0 : 1 / x) : x))); // Y[i][j]
    const tot = criteria.map((_, j) => Y.reduce((s, row) => s + row[j], 0) || 1);
    const P = Y.map((row) => row.map((y, j) => y / tot[j]));
    const k = 1 / Math.log(n);
    const E = criteria.map((_, j) => -k * P.reduce((s, row) => s + (row[j] > 0 ? row[j] * Math.log(row[j]) : 0), 0));

    const y0 = block('Paso 1. Valores para entropía: en criterios de costo se invierte (1/x; x = 0 → 0)', (i, j) => ({
      v: Y[i][j], f: `IF(${typeCell(j)}="Costo",IF(${xCell(i, j)}=0,0,1/${xCell(i, j)}),${xCell(i, j)})`,
    }));
    const p0 = block('Paso 2. Proporciones por columna p_ij = y_ij / Σ_i y_ij', (i, j) => ({
      v: P[i][j], f: `${colL(1 + j)}${y0 + i}/IF(SUM(${col(y0, j)})=0,1,SUM(${col(y0, j)}))`,
    }));
    const pl0 = block('Paso 3. p_ij · ln(p_ij)  (0 si p_ij ≤ 0)', (i, j) => ({
      v: P[i][j] > 0 ? P[i][j] * Math.log(P[i][j]) : 0, f: `IF(${colL(1 + j)}${p0 + i}>0,${colL(1 + j)}${p0 + i}*LN(${colL(1 + j)}${p0 + i}),0)`,
    }));
    criteria.forEach((_, j) => {
      const row = rN0 + j;
      put(row, 2, E[j], { f: `-$${colL(vc)}$${rK}*SUM(${col(pl0, j)})`, z: '0.0000' });
      put(row, 3, 1 - E[j], { f: `1-C${row}`, z: '0.0000' });
      put(row, vc, fin0(w[j]), { f: `D${row}/IF(SUM(D$${rN0}:D$${rN0 + m - 1})=0,1,SUM(D$${rN0}:D$${rN0 + m - 1}))`, s: stl.key, z: '0.0000' });
    });
  }
  put(rSum, vc, sumW, { f: `SUM(${colL(vc)}${rN0}:${colL(vc)}${rN0 + m - 1})`, s: stl.b, z: '0.0000' });
  put(rChk, vc, okTxt(sumW), { f: `IF(ABS(${colL(vc)}${rSum}-1)<0.000001,"Sí, suma 1","No, revisar")`, s: stl.b });

  const colsW = [40, ...Array.from({ length: Math.max(m, 5) }, () => 18)];
  return { ws: fin(colsW, [{ hpt: 78 }, {}, { hpt: 32 }], [{ s: { r: 0, c: 1 }, e: { r: 0, c: Math.max(m, 4) } }]), rN0, vc, w };
}
