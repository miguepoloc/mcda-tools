'use client';

import { useId } from 'react';

type Row = { name: string; parts: number[]; total: number; rank: number };
type Props = {
  /** Nombres de los criterios, en el mismo orden que `parts` de cada fila. */
  criteria: string[];
  rows: Row[];
  /** Qué mide la longitud de la barra, p. ej. «prioridad global» o «puntaje SAW». */
  unit: string;
};

const W = 640, L = 170, R = 112, ROW = 34, BAR = 20, LEG = 18;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const fin = (x: number) => (Number.isFinite(x) ? x : 0);

/** En pantallas angostas la gráfica conserva su ancho natural (640) dentro de una región con desplazamiento propio, para que los números
 * se sigan leyendo (≥ 12 px) sin ensanchar la página. Barras horizontales apiladas: una por alternativa (ordenadas por posición) y un tramo por criterio, cuya longitud es lo que
 * ese criterio aporta al total de la alternativa (AHP: peso × prioridad local; SAW: peso × valor normalizado Min-Max). Escala
 * común a todas las barras. SVG propio sin librerías, igual que ClosenessBars. Para el informe impreso nada depende solo del
 * color: cada criterio lleva un número (impreso dentro del tramo cuando cabe y en la leyenda), del sexto criterio en adelante
 * el relleno es una trama (rayas, puntos, cuadrícula) en vez de un color nuevo, y el total va escrito al final de la barra
 * con su posición («#1 ✓» la ganadora). Colores solo de variables CSS (--s1..--s5, --other, --ink, --muted, --line, --surface). */
