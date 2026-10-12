/** Capas de «Referencia» en la vista pública (G7 / R4): vías, resguardos, ríos… que el dueño decide mostrar, capa por capa.
 *
 * Lo que viaja en `meta.refs` es SOLO geometría simplificada y el nombre de la capa (nunca atributos ni capas de entrada),
 * con tope de capas, de vértices y de bytes: el meta lo recibe cualquiera con el enlace. Campos aditivos y opcionales
 * (`showRefs`, `refs`): no suben `v` del meta y una publicación anterior no los trae. Puro: sin React ni E/S. */
import type { FC, Feature } from './vector.ts';

export type RefLimits = { maxLayers: number; maxVerticesLayer: number; maxVerticesTotal: number; maxBytes: number; decimals: number; nameLen: number };
export const REF_LIMITS: RefLimits = {
  /** Capas de referencia publicables a la vez. */
  maxLayers: 6,
  /** Vértices por capa (tras simplificar) y en total. */
  maxVerticesLayer: 4000,
  maxVerticesTotal: 12000,
  /** Tamaño del JSON de todas las referencias (bytes). */
  maxBytes: 350_000,
  /** Decimales de lon/lat (5 ≈ 1 m). */
  decimals: 5,
  nameLen: 80,
};

export type PublishedRef = {
  name: string;
  /** Contorno. */
  color: string;
  /** Relleno plano (por defecto, el mismo color) y su opacidad (por defecto 0: solo contorno). */
  fill?: string;
  fillOp?: number;
  weight: number;
  /** Solo geometría: `properties` siempre `{}`; como mucho un MultiPolygon y un MultiLineString. */
  fc: FC;
};

/** Una capa de referencia del dueño, ya con el estilo efectivo (G3). */
export type RefInput = { id: string; name: string; fc: FC; color: string; fill?: string; fillOp?: number; weight: number };

export type RefReport = {
  id: string; name: string;
  verticesIn: number; verticesOut: number;
  /** Tolerancia de simplificación aplicada, en metros aproximados (0 = solo redondeo a 1 m). */
  tolM: number;
  /** Elementos que no se publicaron (por tamaño, por colapsar al simplificar o por no ser polígono/línea). */
  droppedFeatures: number;
  /** true = se perdió detalle más allá del redondeo (simplificación o recorte). */
  trimmed: boolean;
};

export type RefBuild = {
  refs: PublishedRef[];
  report: RefReport[];
  /** Tamaño del JSON de `refs`. */
  bytes: number;
  /** Capas elegidas que no cupieron por el tope de capas. */
  skipped: string[];
};

type Pos = [number, number];
type Ring = Pos[];

const M_PER_DEG = 111_320;
const HEX6 = /^#[0-9a-fA-F]{6}$/;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rnd = (v: number) => { const k = 10 ** REF_LIMITS.decimals; return Math.round(v * k) / k; };

/** Limpia una lista de posiciones: finitas, en rango lon/lat, a N decimales y sin repetidas consecutivas. */
function cleanPts(raw: unknown): Pos[] {
  const out: Pos[] = [];
  if (!Array.isArray(raw)) return out;
  for (const p of raw) {
    if (!Array.isArray(p)) continue;
    const x = p[0], y = p[1];
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90) continue;
    const q: Pos = [rnd(x), rnd(y)];
    const last = out[out.length - 1];
    if (last && last[0] === q[0] && last[1] === q[1]) continue;
    out.push(q);
  }
  return out;
}

type Part = { kind: 'poly'; rings: Ring[] } | { kind: 'line'; pts: Pos[] };

