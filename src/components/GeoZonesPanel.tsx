'use client';

/** Pestaña «Zonas»: resumen del índice por polígono de referencia (comuna, sector…) con tabla ordenable, mapa
 * coroplético y CSV. El cálculo vive en `lib/geo/zonal.ts`; aquí solo se elige la capa y se presenta. */
import type { Direction } from '@/lib/geo/suitability';
import { DIR_TEXT } from '@/lib/geo/classes';
import { zoneOrderHeading, ZONE_WARN } from '@/lib/geo/zonal';
import type { GeoConfig } from '@/lib/types';
import GeoZonesTable, { type ZoneRowView } from './GeoZonesTable';

export type ZoneLayerOpt = { key: string; label: string; count: number; fields: string[] };

type Props = {
  layers: ZoneLayerOpt[];
  sel: GeoConfig['zonal'] | undefined;
  onSel: (z: GeoConfig['zonal'] | undefined) => void;
  ready: boolean;
  rows: ZoneRowView[] | null;
  classNames: string[];
  direction: Direction;
  rampCss: string;
  choropleth: boolean; onChoropleth: (on: boolean) => void;
  onCsv: () => void;
  selectedKey: string | null; onSelect: (key: string) => void;
  nPoints: number;
  /** Ir a la pestaña Capas (para subir los polígonos como «Referencia»). */
  onGoLayers: () => void;
};

export default function GeoZonesPanel(p: Props) {
  const T = DIR_TEXT[p.direction];
  const layer = p.layers.find((l) => l.key === p.sel?.layer);
  const without = p.rows ? p.rows.filter((r) => r.meanPct === null).length : 0;
  const indexLabel = p.direction === 'risk' ? 'Riesgo medio' : 'Idoneidad media';

  if (!p.layers.length) {
    return (
      <div className="gv-sec-stack">
        <section className="gv-sec">
          <header><h4>Resumen por zonas</h4></header>
          <p className="gv-hint">Para saber <b>qué sector tiene más {p.direction === 'risk' ? 'riesgo' : 'idoneidad'}</b> hace falta una capa de polígonos (comunas, barrios, sectores). Súbela en la pestaña «Capas» y márcala como <b>Referencia</b>: se guarda tal cual, se dibuja sobre el mapa y no entra al modelo.</p>
          <div className="gv-row-acts"><button type="button" className="btn sm" onClick={p.onGoLayers}>Ir a «Capas»</button></div>
        </section>
      </div>
    );
  }

  return (
    <div className="gv-sec-stack">
      <section className="gv-sec">
        <header><h4>Resumen por zonas</h4></header>
        <label className="gv-field"><span>Capa de zonas</span>
          <select value={p.sel?.layer ?? ''} onChange={(e) => {
            const key = e.target.value;
            if (!key) { p.onSel(undefined); return; }
            const l = p.layers.find((x) => x.key === key);
            p.onSel({ layer: key, ...(l?.fields[0] ? { nameField: l.fields[0] } : {}), ...(p.sel?.popLayer ? { popLayer: p.sel.popLayer, popField: p.sel.popField } : {}) });
          }}>
            <option value="">— elige una capa de polígonos —</option>
            {p.layers.map((l) => <option key={l.key} value={l.key}>{l.label} ({l.count} polígonos)</option>)}
          </select>
        </label>
        {layer && (
          <label className="gv-field"><span>Atributo con el nombre de cada zona</span>
            <select value={p.sel?.nameField ?? ''} onChange={(e) => p.onSel({ ...(p.sel as NonNullable<typeof p.sel>), nameField: e.target.value || undefined })}>
              <option value="">— sin nombre (Zona 1, Zona 2…) —</option>
              {layer.fields.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
        )}
        {layer && layer.count > ZONE_WARN && <p className="gv-hint warn" role="status">Esta capa tiene {layer.count.toLocaleString('es-CO')} polígonos (más de {ZONE_WARN}): la tabla y el mapa pueden ir lentos. Se calcula igual.</p>}
        <p className="gv-hint">Cada celda de la grilla pertenece a la zona que contiene su centro; solo cuentan las celdas <b>evaluadas</b> (la exclusión y lo que queda fuera del área de estudio no cuentan como 0 %). Si dos zonas se superponen, gana la última del archivo.</p>
      </section>

      {layer && !p.ready && <p className="gv-hint">Hace falta un mapa calculado (define el área, sube capas y asígnalas a criterios) para resumir por zonas.</p>}

      {layer && p.ready && p.rows && (
        <section className="gv-sec">
          <header><h4>{p.rows.length} zonas · {T.noun}</h4></header>
          {without > 0 && <p className="gv-hint warn" role="status">{without} zona{without === 1 ? '' : 's'} sin área evaluada (quedan fuera del área de estudio, en exclusión o más pequeñas que una celda): aparecen al final, sin índice.</p>}
          <label className="gv-check"><input type="checkbox" checked={p.choropleth} onChange={(e) => p.onChoropleth(e.target.checked)} /> Colorear el mapa por {indexLabel.toLowerCase()} de cada zona</label>
          {p.choropleth && <div className="gv-zramp" aria-hidden="true"><span>0</span><i style={{ background: p.rampCss }} /><span>100</span></div>}
          {p.choropleth && <p className="gv-hint">Para ver solo los colores de las zonas, oculta «Resultado» en la pestaña Capas. Gris = sin área evaluada.</p>}
          <GeoZonesTable rows={p.rows} classNames={p.classNames} indexLabel={indexLabel} heading={zoneOrderHeading(p.direction)} showPoints={p.nPoints > 0}
            selectedKey={p.selectedKey} onSelect={p.onSelect} />
          <div className="gv-row-acts"><button type="button" className="btn sm" onClick={p.onCsv}>Descargar CSV</button></div>
          <p className="gv-hint">{T.disclaimer} El promedio es el de las celdas evaluadas de cada zona, no ponderado por población.</p>
        </section>
      )}
    </div>
  );
}
