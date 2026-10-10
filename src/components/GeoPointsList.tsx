'use client';

/** Ranking de puntos como LISTA de filas de dos líneas (cabe a 280 px sin desplazar de lado), compartida por el panel del
 * dueño (con renombrar, centrar y eliminar) y la vista pública (solo lectura). Cada fila es un botón que se expande en
 * línea (un solo punto abierto) con la ficha del punto. La clase y el estado van en texto, no solo en color. La lista no
 * tiene scroll propio: desplaza el panel. */
import { Fragment, useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { PointStatus } from '@/lib/geo/pointEval';
import { filterByName, orderByRank, SEARCH_THRESHOLD } from '@/lib/geo/pointLabels';
import { Icon, ICONS } from './GeoBits';

export type RankRow = {
  key: string; rank: number | null; name: string; lat: number; lon: number;
  pct: number | null; label: string; color: string; status: PointStatus; vetoed: boolean;
};

const LOCATE = 'M12 2v4M12 18v4M2 12h4M18 12h4M12 8a4 4 0 100 8 4 4 0 000-8z';

type Props = {
  rows: RankRow[];
  /** Texto del orden: «Más apto primero» / «Mayor riesgo primero». */
  heading: string;
  /** Rótulo de la insignia de veto («Vetada» / «Condición crítica»). */
  criticalLabel: string;
  /** Punto abierto (null = ninguno). */
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  onCenter: (key: string) => void;
  /** Solo el dueño: renombrar y eliminar. */
  onRename?: (key: string, name: string) => void;
  onDelete?: (key: string) => void;
  /** Contenido de la expansión de la fila (la ficha del punto). Sin él, solo coordenadas y acciones. */
  renderDetail?: (row: RankRow) => ReactNode;
  /** Controles propios del llamador entre el encabezado y la lista (p. ej. el interruptor de etiquetas). */
  toolbar?: ReactNode;
};

export default function GeoPointsList({ rows, heading, criticalLabel, selectedKey, onSelect, onCenter, onRename, onDelete, renderDetail, toolbar }: Props) {
  const uid = useId();
  const [query, setQuery] = useState('');
  const ordered = useMemo(() => orderByRank(rows), [rows]);
  const shown = useMemo(() => filterByName(ordered, query), [ordered, query]);
  const searchable = rows.length > SEARCH_THRESHOLD;
  const q = searchable ? query.trim() : '';
  const firstNa = shown.findIndex((r) => r.status !== 'ok');
  const hasRanked = shown.some((r) => r.status === 'ok');

  // El punto elegido en el mapa se trae a la vista dentro del panel (un solo desplazamiento: el del panel).
  useEffect(() => {
    if (!selectedKey) return;
    const el = document.getElementById(`${uid}-r-${selectedKey}`);
    const calm = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' });
  }, [selectedKey, uid]);

  function onListKey(e: KeyboardEvent<HTMLUListElement>) {
    const t = e.target as HTMLElement;
    if (!t.hasAttribute('data-prow')) return;
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-prow]'));
    const i = btns.indexOf(t);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : Math.min(btns.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)));
    e.preventDefault();
    btns[next]?.focus();
  }

  return (
    <section className="gv-plist" aria-labelledby={`${uid}-h`}>
      <div className="gv-plist-h">
        <h5 id={`${uid}-h`}>Ranking de puntos</h5>
        <span className="gv-badge ok">{rows.length}</span>
        <span className="gv-plist-sub">{heading}</span>
      </div>
      {toolbar}
      {searchable && (
        <label className="gv-field gv-psearch">
          <span>Buscar punto</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre del punto" autoComplete="off" spellCheck={false} />
        </label>
      )}
      <p className="gv-psearch-n" role="status" aria-live="polite">
        {q ? (shown.length ? `${shown.length} de ${rows.length} puntos coinciden con «${q}».` : `Ningún punto coincide con «${q}».`) : ''}
      </p>
      {shown.length > 0 && (
        <ul className="gv-plist-ul" onKeyDown={onListKey}>
          {shown.map((r, i) => {
            const sel = r.key === selectedKey;
            const ok = r.status === 'ok';
            const nm = r.name || '(sin nombre)';
            const did = `${uid}-d-${r.key}`;
            return (
              <Fragment key={r.key}>
              {i === firstNa && hasRanked && <li className="gv-plist-sep">Sin evaluar · sin puesto</li>}
              <li
                id={`${uid}-r-${r.key}`} className={'gv-prow' + (sel ? ' sel' : '') + (ok ? '' : ' na')}
                style={{ scrollMarginTop: 8 }}
                onKeyDown={(e) => {
                  if (e.key !== 'Escape' || !sel) return;
                  e.stopPropagation();
                  onSelect(null);
                  e.currentTarget.querySelector<HTMLElement>('[data-prow]')?.focus();
                }}
              >
                <button type="button" className="gv-prow-btn" data-prow aria-expanded={sel} aria-controls={sel ? did : undefined} onClick={() => onSelect(sel ? null : r.key)}>
                  <span className="gv-rk">
                    {ok ? <><span className="sr-only">Puesto </span>{r.rank}</> : <><span className="sr-only">Sin puesto</span><span aria-hidden="true">–</span></>}
                  </span>
                  <span className="gv-pmain">
                    <span className="gv-pname" title={nm}>{nm}</span>
                    <span className="gv-pcls">
                      {ok && <span className="dot" style={{ background: r.color }} aria-hidden="true" />}
                      <span className="t">{r.label}</span>
                      {ok && r.vetoed && <span className="gv-badge warn">{criticalLabel}</span>}
                    </span>
                  </span>
                  {ok && r.pct !== null ? (
                    <span className="gv-pidx">
                      <b>{r.pct}{' '}%</b>
                      <span className="gv-bar" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, r.pct))}%`, background: r.color }} /></span>
                    </span>
                  ) : <span className="gv-pidx na">Sin índice</span>}
                </button>
                {sel && (
                  <div className="gv-pdetail" id={did} role="group" aria-label={`Detalle de ${nm}`}>
                    {renderDetail ? renderDetail(r) : <p className="gv-hint mono">{r.lat.toFixed(5)}, {r.lon.toFixed(5)}</p>}
                    {onRename && (
                      <label className="gv-field">
                        <span>Nombre del punto</span>
                        <input
                          key={r.name} type="text" defaultValue={r.name} maxLength={80}
                          onKeyDown={(e) => {
                            const el = e.currentTarget;
                            if (e.key === 'Enter') el.blur();
                            if (e.key === 'Escape') { e.stopPropagation(); el.value = r.name; el.blur(); }
                          }}
                          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== r.name) onRename(r.key, v); else e.target.value = r.name; }}
                        />
                      </label>
                    )}
                    <div className="gv-row-acts">
                      <button type="button" className="btn sm" onClick={() => onCenter(r.key)}><Icon d={LOCATE} size={14} /> Centrar en el mapa</button>
                      {onDelete && <button type="button" className="btn sm danger" onClick={() => onDelete(r.key)}><Icon d={ICONS.trash} size={14} /> Eliminar…</button>}
                      <button type="button" className="btn sm" onClick={() => onSelect(null)}>Cerrar</button>
                    </div>
                  </div>
                )}
              </li>
              </Fragment>
            );
          })}
        </ul>
      )}
    </section>
  );
}
