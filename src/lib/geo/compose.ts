/** Composición de mapa para entregar (R1): lógica pura — proyección Web Mercator, teselas, escala gráfica, distribución
 * de la lámina, filas de leyenda, trazos de geometrías, texto de pie y regla de puntos sin puesto. Sin DOM: el dibujo
 * sobre canvas vive en `composeCanvas.ts`. Todo sale del estado del proyecto (`GeoSummary`), nunca de lo visible en
 * pantalla. Pruebas: `scripts/check-geo-report.ts`. */
import { DIR_TEXT, type Direction } from './classes.ts';
import type { Bounds } from './grid.ts';
import type { Geom } from './vector.ts';

/** Anchos de exportación (px) ofrecidos. */
export const COMPOSE_WIDTHS = [1600, 2400, 3600] as const;
export type ComposeWidth = (typeof COMPOSE_WIDTHS)[number];

// ------------------------------------------------------------------ formato de cifras (es-CO, determinista)
/** 1234.5 → «1.234,5». No depende de la configuración regional del navegador ni de ICU. */
export function fmtNum(x: number, decimals = 1): string {
  if (!Number.isFinite(x)) return '—';
  const neg = x < 0;
  const [int, dec] = Math.abs(x).toFixed(decimals).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg && Number(Math.abs(x).toFixed(decimals)) !== 0 ? '-' : '') + grouped + (dec ? ',' + dec : '');
}
export const fmtPct = (x: number, decimals = 1) => `${fmtNum(x, decimals)} %`;
/** Fecha ISO `YYYY-MM-DD` → «10 de octubre de 2026». */
export function fmtDateEs(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${Number(m[3])} de ${meses[Number(m[2]) - 1] ?? m[2]} de ${m[1]}`;
}

// ------------------------------------------------------------------ Web Mercator
const MAX_LAT = 85.05112878;
const clampLat = (lat: number) => Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
/** x en [0,1] (0 = −180°). */
export const mercX = (lon: number) => (lon + 180) / 360;
/** y en [0,1] (0 = norte). */
export const mercY = (lat: number) => {
  const s = Math.sin((clampLat(lat) * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};
const EARTH_CIRC = 40075016.686;

export type MapView = {
  /** Esquina superior izquierda en unidades Mercator [0,1]. */
  x0: number; y0: number;
  /** Píxeles por unidad Mercator (1 unidad = 360° de longitud). */
  scale: number;
  /** Tamaño de la ventana en px. */
  w: number; h: number;
  /** Latitud del centro (para la escala gráfica). */
  latC: number;
};

/** Ventana que encuadra `bounds` con `padFrac` de aire, centrada, dentro de una caja `w × h` px. */
export function fitView(bounds: Bounds, w: number, h: number, padFrac = 0.04): MapView {
  const xa = mercX(bounds.west), xb = mercX(bounds.east), ya = mercY(bounds.north), yb = mercY(bounds.south);
  const dx = Math.max(xb - xa, 1e-9), dy = Math.max(yb - ya, 1e-9);
  const k = 1 - 2 * padFrac;
  const scale = Math.min((w * k) / dx, (h * k) / dy);
  const cx = (xa + xb) / 2, cy = (ya + yb) / 2;
  return { x0: cx - w / 2 / scale, y0: cy - h / 2 / scale, scale, w, h, latC: (bounds.north + bounds.south) / 2 };
}
/** lon/lat → px dentro de la caja del mapa. */
export const project = (v: MapView, lon: number, lat: number): [number, number] => [(mercX(lon) - v.x0) * v.scale, (mercY(lat) - v.y0) * v.scale];
/** Metros por píxel en la latitud del centro. */
export const metersPerPixel = (v: MapView) => (EARTH_CIRC * Math.cos((v.latC * Math.PI) / 180)) / v.scale;

// ------------------------------------------------------------------ teselas del mapa base
export type TileSpec = { z: number; x: number; y: number; url: string };

/** Zoom más bajo cuyas teselas dan al menos 1 px de tesela por px de mapa; limitado por el máximo del mapa base y por `maxTiles`. */
export function pickZoom(v: MapView, maxZoom: number, maxTiles = 48): number {
  let z = Math.max(0, Math.min(maxZoom, Math.ceil(Math.log2((v.scale) / 256))));
  while (z > 0 && tileRange(v, z).count > maxTiles) z--;
  return z;
}

function tileRange(v: MapView, z: number) {
  const n = 2 ** z;
  const xa = v.x0, xb = v.x0 + v.w / v.scale, ya = v.y0, yb = v.y0 + v.h / v.scale;
  const x0 = Math.floor(xa * n), x1 = Math.floor(xb * n), y0 = Math.max(0, Math.floor(ya * n)), y1 = Math.min(n - 1, Math.floor(yb * n));
  return { x0, x1, y0, y1, n, count: Math.max(0, (x1 - x0 + 1) * (y1 - y0 + 1)) };
}

/** Plantilla `{z}/{x}/{y}/{s}/{r}` → URL. */
export function tileUrl(tpl: string, z: number, x: number, y: number, subdomains = 'abc'): string {
  const s = subdomains.length ? subdomains[(x + y) % subdomains.length] : '';
  return tpl.replace('{s}', s).replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)).replace('{r}', '');
}

/** Teselas que cubren la ventana (con el envoltorio de longitud normalizado). */
export function tilesFor(v: MapView, z: number, tpl: string, subdomains = 'abc'): (TileSpec & { px: number; py: number; size: number })[] {
  const r = tileRange(v, z);
  const out: (TileSpec & { px: number; py: number; size: number })[] = [];
  const size = v.scale / r.n;
  for (let ty = r.y0; ty <= r.y1; ty++) {
    for (let tx = r.x0; tx <= r.x1; tx++) {
      const wx = ((tx % r.n) + r.n) % r.n;
      out.push({ z, x: wx, y: ty, url: tileUrl(tpl, z, wx, ty, subdomains), px: (tx / r.n - v.x0) * v.scale, py: (ty / r.n - v.y0) * v.scale, size });
    }
  }
  return out;
}

// ------------------------------------------------------------------ escala gráfica
export type ScaleBar = { meters: number; px: number; label: string };
/** Barra de escala «redonda» (1, 2, 5 × 10ⁿ m) que cabe en `maxPx` píxeles. */
export function niceScale(mPerPx: number, maxPx: number): ScaleBar {
  if (!(mPerPx > 0) || !(maxPx > 0)) return { meters: 0, px: 0, label: '' };
  const maxM = mPerPx * maxPx;
  const pow = 10 ** Math.floor(Math.log10(maxM));
  let m = pow;
  for (const k of [5, 2, 1]) if (k * pow <= maxM) { m = k * pow; break; }
  return { meters: m, px: m / mPerPx, label: m >= 1000 ? `${fmtNum(m / 1000, 0)} km` : `${fmtNum(m, 0)} m` };
}

// ------------------------------------------------------------------ distribución de la lámina
export type Rect = { x: number; y: number; w: number; h: number };
export type FrameLayout = {
  W: number; H: number; /** Factor de escala respecto al ancho de referencia 1600 px (tamaños de texto, márgenes). */ s: number;
  pad: number; header: Rect; map: Rect; legend: Rect; footer: Rect;
};
export const REF_WIDTH = 1600;

/** Lámina: título arriba, mapa a la izquierda, leyenda a la derecha, pie abajo. La altura sigue la forma del área
 * (acotada), y crece si la leyenda necesita más alto que el mapa. `legendNeeded` = alto de la leyenda en px de salida. */
export function frameLayout(W: number, bounds: Bounds, legendNeeded = 0, titleLines = 1, subtitleLines = 0, footerLines = 2): FrameLayout {
  const s = W / REF_WIDTH;
  const pad = Math.round(28 * s);
  const legendW = Math.round(W * 0.27);
  const gap = Math.round(20 * s);
  const mapW = W - 2 * pad - legendW - gap;
  const dx = Math.max(mercX(bounds.east) - mercX(bounds.west), 1e-9), dy = Math.max(mercY(bounds.south) - mercY(bounds.north), 1e-9);
  const asp = dx / dy;
  const mapH = Math.round(Math.max(mapW * 0.55, Math.min(mapW * 1.15, mapW / asp)));
  const headerH = Math.round((16 + 34 * titleLines + 22 * subtitleLines + 8) * s);
  const footerH = Math.round((26 + footerLines * 17) * s);
  const bodyH = Math.max(mapH, legendNeeded);
  const H = pad + headerH + gap + bodyH + gap + footerH + pad;
  const top = pad + headerH + gap;
  return {
    W, H, s, pad,
    header: { x: pad, y: pad, w: W - 2 * pad, h: headerH },
    map: { x: pad, y: top, w: mapW, h: bodyH },
    legend: { x: pad + mapW + gap, y: top, w: legendW, h: bodyH },
    footer: { x: pad, y: top + bodyH + gap, w: W - 2 * pad, h: footerH },
  };
}

// ------------------------------------------------------------------ leyenda
export type LegendClassInput = {
  /** De la clase más alta a la más baja, seguida de «Exclusión» (el orden de `GeoSummary.classes`). */
  classes: { label: string; ha: number; pct: number }[];
  /** Ascendentes: [from, to) en 0–1 por clase evaluada (`GeoSummary.ranges`). */
  ranges: { label: string; from: number; to: number }[];
};
export type LegendRow = { code: number; label: string; range: string; value: string; kind: 'class' | 'exclusion' };

/** Filas de la leyenda del resultado: las N clases (de la más alta a la más baja) con su rango de índice y % del área
 * evaluada, y la exclusión. `code` es el del plano de clase (1..N, 0 = exclusión) para tomar el color. */
export function legendRows(inp: LegendClassInput): LegendRow[] {
  const n = inp.ranges.length;
  const rows: LegendRow[] = [];
  for (let k = 0; k < n; k++) {
    const i = n - 1 - k; // índice ascendente de la clase
    const c = inp.classes[k];
    const r = inp.ranges[i];
    if (!c || !r) continue;
    const a = Math.round(r.from * 100), b = Math.round(r.to * 100);
    const range = i === 0 ? `< ${b}` : i === n - 1 ? `≥ ${a}` : `${a}–${b}`;
    rows.push({ code: i + 1, label: c.label, range, value: `${fmtPct(c.pct)} · ${fmtNum(c.ha, 0)} ha`, kind: 'class' });
  }
  const ex = inp.classes[n];
  if (ex) rows.push({ code: 0, label: ex.label, range: '', value: `${fmtNum(ex.ha, 0)} ha`, kind: 'exclusion' });
  return rows;
}

/** Texto de la dirección del índice, para la leyenda y el informe. */
export function directionLine(direction: Direction): string {
  const T = DIR_TEXT[direction];
  return `${T.indexName} 0–100: ${T.meaning}.`;
}

// ------------------------------------------------------------------ puntos (regla: sin puesto fuera del área)
export type ComposePoint = { lat: number; lon: number; rank: number | null; color: string; name: string };
/** Separa los puntos evaluados (con puesto) de los que no lo tienen (fuera del área, excluidos o sin dato). */
export function splitPoints<T extends { rank: number | null }>(points: T[]): { ranked: T[]; unranked: T[] } {
  return { ranked: points.filter((p) => p.rank !== null), unranked: points.filter((p) => p.rank === null) };
}
/** Texto de la fila de leyenda de los puntos sin puesto; null si no hay. */
export function unrankedNote(n: number): string | null {
  return n > 0 ? `${n} punto${n === 1 ? '' : 's'} sin puesto (fuera del área, excluido${n === 1 ? '' : 's'} o sin dato)` : null;
}

// ------------------------------------------------------------------ opciones y plan
export type ComposeOptions = {
  title: string;
  subtitle: string;
  width: ComposeWidth;
  basemap: boolean;
  /** Clave del mapa base (solo si `basemap`). */
  basemapKey: string;
  result: boolean;
  /** Resultado por clases o rampa continua (independiente de la vista activa). */
  style: 'classes' | 'continuous';
  zones: boolean;
  referenceIds: string[];
  points: boolean;
  legend: boolean;
  scaleBar: boolean;
  northArrow: boolean;
  /** Fecha ISO que se imprime en el pie. */
  date: string;
};

export type ComposeAvailability = { zones: boolean; references: { id: string; name: string }[]; points: number; result: boolean };

/** Normaliza lo pedido contra lo que existe en el proyecto (una capa inexistente no se dibuja ni se anuncia en la
 * leyenda). `warnings` explica lo omitido. */
export function planComposition(opts: ComposeOptions, avail: ComposeAvailability): { opts: ComposeOptions; warnings: string[] } {
  const warnings: string[] = [];
  const o = { ...opts };
  if (o.result && !avail.result) { o.result = false; warnings.push('No hay resultado calculado: se omite la capa de resultado.'); }
  if (o.zones && !avail.zones) { o.zones = false; warnings.push('El proyecto no tiene zonas elegidas: se omite el coroplético.'); }
  if (o.points && avail.points === 0) { o.points = false; }
  const known = new Set(avail.references.map((r) => r.id));
  const missing = o.referenceIds.filter((id) => !known.has(id));
  if (missing.length) warnings.push(`${missing.length} capa(s) de referencia ya no existen y se omiten.`);
  o.referenceIds = o.referenceIds.filter((id) => known.has(id));
  if (!o.title.trim()) o.title = 'Mapa sin título';
  return { opts: o, warnings };
}

export function defaultOptions(title: string, avail: ComposeAvailability, basemapKey: string, date: string): ComposeOptions {
  return {
    title, subtitle: '', width: 2400, basemap: true, basemapKey, result: avail.result, style: 'classes',
    zones: false, referenceIds: avail.references.map((r) => r.id), points: avail.points > 0, legend: true, scaleBar: true, northArrow: true, date,
  };
}

// ------------------------------------------------------------------ pie: fuente y atribución
export type FooterInput = {
  basemapAttr: string | null;
  /** Fuentes de los datos (capas del paquete, orígenes) — se deduplican y se limitan. */
  sources: string[];
  dataAttribution?: string;
  date: string;
  appName: string; version: string; doi: string;
};
/** Líneas del pie, sin truncar (el dibujo las parte por ancho). */
export function footerLines(f: FooterInput): string[] {
  const src = Array.from(new Set(f.sources.map((s) => s.trim()).filter(Boolean))).slice(0, 8);
  const lines: string[] = [];
  const base = f.basemapAttr ? `Mapa base: ${f.basemapAttr}.` : 'Sin mapa base.';
  const data = [f.dataAttribution?.trim(), src.length ? `Fuentes de los datos: ${src.join('; ')}` : ''].filter(Boolean).join(' · ');
  lines.push(`${base}${data ? ' ' + data + '.' : ''}`.replace(/\.\.$/, '.'));
  lines.push(`Elaborado con ${f.appName} v${f.version} (https://doi.org/${f.doi}) · ${fmtDateEs(f.date)}.`);
  return lines;
}

/** Partición de un texto en líneas que caben en `maxW` según `measure` (sin truncar; una palabra más ancha que `maxW` va sola). */
export function wrapLines(text: string, maxW: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let cur = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = cur ? `${cur} ${w}` : w;
      if (cur && measure(t) > maxW) { out.push(cur); cur = w; } else cur = t;
    }
    out.push(cur);
  }
  return out;
}

// ------------------------------------------------------------------ geometrías
export type Paths = { rings: number[][][]; lines: number[][][]; points: number[][] };
/** Aplana una geometría GeoJSON en anillos (polígonos), líneas y puntos (coordenadas lon/lat). */
export function geomPaths(g: Geom | null | undefined, out: Paths = { rings: [], lines: [], points: [] }): Paths {
  if (!g) return out;
  const c = g.coordinates as unknown;
  switch (g.type) {
    case 'Point': out.points.push(c as number[]); break;
    case 'MultiPoint': out.points.push(...(c as number[][])); break;
    case 'LineString': out.lines.push(c as number[][]); break;
    case 'MultiLineString': out.lines.push(...(c as number[][][])); break;
    case 'Polygon': out.rings.push(...(c as number[][][])); break;
    case 'MultiPolygon': for (const p of c as number[][][][]) out.rings.push(...p); break;
    case 'GeometryCollection': g.geometries?.forEach((x) => geomPaths(x, out)); break;
  }
  return out;
}

/** Nombre de archivo de la composición. */
export const composeFileName = (base: string, width: number, ext: 'png' | 'pdf') => `${base}_composicion_${width}px.${ext}`;
