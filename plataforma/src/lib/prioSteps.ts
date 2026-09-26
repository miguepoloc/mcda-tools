// Desglose de la Parte A (Sesión 1): embudo, aritmética de las ponderaciones, corte/brecha y frases «Qué dice tu caso».
// Todo sale de las funciones de prio.ts (mean, passes, ranked…): aquí NO se recalcula nada por otro camino, solo se enseñan
// los intermedios (n de calificaciones, suma, mínimo, máximo, desviación) que las diapositivas 15-19 hacen a mano.
// Sin importaciones de React: corre en los scripts de prueba y en el informe.
import { alive, cols, inIndep, mean, passes, ranked, scoreOf, type Cand, type PrioState } from './prio.ts';

/** Diferencia (última que pasa − primera que no) hasta la que se llama «en el límite». Misma que usan el editor y el Excel. */
export const NEAR_LIMIT = 0.5;
/** Mínimo de criterios que pide la diapositiva 18 para la propuesta de la Sesión 2. */
export const MIN_FINALISTS = 3;

const r2 = (x: number) => x.toFixed(2);
/** Número para la aritmética: hasta 2 decimales sin ceros de relleno (5, 4.4, 4.67). */
const short = (x: number) => String(Number(x.toFixed(2)));

// ---------------------------------------------------------------- embudo

export type Funnel = {
  /** Candidatos de la lluvia de ideas. */
  total: number;
  /** Los que siguen tras el tamizaje (los que entran a la verificación de independencia). */
  afterTamiz: number;
  /** Los que siguen tras la independencia = los que entran al panel de importancia. */
  toPanel: number;
  /** Finalistas: los del panel con ponderación ≥ corte. */
  finalists: number;
  /** Del panel: sin ninguna calificación válida (no pueden pasar ni fallar). */
  unrated: number;
  outTamiz: { dropped: Cand[]; merged: Cand[] };
  outIndep: Cand[];
  outCut: Cand[];
};

/** Conteos del embudo de la diapositiva 15 (10 → tamizaje → independencia → panel → finalistas).
 * Definición única: «tras el tamizaje» cuenta los que NO se eliminaron en el tamizaje (los que aún deben pasar la
 * independencia); «al panel» cuenta los que sobreviven también a la independencia (`alive`). */
export function funnel(A: PrioState): Funnel {
  const inInd = inIndep(A);
  const panel = alive(A);
  const rk = ranked(A);
  const fin = rk.filter((c) => passes(A, c));
  const outTamiz = A.cands.filter((c) => c.stage !== 'keep' && c.at !== 'ind');
  return {
    total: A.cands.length,
    afterTamiz: inInd.length,
    toPanel: panel.length,
    finalists: fin.length,
    unrated: panel.filter((c) => mean(A, c) == null).length,
    outTamiz: { dropped: outTamiz.filter((c) => c.stage === 'drop'), merged: outTamiz.filter((c) => c.stage === 'merge') },
    outIndep: inInd.filter((c) => c.stage !== 'keep'),
    outCut: rk.filter((c) => !passes(A, c) && mean(A, c) != null),
  };
}

// ---------------------------------------------------------------- aritmética de la ponderación

export type ScoreCell = { label: string; raw: number | null; valid: boolean };
export type ScoreRow = {
  cand: Cand;
  cells: ScoreCell[];
  /** Calificaciones que SÍ cuentan (número entre 1 y 5). */
  valid: number[];
  n: number;
  /** Casillas con algo escrito pero fuera de 1–5 (se ignoran). */
  ignored: number;
  /** Casillas vacías (se ignoran). */
  empty: number;
  sum: number | null;
  mean: number | null;
  min: number | null;
  max: number | null;
  /** Desviación estándar muestral (n−1); null con menos de 2 calificaciones válidas. */
  sd: number | null;
  /** «(5 + 5 + 4) / 3 = 4.67», o el motivo por el que no hay promedio. */
  arithmetic: string;
};

