'use client';

import { useState } from 'react';
import { uid } from '@/lib/types';
import {
  alive, cols, f2, finalists, inIndep, mean, newCand, passes, ranked, scoreOf,
  type Cand, type PrioState,
} from '@/lib/prio';
import { funnel } from '@/lib/prioSteps';
import PrioCutoffChart from './calc/PrioCutoffChart';

type Props = {
  state: PrioState;
  criteriaCount: number;
  onChange: (s: PrioState) => void;
  /** Lleva los finalistas a los criterios del AHP; devuelve un mensaje con lo que hizo. */
  onSync: () => string;
  readOnly?: boolean;
};

const TABS = ['Lluvia de ideas', 'Tamizaje', 'Independencia', 'Panel de importancia', 'Resultado final'];

export default function PrioritizationEditor({ state: A, criteriaCount, onChange, onSync, readOnly }: Props) {
  const [tab, setTab] = useState(0);
  const [msg, setMsg] = useState('');
  const [nuevo, setNuevo] = useState('');

  const set = (fn: (s: PrioState) => PrioState) => !readOnly && onChange(fn(A));
  const setC = (id: string, patch: Partial<Cand>) => set((s) => ({ ...s, cands: s.cands.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const cand = (id: string | null) => A.cands.find((c) => c.id === id);
  const firstKeep = (except: string) => A.cands.find((c) => c.id !== except && c.stage === 'keep')?.id ?? null;

  function setStage(c: Cand, stage: Cand['stage'], at: Cand['at']) {
    setC(c.id, { stage, at: stage === 'keep' ? '' : at, target: stage === 'merge' ? (c.target ?? firstKeep(c.id)) : c.target });
  }

  const cs = cols(A);
  const R = ranked(A), ok = finalists(A), no = R.filter((c) => !passes(A, c));
  const last = ok[ok.length - 1], firstNo = no.find((c) => mean(A, c) != null);
  const fn = funnel(A);

  return (
    <div className="partA panel">
      <div className="tabsbar" role="tablist">
        {TABS.map((t, i) => <button key={t} role="tab" aria-selected={tab === i} onClick={() => setTab(i)}>{i + 1}. {t}</button>)}
      </div>

      {tab === 0 && (
        <>
          <p className="muted">Anota todo lo que podría importar al elegir, sin filtrar todavía. La guía del curso sugiere entre 5 y 15 candidatos.</p>
          <div className="card ideas">
            {A.cands.map((c, i) => (
              <div className="idea" key={c.id}>
                <span className="i">{i + 1}</span>
                <input type="text" value={c.name} aria-label={`Candidato ${i + 1}`} onChange={(e) => setC(c.id, { name: e.target.value })} />
                <input type="text" value={c.desc} placeholder="Descripción" aria-label={`Descripción ${i + 1}`} onChange={(e) => setC(c.id, { desc: e.target.value })} />
                {!readOnly && <button type="button" className="btn icon sm" aria-label={`Quitar ${c.name}`} onClick={() => set((s) => ({ ...s, cands: s.cands.filter((x) => x.id !== c.id) }))}>✕</button>}
              </div>
            ))}
            {!A.cands.length && <span className="muted">Aún no hay candidatos. Agrega el primero abajo.</span>}
          </div>
          {!readOnly && (
            <form className="acts" onSubmit={(e) => { e.preventDefault(); const v = nuevo.trim(); if (!v) return; set((s) => ({ ...s, cands: [...s.cands, newCand(uid('c'), v)] })); setNuevo(''); }}>
              <input type="text" value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nuevo criterio candidato…" style={{ flex: 1, minWidth: 200 }} />
              <button className="btn primary" type="submit">Agregar</button>
            </form>
          )}
          <div className="count">{A.cands.length} candidatos</div>
        </>
      )}

      {tab === 1 && (
        <>
          <p className="muted">Elimina duplicados y candidatos irrelevantes. Un candidato se descarta o se funde con otro; documenta siempre por qué y con qué evidencia.</p>
          <div className="two-col">
            {A.cands.map((c) => {
              const pass = c.stage === 'keep' || c.at === 'ind';
              const others = A.cands.filter((o) => o.id !== c.id && o.stage === 'keep');
              return (
                <div key={c.id} className={'card cand' + (pass ? '' : ' out')}>
                  <div className="cand-top">
                    <span className="cand-name">{c.name}</span>
                    <div className="seg" role="group" aria-label={`Decisión para ${c.name}`}>
                      <button type="button" aria-pressed={pass} onClick={() => setStage(c, 'keep', '')}>Pasa</button>
                      <button type="button" className="d" aria-pressed={!pass && c.stage === 'drop'} onClick={() => setStage(c, 'drop', 'tam')}>Descartar</button>
                      <button type="button" className="d" aria-pressed={!pass && c.stage === 'merge'} onClick={() => setStage(c, 'merge', 'tam')}>Fusionar</button>
                    </div>
                  </div>
                  {!pass && (
                    <>
                      {c.stage === 'merge' && (
                        <div><label className="lbl" htmlFor={`tg-${c.id}`}>Se funde con</label>
                          <select id={`tg-${c.id}`} value={c.target ?? ''} onChange={(e) => setC(c.id, { target: e.target.value || null })}>
                            {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </select></div>
                      )}
                      <div><label className="lbl" htmlFor={`rs-${c.id}`}>Se elimina porque…</label>
                        <textarea id={`rs-${c.id}`} value={c.reason} onChange={(e) => setC(c.id, { reason: e.target.value })} /></div>
                      <div><label className="lbl" htmlFor={`ev-${c.id}`}>Evidencia</label>
                        <input id={`ev-${c.id}`} type="text" value={c.evid} placeholder="Paper, documento, sección…" onChange={(e) => setC(c.id, { evid: e.target.value })} /></div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="count">Pool restante tras tamizaje: {fn.afterTamiz} de {A.cands.length} candidatos</div>
        </>
      )}

      {tab === 2 && (
        <>
          <p className="muted">Confirma que los candidatos que llegan al panel no se solapan: cada uno debe medir un eje distinto. Si dos miden lo mismo, funde uno con el otro.</p>
          <div className="two-col">
            {inIndep(A).map((c) => {
              const over = c.stage === 'merge';
              const others = A.cands.filter((o) => o.id !== c.id && o.stage === 'keep');
              return (
                <div key={c.id} className={'card cand' + (over ? ' out' : '')}>
                  <div className="cand-top">
                    <span className="cand-name">{c.name}</span>
                    <div className="seg" role="group" aria-label={`Independencia de ${c.name}`}>
                      <button type="button" aria-pressed={!over} onClick={() => setStage(c, 'keep', '')}>Eje independiente</button>
                      <button type="button" className="d" aria-pressed={over} onClick={() => setStage(c, 'merge', 'ind')}>Se solapa</button>
                    </div>
                  </div>
                  <div><label className="lbl" htmlFor={`qm-${c.id}`}>Qué mide</label>
                    <input id={`qm-${c.id}`} type="text" value={c.qmide} onChange={(e) => setC(c.id, { qmide: e.target.value })} /></div>
                  <div><label className="lbl" htmlFor={`in-${c.id}`}>Evidencia de que es un eje distinto</label>
                    <textarea id={`in-${c.id}`} value={c.ind} onChange={(e) => setC(c.id, { ind: e.target.value })} /></div>
                  {over && (
                    <>
                      <div><label className="lbl" htmlFor={`tg2-${c.id}`}>Se funde con</label>
                        <select id={`tg2-${c.id}`} value={c.target ?? ''} onChange={(e) => setC(c.id, { target: e.target.value || null })}>
                          {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select></div>
                      <div><label className="lbl" htmlFor={`rs2-${c.id}`}>Razón</label>
                        <input id={`rs2-${c.id}`} type="text" value={c.reason} onChange={(e) => setC(c.id, { reason: e.target.value })} /></div>
                    </>
                  )}
                </div>
              );
            })}
            {!inIndep(A).length && <div className="card muted">Ningún candidato pasó el tamizaje.</div>}
          </div>
          <div className="count">{fn.toPanel} de {fn.afterTamiz} se mantienen como ejes independientes y pasan al panel de importancia.</div>
        </>
      )}

      {tab === 3 && (
        <>
          <p className="muted">Califica cada criterio de 1 (nada importante) a 5 (crítico). La ponderación es el promedio.</p>
          <div className="acts">
            <div className="seg" role="group" aria-label="Método de calificación">
              <button type="button" aria-pressed={A.mode === 'ev'} onClick={() => set((s) => ({ ...s, mode: 'ev' }))}>Evaluadores</button>
              <button type="button" aria-pressed={A.mode === 'q'} onClick={() => set((s) => ({ ...s, mode: 'q' }))}>5 preguntas de evidencia</button>
            </div>
            {A.mode === 'ev' && !readOnly && <button className="btn sm" type="button" onClick={() => set((s) => ({ ...s, evaluators: [...s.evaluators, { id: uid('v'), name: 'Evaluador ' + (s.evaluators.length + 1) }] }))}>+ Agregar evaluador</button>}
          </div>
          {A.mode === 'q' && (
            <div className="card legend">
              {A.questions.map((q, i) => <div key={i}><b>Q{i + 1}</b><span>{q}</span></div>)}
            </div>
          )}
          {alive(A).length ? (
            <div className="card tbl">
              <table>
                <thead>
                  <tr>
                    <th>Criterio</th>
                    {A.mode === 'q'
                      ? cs.map((c) => <th key={c.key} className="n">{c.label}</th>)
                      : A.evaluators.map((e) => (
                        <th key={e.id} className="n">
                          <input type="text" value={e.name} aria-label="Nombre del evaluador" style={{ width: 110, padding: '4px 6px' }}
                            onChange={(ev) => set((s) => ({ ...s, evaluators: s.evaluators.map((x) => (x.id === e.id ? { ...x, name: ev.target.value } : x)) }))} />
                          {A.evaluators.length > 1 && !readOnly && <button type="button" className="btn icon sm" aria-label="Quitar evaluador"
                            onClick={() => set((s) => ({ ...s, evaluators: s.evaluators.filter((x) => x.id !== e.id), cands: s.cands.map((c) => { const se = { ...c.se }; delete se[e.id]; return { ...c, se }; }) }))}>✕</button>}
                        </th>
                      ))}
                    <th className="n">Ponderación</th>
                  </tr>
                </thead>
                <tbody>
                  {alive(A).map((c) => {
                    const m = mean(A, c);
                    return (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        {cs.map((x) => (
                          <td key={x.key} className="n">
                            <input type="number" min={1} max={5} step={0.1} inputMode="decimal" aria-label={`${c.name}, ${x.label}`}
                              value={scoreOf(A, c, x.key) ?? ''} disabled={readOnly}
                              onChange={(e) => {
                                const v = e.target.value === '' ? null : parseFloat(e.target.value);
                                if (A.mode === 'q') setC(c.id, { sq: c.sq.map((q, i) => (i === x.key ? v : q)) });
                                else setC(c.id, { se: { ...c.se, [x.key]: v } });
                              }} />
                          </td>
                        ))}
                        <td className="n"><span className={'pond' + (m == null ? ' no' : '')}>{f2(m)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="card muted">Ningún candidato pasó el tamizaje. Vuelve a la hoja 2.</div>}
          <div className="count">Deja la celda vacía si aún no calificas. Los valores fuera de 1 a 5 se ignoran.</div>
        </>
      )}

      {tab === 4 && (
        <>
          <p className="muted">Mueve el corte y observa qué criterios quedan. Busca una brecha real entre el último que pasa y el primero que no, y documenta por qué: es una convención del curso, no un estándar de la literatura.</p>
          <div className="card kpis">
            <div className="flow" role="group" aria-label="Embudo de selección"><b>{fn.total}</b><span>candidatos</span><span className="arrow" aria-hidden="true">→</span><b>{fn.afterTamiz}</b><span>tras tamizaje</span><span className="arrow" aria-hidden="true">→</span><b>{fn.toPanel}</b><span>al panel (independientes)</span><span className="arrow" aria-hidden="true">→</span><b>{ok.length}</b><span>finalistas</span></div>
            <span className={'pill' + (ok.length === criteriaCount ? '' : ' warn')}>
              {ok.length === criteriaCount ? `${ok.length} criterios: coincide con tu AHP` : `Tu AHP tiene ${criteriaCount} criterios; aquí hay ${ok.length}`}
            </span>
          </div>
          <div className="card cut">
            <div className="cut-head"><label className="lbl" htmlFor="cut" style={{ margin: 0 }}>Corte de ponderación (≥)</label><span className="cut-val">{A.cutoff.toFixed(1)}</span></div>
            <input id="cut" type="range" min={2} max={5} step={0.1} value={A.cutoff} disabled={readOnly}
              onChange={(e) => set((s) => ({ ...s, cutoff: Math.round(Number(e.target.value) * 10) / 10 }))} />
            <div className="muted" style={{ fontSize: 14 }}>
              {last && firstNo ? `Brecha: el último que pasa tiene ${f2(mean(A, last))} y el primero fuera tiene ${f2(mean(A, firstNo))} (diferencia ${((mean(A, last) ?? 0) - (mean(A, firstNo) ?? 0)).toFixed(2)}).` : last ? 'Todos los calificados pasan el corte.' : 'Ningún candidato pasa el corte.'}
            </div>
          </div>
          <div className="card"><PrioCutoffChart prio={A} /></div>

          <h3>Finalistas</h3>
          <p className="muted" style={{ fontSize: 13.5 }}>Verificación final (diapositiva 18): ¿cada finalista es medible para todas las alternativas? Si no, reformúlalo o vuelve a tamizar.</p>
          <div className="finals">
            {ok.map((c, i) => (
              <div className="card final" key={c.id}>
                <span className="rk">{i + 1}</span>
                <div className="top"><h3>{c.name}</h3><span className="mono">{f2(mean(A, c))}</span></div>
                <div><label className="lbl" htmlFor={`j-${c.id}`}>Por qué queda</label>
                  <textarea id={`j-${c.id}`} value={c.just} placeholder="Evidencia y razón de que sea crítico" onChange={(e) => setC(c.id, { just: e.target.value })} /></div>
                <div className="meas">
                  <label className="chk" htmlFor={`me-${c.id}`}>
                    <input id={`me-${c.id}`} type="checkbox" checked={c.measurable === true} disabled={readOnly}
                      onChange={(e) => setC(c.id, { measurable: e.target.checked ? true : null })} />
                    <span>Medible para todas las alternativas</span>
                  </label>
                  <label className="chk" htmlFor={`mn-${c.id}`}>
                    <input id={`mn-${c.id}`} type="checkbox" checked={c.measurable === false} disabled={readOnly}
                      onChange={(e) => setC(c.id, { measurable: e.target.checked ? false : null })} />
                    <span>No se puede medir para alguna</span>
                  </label>
                  {c.measurable != null && (
                    <input type="text" value={c.measEvid ?? ''} placeholder="Evidencia: fuente o dato que existe para cada alternativa" aria-label={`Evidencia de medibilidad de ${c.name}`}
                      disabled={readOnly} onChange={(e) => setC(c.id, { measEvid: e.target.value })} />
                  )}
                </div>
              </div>
            ))}
            {!ok.length && <div className="card muted">Baja el corte para que pase al menos un criterio.</div>}
          </div>

          <h3>Tabla de descarte, con la razón de cada uno</h3>
          <div className="card tbl">
            <table>
              <thead><tr><th>Criterio</th><th>Etapa de descarte</th><th>Razón</th></tr></thead>
              <tbody>
                {A.cands.filter((c) => c.stage !== 'keep').map((c) => (
                  <tr key={c.id}><td>{c.name}</td><td>{c.at === 'ind' ? 'Independencia' : 'Tamizaje'}{c.stage === 'merge' && cand(c.target) ? ` (fusionado con ${cand(c.target)!.name})` : ''}</td><td>{c.reason || <span className="muted">Sin razón</span>}</td></tr>
                ))}
                {no.map((c, i) => {
                  const m = mean(A, c);
                  return (
                    <tr key={c.id}>
                      <td>{c.name}{i === 0 && m != null && last && (mean(A, last) ?? 0) - m <= 0.5 && <> <span className="tag">en el límite</span></>}</td>
                      <td>Panel de importancia ({m == null ? 'sin calificar' : f2(m)})</td>
                      <td><input type="text" value={c.cutReason} placeholder="Razón del descarte" aria-label={`Razón para ${c.name}`} onChange={(e) => setC(c.id, { cutReason: e.target.value })} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!readOnly && (
            <div className="card">
              <h3>Siguiente paso</h3>
              <div className="acts" style={{ marginTop: 8 }}>
                <button className="btn primary" type="button" onClick={() => setMsg(onSync())}>Llevar los finalistas al AHP</button>
              </div>
              <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Agrega los criterios que falten en «Proyecto». No borra lo que ya tengas.</p>
              {msg && <p style={{ fontSize: 14, marginTop: 6 }}>{msg}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
