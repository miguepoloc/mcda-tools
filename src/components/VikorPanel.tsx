'use client';

import { useMemo } from 'react';
import type { Alternative, Criterion, DecisionMatrix } from '@/lib/types';
import VikorSensitivityChart from './VikorSensitivityChart';
import VikorSRQChart from './VikorSRQChart';
import { vikorInputs, type VikorSynth } from '@/lib/vikor';
import { sameV as same, vikorRegimeText, vikorSensView } from '@/lib/vikorBreakdown';

/**
 * Todo lo específico de VIKOR que no es "una lista ordenada": el selector de v, las 2 condiciones de
 * Opricovic & Tzeng (2004) para declarar un ganador único, y la sensibilidad del ranking a v (tabla +
 * gráfica). Espeja las diapositivas 22-29 y 47 de la Sesión 3 del curso (sesiones/sesion-03).
 *
 * v NO sale de los datos: lo elige quien decide (Alidrisi 2021: v > 0.5 privilegia el promedio S,
 * v < 0.5 evitar fallas graves R, y "usualmente" v = 0.5 como consenso). Ninguna fuente lo justifica
 * más que como convención, y este panel lo dice explícitamente.
 */

const PRESETS: { v: number; label: string; hint: string }[] = [
  { v: 0.25, label: '0.25', hint: 'prima no fallar (R)' },
  { v: 0.5, label: '0.5', hint: 'consenso (convención)' },
  { v: 0.75, label: '0.75', hint: 'prima el promedio (S)' },
];

type Props = {
  criteria: Criterion[];
  alternatives: Alternative[];
  dm: DecisionMatrix;
  weights: number[];
  synth: VikorSynth;
  v: number;
  onChangeV: (v: number) => void;
  /** true = el dueño del proyecto (v se guarda); false = vista pública/de solo lectura (v solo en pantalla). */
  persisted: boolean;
};

