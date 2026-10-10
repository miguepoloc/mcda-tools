/** Lógica pura de la lista de puntos y de sus etiquetas en el mapa: búsqueda por nombre, orden (sin evaluar al final),
 * texto de la etiqueta y descarte voraz de las que se solapan. Sin DOM ni Leaflet: ver `scripts/check-geo-point-labels.ts`. */

/** Sin tildes ni mayúsculas, para comparar nombres («Bahía» = «bahia»). */
export const foldText = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Con más de este número de puntos la lista ofrece el campo «Buscar punto». */
export const SEARCH_THRESHOLD = 12;

/** Filtra por nombre (sin tildes ni mayúsculas, todas las palabras deben aparecer). Búsqueda vacía = todos; conserva el orden. */
export function filterByName<T extends { name: string }>(rows: T[], query: string): T[] {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((r) => { const n = foldText(r.name); return words.every((w) => n.includes(w)); });
}

/** Evaluados primero por puesto ascendente (estable: a igual puesto, el orden de entrada); sin puesto (null) al final, en su orden. */
export function orderByRank<T extends { rank: number | null }>(rows: T[]): T[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const ra = a.r.rank, rb = b.r.rank;
      if (ra === null && rb === null) return a.i - b.i;
      if (ra === null) return 1;
      if (rb === null) return -1;
      return ra - rb || a.i - b.i;
    })
    .map((x) => x.r);
}

export type LabelMode = 'name' | 'namePct';

/** Texto de la etiqueta. Un punto sin evaluar lleva solo el nombre: nunca «0 %». */
export function labelText(r: { name: string; pct: number | null }, mode: LabelMode): string {
  const name = r.name.trim() || '(sin nombre)';
  return mode === 'namePct' && r.pct !== null ? `${name} · ${r.pct} %` : name;
}

export const LABEL_H = 20;
export const LABEL_MAX_W = 170;
export const MAX_LABELS = 40;

/** Ancho aproximado en px (11 px, peso 600) de una etiqueta con su relleno; nunca más que `LABEL_MAX_W`. */
export function estimateLabelWidth(text: string): number {
  return Math.min(LABEL_MAX_W, Math.ceil(text.length * 6.4) + 14);
}

/** Prioridad (menor = se muestra antes): el seleccionado primero, luego por puesto y los sin puesto al final. */
export function labelPriority(rank: number | null, selected: boolean, index: number): number {
  if (selected) return -1;
  return rank === null ? 1_000_000 + index : rank * 1000 + (index % 1000);
}

export type LabelItem = { id: string; x: number; y: number; w: number; h: number; priority: number };

/**
 * Descarte voraz por cajas en píxeles: recorre por prioridad y conserva una etiqueta solo si cabe en el mapa visible, no
 * pisa una ya conservada y no se supera `max`. La caja va a la derecha del marcador (`offsetX`) centrada en vertical.
 * `hidden` = etiquetas con marcador a la vista que se descartaron (para el aviso «Acerca el mapa…»).
 */
export function layoutLabels(
  items: LabelItem[],
  opts: { width: number; height: number; max?: number; gap?: number; offsetX?: number },
): { visible: string[]; hidden: number } {
  const { width, height, max = MAX_LABELS, gap = 2, offsetX = 9 } = opts;
  const inView = items.filter((it) => it.x >= 0 && it.y >= 0 && it.x <= width && it.y <= height);
  const order = inView.map((it, i) => ({ it, i })).sort((a, b) => a.it.priority - b.it.priority || a.i - b.i);
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const visible: string[] = [];
  for (const { it } of order) {
    if (visible.length >= max) break;
    const x0 = it.x + offsetX, y0 = it.y - it.h / 2, x1 = x0 + it.w, y1 = y0 + it.h;
    // Una etiqueta que se sale del mapa por la derecha no se lee entera: se descarta (el marcador sigue ahí).
    if (x1 > width || y0 < 0 || y1 > height) continue;
    if (placed.some((b) => x0 < b.x1 + gap && x1 + gap > b.x0 && y0 < b.y1 + gap && y1 + gap > b.y0)) continue;
    placed.push({ x0, y0, x1, y1 });
    visible.push(it.id);
  }
  return { visible, hidden: inView.length - visible.length };
}
