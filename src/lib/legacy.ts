// Puente con la herramienta HTML (prototipos/): mismo formato de respaldo "v2" (.json y hoja oculta _datos del .xlsx).
// La herramienta HTML solo conoce AHP + priorización (ver CLAUDE.md); `method`/`dm` son un agregado
// de la plataforma, opcional en el formato v2, para que exportar/reimportar un proyecto TOPSIS (y a
// futuro VIKOR/PROMETHEE/ELECTRE) no pierda la matriz de decisión. Un .json/.xlsx viejo de la
// herramienta HTML (sin esos campos) sigue siendo válido: cae a method='ahp' con matriz vacía.
import type { Alternative, Criterion, DecisionMatrix, Method, WeightingMethod } from './types.ts';
import type { JIndex, JMap } from './ahp.ts';
import { blankMatrix, normalizeMatrix } from './topsis.ts';
import { blankPrio, normalizePrio, type PrioState } from './prio.ts';

export type Study = {
  title: string;
  objective: string;
  criteria: Criterion[];
  alternatives: Alternative[];
  experts: { id: string; name: string; role_desc: string }[];
  idx: JIndex;
  prio: PrioState;
  method: Method;
  decisionMatrix: DecisionMatrix;
  /** Cómo se pesan los criterios en los métodos de matriz: 'ahp' (juicios por pares, por defecto) o pesos objetivos
   * 'critic'/'entropy'. Solo lo lee el Excel (excel.ts) para elegir la hoja Criterios; vacío = 'ahp'. */
  weighting?: WeightingMethod;
};

type LegacyState = {
  v: 2;
  obj: string;
  A: PrioState;
  crit: Criterion[];
  alt: Alternative[];
  experts: { id: string; name: string }[];
  J: { crit: Record<string, JMap>; alt: Record<string, Record<string, JMap>> };
  demo?: boolean;
  view?: string;
  nid?: number;
  exId?: string;
  method?: Method;
  dm?: DecisionMatrix;
  /** Agregado de la plataforma, opcional como `method`/`dm`: la herramienta HTML lo ignora. */
  wm?: WeightingMethod;
};

export function toLegacy(s: Study): LegacyState {
  const J: LegacyState['J'] = { crit: {}, alt: {} };
  for (const e of s.experts) {
    const sheets = s.idx[e.id] ?? {};
    J.crit[e.id] = sheets['crit'] ?? {};
    for (const c of s.criteria) {
      (J.alt[c.id] ??= {})[e.id] = sheets['alt:' + c.id] ?? {};
    }
  }
  return {
    v: 2, obj: s.objective, A: s.prio, crit: s.criteria, alt: s.alternatives,
    experts: s.experts.map((e) => ({ id: e.id, name: e.role_desc || e.name })),
    J, demo: false, view: 'A1', nid: 100, exId: s.experts[0]?.id ?? 'e0',
    method: s.method, dm: s.decisionMatrix,
    ...(s.weighting && s.weighting !== 'ahp' ? { wm: s.weighting } : {}),
  };
}

export type Imported = {
  objective: string;
  criteria: Criterion[];
  alternatives: Alternative[];
  prio: PrioState;
  experts: { legacyId: string; name: string; role_desc: string }[];
  judgments: { legacyId: string; sheet: string; pair_key: string; value: number }[];
  method: Method;
  decisionMatrix: DecisionMatrix;
  /** Ponderación de criterios del respaldo; ausente (respaldos viejos, Excel del taller) = AHP. */
  weighting?: WeightingMethod;
  /** Solo al importar un Excel del taller (courseExcel.ts): lo que se rellenó por defecto o se redondeó. */
  warnings?: string[];
};

export function isLegacy(x: unknown): x is LegacyState {
  const s = x as LegacyState;
  return !!s && s.v === 2 && Array.isArray(s.crit) && Array.isArray(s.alt) && Array.isArray(s.experts) && !!s.J && !!s.A;
}

const METHODS: Method[] = ['ahp', 'topsis', 'vikor', 'electre', 'promethee', 'saw', 'fuzzy_topsis'];

export function fromLegacy(s: LegacyState): Imported {
  const judgments: Imported['judgments'] = [];
  const push = (legacyId: string, sheet: string, m: JMap | undefined) => {
    for (const [k, v] of Object.entries(m ?? {})) {
      if (typeof v === 'number' && v >= -8 && v <= 8) judgments.push({ legacyId, sheet, pair_key: k, value: Math.round(v) });
    }
  };
  for (const e of s.experts) {
    push(e.id, 'crit', s.J.crit?.[e.id]);
    for (const c of s.crit) push(e.id, 'alt:' + c.id, s.J.alt?.[c.id]?.[e.id]);
  }
  return {
    objective: s.obj ?? '',
    criteria: s.crit.map((c) => ({ id: c.id, name: c.name, hint: c.hint ?? '', src: c.src ?? null, ...(c.unit ? { unit: c.unit } : {}) })),
    alternatives: s.alt.map((a) => ({ id: a.id, name: a.name })),
    prio: normalizePrio(s.A) ?? blankPrio(),
    experts: s.experts.map((e, i) => ({ legacyId: e.id, name: 'Experto ' + (i + 1), role_desc: e.name })),
    judgments,
    method: s.method && METHODS.includes(s.method) ? s.method : 'ahp',
    decisionMatrix: s.dm ? normalizeMatrix(s.dm) : blankMatrix(),
    ...(s.wm === 'critic' || s.wm === 'entropy' ? { weighting: s.wm } : {}),
  };
}
