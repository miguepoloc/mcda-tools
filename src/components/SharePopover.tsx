'use client';

/** Ventana flotante tipo «disclosure» (botón + panel): se cierra con Escape (devolviendo el foco al botón) y al
 * pulsar fuera. No atrapa el foco: es un panel informativo, no un diálogo modal. Si hay un diálogo modal abierto
 * dentro (p. ej. el QR grande), Escape lo cierra a él primero. */
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import './share.css';

export default function SharePopover({
  trigger, triggerClassName, triggerLabel, children, align = 'left', style, onOpenChange,
}: {
  trigger: ReactNode;
  triggerClassName: string;
  /** Nombre accesible del botón cuando el texto visible no basta. */
  triggerLabel?: string;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  style?: CSSProperties;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const set = (v: boolean) => { setOpen(v); onOpenChange?.(v); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.modal-overlay')) return; // lo cierra el diálogo
      setOpen(false); onOpenChange?.(false); btn.current?.focus();
    };
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) { setOpen(false); onOpenChange?.(false); }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open, onOpenChange]);

  return (
    <div className="sh-pop" ref={box} style={style}>
      <button ref={btn} type="button" className={triggerClassName} aria-expanded={open} aria-controls={open ? panelId : undefined}
        aria-haspopup="true" aria-label={triggerLabel} onClick={() => set(!open)}>
        {trigger}
      </button>
      {open && (
        <div id={panelId} className={'sh-panel' + (align === 'right' ? ' right' : '')}>
          {children(() => { set(false); btn.current?.focus(); })}
        </div>
      )}
    </div>
  );
}