function collect(g: { type?: string; coordinates?: unknown; geometries?: unknown[] } | null | undefined, out: Part[], depth = 0): void {
  if (!g || depth > 3) return;
  const c = g.coordinates;
  const polyOf = (rings: unknown): Part | null => {
    if (!Array.isArray(rings)) return null;
    const rs = rings.map(cleanPts).filter((r) => r.length >= 3);
    return rs.length ? { kind: 'poly', rings: rs } : null;
  };
  if (g.type === 'Polygon') { const p = polyOf(c); if (p) out.push(p); }
  else if (g.type === 'MultiPolygon' && Array.isArray(c)) { for (const x of c) { const p = polyOf(x); if (p) out.push(p); } }
  else if (g.type === 'LineString') { const l = cleanPts(c); if (l.length >= 2) out.push({ kind: 'line', pts: l }); }
  else if (g.type === 'MultiLineString' && Array.isArray(c)) { for (const x of c) { const l = cleanPts(x); if (l.length >= 2) out.push({ kind: 'line', pts: l }); } }
  else if (g.type === 'GeometryCollection' && Array.isArray(g.geometries)) for (const x of g.geometries) collect(x as never, out, depth + 1);
  // Point / MultiPoint: no se publican (sin ellos un punto de referencia revelaría ubicaciones sueltas).
}

const partVerts = (p: Part) => (p.kind === 'poly' ? p.rings.reduce((a, r) => a + r.length, 0) : p.pts.length);

/** Distancia (en grados) de `p` al segmento a–b. */
function segDist(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  let t = L === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L;
  t = clamp(t, 0, 1);
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas–Peucker (iterativo) sobre una línea; conserva siempre los extremos. */
export function simplifyLine<T extends number[]>(pts: T[], tol: number): T[] {
  if (tol <= 0 || pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1; keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let dmax = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segDist(pts[i], pts[s], pts[e]);
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (idx > 0 && dmax > tol) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return pts.filter((_, i) => keep[i] === 1);
}

function simplifyPart(p: Part, tol: number): Part | null {
  if (p.kind === 'line') {
    const l = simplifyLine(p.pts, tol);
    return l.length >= 2 && !(l.length === 2 && l[0][0] === l[1][0] && l[0][1] === l[1][1]) ? { kind: 'line', pts: l } : null;
  }
  const rings: Ring[] = [];
  for (let i = 0; i < p.rings.length; i++) {
    let s = simplifyLine(p.rings[i], tol);
    if (s.length >= 3) {
      const f = s[0], l = s[s.length - 1];
      if (f[0] !== l[0] || f[1] !== l[1]) s = [...s, [f[0], f[1]]];
    }
    if (s.length >= 4) rings.push(s);
    else if (i === 0) return null; // el exterior colapsó: el polígono completo se pierde
  }
  return { kind: 'poly', rings };
}

/** Tamaño aproximado (grados) de una parte: para decidir cuáles recortar primero cuando no cabe. */
function extent(p: Part): number {
  const pts = p.kind === 'poly' ? p.rings[0] : p.pts;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return Math.hypot(x1 - x0, y1 - y0);
}

function toFC(parts: Part[]): FC {
  const polys = parts.filter((p): p is Extract<Part, { kind: 'poly' }> => p.kind === 'poly');
  const lines = parts.filter((p): p is Extract<Part, { kind: 'line' }> => p.kind === 'line');
  const features: Feature[] = [];
  if (polys.length) features.push({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polys.map((p) => p.rings) } });
  if (lines.length) features.push({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lines.map((l) => l.pts) } });
  return { type: 'FeatureCollection', features };
}

/** Simplifica UNA capa para publicarla: solo geometría, tolerancia creciente hasta caber en `budget` vértices y, si aun
 * así no cabe, quita los elementos más pequeños. */
