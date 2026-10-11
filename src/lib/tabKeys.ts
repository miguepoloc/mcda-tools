import type { KeyboardEvent } from 'react';

/** Teclado de un `role="tablist"` (patrón WAI-ARIA, activación automática): ←/→ (y ↑/↓) mueven al tab vecino con
 * vuelta circular, Inicio/Fin van al primero/último. Se usa en `onKeyDown` del contenedor; los botones llevan
 * `tabIndex={seleccionado ? 0 : -1}` para que Tab entre una sola vez a la lista. No cambia nada si la tecla
 * no es de navegación ni si el foco no está en un tab. */
export function tablistKeys(e: KeyboardEvent<HTMLElement>): void {
  const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
  const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])'));
  const at = tabs.indexOf(e.target as HTMLElement);
  if (at < 0 || tabs.length < 2) return;
  let to = at;
  if (e.key === 'Home') to = 0;
  else if (e.key === 'End') to = tabs.length - 1;
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = (at + 1) % tabs.length;
  else to = (at - 1 + tabs.length) % tabs.length;
  e.preventDefault();
  tabs[to].focus();
  tabs[to].click();
}
