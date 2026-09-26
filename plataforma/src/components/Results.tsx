'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import ElectreGraph from './ElectreGraph';
import ElectreMatrices from './ElectreMatrices';
import { withUnit } from '@/lib/units';
import MethodCharts, { type MethodChartData } from './MethodCharts';
import type { Alternative, Criterion, DecisionMatrix, JudgmentRow, Method, WeightingMethod } from '@/lib/types';
import {
  CRIT_SHEET, DEFAULT_WEIGHT_METHOD, altSheet, aggMatrix, fmt, getV, indexJudgments, pairsOf, phrase, sheetItems, sheetResult, synthesis,
  type WeightMethod,
} from '@/lib/ahp';
import { getCell, getKind, getTarget, getType, missingTargets, normalizeMatrix, resolveTargets, targetDistance, topsis, topsisSynthesis } from '@/lib/topsis';
import { vikorFirstPlaceChanges, vikorInputs, vikorSensitivity, vikorSynthesis, vikorV } from '@/lib/vikor';
import VikorPanel from './VikorPanel';
import { promethee, prometheeSynthesis } from '@/lib/promethee';
import { electreCStar, electreDStar, electreKernelText, electreSynthesis } from '@/lib/electre';
import { saw, sawSynthesis } from '@/lib/saw';
import { defuzzifyMatrix, fuzzyTopsisSynthesis } from '@/lib/fuzzy_topsis';
import { criticWeights, entropyWeights } from '@/lib/weights';
import SensitivitySimulator from './SensitivitySimulator';
import ExecutiveReportModal, { type ReportAhpInfo, type ReportSheetCr } from './ExecutiveReportModal';
import GroupDiagnostics from './GroupDiagnostics';
import WeightingCard from './WeightingCard';
import { WEIGHTING_SHORT, effectiveWeighting, expertsWithJudgments, isObjectiveFor, resultsGate } from '@/lib/weightingMode';
import type { MethodKey } from './ScientificMethodModal';
import type { PrioState } from '@/lib/prio';
import { buildAhpBreakdownData } from '@/lib/ahpBreakdown';
import { describeMethodParams, electreCompareInfo } from '@/lib/rankCompare';
import AhpBreakdown from './calc/AhpBreakdown';
import AhpVsEqualWeights from './calc/AhpVsEqualWeights';
import TopsisBreakdown from './calc/TopsisBreakdown';
import VikorBreakdown from './calc/VikorBreakdown';
import ElectreBreakdown from './calc/ElectreBreakdown';
import PrometheeBreakdown from './calc/PrometheeBreakdown';
import PrioBreakdown from './calc/PrioBreakdown';
import WeightsBreakdown from './calc/WeightsBreakdown';
import SensitivityReport from './calc/SensitivityReport';
import MethodComparisonReport, { type CompareMethod } from './calc/MethodComparisonReport';
import ContributionBars from './ContributionBars';
import VikorRankBar from './VikorRankBar';

export type ExpertLite = { id: string; label: string; /** Rol del experto (solo el dueño lo ve: la vista pública no lo trae). */ role?: string };

type Props = {
  /** 'single': resultado del método elegido del proyecto (pestaña "Resultados").
   * 'compare': los 6 métodos lado a lado (pestaña "Comparativa"), cada uno independiente del `method`
   * actual — ver el comentario junto a `compareViews` más abajo. */
  mode: 'single' | 'compare';
  criteria: Criterion[];
  alternatives: Alternative[];
  experts: ExpertLite[];
  judgments: Pick<JudgmentRow, 'expert_id' | 'sheet' | 'pair_key' | 'value'>[];
  /** Método de ranking. Default 'ahp'. */
  method?: Method;
  /** Método de ponderación de criterios. Solo aplica cuando method !== 'ahp'. Default 'ahp'. */
  weightingMethod?: WeightingMethod;
  decisionMatrix?: DecisionMatrix | Record<string, never>;
  /** Si true, muestra el detalle de lo que respondió cada experto (vista del dueño). */
  showPerExpert?: boolean;
  projectTitle?: string;
  projectObjective?: string;
  /** Solo VIKOR. Si se pasa (dueño del proyecto), el selector de v se guarda en `decision_matrix.vikorV`.
   * Si no (vista pública), el selector funciona solo en pantalla y no modifica el proyecto. */
  onChangeV?: (v: number) => void;
  /** Solo ELECTRE, mismo patrón que onChangeV: si se pasan (dueño del proyecto), los selectores de c* y
   * d* se guardan en `decision_matrix.electreCStar`/`electreDStar`. Si no (vista pública), cambian solo
   * en pantalla. */
  onChangeCStar?: (c: number) => void;
  onChangeDStar?: (d: number) => void;
  /** Solo dueño: atajos de los mensajes de «faltan juicios». Sin ellos (vista pública) el mensaje va sin botón. */
  onGoExperts?: () => void;
  onGoProject?: () => void;
  /** Parte A (priorización de criterios) guardada. Solo el dueño la tiene: `public_get` no la expone, así que en la vista pública falta. */
  prio?: PrioState;
};

const METHOD_LABEL: Record<Method, string> = {
  ahp: 'AHP', topsis: 'TOPSIS', vikor: 'VIKOR', electre: 'ELECTRE', promethee: 'PROMETHEE',
  saw: 'SAW', fuzzy_topsis: 'Fuzzy TOPSIS',
};
type QuantMethodKey = 'topsis' | 'vikor' | 'promethee' | 'saw' | 'fuzzy_topsis';
const QUANT_KEYS: QuantMethodKey[] = ['topsis', 'vikor', 'promethee', 'saw', 'fuzzy_topsis'];
const METHOD_COLOR: Record<QuantMethodKey, string> = {
  topsis: 'var(--m-topsis)', vikor: 'var(--m-vikor)', promethee: 'var(--m-promethee)', saw: 'var(--m-saw)', fuzzy_topsis: 'var(--m-fuzzy)',
};
/** Color de acento + texto legible sobre ese acento, uno por método (mismos `--m-*` que ya usan las
 * tarjetas de selección de método y la Comparativa) — se usa para que la pestaña "Resultados" (vista
 * de un solo método) se vea del color de ESE método en vez del cian genérico de `--accent`. */
const METHOD_ACCENT: Record<Method, { color: string; ink: string }> = {
  ahp: { color: 'var(--m-ahp)', ink: '#FFFFFF' },
  topsis: { color: 'var(--m-topsis)', ink: '#0B0F17' },
  vikor: { color: 'var(--m-vikor)', ink: '#0B0F17' },
  promethee: { color: 'var(--m-promethee)', ink: '#FFFFFF' },
  electre: { color: 'var(--m-electre)', ink: '#0B0F17' },
  saw: { color: 'var(--m-saw)', ink: '#0B0F17' },
  fuzzy_topsis: { color: 'var(--m-fuzzy)', ink: '#0B0F17' },
};

/** El mismo override de `--accent`/`--accent-soft`/`--accent-ink` que usa la vista "Resultados" de
 * abajo, exportado para que `ProjectWorkspace.tsx` pueda pintar del color del método los botones de
 * descarga que viven fuera de este componente (hermanos de `<Results mode="single">`, no dentro). */
export function accentStyleFor(method: Method): CSSProperties {
  return {
    '--accent': METHOD_ACCENT[method].color,
    '--accent-soft': `color-mix(in srgb, ${METHOD_ACCENT[method].color} 16%, transparent)`,
    '--accent-ink': METHOD_ACCENT[method].ink,
  } as CSSProperties;
}

type QuantRow = { name: string; value: number; rank: number };
type QuantView = {
  rows: QuantRow[]; order: number[]; tie: boolean; higherBetter: boolean; bar: (v: number) => number; fmt: (v: number) => string; unit: string;
  /** Solo VIKOR: nombres del conjunto de compromiso cuando NO hay ganador único (falla C1 o C2). Su #1 no cuenta como primer lugar. */
  soft?: string[];
};

