/** Escala de eje con marcas «redondas» (0, 0.1, 0.2… en vez de 0, 0.09, 0.18…): elige el paso más pequeño de la serie 1-2-5
 * que deja como máximo 5 intervalos y sube el tope al siguiente múltiplo de ese paso. */
export function niceScale(max: number): { top: number; ticks: number[] } {
  const raw = max > 0 ? max : 1;
  const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100];
  const step = steps.find((s) => raw / s <= 5) ?? raw;
  const n = Math.ceil(raw / step - 1e-9);
  return { top: n * step, ticks: Array.from({ length: n + 1 }, (_, i) => Number((i * step).toFixed(10))) };
}
