'use client';

import { useId } from 'react';
import { electreKernel } from '@/lib/electre';

type Props = {
  names: string[];
  /** outranks[i][k] = true si la alternativa i supera a la k (ver electre.ts). */
  outranks: boolean[][];
  concordance: number[][];
  discordance: number[][];
  cStar: number;
  dStar: number;
};

const W = 720;
const H = 380;
const CX = W / 2;
const CY = H / 2;

/** Parte un nombre en dos líneas por el espacio más cercano al centro, para que quepa dentro del nodo. */
function lines(name: string, max: number): string[] {
  const clip = (s: string) => (s.length > max ? s.slice(0, max - 1) + '…' : s);
  if (name.length <= max - 2 || !name.includes(' ')) return [clip(name)];
  const mid = name.length / 2;
  let cut = -1;
  for (let i = 0; i < name.length; i++) if (name[i] === ' ' && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i;
  return [clip(name.slice(0, cut)), clip(name.slice(cut + 1))];
}

/** Grafo de superación de ELECTRE: un nodo por alternativa; flecha i → k cuando i supera a k, con su concordancia (c) y
 * discordancia (d) escritas sobre la flecha; punta en ambos extremos si se superan mutuamente; línea punteada gris
 * «incomparables» cuando ninguna supera a la otra. Todo va escrito en el propio dibujo (no depende de hover ni de color),
 * así que sirve igual en pantalla táctil, con teclado y en el informe impreso. SVG propio sin librerías: con las pocas
 * alternativas de un proyecto MCDA basta una elipse, y así las líneas no atraviesan otros nodos. Se redibuja con c* y d*. */
export default function ElectreGraph({ names, outranks, concordance, discordance, cStar, dStar }: Props) {
  const uid = useId().replace(/:/g, '');
  const n = names.length;
  if (n === 0) return null;

  const big = n <= 4;
  const NODE = big ? 46 : 36;
  const Rx = big ? 250 : 265;
  const Ry = big ? 118 : 128;
  // n=3: dos nodos arriba y uno abajo (lectura natural); n par: rectángulo; n impar > 3: uno arriba
  const a0 = n === 2 ? Math.PI : n === 3 ? -(5 * Math.PI) / 6 : n % 2 === 0 ? -Math.PI / 2 - Math.PI / n : -Math.PI / 2;
  const pos = names.map((_, i) => {
    const t = a0 + (2 * Math.PI * i) / n;
    return { x: CX + Rx * Math.cos(t), y: CY + Ry * Math.sin(t) };
  });
  const beats = (i: number, k: number) => !!outranks[i]?.[k];
  const outDeg = names.map((_, i) => names.filter((__, k) => i !== k && beats(i, k)).length);
  const hasRelations = outDeg.some((d) => d > 0);
  // Núcleo real de ELECTRE I (los ciclos cuentan como un bloque): «nadie la supera» no basta, una alternativa aislada o un ciclo lo falsean.
  const kernel = electreKernel(outranks);
  const inKernel = new Set(hasRelations ? kernel.members : []);
  const isolated = new Set(kernel.isolated);

  type Edge = { i: number; k: number; kind: 'one' | 'both' | 'none' };
  const edges: Edge[] = [];
  for (let i = 0; i < n; i++) {
    for (let k = i + 1; k < n; k++) {
      const ik = beats(i, k), ki = beats(k, i);
      if (ik && ki) edges.push({ i, k, kind: 'both' });
      else if (ik) edges.push({ i, k, kind: 'one' });
      else if (ki) edges.push({ i: k, k: i, kind: 'one' });
      else edges.push({ i, k, kind: 'none' });
    }
  }

  const rel = edges.filter((e) => e.kind !== 'none');
  const summary = `Grafo de superación con ${n} alternativas, c* = ${cStar.toFixed(2)} y d* = ${dStar.toFixed(2)}. `
    + (rel.length
      ? rel.map((e) => (e.kind === 'both' ? `${names[e.i]} y ${names[e.k]} se superan mutuamente` : `${names[e.i]} supera a ${names[e.k]}`)).join('. ') + '. '
      : 'Ninguna alternativa supera a otra. ')
    + (edges.some((e) => e.kind === 'none') ? 'Incomparables: ' + edges.filter((e) => e.kind === 'none').map((e) => `${names[e.i]} y ${names[e.k]}`).join(', ') + '.' : '');

  const arrow = `url(#${uid}-a)`;
  const halo = { paintOrder: 'stroke' as const, stroke: 'var(--surface)', strokeWidth: 5, strokeLinejoin: 'round' as const };
  const cd = (i: number, k: number) => `c=${concordance[i]?.[k]?.toFixed(2)} · d=${discordance[i]?.[k]?.toFixed(2)}`;
  const labelSize = big ? 13 : 12;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} style={{ width: '100%', maxWidth: 720, display: 'block', margin: '0 auto' }}>
        <defs>
          <marker id={`${uid}-a`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--m-electre)" />
          </marker>
        </defs>

        {/* primero las punteadas (incomparables) para que las flechas queden encima */}
        {[...edges].sort((a, b) => (a.kind === 'none' ? -1 : 0) - (b.kind === 'none' ? -1 : 0)).map(({ i, k, kind }) => {
          const dx = pos[k].x - pos[i].x, dy = pos[k].y - pos[i].y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len, uy = dy / len;
          const gap = NODE + (kind === 'none' ? 0 : 4);
          const x1 = pos[i].x + ux * gap, y1 = pos[i].y + uy * gap, x2 = pos[k].x - ux * gap, y2 = pos[k].y - uy * gap;
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          if (kind === 'none') {
            return (
              <g key={`${i}-${k}`}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--muted)" strokeOpacity={0.7} strokeWidth={1.8} strokeDasharray="7 6" />
                {n <= 4 && <text x={mx} y={my + 4} textAnchor="middle" fontSize={12.5} fontStyle="italic" fontWeight={600} fill="var(--muted)" style={halo}>incomparables</text>}
              </g>
            );
          }
          return (
            <g key={`${i}-${k}`}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--m-electre)" strokeWidth={2.6} markerEnd={arrow} markerStart={kind === 'both' ? arrow : undefined} />
              {kind === 'both' ? (
                <>
                  <text x={mx} y={my - 3} textAnchor="middle" fontSize={labelSize} fontWeight={700} fill="var(--ink)" className="mono" style={halo}>{'→ ' + cd(i, k)}</text>
                  <text x={mx} y={my + 13} textAnchor="middle" fontSize={labelSize} fontWeight={700} fill="var(--ink)" className="mono" style={halo}>{'← ' + cd(k, i)}</text>
                </>
              ) : (
                <text x={mx} y={my + 4} textAnchor="middle" fontSize={labelSize} fontWeight={700} fill="var(--ink)" className="mono" style={halo}>{cd(i, k)}</text>
              )}
            </g>
          );
        })}

        {names.map((nm, i) => {
          const p = pos[i];
          const k = kernel.winner === i;
          const kin = inKernel.has(i);
          const ls = lines(nm, big ? 13 : 10);
          const fs = big ? 13.5 : 12;
          return (
            <g key={i}>
              <title>{nm}</title>
              <circle cx={p.x} cy={p.y} r={NODE} fill="var(--m-electre)" fillOpacity={0.28} stroke={kin ? 'var(--pass)' : 'var(--m-electre)'} strokeWidth={kin ? 4 : 2.5} strokeDasharray={isolated.has(i) ? '6 4' : undefined} />
              {ls.map((l, j) => (
                <text key={j} x={p.x} y={p.y + 4.5 + (j - (ls.length - 1) / 2) * (fs + 2)} textAnchor="middle" fontSize={fs} fontWeight={700} fill="var(--ink)">{l}</text>
              ))}
              {k && (
                <g>
                  <circle cx={p.x + NODE * 0.72} cy={p.y - NODE * 0.72} r={11} fill="var(--pass)" />
                  <text x={p.x + NODE * 0.72} y={p.y - NODE * 0.72 + 4.5} textAnchor="middle" fontSize={13} fontWeight={700} fill="#fff">✓</text>
                </g>
              )}
            </g>
          );
        })}

        {!hasRelations && (
          <text x={CX} y={H - 8} textAnchor="middle" fontSize={12.5} fill="var(--muted)">Ninguna alternativa supera a otra con estos umbrales</text>
        )}
      </svg>

      <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0', textAlign: 'center' }}>
        <b style={{ color: 'var(--m-electre)' }}>A → B</b> = A supera a B (con su concordancia c y discordancia d) · <b style={{ color: 'var(--m-electre)' }}>A ↔ B</b> = se superan mutuamente · <b>línea punteada</b> = incomparables (verificado: ninguna supera a la otra){hasRelations && (kernel.winner != null
          ? ' · ✓ = única alternativa del núcleo (nadie la supera y supera a las demás)'
          : ' · aro verde = núcleo (varios: no hay ganador único)' + (kernel.isolated.length ? ', punteado = aislada (no se relaciona con nadie)' : ''))}
      </p>
      {/* Con más de 4 alternativas la etiqueta «incomparables» no cabe sobre cada línea punteada: se lista aquí, con nombre y apellido. */}
      {n > 4 && edges.some((e) => e.kind === 'none') && (
        <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0', textAlign: 'center' }}>
          <b>Incomparables (líneas punteadas, {edges.filter((e) => e.kind === 'none').length}):</b> {edges.filter((e) => e.kind === 'none').map((e) => `${names[e.i]} y ${names[e.k]}`).join('; ')}.
        </p>
      )}
    </div>
  );
}
