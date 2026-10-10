'use client';

/** Editor de las clases del mapa (pestaña «Modelo»): dirección del índice (más apto / más riesgo) y de 2 a 8 clases
 * con nombre, color y rango. Los rangos son contiguos: el «desde» de cada clase es la frontera con la de abajo, así
 * que editarlo mueve esa frontera para las dos vecinas. Todo se maneja con teclado (campos nativos, botones). */
import {
  addClass, defaultClassName, DIR_TEXT, removeClass, resetClassDefs, resolveModel, setBreak, setClassDef, setDirection,
  type ClassSetup, type CutMode,
} from '@/lib/geo/classes';
import { MAX_CLASSES, MIN_CLASSES } from '@/lib/geo/suitability';
import { Num } from './GeoBits';

const CUT_LABEL: Record<CutMode, string> = { manual: 'manuales', quantile: 'cuantiles', jenks: 'rupturas naturales (Jenks)' };

export default function GeoClassesEditor({ setup, onSetup, hex, onCut, canCut }: {
  setup: ClassSetup;
  onSetup: (s: ClassSetup) => void;
  /** Color efectivo de cada código de clase (1..N) con la paleta actual. */
  hex: Record<number, string>;
  onCut: (mode: Exclude<CutMode, 'manual'>) => void;
  canCut: boolean;
}) {
  const m = resolveModel(setup);
  const n = m.n;
  const T = DIR_TEXT[setup.direction];
  const pc = (v: number) => Math.round(v * 100);
  const custom = setup.classes.some((c) => c.name || c.color);
  const zeroWidth = m.breaks.some((b, i) => i > 0 && b <= m.breaks[i - 1]) || m.breaks[0] <= 0 || m.breaks[n - 2] >= 1;
  const top = Array.from({ length: n }, (_, k) => n - 1 - k);

  return (
    <section className="gv-sec" aria-labelledby="gv-cls-h">
      <header><h4 id="gv-cls-h">Clases del mapa</h4></header>

      <fieldset className="gv-dir">
        <legend>Un valor alto del índice significa…</legend>
        <label><input type="radio" name="gv-dir" checked={setup.direction === 'suitability'} onChange={() => onSetup(setDirection(setup, 'suitability'))} /> más apto (mejor)</label>
        <label><input type="radio" name="gv-dir" checked={setup.direction === 'risk'} onChange={() => onSetup(setDirection(setup, 'risk'))} /> más riesgo (peor)</label>
      </fieldset>
      <p className="gv-hint">
        {setup.direction === 'risk'
          ? 'En riesgo la paleta va de verde (bajo) a rojo (alto) y un veto fuerza el índice al máximo: la celda se rotula «condición crítica».'
          : 'En aptitud la paleta va de rojo (baja) a verde (alta) y un veto deja el índice en 0 (la celda cuenta como no apta).'}
        {' '}Cambiar la dirección no mueve los cortes ni tus nombres.
      </p>

      <div className="gv-cls-list" role="list" aria-label="Clases, de la más alta a la más baja">
        {top.map((i) => {
          const lo = i === 0 ? 0 : pc(m.breaks[i - 1]);
          const hi = i === n - 1 ? 100 : pc(m.breaks[i]);
          const name = m.names[i];
          return (
            <div className="gv-cls" role="listitem" key={i}>
              <input type="color" className="gv-cls-color" aria-label={`Color de la clase ${name}`} value={hex[i + 1] ?? '#888888'}
                onChange={(e) => onSetup(setClassDef(setup, i, { color: e.target.value }))} />
              <input type="text" className="gv-cls-name" aria-label={`Nombre de la clase ${i + 1} de ${n}`} value={setup.classes[i]?.name ?? ''}
                placeholder={defaultClassName(setup.direction, i, n)} maxLength={40}
                onChange={(e) => onSetup(setClassDef(setup, i, { name: e.target.value }))} />
              <span className="gv-cls-range">
                <span>desde</span>
                <Num label={`Valor inicial en % de la clase ${name}`} width={58} min={0} max={100} disabled={i === 0} value={lo}
                  onChange={(v) => onSetup({ ...setup, breaks: setBreak(setup.breaks, i - 1, Math.max(0, Math.min(100, v)) / 100), cut: 'manual' })} />
                <span className="mono muted">hasta {hi}{i === n - 1 ? '' : ' (no incl.)'}</span>
              </span>
              <button type="button" className="btn sm" aria-label={`Quitar la clase ${name}`} disabled={n <= MIN_CLASSES}
                title={n <= MIN_CLASSES ? `Se necesitan al menos ${MIN_CLASSES} clases` : 'Quitar la clase: su rango pasa a la vecina'}
                onClick={() => onSetup(removeClass(setup, i))}>×</button>
            </div>
          );
        })}
        <div className="gv-cls gv-cls-fixed" role="listitem">
          <i style={{ background: "var(--geo-excl)" }} aria-hidden="true" /><span>Exclusión (no se evalúa)</span>
        </div>
      </div>
      {zeroWidth && <p className="gv-hint warn" role="alert">Alguna clase quedó sin rango (dos cortes iguales o en 0 ó 100): no tendrá celdas. Sepáralos o quita la clase.</p>}

      <div className="gv-row-acts">
        <button type="button" className="btn sm" disabled={n >= MAX_CLASSES} onClick={() => onSetup(addClass(setup))}>+ Agregar clase</button>
        {custom && <button type="button" className="btn sm" onClick={() => onSetup(resetClassDefs(setup))}>Restablecer nombres y colores</button>}
      </div>
      <p className="gv-hint">{n} de {MAX_CLASSES} clases (mínimo {MIN_CLASSES}). Cada clase cubre desde su valor hasta el de la de arriba; el rango del índice va de 0 a 100.</p>

      <div className="gv-row-acts">
        <button type="button" className="btn sm" disabled={!canCut} onClick={() => onCut('quantile')}>Dividir en cuantiles</button>
        <button type="button" className="btn sm" disabled={!canCut} onClick={() => onCut('jenks')}>Rupturas naturales (Jenks)</button>
      </div>
      {setup.cut !== 'manual' ? (
        <p className="gv-hint" role="status">
          Cortes calculados por <b>{CUT_LABEL[setup.cut]}</b> sobre el {T.noun} actual y <b>congelados</b>: no se recalculan solos si cambias pesos, reglas o capas.{' '}
          <button type="button" className="gv-linkbtn" disabled={!canCut} onClick={() => onCut(setup.cut as Exclude<CutMode, 'manual'>)}>Recalcular</button>
        </p>
      ) : (
        <p className="gv-hint">Cuantiles reparte las celdas en grupos del mismo tamaño; Jenks busca los saltos naturales del {T.noun}. En ambos casos los cortes quedan fijos hasta que pulses «Recalcular» o los edites.</p>
      )}
    </section>
  );
}
