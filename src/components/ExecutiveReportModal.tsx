'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Criterion, Alternative, DecisionMatrix, WeightingMethod } from '@/lib/types';
import ElectreGraph from './ElectreGraph';
import ElectrePairTable from './ElectrePairTable';
import { electreKernel, electreKernelText, type ElectreResult } from '@/lib/electre';
import MethodCharts, { type MethodChartData } from './MethodCharts';
import WeightBars from './WeightBars';
import VikorSensitivityChart from './VikorSensitivityChart';
import VikorSRQChart from './VikorSRQChart';
import { METHOD_SPECS, WEIGHTING_SPECS, type MethodKey } from './ScientificMethodModal';
import { getCell, getKind, getTarget, resolveTargets } from '@/lib/topsis';
import { LINGUISTIC_ALT, defuzzifyMatrix } from '@/lib/fuzzy_topsis';
import type { PrioState } from '@/lib/prio';
import type { AhpBreakdownData } from '@/lib/ahpBreakdown';
import type { ElectreCompareInfo } from '@/lib/rankCompare';
import AhpBreakdown from './calc/AhpBreakdown';
import AhpVsEqualWeights from './calc/AhpVsEqualWeights';
import HierarchyTree from './calc/HierarchyTree';
import TopsisBreakdown from './calc/TopsisBreakdown';
import VikorBreakdown from './calc/VikorBreakdown';
import ElectreBreakdown from './calc/ElectreBreakdown';
import PrometheeBreakdown from './calc/PrometheeBreakdown';
import PrioBreakdown from './calc/PrioBreakdown';
import WeightsBreakdown from './calc/WeightsBreakdown';
import SensitivityReport from './calc/SensitivityReport';
import MethodComparisonReport, { type CompareMethod } from './calc/MethodComparisonReport';
import { METHOD_EXTRA_REFS, REFS, WEIGHTING_REFS, apa, isObjectiveWeighting } from '@/lib/references';
import type { WeightMethod } from '@/lib/ahp';
import { APP_VERSION, APP_DOI } from '@/lib/version';

/** Colores del informe: el modal es siempre blanco (también en impresión), pero los gráficos leen las variables del tema de la app;
 * en modo oscuro `--ink` sería casi blanco sobre papel blanco. Se redefinen aquí en claro, con los tonos de método oscurecidos
 * (el cian de TOPSIS, el ámbar de ELECTRE y el turquesa de Fuzzy TOPSIS de la app casi no se ven sobre blanco) y `--other`, el gris
 * de fondo de las tramas de ContributionBars (sin él hereda el gris oscuro del tema oscuro). */
const REPORT_VARS = {
  '--ink': '#0F172A', '--muted': '#475569', '--line': '#CBD5E1', '--surface': '#FFFFFF', '--surface2': '#F1F5F9',
  '--pass': '#059669', '--accent': '#0284C7', '--other': '#CBD5E1',
  '--s1': '#2563EB', '--s2': '#EA580C', '--s3': '#059669', '--s4': '#A16207', '--s5': '#DB2777',
  '--m-topsis': '#0891B2', '--m-vikor': '#059669', '--m-electre': '#B45309', '--m-promethee': '#E11D48', '--m-saw': '#EA580C',
  '--m-fuzzy': '#0F766E', '--m-ahp': '#7C3AED',
  // los componentes de desglose (components/calc) usan también estas: sin ellas heredarían los tonos claros del tema oscuro sobre papel blanco
  '--pa': '#4F46E5', '--warn-t': '#B45309', '--pass-t': '#047857',
} as CSSProperties;

/** El informe recibe los datos de ELECTRE sueltos; la tabla por pares espera el mismo objeto que devuelve electre(). */
const electreResultShape = (e: { outranks: boolean[][]; concordance: number[][]; discordance: number[][]; cStar: number; dStar: number; names: string[] }): ElectreResult => ({
  n: e.names.length, outranks: e.outranks, concordance: e.concordance, discordance: e.discordance, cStar: e.cStar, dStar: e.dStar, weights: [], ranges: [], g: [],
});

/** Consistencia de UNA hoja de comparaciones por pares (criterios, o las alternativas bajo un criterio). */
export type ReportSheetCr = {
  label: string;
  /** Elementos comparados (matriz n×n). Con n < 3 el CR es siempre 0 (RI = 0), no informa nada. */
  n: number;
  cr: number;
  /** CR < 0.10 (Saaty). */
  ok: boolean;
  /** Pares con juicio registrado, sumados entre los expertos incluidos, y los que habría con todos respondidos. */
  answered: number;
  total: number;
  /** CR de cada experto por separado: el agregado puede verse consistente aunque un experto no lo sea. */
  perExpert: { label: string; cr: number; ok: boolean }[];
};

/** Todo lo del informe que sale de juicios por pares (AHP). Solo se pasa cuando hay juicios detrás: AHP, o un método de matriz
 * con pesos por AHP. */
export type ReportAhpInfo = {
  weightMethod: WeightMethod;
  /** Expertos incluidos en el cálculo (agregados por media geométrica). */
  expertCount: number;
  criteriaSheet: ReportSheetCr;
  /** Una por criterio. Vacío en los métodos de matriz (no tienen hojas de alternativas). */
  altSheets: ReportSheetCr[];
  /** Prioridad local de cada alternativa (fila, en el orden de `alternatives`) bajo cada criterio (columna). Vacío fuera de AHP. */
  local: number[][];
};

/** Qué mide el puntaje de cada método y hacia dónde es mejor: un mismo número (0.62) significa cosas opuestas en TOPSIS y en VIKOR. */
const SCORE: Record<MethodKey, { label: string; short: string; fmt: (v: number) => string }> = {
  ahp: { label: 'Prioridad global (mayor es mejor)', short: 'Prioridad global', fmt: (v) => v.toFixed(4) },
  topsis: { label: 'Cercanía relativa C (0 a 1, mayor es mejor)', short: 'Cercanía relativa C', fmt: (v) => v.toFixed(4) },
  vikor: { label: 'Índice Q (0 a 1, MENOR es mejor)', short: 'Índice Q', fmt: (v) => v.toFixed(4) },
  promethee: { label: 'Flujo neto φ (mayor es mejor)', short: 'Flujo neto φ', fmt: (v) => (v >= 0 ? '+' : '') + v.toFixed(4) },
  saw: { label: 'Puntaje SAW (0 a 1, mayor es mejor)', short: 'Puntaje SAW', fmt: (v) => v.toFixed(4) },
  fuzzy_topsis: { label: 'Coeficiente de cercanía CC (0 a 1, mayor es mejor)', short: 'Coeficiente CC', fmt: (v) => v.toFixed(4) },
  // ELECTRE no tiene puntaje: la entrada existe solo para completar el Record; el informe usa la relación de superación.
  electre: { label: 'Sin puntaje (relación de superación)', short: 'Sin puntaje', fmt: (v) => v.toFixed(4) },
};

