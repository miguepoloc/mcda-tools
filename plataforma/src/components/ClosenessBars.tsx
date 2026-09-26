/** Barras horizontales de la cercanía relativa C de TOPSIS (0 a 1, mayor es mejor), una por alternativa y ordenadas por posición.
 * SVG propio sin librerías, igual que ElectreGraph y la gráfica de VIKOR. Pensada para el informe impreso: el valor de C va escrito
 * al final de cada barra y la ganadora lleva «#1 ✓», así que nada depende solo del color. Los colores salen de variables CSS
 * (--m-topsis, --ink, --muted, --line) que el informe redefine en claro. */
type Row = { name: string; value: number; rank: number };

const W = 640, L = 170, R = 96, T = 26, ROW = 34, BAR = 18;
const clip = (s: string, n = 24) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export default function ClosenessBars({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return null;
  // orden estable por posición; con empates conserva el orden original
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  const H = T + sorted.length * ROW + 58;
  const x = (c: number) => L + Math.max(0, Math.min(1, c)) * (W - L - R);
  const summary = `Cercanía relativa C de TOPSIS por alternativa, de mayor a menor. ${sorted.map((r) => `${r.rank}º ${r.name}: ${r.value.toFixed(4)}`).join('; ')}.`;
  const first = sorted[0], second = sorted[1];
  const reading = second
    ? `${first.name} queda 1.ª con C = ${first.value.toFixed(4)}; le saca ${(first.value - second.value).toFixed(4)} a ${second.name}${first.value - second.value < 0.02 ? ' (carrera muy cerrada)' : ''}. Una barra que llega a 1 sería una alternativa idéntica al ideal; una de 0, idéntica al anti-ideal.`
    : '';
  return (
    <>
    <div className="calc-chart" style={{ ['--cw' as string]: W + 'px' }}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} style={{ width: '100%', maxWidth: 720, display: 'block', margin: '0 auto' }}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={T - 6} y2={H - 58} stroke="var(--line)" strokeDasharray="3 4" />
          <text x={x(t)} y={H - 42} textAnchor="middle" fontSize="12" fill="var(--muted)">{t.toFixed(2)}</text>
        </g>
      ))}
      <text x={L - 8} y={T - 8} textAnchor="end" fontSize="12" fill="var(--muted)">Posición · alternativa</text>
      <text x={L + (W - L - R) / 2} y={H - 22} textAnchor="middle" fontSize="12.5" fill="var(--ink)">Cercanía relativa C (0 = en el anti-ideal, 1 = en el ideal)</text>
      <text x={L + (W - L - R) / 2} y={H - 6} textAnchor="middle" fontSize="12" fill="var(--muted)">barra más larga = mejor · ✓ = 1.ª</text>
      {sorted.map((r, k) => {
        const yy = T + k * ROW;
        const first = r.rank === 1;
        return (
          <g key={r.name + k}>
            <text x={L - 10} y={yy + BAR / 2 + 4.5} textAnchor="end" fontSize="13" fontWeight={first ? 700 : 500} fill="var(--ink)">
              <title>{r.name}</title>
              #{r.rank} {clip(r.name)}
            </text>
            {/* la ganadora va rellena y con borde de tinta; las demás, con relleno tenue: se distinguen también en blanco y negro */}
            <rect x={L} y={yy} width={Math.max(2, x(r.value) - L)} height={BAR} rx={3}
              fill="var(--m-topsis)" fillOpacity={first ? 1 : 0.45} stroke="var(--ink)" strokeWidth={first ? 1.6 : 0.8} />
            <text x={x(r.value) + 8} y={yy + BAR / 2 + 4.5} fontSize="12.5" fontWeight={first ? 700 : 500} fill="var(--ink)" className="mono">
              {r.value.toFixed(4)}{first ? ' ✓' : ''}
            </text>
          </g>
        );
      })}
    </svg>
    </div>
    {reading && <p className="s3-note"><b>Cómo leerlo:</b> {reading}</p>}
    </>
  );
}
