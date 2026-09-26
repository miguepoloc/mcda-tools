'use client';

/** Recorrido guiado (coachmarks) del geovisor: resalta una zona, explica y avanza. Arranca solo la
 * primera vez (se recuerda en localStorage) y se puede repetir con el botón «Recorrido». */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type TourStep = { sel: string; tab?: 'capas' | 'modelo' | 'exportar'; title: string; text: string };

const KEY = 'mcda-gv-tour-v1';

export function tourSeen(): boolean { try { return localStorage.getItem(KEY) === '1'; } catch { return true; } }
function markSeen() { try { localStorage.setItem(KEY, '1'); } catch { /* sin storage */ } }

type Props = { steps: TourStep[]; open: boolean; onClose: () => void; onTab: (t: 'capas' | 'modelo' | 'exportar') => void };

export default function GeoTour({ steps, open, onClose, onTab }: Props) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[i];
  const nextRef = useRef<HTMLButtonElement>(null);
  // Quien llama a «Recorrido» con el teclado debe poder seguirlo sin buscar la tarjeta: el foco pasa al botón
  // principal en cada paso y vuelve a donde estaba al cerrar.
  const opener = useRef<HTMLElement | null>(null);

  const measure = useCallback(() => {
    const el = step ? document.querySelector(step.sel) : null;
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useEffect(() => { if (open) setI(0); }, [open]);
  useEffect(() => {
    if (!open) return;
    if (i === 0) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const t = setTimeout(() => nextRef.current?.focus({ preventScroll: true }), 60);
    return () => clearTimeout(t);
  }, [open, i]);
  useEffect(() => {
    if (open) return;
    const o = opener.current;
    opener.current = null;
    if (o && document.contains(o) && o !== document.body) o.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => { if (open && step?.tab) onTab(step.tab); }, [open, step, onTab]);
  useLayoutEffect(() => {
    if (!open || !step) return;
    const t = setTimeout(() => { document.querySelector(step.sel)?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, 120);
    // El layout puede seguir moviéndose (fuentes, cambio de pestaña): se re-mide un rato.
    const m = [200, 450, 800, 1400].map((ms) => setTimeout(measure, ms));
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); m.forEach(clearTimeout); window.removeEventListener('resize', measure); };
  }, [open, step, measure]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { markSeen(); onClose(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);

  if (!open || !step) return null;
  const vw = typeof window === 'undefined' ? 1200 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const W = Math.min(340, vw - 24);
  let left = 12, top = 80;
  if (rect) {
    left = Math.min(Math.max(12, rect.left + rect.width / 2 - W / 2), vw - W - 12);
    top = rect.bottom + 12 + 190 < vh ? rect.bottom + 12 : Math.max(12, rect.top - 190 - 12);
    if (rect.width > vw * 0.5 && rect.height > vh * 0.5) { top = vh - 210; }
  }
  const last = i === steps.length - 1;
  const close = () => { markSeen(); onClose(); };

  // Portal a <body>: `.gv-wrap` lleva `transform: translateX(-50%)`, y un ancestro con transform pasa a ser el bloque
  // contenedor de los `position: fixed` — el resaltado y la tarjeta quedarían corridos por el desplazamiento de ese contenedor.
  return createPortal(
    <div className="gv-tour" role="dialog" aria-label="Recorrido guiado" aria-describedby="gv-tour-text">
      {rect && <div className="gv-tour-hole" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} />}
      <div className="gv-tour-card" style={{ left, top, width: W }}>
        <div className="mono step">Paso {i + 1} de {steps.length}</div>
        <b>{step.title}</b>
        <p id="gv-tour-text" aria-live="polite">{step.text}</p>
        <div className="acts">
          <button type="button" className="btn sm" onClick={close}>Saltar</button>
          {i > 0 && <button type="button" className="btn sm" onClick={() => setI(i - 1)}>Atrás</button>}
          <button type="button" ref={nextRef} className="btn primary sm" onClick={() => (last ? close() : setI(i + 1))}>{last ? 'Terminar' : 'Siguiente'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
