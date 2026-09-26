import { niceScale } from '@/lib/niceScale';

/** Barras horizontales de los pesos de los criterios (suman 1), ordenadas de mayor a menor. Sirven para cualquier método de
 * pesos (eigenvector de AHP, CRITIC, entropía): no hay lógica específica de método. SVG propio sin librerías, igual que
 * ClosenessBars: el peso va escrito al final de cada barra («0.3207 · 32.1 %»), así que nada depende solo del color. Los colores
 * salen de variables CSS (--ink, --muted, --line y el color de la barra) que el informe redefine en claro para imprimir. */
type Row = { name: string; weight: number };

const W = 640, L = 170, R = 128, T = 24, ROW = 32, BAR = 18;
const clip = (s: string, n = 24) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
export default function WeightBars({ rows, color = 'var(--accent)', caption }: { rows: Row[]; color?: string; caption?: string }) {
  if (rows.length === 0) return null;
  // orden estable por peso descendente; con empates conserva el orden original
  const sorted = rows.map((r, i) => ({ ...r, i })).sort((a, b) => b.weight - a.weight || a.i - b.i);
  const max = Math.max(...sorted.map((r) => r.weight), 0);
  // el eje llega hasta una marca redonda que cubre el mayor peso (mínimo 0.1): barras aprovechan el ancho sin salirse
  const { top, ticks } = niceScale(Math.max(max, 0.1));
  const hasCaption = !!caption;
  const H = T + sorted.length * ROW + 26 + (hasCaption ? 20 : 0);
  const axisY = T + sorted.length * ROW;
  const x = (w: number) => L + Math.max(0, Math.min(top, w)) / top * (W - L - R);
  const pct = (w: number) => (w * 100).toFixed(1) + ' %';
  const summary = `Pesos de los criterios, de mayor a menor. ${sorted.map((r, k) => `${k + 1}º ${r.name}: ${r.weight.toFixed(4)} (${pct(r.weight)})`).join('; ')}.`
    + (hasCaption ? ` ${caption}` : '');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} style={{ width: '100%', maxWidth: 720, display: 'block', margin: '0 auto' }}>
      {ticks.map((t, k) => (
        <g key={k}>
          <line x1={x(t)} x2={x(t)} y1={T - 6} y2={axisY} stroke="var(--line)" strokeDasharray="3 4" />
          <text x={x(t)} y={axisY + 16} textAnchor="middle" fontSize="11" fill="var(--muted)">{(t * 100).toFixed(0)} %</text>
        </g>
      ))}
      <text x={L - 8} y={T - 8} textAnchor="end" fontSize="11" fill="var(--muted)">Criterio</text>
      {sorted.map((r, k) => {
        const yy = T + k * ROW;
        const first = k === 0;
        return (
          <g key={r.name + r.i}>
            <text x={L - 10} y={yy + BAR / 2 + 4.5} textAnchor="end" fontSize="13" fontWeight={first ? 700 : 500} fill="var(--ink)">
              <title>{r.name}</title>
              {clip(r.name)}
            </text>
            {/* el criterio de mayor peso va relleno y con borde de tinta; los demás, con relleno tenue */}
            <rect x={L} y={yy} width={Math.max(2, x(r.weight) - L)} height={BAR} rx={3}
              fill={color} fillOpacity={first ? 1 : 0.5} stroke="var(--ink)" strokeWidth={first ? 1.6 : 0.8} />
            <text x={x(r.weight) + 8} y={yy + BAR / 2 + 4.5} fontSize="12" fontWeight={first ? 700 : 500} fill="var(--ink)" className="mono">
              {r.weight.toFixed(4)} · {pct(r.weight)}
            </text>
          </g>
        );
      })}
      {hasCaption && (
        <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="11.5" fill="var(--muted)">
          <title>{caption}</title>
          {clip(caption!, 105)}
        </text>
      )}
    </svg>
  );
}
