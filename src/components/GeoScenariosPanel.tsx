'use client';

/** «Comparar escenarios» (pestaña «Modelo»): hasta 5 escenarios con nombre guardados en el proyecto. Cada uno recuerda
 * pesos, reglas, cortes y clases con un resumen; se compara con el resultado actual (tabla lado a lado + capa
 * «Diferencia») o se restaura (con confirmación y posibilidad de deshacer). Presentacional: el estado vive en GeoVisor. */
import { useId, useState } from 'react';
import { compareSummaries, MAX_SCENARIOS, MAX_SCENARIO_NAME, nextScenarioName, type GeoScenario, type RestorePlan } from '@/lib/geo/scenarios';
import ConfirmDialog from './ConfirmDialog';
import './geo-scenarios.css';

const nf0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const signed = (v: number, f: Intl.NumberFormat) => (Math.abs(v) < 0.05 ? f.format(0) : (v > 0 ? '+' : '−') + f.format(Math.abs(v)));
const dateText = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }); };

export type ScenariosPanelProps = {
  scenarios: GeoScenario[];
  /** Resultado actual: nombres de clase, estadísticas (null = aún sin mapa) e índice medio. */
  names: string[];
  direction: 'suitability' | 'risk';
  stats: { classes: { ha: number; pct: number }[]; evaluableHa: number } | null;
  meanPct: number | null;
  /** Hay mapa calculado (se puede guardar el estado actual y compararlo). */
  ready: boolean;
  comparingId: string | null;
  /** Qué se aplicaría al restaurar (para avisarlo en la confirmación). */
  restoreInfo: (id: string) => RestorePlan | null;
  undo: { name: string } | null;
  onSave: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onCompare: (id: string) => void;
  onStopCompare: () => void;
  onRestore: (id: string) => void;
  onUndo: () => void;
  onDismissUndo: () => void;
};

