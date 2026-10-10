/** Modelo de clases del mapa: dirección del índice (aptitud / riesgo) y N clases (2–8) con nombre, color y rango.
 * Puro. Los cortes son contiguos (N−1 valores 0–1 ascendentes): editar uno mueve la frontera entre dos vecinas.
 *
 * Guardado en `GeoConfig`: `direction?` (ausente = 'suitability') y `classModel?` (`breaks`, `classes`, `cut`).
 * Un proyecto antiguo solo tiene `classes: {alta, media}`: se lee como 3 clases con cortes [media, alta] y los
 * nombres/colores por defecto, sin migrar nada. */
import { CLASS_EXCLUDED, CLASS_VETO, MAX_CLASSES, MIN_CLASSES, type Direction } from './suitability.ts';

export type { Direction };
export type CutMode = 'manual' | 'quantile' | 'jenks';

/** Lo que se guarda por clase: nombre y color (hex `#RRGGBB`) opcionales; sin valor se usa el de por defecto. */
export type ClassDef = { name?: string; color?: string };

/** Configuración editable (lo que viaja en `GeoConfig`). */
export type ClassSetup = { direction: Direction; breaks: number[]; classes: ClassDef[]; cut: CutMode };

/** Configuración ya resuelta: nombres completos y colores a nivel de clase (undefined = de la paleta). */
export type ClassModel = {
  direction: Direction; n: number; breaks: number[]; names: string[]; colors: (string | undefined)[]; cut: CutMode;
};

/** Lo mínimo de `GeoConfig` que necesita este módulo (para no depender de `types.ts`). */
export type GeoClassFields = {
  direction?: Direction;
  classes?: { alta: number; media: number };
  classModel?: { breaks: number[]; classes?: ClassDef[]; cut?: CutMode };
};

/** Textos que dependen de la dirección. */
export type DirText = {
  /** «idoneidad» / «riesgo» (minúscula, para frases). */
  noun: string;
  mapTitle: string;
  indexName: string;
  legendTitle: string;
  partial: string;
  lowEnd: string;
  highEnd: string;
  /** Rótulo de las celdas vetadas. */
  critical: string;
  /** Rótulo corto de la fila que agrupa clase extrema + vetadas en los resúmenes. */
  disclaimer: string;
  /** Sufijo de archivo (`<base>_<fileIdx>.tif`) y cabecera de columna del CSV. */
  fileIdx: string;
  csvIdx: string;
  /** Qué significa un valor bajo/alto (para ayudas). */
  meaning: string;
};

export const DIR_TEXT: Record<Direction, DirText> = {
  suitability: {
    noun: 'idoneidad', mapTitle: 'Mapa de aptitud', indexName: 'Índice de idoneidad', legendTitle: 'Idoneidad AHP + SIG', partial: 'Idoneidad parcial',
    lowEnd: '0 · no apta', highEnd: '100 · óptima', critical: 'Vetada', disclaimer: 'Índice de idoneidad 0–100, no una probabilidad.',
    fileIdx: 'idoneidad', csvIdx: 'idoneidad_0_100', meaning: 'un valor alto es más apto (mejor)',
  },
  risk: {
    noun: 'riesgo', mapTitle: 'Mapa de riesgo', indexName: 'Índice de riesgo', legendTitle: 'Riesgo AHP + SIG', partial: 'Riesgo parcial',
    lowEnd: '0 · riesgo bajo', highEnd: '100 · riesgo máximo', critical: 'Condición crítica', disclaimer: 'Índice de riesgo 0–100, no una probabilidad.',
    fileIdx: 'riesgo', csvIdx: 'riesgo_0_100', meaning: 'un valor alto es más riesgo (peor)',
  },
};

const NAMES: Record<Direction, Record<number, string[]>> = {
  suitability: {
    2: ['No apta', 'Apta'],
    3: ['No apta', 'Moderada', 'Alta aptitud'],
    4: ['No apta', 'Marginal', 'Moderada', 'Alta aptitud'],
    5: ['No apta', 'Marginal', 'Moderada', 'Alta aptitud', 'Muy alta aptitud'],
  },
  risk: {
    2: ['Riesgo bajo', 'Riesgo alto'],
    3: ['Riesgo bajo', 'Riesgo moderado', 'Riesgo alto'],
    4: ['Riesgo bajo', 'Riesgo moderado', 'Riesgo alto', 'Riesgo muy alto'],
    5: ['Riesgo muy bajo', 'Riesgo bajo', 'Riesgo moderado', 'Riesgo alto', 'Riesgo muy alto'],
  },
};