/** Por qué la mejor clasificada lo es, en los términos del método (la frase genérica «compromiso más favorable» no vale para todos). */
const WINNER_NOTE: Partial<Record<MethodKey, string>> = {
  ahp: 'tiene la mayor prioridad global: la suma, sobre todos los criterios, del peso del criterio por la prioridad local de la alternativa en él.',
  topsis: 'es la más cercana a la solución ideal positiva y la más lejana de la ideal negativa.',
  vikor: 'tiene el menor índice Q, que combina la utilidad de grupo (S) y el arrepentimiento individual máximo (R).',
  promethee: 'tiene el mayor flujo neto φ: la diferencia entre cuánto supera a las demás y cuánto la superan.',
  saw: 'obtiene la mayor suma ponderada de sus valores normalizados.',
  fuzzy_topsis: 'tiene el mayor coeficiente de cercanía CC a la solución ideal difusa, con las evaluaciones lingüísticas como números difusos triangulares.',
};

/** Fórmula de los pesos en una línea, para que quien revisa el informe vea de qué cálculo salen sin abrir la plataforma. */
const WEIGHT_FORMULA: Record<WeightingMethod, string> = {
  ahp: 'A · w = λ_max · w (w = eigenvector principal de la matriz de comparaciones por pares, Σ w_j = 1)',
  critic: 'C_j = σ_j · Σ_k (1 − ρ_jk),   w_j = C_j / Σ_k C_k',
  entropy: 'E_j = −(1/ln m) · Σ_i p_ij · ln p_ij,   w_j = (1 − E_j) / Σ_k (1 − E_k)',
};

const SEC_H3: CSSProperties = { fontSize: 15, fontWeight: 700, margin: '0 0 8px', color: '#0F172A', borderBottom: '1px solid #CBD5E1', paddingBottom: 4 };
const NOTE_P: CSSProperties = { fontSize: 12.5, color: '#475569', margin: '8px 0 0' };
const TH: CSSProperties = { padding: '8px 10px' };
const THR: CSSProperties = { padding: '8px 10px', textAlign: 'right' };
const THEAD_TR: CSSProperties = { background: '#F1F5F9', textAlign: 'left', borderBottom: '2px solid #94A3B8' };
const MONO: CSSProperties = { fontFamily: 'ui-monospace, Menlo, Consolas, monospace' };
const BOX: CSSProperties = { fontSize: 12, color: '#0F172A', background: '#F8FAFC', padding: '8px 12px', borderRadius: 4, border: '1px solid #CBD5E1' };
const LINGUISTIC_NAME: Record<string, string> = { VP: 'Muy pobre', P: 'Pobre', F: 'Regular', G: 'Bueno', VG: 'Muy bueno' };

/** Clave de deduplicación de una referencia APA: «Autor (año)», hasta el primer paréntesis de cierre. Evita listar dos veces la misma
 * fuente cuando la cita a mano de METHOD_SPECS y la generada de references.ts difieren en un espacio. */
const refKey = (r: string) => r.slice(0, r.indexOf(')') + 1) || r;

/** Cadena segura para `content: "…"` de CSS (el título del proyecto en el pie de página impreso). */
const cssString = (t: string) => t.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('<', '\\3C ').replaceAll(/[\r\n]+/g, ' ');

/** Sección numerada. `rpt-sec` deja que el CSS de impresión (globals.css) impida títulos huérfanos al pie de una página. */
function Sec({ no, title, children }: { no: number; title: string; children: ReactNode }) {
  return (
    <section className="rpt-sec">
      <h3 className="rpt-h" style={SEC_H3}>{no}. {title}</h3>
      {children}
    </section>
  );
}

interface ExecutiveReportModalProps {
  projectTitle: string;
  projectObjective: string;
  method: MethodKey;
  criteria: Criterion[];
  alternatives: Alternative[];
  decisionMatrix: DecisionMatrix;
  weights: number[];
  /** De dónde salen los pesos: juicios de expertos (AHP) o la propia matriz (CRITIC/Entropía). En AHP siempre 'ahp'. Default 'ahp'. */
  weightingMethod?: WeightingMethod;
  /** Consistencia (CR), expertos y prioridades locales de AHP. Solo AHP o pesos por AHP; sin él el informe no afirma nada sobre juicios. */
  ahp?: ReportAhpInfo;
  /** Los datos o juicios del proyecto son de ejemplo (caso del curso cargado con el botón «ejemplo»): el informe lo declara con un
   * aviso, para que nadie lo presente como el dictamen de un panel real. La plataforma aún no guarda esa marca en el proyecto; ver
   * el informe de la revisión. */
  exampleData?: boolean;
  rankingRows: { name: string; score: number; rank: number }[];
  /** Solo VIKOR: v usado (se declara en el informe, no sale de los datos). */
  vikorV?: number;
  /** Solo VIKOR: conjunto de compromiso cuando NO hay ganador único (falla C1 o C2 de Opricovic & Tzeng 2004). */
  compromiseSet?: string[];
  /** Solo VIKOR: datos de la gráfica Q vs v (rectas en v = 0 y v = 1) y los v donde cambia el 1er lugar. Sin él no se dibuja. */
  vikorChart?: { names: string[]; ends: { q: number[] }[]; breaks: { v: number; from: string; to: string }[]; srq?: { name: string; s: number; r: number; q: number; rank: number }[] };
  /** Datos de las gráficas propias del método (ver MethodCharts). */
  charts?: MethodChartData;
  /** Solo ELECTRE: relación de superación. ELECTRE no da ranking total, así que en vez de `rankingRows` el informe usa esto. */
  electre?: { names: string[]; outranks: boolean[][]; concordance: number[][]; discordance: number[][]; cStar: number; dStar: number };
  /** Parte A (priorización de criterios), si el proyecto la tiene: de dónde salen los criterios. */
  prio?: PrioState;
  /** Matrices y pasos de AHP (agregada, por experto, normalizada, λmax, CI, RI, CR, síntesis). Solo AHP o pesos por AHP. */
  ahpBreakdown?: AhpBreakdownData;
  /** Rankings de los métodos calculados sobre las mismas alternativas, para contrastarlos (Spearman/Kendall, incomparables de ELECTRE). */
  comparison?: { methods: CompareMethod[]; electre?: ElectreCompareInfo; weightsNote?: string };
  onClose: () => void;
}

