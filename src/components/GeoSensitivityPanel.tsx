'use client';

/** «Sensibilidad de los pesos» (pestaña «Modelo»; G15, ref. Chen et al. 2010): cuánto cambia el mapa si el peso de
 * un criterio sube o baja ±10 % y ±20 %. Tabla por criterio (% de celdas que cambian de clase y ha por clase) y
 * capa «celdas que cambian» en el mapa. Presentacional: el cálculo (por trozos) y el estado viven en GeoVisor. */
import { useId, useState } from 'react';
import { deltaLabel, type ChangeSel, type SensitivityResult } from '@/lib/geo/sensitivity';
import './geo-scenarios.css';
import './geo-sensitivity.css';

const nf0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const signed = (v: number, f: Intl.NumberFormat) => (Math.abs(v) < 0.05 ? f.format(0) : (v > 0 ? '+' : '−') + f.format(Math.abs(v)));

export type SensitivityPanelProps = {
  result: SensitivityResult | null;
  /** El resultado se calculó con otras reglas, pesos, clases o capas que las actuales. */
  stale: boolean;
  /** Progreso mientras corre (null = no corre). */
  running: { done: number; total: number } | null;
  /** Hay mapa calculado (capas con reglas asignadas). */
  ready: boolean;
  /** Criterios con regla y capa (con uno solo no hay con quién repartir el peso). */
  nRules: number;
  exploring: boolean;
  names: string[];
  sel: ChangeSel;
  onSel: (s: ChangeSel) => void;
  /** Capa «celdas que cambian» visible en el mapa. */
  mapOn: boolean;
  onMapOn: (on: boolean) => void;
  /** Lo que muestra el mapa: casos incluidos, mayor conteo por celda y celdas que cambian en algún caso. */
  mapInfo: { cases: number; max: number; cells: number } | null;
  swatch: string;
  onRun: () => void;
  onCancel: () => void;
  onClear: () => void;
};

