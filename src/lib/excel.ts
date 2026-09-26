// Exporta el estudio a un .xlsx con la misma estructura que Ejercicio.xlsx (Notas, Criterios, una hoja por criterio,
// Síntesis) más las 5 hojas de priorización. Las celdas son fórmulas vivas (GEOMEAN, SUM, AVERAGE, SUMPRODUCT, RANK).
// Solo orquesta: arma el libro y elige qué hoja de excel-*-sheet.ts va en cada método. La infraestructura
// compartida (colL/qs/W/estilos, Criterios, Matriz de decisión) vive en excel-core.ts, y cada método
// ranqueador tiene su propio excel-<método>-sheet.ts — separado así el 20 sep 2026 (auditoría de
// plataforma; antes eran las 975 líneas de este mismo archivo).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { altSheet, CRIT_SHEET, synthesis } from './ahp.ts';
import { toLegacy, type Study } from './legacy.ts';
import { alive, cols, f2, finalists, inIndep, mean, passes, ranked, scoreOf } from './prio.ts';
import { NEAR_LIMIT } from './prioSteps.ts';
import type { Method } from './types.ts';
import { resolveTargets } from './topsis.ts';
import { ahpSheet, colL, matrixSheet, qs, setPalette, stl, W } from './excel-core.ts';
import { topsisSheet } from './excel-topsis-sheet.ts';
import { vikorSheet } from './excel-vikor-sheet.ts';
import { prometheeSheet } from './excel-promethee-sheet.ts';
import { electreSheet } from './excel-electre-sheet.ts';
import { sawSheet } from './excel-saw-sheet.ts';
import { fuzzyTopsisSheet } from './excel-fuzzy-topsis-sheet.ts';
import { OBJECTIVE_WEIGHT_INFO, objectiveWeightsSheet } from './excel-weights-sheet.ts';

export { colL } from './excel-core.ts';

// Un color de acento por método (mismas familias que la landing/`sesiones/pptx_theme.py` del curso:
// violeta = comparación por pares, verde-azulado/azul = distancia al ideal, magenta/morado =
// sobreclasificación), pero cada uno distinguible del resto — TOPSIS y VIKOR ya no comparten tono.
// NEUTRAL es para el Excel de priorización (Sesión 1, previo a elegir método, sin familia propia).
const NEUTRAL = '7F869C';
const METHOD_COLOR: Record<Method, string> = {
  ahp: '8B6CFF', topsis: '1FA69B', vikor: '2E6FD6', promethee: 'E23F86', electre: '9B3FB0',
  saw: 'C47A35', fuzzy_topsis: '1A9E94',
};

/** Excel principal del estudio: Notas, Criterios y las hojas del método elegido, más el respaldo
 * oculto `_datos`. La priorización de criterios (Sesión 1) vive en un .xlsx aparte — buildPrioWorkbook()
 * más abajo — para no forzar su descarga cada vez que solo hace falta el método. */
