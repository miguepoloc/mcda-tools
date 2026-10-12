'use client';
/** Atributos de las entidades de referencia bajo el clic (solo del dueño; nunca se publican). */
import type { RefHit } from '@/lib/geo/refQuery';

const KIND: Record<RefHit['kind'], string> = { polygon: 'polígono', line: 'línea', point: 'punto' };

export default function GeoRefHits({ hits }: { hits: RefHit[] }) {
  if (!hits.length) return null;
  return (
    <div className="gv-refhits" role="group" aria-label="Atributos de las capas de referencia bajo el clic">
      {hits.map((h) => (
        <div key={`${h.layerId}:${h.index}`} className="gv-refhit">
          <div className="gv-refhit-h"><b>{h.title}</b><span className="muted"> · {h.layerName} ({KIND[h.kind]})</span></div>
          {h.rows.length > 0 && (
            <table className="gv-refhit-t" aria-label={`Atributos de ${h.title}`}>
              <tbody>{h.rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody>
            </table>
          )}
          {h.more > 0 && <div className="muted" style={{ fontSize: 11 }}>+{h.more} atributos más</div>}
        </div>
      ))}
    </div>
  );
}
