'use client';

/** Editor de estilo de UNA capa (G3), que se abre bajo su fila en la pestaña «Capas»: rampa de color (capas ráster de
 * entrada), color plano (exclusión / área), relleno, borde, grosor y opacidad del relleno (vectores). Es solo la interfaz:
 * recibe el estilo actual y avisa los cambios; guardar y aplicar lo hace GeoVisor (ver `lib/geo/layerStyle.ts`). */
import { LAYER_RAMPS, LAYER_RAMP_KEYS, stopsCss, type LayerRampKey } from '@/lib/geo/paint';
import { WEIGHT_MAX, WEIGHT_MIN, styleStops, type LayerStyle } from '@/lib/geo/layerStyle';
import './geo-layerstyle.css';

/** Trazo de una gota (icono del botón «Estilo»). */
export const STYLE_ICON = 'M12 2.7s7 6.3 7 11.3a7 7 0 11-14 0c0-5 7-11.3 7-11.3z';

export type StyleKind = 'criterion' | 'raw' | 'flag' | 'vector' | 'reference';
export type StyleDefaults = { color?: string; weight?: number; fillOp?: number };
type Patch = Partial<Record<keyof LayerStyle, unknown>>;

type Props = {
  kind: StyleKind; label: string; style: LayerStyle | undefined; defaults: StyleDefaults;
  /** CSS de la rampa «de siempre» (criterio: la de la paleta del resultado; cruda: azul→amarillo). */
  autoRampCss?: string;
  onPatch: (patch: Patch) => void; onReset: () => void; onClose: () => void;
};

export default function GeoLayerStyle({ kind, label, style, defaults, autoRampCss, onPatch, onReset, onClose }: Props) {
  const s = style ?? {};
  const hasRamp = kind === 'criterion' || kind === 'raw';
  const isVec = kind === 'vector' || kind === 'reference';
  const ramp: LayerRampKey = s.ramp ?? 'auto';
  const stops = styleStops(s);
  const preview = stops ? stopsCss(stops) : autoRampCss;
  const color = s.color ?? defaults.color ?? '#22D3EE';
  const border = s.border ?? color;
  const weight = s.weight ?? defaults.weight ?? 1.5;
  const fillOp = s.fillOp ?? defaults.fillOp ?? 0.12;
  const customised = Object.keys(s).some((k) => k !== 'on' && k !== 'op');
  return (
    <div className="gv-lstyle" role="group" aria-label={`Estilo de ${label}`}>
      {hasRamp && (
        <>
          <label className="gv-field"><span>Rampa de color</span>
            <select value={ramp} onChange={(e) => onPatch({ ramp: e.target.value === 'auto' ? undefined : e.target.value, ...(e.target.value === 'auto' ? { rev: undefined } : {}) })}>
              {LAYER_RAMP_KEYS.map((k) => <option key={k} value={k}>{k === 'auto' ? (kind === 'criterion' ? 'La del resultado (paleta del mapa)' : 'Azul–amarillo (por defecto)') : LAYER_RAMPS[k].label}</option>)}
            </select>
          </label>
          <label className="gv-check"><input type="checkbox" checked={!!s.rev} disabled={ramp === 'auto'} onChange={(e) => onPatch({ rev: e.target.checked ? true : undefined })} /> Invertir la rampa</label>
          {preview && <div className="gv-lstyle-ramp" style={{ background: preview }} aria-hidden="true" />}
          <p className="gv-hint">Solo cambia cómo se ve esta capa; no altera la regla ni el resultado.</p>
        </>
      )}
      {kind === 'flag' && (
        <label className="gv-field gv-lstyle-color"><span>Color</span>
          <input type="color" value={color} onChange={(e) => onPatch({ color: e.target.value })} aria-label={`Color de ${label}`} />
        </label>
      )}
      {isVec && (
        <>
          <div className="gv-lstyle-pair">
            <label className="gv-field gv-lstyle-color"><span>{kind === 'reference' ? 'Color' : 'Relleno'}</span>
              <input type="color" value={color} onChange={(e) => onPatch({ color: e.target.value })} aria-label={`Color de relleno de ${label}`} />
            </label>
            <label className="gv-field gv-lstyle-color"><span>Borde</span>
              <input type="color" value={border} onChange={(e) => onPatch({ border: e.target.value })} aria-label={`Color de borde de ${label}`} />
            </label>
            {s.border && <button type="button" className="btn sm" onClick={() => onPatch({ border: undefined })}>Borde = color</button>}
          </div>
          <label className="gv-field"><span>Grosor del borde · {weight} px</span>
            <input type="range" min={WEIGHT_MIN} max={WEIGHT_MAX} step={0.5} value={weight} onChange={(e) => onPatch({ weight: Number(e.target.value) })} aria-label={`Grosor del borde de ${label}`} />
          </label>
          <label className="gv-field"><span>Opacidad del relleno · {Math.round(fillOp * 100)} %</span>
            <input type="range" min={0} max={1} step={0.05} value={fillOp} onChange={(e) => onPatch({ fillOp: Number(e.target.value) })} aria-label={`Opacidad del relleno de ${label}`} />
          </label>
          <div className="gv-lstyle-prev" aria-hidden="true">
            <i style={{ background: color, opacity: Math.max(fillOp, 0.08), border: `${Math.min(weight, 6)}px solid ${border}` }} />
          </div>
        </>
      )}
      <div className="gv-row-acts">
        <button type="button" className="btn sm" disabled={!customised} onClick={onReset}>Restablecer estilo</button>
        <button type="button" className="btn sm" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}