export function buildWorkbook(XLSX: any, study: Study) {
  setPalette(METHOD_COLOR[study.method] ?? METHOD_COLOR.ahp);
  const wb = XLSX.utils.book_new(), used = new Set<string>();
  const ex = study.experts.map((e) => e.role_desc || e.name);
  const expertIds = study.experts.map((e) => e.id);
  const S = study;
  const res = ['Notas', 'Criterios', 'Síntesis', 'Matriz de decisión', 'TOPSIS', 'VIKOR', 'PROMETHEE', 'ELECTRE', 'SAW', 'Fuzzy TOPSIS', '_datos'];
  res.forEach((x) => used.add(x.toLowerCase()));
  const sname = (n: string) => {
    const b = String(n).replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Hoja';
    let s = b, i = 2;
    while (used.has(s.toLowerCase())) s = b.slice(0, 26) + ' ' + i++;
    used.add(s.toLowerCase());
    return s;
  };
  const add = (name: string, ws: any) => XLSX.utils.book_append_sheet(wb, ws, name);
  const mapsFor = (sheet: string) => expertIds.map((e) => S.idx[e]?.[sheet] ?? {});
  const MATRIX_SHEET_NAME: Partial<Record<Method, string>> = { topsis: 'TOPSIS', vikor: 'VIKOR', promethee: 'PROMETHEE', electre: 'ELECTRE', saw: 'SAW', fuzzy_topsis: 'Fuzzy TOPSIS' };
  const isMatrixMethod = S.method in MATRIX_SHEET_NAME;

  // Pesos objetivos (CRITIC/Entropía): solo tienen sentido en los métodos de matriz; en AHP siempre son juicios por pares.
  const objW = isMatrixMethod && (S.weighting === 'critic' || S.weighting === 'entropy') ? S.weighting : null;
  { // Notas
    const { put, fin } = W();
    const ord = (isMatrixMethod ? ['Notas', 'Criterios', 'Matriz de decisión', MATRIX_SHEET_NAME[S.method]] : ['Notas', 'Criterios', ...S.criteria.map((c) => c.name), 'Síntesis']).join(' → ');
    const ow = objW ? OBJECTIVE_WEIGHT_INFO[objW] : null;
    const critTxt = objW
      ? `la hoja Criterios calcula los pesos de forma objetiva con ${ow!.name} (${ow!.cite}) a partir de la matriz de decisión, sin juicios por pares`
      : 'la hoja Criterios pesa los criterios con juicios por pares, igual que en AHP';
    const usoTxt = isMatrixMethod
      ? `Cómo usarlo: ${critTxt}. «Matriz de decisión» trae el valor real de cada alternativa por criterio y si es beneficio o costo. «${MATRIX_SHEET_NAME[S.method]}» ranquea las alternativas con esos pesos y esos datos (ver su propia nota, arriba de cada hoja, para el detalle del método). Las celdas con SUMPRODUCT, SUMSQ, RANK, etc. son fórmulas vivas: si cambias ${objW ? 'un valor de la matriz' : 'un juicio o un valor'}, todo se recalcula.`
      : 'Cómo usarlo: la hoja Criterios es una matriz de juicios por pares que pesa los criterios; le sigue una matriz de comparación de las alternativas por cada criterio, y la Síntesis combina peso × prioridad local en el resultado final. Las celdas con GEOMEAN, SUM, AVERAGE, SUMPRODUCT y RANK son fórmulas vivas: si cambias un juicio individual, todo se recalcula.';
    // [texto, estilo, alto de fila]. Con pesos objetivos no hay panel de expertos ni GEOMEAN ni consistencia CR que explicar.
    const lines: [string, any, any][] = [
      [S.title || 'Estudio MCDA', stl.title, { hpt: 22 }],
      ['', null, {}],
      ['Objetivo de decisión: ' + S.objective, stl.wrap, { hpt: 32 }],
      objW
        ? [`Los pesos de los criterios se calculan de forma objetiva con ${ow!.name} (${ow!.cite}) directamente desde la matriz de decisión: en este libro no intervienen juicios de expertos ni comparaciones por pares (la hoja Criterios muestra el cálculo, con fórmulas vivas).`, stl.wrap, { hpt: 48 }]
        : [`Cada juicio de la hoja Criterios es la media geométrica de un panel de ${S.experts.length} experto(s) (${ex.join('; ')}), no la opinión de una sola persona (Forman & Peniwati, 1998); ver juicios individuales debajo de la verificación de consistencia.`, stl.wrap, { hpt: 48 }],
      ['Orden de hojas: ' + ord, stl.wrap, { hpt: 32 }],
      [usoTxt, stl.wrap, { hpt: 66 }],
      ...(objW ? [] : [
        ['¿Qué es GEOMEAN()? Es la media geométrica (la raíz n-ésima del producto de n números), la función de Excel que se usa para combinar el mismo juicio de varios expertos en un solo número. No es el promedio normal (aritmético); es la forma correcta de agregar juicios de razón en AHP.', stl.wrap, { hpt: 48 }] as [string, any, any],
        ['Revise siempre la fila «¿Consistente? (CR < 0.10)» de la hoja Criterios antes de dar los juicios por buenos.', stl.wrap, { hpt: 20 }] as [string, any, any],
      ]),
      ['La priorización de criterios previa (Sesión 1: lluvia de ideas, tamizaje, independencia, panel de importancia, resultado final) está en un Excel aparte — descárgala desde la pestaña Compartir si la necesitas.', stl.wrap, { hpt: 32 }],
      ['', null, {}],
      ['Exportado desde la plataforma MCDA el ' + new Date().toLocaleString() + '. La hoja oculta «_datos» guarda el estado completo (incluida la priorización) para volver a cargarlo en la plataforma o en la herramienta HTML.', stl.note, { hpt: 20 }],
    ];
    lines.forEach(([t, s], i) => put(i + 1, 0, t, { s }));
    add('Notas', fin([100], lines.map((l) => l[2])));
  }
  // Los pesos de los criterios salen de la hoja Criterios, sea cual sea el método elegido para comparar las alternativas
  // (ver CLAUDE.md § "Visión multicriterio"): juicios por pares (AHP, por defecto) o, en los métodos de matriz con pesos
  // objetivos, CRITIC/Entropía calculados desde la propia matriz. En ese caso la hoja lleva el mismo nombre y forma
  // ({ ws, w, vc, rN0 }) para que las hojas de método no se enteren, pero la matriz hay que armarla ANTES para conocer sus celdas.
  const isFuzzy = S.method === 'fuzzy_topsis';
  const matInfo = isMatrixMethod
    ? matrixSheet(S.criteria, S.alternatives, S.decisionMatrix, 'Matriz de decisión',
      isFuzzy
        ? 'Evaluaciones lingüísticas por alternativa y criterio (VP=Muy mala, P=Mala, F=Regular, G=Buena, VG=Muy buena). "Tipo" indica si más es mejor (Beneficio) o menos es mejor (Costo).'
        : 'Valores reales por alternativa y criterio, tal como los cargaste en la plataforma. "Tipo" indica si más es mejor (Beneficio), menos es mejor (Costo) o si lo mejor es un valor específico (Objetivo, con su tolerancia).',
      isFuzzy)
    : null;
  // Las hojas de cada método leen el bloque EFECTIVO de la matriz (criterios Objetivo ya convertidos en su
  // distancia al objetivo, como costo), ver matrixSheet(): por eso reciben la matriz resuelta, no la cruda.
  const dmEff = resolveTargets(S.criteria, S.alternatives, S.decisionMatrix);
  const critInfo = objW && matInfo
    ? objectiveWeightsSheet(objW, isFuzzy, S.criteria, S.alternatives, dmEff, matInfo, 'Matriz de decisión')
    : ahpSheet(S.criteria, mapsFor(CRIT_SHEET), ex, 'AHP, Criterios', 'Media geométrica de los expertos (Forman & Peniwati, 1998); ver juicios individuales más abajo. Objetivo: ' + S.objective);
  add('Criterios', critInfo.ws);
  if (isMatrixMethod && matInfo) {
    add('Matriz de decisión', matInfo.ws);
    const args = [S.criteria, S.alternatives, dmEff, critInfo.w, matInfo, 'Matriz de decisión', critInfo] as const;
    let sheet: ReturnType<typeof W>['ws'];
    if (S.method === 'fuzzy_topsis') {
      sheet = fuzzyTopsisSheet(S.criteria, S.alternatives, S.decisionMatrix, critInfo.w, critInfo);
    } else if (S.method === 'saw') {
      sheet = sawSheet(...args);
    } else if (S.method === 'topsis') {
      sheet = topsisSheet(...args);
    } else if (S.method === 'vikor') {
      sheet = vikorSheet(...args);
    } else if (S.method === 'promethee') {
      sheet = prometheeSheet(...args);
    } else {
      sheet = electreSheet(...args);
    }
    add(MATRIX_SHEET_NAME[S.method]!, sheet);
  } else {
    const alts = S.criteria.map((c) => {
      const nm = sname(c.name);
      const info = ahpSheet(S.alternatives, mapsFor(altSheet(c.id)), ex, 'AHP, ' + c.name, 'Media geométrica de los expertos. ' + (c.hint || ''));
      add(nm, info.ws);
      return { nm, info };
    });
    { // Síntesis
      const { put, fin } = W(), d = synthesis(S.criteria, S.alternatives, expertIds, S.idx);
      const nc = S.criteria.length, m = S.alternatives.length, lc = colL(nc), G = nc + 1, R = nc + 2;
      put(1, 0, 'Estrategia', { s: stl.b });
      S.criteria.forEach((c, j) => put(2, 1 + j, c.name, { s: stl.hdr }));
      put(2, G, 'Prioridad global', { s: stl.hdr }); put(2, R, 'Ranking', { s: stl.hdr });
      put(3, 0, 'Peso del criterio', { s: stl.b });
      S.criteria.forEach((_, j) => put(3, 1 + j, d.wr[j], { f: `Criterios!${colL(critInfo.vc)}${critInfo.rN0 + j}`, z: '0.0000' }));
      S.alternatives.forEach((a, i) => {
        const r = 4 + i;
        put(r, 0, a.name, { s: stl.b });
        S.criteria.forEach((_, j) => put(r, 1 + j, d.rows[i].loc[j], { f: `${qs(alts[j].nm)}${colL(alts[j].info.vc)}${alts[j].info.rN0 + i}`, z: '0.0000' }));
        put(r, G, d.rows[i].g, { f: `SUMPRODUCT(B${r}:${lc}${r},B$3:${lc}$3)`, s: stl.key, z: '0.0000' });
        put(r, R, d.rows[i].rank, { f: `RANK(${colL(G)}${r},${colL(G)}$4:${colL(G)}$${3 + m})`, s: stl.c });
      });
      const g = 4 + m + 1, top = d.rows[d.order[0]];
      put(g, 0, 'Ganador', { s: stl.gain });
      put(g, 1, d.tie ? 'Empate (sin juicios)' : top.name, { f: `INDEX(A4:A${3 + m},MATCH(MAX(${colL(G)}4:${colL(G)}${3 + m}),${colL(G)}4:${colL(G)}${3 + m},0))`, s: stl.gkey });
      put(g, 2, 'con prioridad global de');
      put(g, 3, top.g, { f: `MAX(${colL(G)}4:${colL(G)}${3 + m})`, z: '0.0%' });
      add('Síntesis', fin([26, ...Array.from({ length: nc + 2 }, () => 16)], [{ hpt: 20 }, { hpt: 34 }]));
    }
  }
  { // datos ocultos (formato de respaldo de la herramienta HTML)
    const { put, fin } = W(), txt = JSON.stringify(toLegacy(S));
    for (let i = 0, r = 1; i < txt.length; i += 30000, r++) put(r, 0, txt.slice(i, i + 30000));
    add('_datos', fin([20]));
  }
  wb.Workbook = { Sheets: wb.SheetNames.map((n: string) => ({ Hidden: n === '_datos' ? 1 : 0 })) };
  return wb;
}

