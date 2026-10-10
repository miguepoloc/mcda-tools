'use client';

/** Ficha de UN punto: índice, clase, coordenadas y, por criterio, su valor, su idoneidad y su aporte (idoneidad × peso).
 * La comparten la tarjeta flotante de consulta del mapa (`.gv-point`) y la expansión en línea de la lista de puntos, para
 * que ambas cuenten lo mismo. El cálculo vive en `lib/geo/pointEval.ts`; aquí solo la presentación. */
import type { PointRow } from '@/lib/geo/pointEval';

export type PointFichaProps = {
  pct: number | null;
  /** Clase (o estado: «Fuera del área de estudio», «Exclusión», «Sin dato»). */
  label: string;
  /** Color de la clase del modelo (no se usa como único indicador: la clase va en texto). */
  color?: string;
  lat: number;
  lon: number;
  rows: PointRow[];
  /** Rótulo de la insignia de veto («Vetada» / «Condición crítica»); sin él no se muestra. */
  vetoLabel?: string;
  /** `inline` = dentro de una fila de la lista (cifra más chica, sin pie). */
  variant?: 'card' | 'inline';
};

const num2 = (x: number) => x.toFixed(2);

/** Texto del aporte: «idoneidad × peso = aporte»; sin dato, «no vota» (los pesos se reescalan entre los que sí votan). */
function contribText(r: PointRow): string {
  if (r.suit == null || r.weight == null || r.part == null) return r.contrib;
  return `${num2(r.suit)} × ${num2(r.weight)} = ${num2(r.part)}${r.veto ? ' · VETO' : ''}`;
}

export default function PointFicha({ pct, label, color, lat, lon, rows, vetoLabel, variant = 'card' }: PointFichaProps) {
  return (
    <div className={'gv-pf' + (variant === 'inline' ? ' inline' : '')}>
      <div className="big">{pct === null ? '—' : `${pct} %`}</div>
      <span className="cls-pill" style={color ? { background: `color-mix(in srgb, ${color} 22%, transparent)`, borderColor: color } : undefined}>
        {color && <span className="dot" style={{ background: color }} aria-hidden="true" />}{label}
      </span>
      {vetoLabel && <span className="gv-badge warn gv-pf-veto">{vetoLabel}</span>}
      <div className="coords mono">{lat.toFixed(5)}, {lon.toFixed(5)}</div>
      {rows.length > 0 && (
        <>
          <div className="tbl">
            {rows.map((r) => (
              <div className={'r' + (r.veto ? ' veto' : '')} key={r.label}>
                <span className="rl"><span className="k">{r.label}</span><span className="pv">{r.value}</span></span>
                <span className="pc">{contribText(r)}</span>
              </div>
            ))}
          </div>
          <div className="gv-pf-note">Cada línea: valor de la capa y, a la derecha, idoneidad × peso = aporte al índice.</div>
        </>
      )}
    </div>
  );
}