export function simplifyForPublic(fc: FC, budget: number): { fc: FC; verticesIn: number; verticesOut: number; tolM: number; droppedFeatures: number } {
  const parts: Part[] = [];
  let unusable = 0;
  for (const f of fc.features ?? []) {
    const before = parts.length;
    collect(f?.geometry as never, parts);
    if (parts.length === before) unusable++;
  }
  const verticesIn = parts.reduce((a, p) => a + partVerts(p), 0);
  const total = (ps: Part[]) => ps.reduce((a, p) => a + partVerts(p), 0);
  let cur = parts;
  let tol = 0;
  if (verticesIn > budget) {
    tol = 1 / M_PER_DEG; // ≈ 1 m
    for (let it = 0; it < 24; it++) {
      cur = parts.map((p) => simplifyPart(p, tol)).filter((p): p is Part => !!p);
      if (total(cur) <= budget) break;
      tol *= 1.6;
    }
  }
  let dropped = unusable + (parts.length - cur.length);
  if (total(cur) > budget) {
    // Aun con la tolerancia máxima: se conservan los elementos más grandes hasta llenar el cupo.
    const sorted = [...cur].sort((a, b) => extent(b) - extent(a));
    const kept: Part[] = [];
    let n = 0;
    for (const p of sorted) { const v = partVerts(p); if (n + v <= budget) { kept.push(p); n += v; } }
    dropped += cur.length - kept.length;
    cur = kept;
  }
  return { fc: toFC(cur), verticesIn, verticesOut: total(cur), tolM: Math.round(tol * M_PER_DEG * 10) / 10, droppedFeatures: dropped };
}

const byteLen = (v: unknown) => JSON.stringify(v).length;

/** Arma lo que viaja en el meta a partir de las capas elegidas (en el orden dado). Respeta los topes de capas, vértices
 * y bytes; `report` dice, capa por capa, cuánto se simplificó o recortó para poder avisarlo antes de publicar. */
export function buildPublishedRefs(inputs: RefInput[], limits: RefLimits = REF_LIMITS): RefBuild {
  const use = inputs.slice(0, limits.maxLayers);
  const skipped = inputs.slice(limits.maxLayers).map((i) => i.name);
  if (!use.length) return { refs: [], report: [], bytes: 0, skipped };
  let scale = 1;
  let best: RefBuild | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const budget = Math.max(50, Math.floor(Math.min(limits.maxVerticesLayer, limits.maxVerticesTotal / use.length) * scale));
    const refs: PublishedRef[] = [];
    const report: RefReport[] = [];
    for (const r of use) {
      const s = simplifyForPublic(r.fc, budget);
      refs.push({
        name: r.name.slice(0, limits.nameLen), color: r.color, weight: r.weight,
        ...(r.fill && r.fill !== r.color ? { fill: r.fill } : {}), ...(r.fillOp ? { fillOp: r.fillOp } : {}), fc: s.fc,
      });
      report.push({
        id: r.id, name: r.name, verticesIn: s.verticesIn, verticesOut: s.verticesOut, tolM: s.tolM, droppedFeatures: s.droppedFeatures,
        trimmed: s.tolM > 0 || s.droppedFeatures > 0,
      });
    }
    best = { refs, report, bytes: byteLen(refs), skipped };
    if (best.bytes <= limits.maxBytes) break;
    scale *= 0.65;
  }
  return best!;
}

/** Texto de aviso por capa cuando se perdió detalle (vacío si solo se redondeó). */
export function refTrimNote(r: RefReport): string {
  if (!r.trimmed) return '';
  const parts: string[] = [];
  if (r.tolM > 0) parts.push(`simplificada (${r.verticesIn.toLocaleString('es-CO')} → ${r.verticesOut.toLocaleString('es-CO')} vértices, tolerancia ≈ ${r.tolM} m)`);
  if (r.droppedFeatures > 0) parts.push(`${r.droppedFeatures} elemento(s) sin publicar (muy pequeños, sin geometría válida o por el tope de tamaño)`);
  return `«${r.name}»: ${parts.join('; ')}.`;
}

/** Ids elegidos que de verdad existen (una capa borrada no deja basura), sin repetir y en el orden de la lista de capas. */
export function activeRefIds(selected: string[] | undefined, existing: string[]): string[] {
  const want = new Set(selected ?? []);
  return existing.filter((id) => want.has(id));
}

