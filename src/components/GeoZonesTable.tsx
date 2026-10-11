'use client';

/** Tabla ordenable del resumen por zonas, compartida por la pestaña «Zonas» del dueño y la vista pública. Una zona sin
 * área evaluada se rotula «Sin área evaluada» (texto, no solo color) y va siempre al final, sin 0 %. */
import { useMemo, useState } from 'react';
import { compareNullsLast, NO_AREA } from '@/lib/geo/zonal';
import './geo-zones.css';

export type ZoneRowView = {
  key: string; name: string;
  meanPct: number | null; ha: number;
  classPct: (number | null)[];
  points: number | null;
  /** Personas con celda evaluada en la zona (null = no se pidió población). */
  pop?: number | null;
  /** % de esa población en la clase más extrema de la dirección (null = sin población evaluada). */
  popExtremePct?: number | null;
  /** Color del índice medio (rampa del mapa), solo como apoyo: el número va siempre en texto. */
  color?: string;
};

type SortKey = 'name' | 'meanPct' | 'ha' | 'points' | 'pop' | 'popPct' | `c${number}`;
type Dir = 'asc' | 'desc';

type Props = {
  rows: ZoneRowView[];
  classNames: string[];
  /** Encabezado de la columna de índice: «Riesgo medio» / «Idoneidad media». */
  indexLabel: string;
  /** Texto del orden por defecto: «Mayor riesgo primero» / «Más apto primero». */
  heading: string;
  showPoints: boolean;
  /** Columnas de población; `extremeName` = nombre de la clase más extrema (riesgo: la más alta; aptitud: la menos apta). */
  showPop?: boolean; extremeName?: string;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
};

const fmt1 = (v: number) => v.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function GeoZonesTable({ rows, classNames, indexLabel, heading, showPoints, showPop, extremeName, selectedKey, onSelect }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>({ key: 'meanPct', dir: 'desc' });
  const val = (r: ZoneRowView, k: SortKey): number | string | null => {
    if (k === 'name') return r.name;
    if (k === 'meanPct') return r.meanPct;
    if (k === 'ha') return r.meanPct === null ? null : r.ha;
    if (k === 'points') return r.points;
    if (k === 'pop') return r.pop ? r.pop : null;
    if (k === 'popPct') return r.popExtremePct ?? null;
    return r.classPct[Number(k.slice(1))] ?? null;
  };
  const sorted = useMemo(() => rows.slice().sort((a, b) => compareNullsLast(val(a, sort.key), val(b, sort.key), sort.dir, a.name, b.name)), [rows, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  const th = (key: SortKey, label: string, num = true) => {
    const on = sort.key === key;
    return (
      <th scope="col" className={num ? 'num' : ''} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className="gv-zsort" onClick={() => toggle(key)} title={`Ordenar por ${label}`}>
          {label}<span aria-hidden="true">{on ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
        </button>
      </th>
    );
  };
  const byDefault = sort.key === 'meanPct' && sort.dir === 'desc';
  return (
    <div className="gv-ztable-wrap" tabIndex={0} role="region" aria-label="Resumen por zonas (tabla desplazable)">
      <table className="gv-ztable">
        <caption><b>Resumen por zonas</b>{byDefault ? ` · ${heading}` : ''}</caption>
        <thead>
          <tr>
            {th('name', 'Zona', false)}
            {th('meanPct', indexLabel)}
            {th('ha', 'ha evaluadas')}
            {classNames.map((n, i) => th(`c${i}` as SortKey, `% ${n}`))}
            {showPoints && th('points', 'Puntos')}
            {showPop && th('pop', 'Personas evaluadas')}
            {showPop && th('popPct', `% personas en «${extremeName ?? ''}»`)}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const none = r.meanPct === null;
            const sel = r.key === selectedKey;
            return (
              <tr key={r.key} className={(none ? 'na ' : '') + (sel ? 'sel' : '')} aria-current={sel ? 'true' : undefined} onClick={onSelect ? () => onSelect(r.key) : undefined}>
                <th scope="row">{onSelect
                  ? <button type="button" className="gv-zsort" aria-pressed={sel} onClick={(e) => { e.stopPropagation(); onSelect(r.key); }} title="Resaltar la zona en el mapa">{r.name}</button>
                  : r.name}</th>
                {none ? (
                  <td className="na-cell" colSpan={2 + classNames.length}>{NO_AREA}</td>
                ) : (
                  <>
                    <td className="num"><span className="dot" style={r.color ? { background: r.color } : undefined} aria-hidden="true" />{fmt1(r.meanPct as number)}</td>
                    <td className="num">{r.ha.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                    {r.classPct.map((p, i) => <td className="num" key={i}>{p === null ? '—' : `${fmt1(p)} %`}</td>)}
                  </>
                )}
                {showPoints && <td className="num">{r.points ?? '—'}</td>}
                {showPop && (r.pop
                  ? <><td className="num">{Math.round(r.pop).toLocaleString('es-CO')}</td><td className="num">{r.popExtremePct === null || r.popExtremePct === undefined ? '—' : `${fmt1(r.popExtremePct)} %`}</td></>
                  : <td className="na-cell" colSpan={2}>Sin población evaluada</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
