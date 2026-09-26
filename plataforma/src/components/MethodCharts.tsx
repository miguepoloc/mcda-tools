import type { Method } from '@/lib/types';
import ClosenessBars from './ClosenessBars';
import ContributionBars from './ContributionBars';
import IdealDistances from './IdealDistances';
import LinguisticScaleChart from './LinguisticScaleChart';
import PrometheeFlows from './PrometheeFlows';
import WeightBars from './WeightBars';

/** Datos de las gráficas propias de cada método. Results.tsx los arma una sola vez (`methodCharts`) y los usa tanto en la
 * pestaña de resultados como en el informe ejecutivo, así ambos muestran exactamente lo mismo. */
export type MethodChartData = {
  weights: { name: string; weight: number }[];
  /** AHP y SAW: aporte de cada criterio al puntaje total de cada alternativa (peso × valor local o normalizado). */
  contribution?: { criteria: string[]; unit: string; rows: { name: string; parts: number[]; total: number; rank: number }[] };
  /** PROMETHEE: flujos de salida φ⁺, de entrada φ⁻ y neto φ. */
  flows?: { name: string; plus: number; minus: number; net: number; rank: number }[];
  /** TOPSIS y Fuzzy TOPSIS: distancias a la solución ideal y anti-ideal, y cercanía resultante. */
  distances?: { label: 'C' | 'CC'; rows: { name: string; dPlus: number; dMinus: number; closeness: number; rank: number }[] };
  /** Fuzzy TOPSIS: etiquetas lingüísticas que aparecen en la matriz, para resaltarlas en la escala. */
  usedLabels?: string[];
};

const CAPTION = { fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 } as const;
const FIG = { margin: '14px 0 0', breakInside: 'avoid' } as const;

/** Gráficas propias de un método, cada una en su <figure> con pie de texto. `showWeights` y `showCloseness` se apagan donde
 * la pestaña de resultados ya las dibuja por su cuenta (barras de pesos de AHP, barras del ranking). */
export default function MethodCharts({ method, data, showWeights = true, showCloseness = false }: {
  method: Method; data: MethodChartData; showWeights?: boolean; showCloseness?: boolean;
}) {
  const d = data.distances;
  return (
    <>
      {showCloseness && d && d.rows.length > 0 && (
        <figure style={FIG}>
          <figcaption style={CAPTION}>{d.label === 'CC' ? 'Coeficiente de cercanía CC de Fuzzy TOPSIS' : 'Cercanía relativa C de TOPSIS'} por alternativa (0 = en el anti-ideal, 1 = en el ideal; barra más larga = mejor)</figcaption>
          <ClosenessBars rows={d.rows.map((r) => ({ name: r.name, value: r.closeness, rank: r.rank }))} />
        </figure>
      )}
      {data.contribution && data.contribution.rows.length > 0 && (
        <figure style={FIG}>
          <figcaption style={CAPTION}>De dónde sale el puntaje: aporte de cada criterio a cada alternativa</figcaption>
          <ContributionBars criteria={data.contribution.criteria} rows={data.contribution.rows} unit={data.contribution.unit} />
        </figure>
      )}
      {method === 'promethee' && data.flows && data.flows.length > 0 && (
        <figure style={FIG}>
          <figcaption style={CAPTION}>Flujos de PROMETHEE: cuánto supera y cuánto es superada cada alternativa</figcaption>
          <PrometheeFlows rows={data.flows} />
        </figure>
      )}
      {d && d.rows.length > 0 && (
        <figure style={FIG}>
          <figcaption style={CAPTION}>Distancia a la solución ideal (d⁺: más corta = mejor) y a la anti-ideal (d⁻: más larga = mejor)</figcaption>
          <IdealDistances rows={d.rows} closenessLabel={d.label} />
        </figure>
      )}
      {method === 'fuzzy_topsis' && (
        <figure style={FIG}>
          <figcaption style={CAPTION}>Escala lingüística usada para evaluar las alternativas</figcaption>
          <LinguisticScaleChart used={data.usedLabels} />
        </figure>
      )}
      {showWeights && data.weights.length > 0 && (
        <figure style={FIG}>
          <figcaption style={CAPTION}>Peso de cada criterio</figcaption>
          <WeightBars rows={data.weights} />
        </figure>
      )}
    </>
  );
}
