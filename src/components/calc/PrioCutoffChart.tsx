import { Fragment, useId } from 'react';
import type { PrioState } from '@/lib/prio';
import { cutInfo } from '@/lib/prioSteps';

/** Gráfica de la ponderación de cada criterio candidato contra el corte (subpestaña 5 de la Priorización y Informe ejecutivo).
 * Pura y sin estado: todo sale de `cutInfo(prio)`. Lo que la hace legible sin adivinar:
 *  - título y subtítulo, leyenda (Pasa / No pasa / línea de corte con su valor) y título del eje X;
 *  - cada fila lleva su valor y «Pasa» / «No pasa» ESCRITOS (no solo color): las que no pasan van rayadas;
 *  - una fila «Brecha» entre el último que pasa y el primero que no, con el valor de la diferencia.
 * Solo usa variables CSS, así que el informe (que las redefine en su hoja clara) la imprime bien. */
export default function PrioCutoffChart({ prio, mode = 'screen' }: { prio: PrioState; mode?: 'screen' | 'report' }) {
  const uid = useId();
  const ci = cutInfo(prio);
  const pct = (v: number) => Math.max(0, Math.min(100, (v / 5) * 100));
  const cut = prio.cutoff.toFixed(1);
  const gapAfter = ci.last && ci.firstNo ? ci.last.cand.id : null;
  const titleId = `${uid}-t`;

  if (!ci.rows.length) {
    return <p className="muted pcc-empty">Aún no hay calificaciones en el panel: la gráfica aparece cuando haya al menos una ponderación.</p>;
  }

  return (
    <figure className={'pcc' + (mode === 'report' ? ' pcc-report' : '')} aria-labelledby={titleId}>
      <figcaption>
        <span id={titleId} className="pcc-title">Ponderación de cada criterio contra el corte</span>
        <span className="pcc-sub">Cada barra es el promedio de las calificaciones del panel (escala 1 a 5). Pasa el corte quien llega a la línea o la supera.</span>
      </figcaption>

      <ul className="pcc-legend" aria-label="Leyenda">
        <li><span className="pcc-key pcc-key-pass" aria-hidden="true" />Barra llena: <b>Pasa</b> (promedio ≥ {cut})</li>
        <li><span className="pcc-key pcc-key-fail" aria-hidden="true" />Barra rayada: <b>No pasa</b></li>
        <li><span className="pcc-key pcc-key-cut" aria-hidden="true" />Línea discontinua: <b>Corte = {cut}</b></li>
      </ul>

      <div className="pcc-plot" role="list">
        {ci.rows.map((r) => (
          <Fragment key={r.cand.id}>
            <div className={'pcc-row' + (r.pass ? '' : ' out')} role="listitem">
              <span className="pcc-nm">{r.cand.name}</span>
              <div className="pcc-track" aria-hidden="true">
                <div className="pcc-fill" style={{ width: `${pct(r.mean)}%` }} />
                <span className="pcc-cut" style={{ left: `${pct(prio.cutoff)}%` }} />
              </div>
              <span className="pcc-val"><b className="mono">{r.mean.toFixed(2)}</b> <span className={'pcc-badge ' + (r.pass ? 'ok' : 'no')}>{r.pass ? '✓ Pasa' : '✕ No pasa'}</span></span>
            </div>
            {gapAfter === r.cand.id && ci.last && ci.firstNo && ci.gap != null && (
              <div className="pcc-row pcc-gaprow" role="listitem">
                <span className="pcc-nm">Brecha</span>
                <div className="pcc-track" aria-hidden="true">
                  <span className="pcc-gap" style={{ left: `${pct(ci.firstNo.mean)}%`, width: `${Math.max(0.6, pct(ci.last.mean) - pct(ci.firstNo.mean))}%` }} />
                  <span className="pcc-cut" style={{ left: `${pct(prio.cutoff)}%` }} />
                </div>
                <span className="pcc-val"><b className="mono">{ci.gap.toFixed(2)}</b> <span className="pcc-gaptxt">puntos{ci.nearLimit ? ' · en el límite' : ''}</span></span>
              </div>
            )}
          </Fragment>
        ))}
      </div>

      <div className="pcc-axis" aria-hidden="true">
        <span />
        <div className="pcc-scale">
          {[0, 1, 2, 3, 4, 5].map((t) => <span key={t} style={{ left: `${pct(t)}%` }}>{t}</span>)}
          <span className="pcc-scale-cut" style={{ left: `${pct(prio.cutoff)}%` }}>▲ {cut}</span>
        </div>
        <span />
      </div>
      <div className="pcc-axis-title">Ponderación: promedio de calificaciones 1–5 (eje horizontal)</div>
      {ci.unrated.length > 0 && (
        <p className="pcc-note">Sin calificaciones válidas, por eso no aparecen: {ci.unrated.map((c) => c.name).join(', ')}.</p>
      )}
    </figure>
  );
}
