'use client';

import { useMemo } from 'react';
import { topsisScatterData, type TopsisBreakdown } from '@/lib/topsisBreakdown';

/** Dispersión 2D de TOPSIS (Sesión 3, diapositivas 17 y 46): el ideal A⁺, el anti-ideal A⁻ y cada alternativa en DOS criterios
 * (por defecto los dos de mayor peso), con la línea recta de cada alternativa al ideal. Es solo una proyección: el ranking real
 * usa todos los criterios, y así lo dice el aviso visible. Nada depende solo del color: A⁺ es un rombo, A⁻ una cruz y cada
 * alternativa un círculo con su posición dentro; la ganadora va rellena. Solo variables CSS (--ink, --muted, --line, --surface…). */
export type TopsisScatterProps = {
  /** Resultado de `topsisBreakdown()` (el mismo que usa `TopsisBreakdown`). */
  bd: TopsisBreakdown;
  /** Índices (0-based) de los criterios de los ejes; por defecto, los dos de mayor peso. */
  jx?: number;
  jy?: number;
};

const W = 560, H = 430, L = 66, R = 30, T = 58, B = 92;
const clip = (s: string, n = 18) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export default function TopsisScatter({ bd, jx, jy }: TopsisScatterProps) {
  const d = useMemo(() => topsisScatterData(bd, jx, jy), [bd, jx, jy]);
  if (!d) return null;

  const xs = [...d.points.map((p) => p.x), d.ideal.x, d.anti.x], ys = [...d.points.map((p) => p.y), d.ideal.y, d.anti.y];
  const span = (a: number[]) => { const lo = Math.min(...a), hi = Math.max(...a), pad = (hi - lo || Math.abs(hi) || 1) * 0.12; return [lo - pad, hi + pad] as const; };
  const [x0, x1] = span(xs), [y0, y1] = span(ys);
  const px = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - L - R);
  const py = (v: number) => H - B - ((v - y0) / (y1 - y0)) * (H - T - B);
  const ticks = (lo: number, hi: number) => Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * k) / 4);
  const winIdx = bd.res.order[0];
  const winName = bd.alts[winIdx].name;
  // en este plano, ¿quién queda más cerca de A⁺?
  const d2 = d.points.map((p) => Math.hypot(p.x - d.ideal.x, p.y - d.ideal.y));
  const near2 = d2.indexOf(Math.min(...d2));
  const summary = `Dispersión 2D de TOPSIS en ${d.xName} y ${d.yName}. ` + d.points.map((p) => `${p.rank}º ${p.name}: (${p.x.toFixed(4)}, ${p.y.toFixed(4)})`).join('; ')
    + `. Ideal A⁺ (${d.ideal.x.toFixed(4)}, ${d.ideal.y.toFixed(4)}); anti-ideal A⁻ (${d.anti.x.toFixed(4)}, ${d.anti.y.toFixed(4)}).`;
  const ly = H - B + 58;

  return (
    <figure className="s3-fig">
      <figcaption className="s3-cap">Dónde queda cada alternativa respecto al ideal (proyección 2D)</figcaption>
      <div className="calc-chart" style={{ ['--cw' as string]: W + 'px' }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} style={{ width: '100%', maxWidth: 640, display: 'block', margin: '0 auto' }}>
          <text x={W / 2} y={20} textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--ink)">Alternativas, ideal (A⁺) y anti-ideal (A⁻)</text>
          <text x={W / 2} y={38} textAnchor="middle" fontSize="12" fill="var(--muted)">Proyección: solo 2 de {d.nCriteria} criterios · más cerca de A⁺ = mejor</text>
          {ticks(x0, x1).map((t, k) => (
            <g key={'x' + k}>
              <line x1={px(t)} x2={px(t)} y1={T} y2={H - B} stroke="var(--line)" strokeDasharray="3 4" />
              <text x={px(t)} y={H - B + 16} textAnchor="middle" fontSize="12" fill="var(--muted)">{t.toFixed(3)}</text>
            </g>
          ))}
          {ticks(y0, y1).map((t, k) => (
            <g key={'y' + k}>
              <line x1={L} x2={W - R} y1={py(t)} y2={py(t)} stroke="var(--line)" strokeDasharray="3 4" />
              <text x={L - 8} y={py(t) + 4} textAnchor="end" fontSize="12" fill="var(--muted)">{t.toFixed(3)}</text>
            </g>
          ))}
          <text x={(L + W - R) / 2} y={H - B + 36} textAnchor="middle" fontSize="12.5" fill="var(--ink)">{clip(d.xName, 40)} (valor ponderado v)</text>
          <text x={16} y={(T + H - B) / 2} textAnchor="middle" fontSize="12.5" fill="var(--ink)" transform={`rotate(-90 16 ${(T + H - B) / 2})`}>{clip(d.yName, 40)} (valor ponderado v)</text>

          {/* línea recta de cada alternativa al ideal; la ganadora también al anti-ideal */}
          {d.points.map((p, i) => (
            <line key={'l' + i} x1={px(p.x)} y1={py(p.y)} x2={px(d.ideal.x)} y2={py(d.ideal.y)} stroke="var(--ink)" strokeOpacity={i === winIdx ? 0.85 : 0.35} strokeWidth={i === winIdx ? 1.8 : 1} strokeDasharray={i === winIdx ? undefined : '4 3'} />
          ))}
          <line x1={px(d.points[winIdx].x)} y1={py(d.points[winIdx].y)} x2={px(d.anti.x)} y2={py(d.anti.y)} stroke="var(--ink)" strokeOpacity={0.6} strokeWidth={1.4} strokeDasharray="1 4" strokeLinecap="round" />

          {/* A⁺: rombo · A⁻: cruz */}
          <path d={`M${px(d.ideal.x)},${py(d.ideal.y) - 11} L${px(d.ideal.x) + 11},${py(d.ideal.y)} L${px(d.ideal.x)},${py(d.ideal.y) + 11} L${px(d.ideal.x) - 11},${py(d.ideal.y)} Z`} fill="var(--m-topsis)" stroke="var(--ink)" strokeWidth="1.8" />
          <text x={px(d.ideal.x) + 15} y={py(d.ideal.y) - 9} fontSize="13" fontWeight="700" fill="var(--ink)">A⁺ ideal</text>
          <path d={`M${px(d.anti.x) - 9},${py(d.anti.y) - 9} L${px(d.anti.x) + 9},${py(d.anti.y) + 9} M${px(d.anti.x) + 9},${py(d.anti.y) - 9} L${px(d.anti.x) - 9},${py(d.anti.y) + 9}`} stroke="var(--ink)" strokeWidth="3.4" strokeLinecap="round" />
          <text x={px(d.anti.x) + 14} y={py(d.anti.y) + 18} fontSize="13" fontWeight="700" fill="var(--ink)">A⁻ anti-ideal</text>

          {d.points.map((p, i) => {
            const win = i === winIdx;
            const right = px(p.x) < W * 0.62;
            return (
              <g key={'p' + i}>
                <circle cx={px(p.x)} cy={py(p.y)} r={12} fill={win ? 'var(--ink)' : 'var(--surface)'} stroke="var(--ink)" strokeWidth={win ? 2 : 1.6} />
                <text x={px(p.x)} y={py(p.y) + 4.5} textAnchor="middle" fontSize="12.5" fontWeight="700" fill={win ? 'var(--surface)' : 'var(--ink)'}>{p.rank}</text>
                <text x={px(p.x) + (right ? 17 : -17)} y={py(p.y) + 4.5} textAnchor={right ? 'start' : 'end'} fontSize="12.5" fontWeight={win ? 700 : 500} fill="var(--ink)" style={{ paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 4, strokeLinejoin: 'round' }}>
                  {clip(p.name)}{win ? ' ✓' : ''}
                </text>
              </g>
            );
          })}

          {/* leyenda escrita */}
          <g fontSize="12" fill="var(--ink)">
            <text x={L} y={ly}>◆ A⁺ ideal: lo mejor de cada criterio (cerca = mejor)</text>
            <text x={L} y={ly + 17}>✕ A⁻ anti-ideal: lo peor de cada criterio (lejos = mejor)</text>
            <text x={L} y={ly + 34}>● alternativa (el número es su posición final) · línea recta = distancia al ideal</text>
          </g>
        </svg>
      </div>
      <p className="s3-note"><b>Ojo, es una proyección:</b> aquí solo se ven {d.xName} y {d.yName} (los dos de mayor peso; hay {d.nCriteria} criterios en total). La posición real se calcula con los {d.nCriteria} criterios a la vez (pasos 5 y 6).{' '}
        {near2 === winIdx ? `En este plano ${winName} también es la más cercana al ideal.` : `En este plano la más cercana al ideal es ${d.points[near2].name}, pero la ganadora real es ${winName}: los criterios que no se ven en el dibujo deciden.`}
      </p>
    </figure>
  );
}