export default function ExecutiveReportModal({
  projectTitle,
  projectObjective,
  method,
  criteria,
  alternatives,
  decisionMatrix,
  weights,
  weightingMethod = 'ahp',
  ahp,
  exampleData = false,
  rankingRows,
  vikorV,
  compromiseSet,
  vikorChart,
  charts,
  electre,
  prio,
  ahpBreakdown,
  comparison,
  onClose,
}: ExecutiveReportModalProps) {
  // El fallback solo protege de un `method` inesperado en la base; con los 7 valores del tipo Method siempre existe su ficha.
  const methodDoc = METHOD_SPECS[method] || METHOD_SPECS.topsis;
  const methodLabel = methodDoc.name.split(' · ')[0];
  const score = SCORE[method] ?? SCORE.topsis;
  const isAhp = method === 'ahp';
  const isFuzzy = method === 'fuzzy_topsis';
  const winner = rankingRows.find((r) => r.rank === 1) || rankingRows[0];
  // Empate en el 1.er lugar (todas iguales por falta de datos, o dos que empatan): no hay «mejor clasificada» que destacar.
  const tied = rankingRows.filter((r) => r.rank === 1);
  const inCompromise = (name: string) => !!compromiseSet && compromiseSet.length > 1 && compromiseSet.includes(name);
  // La matriz de decisión existe solo donde el método la usa. AHP trabaja con juicios por pares: los valores que queden en
  // `decision_matrix` (de un método anterior) no son datos de este análisis y no deben aparecer.
  const showMatrix = !isAhp;
  // AHP como método de ranking ignora `weightingMethod`: siempre deriva sus propios pesos de los juicios.
  const wm: WeightingMethod = isAhp ? 'ahp' : weightingMethod;
  const weightsFromJudgments = wm === 'ahp';
  const wRef = WEIGHTING_REFS[wm];
  // Secciones que existen para este método, en orden: la numeración se deriva de aquí para que siga siendo consecutiva.
  const hasPrio = !!prio && prio.cands.length > 0;
  // Comparación entre métodos: solo si hay al menos dos rankings con datos (o la relación de ELECTRE) que contrastar.
  const showComparison = !!comparison && (comparison.methods.filter((m) => m.ranks).length >= 2 || !!comparison.electre);
  const sections = [
    ...(hasPrio ? ['selection'] : []), 'hierarchy', 'weights', ...(isAhp ? ['consistency', 'local'] : ['matrix']), electre ? 'outranking' : 'ranking',
    'sensitivity', ...(showComparison ? ['comparison'] : []), 'calc', 'method', 'limits', 'refs',
  ];
  const secNo = (k: string) => sections.indexOf(k) + 1;
  // Matriz numérica con la que se calcularon todos los métodos: criterios «objetivo» ya convertidos en distancia (resolveTargets es idempotente)
  // y, en Fuzzy TOPSIS, las etiquetas desdifusificadas (solo CRITIC/Entropía las necesitan como números).
  const dmEff = resolveTargets(criteria, alternatives, decisionMatrix);
  const dmNum = isFuzzy ? defuzzifyMatrix(dmEff, criteria, alternatives) : dmEff;
  const weightsSource = wm === 'ahp' ? 'la hoja Criterios (AHP)' : WEIGHTING_REFS[wm].label;
  const rankedAlts = rankingRows.length ? rankingRows.map((r) => ({ name: r.name, score: r.score, rank: r.rank })) : alternatives.map((a) => ({ name: a.name }));

  /** Regla de lectura del criterio. Fuzzy TOPSIS no tiene tipo «objetivo» (la matriz lingüística no lo admite) y trata cualquier
   * tipo que no sea max como costo, igual que `getType` en la biblioteca. */
  const ruleText = (critId: string) => {
    const k = getKind(decisionMatrix, critId);
    if (isFuzzy) return k === 'max' ? 'Maximizar (Beneficio)' : 'Minimizar (Costo)';
    if (k === 'min') return 'Minimizar (Costo)';
    if (k === 'target') {
      const t = getTarget(decisionMatrix, critId);
      return t ? `Objetivo ${t.value}${t.tol ? ` ± ${t.tol}` : ''} (minimizar la distancia)` : 'Objetivo (sin valor definido)';
    }
    return 'Maximizar (Beneficio)';
  };

  /** Celda de la matriz. Fuzzy TOPSIS guarda etiquetas (texto), no números; `getCell` solo lee números y las daría por vacías. */
  const cellText = (altId: string, critId: string) => {
    if (isFuzzy) {
      const v = decisionMatrix.values[altId]?.[critId];
      return typeof v === 'string' && v in LINGUISTIC_ALT ? v : 'F*';
    }
    const val = getCell(decisionMatrix, altId, critId);
    return val != null ? val : '—';
  };

  /** Estado legible de una hoja de AHP. Sin juicios (o con n < 3) el CR sale 0, pero eso no significa «consistente». */
  const sheetStatus = (sh: ReportSheetCr) => {
    if (sh.answered === 0) return { text: 'Sin juicios registrados: el CR no informa', color: '#475569', bold: false };
    if (sh.n < 3) return { text: 'Con menos de 3 elementos siempre es consistente', color: '#475569', bold: false };
    return sh.ok
      ? { text: 'Consistente (CR < 0.10)', color: '#15803D', bold: false }
      : { text: 'Revisar: CR ≥ 0.10, hay juicios contradictorios', color: '#B45309', bold: true };
  };
  const crText = (sh: ReportSheetCr) => {
    const st = sheetStatus(sh);
    return sh.answered === 0 || sh.n < 3
      ? `Consistencia de los juicios de criterios: ${st.text.toLowerCase()}.`
      : `Razón de consistencia de la comparación de criterios: CR = ${sh.cr.toFixed(4)} (${sh.ok ? 'aceptable, CR < 0.10 según Saaty' : 'NO aceptable: CR ≥ 0.10, conviene revisar los juicios'}).`;
  };
  const now = new Date();
  const currentDate = now.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
  const currentTime = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  const panelRef = useRef<HTMLDivElement>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  // Referencias del documento, en orden alfabético como pide APA: la del método, las complementarias, y TODAS las de la ponderación.
  // Con pesos objetivos sobre Fuzzy TOPSIS se agrega ul Amin et al. (2022), el esquema que se siguió al desdifusificar.
  const refList = (() => {
    const all = [
      methodDoc.citationApa,
      ...(METHOD_EXTRA_REFS[method] ?? []).map(apa),
      ...wRef.apa,
      ...(isFuzzy && isObjectiveWeighting(wm) ? [apa(REFS.ulAmin2022)] : []),
    ];
    const seen = new Set<string>();
    return all.filter((r) => { const k = refKey(r); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => a.localeCompare(b, 'es'));
  })();

  // ELECTRE: pares con relación, incomparables y núcleo (kernel de ELECTRE I, los ciclos como un bloque; NO «las que nadie supera»,
  // que daba por ganadora a una alternativa aislada). Se derivan de la misma matriz `outranks` del grafo.
  const el = electre && (() => {
    const n = electre.names.length;
    const rels: { i: number; k: number }[] = [];
    const incomparable: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < n; k++) if (i !== k && electre.outranks[i]?.[k]) rels.push({ i, k });
      for (let k = i + 1; k < n; k++) if (!electre.outranks[i]?.[k] && !electre.outranks[k]?.[i]) incomparable.push([i, k]);
    }
    const kernel = electreKernel(electre.outranks);
    return { rels, incomparable, kernel, note: electreKernelText(electre.names, kernel, rels.length > 0) };
  })();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Encabezado de página impreso: el título del proyecto va en el margen superior de cada hoja (Chrome/Edge; el resto lo ignora).
  const pageRule = `@page { @top-left { content: "${cssString(projectTitle.slice(0, 70) || 'Proyecto MCDA')}"; } }`;
  const box = (bg: string, border: string, edge: string): CSSProperties => ({ background: bg, border: `1px solid ${border}`, borderLeft: `5px solid ${edge}`, borderRadius: 8, padding: '16px 20px' });

  const node = (
    <div className="rpt-portal">
      <style dangerouslySetInnerHTML={{ __html: pageRule }} />
      <div
        className="modal-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(5, 8, 14, 0.85)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          zIndex: 3000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          id="executive-report-container"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="exec-report-title"
          tabIndex={-1}
          style={{
            background: '#FFFFFF',
            color: '#0F172A',
            borderRadius: 12,
            maxWidth: 860,
            width: '100%',
            maxHeight: '94vh',
            overflowY: 'auto',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9)',
            padding: '36px 44px',
            display: 'grid',
            gap: 24,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            lineHeight: 1.5,
            ...REPORT_VARS,
          }}
        >
          {/* Acciones superiores (solo en pantalla, ocultas al imprimir) */}
          <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderBottom: '1px solid #E2E8F0', paddingBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, background: '#0369A1', color: '#FFF', padding: '3px 8px', borderRadius: 4, ...MONO }}>
                VISTA PREVIA
              </span>
              <span style={{ fontSize: 13, color: '#475569' }}>Se imprime en A4; en el diálogo elige «Guardar como PDF».</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => window.print()}
                style={{ background: '#0369A1', color: '#FFFFFF', border: 'none', padding: '8px 18px', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                Imprimir / Guardar como PDF
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', color: '#475569', padding: '8px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
              >
                Cerrar
              </button>
            </div>
          </div>

          {/* Membrete institucional */}
          <header style={{ borderBottom: '2px solid #0F172A', paddingBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0369A1' }}>
                  Universidad del Magdalena · Facultad de Ingeniería
                </div>
                <h1 id="exec-report-title" style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 2px', color: '#0F172A' }}>
                  Dictamen Ejecutivo de Decisión Multicriterio (MCDA)
                </h1>
                <div style={{ fontSize: 13, color: '#475569' }}>
                  Maestría en Ingeniería · Toma de Decisiones Multicriterio
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, color: '#475569', whiteSpace: 'nowrap', flexShrink: 0, ...MONO }}>
                <div>Fecha: <b>{currentDate}</b></div>
                <div>Método: <b>{methodLabel}</b></div>
                <div>Pesos: <b>{WEIGHTING_REFS[wm].label}</b></div>
              </div>
            </div>
          </header>

          {/* Datos de ejemplo: nunca deben leerse como el dictamen de un panel real */}
          {exampleData && (
            <div className="rpt-box" role="note" style={{ background: '#FEF3C7', border: '2px solid #B45309', borderRadius: 8, padding: '10px 16px', color: '#78350F', fontSize: 13 }}>
              <b>DATOS DE EJEMPLO.</b> Los valores y/o juicios de este análisis provienen de un caso de ejemplo cargado en la plataforma para probar la herramienta. No corresponden a un panel de expertos real ni a una decisión real, y este documento no debe presentarse como tal.
            </div>
          )}

          {/* Resumen del problema y caso de estudio */}
          <div className="rpt-box" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, background: '#F8FAFC', padding: '14px 18px', borderRadius: 8, border: '1px solid #CBD5E1' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#475569' }}>Proyecto</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{projectTitle}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#475569' }}>Objetivo de la decisión</div>
              <div style={{ fontSize: 13, color: '#334155', marginTop: 2 }}>{projectObjective || 'Selección bajo criterios múltiples (objetivo no especificado)'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#475569' }}>Dimensión</div>
              <div style={{ fontSize: 13, color: '#334155', marginTop: 2 }}>
                {alternatives.length} alternativas × {criteria.length} criterios
              </div>
            </div>
          </div>

          {/* Dictamen: resultado del modelo, en los términos del método */}
          {el && electre ? (
            el.kernel.winner != null ? (
              <div className="rpt-box" style={box('#F0FDF4', '#86EFAC', '#16A34A')}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#15803D', letterSpacing: '0.06em' }}>
                  Alternativa no superada (núcleo de la relación)
                </div>
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#14532D' }}>{electre.names[el.kernel.winner]}</span>
                </div>
                <p style={{ fontSize: 13, color: '#166534', margin: '6px 0 0' }}>
                  Con c* = {electre.cStar.toFixed(2)} y d* = {electre.dStar.toFixed(2)}, ninguna otra alternativa supera a esta según <b>{methodDoc.name}</b>, y las demás quedan superadas por ella. No es un puntaje: ELECTRE no produce un orden total, solo una relación de superación.
                </p>
              </div>
            ) : (
              <div className="rpt-box" style={box('#FFFBEB', '#FCD34D', '#D97706')}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#B45309', letterSpacing: '0.06em' }}>
                  Sin alternativa ganadora única
                </div>
                <p style={{ fontSize: 13, color: '#92400E', margin: '6px 0 0' }}>
                  {el.rels.length === 0
                    ? <>Con c* = {electre.cStar.toFixed(2)} y d* = {electre.dStar.toFixed(2)} ninguna alternativa supera a otra: los datos no alcanzan para preferir una sobre otra con estos umbrales.</>
                    : <>Con c* = {electre.cStar.toFixed(2)} y d* = {electre.dStar.toFixed(2)}: {el.note.summary}</>}
                </p>
                {el.rels.length > 0 && (
                  <ul style={{ fontSize: 12.5, color: '#92400E', margin: '6px 0 0', paddingLeft: 18 }}>
                    {el.note.reasons.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                )}
              </div>
            )
          ) : winner && compromiseSet && compromiseSet.length > 1 ? (
            <div className="rpt-box" style={box('#FFFBEB', '#FCD34D', '#D97706')}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#B45309', letterSpacing: '0.06em' }}>
                Conjunto de compromiso (sin ganador único)
              </div>
              <div style={{ marginTop: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#78350F' }}>{compromiseSet.join(', ')}</span>
              </div>
              <p style={{ fontSize: 13, color: '#92400E', margin: '6px 0 0' }}>
                Según <b>{methodDoc.name}</b>, ninguna alternativa cumple a la vez las condiciones de ventaja aceptable y estabilidad (Opricovic &amp; Tzeng, 2004), así que se recomienda considerar estas alternativas en conjunto. La de menor Q es <b>{winner.name}</b> ({winner.score.toFixed(4)}), pero no es un ganador único.
              </p>
            </div>
          ) : winner && tied.length > 1 ? (
            <div className="rpt-box" style={box('#FFFBEB', '#FCD34D', '#D97706')}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#B45309', letterSpacing: '0.06em' }}>
                Empate en el primer lugar (sin alternativa destacada)
              </div>
              <div style={{ marginTop: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#78350F' }}>{tied.length === rankingRows.length ? 'Todas las alternativas' : tied.map((r) => r.name).join(', ')}</span>
              </div>
              <p style={{ fontSize: 13, color: '#92400E', margin: '6px 0 0' }}>
                Según <b>{methodDoc.name}</b>, {tied.length === rankingRows.length ? 'los datos actuales no distinguen entre las alternativas' : 'estas alternativas quedan empatadas'} ({score.short}: {score.fmt(winner.score)}). No hay una alternativa que respaldar: completa o revisa los datos antes de decidir.
              </p>
            </div>
          ) : winner && (
            <div className="rpt-box" style={box('#F0FDF4', '#86EFAC', '#16A34A')}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#15803D', letterSpacing: '0.06em' }}>
                Alternativa mejor clasificada según el modelo
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#14532D' }}>{winner.name}</span>
                <span style={{ fontSize: 13, color: '#15803D', ...MONO }}>
                  ({score.short}: {score.fmt(winner.score)})
                </span>
              </div>
              <p style={{ fontSize: 13, color: '#166534', margin: '6px 0 0' }}>
                Según <b>{methodLabel}</b>, esta alternativa {WINNER_NOTE[method] ?? 'es la mejor clasificada frente a los pesos establecidos.'} Es el resultado del modelo con los datos y pesos de este proyecto, no una decisión tomada: ver «Alcance y limitaciones».
              </p>
            </div>
          )}
          {vikorV != null && (
            <p style={{ fontSize: 12.5, color: '#475569', margin: 0 }}>
              <b>Parámetro v de VIKOR = {vikorV.toFixed(2)}.</b> No se deriva de los datos: lo fija quien decide (0.5 = «consenso», convención). El ranking puede cambiar con otros valores de v; ver la sección de sensibilidad de este informe.
            </p>
          )}

          {electre && (
            <p style={{ fontSize: 12.5, color: '#475569', margin: 0 }}>
              <b>Umbrales de ELECTRE: c* = {electre.cStar.toFixed(2)} (concordancia mínima), d* = {electre.dStar.toFixed(2)} (discordancia máxima).</b> No se derivan de los datos: los fija quien decide, y con otros valores cambian las relaciones y los pares incomparables (convención del curso: c* = 0.65, d* = 0.30).
            </p>
          )}

          {/* De dónde salen los criterios (Sesión 1): lluvia de ideas → tamizaje → independencia → panel y corte */}
          {hasPrio && prio && (
            <Sec no={secNo('selection')} title="Selección de Criterios">
              <PrioBreakdown prio={prio} mode="report" criteriaCount={criteria.length} />
            </Sec>
          )}

          {/* Estructura de la decisión: objetivo → criterios (con su peso) → alternativas (con su puntaje si el método lo da) */}
          <Sec no={secNo('hierarchy')} title="Estructura de la Decisión">
            <div className="rpt-fig" style={{ breakInside: 'avoid' }}>
              <HierarchyTree
                goal={projectObjective || projectTitle}
                criteria={criteria.map((c, i) => ({ name: c.name, weight: weights[i] }))}
                alternatives={rankedAlts}
                scoreLabel={score.short}
              />
            </div>
          </Sec>

          {/* Ponderación de criterios */}
          <Sec no={secNo('weights')} title={`Ponderación de Criterios (${criteria.length})`}>
            <table className={'rpt-table' + (criteria.length <= 14 ? ' rpt-keep' : '')} style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={THEAD_TR}>
                  <th style={TH}>Criterio</th>
                  {/* AHP compara por pares, no lee valores: «maximizar/minimizar» no existe en su método. */}
                  {showMatrix && <th style={TH}>Regla de decisión</th>}
                  <th style={THR}>Peso (w_j)</th>
                  <th style={THR}>Porcentaje</th>
                </tr>
              </thead>
              <tbody>
                {criteria.map((c, i) => {
                  const w = weights[i] ?? 0;
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #CBD5E1' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{c.name}{!isAhp && c.unit?.trim() ? <span style={{ fontWeight: 400, color: '#475569' }}> ({c.unit.trim()})</span> : null}</td>
                      {showMatrix && (
                        <td style={{ padding: '8px 10px', color: '#475569' }}>{ruleText(c.id)}</td>
                      )}
                      <td style={{ padding: '8px 10px', textAlign: 'right', ...MONO }}>{w.toFixed(4)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#0369A1', ...MONO }}>
                        {(w * 100).toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Procedencia de los pesos: sin esto el lector no sabe si son juicios de expertos o cálculo sobre la matriz. */}
            <div className="rpt-box" style={{ ...BOX, marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.05em' }}>
                Procedencia de los pesos · {wRef.label}
              </div>
              <p style={{ margin: '4px 0 0' }}>{wRef.how} <span style={{ color: '#475569' }}>({wRef.cite}.)</span></p>
              <div style={{ margin: '6px 0 0', fontSize: 11.5, ...MONO }}>{WEIGHT_FORMULA[wm]}</div>
              {weightsFromJudgments ? (
                ahp && (
                  <p style={{ margin: '6px 0 0', color: '#334155' }}>
                    {ahp.expertCount === 0
                      ? <><b>Sin juicios de expertos incluidos:</b> los pesos son iguales (1/{criteria.length}) porque no hay comparaciones por pares que agregar.</>
                      : <>En este proyecto: <b>{ahp.expertCount} experto{ahp.expertCount === 1 ? '' : 's'}</b>{ahp.expertCount > 1 ? ', con juicios agregados por media geométrica (AIJ)' : ''}; los pesos son {ahp.weightMethod === 'eigenvector' ? 'el eigenvector principal de Saaty (iteración de potencias)' : 'el promedio de columnas normalizadas (procedimiento a mano del curso)'}.</>}
                    {' '}{crText(ahp.criteriaSheet)}
                  </p>
                )
              ) : (
                <p style={{ margin: '6px 0 0', color: '#334155' }}>
                  En este proyecto los pesos se calcularon sobre la matriz de decisión de la sección {secNo('matrix')}; <b>no intervino ningún experto ni hay razón de consistencia (CR) que reportar</b>.
                </p>
              )}
              <p style={{ margin: '6px 0 0', color: '#334155' }}><b>Límite:</b> {wRef.caveat}</p>
            </div>
            {isFuzzy && !weightsFromJudgments && (
              // CRITIC y Entropía necesitan números: Results.tsx desdifusifica las etiquetas (centroide de su TFN) antes de calcularlos.
              <p className="rpt-note" style={NOTE_P}>
                Como la matriz de Fuzzy TOPSIS es lingüística, estos pesos se calcularon sobre el valor nítido (centroide) de cada etiqueta, siguiendo el esquema de ul Amin et al. (2022). El método original de Chen (2000) usa pesos lingüísticos dados por los decisores; los pesos por AHP son la alternativa más cercana a ese planteamiento.
              </p>
            )}
            {ahp && weightsFromJudgments && ahp.criteriaSheet.perExpert.some((e) => !e.ok) && (
              <p className="rpt-note" style={{ ...NOTE_P, color: '#B45309' }}>
                Expertos con CR ≥ 0.10 en la comparación de criterios: {ahp.criteriaSheet.perExpert.filter((e) => !e.ok).map((e) => `${e.label} (${e.cr.toFixed(3)})`).join(', ')}. La matriz agregada puede verse consistente aunque un experto no lo sea.
              </p>
            )}
            {charts && charts.weights.length > 0 && (
              <figure className="rpt-fig" style={{ margin: '14px 0 0', breakInside: 'avoid' }}>
                <figcaption style={{ fontSize: 12.5, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Peso de cada criterio</figcaption>
                <WeightBars rows={charts.weights} />
              </figure>
            )}
          </Sec>

          {/* AHP: consistencia de los juicios (CR), lo que en los métodos de matriz no existe */}
          {isAhp && ahp && (
            <Sec no={secNo('consistency')} title="Consistencia de los Juicios (CR)">
              <table className={'rpt-table' + (ahp.altSheets.length <= 12 ? ' rpt-keep' : '')} style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={THEAD_TR}>
                    <th style={TH}>Matriz de comparación</th>
                    <th style={THR}>Juicios</th>
                    <th style={THR}>CR</th>
                    <th style={TH}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {[ahp.criteriaSheet, ...ahp.altSheets].map((sh, i) => {
                    const st = sheetStatus(sh);
                    return (
                      <tr key={sh.label + i} style={{ borderBottom: '1px solid #CBD5E1' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                          {i === 0 ? sh.label : `Alternativas según «${sh.label}»`}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', ...MONO }}>{sh.answered} de {sh.total}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: st.color, ...MONO }}>{sh.cr.toFixed(4)}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12, color: st.color, fontWeight: st.bold ? 700 : 500 }}>{st.text}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="rpt-note" style={NOTE_P}>
                Criterio de Saaty: CR &lt; 0.10 es aceptable. Los juicios se agregan entre {ahp.expertCount} experto{ahp.expertCount === 1 ? '' : 's'} y la tabla muestra el CR de la matriz agregada; «Juicios» cuenta los pares comparados (sumados entre expertos) frente a los posibles. Un par sin juicio cuenta como igual importancia (1). El CR mide la coherencia interna de los juicios, no que sean correctos.
              </p>
              {(() => {
                const flagged = [ahp.criteriaSheet, ...ahp.altSheets].flatMap((sh) => sh.perExpert.filter((e) => !e.ok).map((e) => `${e.label} en «${sh.label}» (${e.cr.toFixed(3)})`));
                const bad = [ahp.criteriaSheet, ...ahp.altSheets].filter((sh) => !sh.ok).map((sh) => sh.label);
                return (
                  <>
                    {bad.length > 0 && (
                      <p className="rpt-note" style={{ ...NOTE_P, color: '#B45309' }}>
                        <b>Revisar consistencia:</b> CR ≥ 0.10 en {bad.map((b) => `«${b}»`).join(', ')}. Hay juicios que se contradicen entre sí (por ejemplo, A mucho mejor que B, B mejor que C, pero C mejor que A); conviene que los expertos los revisen antes de tomar la decisión.
                      </p>
                    )}
                    {flagged.length > 0 && (
                      <p className="rpt-note" style={{ ...NOTE_P, color: '#B45309' }}>Expertos con CR ≥ 0.10: {flagged.join('; ')}.</p>
                    )}
                  </>
                );
              })()}
            </Sec>
          )}

          {/* AHP: prioridades locales (alternativa × criterio), de donde sale la síntesis global */}
          {isAhp && ahp && ahp.local.length > 0 && (
            <Sec no={secNo('local')} title="Prioridades Locales por Criterio">
              <div className="rpt-scroll" style={{ overflowX: 'auto' }}>
                <table className={'rpt-table' + (alternatives.length <= 12 ? ' rpt-keep' : '')} style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={THEAD_TR}>
                      <th style={{ padding: '6px 8px' }}>Alternativa</th>
                      {criteria.map((c, j) => (
                        <th key={c.id} style={{ padding: '6px 8px', textAlign: 'right' }}>
                          {c.name}
                          <div style={{ fontWeight: 400, color: '#475569', ...MONO }}>w = {(weights[j] ?? 0).toFixed(3)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {alternatives.map((alt, i) => (
                      <tr key={alt.id} style={{ borderBottom: '1px solid #CBD5E1' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>{alt.name}</td>
                        {criteria.map((c, j) => {
                          const v = ahp.local[i]?.[j];
                          const best = v != null && v >= Math.max(...ahp.local.map((r) => r[j] ?? 0)) - 1e-12;
                          return (
                            <td key={c.id} style={{ padding: '6px 8px', textAlign: 'right', fontWeight: best ? 700 : 400, ...MONO }}>
                              {v != null ? v.toFixed(4) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="rpt-note" style={NOTE_P}>
                Cada columna suma 1: es el reparto de prioridad entre las alternativas según ese criterio, derivado de las comparaciones por pares de los expertos (en negrita, la mayor de cada criterio). La prioridad global es la suma de cada valor multiplicado por el peso <i>w</i> de su criterio.
              </p>
            </Sec>
          )}

          {/* Matriz de decisión: solo los métodos que leen valores por alternativa y criterio (todos menos AHP) */}
          {showMatrix && (
            <Sec no={secNo('matrix')} title={isFuzzy ? 'Matriz de Decisión Lingüística' : 'Matriz de Decisión Cuantitativa'}>
              <div className="rpt-scroll" style={{ overflowX: 'auto' }}>
                <table className={'rpt-table' + (alternatives.length <= 14 ? ' rpt-keep' : '')} style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={THEAD_TR}>
                      <th style={{ padding: '6px 8px' }}>Alternativa</th>
                      {criteria.map((c) => (
                        <th key={c.id} style={{ padding: '6px 8px', textAlign: 'right' }}>
                          {c.name}
                          {c.unit?.trim() && <div style={{ fontWeight: 400, color: '#475569' }}>({c.unit.trim()})</div>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {alternatives.map((alt) => (
                      <tr key={alt.id} style={{ borderBottom: '1px solid #CBD5E1' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>{alt.name}</td>
                        {criteria.map((c) => (
                          <td key={c.id} style={{ padding: '6px 8px', textAlign: 'right', ...MONO }}>
                            {cellText(alt.id, c.id)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {isFuzzy && (
                <p className="rpt-note" style={NOTE_P}>
                  Escala lingüística de la plataforma (versión de 5 niveles adaptada de Chen, 2000): {Object.keys(LINGUISTIC_ALT).map((k) => `${k} = ${LINGUISTIC_NAME[k]} ${JSON.stringify(LINGUISTIC_ALT[k]).replaceAll(',', ', ')}`).join('; ')}. Una celda marcada con <b>F*</b> no tiene evaluación: el método le asigna «Regular» (F) por defecto.
                </p>
              )}
            </Sec>
          )}

          {/* ELECTRE: relación de superación en vez de orden de mérito */}
          {el && electre && (
            <Sec no={secNo('outranking')} title="Relación de Superación (ELECTRE)">
              <div className="rpt-fig" style={{ breakInside: 'avoid' }}>
                <ElectreGraph names={electre.names} outranks={electre.outranks} concordance={electre.concordance} discordance={electre.discordance} cStar={electre.cStar} dStar={electre.dStar} />
              </div>
              <div className="rpt-fig" style={{ marginTop: 12 }}>
                <ElectrePairTable
                  names={electre.names}
                  result={{ ...electreResultShape(electre) }}
                  onlyOutranking={electre.names.length > 6}
                />
                {electre.names.length > 6 && (
                  <p className="rpt-note" style={NOTE_P}>Con {electre.names.length} alternativas la lista completa tiene {electre.names.length * (electre.names.length - 1)} pares; aquí solo se muestran los pares donde la primera supera a la segunda. Las matrices completas de concordancia y discordancia (todos los pares) van en el apéndice de cálculo.</p>
                )}
              </div>
              {el.incomparable.length > 0 && (
                <p style={{ fontSize: 12.5, color: '#475569', margin: '10px 0 0' }}>
                  <b>Incomparables (ninguna supera a la otra):</b> {el.incomparable.map(([a, b]) => `${electre.names[a]} y ${electre.names[b]}`).join('; ')}. No es una falla del método: con estos umbrales los datos no alcanzan para preferir una sobre la otra.
                </p>
              )}
              <p style={{ fontSize: 12.5, color: '#475569', margin: '10px 0 0' }}>
                <b>Núcleo de la relación:</b> {el.kernel.members.map((i) => electre.names[i]).join(', ')}. {el.note.summary}
              </p>
              {el.kernel.winner == null && el.rels.length > 0 && (
                <ul style={{ fontSize: 12.5, color: '#475569', margin: '4px 0 0', paddingLeft: 18 }}>
                  {el.note.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              )}
              <p className="rpt-note" style={NOTE_P}>
                ELECTRE no produce un orden de mérito ni un puntaje: por eso este informe no incluye un ranking. La relación cambia con c* y d*.
              </p>
            </Sec>
          )}

          {/* Orden de mérito (ranking final) */}
          {!electre && (
            <Sec no={secNo('ranking')} title="Orden de Mérito y Síntesis Final">
              <table className={'rpt-table' + (rankingRows.length <= 14 ? ' rpt-keep' : '')} style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={THEAD_TR}>
                    <th style={{ ...TH, width: 80 }}>Posición</th>
                    <th style={TH}>Alternativa</th>
                    <th style={THR}>{score.label}</th>
                    <th style={{ ...TH, textAlign: 'center' }}>Lectura</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rankingRows].sort((a, b) => a.rank - b.rank).map((row) => (
                    <tr
                      key={row.name}
                      style={{
                        borderBottom: '1px solid #CBD5E1',
                        background: row.rank === 1 ? '#F0FDF4' : undefined,
                      }}
                    >
                      <td style={{ padding: '8px 10px', fontWeight: 700, ...MONO }}>#{row.rank}</td>
                      <td style={{ padding: '8px 10px', fontWeight: row.rank === 1 ? 700 : 500 }}>
                        {row.name} {row.rank === 1 && tied.length === 1 && !(compromiseSet && compromiseSet.length > 1) && '✓'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, ...MONO }}>
                        {score.fmt(row.score)}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontSize: 12 }}>
                        {inCompromise(row.name) ? (
                          // VIKOR sin ganador único: las del conjunto de compromiso se consideran juntas, ninguna es «la mejor».
                          <span style={{ color: '#B45309', fontWeight: 700 }}>Conjunto de compromiso</span>
                        ) : row.rank === 1 && tied.length > 1 ? (
                          <span style={{ color: '#B45309', fontWeight: 700 }}>Empate</span>
                        ) : row.rank === 1 && !(compromiseSet && compromiseSet.length > 1) ? (
                          <span style={{ color: '#15803D', fontWeight: 700 }}>Mejor clasificada</span>
                        ) : (
                          <span style={{ color: '#475569' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Gráfico propio del método, el mismo que ve quien usa la plataforma (sin interacción: el informe se imprime) */}
              {charts && rankingRows.length > 0 && (
                <MethodCharts method={method} data={charts} showWeights={false} showCloseness />
              )}
              {method === 'vikor' && vikorChart?.srq && vikorChart.srq.length > 0 && (
                <figure className="rpt-fig" style={{ margin: '14px 0 0', breakInside: 'avoid' }}>
                  <figcaption style={{ fontSize: 12.5, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    S, R y Q de cada alternativa (menor es mejor en las tres)
                  </figcaption>
                  <VikorSRQChart rows={vikorChart.srq} v={vikorV ?? 0.5} dq={vikorChart.srq.length > 1 ? 1 / (vikorChart.srq.length - 1) : undefined} />
                  <p style={{ fontSize: 12, color: '#475569', margin: '4px 0 0' }}>
                    Sirve para verificar a simple vista las dos condiciones de Opricovic y Tzeng (2004): la mejor por Q debe ser también la de menor S o R (★) y la 2.ª debe quedar a la derecha de la línea punteada (Q₁ + DQ).
                  </p>
                </figure>
              )}
              {method === 'vikor' && vikorChart && (
                <figure className="rpt-fig" style={{ margin: '14px 0 0', breakInside: 'avoid' }}>
                  <figcaption style={{ fontSize: 12.5, fontWeight: 700, color: '#475569' }}>
                    Sensibilidad del ranking a v (Q de cada alternativa según v; menor Q es mejor)
                  </figcaption>
                  <VikorSensitivityChart names={vikorChart.names} ends={vikorChart.ends} v={vikorV ?? 0.5} breaks={vikorChart.breaks.map((b) => b.v)} solidLabels />
                  <p style={{ fontSize: 12, color: '#475569', margin: '4px 0 0' }}>
                    Línea discontinua vertical = v usado en este informe. Cada alternativa lleva un trazo distinto y su nombre al final de la línea.{' '}
                    {vikorChart.breaks.length === 0
                      ? 'El 1er lugar no cambia con ningún v entre 0 y 1.'
                      : `Círculo negro = v donde cambia el 1er lugar: ${vikorChart.breaks.map((b) => `con v = ${b.v.toFixed(2)} pasa de ${b.from} a ${b.to}`).join('; ')}.`}
                  </p>
                </figure>
              )}
            </Sec>
          )}

          {/* Sensibilidad: tablas fijas (el informe se imprime, no hay controles) de qué tan estable es el resultado ante otros pesos y parámetros */}
          <Sec no={secNo('sensitivity')} title="Análisis de Sensibilidad">
            <SensitivityReport
              mode="report" method={method} criteria={criteria} alternatives={alternatives} dm={decisionMatrix} weights={weights}
              ahpRows={isAhp ? rankingRows.map((r, i) => ({ name: r.name, loc: ahp?.local[i] })) : undefined}
            />
          </Sec>

          {showComparison && comparison && (
            <Sec no={secNo('comparison')} title="Comparación con Otros Métodos">
              <MethodComparisonReport mode="report" alternatives={alternatives.map((a) => a.name)} {...comparison} />
            </Sec>
          )}

          {/* Apéndice de cálculo: cada matriz y cada paso con los números del proyecto, para justificar el resultado sin asumir nada */}
          <Sec no={secNo('calc')} title="Apéndice de Cálculo (paso a paso)">
            <div style={{ display: 'grid', gap: 14 }}>
              {/* Del resultado a lo que lo sustenta: primero el método, luego de dónde salieron los pesos */}
              {isAhp && ahpBreakdown && <AhpBreakdown mode="report" data={ahpBreakdown} showProcess />}
              {isAhp && ahpBreakdown?.synthesis && (
                <AhpVsEqualWeights
                  mode="report" criteria={criteria.map((c) => c.name)} weights={ahpBreakdown.synthesis.synth.wr} alternatives={alternatives.map((a) => a.name)}
                  local={ahpBreakdown.synthesis.synth.rows.map((r) => r.loc)} scores={ahpBreakdown.synthesis.synth.rows.map((r) => r.g)}
                />
              )}
              {method === 'topsis' && <TopsisBreakdown mode="report" criteria={criteria} alternatives={alternatives} decisionMatrix={decisionMatrix} weights={weights} weightsSource={weightsSource} />}
              {method === 'vikor' && <VikorBreakdown mode="report" criteria={criteria} alternatives={alternatives} decisionMatrix={decisionMatrix} weights={weights} v={vikorV ?? 0.5} weightsSource={weightsSource} showChart />}
              {method === 'promethee' && <PrometheeBreakdown mode="report" criteria={criteria} alternatives={alternatives} dm={dmEff} weights={weights} />}
              {method === 'electre' && electre && <ElectreBreakdown mode="report" criteria={criteria} alternatives={alternatives} dm={dmEff} weights={weights} cStar={electre.cStar} dStar={electre.dStar} />}
              {!isAhp && ahpBreakdown && <AhpBreakdown mode="report" data={ahpBreakdown} showProcess />}
              {!isAhp && (wm === 'critic' || wm === 'entropy') && (
                <WeightsBreakdown method={wm} criteria={criteria} alternatives={alternatives} dm={dmNum} mode="report" />
              )}
              {(method === 'saw' || method === 'fuzzy_topsis') && (
                <p className="rpt-note" style={NOTE_P}>El desglose paso a paso de {methodLabel} está descrito en la sección de justificación metodológica (fórmulas); la plataforma aún no genera sus matrices intermedias.</p>
              )}
            </div>
          </Sec>

          {/* Justificación metodológica y procedimiento (fórmulas), para quien revisa el informe sin abrir la plataforma */}
          <Sec no={secNo('method')} title="Justificación Metodológica y Procedimiento">
            <p style={{ fontSize: 12.5, color: '#334155', margin: '0 0 6px' }}>
              <b>{methodDoc.name}.</b> {methodDoc.summary}
            </p>
            <p style={{ fontSize: 12.5, color: '#334155', margin: '0 0 8px' }}>
              <b>Conviene cuando:</b> {methodDoc.whenToUse}
            </p>
            {[
              ...(isAhp ? [] : [{ head: `Cálculo de los pesos · ${wRef.label} (${wRef.cite})`, steps: WEIGHTING_SPECS[wm].steps }]),
              { head: `Cálculo del resultado · ${methodLabel}`, steps: methodDoc.steps },
            ].map((blk) => (
              <table key={blk.head} className="rpt-table rpt-keep" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, marginBottom: 8 }}>
                <thead>
                  <tr style={THEAD_TR}><th colSpan={2} style={{ padding: '5px 8px' }}>{blk.head}</th></tr>
                </thead>
                <tbody>
                  {blk.steps.map((st) => (
                    <tr key={st.title} style={{ borderBottom: '1px solid #CBD5E1', verticalAlign: 'top' }}>
                      <td style={{ padding: '5px 8px', width: '30%', fontWeight: 600 }}>{st.title}</td>
                      <td style={{ padding: '5px 8px', fontSize: 11, wordBreak: 'break-word', ...MONO }}>{st.formula ?? st.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </Sec>

          {/* Alcance y limitaciones: sin esto el informe se lee como una sentencia y no como el resultado de un modelo */}
          <Sec no={secNo('limits')} title="Alcance y Limitaciones">
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, color: '#334155', display: 'grid', gap: 4 }}>
              <li>Este informe es el resultado de un modelo con los datos y {weightsFromJudgments ? 'juicios' : 'pesos calculados'} registrados en la plataforma; ayuda a decidir, no decide. Si cambian los datos, los pesos o el método, el resultado puede cambiar.</li>
              <li>La plataforma no verifica el origen de los datos {weightsFromJudgments ? 'ni la idoneidad de los expertos' : ''}: la calidad del dictamen es la de su información de entrada.</li>
              {methodDoc.limits.map((l, i) => <li key={'m' + i}>{l}</li>)}
              {!isAhp && <li><b>Ponderación ({wRef.label}):</b> {wRef.caveat}</li>}
              <li>El análisis de sensibilidad de este documento mueve los pesos {method === 'vikor' ? 'y el parámetro v' : method === 'electre' ? 'y los umbrales c* y d*' : ''} de los criterios; no prueba cambios en los datos de la matriz ni en los juicios individuales de cada experto. La plataforma tiene un simulador interactivo para explorar otros escenarios.</li>
            </ul>
          </Sec>

          {/* Referencias (APA 7.ª), en orden alfabético */}
          <Sec no={secNo('refs')} title="Referencias">
            <div style={{ fontSize: 11.5, color: '#0F172A', display: 'grid', gap: 5 }}>
              {refList.map((r) => (
                <p key={r} style={{ margin: 0, paddingLeft: '2em', textIndent: '-2em' }}>{r}</p>
              ))}
            </div>
            <div style={{ marginTop: 10, padding: '8px 12px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 11, color: '#334155' }}>
              <strong>Cómo citar esta plataforma (software científico):</strong> Polo-Castañeda, M. A. (2026). <em>mcda-tools</em> (v{APP_VERSION}) [Software]. Zenodo. https://doi.org/{APP_DOI} · Guía y formatos en <a href="https://mcda.tools/citar" target="_blank" rel="noopener noreferrer" style={{ color: '#4F46E5', textDecoration: 'underline' }}>mcda.tools/citar</a>
            </div>
          </Sec>

          {/* Firmas y pie de documento */}
          <footer className="rpt-foot">
            <div className="rpt-sign" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 36, paddingTop: 22 }}>
              {['Elaboró (nombre y firma)', 'Revisó / aprobó (nombre y firma)'].map((t) => (
                <div key={t} style={{ borderTop: '1px solid #0F172A', paddingTop: 4, fontSize: 11.5, color: '#475569' }}>{t}</div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid #CBD5E1', marginTop: 16, paddingTop: 8, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4, fontSize: 11, color: '#475569' }}>
              <span>Elaborado con Plataforma MCDA v{APP_VERSION}{origin ? ` · ${origin}` : ''} · {currentDate}, {currentTime}</span>
              <span>Universidad del Magdalena · Santa Marta, Colombia</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );

  // Portal a <body>: la impresión oculta el resto de la aplicación con `display: none` (ver globals.css), sin dejar hojas en blanco
  // ni recortar el informe al alto de la ventana. Sin `document` (render en servidor de las pruebas) se dibuja en línea.
  return typeof document === 'undefined' ? node : createPortal(node, document.body);
}
