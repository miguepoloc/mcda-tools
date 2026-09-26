'use client';

import { useState, useMemo, useEffect } from 'react';
import type { Criterion, Alternative, DecisionMatrix } from '@/lib/types';
import { electreSynthesis } from '@/lib/electre';
import { buildRankFn, redistribute } from '@/lib/sensitivity';
import type { MethodKey } from './ScientificMethodModal';

export interface AhpSynthRow {
  name: string;
  score: number;
  rank: number;
  loc?: number[];
}

interface SensitivitySimulatorProps {
  criteria: Criterion[];
  alternatives: Alternative[];
  decisionMatrix: DecisionMatrix;
  baseWeights: number[];
  method: MethodKey;
  ahpSynthRows?: AhpSynthRow[];
  /** Nombre del método objetivo («CRITIC», «Entropía») cuando los pesos base NO los dieron expertos sino que se derivan de la matriz de decisión. */
  derivedWeights?: string;
}

export default function SensitivitySimulator({
  criteria,
  alternatives,
  decisionMatrix,
  baseWeights,
  method,
  ahpSynthRows,
  derivedWeights,
}: SensitivitySimulatorProps) {
  // Inicializar pesos simulados con los pesos base
  const [simWeights, setSimWeights] = useState<number[]>(() => [...baseWeights]);

  // Sincronizar pesos simulados cuando cambian los pesos base externos
  useEffect(() => {
    setSimWeights([...baseWeights]);
  }, [baseWeights]);

  // Al mover un slider, el resto de los pesos se reescala proporcionalmente (misma regla que el análisis fijo del informe: lib/sensitivity.ts)
  function handleWeightChange(index: number, newRawVal: number) {
    setSimWeights(redistribute(simWeights, index, newRawVal));
  }

  function resetWeights() {
    setSimWeights([...baseWeights]);
  }

  // ELECTRE NO da ranking (da una relación de superación con incomparables): no se le inventa uno a partir de netOutdegree.
  const isElectre = method === 'electre';
  const rankFn = useMemo(
    () => (isElectre ? null : buildRankFn(method, { criteria, alternatives, dm: decisionMatrix, ahpRows: ahpSynthRows })),
    [isElectre, method, criteria, alternatives, decisionMatrix, ahpSynthRows],
  );
  // Sin datos con los que recalcular (p. ej. AHP sin prioridades locales) se muestra el ranking base tal cual, sin reaccionar a los pesos.
  const staticRanking = (): { name: string; score: number; rank: number }[] =>
    method === 'ahp' && ahpSynthRows?.length
      ? ahpSynthRows.map((r) => ({ name: r.name, score: r.score, rank: r.rank }))
      : alternatives.map((a, i) => ({ name: a.name, score: 0, rank: i + 1 }));

  // Resolver síntesis base
  const baseResult = useMemo(() => (isElectre ? [] : rankFn ? rankFn(baseWeights) : staticRanking()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isElectre, rankFn, baseWeights]);

  // Resolver síntesis simulada en tiempo real
  const simResult = useMemo(() => (isElectre ? [] : rankFn ? rankFn(simWeights) : staticRanking()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isElectre, rankFn, simWeights]);

  // ELECTRE: relaciones (a cuántas supera cada alternativa y por cuántas es superada) con los pesos base y con los simulados.
  const electreView = (w: number[]) => {
    const syn = electreSynthesis(criteria, alternatives, decisionMatrix, w);
    return {
      out: syn.names.map((_, i) => syn.result.outranks[i]?.filter(Boolean).length ?? 0),
      inn: syn.names.map((_, i) => syn.result.outranks.filter((row) => row[i]).length),
      relations: syn.relations.length,
      incomparable: syn.incomparable.length,
      winner: syn.kernel.winner != null ? syn.names[syn.kernel.winner] : null,
      members: syn.kernel.members.map((k) => syn.names[k]),
    };
  };
  const electreBase = useMemo(() => (isElectre ? electreView(baseWeights) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isElectre, criteria, alternatives, decisionMatrix, baseWeights]);
  const electreSim = useMemo(() => (isElectre ? electreView(simWeights) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isElectre, criteria, alternatives, decisionMatrix, simWeights]);

  // Después de todos los hooks (un return antes de ellos rompe el orden de hooks si cambia el número de criterios).
  if (!criteria.length || !alternatives.length || !baseWeights.length) {
    return null;
  }

  const baseWinner = baseResult.find((r) => r.rank === 1);
  const simWinner = simResult.find((r) => r.rank === 1);
  const winnerChanged = baseWinner && simWinner && baseWinner.name !== simWinner.name;
  const electreChanged = !!(electreBase && electreSim && (
    electreBase.relations !== electreSim.relations || electreBase.winner !== electreSim.winner
    || electreBase.out.some((o, i) => o !== electreSim.out[i]) || electreBase.inn.some((o, i) => o !== electreSim.inn[i])
  ));

  return (
    <div
      className="card"
      style={{
        borderTop: '3px solid var(--accent)',
        display: 'grid',
        gap: 20,
        padding: '24px',
        background: 'var(--surface)',
      }}
    >
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span
              style={{
                fontSize: 11,
                fontFamily: 'var(--f-mono)',
                fontWeight: 700,
                color: 'var(--accent)',
                background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                padding: '2px 8px',
                borderRadius: 4,
                border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
              }}
            >
              ANÁLISIS DE SENSIBILIDAD «WHAT-IF»
            </span>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--f-mono)' }}>
              Método: {method.toUpperCase()}
            </span>
          </div>
          <h3 style={{ margin: 0, fontSize: 18, color: 'var(--ink)' }}>
            Simulador Dinámico de Ponderación de Criterios
          </h3>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 0', maxWidth: '65ch' }}>
            Desplaza los controles para evaluar qué tan robusto es el ranking si cambian las prioridades de los criterios.
            Los demás criterios se rebalancean proporcionalmente de forma automática.
          </p>
          {derivedWeights && (
            <p className="muted" style={{ fontSize: 13, margin: '6px 0 0', maxWidth: '65ch' }}>
              <b style={{ color: 'var(--ink)' }}>Los pesos base no son de expertos: los calculó {derivedWeights} a partir de la matriz de decisión</b> y se
              recalculan solos si cambias un dato. Aquí los mueves solo como hipótesis («¿y si este criterio importara más?»): es un ejercicio
              en pantalla, no cambia los pesos del proyecto ni sus resultados.
            </p>
          )}
        </div>

        <button
          type="button"
          className="btn sm"
          onClick={resetWeights}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          ↺ {derivedWeights ? `Volver a los pesos ${derivedWeights}` : 'Restablecer pesos base'}
        </button>
      </div>

      {/* Alerta de Cambio de Ganador (ELECTRE: no hay ganador por puntaje, se avisa si cambian las relaciones o el núcleo) */}
      {isElectre && electreBase && electreSim ? (
        electreChanged ? (
          <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid #F59E0B', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }} role="status">
            <span style={{ fontSize: 22 }} aria-hidden>⚠️</span>
            <div style={{ fontSize: 13.5, color: '#FCD34D' }}>
              <strong>Cambian las relaciones de superación.</strong> Con esta ponderación ELECTRE encuentra{' '}
              <b style={{ color: '#FFF' }}>{electreSim.relations}</b> relación{electreSim.relations === 1 ? '' : 'es'} y{' '}
              <b style={{ color: '#FFF' }}>{electreSim.incomparable}</b> par{electreSim.incomparable === 1 ? '' : 'es'} incomparable{electreSim.incomparable === 1 ? '' : 's'}
              {' '}(con los pesos base: {electreBase.relations} y {electreBase.incomparable}). Núcleo: {electreSim.winner ? <>única alternativa <b style={{ color: '#FFF' }}>{electreSim.winner}</b></> : <>sin ganador único ({electreSim.members.join(', ') || 'sin relaciones'})</>}.
            </div>
          </div>
        ) : (
          <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#A7F3D0' }} role="status">
            <span aria-hidden>✓</span>
            <span><strong>Relaciones sin cambio:</strong> con esta combinación de pesos ELECTRE encuentra las mismas relaciones de superación que con los pesos base. ELECTRE no da ranking: no hay «ganador» por puntaje.</span>
          </div>
        )
      ) : winnerChanged ? (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid #F59E0B',
            borderRadius: 8,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <span style={{ fontSize: 22 }}>⚠️</span>
          <div style={{ fontSize: 13.5, color: '#FCD34D' }}>
            <strong>¡Cambio de alternativa ganadora!</strong> Con esta nueva ponderación,{' '}
            <b style={{ color: '#FFF' }}>{simWinner?.name}</b> asciende al 1.er lugar (en el modelo base era{' '}
            <b style={{ color: '#FFF' }}>{baseWinner?.name}</b>).
          </div>
        </div>
      ) : (
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 8,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            color: '#A7F3D0',
          }}
        >
          <span>✓</span>
          <span>
            <strong>Ranking robusto:</strong> La alternativa ganadora actual ({simWinner?.name}) se mantiene en el 1.er puesto bajo esta combinación de pesos.
          </span>
        </div>
      )}

      {/* Sliders de Sensibilidad por Criterio */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 14,
          background: 'var(--surface2)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          padding: '16px',
        }}
      >
        {criteria.map((c, i) => {
          const simW = simWeights[i] ?? 0;
          const baseW = baseWeights[i] ?? 0;
          const diff = simW - baseW;
          const pct = (simW * 100).toFixed(1);
          const diffText = diff > 0.001 ? `+${(diff * 100).toFixed(1)}%` : diff < -0.001 ? `${(diff * 100).toFixed(1)}%` : '=';

          return (
            <div key={c.id} style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{c.name}</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontFamily: 'var(--f-mono)', fontSize: 12 }}>
                  <b style={{ color: 'var(--accent)' }}>{pct}%</b>
                  <span
                    style={{
                      fontSize: 11,
                      color: diff > 0.001 ? 'var(--pass)' : diff < -0.001 ? 'var(--warn)' : 'var(--muted)',
                    }}
                  >
                    ({diffText})
                  </span>
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={simW}
                onChange={(e) => handleWeightChange(i, parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  accentColor: 'var(--accent)',
                  cursor: 'pointer',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* ELECTRE: relaciones base vs. simuladas (sin puestos: no es un ranking) */}
      {isElectre && electreBase && electreSim && (
        <div>
          <div style={{ fontSize: 12, fontFamily: 'var(--f-mono)', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>
            Relaciones de superación (ELECTRE no da ranking)
          </div>
          <div className="tbl">
            <table>
              <caption className="sr-only">Cuántas alternativas supera cada una y por cuántas es superada, con pesos base y simulados</caption>
              <thead>
                <tr>
                  <th scope="col">Alternativa</th>
                  <th scope="col" className="n">Supera a (base)</th>
                  <th scope="col" className="n">Superada por (base)</th>
                  <th scope="col" className="n">Supera a (simulado)</th>
                  <th scope="col" className="n">Superada por (simulado)</th>
                  <th scope="col" className="n">Cambio</th>
                </tr>
              </thead>
              <tbody>
                {alternatives.map((a, i) => {
                  const same = electreBase.out[i] === electreSim.out[i] && electreBase.inn[i] === electreSim.inn[i];
                  return (
                    <tr key={a.id}>
                      <th scope="row" style={{ textAlign: 'left', fontWeight: 500, color: 'var(--ink)', textTransform: 'none', letterSpacing: 0, fontFamily: 'inherit', fontSize: 14 }}>{a.name}</th>
                      <td className="n">{electreBase.out[i]}</td>
                      <td className="n">{electreBase.inn[i]}</td>
                      <td className="n" style={{ fontWeight: 700 }}>{electreSim.out[i]}</td>
                      <td className="n" style={{ fontWeight: 700 }}>{electreSim.inn[i]}</td>
                      <td className="n">{same ? '= Sin cambio' : 'Cambió'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
            Con c* y d* del proyecto. Núcleo con pesos base: {electreBase.winner ? `única alternativa ${electreBase.winner}` : `sin ganador único (${electreBase.members.join(', ') || 'sin relaciones'})`}.
          </p>
        </div>
      )}

      {/* Comparativa: Ranking Base vs. Ranking Simulado */}
      {!isElectre && (
      <div>
        <div style={{ fontSize: 12, fontFamily: 'var(--f-mono)', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>
          Comparativa de Posición en el Ranking
        </div>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Alternativa</th>
                <th className="n">Puesto Base</th>
                <th className="n">Puntaje Base</th>
                <th className="n">Puesto Simulado</th>
                <th className="n">Puntaje Simulado</th>
                <th className="n">Variación</th>
              </tr>
            </thead>
            <tbody>
              {[...alternatives]
                .sort((a, b) => {
                  const rA = simResult.find((r) => r.name === a.name)?.rank ?? 999;
                  const rB = simResult.find((r) => r.name === b.name)?.rank ?? 999;
                  return rA - rB;
                })
                .map((alt) => {
                  const bRow = baseResult.find((r) => r.name === alt.name);
                  const sRow = simResult.find((r) => r.name === alt.name);
                  const bRank = bRow?.rank ?? 0;
                  const sRank = sRow?.rank ?? 0;
                const rankDiff = bRank - sRank; // Si bRank=2 y sRank=1, subió +1 puesto

                return (
                  <tr key={alt.id} style={{ background: sRank === 1 ? 'color-mix(in srgb, var(--accent) 5%, transparent)' : undefined }}>
                    <td style={{ fontWeight: sRank === 1 ? 700 : 500, color: sRank === 1 ? 'var(--ink)' : undefined }}>
                      {alt.name} {sRank === 1 && '👑'}
                    </td>
                    <td className="n" style={{ fontFamily: 'var(--f-mono)' }}>#{bRank}</td>
                    <td className="n" style={{ fontFamily: 'var(--f-mono)', color: 'var(--muted)' }}>
                      {bRow ? bRow.score.toFixed(4) : '—'}
                    </td>
                    <td className="n" style={{ fontFamily: 'var(--f-mono)', fontWeight: 700, color: sRank === 1 ? 'var(--accent)' : undefined }}>
                      #{sRank}
                    </td>
                    <td className="n" style={{ fontFamily: 'var(--f-mono)', color: 'var(--accent)' }}>
                      {sRow ? sRow.score.toFixed(4) : '—'}
                    </td>
                    <td className="n" style={{ fontFamily: 'var(--f-mono)' }}>
                      {rankDiff > 0 ? (
                        <span style={{ color: 'var(--pass)' }}>↑ Subió {rankDiff}</span>
                      ) : rankDiff < 0 ? (
                        <span style={{ color: 'var(--warn)' }}>↓ Bajó {Math.abs(rankDiff)}</span>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>= Sin cambio</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
