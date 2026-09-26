'use client';

import { useId } from 'react';

type Row = { name: string; s: number; r: number; q: number; rank: number };

const W = 680, L = 196, R = 84, T = 30, BAR = 13, GAP = 3, PAD = 16;
const clip = (s: string, n = 22) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** S, R y Q de VIKOR por alternativa (ordenadas por Q): tres barras finas con la misma escala 0–1, donde MENOR es mejor en las tres.
 * S = utilidad de grupo (suma ponderada de distancias al ideal), R = arrepentimiento individual (la peor distancia), Q = combinación
 * según v. Sirve para validar el veredicto: la condición 2 de Opricovic y Tzeng pide que la mejor por Q también lo sea en S y/o R (★),
 * y la condición 1 que la 2.ª quede al menos DQ = 1/(m − 1) por encima en Q (línea punteada Q₁ + DQ). Cada barra lleva su valor escrito y
 * su patrón (S sólida, R rayada, Q con borde de tinta), así que nada depende solo del color; los colores salen de variables CSS que el
 * informe redefine en claro para imprimir. */
export default function VikorSRQChart({ rows, v, dq }: { rows: Row[]; v: number; dq?: number }) {
  const uid = useId().replace(/:/g, '');
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a.rank - b.rank || a.q - b.q);
  const ROW = 3 * BAR + 2 * GAP + PAD;
  const axisY = T + sorted.length * ROW;
  const H = axisY + 146;
  const BX = W - L - R;
  const maxV = Math.max(...sorted.flatMap((r) => [r.s, r.r, r.q]), 0.0001);
  const top = Math.min(1, Math.max(0.1, Math.ceil(maxV * 10 - 1e-9) / 10)); // eje a la décima que cubre el mayor valor (S, R, Q ∈ [0, 1])
  const x = (val: number) => L + (Math.max(0, Math.min(top, val)) / top) * BX;
  const ticks = Array.from({ length: Math.round(top * 10) / (top > 0.5 ? 2 : 1) + 1 }, (_, i) => Number((i * (top > 0.5 ? 0.2 : 0.1)).toFixed(2))).filter((t) => t <= top + 1e-9);
  const minS = Math.min(...sorted.map((r) => r.s)), minR = Math.min(...sorted.map((r) => r.r));
  const first = sorted[0];
  const dqAt = dq != null && first ? first.q + dq : null;
  const hatch = `${uid}-h`;
  const summary = `S, R y Q de VIKOR con v = ${v.toFixed(2)}; en las tres, menor es mejor. `
    + sorted.map((r) => `${r.rank}º ${r.name}: S ${r.s.toFixed(4)}, R ${r.r.toFixed(4)}, Q ${r.q.toFixed(4)}`).join('; ') + '.'
    + (dqAt != null && dqAt <= top ? ` Línea punteada: Q del 1º más DQ = ${dqAt.toFixed(4)}.` : '');
  const bars: { k: 'S' | 'R' | 'Q'; f: (r: Row) => number }[] = [{ k: 'S', f: (r) => r.s }, { k: 'R', f: (r) => r.r }, { k: 'Q', f: (r) => r.q }];

  // Lectura autogenerada: quién gana por Q, si también lo es por S o R (condición 2) y si la 2.ª queda a más de DQ (condición 1).
  const second = sorted[1];
  const bestSNames = sorted.filter((r) => Math.abs(r.s - minS) < 1e-9).map((r) => r.name), bestRNames = sorted.filter((r) => Math.abs(r.r - minR) < 1e-9).map((r) => r.name);
  const reading = second
    ? `${first.name} es 1.ª por Q (${first.q.toFixed(4)}). Menor S (★): ${bestSNames.join(', ')}; menor R (★): ${bestRNames.join(', ')}. `
      + (bestSNames.includes(first.name) || bestRNames.includes(first.name) ? `${first.name} también es la mejor en S o en R: cumple la estabilidad (C2). ` : `${first.name} no es la mejor ni en S ni en R: falla la estabilidad (C2). `)
      + (dq != null ? `La 2.ª (${second.name}) queda a ${(second.q - first.q).toFixed(4)} del 1.º; el umbral es DQ = ${dq.toFixed(4)}: ${second.q - first.q >= dq - 1e-9 ? 'ventaja aceptable (C1 se cumple)' : 'ventaja insuficiente (C1 no se cumple)'}.` : '')
    : '';
  return (
    <>
    <div className="calc-chart" style={{ ['--cw' as string]: W + 'px' }}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} style={{ width: '100%', maxWidth: 720, display: 'block', margin: '0 auto' }}>
      <defs>
        <pattern id={hatch} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--surface)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--m-vikor)" strokeWidth="3" />
        </pattern>
      </defs>

      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={T - 8} y2={axisY} stroke="var(--line)" strokeDasharray="3 4" />
          <text x={x(t)} y={axisY + 15} textAnchor="middle" fontSize="12" fill="var(--muted)">{t.toFixed(1)}</text>
        </g>
      ))}
      <text x={L - 10} y={T - 12} textAnchor="end" fontSize="12" fill="var(--muted)">Posición por Q · alternativa</text>
      <text x={L + BX / 2} y={axisY + 34} textAnchor="middle" fontSize="12.5" fill="var(--ink)">Valor de S, R y Q (0 = mejor posible, 1 = peor) · barra más corta = mejor</text>

      {dqAt != null && dqAt <= top && (
        <g>
          <line x1={x(dqAt)} x2={x(dqAt)} y1={T - 8} y2={axisY} stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="5 4" />
          <text x={x(dqAt)} y={T - 12} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--ink)">Q₁ + DQ</text>
        </g>
      )}

      {sorted.map((r, k) => {
        const y0 = T + k * ROW;
        const win = r.rank === 1;
        return (
          <g key={r.name + k}>
            {k > 0 && <line x1={PAD} x2={W - 8} y1={y0 - PAD / 2 + 1} y2={y0 - PAD / 2 + 1} stroke="var(--line)" />}
            <text x={L - 34} y={y0 + (3 * BAR + 2 * GAP) / 2 + 4.5} textAnchor="end" fontSize="13" fontWeight={win ? 700 : 500} fill="var(--ink)">
              <title>{r.name}</title>
              #{r.rank} {clip(r.name)}{win ? ' ✓' : ''}
            </text>
            {bars.map((b, i) => {
              const val = b.f(r);
              const yy = y0 + i * (BAR + GAP);
              const best = (b.k === 'S' && Math.abs(val - minS) < 1e-9) || (b.k === 'R' && Math.abs(val - minR) < 1e-9);
              return (
                <g key={b.k}>
                  <text x={L - 8} y={yy + BAR - 2.5} textAnchor="end" fontSize="12" fontWeight="700" fill="var(--ink)" className="mono">{b.k}</text>
                  <rect x={L} y={yy} width={Math.max(2, x(val) - L)} height={BAR} rx={2}
                    fill={b.k === 'R' ? `url(#${hatch})` : 'var(--m-vikor)'} fillOpacity={b.k === 'Q' ? 0.5 : 1}
                    stroke="var(--ink)" strokeWidth={b.k === 'Q' ? (win ? 1.8 : 1.1) : 0.6} />
                  <text x={x(val) + 6} y={yy + BAR - 2.5} fontSize="12" fontWeight={b.k === 'Q' ? 700 : 500} fill="var(--ink)" className="mono" style={{ paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 4, strokeLinejoin: 'round' }}>
                    {val.toFixed(4)}{best ? ' ★' : ''}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}

      <g fontSize="12" fill="var(--ink)">
        <text x={PAD} y={axisY + 56}>S = utilidad de grupo: promedio ponderado de las distancias al ideal (barra sólida).</text>
        <text x={PAD} y={axisY + 73}>R = arrepentimiento: la peor distancia de la alternativa en algún criterio (barra rayada).</text>
        <text x={PAD} y={axisY + 90}>Q = combina S y R con v = {v.toFixed(2)} (barra con borde grueso).</text>
        <text x={PAD} y={axisY + 107}>En las tres, menor es mejor · ★ = mejor S o mejor R (condición 2).</text>
        {dqAt != null && dqAt <= top && <text x={PAD} y={axisY + 124}>Línea punteada = Q₁ + DQ, con DQ = 1/(m − 1): la 2.ª debe quedar a su derecha (condición 1).</text>}
      </g>
    </svg>
    </div>
    {reading && <p className="s3-note"><b>Cómo leerlo:</b> {reading}</p>}
    </>
  );
}