/** Excel de la priorización de criterios (Sesión 1: lluvia de ideas, tamizaje, independencia, panel
 * de importancia, resultado final) — separado de buildWorkbook() para no forzar su descarga cada vez
 * que solo hace falta el método (AHP/TOPSIS/...). Sin hoja `_datos`: el respaldo completo para
 * reimportar (incluida esta misma priorización) vive en el Excel principal. Color neutro porque la
 * priorización es previa a elegir método, sin familia propia (mismo criterio que usa el curso para
 * contenido panorámico de Sesión 1 — ver `sesiones/pptx_theme.py`).
 */
export function buildPrioWorkbook(XLSX: any, study: Study) {
  setPalette(NEUTRAL);
  const wb = XLSX.utils.book_new();
  const A = study.prio;
  const add = (name: string, ws: any) => XLSX.utils.book_append_sheet(wb, ws, name);
  const candOf = (id: string | null) => A.cands.find((c) => c.id === id);

  { // Notas
    const { put, fin } = W();
    const lines: [string, any][] = [
      [(study.title || 'Estudio MCDA') + ' — Priorización de criterios', stl.title],
      ['', null],
      ['Objetivo de decisión: ' + study.objective, stl.wrap],
      ['Orden de hojas: Notas → Prior 1. Lluvia de ideas → Prior 2. Tamizaje → Prior 3. Independencia → Prior 4. Panel → Prior 5. Resultado final.', stl.wrap],
      ['Esta es la priorización de criterios de la Sesión 1 del curso: de una lluvia de ideas amplia a los criterios finales que entran al método (AHP/TOPSIS/...), documentando cada descarte. El Excel del método (Criterios, Matriz de decisión, etc.) se descarga aparte, desde la misma pestaña Compartir.', stl.wrap],
      ['', null],
      ['Exportado desde la plataforma MCDA el ' + new Date().toLocaleString() + '.', stl.note],
    ];
    lines.forEach(([t, s], i) => put(i + 1, 0, t, { s }));
    add('Notas', fin([100], [{ hpt: 22 }, {}, { hpt: 32 }, { hpt: 32 }, { hpt: 60 }, {}, { hpt: 20 }]));
  }
  { // Prior 1
    const { put, fin } = W();
    put(1, 0, 'Priorización — 1. Lluvia de ideas', { s: stl.title });
    put(3, 0, 'Objetivo: ' + study.objective, { s: stl.wrap });
    ['#', 'Candidato', 'Descripción'].forEach((h, j) => put(5, j, h, { s: stl.hdrL }));
    A.cands.forEach((c, i) => { put(6 + i, 0, i + 1, { s: stl.c }); put(6 + i, 1, c.name, { s: stl.wrap }); put(6 + i, 2, c.desc, { s: stl.wrap }); });
    add('Prior 1. Lluvia de ideas', fin([5, 44, 70], [{ hpt: 24 }, {}, { hpt: 44 }], [{ s: { r: 2, c: 0 }, e: { r: 2, c: 2 } }]));
  }
  { // Prior 2
    const { put, fin } = W();
    put(1, 0, 'Priorización — 2. Tamizaje: elimina duplicados y candidatos irrelevantes para el caso', { s: stl.title });
    ['Candidato', 'Se elimina porque...', 'Evidencia'].forEach((h, j) => put(3, j, h, { s: stl.hdrL }));
    const out = A.cands.filter((c) => c.stage !== 'keep' && c.at !== 'ind');
    out.forEach((c, i) => {
      const t = candOf(c.target);
      put(4 + i, 0, c.name, { s: stl.wrap });
      put(4 + i, 1, (c.stage === 'merge' && t ? 'Se funde con ' + t.name + '. ' : '') + c.reason, { s: stl.wrap });
      put(4 + i, 2, c.evid, { s: stl.wrap });
    });
    put(5 + out.length, 0, `Pool restante tras tamizaje: ${inIndep(A).length} candidatos (de ${A.cands.length}).`, { s: stl.b });
    add('Prior 2. Tamizaje', fin([40, 80, 36], [{ hpt: 24 }]));
  }
  { // Prior 3
    const { put, fin } = W();
    put(1, 0, 'Priorización — 3. Verificación de independencia de los candidatos que llegan al panel', { s: stl.title });
    ['Eje', 'Qué mide', 'Evidencia de que son ejes distintos', 'Decisión'].forEach((h, j) => put(3, j, h, { s: stl.hdrL }));
    inIndep(A).forEach((c, i) => {
      const t = candOf(c.target);
      put(4 + i, 0, c.name, { s: stl.wrap }); put(4 + i, 1, c.qmide, { s: stl.wrap }); put(4 + i, 2, c.ind, { s: stl.wrap });
      put(4 + i, 3, c.stage === 'keep' ? 'Se mantiene como eje independiente.' : 'Se solapa: se funde con ' + (t ? t.name : '—') + '. ' + c.reason, { s: stl.wrap });
    });
    put(5 + inIndep(A).length, 0, `Pool que llega al panel: ${alive(A).length} de ${inIndep(A).length} candidatos se mantienen como ejes independientes.`, { s: stl.b });
    add('Prior 3. Independencia', fin([34, 44, 64, 40], [{ hpt: 24 }]));
  }
  const alive0 = alive(A), cs = cols(A), isQ = A.mode === 'q', pc = cs.length + 1, prow: Record<string, number> = {};
  { // Prior 4
    const { put, fin } = W();
    put(1, 0, 'Priorización — 4. Panel de importancia (' + (isQ ? '5 preguntas de evidencia' : 'evaluadores') + ', escala 1 a 5)', { s: stl.title });
    put(2, 0, isQ ? 'Cada columna es una pregunta verificable contra fuentes técnicas (no una opinión). Ponderación = promedio.' : 'Cada evaluador califica cada criterio de 1 (nada importante) a 5 (crítico). Ponderación = promedio.', { s: stl.note });
    put(4, 0, 'Criterio', { s: stl.hdrL });
    cs.forEach((x, j) => put(4, 1 + j, isQ ? `Q${j + 1}: ${A.questions[j]}` : x.label, { s: stl.hdr }));
    put(4, pc, 'Ponderación', { s: stl.hdr });
    alive0.forEach((c, i) => {
      const r = 5 + i;
      prow[c.id] = r;
      put(r, 0, c.name, { s: stl.wrap });
      cs.forEach((x, j) => { const v = scoreOf(A, c, x.key); if (typeof v === 'number') put(r, 1 + j, v, { s: stl.c, z: '0.0' }); });
      const m = mean(A, c);
      put(r, pc, m == null ? '' : m, { f: `IFERROR(AVERAGE(${colL(1)}${r}:${colL(cs.length)}${r}),"")`, s: stl.key, z: '0.00' });
    });
    add('Prior 4. Panel', fin([40, ...cs.map(() => (isQ ? 26 : 14)), 14], [{ hpt: 24 }, {}, {}, { hpt: isQ ? 96 : 24 }]));
  }
  { // Prior 5
    const { put, fin } = W(), ok = finalists(A), no = ranked(A).filter((c) => !passes(A, c)), PN = qs('Prior 4. Panel');
    put(1, 0, 'Priorización — 5. Resultado final: finalistas + tabla de descarte documentada', { s: stl.title });
    put(2, 0, 'Corte elegido (ponderación ≥)', { s: stl.b }); put(2, 1, A.cutoff, { s: stl.key, z: '0.0' });
    put(3, 0, 'Convención práctica del curso, no un estándar de la literatura: documenta por qué elegiste este corte.', { s: stl.note });
    put(5, 0, 'Finalistas (ponderación ≥ corte)', { s: stl.b12 });
    ['Criterio', 'Ponderación', 'Por qué queda', '¿Pasa el corte?', 'Medible para todas las alternativas', 'Evidencia de medibilidad'].forEach((h, j) => put(6, j, h, { s: stl.hdrL }));
    const passF = (row: number) => `IF(B${row}>=$B$2-0.000000001,"Pasa","No pasa")`;
    ok.forEach((c, i) => {
      put(7 + i, 0, c.name, { s: stl.wrap }); put(7 + i, 1, mean(A, c), { f: `${PN}${colL(pc)}${prow[c.id]}`, z: '0.00', s: stl.c }); put(7 + i, 2, c.just, { s: stl.wrap });
      put(7 + i, 3, 'Pasa', { f: passF(7 + i), s: stl.c });
      put(7 + i, 4, c.measurable === true ? 'Sí' : c.measurable === false ? 'No' : 'Sin verificar', { s: stl.c });
      put(7 + i, 5, c.measEvid ?? '', { s: stl.wrap });
    });
    let r = 8 + ok.length;
    const lim = no.find((c) => mean(A, c) != null);
    if (lim && ok.length && (mean(A, ok[ok.length - 1]) ?? 0) - (mean(A, lim) ?? 0) <= NEAR_LIMIT) {
      put(r, 0, 'Candidato en el límite (no incluido, pero documentado)', { s: stl.b12 }); r++;
      ['Criterio', 'Ponderación', 'Nota'].forEach((h, j) => put(r, j, h, { s: stl.hdrL })); r++;
      put(r, 0, lim.name, { s: stl.wrap }); put(r, 1, mean(A, lim), { f: `${PN}${colL(pc)}${prow[lim.id]}`, z: '0.00', s: stl.c }); put(r, 2, lim.cutReason, { s: stl.wrap }); r += 2;
    }
    if (lim && ok.length) {
      put(r, 0, 'Brecha = último que pasa − primero que no pasa', { s: stl.b });
      put(r, 1, (mean(A, ok[ok.length - 1]) ?? 0) - (mean(A, lim) ?? 0), { f: `B${6 + ok.length}-${PN}${colL(pc)}${prow[lim.id]}`, z: '0.00', s: stl.key });
      put(r, 2, `Criterio de la plataforma: «en el límite» si la brecha es ≤ ${NEAR_LIMIT}. Una brecha estrecha exige justificar más el corte.`, { s: stl.note });
      r += 2;
    }
    put(r, 0, 'Tabla de descarte, con razón documentada de cada uno', { s: stl.b12 }); r++;
    ['Criterio', 'Etapa de descarte', 'Razón'].forEach((h, j) => put(r, j, h, { s: stl.hdrL })); r++;
    no.forEach((c) => { const m = mean(A, c); put(r, 0, c.name, { s: stl.wrap }); put(r, 1, 'Panel de importancia' + (m == null ? ' (sin calificar)' : ` (${f2(m)})`), { s: stl.wrap }); put(r, 2, c.cutReason, { s: stl.wrap }); r++; });
    A.cands.filter((c) => c.stage !== 'keep').forEach((c) => {
      const t = candOf(c.target);
      put(r, 0, c.name, { s: stl.wrap });
      put(r, 1, (c.at === 'ind' ? 'Independencia' : 'Tamizaje') + (c.stage === 'merge' && t ? ' (fusionado con ' + t.name + ')' : ''), { s: stl.wrap });
      put(r, 2, c.reason, { s: stl.wrap }); r++;
    });
    add('Prior 5. Resultado final', fin([46, 32, 80, 16, 24, 44], [{ hpt: 24 }]));
  }
  return wb;
}

function download(XLSX: any, wb: any, filename: string) {
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

export async function downloadExcel(study: Study, filename: string) {
  const XLSX = (await import('xlsx-js-style')).default as any;
  download(XLSX, buildWorkbook(XLSX, study), filename);
}

export async function downloadPrioExcel(study: Study, filename: string) {
  const XLSX = (await import('xlsx-js-style')).default as any;
  download(XLSX, buildPrioWorkbook(XLSX, study), filename);
}
