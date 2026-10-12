'use client';

/** Regla del mapa (G11): mide distancias (m/km) y áreas (m²/ha/km²) con clics sobre el mapa. Es un componente
 * aparte: GeoVisor solo le reenvía los clics y el movimiento del puntero y pinta el dibujo que devuelve.
 *
 * Accesible: botón con aria-label y aria-pressed, resultado en una región aria-live, lista de vértices con sus tramos,
 * alta de vértices por coordenadas (sin ratón) y Escape para salir. Con el mapa enfocado, Intro agrega un vértice
 * en el centro (lo hace GeoMap) y las flechas desplazan el mapa. */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Icon } from './GeoBits';
import type { VectorOverlay } from './GeoMap';
import { addVertex, close, clear, EMPTY, fmtCoord, fmtLength, haversine, measure, removeAt, summaryText, toFeatureCollection, undo, MAX_VERTICES, type MeasureState } from '@/lib/geo/measure';
import './geo-measure.css';

export type GeoMeasureHandle = {
  /** Reenvía un clic del mapa; `true` si la regla lo consumió (entonces no es una consulta de punto). */
  click: (lat: number, lon: number) => boolean;
  /** Posición del puntero (para el tramo «hasta el cursor»). */
  move: (lat: number, lon: number) => void;
};

const RULER = 'M21.3 15.3a2.4 2.4 0 010 3.4l-2.6 2.6a2.4 2.4 0 01-3.4 0L2.7 8.7a2.4 2.4 0 010-3.4l2.6-2.6a2.4 2.4 0 013.4 0zM14.5 12.5l2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2';
const OVERLAY_ID = '__measure';

type Props = {
  /** El dibujo de la medición (o null si no hay nada que mostrar). */
  onOverlay: (o: VectorOverlay | null) => void;
  /** Avisa si la regla se activa o desactiva (p. ej. para apagar el modo «Agregar punto»). */
  onActiveChange?: (active: boolean) => void;
};

const parseNum = (t: string) => Number(t.trim().replace(',', '.'));