export default function GeoSensitivityPanel(p: SensitivityPanelProps) {
  const critId = useId(), deltaId = useId(), detId = useId(), noteId = useId();
  const [detail, setDetail] = useState(0.2);
  const r = p.result;
  const risk = r?.direction === 'risk';
  // Clases de mayor a menor índice, como en el resto del geovisor; «malo» = la clase extrema peor de la dirección.
  const order = r ? [...Array(r.nClasses).keys()].reverse() : [];
  const worst = r ? (risk ? r.nClasses - 1 : 0) : 0;
  const baseHa = r?.baseClassHa ?? [];

  return (
    <section className="gv-sec" aria-labelledby="gv-sens-h">
      <header><h4 id="gv-sens-h">Sensibilidad de los pesos</h4></header>
      <p className="gv-hint" id={noteId}>
        ¿Cuánto cambia el mapa si un peso estuviera algo mal? Se sube y baja el peso de cada criterio ±10 % y ±20 % (los demás se reescalan en proporción) y se ve qué celdas cambian de clase.
        Usa las reglas, vetos y cortes actuales{p.exploring ? ' y los pesos explorados' : ' y los pesos del panel de expertos'}.
      </p>

      {!p.running && (
        <div className="gv-row-acts">
          <button type="button" className="btn sm" disabled={!p.ready || p.nRules < 2} onClick={p.onRun} aria-describedby={noteId}>
            {r ? 'Recalcular la sensibilidad' : 'Calcular la sensibilidad'}
          </button>
          {r && <button type="button" className="btn sm" onClick={p.onClear}>Quitar el análisis</button>}
        </div>
      )}
      {!p.ready && <p className="gv-hint">Disponible al haber un mapa calculado (capas con reglas asignadas).</p>}
      {p.ready && p.nRules < 2 && <p className="gv-hint warn">Hacen falta al menos dos criterios con regla: con uno solo no hay con quién repartir el peso.</p>}

      {p.running && (
        <div className="gv-sens-prog" role="status">
          <span>Calculando… paso {nf0.format(p.running.done)} de {nf0.format(p.running.total)}. Puedes seguir usando el mapa.</span>
          <progress max={p.running.total} value={p.running.done} aria-label="Avance del cálculo de sensibilidad" />
          <div className="gv-row-acts"><button type="button" className="btn sm" onClick={p.onCancel}>Cancelar</button></div>
        </div>
      )}

      {r && p.stale && !p.running && (
        <p className="gv-hint warn" role="status">Este análisis es de antes de tu último cambio (pesos, reglas, clases o capas). Pulsa «Recalcular» para actualizarlo.</p>
      )}

      {r && (
        <>
          <div className="gv-sens-ctl">
            <label htmlFor={critId}>Criterio en el mapa
              <select id={critId} value={String(p.sel.criterion)} onChange={(e) => p.onSel({ ...p.sel, criterion: e.target.value === 'all' ? 'all' : Number(e.target.value) })}>
                <option value="all">Todos los criterios</option>
                {r.criteria.map((c, k) => <option key={k} value={k}>{c.label}</option>)}
              </select>
            </label>
            <label htmlFor={deltaId}>Variación en el mapa
              <select id={deltaId} value={String(p.sel.delta)} onChange={(e) => p.onSel({ ...p.sel, delta: e.target.value === 'any' ? 'any' : Number(e.target.value) })}>
                <option value="any">Cualquiera (±10 % y ±20 %)</option>
                {r.deltas.map((d) => <option key={d} value={d}>{deltaLabel(d)}</option>)}
              </select>
            </label>
          </div>
          <label className="gv-sens-check">
            <input type="checkbox" checked={p.mapOn} onChange={(e) => p.onMapOn(e.target.checked)} />
            <span><i className="gv-sens-sw" style={{ background: p.swatch }} aria-hidden="true" />Mostrar en el mapa las celdas que cambian de clase</span>
          </label>
          {p.mapInfo && (
            <p className="gv-hint" role="status">
              {p.mapInfo.cells === 0
                ? 'Con esta selección ninguna celda cambia de clase: el mapa es estable frente a esa variación.'
                : <><b>{nf0.format(p.mapInfo.cells)}</b> celdas cambian de clase en al menos 1 de {p.mapInfo.cases} {p.mapInfo.cases === 1 ? 'caso' : 'casos'}{p.mapInfo.max > 1 ? `; las más inestables, en ${p.mapInfo.max}` : ''}. Más opaco = cambia en más casos.</>}
            </p>
          )}

          <div className="gv-sens-wrap">
            <table className="gv-sc-table gv-sens-table">
              <caption>% del área evaluada ({nf0.format(r.evaluableHa)} ha) que cambia de clase al variar el peso de cada criterio. Subrayada: la variación que más celdas mueve.</caption>
              <thead>
                <tr>
                  <th scope="col">Criterio</th><th scope="col" className="num">Peso</th>
                  {r.deltas.map((d) => <th key={d} scope="col" className="num">{deltaLabel(d)}</th>)}
                </tr>
              </thead>
              <tbody>
                {r.criteria.map((c, k) => (
                  <tr key={k}>
                    <th scope="row">{c.label}</th>
                    <td className="num">{nf1.format(c.effective * 100)} %</td>
                    {r.deltas.map((d) => {
                      const cs = r.cases.find((x) => x.criterion === k && x.delta === d);
                      if (!cs) return <td key={d} className="num">—</td>;
                      const isMax = cs.changedPct > 0 && Math.abs(cs.changedPct - r.maxChangedPct[k]) < 1e-9;
                      return <td key={d} className={'num' + (isMax ? ' max' : '')}><b>{nf1.format(cs.changedPct)} %</b><small>{nf0.format(cs.changedHa)} ha</small></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="gv-sens-ctl">
            <label htmlFor={detId}>Hectáreas por clase con la variación
              <select id={detId} value={String(detail)} onChange={(e) => setDetail(Number(e.target.value))}>
                {r.deltas.map((d) => <option key={d} value={d}>{deltaLabel(d)}</option>)}
              </select>
            </label>
          </div>
          <div className="gv-sens-wrap">
            <table className="gv-sc-table gv-sens-table">
              <caption>Hectáreas en cada clase al variar en {deltaLabel(detail)} el peso de cada criterio. Entre paréntesis, la diferencia con el mapa actual.</caption>
              <thead>
                <tr>
                  <th scope="col">Criterio variado</th>
                  {order.map((i) => <th key={i} scope="col" className="num">{p.names[i] ?? `Clase ${i + 1}`}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Mapa actual</th>
                  {order.map((i) => <td key={i} className="num base"><b>{nf0.format(baseHa[i] ?? 0)} ha</b></td>)}
                </tr>
                {r.criteria.map((c, k) => {
                  const cs = r.cases.find((x) => x.criterion === k && Math.abs(x.delta - detail) < 1e-9);
                  if (!cs) return null;
                  return (
                    <tr key={k}>
                      <th scope="row">{c.label}</th>
                      {order.map((i) => {
                        const d = cs.classHa[i] - (baseHa[i] ?? 0);
                        const bad = i === worst ? d > 0 : d < 0;
                        const tone = Math.abs(d) < 0.5 ? '' : bad ? ' bad' : ' good';
                        return <td key={i} className={'num d' + tone}><b>{nf0.format(cs.classHa[i])} ha</b><small>({signed(d, nf0)} ha)</small></td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="gv-hint">Un criterio al que el mapa casi no reacciona admite un peso aproximado; uno que mueve muchas celdas merece juicios cuidadosos de los expertos. Los cambios son de clase, no de índice: dependen de dónde caen los cortes.</p>
        </>
      )}
    </section>
  );
}
