/** Firma de «lo que produjo el mapa publicado», para avisar con precisión QUÉ cambió desde la última
 * publicación. Solo entra lo que altera el resultado (pesos efectivos, reglas, umbrales, capas que lo
 * alimentan o lo recortan, área); nombres, estilo, visibilidad, orden u opacidad no. Puro. */
import type { GeoConfig, GeoGrid } from '../types.ts';

export type SigPart = 'pesos' | 'reglas' | 'umbrales' | 'capas' | 'area' | 'puntos' | 'zonas' | 'referencias';
export type SigParts = Record<SigPart, string>;

export const SIG_PART_LABEL: Record<SigPart, string> = {
  pesos: 'los pesos de los criterios',
  reglas: 'las reglas de idoneidad (funciones o vetos)',
  umbrales: 'las clases del mapa (cortes, nombres, colores o dirección del índice)',
  capas: 'las capas que alimentan o recortan el cálculo',
  area: 'el área de estudio',
  puntos: 'los puntos y su ranking en la vista pública',
  zonas: 'el resumen por zonas en la vista pública',
  referencias: 'las capas de referencia en la vista pública',
};
const ORDER: SigPart[] = ['pesos', 'reglas', 'umbrales', 'capas', 'area', 'puntos', 'zonas', 'referencias'];

export type SigInput = {
  criteria: { id: string }[];
  /** Pesos de la hoja de criterios, en el mismo orden que `criteria`. */
  weights: number[];
  rules: GeoConfig['rules'];
  thresholds: { alta: number; media: number };
  /** Dirección + cortes + nombres + colores de las N clases (`classSigValue` de classes.ts). Ausente = solo
   * `thresholds`: así una publicación anterior de 3 clases en aptitud conserva su firma y no aparece «desactualizada». */
  classSig?: unknown;
  /** Capas disponibles (paquete + propias): rol y rango de valores; `bytes` si se conoce. */
  layers: Record<string, { role: 'criterion' | 'exclusion' | 'area'; min: number; max: number; bytes?: number }>;
  packId?: string;
  grid?: GeoGrid;
  /** Puntos con ranking: solo cuentan si `show` (el interruptor de la vista pública). Con `show` apagado la firma es
   * la misma tengan o no puntos: lo publicado no cambia. Ausente = sin puntos. */
  points?: { show: boolean; list: { name: string; lat: number; lon: number }[] };
  /** Resumen por zonas: solo cuenta si `show`. `spec` = qué se resume (capa, atributo de nombre, población…); los valores
   * dependen de las otras partes. Con `show` apagado la firma es la de siempre. */
  zones?: { show: boolean; spec: unknown };
  /** Capas de referencia publicadas: solo cuentan si `show`. `spec` = qué capas, con qué estilo y qué archivo (`refsSpec`). */
  refs?: { show: boolean; spec: unknown };
};

/** JSON con las claves ordenadas: el mismo contenido da siempre el mismo texto. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

export function hash36(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Valor de la parte `puntos` cuando no se publican puntos. */
export const PUNTOS_OFF = hash36(stableStringify('off'));

const byFirst =(a: unknown[], b: unknown[]) => (String(a[0]) < String(b[0]) ? -1 : 1);

export function publishParts(inp: SigInput): SigParts {
  // Reglas que de verdad se calculan: su capa existe.
  const live = Object.entries(inp.rules).filter(([, r]) => inp.layers[r.layerKey]);
  const liveIds = new Set(live.map(([id]) => id));
  // Peso efectivo (reescalado entre criterios con mapa): es lo que se combina de verdad.
  const raw = inp.criteria.map((c, i) => (liveIds.has(c.id) ? inp.weights[i] ?? 0 : 0));
  const sum = raw.reduce((a, w) => a + w, 0);
  const eff = inp.criteria
    .map((c, i) => [c.id, raw[i], liveIds.has(c.id)] as const)
    .filter(([, , isLive]) => isLive)
    .map(([id, w]) => [id, sum > 0 ? Math.round((w / sum) * 1e5) : 0])
    .sort(byFirst);
  const fedKeys = new Set(live.map(([, r]) => r.layerKey));
  const layers = Object.entries(inp.layers)
    .filter(([k, l]) => l.role !== 'criterion' || fedKeys.has(k))
    .map(([k, l]) => [k, l.role, l.min, l.max, l.bytes ?? null])
    .sort(byFirst);
  return {
    pesos: hash36(stableStringify(eff)),
    reglas: hash36(stableStringify(live.map(([id, r]) => [id, r.layerKey, r.fn, r.veto ?? null]).sort(byFirst))),
    umbrales: hash36(stableStringify(inp.classSig !== undefined ? ['clases', inp.classSig] : [Math.round(inp.thresholds.alta * 1e4), Math.round(inp.thresholds.media * 1e4)])),
    capas: hash36(stableStringify(layers)),
    area: hash36(stableStringify([inp.packId ?? '', inp.grid ?? null])),
    // Los valores (índice, clase, puesto) dependen de pesos, reglas, umbrales, capas y área, que ya tienen su parte:
    // aquí solo entra QUÉ puntos se publican y si se publican.
    puntos: hash36(stableStringify(inp.points?.show
      ? ['on', inp.points.list.map((p) => [p.name, Math.round(p.lat * 1e6), Math.round(p.lon * 1e6)]).sort((a, b) => (String(a) < String(b) ? -1 : 1))]
      : 'off')),
    zonas: hash36(stableStringify(inp.zones?.show ? ['on', inp.zones.spec] : 'off')),
    referencias: hash36(stableStringify(inp.refs?.show ? ['on', inp.refs.spec] : 'off')),
  };
}

/** Partes que difieren entre lo publicado y lo actual (en orden fijo). Vacío = al día. */
export function changedParts(published: Partial<SigParts> | null | undefined, current: SigParts): SigPart[] {
  if (!published) return [];
  // Una publicación anterior a los puntos (o a las zonas o referencias) no trae esa parte: equivale a «sin eso publicado» (así, activar el
  // interruptor después sí la marca como desactualizada). Con las demás partes, ausente = no se afirma nada.
  return ORDER.filter((k) => {
    const was = k === 'puntos' || k === 'zonas' || k === 'referencias' ? published[k] ?? PUNTOS_OFF : published[k];
    return was !== undefined && was !== current[k];
  });
}

/** Texto para el aviso: «los pesos de los criterios y las reglas de idoneidad». */
export function describeChanges(parts: SigPart[]): string {
  const t = parts.map((p) => SIG_PART_LABEL[p]);
  if (t.length <= 1) return t[0] ?? '';
  return `${t.slice(0, -1).join(', ')} y ${t[t.length - 1]}`;
}
