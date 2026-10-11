/** Colorea grillas a RGBA (Uint32 little-endian 0xAABBGGRR, listo para `ImageData`). Puro. */
import { defaultBreaks } from './classes.ts';
import { suitability, type FnSpec } from './membership.ts';
import { CLASS_ALTA, CLASS_EXCLUDED, CLASS_MODERADA, CLASS_NO_APTA, CLASS_VETO, MASK_EXCLUDED, MASK_NODATA, type Direction } from './suitability.ts';

export const rgba = (r: number, g: number, b: number, a = 255) => (((a << 24) | (b << 16) | (g << 8) | r) >>> 0);

type Rgb = [number, number, number];
type Stops = [number, Rgb][];

const hexOf = ([r, g, b]: Rgb) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

/** Paletas del resultado. «semaforo» es la convención del curso (UPRA, notebook 07): rojo → ámbar → verde.
 * «daltonismo» es una rampa viridis (violeta → verde azulado → amarillo): monótona en luminosidad y distinguible
 * con protanopía, deuteranopía y tritanopía, así que el orden bajo → alto se lee sin depender del tono rojo/verde.
 * En ambas la leyenda y las clases llevan texto: el color nunca es la única señal. */
export type PaletteKey = 'semaforo' | 'daltonismo';
export type Palette = { label: string; stops: Stops; cls: Record<number, Rgb>; diffNeg: Rgb; diffPos: Rgb };

const SEMAFORO: Palette = {
  label: 'Semáforo (rojo–verde)',
  stops: [[0, [217, 83, 79]], [0.5, [240, 173, 78]], [1, [46, 125, 50]]],
  cls: { [CLASS_EXCLUDED]: [127, 140, 141], [CLASS_NO_APTA]: [217, 83, 79], [CLASS_MODERADA]: [240, 173, 78], [CLASS_ALTA]: [46, 125, 50], [CLASS_VETO]: [217, 83, 79] },
  diffNeg: [217, 83, 79], diffPos: [46, 125, 50],
};
const DALTONISMO: Palette = {
  label: 'Apta para daltonismo (violeta–amarillo)',
  stops: [[0, [68, 1, 84]], [0.5, [33, 145, 140]], [1, [253, 231, 37]]],
  // La exclusión es un gris claro: ni el violeta oscuro ni el verde azulado (luminosidad media) ni el amarillo la igualan.
  cls: { [CLASS_EXCLUDED]: [176, 176, 176], [CLASS_NO_APTA]: [68, 1, 84], [CLASS_MODERADA]: [33, 145, 140], [CLASS_ALTA]: [253, 231, 37], [CLASS_VETO]: [68, 1, 84] },
  // Naranja / azul de Okabe-Ito: el par clásico seguro para daltonismo.
  diffNeg: [213, 94, 0], diffPos: [0, 114, 178],
};
export const PALETTES: Record<PaletteKey, Palette> = { semaforo: SEMAFORO, daltonismo: DALTONISMO };
export const PALETTE_KEYS = Object.keys(PALETTES) as PaletteKey[];

export const CLASS_RGB: Record<number, Rgb> = SEMAFORO.cls;
export const CLASS_HEX: Record<number, string> = Object.fromEntries(Object.entries(SEMAFORO.cls).map(([k, v]) => [k, hexOf(v)]));
export const classHex = (pal: PaletteKey = 'semaforo'): Record<number, string> => Object.fromEntries(Object.entries(PALETTES[pal].cls).map(([k, v]) => [k, hexOf(v)]));
export const CLASS_LABEL: Record<number, string> = {
  [CLASS_EXCLUDED]: 'Exclusión', [CLASS_NO_APTA]: 'No apta', [CLASS_MODERADA]: 'Moderada', [CLASS_ALTA]: 'Alta aptitud', [CLASS_VETO]: 'Vetada',
};

const SEQ: Stops = [[0, [33, 102, 172]], [0.5, [146, 197, 222]], [1, [253, 219, 128]]];

/** Rampas que el usuario puede elegir para UNA capa de entrada (editor de estilo, G3). `auto` = la de siempre (la de la
 * paleta del resultado en criterios con regla; azul→amarillo en capas crudas). El resto son rampas monótonas en
 * luminosidad, legibles en escala de grises y con daltonismo. */
