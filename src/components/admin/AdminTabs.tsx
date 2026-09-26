'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

import { ADMIN_TABS, type AdminTab } from './tabs';

/** Navegación del backoffice. Son enlaces reales (`?tab=…`), no estado del cliente: cada sección tiene su
 * URL (se puede compartir y el botón «atrás» funciona) y la página se renderiza en el servidor. Por eso es una
 * `<nav>` con `aria-current="page"` y no un `role="tablist"`: el patrón de pestañas ARIA es para paneles de la
 * MISMA página; aquí cada opción cambia de página y los enlaces ya funcionan con Tab/Enter. `badges` marca lo que
 * pide atención (p. ej. cuentas suspendidas) con número Y texto accesible, no solo color. */
export default function AdminTabs({ active, badges = {} }: { active: AdminTab; badges?: Partial<Record<AdminTab, { n: number; label: string }>> }) {
  const nav = useRef<HTMLElement>(null);

  // En 375 px las cinco pestañas no caben y la barra se desplaza: que la activa quede a la vista al llegar.
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const box = nav.current;
    if (!el || !box || box.scrollWidth <= box.clientWidth) return;
    box.scrollLeft = Math.max(0, el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2);
  }, [active]);

  return (
    <nav className="admin-tabs" aria-label="Secciones del backoffice" ref={nav}>
      {ADMIN_TABS.map((t) => {
        const b = badges[t.id];
        return (
          <Link key={t.id} href={`/admin?tab=${t.id}`} className={'admin-tab' + (active === t.id ? ' active' : '')} aria-current={active === t.id ? 'page' : undefined} scroll={false}>
            {t.label}
            {b && b.n > 0 && <span className="tab-badge" title={b.label}>{b.n}<span className="sr-only"> {b.label}</span></span>}
          </Link>
        );
      })}
    </nav>
  );
}
