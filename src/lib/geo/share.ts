/** Lógica pura de las pestañas «Exportar» (solo descargas) y «Compartir» (publicación) del geovisor:
 * armado de los grupos de descargas, estado de la publicación y filas de «qué ve quien abra el enlace».
 * Sin React ni E/S, para poder verificarla con un script. */
import { changedParts, describeChanges, type SigPart, type SigParts } from './publishSig.ts';
import { REF_LIMITS, refTrimNote, type RefBuild } from './refPublic.ts';

export type ExportKey = 'compose' | 'report' | 'xls' | 'tif' | 'kmz' | 'cls' | 'csv' | 'ptif' | 'pcsv' | 'rank' | 'zcsv' | 'png' | 'pngr' | 'zip';
/** `opens`: abre un diálogo en vez de descargar (el botón dice «Abrir»). */
export type ExportSpec = { k: ExportKey; label: string; desc: string; opens?: boolean; primary?: boolean };
export type ExportGroup = { id: 'informe' | 'sig' | 'mas' | 'todo'; title: string; /** Plegado por defecto. */ folded?: boolean; items: ExportSpec[] };

export type ExportCtx = {
  /** Sustantivo del índice («idoneidad», «riesgo»…). */
  noun: string;
  crs: string;
  /** Nombres de las N clases, de menor a mayor índice, y nombre de la clase de exclusión/crítica. */
  classNames: string[];
  critical: string;
  /** Hay parcelas/zonas contiguas detectadas (umbral de hectáreas > 0) y su texto. */
  parcels: { n: number; minHa: number; label: string } | null;
  hasPoints: boolean;
  hasZones: boolean;
};

export function exportGroups(c: ExportCtx): ExportGroup[] {
  const classLine = `${c.classNames.map((n, i) => `${i + 1} ${n.toLowerCase()}`).join(' · ')} · 0 ${c.critical.toLowerCase()}`;
  const more: ExportSpec[] = [
    { k: 'cls', label: 'GeoTIFF de clases + estilo .qml', desc: `${classLine}. Para calcular áreas o vectorizar.` },
    { k: 'csv', label: 'CSV de píxeles (lon, lat, %, clase)', desc: 'Para QGIS o Excel; hasta ~200 000 filas.' },
  ];
  if (c.parcels && c.parcels.n > 0) {
    more.push(
      { k: 'ptif', label: `GeoTIFF de parcelas (≥ ${c.parcels.minHa} ha)`, desc: `Cada ${c.parcels.label} con su número (0 = ninguna).` },
      { k: 'pcsv', label: 'CSV de parcelas', desc: 'Número, hectáreas, índice medio y mínimo, y centroide.' },
    );
  }
  if (c.hasPoints) more.push({ k: 'rank', label: 'Ranking de puntos (CSV)', desc: 'Tus puntos ordenados por índice, con clase y estado.' });
  if (c.hasZones) more.push({ k: 'zcsv', label: 'Resumen por zonas (CSV)', desc: 'Índice medio, superficie y % por clase en cada zona.' });
  more.push(
    { k: 'png', label: 'PNG de la vista actual', desc: 'El mapa como lo ves ahora, con título y leyenda.' },
    { k: 'pngr', label: 'PNG solo del resultado', desc: 'Píxeles transparentes, sin mapa base, para superponer.' },
  );
  return [
    { id: 'informe', title: 'Para tu informe', items: [
      { k: 'compose', label: 'Componer mapa para entregar (PNG o PDF)', desc: 'Lámina con título, leyenda, escala y norte; 1600, 2400 o 3600 px.', opens: true },
      { k: 'report', label: 'Informe ejecutivo (PDF)', desc: 'Pesos, reglas, mapa, área por clase, zonas y metodología; se imprime desde el navegador.', opens: true },
      { k: 'xls', label: 'Excel de resumen', desc: 'Pesos, reglas, superficie por clase y datos de las capas.' },
    ] },
    { id: 'sig', title: 'Para QGIS, ArcGIS o Google Earth', items: [
      { k: 'tif', label: `GeoTIFF de ${c.noun} (0–100) + estilo .qml`, desc: `Ráster en ${c.crs || 'UTM'}; carga el .qml para los colores.` },
      { k: 'kmz', label: 'KMZ para Google Earth', desc: 'El resultado como imagen georreferenciada sobre el globo.' },
    ] },
    { id: 'mas', title: 'Más formatos', folded: true, items: more },
    { id: 'todo', title: 'Todo junto', items: [
      { k: 'zip', label: 'Paquete completo (.zip)', desc: 'Todo lo anterior, cada capa de entrada como GeoTIFF y la receta JSON.', primary: true },
    ] },
  ];
}

export type PublishedStatus = { updated_at: string; sig: string | null; parts: SigParts | null } | null;
export type PublishView = {
  state: 'never' | 'current' | 'stale';
  /** Partes que cambiaron (vacío con una publicación antigua sin firma por partes). */
  changed: SigPart[];
  /** «Al día» o «Hay cambios sin publicar: …» (una línea). */
  label: string;
  action: string;
};

