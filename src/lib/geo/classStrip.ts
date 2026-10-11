/** Lógica pura del editor de clases: la «franja» proporcional 0–100, el texto de cada rango y la validación de un
 * corte escrito a mano. Sin DOM ni React: se prueba en `scripts/check-geo-classes.ts`. Los cortes viajan como
 * fracciones 0–1 (como en `classes.ts`); el usuario los ve y escribe en % (0–100, hasta un decimal). */
import { classRange } from './classes.ts';

/** Fracción 0–1 → texto en % con hasta un decimal («0.645» → «64.5», «0.64» → «64»). */
export const fmtCut = (frac: number): string => String(Math.round(frac * 1000) / 10);

/** % escrito por el usuario → fracción 0–1 con la resolución de un decimal (64 → 0.64). */
export const cutFromPct = (pct: number): number => Math.round(pct * 10) / 1000;

/** «de 48 a menos de 64» para las clases con una vecina de arriba; «de 64 a 100» para la última (incluye el 100). */
export function rangeText(from: number, to: number, isLast: boolean): string {
  return isLast ? `de ${fmtCut(from)} a ${fmtCut(to)}` : `de ${fmtCut(from)} a menos de ${fmtCut(to)}`;
}

export type StripSeg = {
  /** Índice de la clase (0 = la de menor índice). */
  i: number; name: string;
  /** Inicio, fin y ancho en % del eje 0–100. */
  from: number; to: number; width: number;
  text: string;
};

/** Segmentos de la franja, de izquierda (0) a derecha (100). Una clase sin rango (dos cortes iguales) tiene ancho 0. */
export function classStrip(breaks: number[], names: string[]): StripSeg[] {
  const n = breaks.length + 1;
  return Array.from({ length: n }, (_, i) => {
    const [a, b] = classRange(breaks, i);
    const from = a * 100, to = b * 100;
    return { i, name: names[i] ?? `Clase ${i + 1}`, from, to, width: Math.max(0, to - from), text: rangeText(a, b, i === n - 1) };
  });
}

/** Texto alternativo de la franja: todas las clases con su rango, de la más alta a la más baja. */
export function stripAlt(segs: StripSeg[]): string {
  return 'Reparto del índice de 0 a 100: ' + [...segs].reverse().map((s) => `${s.name}, ${s.text}`).join('; ') + '.';
}

/** Rótulos de los cortes interiores. Se omite el que quedaría a menos de `minGap` puntos del anterior o del 100,
 * para que los números no se encimen (el rango completo siempre está en el texto alternativo y en la lista). */
export function stripTicks(breaks: number[], minGap = 6): { pos: number; label: string }[] {
  const out: { pos: number; label: string }[] = [];
  let last = 0;
  for (const b of breaks) {
    const pos = b * 100;
    if (pos - last >= minGap && 100 - pos >= minGap) { out.push({ pos, label: fmtCut(b) }); last = pos; }
  }
  return out;
}

export type CutCheck = { ok: true; value: number } | { ok: false; message: string };

/** Valida el valor (en %) del corte `k` (entre la clase k y la k+1, 0-based). Debe ser un número en (0, 100), mayor
 * que el corte anterior y menor que el siguiente. `value` es la fracción 0–1 ya redondeada a un decimal de %. */
export function validateCut(breaks: number[], k: number, pct: number): CutCheck {
  if (!Number.isFinite(pct)) return { ok: false, message: 'Escribe un número entre 0 y 100.' };
  const v = cutFromPct(pct);
  if (v <= 0 || v >= 1) return { ok: false, message: 'El corte debe estar entre 0 y 100 (sin incluirlos).' };
  if (k > 0 && v <= breaks[k - 1]) return { ok: false, message: `El corte debe estar entre 0 y 100 y ser mayor que el anterior (${fmtCut(breaks[k - 1])}).` };
  if (k < breaks.length - 1 && v >= breaks[k + 1]) return { ok: false, message: `El corte debe ser menor que el siguiente (${fmtCut(breaks[k + 1])}).` };
  return { ok: true, value: v };
}

/** Paso con las flechas: ±1 (±5 con Mayús) sobre el valor en %, sin pasar de 0 ni de 100. */
export function stepCut(pct: number, dir: 1 | -1, shift: boolean): number {
  return Math.round((pct + dir * (shift ? 5 : 1)) * 10) / 10;
}
