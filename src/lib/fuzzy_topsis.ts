// Fuzzy TOPSIS – extensión difusa del método TOPSIS clásico.
// Referencia: Chen, C.-T. (2000). Extensions of the TOPSIS for group decision-making
//   under fuzzy environment. Fuzzy Sets and Systems, 114(1), 1-9.
// Las evaluaciones de las alternativas son variables lingüísticas representadas como
// Números Difusos Triangulares (TFN) (l, m, u): l ≤ m ≤ u.
import type { Alternative, Criterion, DecisionMatrix } from './types.ts';
import { getType } from './topsis.ts';

/** Número Difuso Triangular: [inferior, medio, superior]. */
export type TFN = [number, number, number];

/** Escala lingüística estándar de evaluación de alternativas (Chen, 2000). */
export const LINGUISTIC_ALT: Record<string, TFN> = {
  VP: [0, 0, 1],   // Very Poor
  P:  [0, 1, 3],   // Poor
  F:  [1, 3, 5],   // Fair
  G:  [5, 7, 9],   // Good
  VG: [7, 9, 10],  // Very Good
};

/** Escala lingüística estándar de pesos (si se usan pesos difusos — aquí se usan pesos numéricos). */
export const LINGUISTIC_LABELS = ['VP', 'P', 'F', 'G', 'VG'] as const;
export type LinguisticLabel = (typeof LINGUISTIC_LABELS)[number];

/** Valor nítido de una etiqueta lingüística: el centroide de su TFN, (l + m + u) / 3. Es la desdifusificación más simple y la que
 * se usa para poder aplicar métodos que necesitan números (p. ej. pesos CRITIC o de entropía) a una matriz lingüística
 * (ul Amin et al., 2022: CRITIC difuso y luego desdifusificación). */
export function defuzzify(label: LinguisticLabel): number {
  const [l, m, u] = LINGUISTIC_ALT[label];
  return (l + m + u) / 3;
}

/** Copia de la matriz con cada etiqueta lingüística reemplazada por su valor nítido (centroide). Las celdas vacías cuentan como
 * «Regular» (F), igual que en fuzzyTopsisSynthesis; las numéricas se dejan tal cual. Solo para calcular pesos objetivos. */
export function defuzzifyMatrix(dm: DecisionMatrix, criteria: Criterion[], alternatives: Alternative[]): DecisionMatrix {
  const values: DecisionMatrix['values'] = {};
  for (const a of alternatives) {
    values[a.id] = {};
    for (const c of criteria) {
      const v = dm.values[a.id]?.[c.id];
      values[a.id][c.id] = typeof v === 'number' ? v : defuzzify(getLabel(dm, a.id, c.id));
    }
  }
  return { ...dm, values };
}

// ---- Aritmética difusa triangular ----

