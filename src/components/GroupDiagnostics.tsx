'use client';

import { useMemo } from 'react';
import { aggMatrix, DEFAULT_WEIGHT_METHOD, type Item, type SheetResult, type WeightMethod } from '@/lib/ahp';
import { consensus, weightUncertainty, type ConsensusCategory } from '@/lib/ahpGroup';

const CATEGORY_LABEL: Record<ConsensusCategory, string> = {
  'very-low': 'muy bajo', low: 'bajo', moderate: 'moderado', high: 'alto', 'very-high': 'muy alto',
};

const pct = (x: number, d = 1) => (x * 100).toFixed(d) + ' %';

/**
 * Qué tan confiable es el resultado de una hoja: consenso del panel (Shannon, Goepel 2018) e incertidumbre de los
 * pesos por simulación Monte Carlo. Son diagnósticos: no cambian ningún peso ni ranking.
 */
export default function GroupDiagnostics({ items, result, method = DEFAULT_WEIGHT_METHOD }: { items: Item[]; result: SheetResult; method?: WeightMethod }) {
  // Solo cuentan los expertos que sí respondieron algo en esta hoja.
  const answering = useMemo(() => result.answered.map((a, i) => (a > 0 ? i : -1)).filter((i) => i >= 0), [result.answered]);
  const k = answering.length;
  const cons = useMemo(() => consensus(answering.map((i) => result.per[i].w)), [answering, result.per]);
  const mc = useMemo(
    () => (k > 0 && items.length >= 2 ? weightUncertainty(aggMatrix(items, answering.map((i) => result.maps[i])), k, { method }) : null),
    [items, answering, result.maps, k, method],
  );
  if (!mc) return null;
  const overlapping = mc.overlaps.map(([i, j]) => `${items[i].name} ≈ ${items[j].name}`);

  return (
    <details>
      <summary>Confianza del resultado: consenso e incertidumbre de los pesos</summary>
      <div className="chips" style={{ marginTop: 8 }}>
        {cons
          ? <span className={'pill' + (cons.sStar < 0.65 ? ' warn' : '')}>Consenso del grupo: {pct(cons.sStar)} · {CATEGORY_LABEL[cons.category]}</span>
          : <span className="pill neutral">Consenso: hace falta más de un experto con respuestas en esta hoja</span>}
      </div>
      <div className="tbl" style={{ marginTop: 8 }}>
        <table>
          <thead>
            <tr><th>Elemento</th><th className="n">Peso</th><th className="n">− Δ</th><th className="n">+ Δ</th><th className="n">P(1.º)</th></tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id}>
                <td>{it.name}</td>
                <td className="n">{pct(mc.w[i])}</td>
                <td className="n">{pct(mc.minus[i])}</td>
                <td className="n">{pct(mc.plus[i])}</td>
                <td className="n">{pct(mc.rankProb[i][0], 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        {mc.accepted} de {mc.runs} variaciones aleatorias de los juicios (±{mc.delta.toFixed(2)} pasos de la escala{k > 1 ? `, ya dividido entre √${k}` : ''}; se
        descartan las de CR ≥ 0.25). «− Δ» y «+ Δ» son lo que el peso baja o sube en el peor caso. P(1.º) es la fracción de variaciones en que ese elemento queda primero.
        {overlapping.length > 0 && <> Con esta incertidumbre no se distinguen: {overlapping.join('; ')}.</>}
      </p>
      <p className="hint">
        Consenso: indicador S* basado en la entropía de Shannon (0 % sin consenso, 100 % consenso total). Método y umbrales: Goepel (2018), <i>Int. J. Analytic
        Hierarchy Process</i> 10(3). La simulación usa una semilla fija, así que el mismo proyecto da siempre los mismos números.
      </p>
    </details>
  );
}
