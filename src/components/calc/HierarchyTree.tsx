'use client';

export type HierarchyCriterion = { name: string; /** Peso del criterio (0 a 1). Si falta, se dibuja sin peso. */ weight?: number };
export type HierarchyAlternative = { name: string; /** Puntaje final del método (opcional). */ score?: number; /** Posición 1..n (opcional). */ rank?: number };

type Props = {
  /** Objetivo de la decisión (nivel 1). */
  goal: string;
  criteria: HierarchyCriterion[];
  alternatives: HierarchyAlternative[];
  /** Nombre del puntaje que se muestra bajo cada alternativa, p. ej. «prioridad global» o «cercanía C». Solo si hay `score`. */
  scoreLabel?: string;
  /** Cifras del puntaje (por defecto 4 decimales). */
  scoreDigits?: number;
};

const COL_G = 190, COL_C = 220, COL_A = 220, GAP = 60, PAD = 12, ROW = 46, BOX = 38, HEAD = 34;
const W = PAD + COL_G + GAP + COL_C + GAP + COL_A + PAD;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const fin = (x: number | undefined) => (x != null && Number.isFinite(x) ? x : undefined);

/** Divide `s` en hasta `maxLines` líneas de ~`n` caracteres, cortando en espacios; la última lleva «…» si se recorta. */
function wrap(s: string, n: number, maxLines: number): string[] {
  const words = s.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > n && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const cut = lines.slice(0, maxLines); cut[maxLines - 1] = clip(cut[maxLines - 1] + '…', n); return cut; }
  return lines.map((l) => clip(l, n));
}

/** Árbol jerárquico de la decisión: objetivo → criterios (con su peso) → alternativas (con su puntaje). Sirve para TODOS los métodos:
 * en todos hay un objetivo, unos criterios ponderados y unas alternativas. SVG propio, sin librerías; los criterios llevan el mismo
 * número y color que en ContributionBars (--s1…--s5; del 6.º en adelante gris con el número) y el grosor de la línea objetivo→criterio
 * es proporcional al peso, además de escribirse el peso. Las líneas criterio→alternativa son finas: en AHP y en los demás métodos
 * TODAS las alternativas se evalúan bajo TODOS los criterios. Lo que va en un `overflow-x:auto` propio (región con foco), para no
 * ensanchar la página en el móvil. */
