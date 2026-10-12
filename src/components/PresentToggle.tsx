'use client';

import { useEffect, useState } from 'react';
import { applyPresent, isPresentApplied, readPresent, writePresent, PRESENT_KEY } from '@/lib/present';

/** Conmutador «Modo presentación» (U4): letra más grande, contraste ≥ 7:1, bordes y foco gruesos y sin textos
 * secundarios, para proyectar. Aplica `data-present="1"` al <html> (los estilos viven en `app/present.css`) y recuerda
 * la preferencia en localStorage con try/catch. El script de arranque del layout ya lo aplicó antes de hidratar; aquí
 * solo se sincroniza el estado del botón (por eso arranca en `false`: igual en servidor y cliente). */
export default function PresentToggle() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    // Lo que dejó el script de arranque manda; si no hubo (otra ruta de entrada), se lee el almacenamiento.
    const initial = isPresentApplied() || readPresent();
    if (initial) applyPresent(true);
    setOn(initial);
    const sync = (e: StorageEvent) => {
      if (e.key !== PRESENT_KEY) return;
      const v = e.newValue === '1';
      applyPresent(v);
      setOn(v);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  function toggle() {
    const next = !on;
    applyPresent(next);
    writePresent(next);
    setOn(next);
  }

  return (
    <button
      type="button"
      className={'btn sm present-toggle' + (on ? ' on' : '')}
      aria-pressed={on}
      onClick={toggle}
      title="Letra grande, alto contraste y menos texto secundario, para proyectar"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
      <span>Modo presentación</span>
    </button>
  );
}
