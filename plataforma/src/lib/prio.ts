// Parte A: priorización de criterios (mismas reglas que la herramienta HTML y el Excel de la Sesión 1).

export type Stage = 'keep' | 'drop' | 'merge';
export type Cand = {
  id: string;
  name: string;
  desc: string;
  stage: Stage;
  at: '' | 'tam' | 'ind';
  target: string | null;
  reason: string;
  evid: string;
  qmide: string;
  ind: string;
  sq: (number | null)[];
  se: Record<string, number | null>;
  just: string;
  cutReason: string;
  /** Verificación de la diapositiva 18 (finalistas): ¿se puede medir para todas las alternativas? Opcional (null/ausente = sin verificar):
   * vive en el JSON de la Parte A, sin migración, y se conserva al exportar/importar. */
  measurable?: boolean | null;
  measEvid?: string;
};
export type PrioState = {
  cands: Cand[];
  evaluators: { id: string; name: string }[];
  questions: string[];
  mode: 'ev' | 'q';
  cutoff: number;
};

export const DEFAULT_QUESTIONS = [
  '¿hay evidencia técnica o documental citable (paper, norma, documentación oficial) para todas las alternativas?',
  '¿el dato es cuantitativo/verificable y comparable entre todas las alternativas?',
  '¿la evidencia es consistente y actual (no contradictoria, no obsoleta)?',
  '¿es independiente de los demás candidatos?',
  '¿es directamente crítico para el objetivo de la decisión?',
];

export function blankPrio(): PrioState {
  return {
    cands: [],
    evaluators: [1, 2, 3].map((i) => ({ id: 'v' + i, name: 'Evaluador ' + i })),
    questions: DEFAULT_QUESTIONS,
    mode: 'ev',
    cutoff: 4,
  };
}

export function normalizePrio(x: unknown): PrioState {
  const b = blankPrio();
  if (!x || typeof x !== 'object' || !Array.isArray((x as PrioState).cands)) return b;
  const s = x as PrioState;
  return {
    cands: s.cands,
    evaluators: Array.isArray(s.evaluators) && s.evaluators.length ? s.evaluators : b.evaluators,
    questions: Array.isArray(s.questions) && s.questions.length === 5 ? s.questions : b.questions,
    mode: s.mode === 'q' ? 'q' : 'ev',
    cutoff: typeof s.cutoff === 'number' ? s.cutoff : 4,
  };
}

export const newCand = (id: string, name: string): Cand => ({
  id, name, desc: '', stage: 'keep', at: '', target: null, reason: '', evid: '', qmide: '', ind: '',
  sq: [null, null, null, null, null], se: {}, just: '', cutReason: '',
});

export const alive = (A: PrioState) => A.cands.filter((c) => c.stage === 'keep');
// Los que llegan a la verificación de independencia = los que NO se eliminaron en el tamizaje (keep, o eliminados ya en la independencia).
export const inIndep = (A: PrioState) => A.cands.filter((c) => c.stage === 'keep' || c.at === 'ind');
export const cols = (A: PrioState): { key: string | number; label: string }[] =>
  A.mode === 'q'
    ? A.questions.map((_, i) => ({ key: i, label: 'Q' + (i + 1) }))
    : A.evaluators.map((e) => ({ key: e.id, label: e.name }));
export const scoreOf = (A: PrioState, c: Cand, k: string | number): number | null =>
  A.mode === 'q' ? (c.sq[k as number] ?? null) : (c.se[k as string] ?? null);

export function mean(A: PrioState, c: Cand): number | null {
  const v = cols(A)
    .map((x) => scoreOf(A, c, x.key))
    .filter((x): x is number => typeof x === 'number' && x >= 1 && x <= 5);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
export const passes = (A: PrioState, c: Cand) => {
  const m = mean(A, c);
  return m != null && m >= A.cutoff - 1e-9;
};
export const ranked = (A: PrioState) =>
  alive(A).slice().sort((a, b) => (mean(A, b) ?? -1) - (mean(A, a) ?? -1));
export const finalists = (A: PrioState) => ranked(A).filter((c) => passes(A, c));
export const f2 = (m: number | null) => (m == null ? '—' : m.toFixed(2));
