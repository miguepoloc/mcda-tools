'use client';

/** Tabla compacta del ranking de puntos, compartida por el panel del dueño (con renombrar, centrar y eliminar) y la
 * vista pública (solo lectura). Los estados no dependen solo del color: la clase y el estado van en texto. */
import { useEffect, useRef } from 'react';
import type { PointStatus } from '@/lib/geo/pointEval';
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
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onCenter: (key: string) => void;
  /** Solo el dueño: renombrar y eliminar. */
  onRename?: (key: string, name: string) => void;
  onDelete?: (key: string) => void;
};

export default function GeoPointsTable({ rows, heading, criticalLabel, selectedKey, onSelect, onCenter, onRename, onDelete }: Props) {
  const body = useRef<HTMLTableSectionElement>(null);
  // El punto elegido en el mapa se trae a la vista en la tabla.
  useEffect(() => {
    if (!selectedKey) return;
    const el = Array.from(body.current?.querySelectorAll<HTMLElement>('tr[data-key]') ?? []).find((r) => r.dataset.key === selectedKey);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedKey]);

  return (
    <div className="gv-ptable-wrap">
      <table className="gv-ptable">
        <caption><b>Ranking de puntos</b> · {heading}</caption>
        <thead>
          <tr>
            <th scope="col" className="num">Puesto</th>
            <th scope="col">Punto</th>
            <th scope="col" className="num">Índice</th>
            <th scope="col">Clase</th>
            <th scope="col"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody ref={body}>
          {rows.map((r) => {
            const sel = r.key === selectedKey;
            const evaluated = r.status === 'ok';
            return (
              <tr key={r.key} data-key={r.key} className={(sel ? 'sel ' : '') + (evaluated ? '' : 'na')} aria-selected={sel} onClick={() => onSelect(r.key)}>
                <td className="num">{r.rank ?? '—'}</td>
                <th scope="row">
                  {onRename ? (
                    <input
                      key={r.name} defaultValue={r.name} aria-label={`Nombre del punto ${r.name || '(sin nombre)'}`} maxLength={80}
                      onFocus={() => onSelect(r.key)}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { (e.target as HTMLInputElement).value = r.name; (e.target as HTMLInputElement).blur(); } }}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== r.name) onRename(r.key, v); else e.target.value = r.name; }}
                    />
                  ) : (
                    <button type="button" className="gv-plink" onClick={() => onSelect(r.key)}>{r.name || '(sin nombre)'}</button>
                  )}
                </th>
                <td className="num">{r.pct === null ? '—' : `${r.pct} %`}</td>
                <td className="cls">
                  {evaluated ? (
                    <>
                      <span className="dot" style={{ background: r.color }} aria-hidden="true" />
                      <span className="t">{r.label}</span>
                      {r.vetoed && <span className="gv-badge warn">{criticalLabel}</span>}
                    </>
                  ) : <span className="t na">{r.label}</span>}
                </td>
                <td className="acts">
                  <button type="button" className="gv-pbtn" aria-label={`Centrar «${r.name}» en el mapa`} title="Centrar en el mapa" onClick={(e) => { e.stopPropagation(); onCenter(r.key); }}><Icon d={LOCATE} size={15} /></button>
                  {onDelete && <button type="button" className="gv-pbtn" aria-label={`Eliminar «${r.name}»`} title="Eliminar" onClick={(e) => { e.stopPropagation(); onDelete(r.key); }}><Icon d={ICONS.trash} size={15} /></button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