/** Estado de la publicación frente a lo calculado ahora. Con firma por partes se dice QUÉ cambió; una publicación
 * anterior solo trae el hash viejo (aviso genérico). */
export function publishView(status: PublishedStatus, parts: SigParts | null, sig: string): PublishView {
  if (!status) return { state: 'never', changed: [], label: 'Aún no has publicado el mapa', action: 'Publicar el mapa' };
  const changed = status.parts && parts ? changedParts(status.parts, parts) : [];
  const stale = status.parts ? changed.length > 0 : status.sig !== sig;
  if (!stale) return { state: 'current', changed: [], label: 'Al día', action: 'Actualizar el mapa publicado' };
  return {
    state: 'stale', changed,
    label: changed.length ? `Hay cambios sin publicar: ${describeChanges(changed)}` : 'Hay cambios sin publicar: pesos, reglas o capas',
    action: 'Actualizar el mapa publicado',
  };
}

export type ViewerRow = { key: 'map' | 'points' | 'zones'; label: string; desc: string; checked: boolean; locked?: boolean; warn?: string };

/** Filas de «Qué ve quien abra el enlace». */
export function viewerRows(o: { showPoints: boolean; showZones: boolean; nPoints: number; zonesReady: boolean; hasPop: boolean; published: boolean }): ViewerRow[] {
  const when = `Se publica al pulsar «${o.published ? 'Actualizar el mapa publicado' : 'Publicar el mapa'}».`;
  return [
    { key: 'map', label: 'El mapa, las clases y los pesos', locked: true, checked: true,
      desc: 'Siempre: el resultado, los pesos con su consistencia y, al hacer clic, el % de un punto. Nunca tus capas de entrada ni los nombres de tus expertos.' },
    { key: 'points', label: 'Puntos y ranking', checked: o.showPoints,
      desc: 'Tus puntos con su índice, clase y puesto, y al abrir uno, el valor de cada criterio en su ubicación.',
      ...(o.showPoints ? { warn: `Los nombres y ubicaciones de ${o.nPoints === 1 ? 'tu punto' : `tus ${o.nPoints} puntos`} serán públicos para cualquiera con el enlace, junto con su índice, clase y puesto y, al abrir un punto, el valor de cada criterio en su ubicación (con su idoneidad, peso y aporte). No se publican tus capas de entrada. ${when}` } : {}) },
    { key: 'zones', label: 'Resumen por zonas', checked: o.showZones,
      desc: 'Por zona: nombre, índice medio, superficie y % por clase; sin polígonos.',
      ...(o.showZones ? { warn: o.zonesReady
        ? `Se publicará, por zona, su nombre, el índice medio, la superficie y el % por clase${o.hasPop ? ', y la cantidad de personas evaluadas y su % en la clase más extrema' : ''}. No se publican los polígonos ni la población por manzana. ${when}`
        : 'Elige una capa de zonas en la pestaña «Zonas» del Geovisor: sin ella no se publica nada.' } : {}) },
  ];
}

/** Enlace público de un proyecto. */
export const publicLink = (origin: string, token: string) => `${origin}/p/${token}`;

export type RefShareRow = { id: string; label: string; count: number; checked: boolean };
export type RefShare = { rows: RefShareRow[]; /** Aviso de privacidad y tamaño de lo marcado (vacío si no hay nada marcado). */ warn: string; /** Un aviso por capa que perdió detalle. */ notes: string[]; kb: number };

/** Filas de «Capas de referencia» (una por capa, con su nombre) y el aviso de qué se publicará, con su tamaño y recortes. */
export function refShareRows(layers: { id: string; label: string; count: number }[], selected: string[], build: RefBuild | null, published: boolean): RefShare {
  const on = new Set(selected);
  const rows = layers.map((l) => ({ id: l.id, label: l.label, count: l.count, checked: on.has(l.id) }));
  if (!build || !build.refs.length) return { rows, warn: '', notes: [], kb: 0 };
  const when = `Se publica al pulsar «${published ? 'Actualizar el mapa publicado' : 'Publicar el mapa'}».`;
  const kb = Math.max(1, Math.round(build.bytes / 1024));
  const names = build.refs.map((r) => `«${r.name}»`).join(', ');
  const skipped = build.skipped.length ? ` Solo caben ${REF_LIMITS.maxLayers} capas: no se publicarán ${build.skipped.map((n) => `«${n}»`).join(', ')}.` : '';
  return {
    rows, kb, notes: build.report.map(refTrimNote).filter(Boolean),
    warn: `Quien tenga el enlace verá el nombre y la forma (geometría simplificada, ≈ ${kb} KB) de ${names}. No se publican los atributos de la capa ni tus capas de entrada.${skipped} ${when}`,
  };
}