export default function GeoScenariosPanel(p: ScenariosPanelProps) {
  const nameId = useId();
  const fullId = useId();
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const [restore, setRestore] = useState<string | null>(null);
  const full = p.scenarios.length >= MAX_SCENARIOS;
  const risk = p.direction === 'risk';
  // «Malo» = que crezca la clase peor de la dirección (aptitud: la más baja; riesgo: la más alta) o que decrezca
  // cualquiera de las otras: el color sigue a eso, no al signo.
  const worstClass = risk ? p.names.length - 1 : 0;

  const save = () => { if (full || !p.ready) return; p.onSave(name); setName(''); };
  const delSc = p.scenarios.find((s) => s.id === del);
  const resSc = p.scenarios.find((s) => s.id === restore);
  const resInfo = restore ? p.restoreInfo(restore) : null;

  return (
    <section className="gv-sec" aria-labelledby="gv-sc-h">
      <header><h4 id="gv-sc-h">Comparar escenarios</h4><span className="gv-cr" aria-label={`${p.scenarios.length} de ${MAX_SCENARIOS} escenarios guardados`}>{p.scenarios.length}/{MAX_SCENARIOS}</span></header>
      <p className="gv-hint">Guarda el estado actual con un nombre, cambia pesos, reglas o clases, y compara: qué mejoró y qué empeoró (tabla y capa «Diferencia»). Los escenarios se guardan con el proyecto y no se publican.</p>

      {p.undo && (
        <div className="gv-sc-undo" role="status">
          <span>Restauraste «{p.undo.name}».</span>
          <button type="button" className="btn sm" onClick={p.onUndo}>Deshacer</button>
          <button type="button" className="gv-linkbtn" onClick={p.onDismissUndo}>Descartar aviso</button>
        </div>
      )}

      <form className="gv-sc-new" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label htmlFor={nameId} className="gv-sc-lbl">Nombre del escenario</label>
        <div className="gv-sc-newrow">
          <input id={nameId} type="text" value={name} maxLength={MAX_SCENARIO_NAME} placeholder={nextScenarioName(p.scenarios)} autoComplete="off"
            disabled={full} aria-describedby={full ? fullId : undefined} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn sm" disabled={!p.ready} aria-disabled={full || undefined} aria-describedby={full ? fullId : undefined}>Guardar el estado actual</button>
        </div>
        {full && <p className="gv-hint warn" id={fullId}>Ya hay {MAX_SCENARIOS} escenarios (el máximo): elimina uno para guardar otro.</p>}
        {!p.ready && !full && <p className="gv-hint">Aparece al haber un mapa calculado (capas con reglas asignadas).</p>}
      </form>

      {p.scenarios.length === 0 && <p className="gv-hint">Todavía no hay escenarios guardados.</p>}
      <ul className="gv-sc-list">
        {p.scenarios.map((s) => {
          const comparing = p.comparingId === s.id;
          const cmp = comparing && p.stats ? compareSummaries(s, { direction: p.direction, names: p.names, stats: p.stats, meanPct: p.meanPct }) : null;
          const nHere = s.summary.classes.length;
          return (
            <li key={s.id} className={'gv-sc' + (comparing ? ' on' : '')}>
              {renaming?.id === s.id ? (
                <form className="gv-sc-newrow" onSubmit={(e) => { e.preventDefault(); p.onRename(s.id, renaming.text); setRenaming(null); }}>
                  <input type="text" autoFocus value={renaming.text} maxLength={MAX_SCENARIO_NAME} aria-label={`Nuevo nombre del escenario ${s.name}`}
                    onChange={(e) => setRenaming({ id: s.id, text: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(null); }} />
                  <button type="submit" className="btn sm" disabled={!renaming.text.trim()}>Guardar nombre</button>
                  <button type="button" className="btn sm" onClick={() => setRenaming(null)}>Cancelar</button>
                </form>
              ) : (
                <div className="gv-sc-head">
                  <b className="gv-sc-name">{s.name}</b>
                  <span className="gv-sc-meta">{dateText(s.date)}{s.explored ? ' · pesos explorados' : ''}</span>
                  <span className="gv-sc-meta mono">{nHere} clases · índice medio {s.summary.meanPct === null ? '—' : nf0.format(s.summary.meanPct)}</span>
                </div>
              )}
              {p.stats && p.stats.classes.length !== nHere && (
                <p className="gv-hint warn" role="status">Tenía {nHere} clases y el mapa actual tiene {p.stats.classes.length}: no se compara en la tabla hasta que vuelvas al mismo número de clases o lo restaures.</p>
              )}
              <div className="gv-row-acts">
                {comparing
                  ? <button type="button" className="btn sm" aria-pressed="true" onClick={p.onStopCompare}>Dejar de comparar</button>
                  : <button type="button" className="btn sm" disabled={!p.ready} onClick={() => p.onCompare(s.id)} aria-label={`Comparar «${s.name}» con el resultado actual`}>Comparar con el resultado actual</button>}
                <button type="button" className="btn sm" onClick={() => setRestore(s.id)} aria-label={`Restaurar el escenario «${s.name}»`}>Restaurar este escenario</button>
                <button type="button" className="btn sm" onClick={() => setRenaming({ id: s.id, text: s.name })} aria-label={`Renombrar el escenario «${s.name}»`}>Renombrar</button>
                <button type="button" className="btn sm" onClick={() => setDel(s.id)} aria-label={`Eliminar el escenario «${s.name}»`}>Eliminar</button>
              </div>

              {comparing && cmp && !cmp.comparable && (
                <p className="gv-hint warn" role="status">
                  {cmp.reason === 'classes'
                    ? `El escenario tenía ${cmp.savedN} clases y el mapa actual tiene ${cmp.nowN}: sus áreas no son comparables fila a fila. Restaura el escenario o cambia el número de clases.`
                    : 'El escenario usaba la otra dirección del índice (aptitud / riesgo): un valor alto significaba otra cosa, así que no se compara.'}
                </p>
              )}
              {comparing && cmp?.comparable && (
                <table className="gv-sc-table">
                  <caption>«{s.name}» frente al resultado actual. Δ en puntos porcentuales (pp) del área evaluada.</caption>
                  <thead>
                    <tr><th scope="col">Clase</th><th scope="col" className="num">Escenario</th><th scope="col" className="num">Ahora</th><th scope="col" className="num">Δ pp</th></tr>
                  </thead>
                  <tbody>
                    {[...cmp.rows.keys()].reverse().map((i) => {
                      const r = cmp.rows[i];
                      const bad = i === worstClass ? r.dPp > 0 : r.dPp < 0;
                      const tone = Math.abs(r.dPp) < 0.05 ? '' : bad ? ' bad' : ' good';
                      return (
                        <tr key={i}>
                          <th scope="row">{r.name}{r.savedName ? <small> (antes «{r.savedName}»)</small> : null}</th>
                          <td className="num"><b>{nf1.format(r.pctA)} %</b><small>{nf0.format(r.haA)} ha</small></td>
                          <td className="num"><b>{nf1.format(r.pctB)} %</b><small>{nf0.format(r.haB)} ha</small></td>
                          <td className={'num d' + tone}><b>{signed(r.dPp, nf1)} pp</b><small>{signed(r.dHa, nf0)} ha</small></td>
                        </tr>
                      );
                    })}
                    <tr className="mean">
                      <th scope="row">Índice medio</th>
                      <td className="num">{cmp.meanA === null ? '—' : nf1.format(cmp.meanA)}</td>
                      <td className="num">{cmp.meanB === null ? '—' : nf1.format(cmp.meanB)}</td>
                      <td className="num d">{cmp.dMean === null ? '—' : signed(cmp.dMean, nf1)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
              {comparing && cmp?.comparable && cmp.evaluableA > 0 && Math.abs(cmp.evaluableA - cmp.evaluableB) > Math.max(1, cmp.evaluableA * 0.001) && (
                <p className="gv-hint warn" role="status">El área evaluada cambió ({nf0.format(cmp.evaluableA)} → {nf0.format(cmp.evaluableB)} ha): hubo cambios en capas o exclusiones, no solo en el modelo.</p>
              )}
            </li>
          );
        })}
      </ul>

      {delSc && (
        <ConfirmDialog title={`Eliminar el escenario «${delSc.name}»`} confirmLabel="Eliminar"
          description="Se borra del proyecto: no hay forma de recuperarlo. El mapa actual no cambia."
          onClose={() => setDel(null)} onConfirm={() => { const id = delSc.id; setDel(null); p.onDelete(id); }} />
      )}
      {resSc && (
        <ConfirmDialog title={`Restaurar «${resSc.name}»`} tone="neutral" confirmLabel="Restaurar"
          description={(
            <>
              Se reemplazan los cortes y clases, las reglas de cada criterio y los pesos por los de este escenario.
              {resInfo?.exploring && <> Los pesos se aplican como <b>exploración</b> (los del panel de expertos no cambian).</>}
              {resInfo && resInfo.droppedCriteria.length > 0 && <> {resInfo.droppedCriteria.length} criterio(s) del escenario ya no existen y se omiten.</>}
              {resInfo && resInfo.newCriteria.length > 0 && <> {resInfo.newCriteria.length} criterio(s) nuevo(s) quedan sin regla.</>}
              {' '}Podrás deshacerlo justo después.
            </>
          )}
          onClose={() => setRestore(null)} onConfirm={() => { const id = resSc.id; setRestore(null); p.onRestore(id); }} />
      )}
    </section>
  );
}