/** Nombre por defecto de la clase `i` (0-based, ascendente por índice) entre `n`. */
export function defaultClassName(direction: Direction, i: number, n: number): string {
  const list = NAMES[direction][n];
  if (list) return list[i];
  return `Clase ${i + 1} de ${n}`;
}

/** Cortes por defecto para `n` clases: 3 → 45 / 70 (el estándar del curso), el resto reparte el 0–100 en partes iguales. */
export function defaultBreaks(n: number): number[] {
  if (n === 3) return [0.45, 0.70];
  return Array.from({ length: n - 1 }, (_, i) => (i + 1) / n);
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Cortes válidos: 1–7, en [0,1] y no decrecientes. */
export function normalizeBreaks(breaks: number[]): number[] {
  const src = breaks.slice(0, MAX_CLASSES - 1).map(clamp01);
  const out: number[] = [];
  for (const b of src) out.push(out.length ? Math.max(b, out[out.length - 1]) : b);
  return out.length ? out : [0.5];
}

export function setupFromGeo(geo: GeoClassFields): ClassSetup {
  const direction: Direction = geo.direction === 'risk' ? 'risk' : 'suitability';
  const cm = geo.classModel;
  if (cm && Array.isArray(cm.breaks) && cm.breaks.length >= MIN_CLASSES - 1) {
    const breaks = normalizeBreaks(cm.breaks);
    const classes: ClassDef[] = Array.from({ length: breaks.length + 1 }, (_, i) => {
      const c = cm.classes?.[i];
      return { ...(c?.name?.trim() ? { name: c.name.trim() } : {}), ...(c?.color && HEX.test(c.color) ? { color: c.color } : {}) };
    });
    return { direction, breaks, classes, cut: cm.cut ?? 'manual' };
  }
  const c = geo.classes ?? { alta: 0.70, media: 0.45 };
  return { direction, breaks: [clamp01(c.media), clamp01(c.alta)], classes: [{}, {}, {}], cut: 'manual' };
}

export function resolveModel(setup: ClassSetup): ClassModel {
  const n = setup.breaks.length + 1;
  return {
    direction: setup.direction, n, breaks: setup.breaks.slice(),
    names: Array.from({ length: n }, (_, i) => setup.classes[i]?.name || defaultClassName(setup.direction, i, n)),
    colors: Array.from({ length: n }, (_, i) => setup.classes[i]?.color || undefined),
    cut: setup.cut,
  };
}

export const resolveClassModel = (geo: GeoClassFields): ClassModel => resolveModel(setupFromGeo(geo));

/** Es exactamente lo que representaba un proyecto antiguo: aptitud, 3 clases, sin nombres ni colores propios.
 * Sirve para que las firmas de publicación (`resultSig`, `sigParts`) no cambien en proyectos sin tocar. */
export function isLegacyEquivalent(setup: ClassSetup): boolean {
  return setup.direction === 'suitability' && setup.breaks.length === 2 && setup.cut === 'manual'
    && setup.classes.every((c) => !c.name && !c.color);
}

/** Valor que entra a las firmas: el objeto `{alta, media}` de siempre si es equivalente al modelo antiguo. */
export function classSigValue(setup: ClassSetup): unknown {
  if (isLegacyEquivalent(setup)) return { alta: setup.breaks[1], media: setup.breaks[0] };
  return { dir: setup.direction, breaks: setup.breaks.map((b) => Math.round(b * 1e4)), names: setup.classes.map((c) => c.name ?? null), colors: setup.classes.map((c) => c.color ?? null) };
}

/** Para `publishParts`: undefined si es equivalente al modelo antiguo (la firma de «umbrales» no cambia). */
export function publishClassSig(setup: ClassSetup): unknown {
  return isLegacyEquivalent(setup) ? undefined : classSigValue(setup);
}

/** Escribe el modelo en el `GeoConfig`: `direction` solo si no es la de por defecto; `classes` {alta, media} se
 * mantiene al día cuando hay 3 clases (lo leen el catálogo y versiones anteriores). */
export function applySetup<T extends GeoClassFields>(geo: T, setup: ClassSetup): T & GeoClassFields {
  const out: T & GeoClassFields = { ...geo, classModel: { breaks: setup.breaks.slice(), classes: setup.classes.map((c) => ({ ...c })), cut: setup.cut } };
  if (setup.direction === 'risk') out.direction = 'risk'; else delete out.direction;
  if (setup.breaks.length === 2) out.classes = { alta: setup.breaks[1], media: setup.breaks[0] };
  return out;
}

// ---------------------------------------------------------------- edición

/** Mueve el corte `i` a `v` (0–1) sin pasar a sus vecinos: la frontera entre las dos clases se desplaza. */
export function setBreak(breaks: number[], i: number, v: number): number[] {
  const lo = i > 0 ? breaks[i - 1] : 0, hi = i < breaks.length - 1 ? breaks[i + 1] : 1;
  const out = breaks.slice();
  out[i] = Math.max(lo, Math.min(hi, clamp01(v)));
  return out;
}

/** Agrega una clase partiendo por la mitad el tramo más ancho. Devuelve el mismo setup si ya hay 8. */
export function addClass(s: ClassSetup): ClassSetup {
  if (s.breaks.length + 1 >= MAX_CLASSES) return s;
  const edges = [0, ...s.breaks, 1];
  let k = 0;
  for (let i = 1; i < edges.length - 1; i++) if (edges[i + 1] - edges[i] > edges[k + 1] - edges[k]) k = i;
  const mid = Math.round(((edges[k] + edges[k + 1]) / 2) * 100) / 100;
  const breaks = [...s.breaks.slice(0, k), mid, ...s.breaks.slice(k)];
  // La clase nueva es la parte de arriba del tramo partido: la de abajo conserva su nombre y color; la nueva usa los del defecto.
  const classes = [...s.classes.slice(0, k + 1), {}, ...s.classes.slice(k + 1)];
  return { ...s, breaks, classes, cut: 'manual' };
}

/** Quita la clase `i`: su rango pasa a la vecina de arriba (o de abajo si era la última). Mínimo 2 clases. */
export function removeClass(s: ClassSetup, i: number): ClassSetup {
  if (s.breaks.length + 1 <= MIN_CLASSES || i < 0 || i > s.breaks.length) return s;
  const breaks = s.breaks.slice();
  breaks.splice(i < breaks.length ? i : breaks.length - 1, 1);
  const classes = s.classes.slice();
  classes.splice(i, 1);
  return { ...s, breaks, classes, cut: 'manual' };
}

export function setClassDef(s: ClassSetup, i: number, patch: ClassDef): ClassSetup {
  const classes = s.classes.slice();
  const merged: ClassDef = { ...classes[i], ...patch };
  if (!merged.name) delete merged.name;
  if (!merged.color) delete merged.color;
  classes[i] = merged;
  return { ...s, classes };
}

/** Restablece nombres y colores de todas las clases a los de la dirección. */
export function resetClassDefs(s: ClassSetup): ClassSetup {
  return { ...s, classes: s.classes.map(() => ({})) };
}

/** Rango [desde, hasta) de la clase `i` (0–1); la última llega a 1 inclusive. */
export function classRange(breaks: number[], i: number): [number, number] {
  return [i === 0 ? 0 : breaks[i - 1], i >= breaks.length ? 1 : breaks[i]];
}

/** Rótulo de un código del plano `cls`: exclusión, vetada/condición crítica o el nombre de la clase. */
export function classLabel(model: ClassModel, code: number): string {
  if (code === CLASS_EXCLUDED) return 'Exclusión';
  if (code === CLASS_VETO) return DIR_TEXT[model.direction].critical;
  return model.names[code - 1] ?? `Clase ${code}`;
}

/** Cambia la dirección conservando los cortes (el usuario decide si los quiere distintos). */
export function setDirection(s: ClassSetup, direction: Direction): ClassSetup {
  return { ...s, direction };
}