/** Vista de ranking numérico para cualquiera de los 5 métodos que reciben la misma matriz de decisión
 * (TOPSIS/VIKOR/PROMETHEE/SAW/Fuzzy TOPSIS): se usa tanto para el método elegido del proyecto como para
 * ponerlos los 5 lado a lado en "Comparar los 6 métodos". AHP no pasa por aquí (no usa matriz de decisión)
 * y ELECTRE tampoco (no da un ranking total, ver elecSyn/electrePanel). */
function quantViewFor(
  key: Method,
  topSyn: ReturnType<typeof topsisSynthesis>,
  vikSyn: ReturnType<typeof vikorSynthesis>,
  promSyn: ReturnType<typeof prometheeSynthesis>,
  sawSyn: ReturnType<typeof sawSynthesis>,
  fuzzyTopSyn: ReturnType<typeof fuzzyTopsisSynthesis>,
): QuantView {
  if (key === 'topsis') {
    return {
      rows: topSyn.rows.map((r) => ({ name: r.name, value: r.c, rank: r.rank })), order: topSyn.order, tie: topSyn.tie,
      higherBetter: true, bar: (v: number) => v * 100, fmt: (v: number) => v.toFixed(4), unit: 'cercanía (0 a 1, mayor es mejor)',
    };
  }
  if (key === 'vikor') {
    return {
      rows: vikSyn.rows.map((r) => ({ name: r.name, value: r.q, rank: r.rank })), order: vikSyn.order, tie: vikSyn.tie,
      higherBetter: false, bar: (v: number) => (1 - v) * 100, fmt: (v: number) => 'Q ' + v.toFixed(4), unit: 'Q (0 a 1, MENOR es mejor)',
      soft: vikSyn.verdict && vikSyn.verdict.kind !== 'unique' ? vikSyn.verdict.set.map((i) => vikSyn.rows[i].name) : undefined,
    };
  }
  if (key === 'saw') {
    return {
      rows: sawSyn.rows, order: sawSyn.order, tie: sawSyn.tie,
      higherBetter: true, bar: (v: number) => v * 100, fmt: (v: number) => v.toFixed(4), unit: 'puntaje SAW (0 a 1, mayor es mejor)',
    };
  }
  if (key === 'fuzzy_topsis') {
    return {
      rows: fuzzyTopSyn.rows, order: fuzzyTopSyn.order, tie: fuzzyTopSyn.tie,
      higherBetter: true, bar: (v: number) => v * 100, fmt: (v: number) => 'CC ' + v.toFixed(4), unit: 'coef. de cercanía CC (0 a 1, mayor es mejor)',
    };
  }
  // promethee (también el "else" para 'ahp'/'electre', que nunca renderizan este resultado)
  const phis = promSyn.rows.map((r) => r.phi);
  const lo = Math.min(...phis, 0), hi = Math.max(...phis, 0);
  const span = hi - lo || 1;
  return {
    rows: promSyn.rows.map((r) => ({ name: r.name, value: r.phi, rank: r.rank })), order: promSyn.order, tie: promSyn.tie,
    higherBetter: true, bar: (v: number) => ((v - lo) / span) * 100, fmt: (v: number) => (v >= 0 ? '+' : '') + v.toFixed(3), unit: 'flujo neto φ (mayor es mejor)',
  };
}