const GeoMeasure = forwardRef<GeoMeasureHandle, Props>(function GeoMeasure({ onOverlay, onActiveChange }, ref) {
  const [active, setActive] = useState(false);
  const [st, setSt] = useState<MeasureState>(EMPTY);
  const [cursorM, setCursorM] = useState<number | null>(null);
  const [latT, setLatT] = useState('');
  const [lonT, setLonT] = useState('');
  const [coordErr, setCoordErr] = useState('');
  const activeRef = useRef(false);
  const stRef = useRef<MeasureState>(EMPTY);
  const raf = useRef(0);
  const btn = useRef<HTMLButtonElement>(null);
  const cb = useRef({ onOverlay, onActiveChange });
  cb.current = { onOverlay, onActiveChange };

  const apply = useCallback((next: MeasureState) => { stRef.current = next; setSt(next); }, []);
  const setOn = useCallback((on: boolean) => {
    activeRef.current = on;
    setActive(on);
    if (!on) { apply(EMPTY); setCursorM(null); setCoordErr(''); }
    cb.current.onActiveChange?.(on);
  }, [apply]);

  useImperativeHandle(ref, () => ({
    click: (lat, lon) => {
      if (!activeRef.current) return false;
      apply(addVertex(stRef.current, lat, lon));
      return true;
    },
    move: (lat, lon) => {
      if (!activeRef.current) return;
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => {
        const cur = stRef.current;
        setCursorM(activeRef.current && !cur.closed && cur.pts.length ? haversine(cur.pts[cur.pts.length - 1], { lat, lon }) : null);
      });
    },
  }), [apply]);

  // Dibujo sobre el mapa
  useEffect(() => {
    if (!active || !st.pts.length) { cb.current.onOverlay(null); return; }
    cb.current.onOverlay({ id: OVERLAY_ID, fc: toFeatureCollection(st), color: '#FACC15', visible: true, weight: 3, fillOpacity: 0.2 });
  }, [active, st]);
  useEffect(() => () => { cancelAnimationFrame(raf.current); cb.current.onOverlay(null); }, []);

  // Escape sale de la regla
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOn(false);
      btn.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, setOn]);

  const m = measure(st);
  const addByCoords = () => {
    const lat = parseNum(latT), lon = parseNum(lonT);
    if (latT.trim() === '' || lonT.trim() === '' || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      setCoordErr('Escribe latitud (−90 a 90) y longitud (−180 a 180) en grados decimales.');
      return;
    }
    if (st.closed) { setCoordErr('El polígono está cerrado: deshaz el cierre para añadir vértices.'); return; }
    if (st.pts.length >= MAX_VERTICES) { setCoordErr(`Tope de ${MAX_VERTICES} vértices alcanzado.`); return; }
    setCoordErr('');
    apply(addVertex(st, lat, lon));
    setLatT(''); setLonT('');
  };

  return (
    <div className="gm-root">
      <button ref={btn} type="button" className="gv-fit gm-btn" aria-pressed={active} aria-expanded={active} aria-controls="gm-panel"
        aria-label={active ? 'Regla: salir de la medición de distancias y áreas' : 'Regla: medir distancias y áreas en el mapa'}
        title="Medir distancias y áreas (Esc para salir)" onClick={() => setOn(!active)}>
        <Icon d={RULER} size={15} /> Regla
      </button>

      {active && (
        <section id="gm-panel" className="gm-panel" aria-label="Regla del mapa">
          <p className="gm-hint">Haz clic en el mapa para añadir vértices. Sin ratón: enfoca el mapa, muévelo con las flechas y pulsa Intro para añadir un vértice en el centro, o escribe coordenadas abajo.</p>

          <div className="gm-result" role="status" aria-live="polite" aria-atomic="true">{summaryText(st)}</div>
          {cursorM !== null && !st.closed && <p className="gm-cursor mono">Hasta el cursor: {fmtLength(cursorM)} · total {fmtLength(m.total + cursorM)}</p>}

          <div className="gm-actions">
            <button type="button" className="btn sm" onClick={() => apply(close(st))} disabled={st.closed || st.pts.length < 3}
              title="Une el último vértice con el primero y calcula el área">Cerrar polígono</button>
            <button type="button" className="btn sm" onClick={() => apply(undo(st))} disabled={!st.pts.length}
              aria-label={st.closed ? 'Reabrir el polígono' : 'Deshacer el último vértice'}>{st.closed ? 'Reabrir' : 'Deshacer'}</button>
            <button type="button" className="btn sm" onClick={() => apply(clear())} disabled={!st.pts.length}>Limpiar</button>
            <button type="button" className="btn sm" onClick={() => { setOn(false); btn.current?.focus(); }}>Salir (Esc)</button>
          </div>

          {st.pts.length > 0 && (
            <ol className="gm-list" aria-label="Vértices de la medición">
              {st.pts.map((p, i) => {
                const leg = i > 0 ? m.legs[i - 1] : null;
                return (
                  <li key={i}>
                    <span className="gm-n">{i + 1}</span>
                    <span className="gm-c mono">{fmtCoord(p)}</span>
                    <span className="gm-d">{leg ? `+${fmtLength(leg.m)} · ${fmtLength(leg.cum)}` : 'inicio'}</span>
                    <button type="button" className="gm-x" aria-label={`Quitar el vértice ${i + 1}`} onClick={() => apply(removeAt(st, i))}>×</button>
                  </li>
                );
              })}
              {st.closed && m.legs.length > 0 && (
                <li className="gm-closing"><span className="gm-n" aria-hidden="true">↺</span><span className="gm-c">Cierre al vértice 1</span><span className="gm-d">+{fmtLength(m.legs[m.legs.length - 1].m)} · {fmtLength(m.total)}</span></li>
              )}
            </ol>
          )}

          <form className="gm-coords" onSubmit={(e) => { e.preventDefault(); addByCoords(); }}>
            <label>Latitud<input type="text" inputMode="decimal" value={latT} onChange={(e) => setLatT(e.target.value)} placeholder="11,24" aria-invalid={coordErr ? true : undefined} aria-describedby={coordErr ? 'gm-err' : undefined} /></label>
            <label>Longitud<input type="text" inputMode="decimal" value={lonT} onChange={(e) => setLonT(e.target.value)} placeholder="-74,20" aria-invalid={coordErr ? true : undefined} aria-describedby={coordErr ? 'gm-err' : undefined} /></label>
            <button type="submit" className="btn sm">Añadir vértice</button>
          </form>
          {coordErr && <p id="gm-err" className="gm-err" role="alert">{coordErr}</p>}

          <p className="gm-note">Distancias por haversine y áreas sobre el elipsoide WGS84 (lados como arcos geodésicos), no en grados planos.</p>
        </section>
      )}
    </div>
  );
});

export default GeoMeasure;