export type LayerRampKey = 'auto' | 'viridis' | 'azules' | 'grises' | 'calida';
export const LAYER_RAMPS: Record<Exclude<LayerRampKey, 'auto'>, { label: string; stops: Stops }> = {
  viridis: { label: 'Violeta–amarillo', stops: [[0, [68, 1, 84]], [0.5, [33, 145, 140]], [1, [253, 231, 37]]] },
  azules: { label: 'Azules', stops: [[0, [239, 243, 255]], [0.5, [107, 174, 214]], [1, [8, 48, 107]]] },
  grises: { label: 'Grises', stops: [[0, [245, 245, 245]], [0.5, [150, 150, 150]], [1, [37, 37, 37]]] },
  calida: { label: 'Cálida (amarillo–rojo)', stops: [[0, [255, 255, 178]], [0.5, [253, 141, 60]], [1, [128, 0, 38]]] },
};
export const LAYER_RAMP_KEYS = ['auto', 'viridis', 'azules', 'grises', 'calida'] as const;
/** Paradas de la rampa elegida (`rev` = invertida); null = `auto` (se usa la de siempre). */
export function layerRampStops(key: LayerRampKey | undefined, rev = false): Stops | null {
  if (!key || key === 'auto') return null;
  const st = LAYER_RAMPS[key]?.stops;
  if (!st) return null;
  return rev ? [...st].reverse().map(([t, c]) => [1 - t, c] as [number, Rgb]) : st;
}
export const stopsCss = (st: Stops): string => `linear-gradient(90deg, ${st.map(([t, c]) => `rgb(${c[0]},${c[1]},${c[2]}) ${(t * 100).toFixed(0)}%`).join(',')})`;

function ramp(stops: Stops, t: number): Rgb {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
    if (x >= t0 && x <= t1) {
      const f = (x - t0) / (t1 - t0);
      return [Math.round(c0[0] + (c1[0] - c0[0]) * f), Math.round(c0[1] + (c1[1] - c0[1]) * f), Math.round(c0[2] + (c1[2] - c0[2]) * f)];
    }
  }
  return stops[stops.length - 1][1];
}

/** Rampa continua de idoneidad (por defecto roja→amarilla→verde, como el notebook 07). t en [0,1]. */
export const rampColor = (t: number, pal: PaletteKey = 'semaforo', dir: Direction = 'suitability') => ramp(PALETTES[pal].stops, dir === 'risk' ? 1 - t : t);
/** Rampa secuencial azul→amarillo para valores crudos (temperatura, distancia, profundidad…). */
export const seqColor = (t: number) => ramp(SEQ, t);
/** `linear-gradient` CSS de la rampa de idoneidad, para leyendas y muestras. */
export const rampCss = (pal: PaletteKey = 'semaforo', dir: Direction = 'suitability') => {
  const stops = dir === 'risk' ? [...PALETTES[pal].stops].reverse() : PALETTES[pal].stops;
  return `linear-gradient(90deg, ${stops.map(([, c]) => `rgb(${c[0]},${c[1]},${c[2]})`).join(',')})`;
};

/** Lo que `paintResult` necesita del modelo de clases (lo cumple `ClassModel`). */
export type ClassPaint = { n: number; direction: Direction; colors?: (string | undefined)[]; breaks?: number[] };
const DEFAULT_PAINT: ClassPaint = { n: 3, direction: 'suitability' };

const HEX6 = /^#[0-9a-fA-F]{6}$/;
export const hexToRgb = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export { hexOf as rgbToHex };

/** Color de cada código del plano de clase: 1..N en la rampa de la paleta (de índice bajo a alto; invertida en riesgo,
 * donde lo alto es lo malo) salvo que el usuario fije un color; 0 = exclusión; `CLASS_VETO` = el de la clase extrema
 * de la dirección (aptitud: la más baja; riesgo: la más alta). Con 3 clases en aptitud da exactamente `PALETTES[pal].cls`. */
export function classRgb(m: ClassPaint = DEFAULT_PAINT, pal: PaletteKey = 'semaforo'): Record<number, Rgb> {
  const out: Record<number, Rgb> = { [CLASS_EXCLUDED]: PALETTES[pal].cls[CLASS_EXCLUDED] };
  for (let i = 0; i < m.n; i++) {
    const own = m.colors?.[i];
    out[i + 1] = own && HEX6.test(own) ? hexToRgb(own) : rampColor(m.n > 1 ? i / (m.n - 1) : 0, pal, m.direction);
  }
  out[CLASS_VETO] = out[m.direction === 'risk' ? m.n : 1];
  return out;
}
export const classHexOf = (m: ClassPaint = DEFAULT_PAINT, pal: PaletteKey = 'semaforo'): Record<number, string> =>
  Object.fromEntries(Object.entries(classRgb(m, pal)).map(([k, v]) => [k, hexOf(v)]));
