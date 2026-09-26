import { CalcMatrix, type CalcMode } from './calc/CalcKit';
import { n4, sgn } from './calc/calcFormat';

type Row = { name: string; plus: number; minus: number; net: number; rank: number };

const W = 680, CX = 358, HALF = 138, NETX = 556, T = 34, ROW = 36, BAR = 18;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const fin = (x: number) => (Number.isFinite(x) ? x : 0);
const f01 = (x: number) => Math.max(0, Math.min(1, fin(x)));

/** Flujos de PROMETHEE por alternativa (ordenadas por posición): barras divergentes alrededor de un eje central en cero.
 * φ⁺ (flujo de salida, cuánto supera a las demás) sale hacia la derecha y φ⁻ (flujo de entrada, cuánto la superan) hacia la
 * izquierda; el rombo marca el flujo neto φ = φ⁺ − φ⁻ y su valor va escrito en la columna de la derecha. Escala común para
 * ambos lados. SVG propio sin librerías, igual que ClosenessBars: todos los valores van escritos y la leyenda explica cada
 * elemento, así que nada depende solo del color (imprimible en blanco y negro). Colores solo de variables CSS. */
export default function PrometheeFlows({ rows, showTable = false, mode = 'screen' }: { rows: Row[]; /** Tabla con φ⁺, φ⁻ y φ debajo del gráfico (con la comprobación Σφ = 0); útil en papel y para leer los valores exactos. */ showTable?: boolean; mode?: CalcMode }) {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  const n = sorted.length;

  const maxFlow = Math.max(...sorted.map((r) => Math.max(f01(r.plus), f01(r.minus))), 0.05);
  const scaleMax = maxFlow * 1.05;
  const len = (v: number) => (f01(v) / scaleMax) * HALF;
  const step = scaleMax > 0.5 ? 0.25 : scaleMax > 0.2 ? 0.1 : 0.05;
  const ticks: number[] = [];
  for (let t = step; t <= scaleMax + 1e-9; t += step) ticks.push(Math.round(t * 1000) / 1000);

  const bottom = T + n * ROW;
  const H = bottom + 20 + 2 * 16 + 4;

  const summary = `Flujos de PROMETHEE por alternativa, de mayor a menor flujo neto. `
    + sorted.map((r) => `${r.rank}º ${r.name}: φ⁺ ${n4(f01(r.plus))}, φ⁻ ${n4(f01(r.minus))}, φ neto ${sgn(fin(r.net))}`).join('; ')
    + '. φ⁺ indica cuánto supera a las demás, φ⁻ cuánto la superan y φ = φ⁺ − φ⁻; mayor es mejor.';

  const chart = (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} style={{ width: '100%', maxWidth: 720, display: 'block', margin: '0 auto' }}>
      {/* rejilla simétrica y eje central */}
      {ticks.map((t) => (
        <g key={t}>
          {[-1, 1].map((s) => (
            <g key={s}>
              <line x1={CX + s * (t / scaleMax) * HALF} x2={CX + s * (t / scaleMax) * HALF} y1={T - 6} y2={bottom - 6} stroke="var(--line)" strokeDasharray="3 4" />
              <text x={CX + s * (t / scaleMax) * HALF} y={bottom + 8} textAnchor="middle" fontSize="12" fill="var(--muted)">{t.toFixed(2)}</text>
            </g>
          ))}
        </g>
      ))}
      <line x1={CX} x2={CX} y1={T - 10} y2={bottom - 4} stroke="var(--ink)" strokeWidth={1.4} />
      <text x={CX} y={bottom + 8} textAnchor="middle" fontSize="12" fill="var(--muted)">0</text>

      {/* encabezados */}
      <text x={CX - 8} y={T - 14} textAnchor="end" fontSize="12" fontWeight={700} fill="var(--ink)">← φ⁻ la superan</text>
      <text x={CX + 8} y={T - 14} textAnchor="start" fontSize="12" fontWeight={700} fill="var(--ink)">φ⁺ supera a otras →</text>
      <text x={NETX} y={T - 14} fontSize="12" fontWeight={700} fill="var(--ink)">◆ flujo neto φ</text>
      <text x={158} y={T - 14} textAnchor="end" fontSize="12" fill="var(--muted)">Posición · alternativa</text>

      {sorted.map((r, k) => {
        const yy = T + k * ROW;
        const cy = yy + BAR / 2;
        const first = r.rank === 1;
        const plus = f01(r.plus), minus = f01(r.minus);
        const lp = Math.max(plus > 0 ? 2 : 0, len(plus)), lm = Math.max(minus > 0 ? 2 : 0, len(minus));
        const net = fin(r.net);
        // el rombo va sobre la escala común; net está en [-max(φ⁺,φ⁻), max(φ⁺,φ⁻)] así que siempre cae dentro del gráfico
        const nx = CX + Math.max(-HALF, Math.min(HALF, (net / scaleMax) * HALF));
        const sw = first ? 1.6 : 0.8;
        const label = `#${r.rank}${first ? ' ✓' : ''} `;
        return (
          <g key={r.name + k}>
            <title>{`${r.name}: φ⁺ ${n4(plus)}, φ⁻ ${n4(minus)}, φ ${sgn(net)}`}</title>
            <text x={158} y={cy + 4.5} textAnchor="end" fontSize="12.5" fontWeight={first ? 700 : 500} fill="var(--ink)">
              {label}{clip(r.name, 23 - label.length)}
            </text>
            {/* φ⁻ a la izquierda: gris con borde de tinta; φ⁺ a la derecha: color del método. Se distinguen por lado y por texto */}
            <rect x={CX - lm} y={yy} width={lm} height={BAR} rx={2} fill="var(--muted)" fillOpacity={0.45} stroke="var(--ink)" strokeWidth={sw} />
            <rect x={CX} y={yy} width={lp} height={BAR} rx={2} fill="var(--m-promethee)" fillOpacity={first ? 1 : 0.55} stroke="var(--ink)" strokeWidth={sw} />
            <text x={CX - lm - 6} y={cy + 4.5} textAnchor="end" fontSize="12" fontWeight={first ? 700 : 500} fill="var(--ink)" className="mono">{n4(minus)}</text>
            <text x={CX + lp + 6} y={cy + 4.5} fontSize="12" fontWeight={first ? 700 : 500} fill="var(--ink)" className="mono">{n4(plus)}</text>
            {/* rombo del flujo neto */}
            <path d={`M${nx},${cy - 7} L${nx + 7},${cy} L${nx},${cy + 7} L${nx - 7},${cy} Z`} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.8} />
            <text x={NETX} y={cy + 4.5} fontSize="12.5" fontWeight={first ? 700 : 500} fill="var(--ink)" className="mono">
              {'φ ' + sgn(net)}{first ? ' ✓' : ''}
            </text>
          </g>
        );
      })}

      <text x={CX} y={bottom + 28} textAnchor="middle" fontSize="12" fill="var(--muted)">φ⁺ = cuánto supera a las demás · φ⁻ = cuánto la superan · φ = φ⁺ − φ⁻ (mayor es mejor)</text>
      <text x={CX} y={bottom + 44} textAnchor="middle" fontSize="12" fill="var(--muted)">Barra derecha = φ⁺ · barra izquierda = φ⁻ · rombo ◆ = flujo neto φ (escala común, 0 al centro)</text>
    </svg>
  );
  if (!showTable) return chart;
  const f = (x: number) => n4(fin(x));
  const sumNet = sorted.reduce((a, r) => a + fin(r.net), 0);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {chart}
      <CalcMatrix
        mode={mode} corner="Posición · alternativa" caption="Flujos de PROMETHEE por alternativa (los mismos valores del gráfico)"
        rows={sorted.map((r) => `${r.rank}º ${r.name}`)} cols={['φ⁺ (sale)', 'φ⁻ (entra)', 'φ = φ⁺ − φ⁻']}
        cells={sorted.map((r) => [f(r.plus), f(r.minus), sgn(fin(r.net))])}
        hl={(i) => (sorted[i].rank === 1 ? 'good' : undefined)}
        footer={[{ label: 'Suma', hint: 'Σφ debe ser 0', cells: [f(sorted.reduce((a, r) => a + fin(r.plus), 0)), f(sorted.reduce((a, r) => a + fin(r.minus), 0)), f(sumNet) + (Math.abs(sumNet) < 1e-9 ? ' ✓' : ' ✗')] }]}
      />
    </div>
  );
}
