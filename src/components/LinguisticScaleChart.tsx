import { LINGUISTIC_ALT, LINGUISTIC_LABELS } from '@/lib/fuzzy_topsis';

/** Escala lingüística de Fuzzy TOPSIS (versión de 5 niveles adaptada de Chen, 2000; Chen usa una escala más fina): cinco funciones de pertenencia triangulares (l, m, u) sobre el eje 0–10.
 * Cada triángulo lleva su etiqueta y su terna escritas sobre el pico (alternando dos alturas para que no choquen) y un trazo
 * distinto (continuo, rayas, puntos…), así que no depende solo del color. Las etiquetas presentes en la matriz de decisión
 * (`used`) se dibujan con trazo grueso y «●» en la leyenda. Colores por variables CSS (--s1..--s5, --ink, --muted, --line,
 * --surface) que el informe redefine en claro. SVG propio sin librerías. */
const NAMES: Record<string, string> = { VP: 'Muy pobre', P: 'Pobre', F: 'Regular', G: 'Bueno', VG: 'Muy bueno' };
const COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)'];
const DASHES = [undefined, '8 4', '2 3', '10 3 2 3', '5 2 1 2'];
// altura de la etiqueta sobre el pico: VP (pico en 0) y P (pico en 1) quedan a solo una unidad, así que P sube un nivel
const LEVEL = [0, 1, 0, 0, 0];

const W = 720, X0 = 48, UNIT = 63, YTOP = 104, YBASE = 232;
const px = (v: number) => X0 + v * UNIT;

export default function LinguisticScaleChart({ used }: { used?: string[] }) {
  const usedSet = new Set(used ?? []);
  const hasUsed = usedSet.size > 0;
  const H = hasUsed ? 336 : 318;
  const items = LINGUISTIC_LABELS.map((label, i) => ({ label, i, tfn: LINGUISTIC_ALT[label] }));
  const tfnText = (t: number[]) => `(${t.join(', ')})`;
  const summary = 'Escala lingüística de la plataforma (5 niveles, adaptada de Chen, 2000): cada etiqueta es un número difuso triangular (l, m, u) sobre un eje de 0 a 10. '
    + items.map(({ label, tfn }) => `${label} ${NAMES[label]} ${tfnText(tfn)}`).join('; ') + '.'
    + (hasUsed ? ` Etiquetas usadas en la matriz de decisión: ${items.filter((it) => usedSet.has(it.label)).map((it) => it.label).join(', ')}.` : '');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} style={{ width: '100%', maxWidth: 720, display: 'block', margin: '0 auto' }}>
      <text x={8} y={16} fontSize="12" fill="var(--muted)">Escala lingüística (5 niveles, adaptada de Chen, 2000): cada etiqueta es un TFN (l, m, u)</text>

      {/* rejilla de pertenencia 0 / 0.5 / 1 */}
      {[0, 0.5, 1].map((m) => {
        const y = YBASE - m * (YBASE - YTOP);
        return (
          <g key={m}>
            <line x1={X0} x2={px(10)} y1={y} y2={y} stroke="var(--line)" strokeDasharray={m === 0 ? undefined : '3 4'} />
            <text x={X0 - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{m.toFixed(1)}</text>
          </g>
        );
      })}
      {Array.from({ length: 11 }, (_, v) => (
        <g key={v}>
          <line x1={px(v)} x2={px(v)} y1={YBASE} y2={YBASE + 4} stroke="var(--muted)" />
          <text x={px(v)} y={YBASE + 17} textAnchor="middle" fontSize="11" fill="var(--muted)">{v}</text>
        </g>
      ))}
      <text x={X0 + 5 * UNIT} y={YBASE + 34} textAnchor="middle" fontSize="11" fill="var(--muted)">Puntaje (0 a 10) · eje vertical: grado de pertenencia</text>

      {/* triángulos: los usados se dibujan al final (encima) */}
      {[...items].sort((a, b) => Number(usedSet.has(a.label)) - Number(usedSet.has(b.label))).map(({ label, i, tfn }) => {
        const [l, m, u] = tfn;
        // con l = m (VP) o m = u la punta cae sobre el borde: el polígono degenera en triángulo rectángulo
        const pts = `${px(l)},${YBASE} ${px(m)},${YTOP} ${px(u)},${YBASE}`;
        const isUsed = usedSet.has(label);
        return (
          <polygon key={label} points={pts} fill={COLORS[i]} fillOpacity={isUsed ? 0.16 : 0.07} stroke={COLORS[i]}
            strokeWidth={isUsed ? 3.6 : 1.8} strokeDasharray={DASHES[i]} strokeLinejoin="round">
            <title>{`${label} · ${NAMES[label]} ${tfnText(tfn)}${isUsed ? ' (usada en la matriz)' : ''}`}</title>
          </polygon>
        );
      })}

      {/* etiquetas sobre el pico, en dos alturas, con hilo hasta el pico */}
      {items.map(({ label, i, tfn }) => {
        const cx = px(tfn[1]);
        const y0 = LEVEL[i] === 1 ? 34 : 68; // línea del nombre
        const isUsed = usedSet.has(label);
        return (
          <g key={label}>
            <line x1={cx} x2={cx} y1={y0 + 18} y2={YTOP - 3} stroke="var(--muted)" strokeWidth={0.8} strokeDasharray="2 2" />
            <text x={cx} y={y0 + 4} textAnchor="middle" fontSize="13.5" fontWeight={700} fill="var(--ink)">{isUsed ? '● ' : ''}{label}</text>
            <text x={cx} y={y0 + 17} textAnchor="middle" fontSize="11.5" fill="var(--ink)" className="mono">{tfnText(tfn)}</text>
          </g>
        );
      })}

      {/* leyenda escrita, con el mismo trazo que cada triángulo */}
      {items.map(({ label, i }) => {
        const lx = 8 + i * 143;
        const ly = YBASE + 62;
        const isUsed = usedSet.has(label);
        return (
          <g key={label}>
            <line x1={lx} x2={lx + 22} y1={ly - 4} y2={ly - 4} stroke={COLORS[i]} strokeWidth={isUsed ? 3.6 : 1.8} strokeDasharray={DASHES[i]} />
            <text x={lx + 28} y={ly} fontSize="11.5" fill="var(--ink)" fontWeight={isUsed ? 700 : 400}>{isUsed ? '● ' : ''}{label} · {NAMES[label]}</text>
          </g>
        );
      })}
      {hasUsed && (
        <text x={8} y={YBASE + 86} fontSize="11.5" fill="var(--muted)">● = etiqueta usada en la matriz de decisión de este proyecto (trazo grueso)</text>
      )}
    </svg>
  );
}