/** Rampa continua DEL MODELO DE CLASES (la que pinta la vista «Continuo»). Construcción: cada clase aporta su color
 * (el de `classRgb`: paleta, personalizado, dirección) en el PUNTO MEDIO de su rango [corte_{i-1}, corte_i]; entre
 * puntos medios se interpola linealmente en RGB y antes del primero / después del último queda el color de la clase
 * extrema. Así el color de un índice es siempre una mezcla de las clases vecinas, el de cada punto medio coincide con
 * el de su clase y las transiciones se concentran alrededor de los cortes reales. Con 3 clases por defecto
 * (45/70, aptitud) da rojo→ámbar→verde parecido a la rampa fija anterior. Sin `breaks` usa los de por defecto. */
export function classRamp(m: ClassPaint = DEFAULT_PAINT, pal: PaletteKey = 'semaforo'): Stops {
  const br = m.breaks && m.breaks.length === m.n - 1 ? m.breaks : defaultBreaks(m.n);
  const rgb = classRgb(m, pal);
  const edges = [0, ...br, 1];
  const stops: Stops = [[0, rgb[1]]];
  for (let i = 0; i < m.n; i++) {
    const mid = (edges[i] + edges[i + 1]) / 2;
    stops.push([Math.max(mid, stops[stops.length - 1][0]), rgb[i + 1]]);
  }
  stops.push([1, rgb[m.n]]);
  return stops;
}
function sampleStops(stops: Stops, t: number): Rgb {
  const x = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  if (x <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
    if (x <= t1) {
      if (t1 <= t0) return c1;
      const f = (x - t0) / (t1 - t0);
      return [Math.round(c0[0] + (c1[0] - c0[0]) * f), Math.round(c0[1] + (c1[1] - c0[1]) * f), Math.round(c0[2] + (c1[2] - c0[2]) * f)];
    }
  }
  return stops[stops.length - 1][1];
}
/** Color del índice `t` (0–1) en la rampa del modelo de clases. */
export const modelRampColor = (t: number, m: ClassPaint = DEFAULT_PAINT, pal: PaletteKey = 'semaforo'): Rgb => sampleStops(classRamp(m, pal), t);
export const modelRampHex = (t: number, m: ClassPaint = DEFAULT_PAINT, pal: PaletteKey = 'semaforo'): string => hexOf(modelRampColor(t, m, pal));
/** `linear-gradient` CSS de la rampa del modelo (paradas en los puntos medios, en %). */
export const modelRampCss = (m: ClassPaint = DEFAULT_PAINT, pal: PaletteKey = 'semaforo'): string =>
  `linear-gradient(90deg, ${classRamp(m, pal).map(([t, c]) => `rgb(${c[0]},${c[1]},${c[2]}) ${(t * 100).toFixed(1)}%`).join(',')})`;
export const RAW_RAMP_CSS = `linear-gradient(90deg, ${SEQ.map(([, c]) => `rgb(${c[0]},${c[1]},${c[2]})`).join(',')})`;

const CLEAR = 0;
const greyOf = (pal: PaletteKey) => { const [r, g, b] = PALETTES[pal].cls[CLASS_EXCLUDED]; return rgba(r, g, b); };

/** Resultado: continuo (0–100 en rampa) o por clases (las N del modelo; por defecto 3 de aptitud). */
export function paintResult(pct: Uint8Array, cls: Uint8Array, mask: Uint8Array, style: 'continuous' | 'classes', pal: PaletteKey = 'semaforo', model: ClassPaint = DEFAULT_PAINT): Uint32Array {
  const out = new Uint32Array(pct.length);
  const GREY = greyOf(pal);
  const lut = Array.from({ length: 101 }, (_, i) => { const [r, g, b] = modelRampColor(i / 100, model, pal); return rgba(r, g, b); });
  const cl: Record<number, number> = {};
  for (const [k, [r, g, b]] of Object.entries(classRgb(model, pal))) cl[Number(k)] = rgba(r, g, b);
  for (let i = 0; i < out.length; i++) {
    const m = mask[i];
    if (m === MASK_NODATA) out[i] = CLEAR;
    else if (m === MASK_EXCLUDED) out[i] = GREY;
    else if (pct[i] === 255) out[i] = CLEAR;
    else out[i] = style === 'classes' ? (cl[cls[i]] ?? CLEAR) : lut[Math.min(100, pct[i])];
  }
  return out;
}

