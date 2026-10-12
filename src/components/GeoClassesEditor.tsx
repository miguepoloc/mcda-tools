'use client';

/** Editor de las clases del mapa (pestaña «Modelo»): dirección del índice (más apto / más riesgo) y de 2 a 8 clases
 * con nombre, color y rango. Los rangos son contiguos: cada corte es la frontera entre dos clases vecinas, con un
 * solo número editable (lo lleva la clase de arriba; la de abajo lo muestra como «a menos de …»). Arriba, una franja
 * proporcional 0–100 resume el reparto. Todo se maneja con teclado: Intro aplica el corte, ↑/↓ cambian ±1 (Mayús ±5). */
import { useEffect, useId, useRef, useState } from 'react';
import {
  addClass, defaultClassName, DIR_TEXT, removeClass, resetClassDefs, resolveModel, setBreak, setClassDef, setDirection,
  type ClassSetup, type CutMode,
} from '@/lib/geo/classes';
import { classStrip, fmtCut, stepCut, stripAlt, stripTicks, validateCut } from '@/lib/geo/classStrip';
import { MAX_CLASSES, MIN_CLASSES } from '@/lib/geo/suitability';
import ConfirmDialog from './ConfirmDialog';
import './geo-classes.css';

const CUT_LABEL: Record<CutMode, string> = { manual: 'manuales', quantile: 'cuantiles', jenks: 'rupturas naturales (Jenks)' };

/** Nombre de la clase como valor real del campo (el de por defecto también): el placeholder solo aparece si se vacía.
 * Mientras se escribe, el borrador es local (vaciarlo no debe rellenarse solo con el nombre por defecto). */
function NameField({ value, fallback, label, onChange }: { value: string; fallback: string; label: string; onChange: (name: string) => void }) {
  const [t, setT] = useState(value);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setT(value); }, [value]);
  return (
    <input type="text" className="gv-cls-name" aria-label={label} value={t} placeholder={fallback} maxLength={40} autoComplete="off"
      onFocus={() => { focused.current = true; }}
      onChange={(e) => { setT(e.target.value); onChange(e.target.value); }}
      onBlur={() => { focused.current = false; setT(value); }} />
  );
}

/** Un corte (en %): se edita como texto, valida en línea y aplica con Intro, con las flechas o al salir del campo. */
function CutField({ breaks, k, label, onApply }: { breaks: number[]; k: number; label: string; onApply: (k: number, frac: number) => void }) {
  const errId = useId();
  const committed = fmtCut(breaks[k]);
  const [t, setT] = useState(committed);
  const [err, setErr] = useState('');
  useEffect(() => { setT(committed); setErr(''); }, [committed]);

  const parse = (raw: string) => (raw.trim() === '' ? NaN : Number(raw.replace(',', '.')));
  const check = (raw: string) => validateCut(breaks, k, parse(raw));
  const apply = (raw: string): boolean => {
    const c = check(raw);
    if (!c.ok) { setErr(c.message); return false; }
    setErr('');
    setT(fmtCut(c.value));
    if (c.value !== breaks[k]) onApply(k, c.value);
    return true;
  };
  return (
    <span className="gv-cls-cutwrap">
      <input type="text" inputMode="decimal" className="gv-cls-cut" aria-label={label} value={t} autoComplete="off"
        aria-invalid={err ? true : undefined} aria-describedby={err ? errId : undefined}
        title="Intro aplica; ↑ ↓ cambian 1 (Mayús: 5)"
        onChange={(e) => { setT(e.target.value); const c = check(e.target.value); setErr(c.ok ? '' : c.message); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); apply(t); }
          else if (e.key === 'Escape') { setT(committed); setErr(''); }
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const cur = parse(t);
            const next = stepCut(Number.isFinite(cur) ? cur : Number(committed), e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
            const c = check(String(next));
            setT(String(next));
            if (c.ok) apply(String(next)); else setErr(c.message);
          }
        }}
        onBlur={() => { if (t !== committed && !apply(t)) { setT(committed); setErr(''); } }} />
      <span aria-hidden="true">%</span>
      {err && <span id={errId} className="gv-cls-err" role="alert">{err}</span>}
    </span>
  );
}

