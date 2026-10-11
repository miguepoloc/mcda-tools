/** Escenarios con nombre del geovisor (G13): hasta 5 combinaciones de pesos + reglas + clases guardadas en
 * `projects.geo.scenarios`, con un resumen calculado (ha y % por clase, índice medio). Puro y sin DOM.
 *
 * NO se guarda la grilla: para la capa «Diferencia» el escenario se vuelve a evaluar con las capas actuales
 * (el índice es función de capas + pesos + reglas). El resumen guardado alimenta la tabla lado a lado, que por eso
 * funciona aunque las capas aún no hayan cargado. */
import { MASK_EXCLUDED, MASK_NODATA, type ClassStats } from './suitability.ts';
import { describeFn, describeVeto } from './membership.ts';
import type { ClassSetup } from './classes.ts';
import type { GeoScenario } from '../types.ts';

export type { GeoScenario };
export const MAX_SCENARIOS = 5;
export const MAX_SCENARIO_NAME = 40;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Nombre limpio: sin espacios sobrantes y de hasta 40 caracteres. */
export function cleanName(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, MAX_SCENARIO_NAME).trim();
}

/** «Escenario 1», «Escenario 2»… el primer número que ningún escenario usa ya. */
export function nextScenarioName(list: readonly GeoScenario[]): string {
  const used = new Set(list.map((s) => s.name));
  for (let n = 1; n <= MAX_SCENARIOS + 1; n++) if (!used.has(`Escenario ${n}`)) return `Escenario ${n}`;
  return `Escenario ${list.length + 1}`;
}

/** Índice medio 0–100 de las celdas evaluadas (las mismas que cuenta `classStats`); null si no hay ninguna. */
export function meanIndex(pct: Uint8Array, mask: Uint8Array): number | null {
  let sum = 0, n = 0;
  for (let i = 0; i < pct.length; i++) {
    if (mask[i] === MASK_NODATA || mask[i] === MASK_EXCLUDED || pct[i] === 255) continue;
    sum += pct[i]; n++;
  }
  return n ? sum / n : null;
}

export type ScenarioInput = {
  id: string; name: string; date: string;
  setup: ClassSetup;
  /** Nombres resueltos de las clases (de menor a mayor índice). */
  names: string[];
  weights: Record<string, number>;
  explored: boolean;
  effective: Record<string, number>;
  rules: GeoScenario['rules'];
  stats: ClassStats;
  meanPct: number | null;
};

/** Escenario con copia profunda de reglas, cortes y clases (no comparte referencias con el estado vivo). */
export function buildScenario(i: ScenarioInput): GeoScenario {
  return {
    id: i.id, name: cleanName(i.name) || 'Escenario', date: i.date,
    direction: i.setup.direction,
    weights: { ...i.weights },
    ...(i.explored ? { explored: true } : {}),
    rules: clone(i.rules),
    breaks: i.setup.breaks.slice(),
    classes: i.setup.classes.map((c) => ({ ...c })),
    cut: i.setup.cut,
    summary: {
      names: i.names.slice(),
      classes: i.stats.classes.map((c) => ({ ha: c.ha, pct: c.pct })),
      vetoHa: i.stats.veto.ha, exclHa: i.stats.excl.ha, evaluableHa: i.stats.evaluableHa,
      meanPct: i.meanPct,
      effective: { ...i.effective },
    },
  };
}

export type AddResult = { list: GeoScenario[]; ok: boolean; reason?: 'full' };

/** Agrega un escenario al final. Con 5 ya guardados devuelve la lista intacta y `reason: 'full'`. */
export function addScenario(list: readonly GeoScenario[] | undefined, s: GeoScenario): AddResult {
  const cur = list ?? [];
  if (cur.length >= MAX_SCENARIOS) return { list: cur.slice(), ok: false, reason: 'full' };
  return { list: [...cur, s], ok: true };
}

/** Cambia el nombre; un nombre vacío (tras limpiarlo) no se aplica. */
export function renameScenario(list: readonly GeoScenario[], id: string, name: string): GeoScenario[] {
  const nm = cleanName(name);
  if (!nm) return list.slice();
  return list.map((s) => (s.id === id ? { ...s, name: nm } : s));
}

