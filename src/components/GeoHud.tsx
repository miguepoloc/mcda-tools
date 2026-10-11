'use client';

/** Controles flotantes del mapa que comparten el geovisor del dueño y la vista pública. */
import { PALETTES, PALETTE_KEYS, RAW_RAMP_CSS, SENS_RGB, classHexOf, modelRampCss, rampCss, type PaletteKey } from '@/lib/geo/paint';
import { CLASS_EXCLUDED, type Direction } from '@/lib/geo/suitability';
import { DIR_TEXT } from '@/lib/geo/classes';
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

export function StyleChips({ value, onChange, nClasses = 3 }: { value: 'continuous' | 'classes'; onChange: (v: 'continuous' | 'classes') => void; nClasses?: number }) {
  return (
    <div className="gv-chips" role="group" aria-label="Estilo del resultado">
      <button type="button" aria-pressed={value === 'continuous'} onClick={() => onChange('continuous')}>Continuo</button>
      <button type="button" aria-pressed={value === 'classes'} onClick={() => onChange('classes')}>{nClasses} clases</button>
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

/** Clases que dibuja la leyenda (lo cumple `ClassModel`): de menor a mayor índice, `breaks` = N−1 cortes 0–1. */
export type LegendModel = { n: number; direction: Direction; names: string[]; breaks: number[]; colors?: (string | undefined)[] };

/** Leyenda del resultado. Con `model` dibuja las N clases (nombre y rango, de la más alta a la más baja, con el
 * texto del rango además del color); sin él, las 3 de aptitud con los umbrales `thresholds` (proyectos antiguos). */
export function ResultLegend({ style, model, thresholds, palette = 'semaforo', title }: { style: 'continuous' | 'classes'; model?: LegendModel; thresholds?: { alta: number; media: number }; palette?: PaletteKey; title?: string }) {
  const m: LegendModel = model ?? {
    n: 3, direction: 'suitability', names: ['No apta', 'Moderada', 'Alta aptitud'],
    breaks: thresholds ? [thresholds.media, thresholds.alta] : [0.45, 0.7],
  };
  const T = DIR_TEXT[m.direction];
  const hex = classHexOf(m, palette);
  const heading = title ?? T.legendTitle;
  const pc = (v: number) => Math.round(v * 100);
  return (
    <div className="gv-legend" role="group" aria-label={`Leyenda: ${heading}`}>
      <b>{heading} <span className="mono">(0–100)</span></b>
      {style === 'continuous' ? (
        <>
          {/* Misma rampa que pinta el mapa (sale del modelo de clases): marcas en los cortes reales y, en los extremos,
              el nombre de la clase más baja y de la más alta, así que en riesgo el extremo alto dice «Riesgo alto». */}
          <div className="ramp-wrap">
            <div className="ramp" style={{ background: modelRampCss(m, palette) }} aria-hidden="true" />
            {m.breaks.map((b, i) => <i key={i} className="tick" style={{ left: `${b * 100}%` }} aria-hidden="true" />)}
          </div>
          <div className="cuts mono" aria-hidden="true">{m.breaks.map((b, i) => <span key={i} style={{ left: `${b * 100}%` }}>{pc(b)}</span>)}</div>
          <div className="ends"><span>{m.names[0]} · 0</span><span>100 · {m.names[m.n - 1]}</span></div>
          <span className="sr-only">Cortes entre clases: {m.breaks.map(pc).join(', ')}.</span>
        </>
      ) : (
        <>
          {Array.from({ length: m.n }, (_, k) => m.n - 1 - k).map((i) => (
            <div className="row" key={i}>
              <i style={{ background: hex[i + 1] }} />
              {m.names[i]} · {i === m.n - 1 ? `≥ ${pc(m.breaks[i - 1])}` : i === 0 ? `< ${pc(m.breaks[0])}` : `${pc(m.breaks[i - 1])}–${pc(m.breaks[i])}`}
            </div>
          ))}
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
  | { kind: 'diff'; label: string }
  | { kind: 'sens'; label: string; cases: number; max: number };

/** Leyenda de la capa que queda arriba (criterio, exclusión, parcelas, diferencia): con unidades y qué significa cada color. */
export function LayerLegend({ spec, palette = 'semaforo', direction = 'suitability' }: { spec: LayerLegendSpec; palette?: PaletteKey; direction?: Direction }) {
  const risk = direction === 'risk';
  const P = PALETTES[palette];
  const rgb = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;
  return (
    <div className="gv-legend" role="group" aria-label={`Leyenda: ${spec.label}`}>
      <b>{spec.label}</b>
      {spec.kind === 'criterion' && (
        <>
          <div className="ramp" style={{ background: rampCss(palette, direction) }} aria-hidden="true" />
          <div className="ends mono"><span>{risk ? '0 · bajo' : '0 · mala'}</span><span>{risk ? '1 · máximo' : '1 · óptima'}</span></div>
          <span className="sub">{risk ? 'Riesgo parcial' : 'Idoneidad parcial'} del criterio, ya con su regla aplicada.</span>
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
      {spec.kind === 'parcels' && <div className="row"><i style={{ background: spec.color }} />{risk ? 'Zona contigua de la clase más alta' : 'Parcela contigua de alta aptitud'}</div>}
      {spec.kind === 'sens' && (
        <>
          <div className="row"><i style={{ background: rgb(SENS_RGB) }} />Celda que cambia de clase al variar los pesos</div>
          <span className="sub">{spec.max > 1 ? `Más opaco = cambia en más de los ${spec.cases} casos (hasta ${spec.max}).` : `Cambia en ${spec.cases === 1 ? 'el caso elegido' : 'al menos uno de los ' + spec.cases + ' casos'}.`} Sin color: la clase no cambia.</span>
        </>
      )}
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
