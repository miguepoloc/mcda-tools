'use client';

import { useMemo, useState } from 'react';
import { aggregateRanking, describeAggregationRule, type AggMethod, type AggRule } from '@/lib/aggregateRanking';

const RULE_LABEL: Record<AggRule, string> = { borda: 'Borda (predeterminada)', copeland: 'Copeland' };

/** Orden agregado de la Comparativa cuando los métodos discrepan: Borda (por defecto) o Copeland, con la regla explicada junto al
 * resultado. Solo combina los puestos que cada método ya dio; ELECTRE no tiene ranking y queda fuera (se dice). */
export default function AggregateRanking({ names, methods, electreExcluded, compromiseMethods }: {
  names: string[];
  methods: AggMethod[];
  /** ¿Hay ELECTRE con datos pero sin ranking, y por tanto fuera del agregado? */
  electreExcluded: boolean;
  /** Etiquetas de métodos que entran con su orden por Q aunque no declaren ganador único (VIKOR en conjunto de compromiso). */
  compromiseMethods: string[];
}) {
  const [rule, setRule] = useState<AggRule>('borda');
  const res = useMemo(() => aggregateRanking(names, methods, rule), [names, methods, rule]);
  if (!res) return null;
  return (
    <div className="card">
      <h3 style={{ marginBottom: 4 }}>Orden agregado de los {res.methodCount} métodos con ranking</h3>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 10px', maxWidth: '72ch' }}>{describeAggregationRule(rule, names.length, res.methodCount)}</p>
      <div className="sheetnav" role="group" aria-label="Regla de agregación">
        {(['borda', 'copeland'] as const).map((k) => (
          <button key={k} type="button" aria-pressed={rule === k} onClick={() => setRule(k)}><b>{RULE_LABEL[k]}</b></button>
        ))}
      </div>
      <div className="tbl" style={{ marginTop: 10 }}>
        <table aria-label="Orden agregado de las alternativas">
          <thead><tr><th scope="col">Puesto</th><th scope="col">Alternativa</th><th scope="col" className="n">{rule === 'borda' ? 'Puntos Borda' : 'Victorias − derrotas'}</th></tr></thead>
          <tbody>
            {res.rows.map((r) => (
              <tr key={r.index}>
                <th scope="row" className="n mono" style={{ fontWeight: r.rank === 1 ? 700 : 500, color: r.rank === 1 ? 'var(--pass)' : undefined }}>
                  #{r.rank}{r.tied ? ' (empate)' : ''}
                </th>
                <td style={{ fontWeight: r.rank === 1 ? 700 : 500 }}>{r.name}</td>
                <td className="n mono" title={rule === 'borda' ? `de ${(names.length - 1) * res.methodCount} puntos posibles` : undefined}>
                  {rule === 'copeland' && r.score > 0 ? '+' : ''}{Number.isInteger(r.score) ? r.score : r.score.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="stack" style={{ marginTop: 10, gap: 6 }}>
        <p style={{ margin: 0, fontSize: 13.5 }}>
          {res.winners.length === 1
            ? <>Orden agregado propone a <b>{res.winners[0]}</b> en 1.er lugar.</>
            : <>Empate en 1.er lugar entre <b>{res.winners.join(', ')}</b>: la regla no los separa y aquí no se desempata en silencio; revisa los criterios o prueba la otra regla.</>}
          {res.condorcetWinner && res.winners.join() !== res.condorcetWinner && <> Ojo: <b>{res.condorcetWinner}</b> vence por mayoría de métodos a todas las demás (ganador de Condorcet).</>}
        </p>
        {res.cycle && (
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
            Hay un ciclo de mayorías (paradoja de Condorcet: A supera a B, B a C y C a A entre los métodos), así que ningún orden agregado es indiscutible.
          </p>
        )}
        {electreExcluded && (
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
            ELECTRE queda fuera del agregado: no da un ranking sino una relación de superación con incomparables, y no se le inventa uno.
          </p>
        )}
        {compromiseMethods.length > 0 && (
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
            {compromiseMethods.join(', ')} entra con su orden por Q aunque no declare ganador único (conjunto de compromiso); no lo cuenta como primer lugar en el consenso de arriba.
          </p>
        )}
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          Cada método cuenta lo mismo, y todos usan los mismos pesos y datos, así que el agregado no es una prueba independiente: resume el acuerdo, no lo valida.
        </p>
      </div>
    </div>
  );
}