function Table({ names, M, f }: { names: string[]; M: number[][]; f: (x: number) => string }) {
  return (
    <div className="tbl" style={{ marginTop: 8 }}>
      <table>
        <thead><tr><th></th>{names.map((x) => <th key={x} className="n">{x}</th>)}</tr></thead>
        <tbody>{M.map((r, i) => <tr key={i}><td>{names[i]}</td>{r.map((x, j) => <td key={j} className="n">{f(x)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export default function Results({ mode, criteria, alternatives, experts, judgments, method = 'ahp', weightingMethod = 'ahp', decisionMatrix, showPerExpert, projectTitle = 'Proyecto MCDA', projectObjective = '', onChangeV, onChangeCStar, onChangeDStar, onGoExperts, onGoProject, prio }: Props) {
  const [showReportModal, setShowReportModal] = useState(false);
  const idx = useMemo(() => indexJudgments(judgments), [judgments]);
  // Con CRITIC/Entropía los pesos salen de la matriz de decisión: los juicios guardados de una fase anterior (AHP) NO cuentan para nada
  // (ni expertos incluidos, ni CR, ni consenso, ni bloqueo). `weighting` es la ponderación efectiva (AHP como método ignora weightingMethod).
  const weighting = effectiveWeighting(method, weightingMethod);
  const objective = isObjectiveFor(method, weightingMethod);
  const withData = useMemo(() => expertsWithJudgments(experts.map((e) => e.id), idx, method, weightingMethod), [experts, idx, method, weightingMethod]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState(CRIT_SHEET);
  const [view, setView] = useState('agg');
  // Cómo se obtienen los pesos AHP. Vista local: no se guarda. El Excel exportado siempre calcula el eigenvector y muestra el promedio de columnas al lado.
  const [wm, setWm] = useState<WeightMethod>(DEFAULT_WEIGHT_METHOD);

  // useMemo: una identidad nueva en cada render reiniciaría los controles del simulador de sensibilidad (su efecto depende de los pesos base).
  const used = useMemo(() => withData.filter((id) => !excluded.has(id)), [withData, excluded]);
  // Pesos de AHP (siempre calculados para la pestaña de detalle por hoja)
  const ahpWeights = useMemo(() => sheetResult(CRIT_SHEET, criteria, used, idx, wm).agg.w, [criteria, used, idx, wm]);
  // Pesos efectivos para los métodos de ranking: CRITIC, Entropía o AHP según weighting_method
  // v de VIKOR y c*/d* de ELECTRE: el dueño los guarda en decision_matrix (onChangeV/onChangeCStar/
  // onChangeDStar); en la vista pública cada selector solo cambia una copia local, sin tocar el proyecto.
  const [vLocal, setVLocal] = useState<number | null>(null);
  const [cLocal, setCLocal] = useState<number | null>(null);
  const [dLocal, setDLocal] = useState<number | null>(null);
  // dmRaw = lo que ingresó el usuario (con tipo 'target' y su objetivo); dm = matriz EFECTIVA que leen todos los
  // métodos: cada criterio de tipo objetivo ya convertido en su distancia al objetivo, como costo (resolveTargets).
  const dmRaw = useMemo(() => {
    const base = normalizeMatrix(decisionMatrix);
    const overrides: Partial<DecisionMatrix> = {};
    if (!onChangeV && vLocal != null) overrides.vikorV = vLocal;
    if (!onChangeCStar && cLocal != null) overrides.electreCStar = cLocal;
    if (!onChangeDStar && dLocal != null) overrides.electreDStar = dLocal;
    return Object.keys(overrides).length ? { ...base, ...overrides } : base;
  }, [decisionMatrix, onChangeV, vLocal, onChangeCStar, cLocal, onChangeDStar, dLocal]);
  const dm = useMemo(() => resolveTargets(criteria, alternatives, dmRaw), [criteria, alternatives, dmRaw]);
  const noTarget = useMemo(() => missingTargets(criteria, dmRaw), [criteria, dmRaw]);
  const vEff = vikorV(dmRaw);
  const cEff = electreCStar(dmRaw);
  const dEff = electreDStar(dmRaw);
  const changeV = (v: number) => (onChangeV ? onChangeV(v) : setVLocal(v));
  const changeCStar = (c: number) => (onChangeCStar ? onChangeCStar(c) : setCLocal(c));
  const changeDStar = (d: number) => (onChangeDStar ? onChangeDStar(d) : setDLocal(d));
  // CRITIC y Entropía necesitan números: en Fuzzy TOPSIS las etiquetas se desdifusifican (centroide) antes de calcularlos.
  const dmNum = useMemo(() => (method === 'fuzzy_topsis' ? defuzzifyMatrix(dm, criteria, alternatives) : dm), [method, dm, criteria, alternatives]);
  const critWeights = useMemo(() => {
    if (method === 'ahp') return ahpWeights;
    if (weighting === 'critic') return criticWeights(criteria, alternatives, dmNum);
    if (weighting === 'entropy') return entropyWeights(criteria, alternatives, dmNum);
    return ahpWeights; // 'ahp' (default)
  }, [method, weighting, ahpWeights, criteria, alternatives, dmNum]);

  const topSyn = useMemo(() => topsisSynthesis(criteria, alternatives, dm, critWeights), [criteria, alternatives, dm, critWeights]);
  const vikSyn = useMemo(() => vikorSynthesis(criteria, alternatives, dm, critWeights), [criteria, alternatives, dm, critWeights]);
  const promSyn = useMemo(() => prometheeSynthesis(criteria, alternatives, dm, critWeights), [criteria, alternatives, dm, critWeights]);
  const elecSyn = useMemo(() => electreSynthesis(criteria, alternatives, dm, critWeights, cEff, dEff), [criteria, alternatives, dm, critWeights, cEff, dEff]);
  const sawSyn  = useMemo(() => sawSynthesis(criteria, alternatives, dm, critWeights), [criteria, alternatives, dm, critWeights]);
  const fuzzyTopSyn = useMemo(() => fuzzyTopsisSynthesis(criteria, alternatives, dm, critWeights), [criteria, alternatives, dm, critWeights]);
  const syn = useMemo(() => synthesis(criteria, alternatives, used, idx, wm), [criteria, alternatives, used, idx, wm]);
  // dmFilled: para fuzzy_topsis se verifica que haya etiquetas lingüísticas; para el resto, valores numéricos.
  const dmFilled = method === 'fuzzy_topsis'
    ? alternatives.some((a) => criteria.some((c) => typeof dm.values[a.id]?.[c.id] === 'string'))
    : alternatives.some((a) => criteria.some((c) => getCell(dm, a.id, c.id) != null));

  // Vista de ranking numérico del método elegido del proyecto (pestaña "Método elegido").
  const quant = useMemo(() => quantViewFor(method, topSyn, vikSyn, promSyn, sawSyn, fuzzyTopSyn), [method, topSyn, vikSyn, promSyn, sawSyn, fuzzyTopSyn]);
  // Los 6 métodos lado a lado (pestaña "Comparar"): AHP se calcula siempre desde los juicios (`syn`,
  // independiente de `method`) igual que los otros 5 se calculan siempre desde la matriz de decisión
  // (independiente de `method`) — un proyecto puede tener ambos tipos de datos a la vez si cambió de
  // método alguna vez, así que ningún método se excluye por el `method` actual, cada uno se apaga solo
  // vía su propio `tie` cuando no tiene datos suficientes (igual que ya hacía Fuzzy TOPSIS sin etiquetas).
  const compareViews = useMemo(() => {
    const maxAhpG = Math.max(...syn.rows.map((r) => r.g), 0.0001) * 1.08;
    const ahpView: QuantView & { key: Method; label: string; color: string } = {
      key: 'ahp' as const, label: 'AHP', color: 'var(--m-ahp)',
      rows: syn.rows.map((r) => ({ name: r.name, value: r.g, rank: r.rank })), order: syn.order, tie: syn.tie,
      higherBetter: true, bar: (v: number) => Math.max(0, Math.min(100, (v / maxAhpG) * 100)), fmt: (v: number) => v.toFixed(4), unit: 'prioridad global (mayor es mejor)',
    };
    const quantViews = QUANT_KEYS.map((k) => ({ key: k, label: METHOD_LABEL[k], color: METHOD_COLOR[k], ...quantViewFor(k, topSyn, vikSyn, promSyn, sawSyn, fuzzyTopSyn) }));
    // Con pesos objetivos el AHP de alternativas saldría de juicios viejos de expertos, que no cuentan: se omite la columna entera
    // (mismos datos y mismos pesos CRITIC/Entropía para todos los métodos que se comparan).
    return objective ? quantViews : [ahpView, ...quantViews];
  }, [objective, syn, topSyn, vikSyn, promSyn, sawSyn, fuzzyTopSyn]);
  const decidableViews = compareViews.filter((m) => !m.tie);
  // ELECTRE no da un ranking total, así que va en su propia columna: cuántas alternativas supera cada
  // una y por cuántas es superada. Su "primer lugar" solo existe si el NÚCLEO (kernel, ver electreKernel) es una única
  // alternativa: «que nadie la supere» no basta (una alternativa aislada o un ciclo A↔B lo falsean). Si no, participa en la
  // tabla pero no suma al consenso (como VIKOR sin ganador único).
  const electreCompare = useMemo(() => {
    const hasData = alternatives.length > 1 && alternatives.some((a) => criteria.some((c) => getCell(dm, a.id, c.id) != null));
    const out = alternatives.map((_, i) => elecSyn.result.outranks[i]?.filter(Boolean).length ?? 0);
    const inn = alternatives.map((_, i) => elecSyn.result.outranks.filter((row) => row[i]).length);
    const kernel = elecSyn.kernel;
    const winner = hasData && kernel.winner != null ? alternatives[kernel.winner].name : null;
    const inKernel = hasData && elecSyn.relations.length > 0 ? alternatives.map((_, i) => kernel.members.includes(i)) : alternatives.map(() => false);
    const isolated = alternatives.map((_, i) => kernel.isolated.includes(i));
    return { hasData, out, inn, winner, inKernel, isolated, kernel };
  }, [alternatives, criteria, dm, elecSyn]);
  // Datos de la gráfica Q vs v para el informe ejecutivo (VikorPanel calcula lo mismo para su propia gráfica, pero vive solo
  // en la pestaña VIKOR). Se usa `dm` (matriz efectiva, con los criterios objetivo ya convertidos), no `dmRaw`.
  const vikorReportChart = useMemo(() => {
    if (method !== 'vikor' || vikSyn.tie) return undefined;
    const { matrix, types } = vikorInputs(criteria, alternatives, dm);
    return {
      names: alternatives.map((a) => a.name),
      ends: vikorSensitivity(matrix, critWeights, types, [0, 1]),
      breaks: vikorFirstPlaceChanges(matrix, critWeights, types).map((b) => ({ v: b.v, from: alternatives[b.from].name, to: alternatives[b.to].name })),
      srq: vikSyn.rows,
    };
  }, [method, vikSyn.tie, vikSyn.rows, criteria, alternatives, dm, critWeights]);
  const totalMethods = decidableViews.length + (electreCompare.hasData ? 1 : 0);
  // Alternativa que más veces queda #1 entre los métodos con datos suficientes; null si hay empate en el conteo.
  const topWinner = useMemo(() => {
    const counts = new Map<string, number>();
    decidableViews.forEach((m) => {
      if (m.soft) return; // VIKOR sin ganador único: su #1 no cuenta como primer lugar
      const first = m.rows.find((r) => r.rank === 1);
      if (first) counts.set(first.name, (counts.get(first.name) ?? 0) + 1);
    });
    if (electreCompare.winner) counts.set(electreCompare.winner, (counts.get(electreCompare.winner) ?? 0) + 1);
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (!entries.length) return null;
    const [name, count] = entries[0];
    return entries.filter(([, c]) => c === count).length > 1 ? null : { name, count };
  }, [decidableViews, electreCompare]);

  const sheets = method === 'ahp'
    ? [{ key: CRIT_SHEET, label: 'Criterios' }, ...criteria.map((c) => ({ key: altSheet(c.id), label: c.name }))]
    : [{ key: CRIT_SHEET, label: 'Criterios' }];
  const items = sheetItems(sheet, criteria, alternatives);
  const r = useMemo(() => sheetResult(sheet, items, used, idx, wm), [sheet, items, used, idx, wm]);
  // Consistencia (CR) solo tiene sentido si hay juicios de expertos detrás de los pesos.
  const bad = objective ? [] : sheets.filter((s) => !sheetResult(s.key, sheetItems(s.key, criteria, alternatives), used, idx, wm).agg.ok).map((s) => s.label);
  const wmax = Math.max(...r.agg.w, 0.0001) * 1.12;

  const viewExpert = view !== 'agg' ? experts.find((e) => e.id === view) : undefined;
  const vm = viewExpert ? (idx[viewExpert.id]?.[sheet] ?? {}) : {};
  const vr = viewExpert ? sheetResult(sheet, items, [viewExpert.id], idx, wm) : null;

  // Consistencia y procedencia de los pesos para el informe ejecutivo. Solo cuando algo del informe sale de juicios por pares:
  // AHP (pesos + prioridades locales) o un método de matriz cuyos pesos se ponderaron con AHP. Con CRITIC/Entropía los pesos no
  // vienen de juicios y no se calcula nada de esto. Se reutiliza `sheetResult` (mismo cálculo que el detalle por hoja), no se re-implementa.
  const reportAhp = useMemo<ReportAhpInfo | undefined>(() => {
    if (method !== 'ahp' && weightingMethod !== 'ahp') return undefined;
    const sheetCr = (key: string, label: string): ReportSheetCr => {
      const its = sheetItems(key, criteria, alternatives);
      const res = sheetResult(key, its, used, idx, wm);
      return {
        label, n: its.length, cr: res.agg.cr, ok: res.agg.ok,
        answered: res.answered.reduce((a, b) => a + b, 0), total: pairsOf(its.length).length * used.length,
        perExpert: res.per.map((p, i) => ({ label: experts.find((e) => e.id === used[i])?.label ?? 'Experto', cr: p.cr, ok: p.ok })),
      };
    };
    return {
      weightMethod: wm,
      expertCount: used.length,
      criteriaSheet: sheetCr(CRIT_SHEET, 'Comparación de criterios'),
      // Las hojas de alternativas solo existen en AHP; en los otros métodos la matriz de decisión ocupa su lugar.
      altSheets: method === 'ahp' ? criteria.map((c) => sheetCr(altSheet(c.id), c.name)) : [],
      local: method === 'ahp' ? syn.rows.map((r) => r.loc) : [],
    };
  }, [method, weightingMethod, criteria, alternatives, used, idx, wm, experts, syn]);

  // Datos de las gráficas propias de cada método (aporte por criterio, flujos, distancias al ideal, escala difusa, pesos). Se
  // arman una vez y los usan por igual la pestaña de resultados y el informe ejecutivo.
  const methodCharts = useMemo<MethodChartData>(() => {
    const data: MethodChartData = { weights: criteria.map((c, i) => ({ name: c.name, weight: critWeights[i] ?? 0 })) };
    const names = criteria.map((c) => c.name);
    const matrix = alternatives.map((a) => criteria.map((c) => getCell(dm, a.id, c.id) ?? 0));
    const types = criteria.map((c) => getType(dm, c.id));
    if (method === 'ahp') {
      data.contribution = { criteria: names, unit: 'prioridad global', rows: syn.rows.map((r) => ({ name: r.name, parts: r.contrib, total: r.g, rank: r.rank })) };
    } else if (method === 'saw') {
      const r = saw(matrix, critWeights, types);
      data.contribution = {
        criteria: names, unit: 'puntaje SAW',
        rows: alternatives.map((a, i) => ({ name: a.name, parts: (r.normalized[i] ?? []).map((v, j) => (r.weights[j] ?? 0) * v), total: r.scores[i] ?? 0, rank: sawSyn.rows[i].rank })),
      };
    } else if (method === 'promethee') {
      const r = promethee(matrix, critWeights, types);
      data.flows = alternatives.map((a, i) => ({ name: a.name, plus: r.phiPlus[i] ?? 0, minus: r.phiMinus[i] ?? 0, net: r.phi[i] ?? 0, rank: promSyn.rows[i].rank }));
    } else if (method === 'topsis') {
      const r = topsis(matrix, critWeights, types);
      data.distances = { label: 'C', rows: alternatives.map((a, i) => ({ name: a.name, dPlus: r.distPlus[i] ?? 0, dMinus: r.distMinus[i] ?? 0, closeness: r.closeness[i] ?? 0, rank: topSyn.rows[i].rank })) };
    } else if (method === 'fuzzy_topsis') {
      data.distances = { label: 'CC', rows: alternatives.map((a, i) => ({ name: a.name, dPlus: fuzzyTopSyn.detail.dPlus[i] ?? 0, dMinus: fuzzyTopSyn.detail.dMinus[i] ?? 0, closeness: fuzzyTopSyn.rows[i].value, rank: fuzzyTopSyn.rows[i].rank })) };
      data.usedLabels = [...new Set(alternatives.flatMap((a) => criteria.map((c) => dm.values[a.id]?.[c.id]).filter((v): v is string => typeof v === 'string')))];
    }
    return data;
  }, [method, criteria, alternatives, dm, critWeights, syn, sawSyn, promSyn, topSyn, fuzzyTopSyn]);

  // Desglose completo de AHP (matrices, λmax, CI, RI, CR, media geométrica, iteración de potencias, síntesis): solo cuando hay juicios
  // detrás de los pesos (AHP o un método de matriz ponderado con AHP). Los números salen de las mismas funciones de lib/ahp.ts.
  const ahpBreakdown = useMemo(() => (!objective && (method === 'ahp' || weightingMethod === 'ahp')
    ? buildAhpBreakdownData({
      criteria, alternatives, experts: experts.filter((e) => used.includes(e.id)).map((e) => ({ id: e.id, label: e.label, role: e.role })),
      used, idx, weightMethod: wm, withAlternatives: method === 'ahp',
    })
    : undefined), [objective, method, weightingMethod, criteria, alternatives, experts, used, idx, wm]);
  const ahpRows = useMemo(() => syn.rows.map((r) => ({ name: r.name, loc: r.loc })), [syn]);
  // Comparación entre métodos (pantalla «Comparativa» y apéndice del informe): mismos rankings, parámetros y concordancia.
  const comparison = useMemo(() => {
    const methods: CompareMethod[] = compareViews.map((m) => ({
      key: m.key, label: m.label,
      ranks: m.tie ? null : alternatives.map((a) => m.rows.find((rr) => rr.name === a.name)?.rank ?? null),
      scores: alternatives.map((a) => m.rows.find((rr) => rr.name === a.name)?.value ?? null),
      scoreLabel: m.unit,
      params: describeMethodParams(m.key, { vikorV: vEff }),
      compromise: m.soft,
      unavailableReason: m.tie ? 'sin datos suficientes' : undefined,
    }));
    return {
      methods,
      electre: electreCompare.hasData ? electreCompareInfo(elecSyn) : undefined,
      weightsNote: weighting === 'ahp' ? 'AHP, de los juicios de los expertos' : WEIGHTING_SHORT[weighting],
    };
  }, [compareViews, alternatives, vEff, electreCompare, elecSyn, weighting]);

  // Con pesos objetivos el bloqueo depende SOLO de la matriz de decisión. Con pesos AHP en un método de matriz, sin juicios sobre los
  // criterios los pesos quedarían iguales en silencio: se bloquea y se manda a Expertos.
  const gate = resultsGate({ mode, method, weighting: weightingMethod, matrixFilled: dmFilled, expertCount: withData.length, decidableCount: decidableViews.length });
  if (gate) {
    if (gate === 'no-weight-judgments') {
      return (
        <div className="card" role="status">
          <h3 style={{ marginBottom: 6 }}>Faltan los pesos de los criterios</h3>
          <p className="muted" style={{ maxWidth: '72ch' }}>
            La ponderación de este proyecto es <b>AHP</b>: los pesos salen de la comparación por pares de criterios que hacen los expertos, y todavía nadie la ha hecho.
            Sin esos juicios los criterios pesarían igual (1/{criteria.length || 'n'}) y el ranking no reflejaría ninguna prioridad, así que no se calcula.
          </p>
          <div className="acts" style={{ marginTop: 10 }}>
            {onGoExperts && <button type="button" className="btn primary" onClick={onGoExperts}>Ir a Expertos</button>}
            {onGoProject && <button type="button" className="btn" onClick={onGoProject}>O usar CRITIC / Entropía (pestaña Proyecto)</button>}
          </div>
          {!onGoExperts && !onGoProject && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>El autor aún no ha registrado juicios de expertos sobre los criterios.</p>}
        </div>
      );
    }
    return (
      <div className="card muted">
        {gate === 'compare-nothing'
          ? (objective
            ? 'Todavía no hay datos para comparar: llena la matriz de decisión con valores reales (pestaña «Matriz de decisión»). Los pesos CRITIC/Entropía se calculan solos a partir de ella.'
            : 'Todavía no hay datos para comparar. Ningún método tiene información suficiente: llena los juicios por pares de al menos un experto (para AHP) y/o la matriz de decisión con valores reales (pestaña «Matriz de decisión», solo visible con un método distinto de AHP) para ver el ranking de cada uno lado a lado.')
          : gate === 'no-matrix'
            ? 'Todavía no hay datos en la matriz de decisión. Complétala en su pestaña para ver resultados.'
            : 'Todavía no hay juicios. Cuando tú o tus expertos respondan, aquí aparecerán los resultados.'}
      </div>
    );
  }

  // Panel de ELECTRE: se usa tanto en la vista "Método elegido" (si method === 'electre') como,
  // sin condición, dentro de "Comparar los 6 métodos" — ELECTRE no pasa por quantViewFor (no da
  // un ranking total), así que se muestra siempre aparte con sus relaciones/incomparables.
  const kernelNote = electreKernelText(elecSyn.names, elecSyn.kernel, elecSyn.relations.length > 0);
  const electrePanel = (
    <>
      <div className="card win">
        <span className="eyebrow">ELECTRE no da un solo ganador</span>
        <span className="big">Relación de superación ({elecSyn.relations.length} relación{elecSyn.relations.length === 1 ? '' : 'es'})</span>
        <span className="muted" style={{ fontSize: 13 }}>c* (concordancia mínima) {elecSyn.result.cStar.toFixed(2)} · d* (discordancia máxima) {elecSyn.result.dStar.toFixed(2)}.</span>
      </div>
      {/* Igual que el selector de v en VIKOR: c* y d* NO salen de los datos, los elige quien decide, y
          cambiarlos cambia el resultado (qué pares terminan con relación y cuáles quedan incomparables). */}
      <div className="card">
        <div className="eyebrow">Umbrales c* y d* de ELECTRE</div>
        <h3 style={{ margin: '4px 0 6px' }}>c* = {cEff.toFixed(2)} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· concordancia mínima</span> &nbsp;·&nbsp; d* = {dEff.toFixed(2)} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· discordancia máxima</span></h3>
        <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            <span>c* (más alto = más exigente: pide más evidencia a favor)</span>
            <input
              type="range" min="0" max="1" step="0.05" value={cEff} aria-label="Valor de c*"
              onChange={(e) => changeCStar(Math.round(parseFloat(e.target.value) * 100) / 100)}
              style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            <span>d* (más bajo = más exigente: tolera menos cualquier rechazo fuerte)</span>
            <input
              type="range" min="0" max="1" step="0.05" value={dEff} aria-label="Valor de d*"
              onChange={(e) => changeDStar(Math.round(parseFloat(e.target.value) * 100) / 100)}
              style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
          </label>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: '10px 0 0', maxWidth: '78ch' }}>
          <b>c* y d* no se calculan a partir de los datos: los eliges tú.</b> A diferencia de CR en AHP (que sí
          tiene un valor de referencia ampliamente citado, 0.10), no hay un estándar único para c*/d* — cámbialos
          y observa si cambian las relaciones y los pares incomparables de abajo; si es sensible a la elección,
          repórtalo en tu informe.
          {onChangeCStar || onChangeDStar
            ? ' Se guardan con el proyecto y los ven quienes abran el enlace público.'
            : ' Aquí solo cambian en tu pantalla: no modifican el proyecto.'}
        </p>
      </div>
      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Grafo de superación</h3>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 10px' }}>Mueve c* o d* arriba y mira aparecer o desaparecer flechas.</p>
        <ElectreGraph names={elecSyn.names} outranks={elecSyn.result.outranks} concordance={elecSyn.result.concordance} discordance={elecSyn.result.discordance} cStar={elecSyn.result.cStar} dStar={elecSyn.result.dStar} />
      </div>
      <div className="card">
        <h3 style={{ marginBottom: 10 }}>Quién supera a quién</h3>
        {elecSyn.relations.length ? (
          <ul style={{ paddingLeft: 18, fontSize: 14, display: 'grid', gap: 4 }}>
            {elecSyn.relations.map((rel) => <li key={rel.winner + rel.loser}><b>{rel.winner}</b> supera a <b>{rel.loser}</b></li>)}
          </ul>
        ) : <p className="muted">Ninguna alternativa supera a otra con estos umbrales — sube d* o baja c* si esperabas más relaciones.</p>}
        {elecSyn.incomparable.length > 0 && (
          <>
            <h3 style={{ marginTop: 16, marginBottom: 6 }}>Incomparables (ninguna supera a la otra)</h3>
            <ul style={{ paddingLeft: 18, fontSize: 14 }}>
              {elecSyn.incomparable.map(([a, b]) => <li key={a + b}>{a} y {b}</li>)}
            </ul>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>No es una falla del método: significa que los datos no alcanzan para preferir una sobre la otra con estos umbrales.</p>
          </>
        )}
      </div>
      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Núcleo: ¿hay una alternativa ganadora?</h3>
        <p style={{ fontSize: 14, margin: '0 0 6px' }}>{kernelNote.summary}</p>
        <ul style={{ paddingLeft: 18, fontSize: 13.5, display: 'grid', gap: 4, margin: 0 }}>
          {kernelNote.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>
      {mode === 'single' ? (
        <div className="card res" id="desglose">
          <ElectreBreakdown mode="screen" criteria={criteria} alternatives={alternatives} dm={dm} weights={critWeights} cStar={cEff} dStar={dEff} />
        </div>
      ) : (
        <div className="card res">
          <h3>Cómo se decide quién supera a quién</h3>
          <details open>
            <summary>Ver detalle</summary>
            <ElectreMatrices names={elecSyn.names} result={elecSyn.result} />
          </details>
        </div>
      )}
    </>
  );

  // En la vista de un solo método, --accent (y sus derivados) pasan a ser el color propio de ESE
  // método en vez del cian genérico del resto de la plataforma — así la tarjeta de ganador, las barras
  // de ranking y el botón de PDF se ven del color de AHP/TOPSIS/VIKOR/etc. En "Comparativa" se deja el
  // acento neutro: ahí cada método ya tiene su propio punto de color por fila/columna.
  const singleAccentStyle = mode === 'single' ? accentStyleFor(method) : undefined;

  return (
    <div className="panel" style={singleAccentStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 2 }}>
        {mode === 'single' ? (
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Síntesis y Ranking de Resultados</h2>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
              Ponderación por {WEIGHTING_SHORT[weighting]} · Algoritmo de ranking {METHOD_LABEL[method]} · <a href="#desglose">Ir al desglose de cálculo paso a paso ↓</a>
            </p>
          </div>
        ) : (
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Comparativa de los {compareViews.length + 1} métodos</h2>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
              Mismos datos y los mismos pesos de criterio ({weighting === 'ahp' ? 'AHP, de los juicios de los expertos' : `${WEIGHTING_SHORT[weighting]}, calculados de la matriz de decisión`}) — el ranking de cada algoritmo, lado a lado.
            </p>
          </div>
        )}
        {mode === 'single' && (
          <button
            type="button"
            className="btn sm primary"
            onClick={() => setShowReportModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
          >
            📄 Generar Informe Ejecutivo (PDF)
          </button>
        )}
      </div>

      {objective && method !== 'ahp' && (weighting === 'critic' || weighting === 'entropy') && (
        <WeightingCard
          weighting={weighting}
          rows={criteria.map((c, i) => ({ name: c.name, weight: critWeights[i] ?? 0 }))}
          alternativesCount={alternatives.length}
        />
      )}

      {!objective && (
      <div className="card">
        <div className="eyebrow">Expertos incluidos en el cálculo ({used.length} de {withData.length})</div>
        <div className="chips" style={{ marginTop: 8 }}>
          {withData.map((id) => {
            const e = experts.find((x) => x.id === id)!;
            const on = !excluded.has(id);
            return (
              <label key={id} className="pill neutral" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={on} onChange={() => setExcluded((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; })} /> {e.label}
              </label>
            );
          })}
          {!withData.length && <span className="muted" style={{ fontSize: 13 }}>Ningún experto ha pesado los criterios todavía — se usan pesos iguales.</span>}
        </div>
        {withData.length > 0 && used.length === 0 && (
          <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}><b>Excluiste a todos los expertos:</b> los criterios pesan igual (1/{criteria.length}). Marca al menos uno.</p>
        )}
      </div>
      )}

      {mode === 'single' && (method === 'electre' ? electrePanel : (
        <>
          <div className="card win">
            <span className="eyebrow">{method === 'vikor' && vikSyn.verdict && vikSyn.verdict.kind !== 'unique' ? 'Conjunto de compromiso (VIKOR): no hay un ganador único' : `Ganador (${METHOD_LABEL[method]})`}</span>
            {(method === 'ahp' ? syn.tie : quant.tie) ? <span className="big">Empate: aún no hay datos que distingan</span> : (
              method === 'vikor' && vikSyn.verdict && vikSyn.verdict.kind !== 'unique' ? (
                <>
                  <span className="big">{vikSyn.verdict.set.map((i) => vikSyn.rows[i].name).join(', ')}</span>
                  <span className="mono">{vikSyn.verdict.kind === 'two' ? 'falla la condición 2 (estabilidad)' : 'falla la condición 1 (ventaja aceptable)'} · v = {vEff.toFixed(2)} · mejor Q: {vikSyn.rows[vikSyn.order[0]].name} ({vikSyn.rows[vikSyn.order[0]].q.toFixed(4)})</span>
                </>
              ) : method === 'ahp' ? (
                <>
                  <span className="big">{syn.rows[syn.order[0]].name}</span>
                  <span className="mono">prioridad global {syn.rows[syn.order[0]].g.toFixed(4)}</span>
                </>
              ) : (
                <>
                  <span className="big">{quant.rows[quant.order[0]].name}</span>
                  <span className="mono">{quant.fmt(quant.rows[quant.order[0]].value)}</span>
                </>
              )
            )}
          </div>
          {bad.length > 0 && <div className="banner"><span><b>Revisa la consistencia</b> (CR ≥ 0.10) en: {bad.join(', ')}.</span></div>}
          {noTarget.length > 0 && <div className="banner"><span><b>Falta el valor objetivo</b> de: {noTarget.join(', ')}. Mientras no lo pongas, ese criterio no distingue entre alternativas (distancia 0 para todas). Complétalo en la pestaña «Matriz de decisión».</span></div>}

          {method === 'ahp' ? (
            <>
              <div className="card">
                <h3 style={{ marginBottom: 10 }}>Cuánto aporta cada criterio a la prioridad global</h3>
                {methodCharts.contribution && <ContributionBars {...methodCharts.contribution} />}
              </div>

              <div className="card">
                <h3>Tabla de síntesis</h3>
                <div className="tbl" style={{ marginTop: 8 }}>
                  <table>
                    <thead><tr><th>Alternativa</th>{criteria.map((c) => <th key={c.id} className="n">{c.name}</th>)}<th className="n">Global</th><th className="n">Rank</th></tr></thead>
                    <tbody>
                      <tr><td className="muted">Peso del criterio</td>{syn.wr.map((w, i) => <td key={i} className="n">{w.toFixed(4)}</td>)}<td /><td /></tr>
                      {syn.order.map((idx) => {
                        const row = syn.rows[idx];
                        const isWinner = row.rank === 1 && !syn.tie;
                        return (
                          <tr key={idx} className={isWinner ? 'row-winner' : ''}>
                            <td>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: isWinner ? 700 : 500, color: isWinner ? '#FFF' : undefined }}>
                                  {row.name}
                                </span>
                                {isWinner && (
                                  <span
                                    style={{
                                      fontSize: 10.5,
                                      fontFamily: 'var(--f-mono)',
                                      fontWeight: 700,
                                      color: 'var(--accent)',
                                      background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                                      border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
                                      padding: '2px 7px',
                                      borderRadius: 4,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.04em',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                    }}
                                  >
                                    ★ Ganador
                                  </span>
                                )}
                              </div>
                            </td>
                            {row.loc.map((x, j) => (
                              <td key={j} className="n" style={{ color: isWinner ? 'var(--ink)' : undefined, fontWeight: isWinner ? 600 : undefined }}>
                                {x.toFixed(4)}
                              </td>
                            ))}
                            <td className="n" style={{ fontWeight: 700, color: isWinner ? 'var(--accent)' : undefined }}>
                              {row.g.toFixed(4)}
                            </td>
                            <td className="n" style={{ fontWeight: 700, color: isWinner ? 'var(--accent)' : 'var(--muted)' }}>
                              {isWinner ? '👑 #1' : `#${row.rank}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="card">
                <AhpVsEqualWeights mode="screen" criteria={criteria.map((c) => c.name)} weights={syn.wr} alternatives={alternatives.map((a) => a.name)} local={syn.rows.map((r) => r.loc)} scores={syn.rows.map((r) => r.g)} />
              </div>
            </>
          ) : (
            <>
            <div className="card">
              <h3 style={{ marginBottom: 10 }}>Ranking {METHOD_LABEL[method]} — {quant.unit}</h3>
              {method === 'vikor' ? (
                <VikorRankBar rows={quant.rows} order={quant.order} soft={quant.soft} v={vEff} />
              ) : (
              <div className="stack">
                {quant.order.map((i) => {
                  const row = quant.rows[i];
                  const w = Math.max(0, Math.min(100, quant.bar(row.value)));
                  return (
                    <div className="wbar" key={row.name + i}>
                      <span className="nm">{row.rank}. {row.name}</span>
                      <div className="track"><div className="fill" style={{ width: `${w}%` }} /><span className="val" style={{ left: `${w}%` }}>{quant.fmt(row.value)}</span></div>
                    </div>
                  );
                })}
              </div>
              )}
              <details open style={{ marginTop: 12 }}>
                <summary>Ver matriz de decisión y pesos usados</summary>
                <h4>{objective ? `Peso de cada criterio (${WEIGHTING_SHORT[weighting]}, calculado de esta matriz)` : 'Peso de cada criterio (de la hoja Criterios)'}</h4>
                <div className="tbl" style={{ marginTop: 8 }}>
                  <table>
                    <thead><tr><th></th>{criteria.map((c) => <th key={c.id} className="n">{withUnit(c)}</th>)}</tr></thead>
                    <tbody><tr><td className="muted">Peso</td>{critWeights.map((w, i) => <td key={i} className="n">{w.toFixed(4)}</td>)}</tr></tbody>
                  </table>
                </div>
                <h4>Matriz de decisión (valores tal cual se ingresaron)</h4>
                <div className="tbl" style={{ marginTop: 8 }}>
                  <table>
                    <thead><tr><th></th>{criteria.map((c) => {
                      const k = getKind(dmRaw, c.id), t = getTarget(dmRaw, c.id);
                      return <th key={c.id} className="n">{withUnit(c)} · {k === 'max' ? 'beneficio' : k === 'min' ? 'costo' : t ? `objetivo ${t.value}${t.tol ? ` ± ${t.tol}` : ''}` : 'objetivo (falta el valor)'}</th>;
                    })}</tr></thead>
                    <tbody>
                      {alternatives.map((a) => (
                        <tr key={a.id}><td>{a.name}</td>{criteria.map((c) => {
                          const x = getCell(dmRaw, a.id, c.id), t = getTarget(dmRaw, c.id);
                          return <td key={c.id} className="n">{x ?? '—'}{x != null && t && getKind(dmRaw, c.id) === 'target' ? <span className="muted"> (distancia {Number(targetDistance(x, t.value, t.tol).toPrecision(6))})</span> : null}</td>;
                        })}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
            <div className="card">
              <h3 style={{ marginBottom: 4 }}>Gráficas del método</h3>
              {/* Con pesos objetivos las barras de pesos ya van en su propia tarjeta (con método y referencia): no se repiten. */}
              <MethodCharts method={method} data={methodCharts} showWeights={!objective} />
            </div>
            {method === 'vikor' && (
              <VikorPanel criteria={criteria} alternatives={alternatives} dm={dm} weights={critWeights} synth={vikSyn} v={vEff} onChangeV={changeV} persisted={!!onChangeV} />
            )}
            </>
          )}
        </>
      ))}

      {mode === 'compare' && (
        <>
          <div className="card win">
            <span className="eyebrow">Ganador más frecuente</span>
            {topWinner ? (
              <span className="big">{topWinner.name} <span className="muted mono" style={{ fontSize: 13, fontWeight: 500 }}>— {topWinner.count} de {totalMethods} métodos</span></span>
            ) : <span className="big">Sin consenso claro entre métodos</span>}
          </div>

            <div className="card">
              <h3 style={{ marginBottom: 12 }}>Posición por método (1 = mejor)</h3>
              <div className="tbl">
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      {compareViews.map((m) => (
                        <th key={m.key} className="n">
                          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 99, background: m.color, marginRight: 5 }} />{m.label}
                        </th>
                      ))}
                      {/* ELECTRE no ordena: va al final, con su propia lectura (ver la nota bajo la tabla) */}
                      <th className="n" title="ELECTRE no da posiciones: muestra a cuántas alternativas supera cada una (↑) y por cuántas es superada (↓)">
                        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 99, background: 'var(--m-electre)', marginRight: 5 }} />ELECTRE
                      </th>
                      <th className="n">Consenso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alternatives.map((a) => {
                      const ai = alternatives.indexOf(a);
                      const elecFirst = electreCompare.winner === a.name;
                      const firsts = compareViews.filter((m) => !m.tie && !m.soft && m.rows.find((row) => row.name === a.name)?.rank === 1).length + (elecFirst ? 1 : 0);
                      return (
                        <tr key={a.id}>
                          <td>{a.name}</td>
                          {compareViews.map((m) => {
                            const row = m.rows.find((rr) => rr.name === a.name);
                            const isFirst = !m.tie && !m.soft && row?.rank === 1;
                            const inSoft = !m.tie && !!m.soft?.includes(a.name);
                            return (
                              <td key={m.key} className="n">
                                {m.tie || !row
                                  ? <span className="muted mono">—</span>
                                  : <span className="mono" style={{ fontWeight: isFirst ? 700 : 500, color: isFirst ? 'var(--pass)' : 'var(--ink)' }} title={inSoft ? 'Conjunto de compromiso de VIKOR: no hay ganador único' : undefined}>#{row.rank}{inSoft ? ' ◆' : ''}</span>}
                              </td>
                            );
                          })}
                          <td className="n">
                            {electreCompare.hasData
                              ? <span className="mono" style={{ fontWeight: elecFirst ? 700 : 500, color: elecFirst ? 'var(--pass)' : 'var(--ink)' }} title={`Supera a ${electreCompare.out[ai]} y es superada por ${electreCompare.inn[ai]}${elecFirst ? ' — única alternativa del núcleo' : electreCompare.isolated[ai] ? ' — aislada: en el núcleo solo porque no se relaciona con nadie, no porque gane' : electreCompare.inKernel[ai] ? ' — en el núcleo, pero hay más de un bloque: sin ganador único' : ''}`}>{elecFirst ? '✓ ' : electreCompare.inKernel[ai] ? '○ ' : ''}{electreCompare.out[ai]}↑ {electreCompare.inn[ai]}↓</span>
                              : <span className="muted mono">—</span>}
                          </td>
                          <td className="n muted" style={{ fontSize: 12.5 }}><b className="mono" style={{ color: 'var(--ink)' }}>{firsts}/{totalMethods}</b> en 1er lugar</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {electreCompare.hasData && (
                <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
                  <b style={{ color: 'var(--ink)' }}>ELECTRE no da posiciones (#1, #2…)</b>, da relaciones entre pares: <b className="mono" style={{ color: 'var(--ink)' }}>2↑ 0↓</b> = supera a 2 alternativas y es superada por 0 (c* = {cEff.toFixed(2)}, d* = {dEff.toFixed(2)}); ○ = está en el núcleo de ELECTRE (no la supera nadie del núcleo), ✓ = es la única del núcleo. Suma al consenso solo si el núcleo es una única alternativa{electreCompare.winner ? '' : '; con estos umbrales no ocurre, y una alternativa que nadie supera pero que tampoco supera a nadie no cuenta como ganadora'}. El detalle está más abajo.
                </p>
              )}
              {compareViews.find((m) => m.key === 'vikor')?.soft && (
                <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
                  ◆ VIKOR no declara un ganador único con v = {vEff.toFixed(2)} (falla una de las condiciones de Opricovic &amp; Tzeng): su conjunto de compromiso es {compareViews.find((m) => m.key === 'vikor')?.soft?.join(', ')}, y su #1 no se cuenta como primer lugar en el consenso.
                </p>
              )}
            </div>

            <div className="card">
              <h3 style={{ marginBottom: 14 }}>Puntaje normalizado por método (barra más larga = mejor)</h3>
              <div style={{ display: 'grid', gap: 14 }}>
                {alternatives.map((a) => {
                  const ranksHere = compareViews
                    .filter((m) => !m.tie)
                    .map((m) => m.rows.find((row) => row.name === a.name)?.rank)
                    .filter((x): x is number => x != null);
                  const bestRank = ranksHere.length ? Math.min(...ranksHere) : null;
                  return (
                    <div key={a.id} style={{ display: 'grid', gap: 8, paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {a.name}
                        {bestRank && <span className="muted mono" style={{ fontSize: 11, background: 'var(--surface2)', border: '1px solid var(--line)', borderRadius: 99, padding: '1px 8px' }}>mejor posición #{bestRank}</span>}
                      </div>
                      {compareViews.map((m) => {
                        const row = m.rows.find((rr) => rr.name === a.name);
                        if (m.tie || !row) {
                          return (
                            <div key={m.key} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 72px', gap: 10, alignItems: 'center' }}>
                              <span className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 99, background: m.color, opacity: 0.35 }} />{m.label}
                              </span>
                              <span className="muted mono" style={{ fontSize: 11.5 }}>Sin datos suficientes</span>
                              <span />
                            </div>
                          );
                        }
                        const pct = Math.max(0, Math.min(100, m.bar(row.value)));
                        return (
                          <div key={m.key} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 72px', gap: 10, alignItems: 'center' }}>
                            <span className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 99, background: m.color }} />{m.label}
                            </span>
                            <div style={{ position: 'relative', height: 16, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${pct}%`, background: m.color, borderRadius: 3 }} />
                            </div>
                            <span className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{m.fmt(row.value)}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card">
              <MethodComparisonReport mode="screen" alternatives={alternatives.map((a) => a.name)} {...comparison} />
            </div>

            {electrePanel}
        </>
      )}

      {mode === 'single' && (
        <>
          {!objective && (
            <div className="card">
              <label className="lbl" htmlFor="wm">Cálculo de los pesos AHP</label>
              <select id="wm" value={wm} onChange={(e) => setWm(e.target.value as WeightMethod)}>
                <option value="eigenvector">Eigenvector principal de Saaty (predeterminado; el de AHP-OS y los artículos)</option>
                <option value="mean">Promedio de columnas normalizadas (procedimiento a mano del curso)</option>
              </select>
              <p className="hint" style={{ marginTop: 8 }}>
                Son iguales si la matriz es consistente; con juicios algo inconsistentes el promedio de columnas es una aproximación y puede
                diferir en centésimas. El Excel exportado calcula el eigenvector con fórmulas vivas (iteración de potencias) y muestra el promedio de
                columnas al lado para compararlos.
                {r.agg.diff > 0.0005 && <> En la hoja que estás viendo la diferencia máxima entre ambos es {r.agg.diff.toFixed(4)}.</>}
              </p>
            </div>
          )}
          {/* Simulador de Sensibilidad What-If */}
          <SensitivitySimulator
            criteria={criteria}
            alternatives={alternatives}
            decisionMatrix={dm}
            baseWeights={critWeights}
            method={method as MethodKey}
            ahpSynthRows={syn.rows.map((r) => ({ name: r.name, score: r.g, rank: r.rank, loc: r.loc }))}
            derivedWeights={objective ? WEIGHTING_SHORT[weighting] : undefined}
          />

      <SensitivityReport
        mode="screen" method={method} criteria={criteria} alternatives={alternatives} dm={dm} weights={critWeights}
        ahpRows={method === 'ahp' ? ahpRows : undefined} accent={METHOD_ACCENT[method].color}
      />

      {/* Detalle por hoja = juicios por pares, CR, λmax y consenso de los expertos: con pesos objetivos no existe nada de eso que mostrar. */}
      {!objective && (
      <div className="card res">
        <h3>Detalle por hoja</h3>
        <div className="sheetnav" role="group" aria-label="Hoja">
          {sheets.map((s) => <button key={s.key} type="button" aria-pressed={s.key === sheet} onClick={() => setSheet(s.key)}><b>{s.label}</b></button>)}
        </div>
        {showPerExpert && (
          <div>
            <label className="lbl" htmlFor="vista">Vista</label>
            <select id="vista" value={view} onChange={(e) => setView(e.target.value)}>
              <option value="agg">Agregado de los expertos incluidos</option>
              {experts.map((e) => <option key={e.id} value={e.id}>Solo lo que respondió: {e.label}</option>)}
            </select>
          </div>
        )}
        {viewExpert && vr ? (
          <>
            <div className="chips"><span className={'pill' + (vr.agg.ok ? '' : ' warn')}>{viewExpert.label}: CR {vr.agg.cr.toFixed(3)} {vr.agg.ok ? '✓' : '✗'}</span></div>
            {items.map((it, i) => <div className="wbar" key={it.id}><span className="nm">{it.name}</span><div className="track"><div className="fill" style={{ width: `${(vr.agg.w[i] / (Math.max(...vr.agg.w) * 1.12)) * 100}%` }} /><span className="val" style={{ left: `${(vr.agg.w[i] / (Math.max(...vr.agg.w) * 1.12)) * 100}%` }}>{vr.agg.w[i].toFixed(4)}</span></div></div>)}
            <details open><summary>Lo que respondió, en palabras</summary>
              <ul style={{ paddingLeft: 18, fontSize: 14 }}>
                {pairsOf(items.length).map(([i, j]) => <li key={i + '-' + j}>{items[i].name} vs {items[j].name}: {phrase(items, i, j, getV(vm, items[i].id, items[j].id))}</li>)}
              </ul>
            </details>
          </>
        ) : (
          <>
            <div className="chips">
              <span className={'pill' + (r.agg.ok ? '' : ' warn')}>{r.agg.ok ? 'Consistente' : 'Inconsistente'} · CR {r.agg.cr.toFixed(4)}</span>
              {r.per.map((p, i) => <span key={i} className={'pill ' + (p.ok ? 'neutral' : 'warn')}>{experts.find((e) => e.id === used[i])?.label}: CR {p.cr.toFixed(3)}{p.ok ? '' : ' ✗'}</span>)}
            </div>
            {items.map((it, i) => <div className="wbar" key={it.id}><span className="nm">{it.name}</span><div className="track"><div className="fill" style={{ width: `${(r.agg.w[i] / wmax) * 100}%` }} /><span className="val" style={{ left: `${(r.agg.w[i] / wmax) * 100}%` }}>{r.agg.w[i].toFixed(4)}</span></div></div>)}
            <div className="metrics">
              <div><b>{r.agg.lam.toFixed(4)}</b><small>λ max</small></div><div><b>{r.agg.ci.toFixed(4)}</b><small>CI</small></div>
              <div><b>{r.agg.ri}</b><small>RI (n={r.agg.n})</small></div><div><b>{r.agg.cr.toFixed(4)}</b><small>CR</small></div>
            </div>
            <GroupDiagnostics items={items} result={r} method={wm} />
            <details><summary>Ver procedimiento</summary>
              <h4>Matriz agregada (media geométrica)</h4><Table names={items.map((x) => x.name)} M={aggMatrix(items, r.maps)} f={fmt} />
              <h4>Matriz normalizada</h4><Table names={items.map((x) => x.name)} M={r.agg.N} f={(x) => x.toFixed(4)} />
            </details>
          </>
        )}
      </div>
      )}

      {/* Desglose de cálculo paso a paso (como en las diapositivas 1 a 4 del curso): de dónde salen los criterios, cómo se obtuvieron los
          pesos y cada matriz intermedia del método. Los mismos componentes con los mismos números van en el apéndice del informe. */}
      <div id="desglose" style={{ display: 'grid', gap: 14 }}>
        {prio && prio.cands.length > 0 && <PrioBreakdown prio={prio} mode="screen" criteriaCount={criteria.length} />}
        {objective && (weighting === 'critic' || weighting === 'entropy') && method !== 'ahp' && (
          <WeightsBreakdown method={weighting} criteria={criteria} alternatives={alternatives} dm={dmNum} mode="screen" />
        )}
        {ahpBreakdown && <AhpBreakdown mode="screen" data={ahpBreakdown} current={6} />}
        {method === 'topsis' && <TopsisBreakdown mode="screen" criteria={criteria} alternatives={alternatives} decisionMatrix={dmRaw} weights={critWeights} weightsSource={objective ? WEIGHTING_SHORT[weighting] : 'la hoja Criterios (AHP)'} />}
        {method === 'vikor' && <VikorBreakdown mode="screen" criteria={criteria} alternatives={alternatives} decisionMatrix={dmRaw} weights={critWeights} v={vEff} weightsSource={objective ? WEIGHTING_SHORT[weighting] : 'la hoja Criterios (AHP)'} />}
        {method === 'promethee' && <PrometheeBreakdown mode="screen" criteria={criteria} alternatives={alternatives} dm={dm} weights={critWeights} />}
      </div>

      {showReportModal && (
        <ExecutiveReportModal
          projectTitle={projectTitle}
          projectObjective={projectObjective}
          method={method as MethodKey}
          criteria={criteria}
          alternatives={alternatives}
          decisionMatrix={dmRaw}
          weights={critWeights}
          weightingMethod={method === 'ahp' ? 'ahp' : weightingMethod}
          ahp={reportAhp}
          // ELECTRE no da ranking total: quant.rows caería en la rama de PROMETHEE y el informe mostraría flujos φ ajenos.
          // Su informe se arma con la relación de superación (`electre`).
          rankingRows={
            method === 'electre' ? []
              : method === 'ahp'
                ? syn.rows.map((r) => ({ name: r.name, score: r.g, rank: r.rank }))
                : quant.rows.map((r) => ({ name: r.name, score: r.value, rank: r.rank }))
          }
          electre={method === 'electre' ? { names: elecSyn.names, outranks: elecSyn.result.outranks, concordance: elecSyn.result.concordance, discordance: elecSyn.result.discordance, cStar: elecSyn.result.cStar, dStar: elecSyn.result.dStar } : undefined}
          vikorChart={vikorReportChart}
          charts={methodCharts}
          vikorV={method === 'vikor' ? vEff : undefined}
          prio={prio}
          ahpBreakdown={ahpBreakdown}
          comparison={comparison}
          compromiseSet={method === 'vikor' && vikSyn.verdict && vikSyn.verdict.kind !== 'unique' ? vikSyn.verdict.set.map((i) => vikSyn.rows[i].name) : undefined}
          onClose={() => setShowReportModal(false)}
        />
      )}
        </>
      )}
    </div>
  );
}