/** Idoneidad (o riesgo) parcial (0–1) de un criterio con su función, sobre la capa cruda. */
export function paintCriterion(layer: Float32Array, mask: Uint8Array, fn: FnSpec, pal: PaletteKey = 'semaforo', dir: Direction = 'suitability', stops?: Stops | null): Uint32Array {
  const out = new Uint32Array(layer.length);
  const GREY = greyOf(pal);
  for (let i = 0; i < out.length; i++) {
    if (mask[i] === MASK_NODATA) continue;
    if (mask[i] === MASK_EXCLUDED) { out[i] = GREY; continue; }
    const v = layer[i];
    if (Number.isNaN(v)) continue;
    const [r, g, b] = stops ? ramp(stops, suitability(v, fn)) : rampColor(suitability(v, fn), pal, dir);
    out[i] = rgba(r, g, b);
  }
  return out;
}

/** Capa cruda en rampa secuencial entre `min` y `max`. */
export function paintRaw(layer: Float32Array, min: number, max: number, stops?: Stops | null): Uint32Array {
  const out = new Uint32Array(layer.length);
  const span = max > min ? max - min : 1;
  for (let i = 0; i < out.length; i++) {
    const v = layer[i];
    if (Number.isNaN(v)) continue;
    const [r, g, b] = stops ? ramp(stops, (v - min) / span) : seqColor((v - min) / span);
    out[i] = rgba(r, g, b);
  }
  return out;
}

/** Zonas con `mask[i] === code` en un color plano. */
export function paintMask(mask: Uint8Array, code: number, color: [number, number, number]): Uint32Array {
  const out = new Uint32Array(mask.length);
  const c = rgba(color[0], color[1], color[2]);
  for (let i = 0; i < out.length; i++) if (mask[i] === code) out[i] = c;
  return out;
}

/** Celdas con valor > 0 en un color plano (capas de exclusión / área de estudio). */
export function paintFlag(layer: Float32Array, color: [number, number, number]): Uint32Array {
  const out = new Uint32Array(layer.length);
  const c = rgba(color[0], color[1], color[2]);
  for (let i = 0; i < out.length; i++) if (layer[i] > 0) out[i] = c;
  return out;
}

/** Diferencia de idoneidad (actual − escenario guardado): rojo = empeora, verde = mejora, transparente si
 * el cambio es menor a `eps` puntos. Solo celdas evaluables en AMBOS mapas. Intensidad hasta ±`full` puntos. */
export function paintDiff(pct: Uint8Array, base: Uint8Array, mask: Uint8Array, eps = 1, full = 30, pal: PaletteKey = 'semaforo', dir: Direction = 'suitability'): Uint32Array {
  const out = new Uint32Array(pct.length);
  for (let i = 0; i < out.length; i++) {
    if (mask[i] !== 1 || pct[i] === 255 || base[i] === 255) continue;
    const d = pct[i] - base[i];
    if (Math.abs(d) < eps) continue;
    const t = Math.min(1, Math.abs(d) / full);
    // En aptitud empeora = el índice baja; en riesgo empeora = el índice sube.
    const worse = dir === 'risk' ? d > 0 : d < 0;
    const [r, g, b] = worse ? PALETTES[pal].diffNeg : PALETTES[pal].diffPos;
    out[i] = rgba(r, g, b, Math.round(90 + 165 * t));
  }
  return out;
}

/** Sensibilidad de pesos (G15): celdas que cambian de clase, con intensidad según en cuántas de las variaciones elegidas
 * cambian (1..max). Un solo tono (el «púrpura rojizo» de Okabe-Ito, que no choca con la diferencia ni con las clases)
 * y alfa creciente; el número de casos va siempre en la leyenda y la tabla, nunca solo en el color. */
export const SENS_RGB: Rgb = [204, 121, 167];
export function paintChange(count: Uint8Array, max: number, mask: Uint8Array): Uint32Array {
  const out = new Uint32Array(count.length);
  for (let i = 0; i < out.length; i++) {
    if (!count[i] || mask[i] !== 1) continue;
    const t = max > 1 ? (count[i] - 1) / (max - 1) : 1;
    out[i] = rgba(SENS_RGB[0], SENS_RGB[1], SENS_RGB[2], Math.round(150 + 105 * t));
  }
  return out;
}

/** Parcelas (etiquetas > 0) en un color plano. */
export function paintParcels(labels: Uint32Array, color: [number, number, number] = [109, 40, 217]): Uint32Array {
  const out = new Uint32Array(labels.length);
  const c = rgba(color[0], color[1], color[2], 235);
  for (let i = 0; i < out.length; i++) if (labels[i] > 0) out[i] = c;
  return out;
}
