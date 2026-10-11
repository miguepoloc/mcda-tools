/** Sensibilidad espacial de pesos (G15; ref. Chen, Yu y Khan 2010, «Spatial sensitivity analysis of multi-criteria
 * weights in GIS-based land suitability evaluation»). Para cada criterio se varía su peso en ±10 % y ±20 % (relativo),
 * los demás se reescalan proporcionalmente para que la suma de pesos no cambie, y se recalcula el índice por celda
 * con las MISMAS reglas, vetos y cortes del mapa. Resultado: qué celdas cambian de clase y cuántas hectáreas
 * quedan en cada clase. Puro y sin DOM.
 *
 * Rendimiento: la idoneidad parcial de cada criterio por celda se calcula UNA vez; cada caso solo hace sumas
 * ponderadas. El trabajo va en un generador (`sensitivitySteps`) que cede el control entre casos, para que la
 * interfaz lo ejecute en trozos (un caso por turno del hilo principal) sin congelar la pantalla. */
import { suitability as sFn, vetoed } from './membership.ts';
import {
  classOf, MASK_EXCLUDED, MASK_NODATA, usableRules, type CriterionRule, type Direction,
} from './suitability.ts';

export const SENS_DELTAS = [-0.2, -0.1, 0.1, 0.2] as const;

/** Pesos con el criterio `k` multiplicado por (1 + delta) y los demás reescalados proporcionalmente para que el total
 * no cambie. El peso variado se acota a [0, total]; si el criterio ya concentra todo el peso (o los demás pesan 0) no
 * hay cómo compensar y se devuelven los pesos tal cual. */
export function perturbWeights(w: readonly number[], k: number, delta: number): number[] {
  const total = w.reduce((a, b) => a + b, 0);
  const wk = w[k];
  const others = total - wk;
  if (!(total > 0) || !(others > 1e-12)) return w.slice();
  const nk = Math.min(total, Math.max(0, wk * (1 + delta)));
  const f = (total - nk) / others;
  return w.map((x, i) => (i === k ? nk : x * f));
}

export type SensitivityInput = {
  layers: Record<string, Float32Array>;
  mask: Uint8Array;
  rules: CriterionRule[];
  /** Un rótulo por regla (nombre del criterio), en el mismo orden que `rules`. */
  labels: string[];
  direction: Direction;
  /** N−1 cortes ascendentes (0–1): los del mapa que se ve. */
  breaks: number[];
  haPerPixel: number;
  deltas?: readonly number[];
};

export type SensitivityCase = {
  /** Índice del criterio variado, respecto a `SensitivityResult.criteria`. */
  criterion: number;
  delta: number;
  /** Celdas evaluadas cuya clase cambia y su % del área evaluada. */
  changed: number; changedPct: number; changedHa: number;
  /** De las que cambian: cuántas pasan a una clase de número mayor / menor. */
  up: number; down: number;
  /** Hectáreas por clase (1..N en orden ascendente del índice) con los pesos variados; el veto cuenta en la extrema. */
  classHa: number[];
  /** 1 = la celda cambia de clase (paralelo a la grilla). */
  map: Uint8Array;
};

export type SensitivityResult = {
  criteria: { label: string; weight: number; effective: number }[];
  deltas: number[];
  nClasses: number;
  direction: Direction;
  evaluableCells: number; evaluableHa: number;
  baseClassHa: number[];
  cases: SensitivityCase[];
  /** Por criterio, el mayor % de celdas que cambian entre sus variaciones (para ordenar y resaltar). */
  maxChangedPct: number[];
};

export type SensitivityProgress = { done: number; total: number };