export default function GeoClassesEditor({ setup, onSetup, hex, onCut, canCut, viewStyle, published }: {
  setup: ClassSetup;
  onSetup: (s: ClassSetup) => void;
  /** Color efectivo de cada código de clase (1..N) con la paleta actual. */
  hex: Record<number, string>;
  onCut: (mode: Exclude<CutMode, 'manual'>) => void;
  canCut: boolean;
  /** Vista del mapa: en «Continuo» los cortes no se ven, y el editor pasa a «N clases» al editar. */
  viewStyle: 'continuous' | 'classes';
  /** El proyecto ya está publicado: quitar una clase pide confirmación (sus nombres están en la vista pública). */
  published: boolean;
}) {
  const m = resolveModel(setup);
  const n = m.n;
  const T = DIR_TEXT[setup.direction];
  const custom = setup.classes.some((c) => c.name || c.color);
  const zeroWidth = m.breaks.some((b, i) => i > 0 && b <= m.breaks[i - 1]) || m.breaks[0] <= 0 || m.breaks[n - 2] >= 1;
  const top = Array.from({ length: n }, (_, k) => n - 1 - k);
  const segs = classStrip(m.breaks, m.names);
  const ticks = stripTicks(m.breaks);
  const minId = useId();
  const [ask, setAsk] = useState<number | null>(null);
  const atMin = n <= MIN_CLASSES;
  const remove = (i: number) => {
    if (atMin) return;
    if (published) setAsk(i); else onSetup(removeClass(setup, i));
  };

  return (
    <section className="gv-sec" aria-labelledby="gv-cls-h">
      <header><h3 id="gv-cls-h">Clases del mapa</h3></header>

      <fieldset className="gv-dir">
        <legend>Un valor alto del índice significa…</legend>
        <label><input type="radio" name="gv-dir" checked={setup.direction === 'suitability'} onChange={() => onSetup(setDirection(setup, 'suitability'))} /> más apto (mejor)</label>
        <label><input type="radio" name="gv-dir" checked={setup.direction === 'risk'} onChange={() => onSetup(setDirection(setup, 'risk'))} /> más riesgo (peor)</label>
      </fieldset>
      <p className="gv-hint">
        {setup.direction === 'risk'
          ? 'Un valor alto es más riesgo: la paleta va de verde (bajo) a rojo (alto). Cada clase cubre un rango del índice de 0 a 100.'
          : 'Un valor alto es más apto: la paleta va de rojo (baja) a verde (alta). Cada clase cubre un rango del índice de 0 a 100.'}
      </p>
      <details className="gv-cls-how">
        <summary>Cómo funciona</summary>
        <ul>
          <li>{setup.direction === 'risk'
            ? 'Un veto fuerza el índice al máximo: la celda se rotula «condición crítica» y cuenta en la clase más alta.'
            : 'Un veto deja el índice en 0: la celda cuenta como no apta, en la clase más baja.'}</li>
          <li>Cambiar la dirección no mueve los cortes ni tus nombres.</li>
          <li>Cada corte es la frontera entre dos clases: lo escribes una vez, en la clase de arriba; la de abajo llega «a menos de» ese valor.</li>
          <li>En un corte: Intro lo aplica, ↑ ↓ lo cambian de 1 en 1 (con Mayús, de 5 en 5) y Esc deshace lo escrito.</li>
        </ul>
      </details>

      <figure className="gv-strip">
        <div className="gv-strip-bar" role="img" aria-label={stripAlt(segs)}>
          {segs.map((s) => (
            <span key={s.i} className="gv-strip-seg" style={{ width: `${s.width}%`, background: hex[s.i + 1] ?? '#888888' }} />
          ))}
        </div>
        <div className="gv-strip-axis" aria-hidden="true">
          <span className="end l">0</span>
          {ticks.map((t) => <span key={t.pos} className="tick" style={{ left: `${t.pos}%` }}>{t.label}</span>)}
          <span className="end r">100</span>
        </div>
      </figure>

      <div className="gv-cls-list" role="list" aria-label="Clases, de la más alta a la más baja">
        {top.map((i) => {
          const name = m.names[i];
          const hi = i === n - 1 ? '100' : `menos de ${fmtCut(m.breaks[i])}`;
          return (
            <div className="gv-cls" role="listitem" key={i}>
              <input type="color" className="gv-cls-color" aria-label={`Color de la clase ${name}`} value={hex[i + 1] ?? '#888888'}
                onChange={(e) => onSetup(setClassDef(setup, i, { color: e.target.value }))} />
              <NameField value={setup.classes[i]?.name ?? defaultClassName(setup.direction, i, n)} fallback={defaultClassName(setup.direction, i, n)}
                label={`Nombre de la clase ${i + 1} de ${n}`} onChange={(v) => onSetup(setClassDef(setup, i, { name: v }))} />
              <button type="button" className="btn sm" aria-label={`Quitar clase ${name}`} aria-disabled={atMin || undefined} aria-describedby={atMin ? minId : undefined}
                title={atMin ? `Se necesitan al menos ${MIN_CLASSES} clases` : 'Quitar la clase: su rango pasa a la vecina'}
                onClick={() => remove(i)}>×</button>
              <div className="gv-cls-range">
                {i === 0 ? (
                  <span className="mono">de 0 a {hi}</span>
                ) : (
                  <>
                    <span className="mono">de</span>
                    <CutField breaks={m.breaks} k={i - 1} label={`Corte entre «${m.names[i - 1]}» y «${name}», en %`}
                      onApply={(k, frac) => onSetup({ ...setup, breaks: setBreak(setup.breaks, k, frac), cut: 'manual' })} />
                    <span className="mono">a {hi}</span>
                    <span className="gv-cls-edge muted">por debajo: {m.names[i - 1]}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div className="gv-cls gv-cls-fixed" role="listitem">
          <i style={{ background: 'var(--geo-excl)' }} aria-hidden="true" /><span>Exclusión (no se evalúa)</span>
        </div>
      </div>
      {zeroWidth && <p className="gv-hint warn" role="alert">Alguna clase quedó sin rango (dos cortes iguales o en 0 ó 100): no tendrá celdas. Sepáralos o quita la clase.</p>}

      <div className="gv-row-acts">
        <button type="button" className="btn sm" disabled={n >= MAX_CLASSES} onClick={() => onSetup(addClass(setup))}>+ Agregar clase</button>
        {custom && <button type="button" className="btn sm" onClick={() => onSetup(resetClassDefs(setup))}>Restablecer nombres y colores</button>}
      </div>
      <p className="gv-hint" id={minId}>{n} de {MAX_CLASSES} clases (mínimo {MIN_CLASSES}{atMin ? `: no se puede quitar otra` : ''}).</p>
      {viewStyle === 'continuous' && <p className="gv-hint gv-cls-note" role="status">El mapa se muestra por clases mientras editas.</p>}

      <div className="gv-row-acts">
        <button type="button" className="btn sm" disabled={!canCut} onClick={() => onCut('quantile')}>Dividir en cuantiles</button>
        <button type="button" className="btn sm" disabled={!canCut} onClick={() => onCut('jenks')}>Rupturas naturales (Jenks)</button>
      </div>
      {setup.cut !== 'manual' ? (
        <p className="gv-hint" role="status">
          Cortes por <b>{CUT_LABEL[setup.cut]}</b> sobre el {T.noun} actual, <b>congelados</b>: no se recalculan solos al cambiar pesos, reglas o capas.{' '}
          <button type="button" className="gv-linkbtn" disabled={!canCut} onClick={() => onCut(setup.cut as Exclude<CutMode, 'manual'>)}>Recalcular</button>
        </p>
      ) : (
        <p className="gv-hint">Cuantiles reparte las celdas en grupos del mismo tamaño y Jenks busca los saltos naturales; los cortes quedan fijos hasta «Recalcular» o hasta que los edites.</p>
      )}

      {ask !== null && (
        <ConfirmDialog
          title={`Quitar la clase «${m.names[ask]}»`}
          description={<>El mapa ya está publicado con estas clases. Si la quitas, su rango pasa a la clase vecina y la vista pública cambiará cuando vuelvas a publicar.</>}
          confirmLabel="Quitar clase"
          onClose={() => setAsk(null)}
          onConfirm={() => { const i = ask; setAsk(null); onSetup(removeClass(setup, i)); }} />
      )}
    </section>
  );
}
