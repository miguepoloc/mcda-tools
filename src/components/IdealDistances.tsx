'use client';

import { useId } from 'react';
import { niceScale } from '@/lib/niceScale';

/** Distancias a la solución ideal (d⁺) y anti-ideal (d⁻) de TOPSIS y Fuzzy TOPSIS: por alternativa (ordenadas por posición), dos
 * barras finas con una escala común. d⁺ va sólida (menor es mejor) y d⁻ rayada con un patrón SVG (mayor es mejor); además hay
 * leyenda escrita y cada valor va como texto, así que nada depende solo del color. Al lado, la cercanía relativa
 * C = d⁻/(d⁺+d⁻) y «✓» en la ganadora. Colores por variables CSS (--m-topsis, --ink, --muted, --line, --surface) que el informe
 * redefine en claro. SVG propio sin librerías, igual que ClosenessBars. */
type Row = { name: string; dPlus: number; dMinus: number; closeness: number; rank: number };

const W = 720, L = 160, BX = 380, T = 30, ROW = 56, BAR = 12, GAP = 5;
const CX = W - 8; // columna de C, alineada a la derecha
const clip = (s: string, n = 22) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export default function IdealDistances({ rows, closenessLabel = 'C' }: { rows: Row[]; closenessLabel?: string }) {
  const uid = useId().replace(/:/g, '');
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  const rawMax = Math.max(...sorted.flatMap((r) => [r.dPlus, r.dMinus]), 0);
  const { top: scale, ticks } = niceScale(rawMax || 1);
  const axisY = T + sorted.length * ROW;
  const H = axisY + 96;
  const x = (d: number) => L + Math.max(0, Math.min(scale, d)) / scale * BX;
  const pat = `${uid}-h`;
  const summary = `Distancias a la solución ideal (d⁺, menor es mejor) y a la anti-ideal (d⁻, mayor es mejor) con la cercanía relativa ${closenessLabel} = d⁻/(d⁺+d⁻), por alternativa y de mejor a peor. `
    + sorted.map((r) => `${r.rank}º ${r.name}: d⁺ ${r.dPlus.toFixed(4)}, d⁻ ${r.dMinus.toFixed(4)}, ${closenessLabel} ${r.closeness.toFixed(4)}`).join('; ') + '.';
  const ly = axisY + 54;
  // Lectura autogenerada: quién es la más cercana al ideal, la más lejana del anti-ideal, y si son la misma.
  const first = sorted[0];
  const minDp = Math.min(...sorted.map((r) => r.dPlus)), maxDm = Math.max(...sorted.map((r) => r.dMinus));
  const nearest = sorted.find((r) => r.dPlus === minDp) ?? first, farthest = sorted.find((r) => r.dMinus === maxDm) ?? first;
  const reading = sorted.length < 2 ? '' : nearest === farthest && nearest === first
    ? `${first.name} queda 1.ª porque combina la d⁺ más corta (${first.dPlus.toFixed(4)}) con la d⁻ más larga (${first.dMinus.toFixed(4)}): la más cercana al ideal y la más lejana del anti-ideal a la vez.`
    : `${first.name} queda 1.ª (${closenessLabel} = ${first.closeness.toFixed(4)}) aunque no gana en las dos distancias: la más cercana al ideal es ${nearest.name} (d⁺ = ${minDp.toFixed(4)}) y la más lejana del anti-ideal es ${farthest.name} (d⁻ = ${maxDm.toFixed(4)}). ${closenessLabel} pondera las dos a la vez.`;
  return (
    <>
    <div className="calc-chart" style={{ ['--cw' as string]: W + 'px' }}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} style={{ width: '100%', maxWidth: 720, display: 'block', margin: '0 auto' }}>
      <defs>
        {/* d⁻: rayas diagonales del color del método sobre el fondo, para distinguirla de d⁺ también en blanco y negro */}
        <pattern id={pat} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--surface)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--m-topsis)" strokeWidth="3" />
        </pattern>
      </defs>
      {ticks.map((t, k) => (
        <g key={k}>
          <line x1={x(t)} x2={x(t)} y1={T - 6} y2={axisY} stroke="var(--line)" strokeDasharray="3 4" />
          <text x={x(t)} y={axisY + 16} textAnchor="middle" fontSize="12" fill="var(--muted)">{t.toFixed(2)}</text>
        </g>
      ))}
      <text x={L - 8} y={T - 10} textAnchor="end" fontSize="12" fill="var(--muted)">Posición · alternativa</text>
      <text x={CX} y={T - 10} textAnchor="end" fontSize="12" fill="var(--muted)">{closenessLabel} = d⁻/(d⁺+d⁻)</text>
      <text x={L + BX / 2} y={axisY + 34} textAnchor="middle" fontSize="12" fill="var(--ink)">Distancia ponderada (misma escala para d⁺ y d⁻)</text>
      {sorted.map((r, k) => {
        const yy = T + k * ROW + 6;
        const first = r.rank === 1;
        const mid = yy + BAR + GAP / 2;
        const val = (d: number, y: number) => (
          <text x={x(d) + 6} y={y + BAR - 2} fontSize="12" fontWeight={first ? 700 : 500} fill="var(--ink)" className="mono">{d.toFixed(4)}</text>
        );
        return (
          <g key={r.name + k}>
            {k > 0 && <line x1={8} x2={W - 8} y1={yy - 9} y2={yy - 9} stroke="var(--line)" strokeOpacity={0.6} />}
            <text x={L - 10} y={mid + 4.5} textAnchor="end" fontSize="13" fontWeight={first ? 700 : 500} fill="var(--ink)">
              <title>{r.name}</title>
              #{r.rank} {clip(r.name)}
            </text>
            {/* d⁺ sólida */}
            <rect x={L} y={yy} width={Math.max(2, x(r.dPlus) - L)} height={BAR} rx={2}
              fill="var(--m-topsis)" fillOpacity={first ? 1 : 0.6} stroke="var(--ink)" strokeWidth={0.8} />
            {val(r.dPlus, yy)}
            {/* d⁻ rayada */}
            <rect x={L} y={yy + BAR + GAP} width={Math.max(2, x(r.dMinus) - L)} height={BAR} rx={2}
              fill={`url(#${pat})`} stroke="var(--ink)" strokeWidth={first ? 1.4 : 0.8} />
            {val(r.dMinus, yy + BAR + GAP)}
            <text x={CX} y={mid + 4.5} textAnchor="end" fontSize="12.5" fontWeight={first ? 700 : 500} fill="var(--ink)" className="mono">
              {closenessLabel} = {r.closeness.toFixed(4)}{first ? ' ✓' : ''}
            </text>
          </g>
        );
      })}
      {/* leyenda escrita: d⁺ sólida, d⁻ rayada */}
      <rect x={L} y={ly - 10} width={22} height={11} rx={2} fill="var(--m-topsis)" stroke="var(--ink)" strokeWidth={0.8} />
      <text x={L + 28} y={ly} fontSize="12.5" fill="var(--ink)">d⁺ al ideal: barra más corta = mejor</text>
      <rect x={L + 250} y={ly - 10} width={22} height={11} rx={2} fill={`url(#${pat})`} stroke="var(--ink)" strokeWidth={0.8} />
      <text x={L + 278} y={ly} fontSize="12.5" fill="var(--ink)">d⁻ al anti-ideal: barra más larga = mejor</text>
    </svg>
    </div>
    {reading && <p className="s3-note"><b>Cómo leerlo:</b> {reading}</p>}
    </>
  );
}