export default function HierarchyTree({ goal, criteria, alternatives, scoreLabel = 'puntaje', scoreDigits = 4 }: Props) {
  if (!criteria.length || !alternatives.length) return null;

  const rows = Math.max(criteria.length, alternatives.length);
  const H = HEAD + rows * ROW + PAD;
  const xG = PAD, xC = PAD + COL_G + GAP, xA = xC + COL_C + GAP;
  const yOf = (i: number, n: number) => HEAD + (rows * ROW - n * ROW) / 2 + i * ROW + (ROW - BOX) / 2; // columnas centradas en vertical
  const goalLines = wrap(goal || 'Objetivo de la decisión', 23, 4);
  const goalH = Math.max(52, 20 + goalLines.length * 15);
  const gy = HEAD + (rows * ROW) / 2 - goalH / 2;

  const ws = criteria.map((c) => fin(c.weight));
  const wmax = Math.max(...ws.map((w) => w ?? 0), 1e-9);
  const fill = (i: number) => (i < 5 ? `var(--s${i + 1})` : 'var(--other)');

  const summary = `Jerarquía de la decisión. Nivel 1, objetivo: ${goal || 'sin escribir'}. Nivel 2, ${criteria.length} criterios: `
    + criteria.map((c, i) => `${i + 1} ${c.name}${fin(c.weight) != null ? ` (peso ${(c.weight! * 100).toFixed(1)} %)` : ''}`).join('; ')
    + `. Nivel 3, ${alternatives.length} alternativas, todas evaluadas bajo cada criterio: `
    + alternatives.map((a) => `${a.name}${a.rank != null ? ` (posición ${a.rank})` : ''}`).join('; ') + '.';

  return (
    <figure className="ahp-tree" style={{ margin: 0 }}>
      <div className="ahp-svgscroll" role="region" aria-label="Árbol jerárquico de la decisión" tabIndex={0}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} style={{ display: 'block', margin: '0 auto', width: '100%', minWidth: W, height: 'auto' }}>
          <title>Jerarquía: objetivo, criterios y alternativas</title>
          {/* encabezados de nivel */}
          <g fontSize="12" fontWeight="600" fill="var(--muted)">
            <text x={xG + COL_G / 2} y={20} textAnchor="middle">Nivel 1 · Objetivo</text>
            <text x={xC + COL_C / 2} y={20} textAnchor="middle">Nivel 2 · Criterios (peso)</text>
            <text x={xA + COL_A / 2} y={20} textAnchor="middle">Nivel 3 · Alternativas{fin(alternatives[0]?.score) != null ? ` (${scoreLabel})` : ''}</text>
          </g>

          {/* líneas criterio → alternativa (finas) */}
          <g stroke="var(--line)" strokeWidth={1} fill="none">
            {criteria.map((_, i) => alternatives.map((__, j) => (
              <line key={`${i}-${j}`} x1={xC + COL_C} y1={yOf(i, criteria.length) + BOX / 2} x2={xA} y2={yOf(j, alternatives.length) + BOX / 2} />
            )))}
          </g>
          {/* líneas objetivo → criterio: el grosor sigue al peso */}
          <g stroke="var(--ink)" fill="none" strokeLinecap="round">
            {criteria.map((_, i) => (
              <line key={i} x1={xG + COL_G} y1={gy + goalH / 2} x2={xC} y2={yOf(i, criteria.length) + BOX / 2}
                strokeWidth={ws[i] != null ? 1 + 5 * (ws[i]! / wmax) : 1.5} opacity={0.75} />
            ))}
          </g>

          {/* objetivo */}
          <g>
            <rect x={xG} y={gy} width={COL_G} height={goalH} rx={8} fill="var(--surface2)" stroke="var(--ink)" strokeWidth={1.6} />
            {goalLines.map((l, k) => (
              <text key={k} x={xG + COL_G / 2} y={gy + 22 + k * 15} textAnchor="middle" fontSize="12.5" fontWeight={600} fill="var(--ink)">{l}</text>
            ))}
            <title>{goal}</title>
          </g>

          {/* criterios */}
          {criteria.map((c, i) => {
            const y = yOf(i, criteria.length);
            const w = ws[i];
            return (
              <g key={i}>
                <title>{`${c.name}${w != null ? `: peso ${(w * 100).toFixed(2)} %` : ''}`}</title>
                <rect x={xC} y={y} width={COL_C} height={BOX} rx={7} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.1} />
                <rect x={xC} y={y} width={26} height={BOX} rx={7} fill={fill(i)} stroke="var(--ink)" strokeWidth={1.1} />
                <text x={xC + 13} y={y + BOX / 2 + 4.5} textAnchor="middle" fontSize="13" fontWeight={700} fill="var(--ink)" style={{ paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 2.5 }} className="mono">{i + 1}</text>
                <text x={xC + 34} y={y + (w != null ? 16 : BOX / 2 + 4.5)} fontSize="12.5" fontWeight={600} fill="var(--ink)">{clip(c.name, 24)}</text>
                {w != null && <text x={xC + 34} y={y + 31} fontSize="12" fill="var(--muted)" className="mono">{'w = ' + w.toFixed(4) + ' (' + (w * 100).toFixed(1) + ' %)'}</text>}
              </g>
            );
          })}

          {/* alternativas */}
          {alternatives.map((a, j) => {
            const y = yOf(j, alternatives.length);
            const sc = fin(a.score);
            const first = a.rank === 1;
            return (
              <g key={j}>
                <title>{`${a.name}${sc != null ? `: ${sc.toFixed(scoreDigits)}` : ''}${a.rank != null ? ` (posición ${a.rank})` : ''}`}</title>
                <rect x={xA} y={y} width={COL_A} height={BOX} rx={7} fill="var(--surface)" stroke="var(--ink)" strokeWidth={first ? 2.2 : 1.1} />
                <text x={xA + 10} y={y + (sc != null ? 16 : BOX / 2 + 4.5)} fontSize="12.5" fontWeight={first ? 700 : 600} fill="var(--ink)">
                  {a.rank != null ? `#${a.rank} ` : ''}{clip(a.name, 26)}{first ? ' ✓' : ''}
                </text>
                {sc != null && <text x={xA + 10} y={y + 31} fontSize="12" fill="var(--muted)" className="mono">{sc.toFixed(scoreDigits)}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="ahp-tree-cap">
        Cómo leerlo: de izquierda a derecha. El objetivo se descompone en criterios (la línea es más gruesa cuanto más pesa el criterio) y
        cada alternativa se evalúa bajo todos los criterios (líneas finas). El número de cada criterio es el mismo de las gráficas de aporte.
      </figcaption>
    </figure>
  );
}
