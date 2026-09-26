'use client';

/** Controles flotantes del mapa que comparten el geovisor del dueño y la vista pública. */
import { PALETTES, PALETTE_KEYS, RAW_RAMP_CSS, classHex, rampCss, type PaletteKey } from '@/lib/geo/paint';
import { CLASS_ALTA, CLASS_EXCLUDED, CLASS_MODERADA, CLASS_NO_APTA } from '@/lib/geo/suitability';
import { BASEMAPS, type BasemapKey } from './GeoMap';
import { fmtNum } from './GeoBits';

export function BasemapChips({ value, onChange }: { value: BasemapKey; onChange: (k: BasemapKey) => void }) {
  return (
    <div className="gv-chips" role="group" aria-label="Mapa base">
      {(Object.keys(BASEMAPS) as BasemapKey[]).map((k) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{BASEMAPS[k].label}</button>
      ))}
    </div>
  );
}

export function StyleChips({ value, onChange }: { value: 'continuous' | 'classes'; onChange: (v: 'continuous' | 'classes') => void }) {
  return (
    <div className="gv-chips" role="group" aria-label="Estilo del resultado">
      <button type="button" aria-pressed={value === 'continuous'} onClick={() => onChange('continuous')}>Continuo</button>
      <button type="button" aria-pressed={value === 'classes'} onClick={() => onChange('classes')}>3 clases</button>
    </div>
  );
}

const PALETTE_SHORT: Record<PaletteKey, string> = { semaforo: 'Rojo–verde', daltonismo: 'Daltonismo' };

/** Paleta del resultado. La segunda es viridis (violeta → amarillo): se lee igual con cualquier tipo de daltonismo. */
export function PaletteChips({ value, onChange }: { value: PaletteKey; onChange: (v: PaletteKey) => void }) {
  return (
    <div className="gv-chips" role="group" aria-label="Paleta de colores">
      {PALETTE_KEYS.map((k) => (
        <button key={k} type="button" aria-pressed={value === k} title={PALETTES[k].label} onClick={() => onChange(k)}>{PALETTE_SHORT[k]}</button>
      ))}
    </div>
  );
}

export function ResultLegend({ style, thresholds, palette = 'semaforo', title = 'Idoneidad AHP + SIG' }: { style: 'continuous' | 'classes'; thresholds: { alta: number; media: number }; palette?: PaletteKey; title?: string }) {
  const hex = classHex(palette);
  return (
    <div className="gv-legend" role="group" aria-label={`Leyenda: ${title}`}>
      <b>{title} <span className="mono">(0–100)</span></b>
      {style === 'continuous' ? (
        <>
          <div className="ramp" style={{ background: rampCss(palette) }} aria-hidden="true" />
          <div className="ends mono"><span>0 · no apta</span><span>50</span><span>100 · óptima</span></div>
        </>
      ) : (
        <>
          <div className="row"><i style={{ background: hex[CLASS_ALTA] }} />Alta · ≥ {Math.round(thresholds.alta * 100)}</div>
          <div className="row"><i style={{ background: hex[CLASS_MODERADA] }} />Moderada · {Math.round(thresholds.media * 100)}–{Math.round(thresholds.alta * 100)}</div>
          <div className="row"><i style={{ background: hex[CLASS_NO_APTA] }} />No apta · &lt; {Math.round(thresholds.media * 100)}</div>
        </>
      )}
      <div className="row"><i style={{ background: hex[CLASS_EXCLUDED] }} />Exclusión (no se evalúa)</div>
    </div>
  );
}

export type LayerLegendSpec =
  | { kind: 'criterion'; label: string }
  | { kind: 'raw'; label: string; unit: string; min: number; max: number }
  | { kind: 'flag'; label: string; color: string; what: string }
  | { kind: 'parcels'; label: string; color: string }
  | { kind: 'diff'; label: string };

/** Leyenda de la capa que queda arriba (criterio, exclusión, parcelas, diferencia): con unidades y qué significa cada color. */
export function LayerLegend({ spec, palette = 'semaforo' }: { spec: LayerLegendSpec; palette?: PaletteKey }) {
  const P = PALETTES[palette];
  const rgb = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;
  return (
    <div className="gv-legend" role="group" aria-label={`Leyenda: ${spec.label}`}>
      <b>{spec.label}</b>
      {spec.kind === 'criterion' && (
        <>
          <div className="ramp" style={{ background: rampCss(palette) }} aria-hidden="true" />
          <div className="ends mono"><span>0 · mala</span><span>1 · óptima</span></div>
          <span className="sub">Idoneidad parcial del criterio, ya con su regla aplicada.</span>
        </>
      )}
      {spec.kind === 'raw' && (
        <>
          <div className="ramp" style={{ background: RAW_RAMP_CSS }} aria-hidden="true" />
          <div className="ends mono"><span>{fmtNum(spec.min)}</span><span>{fmtNum(spec.max)}{spec.unit ? ` ${spec.unit}` : ''}</span></div>
          <span className="sub">Valor de la capa, sin regla (aún no está asignada a un criterio).</span>
        </>
      )}
      {spec.kind === 'flag' && <div className="row"><i style={{ background: spec.color }} />{spec.what}</div>}
      {spec.kind === 'parcels' && <div className="row"><i style={{ background: spec.color }} />Parcela contigua de alta aptitud</div>}
      {spec.kind === 'diff' && (
        <>
          <div className="row"><i style={{ background: rgb(P.diffNeg) }} />Empeora respecto al escenario guardado</div>
          <div className="row"><i style={{ background: rgb(P.diffPos) }} />Mejora respecto al escenario guardado</div>
          <span className="sub">Sin color: cambio menor a 1 punto. Intensidad máxima a ±30 puntos.</span>
        </>
      )}
    </div>
  );
}