export function removeScenario(list: readonly GeoScenario[], id: string): GeoScenario[] {
  return list.filter((s) => s.id !== id);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Lee `geo.scenarios` de la base (jsonb: puede traer cualquier cosa): descarta lo que no tenga la forma mínima y
 * recorta a 5. Proyecto sin `scenarios` → []. */
export function sanitizeScenarios(raw: unknown): GeoScenario[] {
  if (!Array.isArray(raw)) return [];
  const out: GeoScenario[] = [];
  for (const r of raw) {
    if (out.length >= MAX_SCENARIOS) break;
    const s = r as Partial<GeoScenario> | null;
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || typeof s.name !== 'string' || !s.rules || typeof s.rules !== 'object') continue;
    if (!Array.isArray(s.breaks) || s.breaks.length < 1 || !s.breaks.every(isNum)) continue;
    const sm = s.summary;
    if (!sm || !Array.isArray(sm.classes) || sm.classes.length !== s.breaks.length + 1 || !sm.classes.every((c) => c && isNum(c.ha) && isNum(c.pct))) continue;
    out.push({
      ...(s as GeoScenario),
      direction: s.direction === 'risk' ? 'risk' : 'suitability',
      weights: s.weights && typeof s.weights === 'object' ? s.weights : {},
      classes: Array.isArray(s.classes) ? s.classes : [],
      cut: s.cut === 'quantile' || s.cut === 'jenks' ? s.cut : 'manual',
      date: typeof s.date === 'string' ? s.date : '',
      summary: { ...sm, names: Array.isArray(sm.names) ? sm.names : [], vetoHa: isNum(sm.vetoHa) ? sm.vetoHa : 0, exclHa: isNum(sm.exclHa) ? sm.exclHa : 0, evaluableHa: isNum(sm.evaluableHa) ? sm.evaluableHa : 0, meanPct: isNum(sm.meanPct) ? sm.meanPct : null, effective: sm.effective && typeof sm.effective === 'object' ? sm.effective : {} },
    });
  }
  return out;
}

// ---------------------------------------------------------------- comparación

export type CompareRow = {
  /** Nombre de la clase en el mapa actual. */
  name: string;
  /** Nombre que tenía en el escenario, si cambió. */
  savedName?: string;
  haA: number; pctA: number; haB: number; pctB: number;
  /** Diferencia en hectáreas (ahora − escenario) y en PUNTOS PORCENTUALES del área evaluada. */
  dHa: number; dPp: number;
};

export type Comparison =
  | { comparable: false; reason: 'classes' | 'direction'; savedN: number; nowN: number }
  | { comparable: true; rows: CompareRow[]; meanA: number | null; meanB: number | null; dMean: number | null; evaluableA: number; evaluableB: number };

/** Tabla lado a lado del escenario guardado contra el resultado actual. No compara si cambió el número de clases
 * (las filas ya no corresponderían) ni la dirección (un valor alto significaría otra cosa). */
export function compareSummaries(
  saved: GeoScenario,
  now: { direction: 'suitability' | 'risk'; names: string[]; stats: Pick<ClassStats, 'classes' | 'evaluableHa'>; meanPct: number | null },
): Comparison {
  const savedN = saved.summary.classes.length, nowN = now.stats.classes.length;
  if (savedN !== nowN) return { comparable: false, reason: 'classes', savedN, nowN };
  if (saved.direction !== now.direction) return { comparable: false, reason: 'direction', savedN, nowN };
  const rows = now.stats.classes.map((b, i): CompareRow => {
    const a = saved.summary.classes[i];
    const sn = saved.summary.names[i];
    return {
      name: now.names[i], ...(sn && sn !== now.names[i] ? { savedName: sn } : {}),
      haA: a.ha, pctA: a.pct, haB: b.ha, pctB: b.pct, dHa: b.ha - a.ha, dPp: b.pct - a.pct,
    };
  });
  const meanA = saved.summary.meanPct;
  return {
    comparable: true, rows, meanA, meanB: now.meanPct, dMean: meanA !== null && now.meanPct !== null ? now.meanPct - meanA : null,
    evaluableA: saved.summary.evaluableHa, evaluableB: now.stats.evaluableHa,
  };
}

// ---------------------------------------------------------------- restauración

export type RestorePlan = {
  rules: GeoScenario['rules'];
  setup: ClassSetup;
  /** Pesos alineados con el orden actual de criterios (un criterio que no estaba en el escenario pesa 0). */
  weights: number[];
  /** true = los pesos guardados difieren de los del panel: se aplican como «explorados». */
  exploring: boolean;
  /** Criterios del escenario que ya no existen (sus reglas y pesos se descartan). */
  droppedCriteria: string[];
  /** Criterios actuales que el escenario no conocía (quedan sin regla y con peso 0). */
  newCriteria: string[];
};

