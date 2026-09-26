'use client';

/** Análisis AHP de los criterios en la vista pública de un mapa: consistencia, consenso, incertidumbre de los pesos, matriz agregada y
 * cada experto (sin nombre). Recibe solo el resumen publicado (`PublishedMeta.ahp`). */
import { fmt } from '@/lib/ahp';
import type { AhpSummary } from '@/lib/geo/ahpSummary';

const CATEGORY_LABEL = { 'very-low': 'muy bajo', low: 'bajo', moderate: 'moderado', high: 'alto', 'very-high': 'muy alto' } as const;
const pct = (x: number, d = 1) => (x * 100).toFixed(d) + ' %';

export default function PublicAhp({ ahp }: { ahp: AhpSummary }) {
  const n = ahp.names.length;
  const short = (i: number) => `C${i + 1}`;
  return (
    <section className="gv-sec">
      <header>
        <h4>Análisis AHP de los criterios</h4>
        <span className={'gv-cr' + (ahp.cr >= 0.1 ? ' bad' : '')}>CR {ahp.cr.toFixed(3)}{ahp.cr >= 0.1 ? ' · revisar' : ' ✓'}</span>
      </header>
      <div className="chips" style={{ marginBottom: 8 }}>
        {ahp.consensus && <span className={'pill' + (ahp.consensus.sStar < 0.65 ? ' warn' : '')}>Consenso {pct(ahp.consensus.sStar)} · {CATEGORY_LABEL[ahp.consensus.category]}</span>}
        <span className="pill neutral">{ahp.experts.length} experto(s)</span>
        <span className="pill neutral">{ahp.method === 'eigenvector' ? 'eigenvector de Saaty' : 'promedio de columnas'}</span>
      </div>
      <div className="tbl">
        <table>
          <thead><tr><th>Criterio</th><th className="n">Peso</th>{ahp.uncertainty && <><th className="n">− Δ</th><th className="n">+ Δ</th></>}</tr></thead>
          <tbody>
            {ahp.names.map((name, i) => (
              <tr key={name + i}>
                <td>{short(i)} · {name}</td><td className="n">{pct(ahp.weights[i])}</td>
                {ahp.uncertainty && <><td className="n">{pct(ahp.uncertainty.minus[i])}</td><td className="n">{pct(ahp.uncertainty.plus[i])}</td></>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="metrics" style={{ marginTop: 8 }}>
        <div><b>{ahp.lambda.toFixed(4)}</b><small>λ max</small></div><div><b>{ahp.ci.toFixed(4)}</b><small>CI</small></div>
        <div><b>{ahp.ri}</b><small>RI (n={n})</small></div><div><b>{ahp.cr.toFixed(4)}</b><small>CR</small></div>
      </div>
      <details>
        <summary>Matriz de comparaciones (media geométrica de los expertos)</summary>
        <div className="tbl" style={{ marginTop: 8 }}>
          <table>
            <thead><tr><th></th>{ahp.names.map((_, j) => <th key={j} className="n">{short(j)}</th>)}</tr></thead>
            <tbody>{ahp.matrix.map((row, i) => <tr key={i}><td>{short(i)}</td>{row.map((x, j) => <td key={j} className="n">{fmt(x)}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <p className="gv-hint">Cada celda dice cuánto más importante es el criterio de la fila que el de la columna (escala 1–9 de Saaty; 1/3 = la columna pesa el triple).</p>
      </details>
      <details>
        <summary>Cada experto: consistencia y pesos</summary>
        <div className="tbl" style={{ marginTop: 8 }}>
          <table>
            <thead><tr><th>Experto</th><th className="n">CR</th>{ahp.names.map((_, j) => <th key={j} className="n">{short(j)}</th>)}</tr></thead>
            <tbody>
              {ahp.experts.map((e) => (
                <tr key={e.label}><td>{e.label}</td><td className="n" style={{ color: e.cr >= 0.1 ? 'var(--warn)' : undefined }}>{e.cr.toFixed(3)}{e.cr >= 0.1 ? ' ✗' : ''}</td>{e.weights.map((w, j) => <td key={j} className="n">{pct(w, 0)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="gv-hint">Los expertos van sin nombre. Un CR ≥ 0.10 marca un experto cuyos juicios son inconsistentes entre sí; el grupo se agrega igual (media geométrica).</p>
      </details>
      <p className="gv-hint">
        CR &lt; 0.10 = juicios consistentes. El consenso (S*, entropía de Shannon; Goepel 2018) va de 0 % a 100 %.
        {ahp.uncertainty && <> «± Δ»: lo que puede subir o bajar cada peso al variar al azar los juicios ±{ahp.uncertainty.delta.toFixed(2)} pasos de la escala ({ahp.uncertainty.accepted} de {ahp.uncertainty.runs} variaciones aceptadas); mide el redondeo de los juicios, no el desacuerdo entre expertos.</>}
      </p>
    </section>
  );
}
