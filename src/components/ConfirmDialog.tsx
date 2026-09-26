'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/** Diálogo de confirmación accesible para acciones destructivas o irreversibles (suspender, eliminar la
 * cuenta…). Escape lo cierra (salvo mientras trabaja), Tab queda atrapado dentro, el foco entra al primer
 * campo (o a «Cancelar») y vuelve a donde estaba al cerrar, y el fondo no se desplaza. Lo que se pide
 * escribir o elegir va en `children`, entre el texto y los botones; los errores del servidor van en `error`,
 * bajo el campo y anunciados a lectores de pantalla. Usa los estilos `.modal-overlay`/`.modal` de siempre. */
export default function ConfirmDialog({
  title, description, tone = 'danger', confirmLabel, busyLabel = 'Un momento…', confirmDisabled = false,
  busy = false, error, onConfirm, onClose, children,
}: {
  title: string;
  description?: ReactNode;
  tone?: 'danger' | 'neutral';
  confirmLabel: string;
  busyLabel?: string;
  confirmDisabled?: boolean;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  // El cierre vigente en cada tecla (el efecto de abajo se monta una sola vez: sin esto usaría el `onClose` del
  // primer render, con el estado de entonces).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Al empezar a trabajar, «Cancelar» y «Confirmar» pasan a estar deshabilitados y el foco caería al <body>
  // (el Tab dejaría de quedar atrapado y un lector de pantalla pierde el lugar): se ancla en el diálogo.
  useEffect(() => { if (busy) box.current?.focus(); }, [busy]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const nodes = box.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (box.current?.querySelector<HTMLElement>('input, textarea') ?? nodes?.[0])?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busyRef.current) { e.preventDefault(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !box.current) return;
      const f = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      const at = document.activeElement;
      // `at === box.current`: el diálogo mismo tiene el foco (mientras trabaja); Tab entra al primer control.
      if (e.shiftKey && (at === first || at === box.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (at === last || at === box.current)) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      // Si el botón que abrió el diálogo ya no existe (p. ej. la fila cambió tras la acción), no se deja el foco en el aire.
      if (previous?.isConnected) previous.focus?.();
    };
  }, []);

  return (
    <div className="modal-overlay">
      <div className="modal" ref={box} role="alertdialog" aria-modal="true" aria-busy={busy || undefined} tabIndex={-1} aria-labelledby={`${id}-t`} aria-describedby={description ? `${id}-d` : undefined}>
        <div className={'warn-icon' + (tone === 'neutral' ? ' neutral' : '')} aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {tone === 'danger'
              ? <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>
              : <><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></>}
          </svg>
        </div>
        <h3 id={`${id}-t`}>{title}</h3>
        {description && <div id={`${id}-d`} className="modal-desc">{description}</div>}
        {children}
        {error && <p className="err" role="alert" style={{ marginTop: 4 }}>{error}</p>}
        <div className="acts">
          <button type="button" className="btn sm" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className={'btn sm' + (tone === 'danger' ? ' danger' : ' primary')} onClick={onConfirm} disabled={confirmDisabled || busy}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
