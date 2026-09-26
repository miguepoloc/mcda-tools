/** Copia de `arr` con el elemento de la posición `from` movido a la posición `to` (0-based). Fuera de rango se deja tal cual.
 * Reordenar criterios o alternativas no rompe los juicios de AHP: `getV` (ahp.ts) acepta la clave del par en cualquiera de los
 * dos órdenes y le cambia el signo cuando está invertida, y la matriz de decisión se guarda por id, no por posición. */
export function moveItem<T>(arr: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return [...arr];
  const next = [...arr];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}
