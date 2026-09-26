'use client';

import { vikorRegimeText, vikorRegimesFromEnds } from '@/lib/vikorBreakdown';

/** Gráfica de Q según v: una recta por alternativa (Q es lineal en v), en SVG puro sin librerías. Más abajo = mejor (Q menor). El círculo
 * negro marca cada v donde dos rectas se cruzan y cambia el 1er lugar; debajo de la gráfica hay una leyenda escrita y la lectura por
 * tramos de v («gana X si v < 0.40…»), calculada con los mismos extremos que dibuja. */
export default function VikorSensitivityChart({ names, ends, v, breaks, solidLabels = false }: {
  names: string[]; ends: { q: number[] }[]; v: number; breaks: number[];
  /** Informe impreso: el rótulo de cada línea va en tinta y no en el color de la serie (el amarillo de --s4 no se lee sobre papel blanco); la línea sigue llevando el color. */
  solidLabels?: boolean;
}) {
  const colorOf = (i: number) => `var(--s${(i % 5) + 1})`;
  // Además del color, cada serie lleva un trazo y una forma de marcador propios: en blanco y negro (informe impreso) las rectas
  // de una misma alternativa se siguen por su trazo, y al final de la línea el marcador dice de quién es.
  const DASH = [undefined, '8 4', '2 4', '10 3 2 3', '5 2 1 2'];
  const marker = (i: number, cx: number, cy: number, r: number, stroke: string) => {
    const f = colorOf(i), k = i % 5;
    const common = { fill: f, stroke, strokeWidth: 1.5 } as const;
    if (k === 0) return <circle cx={cx} cy={cy} r={r} {...common} />;
    if (k === 1) return <rect x={cx - r} y={cy - r} width={2 * r} height={2 * r} {...common} />;
    if (k === 2) return <path d={`M${cx},${cy - r - 1} L${cx + r + 1},${cy + r} L${cx - r - 1},${cy + r} Z`} {...common} />;
    if (k === 3) return <path d={`M${cx},${cy - r - 1} L${cx + r + 1},${cy} L${cx},${cy + r + 1} L${cx - r - 1},${cy} Z`} {...common} />;
    return <path d={`M${cx - r},${cy - r} L${cx + r},${cy + r} M${cx + r},${cy - r} L${cx - r},${cy + r}`} fill="none" stroke={f} strokeWidth={3} />;
  };
  const W = 640, H = 350, L = 50, R = 150, T = 22, B = 92;
  const x = (val: number) => L + val * (W - L - R);
  const y = (q: number) => T + (1 - q) * (H - T - B);
  const q0 = ends[0].q, q1 = ends[1].q;
  const at = (i: number, val: number) => q0[i] + (q1[i] - q0[i]) * val;
  // rótulos directos al final de cada línea, de arriba hacia abajo y separados para que no se pisen
  const top = [...names.keys()].sort((a, b) => y(q1[a]) - y(q1[b]));
  const ly: number[] = [];
  top.forEach((i, k) => { ly[i] = k === 0 ? y(q1[i]) : Math.max(y(q1[i]), ly[top[k - 1]] + 15); });
  const summary = `Q de cada alternativa según v de 0 a 1. ${names.map((n, i) => `${n}: ${q0[i].toFixed(2)} con v=0 y ${q1[i].toFixed(2)} con v=1`).join('; ')}.`;
  const view = vikorRegimesFromEnds(q0, q1);
  const regimeText = vikorRegimeText(view, names);
  return (
    <>
    <div className="calc-chart" style={{ ['--cw' as string]: W + 'px', marginTop: 14 }}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} style={{ width: '100%', maxWidth: 720, display: 'block' }}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={'gy' + t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="3 4" />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill="var(--muted)">{t.toFixed(2)}</text>
        </g>
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={'gx' + t}>
          <line x1={x(t)} x2={x(t)} y1={y(1)} y2={y(0)} stroke="var(--line)" strokeDasharray="3 4" />
          <text x={x(t)} y={H - B + 16} textAnchor="middle" fontSize="12" fill="var(--muted)">{t.toFixed(2)}</text>
        </g>
      ))}
      <text x={(L + W - R) / 2} y={H - B + 36} textAnchor="middle" fontSize="12.5" fill="var(--ink)">v (peso de S; 1 − v = peso de R)</text>
      <text x={12} y={(T + H - B) / 2} textAnchor="middle" fontSize="12.5" fill="var(--ink)" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>Q (más abajo = mejor)</text>
      {/* v actual */}
      <line x1={x(v)} x2={x(v)} y1={y(1)} y2={y(0)} stroke="var(--accent)" strokeWidth="1.6" strokeDasharray="5 4" />
      <text x={x(v)} y={T - 6} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--accent)">v = {v.toFixed(2)}</text>
      {names.map((n, i) => (
        <g key={n + i}>
          <line x1={x(0)} y1={y(q0[i])} x2={x(1)} y2={y(q1[i])} stroke={colorOf(i)} strokeWidth="2.6" strokeLinecap={DASH[i % 5] ? 'butt' : 'round'} strokeDasharray={DASH[i % 5]} />
          {marker(i, x(v), y(at(i, v)), 4.5, 'var(--surface)')}
          {/* marcador y nombre al final de la línea, en la altura de su Q (separados si dos terminan casi juntos) */}
          <line x1={x(1)} x2={x(1) + 9} y1={y(q1[i])} y2={ly[i]} stroke="var(--muted)" strokeWidth="0.8" />
          {marker(i, x(1) + 17, ly[i], 4.5, 'var(--ink)')}
          <text x={x(1) + 27} y={ly[i] + 4} fontSize="12.5" fontWeight="700" fill={solidLabels ? 'var(--ink)' : colorOf(i)}>{n.length > 14 ? n.slice(0, 13) + '…' : n}</text>
        </g>
      ))}
      {breaks.map((b) => {
        const qv = Math.min(...names.map((_, i) => at(i, b)));
        return <circle key={b} cx={x(b)} cy={y(qv)} r="8" fill="none" stroke="var(--ink)" strokeWidth="2" />;
      })}
      {/* leyenda escrita */}
      <g fontSize="12" fill="var(--ink)">
        <line x1={L} x2={L + 26} y1={H - B + 58} y2={H - B + 58} stroke="var(--accent)" strokeWidth="1.6" strokeDasharray="5 4" />
        <text x={L + 34} y={H - B + 62}>v que se usó en el ranking (línea vertical discontinua)</text>
        <circle cx={L + 13} cy={H - B + 76} r="7" fill="none" stroke="var(--ink)" strokeWidth="2" />
        <text x={L + 34} y={H - B + 80}>{breaks.length ? 'v donde dos rectas se cruzan y cambia el 1er lugar' : 'sin círculos: el 1er lugar no cambia con ningún v'}</text>
      </g>
    </svg>
    </div>
    <p className="s3-note"><b>Cómo leerlo:</b> cada recta es el Q de una alternativa al variar v de 0 a 1; la que va más abajo en un v dado es la 1.ª.{regimeText ? ` ${regimeText}` : ''}</p>
    </>
  );
}