export default function ContributionBars({ criteria, rows, unit }: Props) {
  const uid = useId().replace(/:/g, '');
  if (rows.length === 0 || criteria.length === 0) return null;

  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  const nc = criteria.length;

  // relleno del criterio i: color categórico para los 5 primeros; del 6.º en adelante, trama sobre --other (3 variantes)
  const fillFor = (i: number) => (i < 5 ? `var(--s${i + 1})` : `url(#${uid}-p${(i - 5) % 3})`);

  // leyenda con salto de línea automático (ancho estimado por longitud del texto)
  const legend: { i: number; x: number; y: number; label: string }[] = [];
  let lx = 8, ly = 0;
  criteria.forEach((c, i) => {
    const label = `${i + 1} ${clip(c, 24)}`;
    const w = 14 + 6 + label.length * 6.6 + 16;
    if (lx + w > W - 4 && lx > 8) { lx = 8; ly += LEG; }
    legend.push({ i, x: lx, y: ly, label });
    lx += w;
  });
  const legendRows = ly / LEG + 1;
  const T = legendRows * LEG + 18;
  const H = T + sorted.length * ROW + 22 + 16;

  const totals = sorted.map((r) => Math.max(0, fin(r.total)));
  const max = Math.max(...totals, 1e-9) * 1.05;
  const x = (v: number) => L + (Math.max(0, fin(v)) / max) * (W - L - R);
  const step = max > 0.5 ? 0.25 : max > 0.2 ? 0.1 : 0.05;
  const ticks: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += step) ticks.push(Math.round(t * 1000) / 1000);
  const halo = { paintOrder: 'stroke' as const, stroke: 'var(--surface)', strokeWidth: 3, strokeLinejoin: 'round' as const };

  const summary = `Aporte de cada criterio a la ${unit} de cada alternativa, de mayor a menor. Criterios: ${criteria.map((c, i) => `${i + 1} ${c}`).join('; ')}. `
    + sorted.map((r) => `${r.rank}º ${r.name}: total ${fin(r.total).toFixed(4)} (${criteria.map((c, i) => `${c} ${fin(r.parts[i] ?? 0).toFixed(4)}`).join('; ')})`).join('. ') + '.';

  return (
    <div className="ahp-svgscroll" role="region" aria-label={`Aporte de cada criterio a la ${unit} (gráfica de barras apiladas)`} tabIndex={0}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} style={{ width: '100%', minWidth: W, maxWidth: 720, display: 'block', margin: '0 auto' }}>
      {nc > 5 && (
        <defs>
          {/* rayas diagonales */}
          <pattern id={`${uid}-p0`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" fill="var(--other)" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="var(--ink)" strokeWidth="2.5" />
          </pattern>
          {/* puntos */}
          <pattern id={`${uid}-p1`} width="7" height="7" patternUnits="userSpaceOnUse">
            <rect width="7" height="7" fill="var(--other)" />
            <circle cx="3.5" cy="3.5" r="1.6" fill="var(--ink)" />
          </pattern>
          {/* cuadrícula */}
          <pattern id={`${uid}-p2`} width="7" height="7" patternUnits="userSpaceOnUse">
            <rect width="7" height="7" fill="var(--other)" />
            <path d="M0,0.5 H7 M0.5,0 V7" stroke="var(--ink)" strokeWidth="1.4" />
          </pattern>
        </defs>
      )}

      {/* leyenda de criterios */}
      {legend.map(({ i, x: gx, y, label }) => (
        <g key={i}>
          <title>{criteria[i]}</title>
          <rect x={gx} y={y + 2} width={14} height={14} rx={2} fill={fillFor(i)} stroke="var(--ink)" strokeWidth={0.8} />
          <text x={gx + 20} y={y + 13.5} fontSize="12" fill="var(--ink)">{label}</text>
        </g>
      ))}

      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={T - 6} y2={T + sorted.length * ROW - 8} stroke="var(--line)" strokeDasharray="3 4" />
          <text x={x(t)} y={T + sorted.length * ROW + 6} textAnchor="middle" fontSize="12" fill="var(--muted)">{t.toFixed(2)}</text>
        </g>
      ))}
      <text x={L - 8} y={T - 8} textAnchor="end" fontSize="12" fill="var(--muted)">Posición · alternativa</text>

      {sorted.map((r, k) => {
        const yy = T + k * ROW;
        const first = r.rank === 1;
        let acc = 0;
        return (
          <g key={r.name + k}>
            <text x={L - 10} y={yy + BAR / 2 + 4.5} textAnchor="end" fontSize="13" fontWeight={first ? 700 : 500} fill="var(--ink)">
              <title>{r.name}</title>
              #{r.rank} {clip(r.name, 22)}
            </text>
            {criteria.map((c, i) => {
              const v = Math.max(0, fin(r.parts[i] ?? 0));
              const x0 = x(acc), x1 = x(acc + v);
              acc += v;
              const w = x1 - x0;
              if (w <= 0.01) return null;
              const text = w >= 64 ? `${i + 1} · ${v.toFixed(3)}` : w >= 16 ? String(i + 1) : '';
              return (
                <g key={i}>
                  <title>{`${c}: ${v.toFixed(4)}`}</title>
                  <rect x={x0} y={yy} width={w} height={BAR} fill={fillFor(i)} stroke="var(--surface)" strokeWidth={1} />
                  {text && (
                    <text x={(x0 + x1) / 2} y={yy + BAR / 2 + 4} textAnchor="middle" fontSize="12" fontWeight={700} fill="var(--ink)" className="mono" style={halo}>{text}</text>
                  )}
                </g>
              );
            })}
            {/* contorno de la barra: más grueso en la ganadora */}
            <rect x={L} y={yy} width={Math.max(2, x(acc) - L)} height={BAR} fill="none" stroke="var(--ink)" strokeWidth={first ? 1.6 : 0.8} />
            <text x={x(acc) + 8} y={yy + BAR / 2 + 4.5} fontSize="12.5" fontWeight={first ? 700 : 500} fill="var(--ink)" className="mono">
              {fin(r.total).toFixed(4)} #{r.rank}{first ? ' ✓' : ''}
            </text>
          </g>
        );
      })}
      <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" fontSize="12" fill="var(--muted)">
        {`Longitud total = ${unit}; cada tramo es lo que aporta un criterio (número = criterio de la leyenda)`}
      </text>
    </svg>
    </div>
  );
}
