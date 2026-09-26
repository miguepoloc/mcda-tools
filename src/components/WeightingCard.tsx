import WeightBars from './WeightBars';
import { WEIGHTING_REFS } from '@/lib/references';

/**
 * Pesos de los criterios cuando salen de la matriz de decisión (CRITIC o Entropía) en vez de juicios de expertos. Reemplaza, en
 * los resultados, todo lo que solo tiene sentido con AHP (expertos incluidos, CR, detalle por hoja, consenso). Dice de dónde salen
 * los pesos, con su referencia y la salvedad de cuándo NO conviene, para que nadie los lea como «importancia según los expertos».
 */
export default function WeightingCard({ weighting, rows, alternativesCount }: {
  weighting: 'critic' | 'entropy';
  rows: { name: string; weight: number }[];
  alternativesCount: number;
}) {
  const ref = WEIGHTING_REFS[weighting];
  const total = rows.reduce((a, r) => a + (Number.isFinite(r.weight) ? r.weight : 0), 0);
  // Sin variación entre alternativas (o con datos que el método no admite) todos los pesos salen 0 o no numéricos.
  const broken = rows.length === 0 || rows.some((r) => !Number.isFinite(r.weight)) || total < 1e-9;
  return (
    <div className="card">
      <div className="eyebrow">Pesos de los criterios · {ref.label}</div>
      <p className="muted" style={{ margin: '4px 0 10px', maxWidth: '78ch', fontSize: 13.5 }}>
        <b style={{ color: 'var(--ink)' }}>Cómo se calcularon.</b> {ref.how} Sin intervención de expertos: no hay consistencia (CR) ni consenso que revisar.
      </p>
      {alternativesCount < 2
        ? <p className="muted">Agrega al menos 2 alternativas con datos para calcular los pesos.</p>
        : broken
          ? <div className="banner" role="alert"><span><b>No se pudieron calcular los pesos.</b> Ningún criterio distingue entre alternativas (valores iguales, negativos o faltantes en la matriz). Revisa la pestaña «Matriz de decisión».</span></div>
          : <WeightBars rows={rows} />}
      <p className="muted" style={{ margin: '10px 0 0', maxWidth: '78ch', fontSize: 13 }}>
        <b style={{ color: 'var(--ink)' }}>Ojo.</b> {ref.caveat}
      </p>
      <details style={{ marginTop: 8 }}>
        <summary>Referencias</summary>
        <ul style={{ paddingLeft: 18, fontSize: 13, display: 'grid', gap: 4, marginTop: 6 }}>
          {ref.apa.map((a) => <li key={a}>{a}</li>)}
        </ul>
      </details>
    </div>
  );
}