export default function VikorPanel({ criteria, alternatives, dm, weights, synth, v, onChangeV, persisted }: Props) {
  const names = alternatives.map((a) => a.name);
  const { matrix, types } = useMemo(() => vikorInputs(criteria, alternatives, dm), [criteria, alternatives, dm]);

  // Misma lógica que usa el desglose paso a paso (lib/vikorBreakdown): v de la tabla, cruces, extremos para la gráfica y tramos.
  const sens = useMemo(() => vikorSensView(matrix, weights, types, v, synth.tie), [matrix, weights, types, v, synth.tie]);
  const { breaks, rows, ends } = sens;

  const verdict = synth.verdict;
  const setNames = verdict ? verdict.set.map((i) => names[i]) : [];
  const firstChanges = breaks.map((b) => ({ ...b, fromName: names[b.from], toName: names[b.to] }));
  const winnerRobust = breaks.length === 0;
  const regimeText = vikorRegimeText(sens, names);

  return (
    <>
      {/* ---------- Selector de v ---------- */}
      <div className="card">
        <div className="eyebrow">Parámetro v de VIKOR</div>
        <h3 style={{ margin: '4px 0 6px' }}>v = {v.toFixed(2)} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· peso de S (promedio) frente a R (peor criterio)</span></h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="range" min="0" max="1" step="0.05" value={v} aria-label="Valor de v"
            onChange={(e) => onChangeV(Math.round(parseFloat(e.target.value) * 100) / 100)}
            style={{ flex: '1 1 260px', accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
          <div className="chips" style={{ margin: 0 }}>
            {PRESETS.map((p) => (
              <button key={p.v} type="button" className="btn sm" aria-pressed={same(v, p.v)} title={p.hint}
                style={same(v, p.v) ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
                onClick={() => onChangeV(p.v)}>{p.label}</button>
            ))}
          </div>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: '10px 0 0', maxWidth: '78ch' }}>
          <b>v no se calcula a partir de los datos: lo elige quien decide.</b> v &gt; 0.5 favorece a quien rinde bien en promedio (S);
          v &lt; 0.5, a quien no falla gravemente en ningún criterio (R). 0.5 es la convención de «consenso» (Alidrisi, 2021) y el valor por defecto de
          pyDecision y de esta plataforma, no un resultado justificado. Por eso abajo se ve cuánto depende el ranking de haberlo elegido.
          {persisted
            ? ' Se guarda con el proyecto y lo ven quienes abran el enlace público.'
            : ' Aquí solo cambia en tu pantalla: no modifica el proyecto.'}
        </p>
      </div>

      {/* ---------- Veredicto: ¿ganador único o conjunto de compromiso? ---------- */}
      {verdict && (
        <div className="card">
          <div className="eyebrow">¿Hay un ganador único? Condiciones de Opricovic &amp; Tzeng (2004)</div>
          <p style={{ margin: '6px 0 10px', fontSize: 15 }}>
            {verdict.kind === 'unique' && <>Sí: <b>{setNames[0]}</b> cumple las dos condiciones, es ganador único con v = {v.toFixed(2)}.</>}
            {verdict.kind === 'two' && <>No hay ganador único: falla la condición 2 (estabilidad). VIKOR propone <b>{setNames.join(' y ')}</b>.</>}
            {verdict.kind === 'set' && <>No hay ganador único: falla la condición 1 (ventaja aceptable). Conjunto de compromiso: <b>{setNames.join(', ')}</b>.</>}
          </p>
          <div className="tbl">
            <table>
              <tbody>
                <tr>
                  <td><b>Condición 1, ventaja aceptable</b><br /><span className="muted" style={{ fontSize: 12.5 }}>Q(2º) − Q(1º) ≥ DQ = 1/(m − 1), con m = {verdict.m} alternativas</span></td>
                  <td className="n mono">{verdict.deltaQ.toFixed(3)} {verdict.c1 ? '≥' : '<'} {verdict.dq.toFixed(3)}</td>
                  <td className="n" style={{ color: verdict.c1 ? 'var(--pass)' : 'var(--warn)', fontWeight: 700 }}>{verdict.c1 ? '✓ se cumple' : '✗ no se cumple'}</td>
                </tr>
                <tr>
                  <td><b>Condición 2, estabilidad</b><br /><span className="muted" style={{ fontSize: 12.5 }}>El 1º por Q también es el mejor en S y/o en R</span></td>
                  <td className="n mono">mejor S: {verdict.bestS.map((i) => names[i]).join(', ')}<br />mejor R: {verdict.bestR.map((i) => names[i]).join(', ')}</td>
                  <td className="n" style={{ color: verdict.c2 ? 'var(--pass)' : 'var(--warn)', fontWeight: 700 }}>{verdict.c2 ? '✓ se cumple' : '✗ no se cumple'}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
            Si falla solo la 2, se proponen el 1º y el 2º; si falla la 1, todas las alternativas cuyo Q quede a menos de DQ del 1º. Un conjunto grande no es un error: significa que los datos no separan a un ganador.
          </p>
        </div>
      )}

      {/* ---------- S, R y Q por alternativa: para validar el veredicto (condiciones 1 y 2) viéndolo ---------- */}
      {!synth.tie && (
        <div className="card">
          <div className="eyebrow">Cómo se comportan S, R y Q</div>
          <h3 style={{ margin: '4px 0 6px' }}>Las tres medidas de VIKOR, alternativa por alternativa</h3>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 10px', maxWidth: '78ch' }}>
            Mira si la mejor por Q (✓) también es la de menor S o la de menor R (★): es la condición de estabilidad. Y si la 2.ª por Q queda a la derecha de la línea punteada: es la ventaja aceptable.
          </p>
          <h4 className="s3-cap">S, R y Q por alternativa (barra más corta = mejor)</h4>
          <VikorSRQChart rows={synth.rows} v={v} dq={synth.rows.length > 1 ? 1 / (synth.rows.length - 1) : undefined} />
        </div>
      )}

      {/* ---------- Sensibilidad a v: tabla + gráfica ---------- */}
      {!synth.tie && (
        <div className="card">
          <div className="eyebrow">Sensibilidad del ranking a v</div>
          <h3 style={{ margin: '4px 0 6px' }}>
            {winnerRobust ? `${names[synth.order[0]]} es 1º con cualquier v` : 'El 1er lugar depende de v'}
          </h3>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 10px', maxWidth: '78ch' }}>
            {winnerRobust
              ? 'Mismos datos y pesos, solo cambia v de 0 a 1: el ganador no cambia, así que la elección de v no decide el resultado (aunque el 2º lugar sí puede cambiar).'
              : firstChanges.map((c) => `Con v = ${c.v.toFixed(2)} el 1er lugar pasa de ${c.fromName} a ${c.toName}.`).join(' ') + ' El ganador depende de haber elegido v: dilo en el informe y presenta las alternativas que se disputan el 1º.'}
            {regimeText ? <> <b>{regimeText}</b></> : null}
          </p>

          <div className="tbl">
            <table>
              <thead>
                <tr><th className="n">v</th>{names.map((n) => <th key={n} className="n">Q {n}</th>)}<th>Ranking (1º primero)</th><th>Veredicto</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const cur = same(row.v, v);
                  const isBreak = breaks.some((b) => same(b.v, row.v));
                  const top = Math.min(...row.q);
                  return (
                    <tr key={row.v} style={cur ? { background: 'color-mix(in srgb, var(--accent) 10%, transparent)' } : undefined}>
                      <td className="n mono" style={{ fontWeight: cur ? 700 : 500 }}>
                        {row.v.toFixed(2)}{cur ? ' ◀' : ''}{isBreak ? ' ⇄' : ''}
                      </td>
                      {row.q.map((q, i) => (
                        <td key={i} className="n mono" style={Math.abs(q - top) < 1e-9 ? { fontWeight: 700, color: 'var(--pass)' } : undefined}>{q.toFixed(3)}</td>
                      ))}
                      <td style={{ fontSize: 13 }}>{row.order.map((i) => names[i]).join(' › ')}</td>
                      <td style={{ fontSize: 12.5 }}>
                        {row.verdict
                          ? row.verdict.kind === 'unique' ? <span style={{ color: 'var(--pass)' }}>Ganador único</span> : <span style={{ color: 'var(--warn)' }}>Conjunto de {row.verdict.set.length}</span>
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>◀ v actual · ⇄ v donde cambia el 1er lugar · en verde, el Q más bajo (el 1º) de cada fila.</p>

          <h4 className="s3-cap" style={{ marginTop: 14 }}>Q de cada alternativa al variar v de 0 a 1 (más abajo = mejor)</h4>
          <VikorSensitivityChart names={names} ends={ends} v={v} breaks={firstChanges.map((c) => c.v)} />
        </div>
      )}
    </>
  );
}