/** Calificaciones de un criterio con la aritmética explícita. `mean` sale de prio.mean() (una sola definición). */
export function scoreBreakdown(A: PrioState, c: Cand): ScoreRow {
  const cells: ScoreCell[] = cols(A).map((x) => {
    const raw = scoreOf(A, c, x.key);
    return { label: x.label, raw, valid: typeof raw === 'number' && raw >= 1 && raw <= 5 };
  });
  const valid = cells.filter((k) => k.valid).map((k) => k.raw as number);
  const empty = cells.filter((k) => k.raw == null).length;
  const n = valid.length;
  const sum = n ? valid.reduce((a, b) => a + b, 0) : null;
  const m = mean(A, c);
  const sd = n >= 2 && m != null ? Math.sqrt(valid.reduce((a, v) => a + (v - m) ** 2, 0) / (n - 1)) : null;
  return {
    cand: c, cells, valid, n, empty, ignored: cells.length - n - empty,
    sum, mean: m, min: n ? Math.min(...valid) : null, max: n ? Math.max(...valid) : null, sd,
    arithmetic: n && m != null ? `(${valid.map(short).join(' + ')}) / ${n} = ${r2(m)}` : 'sin calificaciones válidas: no hay promedio',
  };
}

// ---------------------------------------------------------------- corte y brecha

export type CutRow = { cand: Cand; mean: number; pass: boolean };
export type CutInfo = {
  cutoff: number;
  /** Solo los criterios con promedio, de mayor a menor. */
  rows: CutRow[];
  nPass: number;
  nFail: number;
  /** Criterios del panel sin calificaciones válidas. */
  unrated: Cand[];
  last: CutRow | null;
  firstNo: CutRow | null;
  /** Último que pasa − primero que no (≥ 0), o null si falta alguno de los dos. */
  gap: number | null;
  /** El primero que no pasa está a NEAR_LIMIT o menos del último que pasa. */
  nearLimit: boolean;
  /** Lectura orientativa de la brecha (criterio de esta herramienta, no del curso). */
  gapKind: 'clear' | 'moderate' | 'narrow' | null;
  /** Margen del último que pasa sobre el corte (qué tan «justo» pasa). */
  lastMargin: number | null;
};

export function cutInfo(A: PrioState): CutInfo {
  const unrated: Cand[] = [];
  const rows: CutRow[] = [];
  for (const c of ranked(A)) {
    const m = mean(A, c);
    if (m == null) unrated.push(c);
    else rows.push({ cand: c, mean: m, pass: passes(A, c) });
  }
  const pass = rows.filter((r) => r.pass);
  const fail = rows.filter((r) => !r.pass);
  const last = pass[pass.length - 1] ?? null;
  const firstNo = fail[0] ?? null;
  const gap = last && firstNo ? last.mean - firstNo.mean : null;
  return {
    cutoff: A.cutoff, rows, nPass: pass.length, nFail: fail.length, unrated, last, firstNo, gap,
    nearLimit: gap != null && gap <= NEAR_LIMIT,
    gapKind: gap == null ? null : gap >= 0.4 ? 'clear' : gap >= 0.2 ? 'moderate' : 'narrow',
    lastMargin: last ? last.mean - A.cutoff : null,
  };
}

// ---------------------------------------------------------------- medibilidad (diapositiva 18)

/** Estado de la verificación «medible para todas las alternativas» de los finalistas (campo opcional `measurable` de Cand). */
export function measurability(A: PrioState) {
  const fin = ranked(A).filter((c) => passes(A, c));
  return {
    yes: fin.filter((c) => c.measurable === true),
    no: fin.filter((c) => c.measurable === false),
    pending: fin.filter((c) => c.measurable == null),
  };
}

// ---------------------------------------------------------------- frases «Qué dice tu caso»

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1]);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function panelLabel(A: PrioState): string {
  return A.mode === 'q'
    ? 'las 5 preguntas de evidencia (cada pregunta puntúa de 1 a 5)'
    : plural(A.evaluators.length, 'evaluador', 'evaluadores');
}

/** Frase del embudo con los números reales del proyecto. */
export function funnelSentence(A: PrioState): string {
  const f = funnel(A);
  if (!f.total) return 'Aún no hay candidatos: agrega la lluvia de ideas para ver el embudo.';
  const parts = [`Partiste de ${plural(f.total, 'candidato', 'candidatos')}.`];
  const tz = f.outTamiz.dropped.length + f.outTamiz.merged.length;
  parts.push(tz
    ? `El tamizaje sacó ${tz} (${f.outTamiz.dropped.length} descartado${f.outTamiz.dropped.length === 1 ? '' : 's'}, ${f.outTamiz.merged.length} fusionado${f.outTamiz.merged.length === 1 ? '' : 's'}) y quedaron ${f.afterTamiz}.`
    : `El tamizaje no sacó a ninguno: siguen ${f.afterTamiz}.`);
  parts.push(f.outIndep.length
    ? `La verificación de independencia sacó ${f.outIndep.length} (se solapaban con otro eje o no aportaban señal útil), así que ${f.toPanel} llegaron al panel.`
    : `Todos los que llegaron a la verificación de independencia se mantuvieron: ${f.toPanel} pasan al panel.`);
  return parts.join(' ');
}

