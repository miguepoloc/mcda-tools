'use client';

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

/** Agarradera: seis puntos, el símbolo que la gente ya reconoce como «arrastra para reordenar». */
function Grip() {
  return (
    <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true" focusable="false">
      {[3, 9, 15].flatMap((y) => [3, 11].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="currentColor" />))}
    </svg>
  );
}

/** Lista reordenable con tres formas de mover un elemento, para que ninguna sea obligatoria:
 * 1) arrastrar la agarradera con mouse, lápiz o dedo (eventos de puntero, no HTML5 drag: ese no funciona en pantallas táctiles);
 * 2) teclado: con la agarradera enfocada, flechas ↑/↓ (Inicio/Fin para el extremo);
 * 3) lo que el llamador quiera (p. ej. botones ↑↓ en el panel de la matriz), llamando a `onMove`.
 * El reordenamiento es en vivo: el elemento se mueve mientras arrastras, así ves cómo queda. Los anuncios de posición van a una
 * región `aria-live`. `renderItem` recibe la agarradera ya lista para meterla donde convenga en su fila. */
export default function ReorderList<T>({ items, getKey, getLabel, onMove, renderItem, className = '', itemClassName = '', label }: {
  items: readonly T[];
  getKey: (t: T) => string;
  getLabel: (t: T) => string;
  onMove: (from: number, to: number) => void;
  renderItem: (item: T, index: number, handle: ReactNode) => ReactNode;
  className?: string;
  itemClassName?: string;
  /** Nombre de lo que se ordena en plural y minúsculas, para los textos de ayuda («criterios»). */
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ key: string; index: number } | null>(null);
  const busy = useRef(false); // hay un movimiento pedido y React aún no lo pintó: ignora eventos hasta entonces
  const refocus = useRef<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [live, setLive] = useState('');
  const order = items.map(getKey).join('|');

  useLayoutEffect(() => {
    busy.current = false;
    // mover nodos del DOM le quita el foco al botón: se lo devolvemos para poder seguir con el teclado
    if (refocus.current) {
      box.current?.querySelector<HTMLElement>(`[data-rk="${CSS.escape(refocus.current)}"] .rl-handle`)?.focus();
      refocus.current = null;
    }
  }, [order]);
  useEffect(() => () => setDragKey(null), []);

  const move = (from: number, to: number, key: string) => {
    if (busy.current || to < 0 || to >= items.length || from === to) return;
    busy.current = true;
    onMove(from, to);
    setLive(`${getLabel(items[from]) || 'Elemento'}: posición ${to + 1} de ${items.length}`);
    if (drag.current) drag.current.index = to;
    refocus.current = key;
  };

  const indexAt = (y: number) => {
    const nodes = Array.from(box.current?.querySelectorAll<HTMLElement>(':scope > [data-rk]') ?? []);
    for (let i = 0; i < nodes.length; i++) {
      const r = nodes[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
    }
    return nodes.length - 1;
  };

  const handle = (item: T, i: number): ReactNode => {
    const key = getKey(item);
    const name = getLabel(item) || `${label.replace(/s$/, '')} ${i + 1}`;
    const onDown = (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { key, index: i };
      setDragKey(key);
    };
    const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
      const d = drag.current;
      if (!d || d.key !== key) return;
      move(d.index, indexAt(e.clientY), key);
    };
    const end = (e: PointerEvent<HTMLButtonElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      drag.current = null;
      setDragKey(null);
    };
    const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); move(i, i - 1, key); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); move(i, i + 1, key); }
      else if (e.key === 'Home') { e.preventDefault(); move(i, 0, key); }
      else if (e.key === 'End') { e.preventDefault(); move(i, items.length - 1, key); }
    };
    return (
      <button
        type="button" className="rl-handle" aria-label={`Reordenar «${name}»: arrastra, o usa las flechas arriba y abajo. Posición ${i + 1} de ${items.length}`}
        title="Arrastra para reordenar" onPointerDown={onDown} onPointerMove={onPointerMove} onPointerUp={end} onPointerCancel={end} onKeyDown={onKey}
      >
        <Grip />
      </button>
    );
  };

  return (
    <div ref={box} className={'rl ' + className}>
      {items.map((item, i) => (
        <div key={getKey(item)} data-rk={getKey(item)} className={`rl-item ${itemClassName}${dragKey === getKey(item) ? ' dragging' : ''}`}>
          {renderItem(item, i, handle(item, i))}
        </div>
      ))}
      <span className="sr-only" role="status" aria-live="polite">{live}</span>
    </div>
  );
}
