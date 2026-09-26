/** Ranking de VIKOR por Q (menor es mejor), con la barra en el sentido correcto: la MÁS CORTA es la mejor y el valor va escrito
 * («Q = 0.0000»), en vez de la barra (1 − Q) genérica de la lista de ranking de los otros métodos, donde la más larga es la mejor y
 * Q = 0 se veía como una barra vacía con el texto pegado al borde. Marca además, con texto (no solo color), si hay ganador único
 * («✓ ganador único») o si la alternativa pertenece al conjunto de compromiso («◆ conjunto de compromiso»).
 * Recibe los mismos datos que ya tiene Results (`quant.rows`, `quant.order`, `quant.soft`, `vEff`), así que se cablea en una línea. */
export type VikorRankBarProps = {
  /** una fila por alternativa, en el orden original: `value` = Q, `rank` = posición */
  rows: { name: string; value: number; rank: number }[];
  /** índices de `rows` de mejor a peor (Q menor primero) */
  order: number[];
  /** nombres del conjunto de compromiso cuando NO hay ganador único (ver QuantView.soft); undefined si lo hay */
  soft?: string[];
  /** v usado, solo para el pie */
  v: number;
};

export default function VikorRankBar({ rows, order, soft, v }: VikorRankBarProps) {
  if (rows.length === 0) return null;
  const unique = !soft;
  return (
    <div className="s3-rk" role="group" aria-label={`Ranking de VIKOR por Q con v = ${v.toFixed(2)}; menor Q es mejor`}>
      <div className="s3-rk-axis" aria-hidden="true"><span>0 = la mejor del grupo</span><span>1 = la peor</span></div>
      {order.map((i) => {
        const r = rows[i];
        const w = Math.max(0, Math.min(1, r.value)) * 100;
        const inSet = !!soft && soft.includes(r.name);
        return (
          <div className="s3-rk-row" key={r.name + i}>
            <span className="s3-rk-nm">{r.rank}. {r.name}</span>
            <div className="s3-rk-track" aria-hidden="true">
              <div className="s3-rk-fill" style={{ width: `max(4px, ${w}%)`, opacity: r.rank === 1 ? 1 : 0.55 }} />
            </div>
            <span className="s3-rk-val mono">Q = {r.value.toFixed(4)}</span>
            <span className="s3-rk-tag">{r.rank === 1 && unique ? '✓ ganador único' : inSet ? '◆ conjunto de compromiso' : ''}</span>
          </div>
        );
      })}
      <p className="s3-rk-foot">Q resume S (promedio) y R (peor criterio) con v = {v.toFixed(2)}. <b>Barra más corta = mejor.</b>{soft ? ' Sin ganador único: las marcadas ◆ se consideran juntas.' : ''}</p>
    </div>
  );
}