/** Frase del corte, la brecha y los finalistas con los números reales. */
export function cutSentence(A: PrioState): string {
  const ci = cutInfo(A);
  if (!ci.rows.length) return 'Aún no hay ponderaciones: califica los criterios en el panel de importancia.';
  const fin = ci.rows.filter((r) => r.pass).map((r) => `${r.cand.name} (${r2(r.mean)})`);
  if (!fin.length) return `Con el corte ≥ ${A.cutoff.toFixed(1)} ningún criterio pasa: el mejor es ${ci.rows[0].cand.name} con ${r2(ci.rows[0].mean)}. Baja el corte o revisa las calificaciones.`;
  const head = `Con el corte ≥ ${A.cutoff.toFixed(1)} pasan ${ci.nPass} de ${ci.rows.length} criterios calificados: ${list(fin)}.`;
  if (!ci.last || !ci.firstNo || ci.gap == null) return head + ' Todos los calificados pasan el corte, así que no hay brecha que justificar.';
  const kind = ci.gapKind === 'clear' ? 'una brecha clara' : ci.gapKind === 'moderate' ? 'una brecha moderada' : 'una brecha estrecha (casi un empate: justifica muy bien por qué el corte va ahí)';
  return `${head} El primero que queda fuera es ${ci.firstNo.cand.name} con ${r2(ci.firstNo.mean)}, a ${r2(ci.gap)} puntos del último que pasa (${ci.last.cand.name}, ${r2(ci.last.mean)}): ${kind}.`;
}

/** Avisos de calidad de la Parte A (cada uno es una frase completa). Lista vacía = nada que advertir. */
export function prioWarnings(A: PrioState, criteriaCount?: number): string[] {
  const w: string[] = [];
  const f = funnel(A);
  const ci = cutInfo(A);
  if (f.unrated) w.push(`${plural(f.unrated, 'criterio del panel no tiene', 'criterios del panel no tienen')} calificaciones válidas (entre 1 y 5): no pueden pasar ni fallar el corte.`);
  const partial = alive(A).map((c) => scoreBreakdown(A, c)).filter((r) => r.n > 0 && r.n < r.cells.length);
  if (partial.length) w.push(`El promedio de ${list(partial.map((r) => `${r.cand.name} (${r.n} de ${r.cells.length})`))} usa menos calificaciones que el resto: las casillas vacías o fuera de 1–5 no cuentan.`);
  if (ci.nPass > 0 && ci.nPass < MIN_FINALISTS) w.push(`Hay ${ci.nPass} finalista${ci.nPass === 1 ? '' : 's'}; la diapositiva 18 pide al menos ${MIN_FINALISTS} criterios para la propuesta.`);
  if (ci.gapKind === 'narrow') w.push(`La brecha entre el último que pasa y el primero que no es de solo ${r2(ci.gap ?? 0)}: el corte separa criterios casi iguales.`);
  if (criteriaCount != null && ci.nPass && ci.nPass !== criteriaCount) w.push(`Tu AHP tiene ${criteriaCount} criterios y aquí quedan ${ci.nPass} finalistas: revisa que coincidan.`);
  const fin = ci.rows.filter((r) => r.pass);
  const noJust = fin.filter((r) => !r.cand.just.trim());
  if (noJust.length) w.push(`Sin justificación escrita: ${list(noJust.map((r) => r.cand.name))}.`);
  const md = measurability(A);
  if (md.no.length) w.push(`No medible para todas las alternativas: ${list(md.no.map((c) => c.name))}. Reformúlalo o vuelve a tamizar (diapositiva 18).`);
  if (md.pending.length) w.push(`Falta verificar que sea medible para todas las alternativas: ${list(md.pending.map((c) => c.name))} (diapositiva 18).`);
  return w;
}
