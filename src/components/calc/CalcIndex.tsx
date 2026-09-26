'use client';

import { useEffect, useState } from 'react';

export type CalcIndexItem = { id: string; label: string };

/** Índice fijo del desglose: una barra pegada arriba con un enlace por bloque (Método · Pesos · Selección · Sensibilidad). Al pulsar abre el
 * bloque (son <details> cerrados) y baja hasta él; marca con aria-current el bloque que va pasando por la pantalla y actualiza la URL con
 * `#id`, así el enlace se puede copiar y al volver el bloque se abre solo (ver CalcSection). Con `prefers-reduced-motion` no hay animación. */
export default function CalcIndex({ items, title = 'Desglose de cálculo' }: { items: CalcIndexItem[]; title?: string }) {
  const [active, setActive] = useState<string | null>(null);
  const [present, setPresent] = useState<Set<string> | null>(null);
  const key = items.map((i) => i.id).join('|');

  // Un bloque puede no pintarse (p. ej. AHP sin juicios): su enlace no debe existir.
  useEffect(() => { setPresent(new Set(items.filter((i) => document.getElementById(i.id)).map((i) => i.id))); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      let cur: string | null = null;
      for (const it of items) {
        const el = document.getElementById(it.id);
        if (el && el.getBoundingClientRect().top <= 160) cur = it.id;
      }
      setActive(cur);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const go = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    if (el instanceof HTMLDetailsElement) el.open = true;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    window.history.replaceState(null, '', '#' + id);
  };
  const closeAll = () => document.querySelectorAll<HTMLDetailsElement>('details.calc-sec-fold').forEach((d) => { d.open = false; });
  const shown = present ? items.filter((i) => present.has(i.id)) : items;
  if (!shown.length) return null;
  return (
    <nav className="calc-index" aria-label={title}>
      <span className="calc-index-t">{title}</span>
      {shown.map((it) => (
        <a key={it.id} href={'#' + it.id} onClick={(e) => go(e, it.id)} aria-current={active === it.id ? 'true' : undefined}>{it.label}</a>
      ))}
      <button type="button" className="calc-index-close" onClick={closeAll}>Cerrar todos los bloques</button>
    </nav>
  );
}
