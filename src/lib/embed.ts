/** Vista embebible del mapa publicado (`/p/<token>/embed`): ruta, parámetros, código <iframe>, cabeceras de
 * enmarcado y texto para Open Graph. Lógica pura (sin React ni E/S) para poder verificarla con un script. */
import { publishedPoints, publishedZones } from './geo/publish.ts';

export type EmbedStyle = 'continuous' | 'classes';
export type EmbedBase = 'sat' | 'osm' | 'topo' | 'ocean' | 'dark';
export type EmbedPanel = 'map' | 'points' | 'zones';

export const EMBED_BASES: EmbedBase[] = ['sat', 'osm', 'topo', 'ocean', 'dark'];
export const EMBED_SIZE = { minW: 240, maxW: 2000, minH: 200, maxH: 1600, defW: 800, defH: 520 } as const;
export const EMBED_PRESETS: { key: string; label: string; w: number | '100%'; h: number }[] = [
  { key: 'wide', label: 'Ancho completo · 520 px de alto', w: '100%', h: 520 },
  { key: 'tall', label: 'Ancho completo · 720 px de alto', w: '100%', h: 720 },
  { key: 'blog', label: 'Entrada de blog · 700 × 480', w: 700, h: 480 },
  { key: 'square', label: 'Cuadrado · 480 × 480', w: 480, h: 480 },
];

/** Ruta de la vista embebida. El token se codifica para que ningún carácter raro salga de la ruta. */
export const embedPath = (token: string) => `/p/${encodeURIComponent(token)}/embed`;

export { frameHeaders, isEmbedPath } from './frame.ts';

export type EmbedOpts = { style?: EmbedStyle; base?: EmbedBase; panel?: EmbedPanel };

/** URL absoluta de la vista embebida, con los parámetros que no son los de por defecto. */
export function embedUrl(origin: string, token: string, o: EmbedOpts = {}): string {
  const q = new URLSearchParams();
  if (o.style === 'classes') q.set('style', 'classes');
  if (o.base && o.base !== 'sat' && EMBED_BASES.includes(o.base)) q.set('base', o.base);
  if (o.panel && o.panel !== 'map') q.set('panel', o.panel);
  const s = q.toString();
  return `${origin}${embedPath(token)}${s ? `?${s}` : ''}`;
}

/** Entero dentro de los límites; un valor no numérico cae al de por defecto. */
export function clampSize(v: unknown, lo: number, hi: number, def: number): number {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? Math.min(hi, Math.max(lo, Math.round(n))) : def;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Código <iframe> listo para pegar. `width` = '100%' o píxeles; el título y la URL se escapan (atributos HTML). */
export function iframeCode(o: { url: string; title: string; width: number | '100%'; height: number }): string {
  const w = o.width === '100%' ? '100%' : String(clampSize(o.width, EMBED_SIZE.minW, EMBED_SIZE.maxW, EMBED_SIZE.defW));
  const h = clampSize(o.height, EMBED_SIZE.minH, EMBED_SIZE.maxH, EMBED_SIZE.defH);
  return `<iframe src="${esc(o.url)}" title="${esc(o.title || 'Mapa MCDA')}" width="${w}" height="${h}" style="border:0;max-width:100%" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
}

/** Parámetros de la URL → opciones válidas (lo desconocido se ignora, nunca se interpreta). */
export function parseEmbedParams(sp: Record<string, string | string[] | undefined>): Required<EmbedOpts> {
  const one = (k: string) => { const v = sp[k]; return Array.isArray(v) ? v[0] : v; };
  const base = one('base');
  const panel = one('panel');
  return {
    style: one('style') === 'classes' ? 'classes' : 'continuous',
    base: (EMBED_BASES as string[]).includes(base ?? '') ? (base as EmbedBase) : 'sat',
    panel: panel === 'points' || panel === 'zones' ? panel : 'map',
  };
}

type MetaLike = { showPoints?: boolean; points?: unknown; showZones?: boolean; zones?: unknown };

/** Qué vistas ofrece un mapa publicado: «Mapa» siempre; puntos y zonas solo si el dueño los publicó. */
export function embedViews(meta: MetaLike): EmbedPanel[] {
  const out: EmbedPanel[] = ['map'];
  if (publishedPoints(meta)) out.push('points');
  if (publishedZones(meta)) out.push('zones');
  return out;
}
/** Panel pedido por la URL si realmente existe en lo publicado; si no, el mapa. */
export const resolvePanel = (want: EmbedPanel, meta: MetaLike): EmbedPanel => (embedViews(meta).includes(want) ? want : 'map');

const clip = (s: string, n: number) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`; };

/** Título y descripción para Open Graph / Twitter de un enlace público. Con proyecto no disponible, texto genérico. */
export function socialText(p: { title?: string; objective?: string; spatial?: boolean } | null): { title: string; description: string } {
  const site = 'Plataforma MCDA';
  if (!p || !p.title) return { title: site, description: 'Toma de decisiones multicriterio: AHP, TOPSIS, VIKOR, PROMETHEE, ELECTRE y mapas de aptitud AHP + SIG.' };
  const kind = p.spatial ? 'Mapa de aptitud (AHP + SIG)' : 'Resultados de decisión multicriterio';
  const obj = p.objective ? clip(p.objective, 180) : '';
  return { title: `${clip(p.title, 90)} · ${site}`, description: obj ? `${kind}. ${obj}` : `${kind} publicado en la ${site}.` };
}
