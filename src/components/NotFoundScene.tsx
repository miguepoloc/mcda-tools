'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** «La matriz que no cierra»: el 404 como un juicio AHP intransitivo. Tres destinos comparados por pares
 * forman un ciclo —A>B, B>C, C>A—, así que la matriz sale inconsistente y no hay prioridades posibles. */

const LETTER = ['A', 'B', 'C'];

// Geometría del anillo (viewBox 100): nodos a -90°, 30° y 150° sobre R=36.
const R = 36;
const NODE_ANGLES = [-90, 30, 150];
const pt = (deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [50 + R * Math.cos(a), 50 + R * Math.sin(a)] as const;
};
const arc = (from: number, to: number, sweep: 0 | 1) => {
  const [x1, y1] = pt(from);
  const [x2, y2] = pt(to);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${R} ${R} 0 0 ${sweep} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};
const GAP = 21;
const [a0, a1, a2] = NODE_ANGLES;
const ARC_AB = arc(a0 + GAP, a1 - GAP, 1);
const ARC_BC = arc(a1 + GAP, a2 - GAP, 1);
const ARC_CA = arc(a2 + GAP, a0 + 360 - GAP, 1);

export default function NotFoundScene() {
  const rawPath = usePathname() ?? '';
  let path = rawPath;
  try { path = decodeURIComponent(rawPath); } catch { /* ruta con % mal formado: se muestra tal cual */ }

  return (
    <div className="nf">
      <div className="nf-hero">
        <div className="eyebrow">Error 404 · Juicio inconsistente</div>

        <div className="nf-code" role="img" aria-label="Error 404">
          <span aria-hidden="true">4</span>
          <svg className="nf-ring" viewBox="0 -9 100 100" aria-hidden="true">
            <defs>
              <marker id="nf-arrow" viewBox="0 0 10 10" refX="6.5" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse">
                <path d="M0 0.5L9 5L0 9.5Z" fill="currentColor" />
              </marker>
            </defs>
            <circle className="nf-orbit" cx="50" cy="50" r={R} />
            <g className="nf-arcs">
              <path d={ARC_AB} markerEnd="url(#nf-arrow)" />
              <path d={ARC_BC} markerEnd="url(#nf-arrow)" />
              <path d={ARC_CA} markerEnd="url(#nf-arrow)" />
            </g>
            {NODE_ANGLES.map((deg, i) => {
              const [x, y] = pt(deg);
              return (
                <g key={i} className="nf-node">
                  <circle cx={x} cy={y} r="9.5" />
                  <text x={x} y={y} textAnchor="middle" dominantBaseline="central">{LETTER[i]}</text>
                </g>
              );
            })}
          </svg>
          <span aria-hidden="true">4</span>
        </div>

        <h1>Esta ruta no cierra la matriz.</h1>
        <p className="nf-lead">
          Comparamos esta dirección con todo lo que conocemos y salió un círculo: Inicio (A) le gana a Proyectos (B),
          Proyectos le gana a Método (C) y Método le gana a Inicio. Con juicios así no hay prioridades, ni Saaty te
          sacaría de aquí.
        </p>

        <div className="nf-path">
          <span className="nf-path-k">Buscaste</span>
          <code title={path}>{path || '/'}</code>
        </div>

        <div className="acts nf-acts">
          <Link className="btn primary nf-btn" href="/">Volver al inicio</Link>
          <Link className="btn nf-btn" href="/dashboard">Mis proyectos</Link>
          <Link className="btn nf-btn" href="/metodo">¿Qué método uso?</Link>
        </div>
      </div>
    </div>
  );
}