/** Qué hay que aplicar para volver a un escenario. Los pesos solo pueden fijarse como exploración (los del panel
 * salen de los juicios de los expertos): si coinciden con los del panel (normalizados) no se activa. */
export function restorePlan(s: GeoScenario, criteriaIds: string[], panelWeights: number[]): RestorePlan {
  const known = new Set(criteriaIds);
  const rules: GeoScenario['rules'] = {};
  for (const [id, r] of Object.entries(s.rules)) if (known.has(id)) rules[id] = clone(r);
  const droppedCriteria = [...new Set([...Object.keys(s.rules), ...Object.keys(s.weights)])].filter((id) => !known.has(id));
  const newCriteria = criteriaIds.filter((id) => !(id in s.weights) && !(id in s.rules));
  const weights = criteriaIds.map((id) => (isNum(s.weights[id]) ? Math.max(0, s.weights[id]) : 0));
  const norm = (w: number[]) => { const t = w.reduce((a, b) => a + b, 0); return t > 0 ? w.map((x) => x / t) : w.map(() => 0); };
  const a = norm(weights), b = norm(panelWeights);
  const exploring = a.length !== b.length || a.some((v, i) => Math.abs(v - b[i]) > 1e-6);
  return {
    rules,
    setup: { direction: s.direction, breaks: s.breaks.slice(), classes: s.classes.map((c) => ({ ...c })), cut: s.cut },
    weights, exploring, droppedCriteria, newCriteria,
  };
}

// ---------------------------------------------------------------- exportación

const r2 = (v: number) => Number(v.toFixed(2));

/** Filas de la hoja «Escenarios» del Excel del geovisor (solo valores). */
export function scenarioRows(
  list: readonly GeoScenario[],
  ctx: { criteria: { id: string; name: string }[]; layerLabel: (key: string) => string },
): (string | number)[][] {
  const rows: (string | number)[][] = [['Escenarios guardados del geovisor (solo valores; no son fórmulas vivas)'], []];
  list.forEach((s, k) => {
    const risk = s.direction === 'risk';
    rows.push([`${k + 1}. ${s.name}`]);
    rows.push(['Fecha', s.date.slice(0, 10)]);
    rows.push(['Dirección', risk ? 'Riesgo: un valor alto es más riesgo (peor)' : 'Aptitud: un valor alto es más apto (mejor)']);
    rows.push(['Pesos', s.explored ? 'Explorados a mano (no eran los del panel)' : 'Panel de expertos / pesos iguales']);
    rows.push(['Índice medio (0–100)', s.summary.meanPct === null ? '' : r2(s.summary.meanPct)]);
    rows.push(['Área evaluada (ha)', r2(s.summary.evaluableHa)]);
    rows.push(['Clase', 'Rango del índice (%)', 'Hectáreas', '% del área evaluada']);
    const edges = [0, ...s.breaks, 1];
    s.summary.classes.forEach((c, i) => {
      const last = i === s.summary.classes.length - 1;
      rows.push([s.summary.names[i] ?? `Clase ${i + 1}`, `${Math.round(edges[i] * 1000) / 10} – ${Math.round(edges[i + 1] * 1000) / 10}${last ? ' (incl.)' : ' (excl.)'}`, r2(c.ha), r2(c.pct)]);
    });
    rows.push(['Criterio', 'Peso usado', 'Peso efectivo', 'Capa', 'Regla', 'Veto']);
    for (const c of ctx.criteria) {
      const r = s.rules[c.id];
      if (!r && !(c.id in s.weights)) continue;
      rows.push([c.name, Number((s.weights[c.id] ?? 0).toFixed(6)), Number((s.summary.effective[c.id] ?? 0).toFixed(6)), r ? ctx.layerLabel(r.layerKey) : '—', r ? describeFn(r.fn) : '—', describeVeto(r?.veto)]);
    }
    rows.push([]);
  });
  return rows;
}

/** Contenido de `escenarios.json` del zip de exportación. */
export function scenariosJson(list: readonly GeoScenario[], meta: { project: string; date: string }): string {
  return JSON.stringify({ version: 1, proyecto: meta.project, exportado: meta.date, nota: 'Escenarios guardados del geovisor: pesos, reglas, cortes y resumen. No incluye la grilla.', escenarios: list }, null, 2);
}