/** Cambia la selección de una capa (inmutable). Con la lista vacía devuelve `undefined` (el campo se elimina). */
export function toggleRef(selected: string[] | undefined, id: string, on: boolean): string[] | undefined {
  const set = new Set(selected ?? []);
  if (on) set.add(id); else set.delete(id);
  return set.size ? [...set].sort() : undefined;
}

type WithRefs = { publicRefs?: string[] };
/** Al borrar una capa: sale de la selección pública. */
export function refsAfterDrop<T extends WithRefs>(g: T, key: string): T {
  if (!g.publicRefs?.includes(key)) return g;
  const out = { ...g };
  const rest = g.publicRefs.filter((k) => k !== key);
  if (rest.length) out.publicRefs = rest; else delete out.publicRefs;
  return out;
}
/** Al reemplazar una capa (mismo archivo): la selección sigue a la capa nueva. */
export function refsAfterReplace<T extends WithRefs>(g: T, oldKey: string, newKey: string): T {
  if (!g.publicRefs?.includes(oldKey)) return g;
  return { ...g, publicRefs: g.publicRefs.map((k) => (k === oldKey ? newKey : k)) };
}

/** Especificación para la firma de publicación: qué capas, con qué estilo y qué versión del archivo. Null = no se publican
 * (la firma es la de siempre). Cambiar nombre, color, grosor o archivo marca «sin publicar». */
export function refsSpec(inputs: (Omit<RefInput, 'fc'> & { path?: string; bytes?: number })[]): unknown {
  if (!inputs.length) return null;
  return inputs.map((r) => [r.id, r.name, r.path ?? '', r.bytes ?? 0, r.color, r.fill ?? '', r.fillOp ?? 0, r.weight]).sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1));
}

/** Lo que la vista pública debe dibujar: solo con `showRefs` y capas válidas (publicaciones anteriores → null). NUNCA se asume
 * válido lo que llega de la base: se sanean tipos, rangos, colores y se vuelve a topar el número de vértices. */
export function publishedRefs(meta: { showRefs?: boolean; refs?: unknown }): PublishedRef[] | null {
  if (meta.showRefs !== true || !Array.isArray(meta.refs)) return null;
  const out: PublishedRef[] = [];
  let verts = 0;
  for (const r of meta.refs.slice(0, REF_LIMITS.maxLayers) as Partial<PublishedRef>[]) {
    if (!r || typeof r !== 'object' || typeof r.name !== 'string' || !r.fc || r.fc.type !== 'FeatureCollection' || !Array.isArray(r.fc.features)) continue;
    const parts: Part[] = [];
    for (const f of r.fc.features) collect((f as Feature | null)?.geometry as never, parts);
    const budget = Math.max(0, Math.min(REF_LIMITS.maxVerticesLayer, REF_LIMITS.maxVerticesTotal - verts));
    const kept: Part[] = [];
    let n = 0;
    for (const p of parts) { const v = partVerts(p); if (n + v <= budget) { kept.push(p); n += v; } }
    if (!kept.length) continue;
    verts += n;
    out.push({
      name: r.name.replace(/\s+/g, ' ').trim().slice(0, REF_LIMITS.nameLen) || 'Referencia',
      color: typeof r.color === 'string' && HEX6.test(r.color) ? r.color : '#22D3EE',
      weight: typeof r.weight === 'number' && Number.isFinite(r.weight) ? clamp(r.weight, 0.5, 8) : 2,
      ...(typeof r.fill === 'string' && HEX6.test(r.fill) ? { fill: r.fill } : {}),
      ...(typeof r.fillOp === 'number' && Number.isFinite(r.fillOp) && r.fillOp > 0 ? { fillOp: clamp(r.fillOp, 0, 1) } : {}),
      fc: toFC(kept),
    });
  }
  return out.length ? out : null;
}