/** Suma de dos TFN. */
export function tfnAdd(a: TFN, b: TFN): TFN {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/** Multiplicación de un TFN por un escalar no negativo. */
export function tfnScale(a: TFN, s: number): TFN {
  return [a[0] * s, a[1] * s, a[2] * s];
}

/** Distancia euclidiana entre dos TFN (Vertex Method). */
export function tfnDist(a: TFN, b: TFN): number {
  return Math.sqrt(((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) / 3);
}

// ---- Algoritmo principal ----

/** Obtiene la etiqueta lingüística guardada en la matriz para un par alternativa-criterio.
 * Si no está definida, devuelve la TFN de 'F' (Fair) como valor neutro por defecto. */
function getLabel(dm: DecisionMatrix, altId: string, critId: string): LinguisticLabel {
  const v = dm.values[altId]?.[critId];
  return (typeof v === 'string' && v in LINGUISTIC_ALT) ? (v as LinguisticLabel) : 'F';
}

export type FuzzyTopsisSynth = {
  rows: { name: string; value: number; rank: number }[];
  order: number[];
  tie: boolean;
  /** Detalle de distancias para el Excel. */
  detail: {
    dPlus: number[];
    dMinus: number[];
  };
};

/**
 * Fuzzy TOPSIS (Chen, 2000):
 * 1. Convierte etiquetas lingüísticas a TFN.
 * 2. Normaliza la FDM (por u* para max, por l* para min — normalización linear normalizada).
 * 3. Pondera: v_ij = w_j * r_ij.
 * 4. FPIS A+ = (1,1,1) por criterio; FNIS A- = (0,0,0).
 * 5. Calcula distancias d+ y d- con tfnDist.
 * 6. CC_i = d- / (d+ + d-).
 */
export function fuzzyTopsisSynthesis(
  criteria: Criterion[],
  alternatives: Alternative[],
  dm: DecisionMatrix,
  weights: number[],
): FuzzyTopsisSynth {
  const n = alternatives.length;
  const m = criteria.length;
  const empty = (): FuzzyTopsisSynth => ({
    rows: alternatives.map((a, i) => ({ name: a.name, value: 0, rank: i + 1 })),
    order: alternatives.map((_, i) => i),
    tie: true,
    detail: { dPlus: alternatives.map(() => 0), dMinus: alternatives.map(() => 0) },
  });
  if (n === 0 || m === 0) return empty();

  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const w = weights.map((x) => x / wsum);

  // FDM: fdm[i][j] = TFN de la alternativa i en criterio j
  const fdm: TFN[][] = alternatives.map((a) =>
    criteria.map((c) => LINGUISTIC_ALT[getLabel(dm, a.id, c.id)])
  );

  // Normalización: para max r_ij = (l/u*, m/u*, u/u*); para min r_ij = (l*/u, l*/m, l*/l)
  const normalized: TFN[][] = Array.from({ length: n }, () => Array(m).fill([0, 0, 0] as TFN));
  for (let j = 0; j < m; j++) {
    const type = getType(dm, criteria[j].id);
    const col = fdm.map((row) => row[j]);
    if (type === 'max') {
      const uStar = Math.max(...col.map((t) => t[2])) || 1;
      for (let i = 0; i < n; i++) {
        normalized[i][j] = [col[i][0] / uStar, col[i][1] / uStar, col[i][2] / uStar];
      }
    } else {
      const lStar = Math.min(...col.map((t) => t[0])) || 1;
      for (let i = 0; i < n; i++) {
        const [l, mid, u] = col[i];
        // Fórmula de costo: (l*, l*, l*) / (l, m, u) → invertir orden
        normalized[i][j] = [
          u === 0 ? 0 : lStar / u,
          mid === 0 ? 0 : lStar / mid,
          l === 0 ? 0 : lStar / l,
        ];
      }
    }
  }

  // Matriz difusa ponderada: v_ij = w_j * r_ij
  const V: TFN[][] = normalized.map((row) =>
    row.map((tfn, j) => tfnScale(tfn, w[j]))
  );

  // FPIS y FNIS
  const FPIS: TFN[] = Array(m).fill([1, 1, 1] as TFN);
  const FNIS: TFN[] = Array(m).fill([0, 0, 0] as TFN);

  // Distancias
  const dPlus = V.map((row) => row.reduce((s, v, j) => s + tfnDist(v, FPIS[j]), 0));
  const dMinus = V.map((row) => row.reduce((s, v, j) => s + tfnDist(v, FNIS[j]), 0));

  // Coeficiente de cercanía
  const cc = dPlus.map((dp, i) => {
    const tot = dp + dMinus[i];
    return tot === 0 ? 0 : dMinus[i] / tot;
  });

  const order = cc.map((_, i) => i).sort((a, b) => cc[b] - cc[a]);
  const rows = alternatives.map((a, i) => ({ name: a.name, value: cc[i], rank: 0 }));
  rows.forEach((row) => (row.rank = 1 + rows.filter((o) => o.value > row.value + 1e-9).length));
  const vals = rows.map((x) => x.value);

  return {
    rows,
    order,
    tie: vals.length < 2 || Math.max(...vals) - Math.min(...vals) < 1e-9,
    detail: { dPlus, dMinus },
  };
}