/** Generador: cada `yield` es un punto donde la interfaz puede ceder el hilo; devuelve el resultado completo. */
export function* sensitivitySteps(inp: SensitivityInput): Generator<SensitivityProgress, SensitivityResult, void> {
  const n = inp.mask.length;
  const usable = usableRules(inp.layers, n, inp.rules);
  const labels: string[] = [];
  inp.rules.forEach((r, i) => { if (usable.includes(r)) labels.push(inp.labels[i] ?? `Criterio ${i + 1}`); });
  const K = usable.length;
  const nClasses = inp.breaks.length + 1;
  const deltas = [...(inp.deltas ?? SENS_DELTAS)];
  const w0 = usable.map((r) => r.weight);
  const totalW = w0.reduce((a, b) => a + b, 0);
  const extreme = inp.direction === 'risk' ? nClasses : 1; // clase (1..N) donde cuenta el veto

  // Idoneidad parcial por criterio y celda (NaN = sin dato) y veto por celda; una sola pasada.
  const S = usable.map(() => new Float64Array(n)); // doble precisión: misma aritmética que `indexPixel`
  const veto = new Uint8Array(n);
  const evalCell = new Uint8Array(n); // 1 = celda evaluable
  const baseCls = new Uint8Array(n);
  const total = 1 + K * deltas.length;
  let done = 0;
  for (let i = 0; i < n; i++) {
    const m = inp.mask[i];
    let wUsed = 0;
    for (let k = 0; k < K; k++) {
      if (m === MASK_NODATA || m === MASK_EXCLUDED) { S[k][i] = NaN; continue; }
      const x = inp.layers[usable[k].key][i];
      if (Number.isNaN(x)) { S[k][i] = NaN; continue; }
      S[k][i] = sFn(x, usable[k].fn);
      wUsed += w0[k];
      if (vetoed(x, usable[k].veto)) veto[i] = 1;
    }
    // Igual que el mapa: sin ningún peso con dato la celda no se evalúa.
    if (m !== MASK_NODATA && m !== MASK_EXCLUDED && wUsed > 0) evalCell[i] = 1;
  }
  const indexOf = (i: number, w: readonly number[]): number => {
    let sum = 0, wu = 0;
    for (let k = 0; k < K; k++) {
      const v = S[k][i];
      if (Number.isNaN(v)) continue;
      sum += w[k] * v; wu += w[k];
    }
    return wu === 0 ? NaN : sum / wu;
  };
  let evaluable = 0;
  const baseCnt = new Array<number>(nClasses).fill(0);
  for (let i = 0; i < n; i++) {
    if (!evalCell[i]) continue;
    evaluable++;
    const c = veto[i] ? extreme : classOf(indexOf(i, w0), inp.breaks);
    baseCls[i] = c;
    baseCnt[c - 1]++;
  }
  done++;
  yield { done, total };

  const cases: SensitivityCase[] = [];
  for (let k = 0; k < K; k++) {
    for (const d of deltas) {
      const w = perturbWeights(w0, k, d);
      const map = new Uint8Array(n);
      const cnt = new Array<number>(nClasses).fill(0);
      let changed = 0, up = 0, down = 0;
      for (let i = 0; i < n; i++) {
        if (!evalCell[i]) continue;
        let c = baseCls[i];
        if (!veto[i]) {
          const s = indexOf(i, w);
          if (!Number.isNaN(s)) c = classOf(s, inp.breaks);
        }
        cnt[c - 1]++;
        if (c !== baseCls[i]) { map[i] = 1; changed++; if (c > baseCls[i]) up++; else down++; }
      }
      cases.push({
        criterion: k, delta: d, changed, changedPct: evaluable ? (100 * changed) / evaluable : 0, changedHa: changed * inp.haPerPixel,
        up, down, classHa: cnt.map((c) => c * inp.haPerPixel), map,
      });
      done++;
      yield { done, total };
    }
  }
  return {
    criteria: labels.map((label, k) => ({ label, weight: w0[k], effective: totalW > 0 ? w0[k] / totalW : 0 })),
    deltas, nClasses, direction: inp.direction,
    evaluableCells: evaluable, evaluableHa: evaluable * inp.haPerPixel,
    baseClassHa: baseCnt.map((c) => c * inp.haPerPixel),
    cases,
    maxChangedPct: labels.map((_, k) => Math.max(0, ...cases.filter((c) => c.criterion === k).map((c) => c.changedPct))),
  };
}

/** Corre el generador completo de una vez (pruebas, scripts, cuadrículas pequeñas). */
export function runSensitivity(inp: SensitivityInput): SensitivityResult {
  const g = sensitivitySteps(inp);
  for (;;) { const r = g.next(); if (r.done) return r.value; }
}

export type ChangeSel = { criterion: number | 'all'; delta: number | 'any' };

/** Mapa de cambios para una selección: para cada celda, en cuántos de los casos elegidos cambia de clase.
 * `max` = el mayor conteo (0 si ninguna celda cambia); `cases` = cuántos casos entran. */
export function changeCount(r: SensitivityResult, sel: ChangeSel, n: number): { count: Uint8Array; max: number; cases: number } {
  const count = new Uint8Array(n);
  let cases = 0;
  for (const c of r.cases) {
    if (sel.criterion !== 'all' && c.criterion !== sel.criterion) continue;
    if (sel.delta !== 'any' && Math.abs(c.delta - sel.delta) > 1e-9) continue;
    cases++;
    for (let i = 0; i < n; i++) if (c.map[i]) count[i]++;
  }
  let max = 0;
  for (let i = 0; i < n; i++) if (count[i] > max) max = count[i];
  return { count, max, cases };
}

/** Texto de una variación: «+10 %», «−20 %». */
export const deltaLabel = (d: number) => `${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) * 100)} %`;

const r2 = (v: number) => Number(v.toFixed(2));

/** Filas de la hoja «Sensibilidad» del Excel (solo valores). */
export function sensitivityRows(r: SensitivityResult, classNames: string[]): (string | number)[][] {
  const rows: (string | number)[][] = [
    ['Sensibilidad espacial de pesos (solo valores; no son fórmulas vivas)'],
    ['Método', 'Se varía el peso de un criterio ±10 % y ±20 % (relativo) y los demás se reescalan proporcionalmente; se recalcula el índice con las mismas reglas, vetos y cortes. Ref.: Chen, Yu y Khan (2010).'],
    ['Dirección', r.direction === 'risk' ? 'Riesgo: un valor alto es más riesgo (peor)' : 'Aptitud: un valor alto es más apto (mejor)'],
    ['Área evaluada (ha)', r2(r.evaluableHa)],
    [],
    ['Criterio', 'Peso efectivo', 'Variación', 'Celdas que cambian de clase', '% del área evaluada', 'Ha que cambian', 'Suben de clase', 'Bajan de clase', ...classNames.map((n) => `${n} (ha)`)],
    ['Sin variación (mapa actual)', '', '', 0, 0, 0, 0, 0, ...r.baseClassHa.map(r2)],
  ];
  for (const c of r.cases) {
    const cr = r.criteria[c.criterion];
    rows.push([cr.label, Number(cr.effective.toFixed(4)), deltaLabel(c.delta), c.changed, r2(c.changedPct), r2(c.changedHa), c.up, c.down, ...c.classHa.map(r2)]);
  }
  return rows;
}
