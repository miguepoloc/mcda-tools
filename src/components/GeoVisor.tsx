'use client';

/** Geovisor AHP + SIG (`kind:'spatial'`, ver plataforma/docs/PLAN_geovisor_ahp_sig.md). Mapa web real
 * (Leaflet) con mapa base mundial; el cálculo de idoneidad corre en el navegador con los pesos del
 * panel de expertos (mismo `sheetResult(CRIT_SHEET,…)` que usan los demás métodos). Los datos vienen
 * de un paquete del catálogo (`geo.packId`) o de las capas propias del estudiante (`geo.grid` +
 * `geo.layers`, en Storage). Este componente coordina; las pestañas viven en GeoLayersPanel,
 * GeoModelPanel y GeoExportPanel. */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CRIT_SHEET, sheetResult, type JIndex } from '@/lib/ahp';
import { gridBoundsLonLat, type Bounds } from '@/lib/geo/grid';
import { lonLatToPixel, pixelToLonLat } from '@/lib/geo/crs';
import { buildMask, fromPack, mergeExtraLayers, type GeoData, type LayerInfo } from '@/lib/geo/data';
import { buildOverlayMap, gather, type OverlayMap } from '@/lib/geo/overlay';
import { loadPack } from '@/lib/geo/pack';
import { CLASS_LABEL, PALETTES, classHex, paintCriterion, paintDiff, paintFlag, paintParcels, paintRaw, paintResult, type PaletteKey } from '@/lib/geo/paint';
import { findParcels } from '@/lib/geo/patches';
import { describeFn, describeVeto, suitability, vetoed } from '@/lib/geo/membership';
import { downloadLayer, getQuota, type Quota } from '@/lib/geo/store';
import { CAT_PREFIX, getCatalogRow, loadCatalogLayer } from '@/lib/geo/catalog';
import { ahpSummary } from '@/lib/geo/ahpSummary';
import { encodePlanes, type PublishedMeta } from '@/lib/geo/publish';
import type { Example } from '@/lib/geo/examples';
import GeoPublishPanel from './GeoPublishPanel';
import GeoCatalogPanel from './GeoCatalogPanel';
import GeoTour, { tourSeen, type TourStep } from './GeoTour';
import {
  areaStats, type AreaStats, CLASS_ALTA, CLASS_EXCLUDED, CLASS_MODERADA, CLASS_NO_APTA, CLASS_VETO, coverageStats, evaluateGrid, MASK_VALID, usableRules, type CriterionRule,
} from '@/lib/geo/suitability';
import { kmz, parcelsCsv, pixelsCsv, qmlClasses, qmlPct, resultRaster, safeName, slug, toGeoTiff, zipFiles } from '@/lib/geo/export';
import { downloadGeoExcelBytes, type GeoSummary } from '@/lib/geoExcel';
import type { Criterion, ExpertRow, GeoConfig, GeoLayerMeta } from '@/lib/types';
import GeoMap, { BASEMAPS, type BasemapKey, type GeoMapHandle, type MapMarker, type RasterOverlay } from './GeoMap';
import GeoLayersPanel, { type VecItem, type VisState } from './GeoLayersPanel';
import GeoModelPanel from './GeoModelPanel';
import { Icon, ICONS, usePalette } from './GeoBits';
import { BasemapChips, LayerLegend, PaletteChips, ResultLegend, StyleChips, type LayerLegendSpec } from './GeoHud';
import { canvasBytes, saveBytes, toCanvas, toUrl } from '@/lib/geo/canvas';

type Props = {
  projectId: string; ownerId: string; title: string; objective: string;
  criteria: Criterion[]; experts: ExpertRow[]; idx: JIndex; geo: GeoConfig;
  supabase: SupabaseClient | null;
  onChangeGeo: (g: GeoConfig, immediate?: boolean) => void;
  examples: Example[];
  onApplyExample: (id: string) => void;
  share: { isPublic: boolean; token: string; onTogglePublic: (on: boolean) => void } | null;
};

type Tab = 'capas' | 'modelo' | 'exportar';

const TOUR: TourStep[] = [
  { sel: '.gv-steps-bar', tab: 'capas', title: 'Cuatro pasos', text: 'Área → Capas → Reglas → Pesos. Cada marca se pone verde cuando ese paso está listo. Los pesos vienen de tus expertos (pestaña «Expertos» del proyecto).' },
  { sel: '.gv-drop, .gv-sec', tab: 'capas', title: 'Sube tus mapas', text: 'Arrastra GeoTIFF, GeoJSON, shapefile en .zip, KML o GPX. El área de estudio se propone sola desde el primer archivo. Cada archivo puede ser un criterio, una exclusión o el área de estudio.' },
  { sel: '.gv-side-body', tab: 'modelo', title: 'Pesos y reglas', text: 'Aquí ves los pesos del panel y, por cada criterio, eliges la capa y la regla que la traduce a idoneidad (0 a 1), con vista previa. El mapa cambia en vivo.' },
  { sel: '.gv-leaflet', title: 'El mapa', text: 'Muévete y acerca como en cualquier mapa. Haz clic en un punto para ver su % de idoneidad, su clase y cuánto aporta cada criterio.' },
  { sel: '.gv-hud-tr', title: 'Mapa base y estilo', text: 'Cambia el mapa base (satélite, calles, relieve, océano) y muestra el resultado continuo o en 3 clases.' },
  { sel: '.gv-side-body', tab: 'exportar', title: 'Exportar y publicar', text: 'GeoTIFF (con estilo para QGIS), PNG, KMZ, CSV, Excel y un .zip con todo. Aquí también activas la vista pública con enlace.' },
];
type Deps = unknown[];
/** Variables CSS de clase según la paleta: así los recuadros de color de los paneles (`--geo-alta`…) siguen a la del mapa. */
const paletteVars = (pal: PaletteKey) => {
  const h = classHex(pal);
  return { '--geo-alta': h[CLASS_ALTA], '--geo-media': h[CLASS_MODERADA], '--geo-noapta': h[CLASS_NO_APTA], '--geo-excl': h[CLASS_EXCLUDED] } as React.CSSProperties;
};
const sameDeps = (a: Deps, b: Deps) => a.length === b.length && a.every((x, i) => x === b[i]);

export default function GeoVisor(props: Props) {
  const { criteria, experts, idx, geo, supabase } = props;
  const [tab, setTab] = useState<Tab>('capas');
  // Criterio al que se le está subiendo un mapa / cuya regla se abre tras subirlo (flujo «Subir el mapa de este criterio»).
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [data, setData] = useState<GeoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [lost, setLost] = useState(0);
  const [basemap, setBasemap] = useState<BasemapKey>('sat');
  const [style, setStyle] = useState<'continuous' | 'classes'>('continuous');
  const [palette, setPalette] = usePalette();
  const [layerErrs, setLayerErrs] = useState<string[]>([]);
  const HEX = useMemo(() => classHex(palette), [palette]);
  const [vis, setVis] = useState<VisState>({});
  const [vecs, setVecs] = useState<VecItem[]>([]);
  const [selected, setSelected] = useState<{ col: number; row: number } | null>(null);
  const [thresholds, setThresholds] = useState(geo.classes);
  const [exploring, setExploring] = useState(false);
  const [exploreWeights, setExploreWeights] = useState<number[] | null>(null);
  const [draft, setDraft] = useState<Bounds | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [imgs, setImgs] = useState<Record<string, string>>({});
  const [tour, setTour] = useState(false);
  const [minPatchHa, setMinPatchHa] = useState(geo.minPatchHa ?? 0);
  const [baseline, setBaseline] = useState<{ label: string; pct: Uint8Array; stats: AreaStats } | null>(null);
  useEffect(() => { if (!tourSeen()) { const t = setTimeout(() => setTour(true), 900); return () => clearTimeout(t); } }, []);

  const mapRef = useRef<GeoMapHandle>(null);
  const coordRef = useRef<HTMLSpanElement>(null);
  const geoRef = useRef(geo);
  // Al cargar un ejemplo (o abrir otra configuración) los umbrales y el área mínima vienen en `geo`: sin esto la
  // interfaz seguía con los valores del montaje anterior (p. ej. 0.70/0.45 en vez de 0.75/0.25 de la boya).
  useEffect(() => { setThresholds((t) => (t.alta === geo.classes.alta && t.media === geo.classes.media ? t : { alta: geo.classes.alta, media: geo.classes.media })); }, [geo.classes.alta, geo.classes.media]);
  useEffect(() => { setMinPatchHa(geo.minPatchHa ?? 0); }, [geo.minPatchHa]);
  const cache = useRef<Record<string, Float32Array>>({});
  const cachePack = useRef('');
  /** Paquete estático ya descargado (solo lectura): añadir una capa propia no lo vuelve a bajar. */
  const packCache = useRef<{ id: string; base: GeoData } | null>(null);
  const paintCache = useRef(new Map<string, { deps: Deps; url: string }>());
  const [quota, setQuota] = useState<Quota | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const refreshQuota = useCallback(() => { if (supabase) void getQuota(supabase).then(setQuota); }, [supabase]);
  useEffect(() => { refreshQuota(); }, [refreshQuota]);
  useEffect(() => { if (supabase) void supabase.rpc('is_admin').then(({ data }) => setIsAdmin(data === true)); }, [supabase]);

  useEffect(() => { geoRef.current = geo; }, [geo]);
  const commit = useCallback((mutate: (g: GeoConfig) => GeoConfig) => {
    const next = mutate(geoRef.current);
    geoRef.current = next;
    props.onChangeGeo(next, true);
  }, [props]);

  // ------------------------------------------------------------------ carga de datos
  const gridSig = geo.grid ? JSON.stringify(geo.grid) : '';
  const layersSig = geo.packId + '|' + JSON.stringify(Object.entries(geo.layers ?? {}).map(([k, l]) => [k, l.path, l.role, l.bytes, l.min, l.max]));
  useEffect(() => {
    let alive = true;
    setError('');
    // Descarga (o toma de la caché) las capas de `metas`. La caché la llenan también las cargas en
    // curso (GeoLayersPanel), así que aquí nunca se purga por comparación con `geo.layers` — un render
    // intermedio la vaciaría a mitad de un lote. Borrar una capa o cambiar el área limpia la caché de
    // forma explícita en GeoLayersPanel.
    const load = async (metas: Record<string, GeoLayerMeta>, fetchOne: (m: GeoLayerMeta) => Promise<Float32Array>, cells: number, errs: string[]) => {
      const need = Object.keys(metas).filter((k) => !cache.current[k] && metas[k].path);
      if (need.length) setLoading(true);
      let done = 0;
      for (const k of need) {
        if (!supabase) continue;
        // Una capa que no baja (o que no calza con la grilla) no debe tumbar todo el proyecto: se cuenta como perdida.
        try {
          const arr = await fetchOne(metas[k]);
          if (arr.length !== cells) throw new Error(`tiene ${arr.length.toLocaleString('es-CO')} celdas y la grilla ${cells.toLocaleString('es-CO')}`);
          cache.current[k] = arr;
        } catch (e) { errs.push(`«${metas[k].label}»: ${e instanceof Error ? e.message : String(e)}`); }
        if (alive) setProgress(++done / need.length);
      }
      const layers: Record<string, Float32Array> = {}; const info: Record<string, LayerInfo> = {};
      let missing = 0;
      for (const [k, m] of Object.entries(metas)) {
        if (!cache.current[k]) { missing++; continue; }
        layers[k] = cache.current[k];
        info[k] = { label: m.label, unit: m.unit, role: m.role, min: m.min, max: m.max, origin: m.origin, source: m.source, bytes: m.bytes, license: m.license };
      }
      return { layers, info, missing, extras: Object.keys(layers).map((key) => ({ key, info: info[key], values: layers[key] })) };
    };
    (async () => {
      const errs: string[] = [];
      const isCat = !!geo.packId?.startsWith(CAT_PREFIX);
      const pk = geo.packId ?? '';
      if (cachePack.current !== pk) { cache.current = {}; cachePack.current = pk; }
      const own = geo.layers ?? {};
      const fetchOwn = (m: GeoLayerMeta) => downloadLayer(supabase!, m.path);
      if (geo.packId && !isCat) {
        // Paquete estático (solo lectura): se descarga una vez y se guarda; las capas propias del
        // estudiante (alineadas a la grilla del paquete) se le suman sin tocarlo.
        let base: GeoData;
        if (packCache.current?.id === geo.packId) base = packCache.current.base;
        else {
          setLoading(true); setProgress(0);
          const p = await loadPack(geo.packId, (l, t) => alive && setProgress(l / t));
          base = fromPack(p);
          packCache.current = { id: geo.packId, base };
        }
        const mine = await load(own, fetchOwn, base.grid.width * base.grid.height, errs);
        if (alive) { setData(mergeExtraLayers(base, mine.extras)); setLost(mine.missing); setLayerErrs(errs); }
      } else if (isCat) {
        if (!supabase) throw new Error('El catálogo necesita conexión con la base de datos.');
        setLoading(true);
        const row = await getCatalogRow(supabase, geo.packId!.slice(CAT_PREFIX.length));
        if (!row) throw new Error('Este paquete del catálogo ya no está disponible (el docente lo retiró).');
        const grid = row.definition.geo.grid;
        const cells = grid.width * grid.height;
        const cat = await load(row.definition.geo.layers, (m) => loadCatalogLayer(supabase, m.path), cells, errs);
        const mine = await load(own, fetchOwn, cells, errs);
        if (!alive) return;
        setLayerErrs(errs);
        const base: GeoData = { grid, layers: cat.layers, info: cat.info, mask: buildMask(grid, cat.layers, cat.info), points: {}, attribution: row.attribution };
        setLost(cat.missing + mine.missing);
        setData(mergeExtraLayers(base, mine.extras));
      } else if (geo.grid) {
        const grid = geo.grid;
        if (!Object.keys(own).length) cache.current = {};
        const r = await load(own, fetchOwn, grid.width * grid.height, errs);
        if (!alive) return;
        setLayerErrs(errs);
        setLost(r.missing);
        setData({ grid, layers: r.layers, info: r.info, mask: buildMask(grid, r.layers, r.info), points: {}, attribution: undefined });
      } else { setData(null); setLayerErrs([]); }
    })().catch((e) => alive && setError(e instanceof Error ? e.message : String(e))).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [geo.packId, gridSig, layersSig, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------ pesos y reglas
  const expertIds = useMemo(() => experts.filter((e) => Object.keys(idx[e.id] ?? {}).length > 0).map((e) => e.id), [experts, idx]);
  const weightResult = useMemo(() => sheetResult(CRIT_SHEET, criteria, expertIds, idx), [criteria, expertIds, idx]);
  const weights = exploring && exploreWeights ? exploreWeights : weightResult.agg.w;

  const rules = useMemo<CriterionRule[]>(() => {
    const out: CriterionRule[] = [];
    criteria.forEach((c, i) => {
      const r = geo.rules[c.id];
      if (!r || !data?.layers[r.layerKey]) return;
      const cr: CriterionRule = { key: r.layerKey, weight: weights[i] ?? 0, fn: r.fn };
      if (r.veto) cr.veto = r.veto;
      out.push(cr);
    });
    return out;
  }, [criteria, geo.rules, weights, data]);
  // Peso efectivo: los criterios con mapa, reescalados a 1 (lo que de verdad se combina).
  const effW = useMemo(() => {
    const ready = criteria.map((c, i) => (geo.rules[c.id] && data?.layers[geo.rules[c.id].layerKey] ? (weights[i] ?? 0) : null));
    const sum = ready.reduce<number>((a, w) => a + (w ?? 0), 0);
    return Object.fromEntries(criteria.map((c, i) => [c.id, ready[i] !== null && sum > 0 ? (ready[i] as number) / sum : 0])) as Record<string, number>;
  }, [criteria, geo.rules, data, weights]);
  const dRules = useDeferredValue(rules);
  const dThr = useDeferredValue(thresholds);

  const ev = useMemo(() => (data ? evaluateGrid(data.layers, data.mask, dRules, dThr) : null), [data, dRules, dThr]);
  const stats = useMemo(() => (data && ev ? areaStats(ev.cls, ev.pct, data.mask, data.grid.haPerPixel) : null), [data, ev]);
  const coverage = useMemo(() => (data ? coverageStats(data.layers, data.mask, dRules) : null), [data, dRules]);
  const dMinPatch = useDeferredValue(minPatchHa);
  const parcelRes = useMemo(() => {
    if (!data || !ev || !(dMinPatch > 0)) return null;
    return findParcels(ev.cls, ev.pct, data.mask, data.grid.width, data.grid.height, Math.ceil(dMinPatch / data.grid.haPerPixel), data.grid.haPerPixel);
  }, [data, ev, dMinPatch]);
  const om = useMemo(() => (data ? buildOverlayMap(data.grid, 'mercator') : null), [data]);
  const gridBounds = useMemo(() => (data ? gridBoundsLonLat(data.grid) : null), [data]);

  // Encuadra el área cada vez que cambia la grilla (ejemplo cargado, área nueva…).
  const boundsKey = gridBounds ? [gridBounds.west, gridBounds.south, gridBounds.east, gridBounds.north].map((n) => n.toFixed(4)).join(',') : '';
  useEffect(() => { if (gridBounds) setTimeout(() => mapRef.current?.fit(gridBounds), 60); }, [boundsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------ imágenes sobre el mapa
  const virtualIds = [...(parcelRes ? ['parcels'] : []), ...(baseline ? ['diff'] : [])];
  const defaultOn = (id: string) => id === 'result' || id === 'parcels' || id === 'diff';
  const layerIds = data ? Object.keys(data.info).map((k) => `l:${k}`) : [];
  const onIds = ['result', ...virtualIds, ...layerIds].filter((id) => (vis[id]?.on ?? defaultOn(id)));
  const onKey = onIds.join('|');
  useEffect(() => {
    if (!data || !om || !ev) { setImgs({}); return; }
    const t = setTimeout(() => {
      const next: Record<string, string> = {};
      for (const id of onKey.split('|').filter(Boolean)) {
        let deps: Deps, paint: () => Uint32Array;
        if (id === 'result') { deps = [data, ev, om, style, palette]; paint = () => paintResult(ev.pct, ev.cls, data.mask, style, palette); }
        else if (id === 'parcels') { deps = [parcelRes, om]; paint = () => paintParcels(parcelRes!.labels); }
        else if (id === 'diff') { deps = [ev, baseline, om, data, palette]; paint = () => paintDiff(ev.pct, baseline!.pct, data.mask, 1, 30, palette); }
        else {
          const k = id.slice(2), info = data.info[k];
          const rule = Object.values(geo.rules).find((r) => r.layerKey === k);
          deps = [data, om, rule?.fn, palette];
          paint = () => (info.role === 'exclusion' ? paintFlag(data.layers[k], [127, 140, 141])
            : info.role === 'area' ? paintFlag(data.layers[k], [132, 204, 22])
              : rule ? paintCriterion(data.layers[k], data.mask, rule.fn, palette) : paintRaw(data.layers[k], info.min, info.max));
        }
        const hit = paintCache.current.get(id);
        if (hit && sameDeps(hit.deps, deps)) { next[id] = hit.url; continue; }
        const url = toUrl(om, paint());
        paintCache.current.set(id, { deps, url });
        next[id] = url;
      }
      setImgs(next);
    }, 80);
    return () => clearTimeout(t);
  }, [data, om, ev, style, onKey, geo.rules, parcelRes, baseline, palette]);

  const rasters = useMemo<RasterOverlay[]>(() => {
    if (!om) return [];
    return Object.entries(imgs).map(([id, url]) => ({
      id, url, bounds: om.bounds, opacity: vis[id]?.op ?? (id === 'result' ? 0.9 : 0.85), visible: vis[id]?.on ?? defaultOn(id), z: id === 'result' ? 20 : id === 'diff' ? 22 : id === 'parcels' ? 21 : 10,
    }));
  }, [imgs, om, vis]); // eslint-disable-line react-hooks/exhaustive-deps

  const vectors = useMemo(() => vecs.map((v) => ({ id: v.id, fc: v.fc, color: v.color, visible: vis[`v:${v.id}`]?.on ?? false })), [vecs, vis]);

  // ------------------------------------------------------------------ punto consultado
  const point = useMemo(() => (selected && data && ev ? evaluateOnePoint(data, geo, rules, thresholds, selected) : null), [selected, data, ev, geo, rules, thresholds]);

  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    if (data) Object.entries(data.points).forEach(([name, p]) => out.push({ id: `ref:${name}`, lat: p.lat, lon: p.lon, label: name }));
    if (selected && data) { const [lon, lat] = pixelToLonLat(selected.col, selected.row, data.grid.transform, data.grid.crs); out.push({ id: 'sel', lat, lon, selected: true }); }
    return out;
  }, [data, selected]);

  const onMapClick = useCallback((lat: number, lon: number) => {
    if (!data) return;
    const [c, r] = lonLatToPixel(lon, lat, data.grid.transform, data.grid.crs);
    const col = Math.round(c), row = Math.round(r);
    if (col < 0 || row < 0 || col >= data.grid.width || row >= data.grid.height) { setSelected(null); return; }
    setSelected({ col, row });
  }, [data]);

  const onMarkerClick = useCallback((id: string) => {
    if (!data || !id.startsWith('ref:')) return;
    const p = data.points[id.slice(4)];
    if (p) onMapClick(p.lat, p.lon);
  }, [data, onMapClick]);

  const onMove = useCallback((lat: number, lon: number) => {
    if (coordRef.current) coordRef.current.textContent = `${lat.toFixed(5)}°, ${lon.toFixed(5)}°`;
  }, []);

  // ------------------------------------------------------------------ exportación
  const base = slug(props.title);
  const summary = useCallback((): GeoSummary => ({
    title: props.title, objective: props.objective, date: new Date().toISOString().slice(0, 10),
    crs: data?.grid.crs ?? '', resM: data?.grid.resM ?? 0, width: data?.grid.width ?? 0, height: data?.grid.height ?? 0,
    cr: weightResult.agg.cr, nExperts: expertIds.length,
    weightsOrigin: exploring ? 'Pesos explorados manualmente (NO son los del panel)' : expertIds.length ? 'Panel de expertos (AHP, media geométrica)' : 'Pesos iguales (sin juicios de expertos)',
    criteria: criteria.map((c, i) => { const r = geo.rules[c.id]; return { name: c.name, weight: weights[i] ?? 0, effective: r ? effW[c.id] ?? 0 : 0, layer: r ? (data?.info[r.layerKey]?.label ?? r.layerKey) : '—', rule: r ? describeFn(r.fn) : '—', veto: describeVeto(r?.veto) }; }),
    thresholds, coverage,
    classes: stats ? [
      { label: 'Alta aptitud', ha: stats.alta.ha, pct: stats.alta.pct }, { label: 'Moderada', ha: stats.media.ha, pct: stats.media.pct },
      { label: 'No apta / vetada', ha: stats.noapta.ha, pct: stats.noapta.pct }, { label: 'Exclusión (fuera del cálculo)', ha: stats.excl.ha, pct: 0 },
    ] : [],
    layers: data ? Object.entries(data.info).map(([k, l]) => ({ key: k, label: l.label, role: l.role, origin: l.origin ?? 'Paquete del catálogo', source: l.source ?? '', unit: l.unit, min: l.min, max: l.max })) : [],
  }), [props.title, props.objective, data, weightResult, expertIds.length, exploring, criteria, geo.rules, weights, thresholds, stats, effW, coverage]);

  async function framePng(withBase: boolean): Promise<HTMLCanvasElement> {
    if (!data || !ev || !om || !stats) throw new Error('No hay mapa que exportar.');
    let cv: HTMLCanvasElement;
    let attribution = 'Mapa: solo resultado';
    if (withBase && mapRef.current) {
      cv = await mapRef.current.capture();
      attribution = `Base: ${BASEMAPS[basemap].attr}`;
    } else {
      return toCanvas(om, paintResult(ev.pct, ev.cls, data.mask, style, palette));
    }
    const ctx = cv.getContext('2d')!;
    const W = cv.width, H = cv.height, f = Math.max(1, Math.round(W / 900));
    ctx.font = `700 ${16 * f}px system-ui, sans-serif`;
    const tw = Math.min(W - 24 * f, ctx.measureText(props.title).width + 28 * f);
    ctx.fillStyle = 'rgba(11,15,23,.82)'; ctx.fillRect(12 * f, 12 * f, tw, 50 * f);
    ctx.fillStyle = '#fff'; ctx.fillText(props.title, 24 * f, 34 * f, tw - 24 * f);
    ctx.font = `500 ${11 * f}px system-ui, sans-serif`; ctx.fillStyle = '#CBD5E1';
    ctx.fillText(`Índice de idoneidad AHP + SIG · ${new Date().toLocaleDateString('es-CO')}`, 24 * f, 52 * f, tw - 24 * f);
    const rows = [[CLASS_ALTA, `Alta aptitud (≥ ${Math.round(thresholds.alta * 100)}) · ${stats.alta.pct.toFixed(1)} %`], [CLASS_MODERADA, `Moderada · ${stats.media.pct.toFixed(1)} %`], [CLASS_NO_APTA, `No apta · ${stats.noapta.pct.toFixed(1)} %`], [CLASS_EXCLUDED, 'Exclusión']] as const;
    const rampH = style === 'continuous' ? 34 : 0;
    const lw = 230 * f, lh = (rows.length * 20 + 16 + rampH) * f;
    ctx.fillStyle = 'rgba(11,15,23,.82)'; ctx.fillRect(W - lw - 12 * f, H - lh - 12 * f, lw, lh);
    if (rampH) {
      // Resultado continuo: la leyenda de clases sola no explica los colores del mapa, se añade la rampa 0–100.
      const gx = W - lw - 2 * f, gw = lw - 20 * f, gy = H - lh - 4 * f;
      const grad = ctx.createLinearGradient(gx, 0, gx + gw, 0);
      PALETTES[palette].stops.forEach(([t, c]) => grad.addColorStop(t, `rgb(${c[0]},${c[1]},${c[2]})`));
      ctx.fillStyle = grad; ctx.fillRect(gx, gy, gw, 10 * f);
      ctx.fillStyle = '#E2E8F0'; ctx.font = `500 ${10 * f}px system-ui, sans-serif`;
      ctx.fillText('0', gx, gy + 22 * f); ctx.fillText('50', gx + gw / 2 - 6 * f, gy + 22 * f); ctx.fillText('100 (idoneidad)', gx + gw - 74 * f, gy + 22 * f);
    }
    rows.forEach(([c, txt], i) => {
      const y0 = H - lh - 4 * f + (rampH + i * 20) * f;
      ctx.fillStyle = HEX[c]; ctx.fillRect(W - lw - 2 * f, y0, 14 * f, 14 * f);
      ctx.fillStyle = '#fff'; ctx.font = `500 ${12 * f}px system-ui, sans-serif`; ctx.fillText(txt, W - lw + 18 * f, y0 + 11 * f);
    });
    ctx.fillStyle = 'rgba(11,15,23,.7)'; ctx.fillRect(0, H - 16 * f, Math.min(W - lw - 20 * f, 520 * f), 16 * f);
    ctx.fillStyle = '#E2E8F0'; ctx.font = `${9 * f}px system-ui, sans-serif`; ctx.fillText(attribution, 6 * f, H - 5 * f);
    return cv;
  }

  const geotiffPct = async () => { const g = data!.grid; saveBytes(`${base}_idoneidad.tif`, await toGeoTiff(resultRaster(ev!.pct, ev!.cls, data!.mask, 'pct'), g, 255), 'image/tiff'); saveBytes(`${base}_idoneidad.qml`, qmlPct(palette), 'text/xml'); };
  const geotiffCls = async () => { const g = data!.grid; saveBytes(`${base}_clases.tif`, await toGeoTiff(resultRaster(ev!.pct, ev!.cls, data!.mask, 'classes'), g, 255), 'image/tiff'); saveBytes(`${base}_clases.qml`, qmlClasses(palette), 'text/xml'); };
  const pngMap = async () => {
    try { saveBytes(`${base}_mapa.png`, await canvasBytes(await framePng(true)), 'image/png'); }
    catch (e) {
      if (e instanceof DOMException && e.name === 'SecurityError') { saveBytes(`${base}_resultado.png`, await canvasBytes(await framePng(false)), 'image/png'); throw new Error('El navegador bloqueó copiar el mapa base; se descargó solo el resultado (con transparencia).'); }
      throw e;
    }
  };
  const pngOnly = async () => saveBytes(`${base}_resultado.png`, await canvasBytes(await framePng(false)), 'image/png');
  const kmzOne = async () => {
    const g = buildOverlayMap(data!.grid, 'geographic');
    saveBytes(`${base}.kmz`, kmz(props.title, g.bounds, await canvasBytes(toCanvas(g, paintResult(ev!.pct, ev!.cls, data!.mask, style, palette)))), 'application/vnd.google-earth.kmz');
  };
  const parcelsTif = async () => { saveBytes(`${base}_parcelas.tif`, await toGeoTiff(Uint16Array.from(parcelRes!.labels), data!.grid, 0), 'image/tiff'); };
  const parcelsFile = async () => saveBytes(`${base}_parcelas.csv`, parcelsCsv(parcelRes!.parcels, data!.grid), 'text/csv');
  const csv = async () => saveBytes(`${base}_pixeles.csv`, pixelsCsv(ev!.pct, ev!.cls, data!.mask, data!.grid), 'text/csv');
  const xlsx = async () => saveBytes(`${base}_resumen.xlsx`, await downloadGeoExcelBytes(summary()), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const zip = async () => {
    const g = data!.grid; const files: Record<string, Uint8Array | string> = {};
    files['idoneidad.tif'] = await toGeoTiff(resultRaster(ev!.pct, ev!.cls, data!.mask, 'pct'), g, 255); files['idoneidad.qml'] = qmlPct(palette);
    files['clases.tif'] = await toGeoTiff(resultRaster(ev!.pct, ev!.cls, data!.mask, 'classes'), g, 255); files['clases.qml'] = qmlClasses(palette);
    const used = new Set<string>();
    for (const [k, l] of Object.entries(data!.layers)) {
      let nm = safeName(k); for (let n = 2; used.has(nm); n++) nm = `${safeName(k)}_${n}`; used.add(nm);
      const c = new Float32Array(l); for (let i = 0; i < c.length; i++) if (Number.isNaN(c[i])) c[i] = -9999; files[`capas/${nm}.tif`] = await toGeoTiff(c, g, -9999);
    }
    try { files['mapa.png'] = await canvasBytes(await framePng(true)); } catch { files['resultado.png'] = await canvasBytes(await framePng(false)); }
    const og = buildOverlayMap(g, 'geographic');
    files['google-earth.kmz'] = kmz(props.title, og.bounds, await canvasBytes(toCanvas(og, paintResult(ev!.pct, ev!.cls, data!.mask, style, palette))));
    if (parcelRes?.parcels.length) { files['parcelas.tif'] = await toGeoTiff(Uint16Array.from(parcelRes.labels), g, 0); files['parcelas.csv'] = parcelsCsv(parcelRes.parcels, g); }
    files['pixeles.csv'] = pixelsCsv(ev!.pct, ev!.cls, data!.mask, g);
    files['resumen.xlsx'] = await downloadGeoExcelBytes(summary());
    const s = summary();
    files['receta.json'] = JSON.stringify({ ...s, grid: g, rules: geo.rules, layerMeta: Object.fromEntries(Object.entries(geo.layers ?? {}).map(([k, m]) => [k, { ...m, path: undefined }])), pack: geo.packId ?? null }, null, 2);
    files['LEEME.txt'] = `Mapa de aptitud «${props.title}»\n\n- idoneidad.tif: índice 0–100 (255 = sin dato: fuera del área, exclusión o sin dato en todos los criterios) en ${g.crs}, ${g.resM} m/celda.\n- clases.tif: 3 = alta, 2 = moderada, 1 = no apta, 4 = vetada, 0 = exclusión (255 = fuera del área o sin dato).\n- *.qml: estilo para QGIS (Capa → Propiedades → Simbología → Estilo → Cargar estilo).\n- capas/: cada capa de entrada ya alineada a la grilla (Float32, -9999 = sin dato).\n- google-earth.kmz, mapa.png, pixeles.csv, resumen.xlsx, receta.json.\n\nEl índice de idoneidad NO es una probabilidad.\n`;
    saveBytes(`${base}_paquete.zip`, zipFiles(files), 'application/zip');
  };

  // ------------------------------------------------------------------ publicar
  const resultSig = useMemo(() => {
    const str = JSON.stringify([weightResult.agg.w.map((w) => Math.round(w * 1e6)), geo.rules, thresholds, layersSig, geo.packId ?? '']);
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }, [weightResult, geo.rules, thresholds, layersSig, geo.packId]);

  async function buildPublish() {
    if (!data || !ev || !stats || !gridBounds) throw new Error('No hay mapa que publicar.');
    const b64 = await encodePlanes(ev.pct, ev.cls, data.mask);
    const meta: PublishedMeta = {
      v: 1, grid: data.grid, bounds: gridBounds,
      // Pesos EFECTIVOS (reescalados entre los criterios con mapa, suman 1): son los que produjeron el mapa publicado.
      weights: criteria.filter((c) => geo.rules[c.id] && data.layers[geo.rules[c.id].layerKey]).map((c) => ({ name: c.name, weight: effW[c.id] ?? 0 })),
      cr: weightResult.agg.cr, nExperts: expertIds.length,
      weightsOrigin: expertIds.length ? 'Panel de expertos (AHP)' : 'Pesos iguales (sin juicios de expertos)',
      thresholds, classes: { alta: stats.alta.ha, media: stats.media.ha, noapta: stats.noapta.ha, excl: stats.excl.ha },
      pct: { alta: stats.alta.pct, media: stats.media.pct, noapta: stats.noapta.pct }, evaluableHa: stats.evaluableHa,
      attribution: data.attribution, sig: resultSig,
      ahp: ahpSummary(criteria, weightResult) ?? undefined,
    };
    return { b64, meta };
  }

  // ------------------------------------------------------------------ estado / checklist
  const critLayers = data ? Object.values(data.info).filter((l) => l.role === 'criterion').length : 0;
  const rulesReady = criteria.filter((c) => geo.rules[c.id] && data?.layers[geo.rules[c.id].layerKey]).length;
  const hasArea = !!(geo.packId || geo.grid);
  const untouched = criteria.every((c) => /^Criterio \d+$/.test(c.name));
  const empty = !hasArea && untouched;
  const ready = !!(data && ev && stats && rules.length > 0);

  // Leyenda de la capa que queda encima de las demás (diferencia > parcelas > última capa visible), además de la del resultado.
  const extraLegend = useMemo<LayerLegendSpec | null>(() => {
    if (!data) return null;
    const top = onIds.includes('diff') ? 'diff' : onIds.includes('parcels') ? 'parcels' : [...onIds].reverse().find((id) => id.startsWith('l:'));
    if (top === 'diff') return { kind: 'diff', label: `Diferencia con el escenario ${baseline?.label ?? ''}` };
    if (top === 'parcels') return { kind: 'parcels', label: `Parcelas ≥ ${minPatchHa} ha`, color: '#6D28D9' };
    if (!top) return null;
    const k = top.slice(2), info = data.info[k];
    if (!info) return null;
    if (info.role === 'exclusion') return { kind: 'flag', label: info.label, color: '#7F8C8D', what: 'Zona de exclusión: no entra al cálculo' };
    if (info.role === 'area') return { kind: 'flag', label: info.label, color: '#84CC16', what: 'Área de estudio: solo aquí se calcula' };
    if (Object.values(geo.rules).some((r) => r.layerKey === k)) return { kind: 'criterion', label: `Idoneidad parcial · ${info.label}` };
    return { kind: 'raw', label: info.label, unit: info.unit, min: info.min, max: info.max };
  }, [data, onKey, baseline, minPatchHa, geo.rules]); // eslint-disable-line react-hooks/exhaustive-deps
  const resultOn = onIds.includes('result');

  return (
    <div className="gv-shell" style={paletteVars(palette)}>
      <GeoTour steps={TOUR} open={tour} onClose={() => setTour(false)} onTab={setTab} />
      <aside className="gv-side">
        <div className="gv-steps-bar" aria-label="Progreso">
          <span className={hasArea ? 'ok' : ''}><Icon d={hasArea ? ICONS.check : ICONS.minus} size={12} /> Área</span>
          <span className={critLayers ? 'ok' : ''}><Icon d={critLayers ? ICONS.check : ICONS.minus} size={12} /> Capas {critLayers}</span>
          <span className={criteria.length && rulesReady === criteria.length ? 'ok' : ''}><Icon d={criteria.length && rulesReady === criteria.length ? ICONS.check : ICONS.minus} size={12} /> Reglas {rulesReady}/{criteria.length}</span>
          <span className={expertIds.length ? 'ok' : ''}><Icon d={expertIds.length ? ICONS.check : ICONS.minus} size={12} /> Pesos {expertIds.length ? `(${expertIds.length} exp.)` : ''}</span>
        </div>
        <div className="gv-tabs" role="tablist">
          {(['capas', 'modelo', 'exportar'] as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{{ capas: 'Capas', modelo: 'Modelo', exportar: 'Exportar' }[t]}</button>
          ))}
        </div>
        <div className="gv-side-body">
          {lost > 0 && (
            <div className="banner" role="alert"><span>{lost} capa(s) no se pudieron recuperar (se añadieron en una sesión sin guardar o no se pudieron descargar). Los criterios que dependen de ellas no entran al mapa hasta que las vuelvas a subir.{layerErrs.length > 0 && <> Detalle: {layerErrs.join(' · ')}</>}</span></div>
          )}
          {error && <div className="banner"><span><b>No se pudo cargar:</b> {error}</span></div>}
          {tab === 'capas' && (
            <GeoLayersPanel geo={geo} data={data} criteria={criteria} commit={commit} cache={cache} sb={supabase} ownerId={props.ownerId} projectId={props.projectId}
              vecs={vecs} setVecs={setVecs} vis={vis} setVis={setVis} fit={(b) => mapRef.current?.fit(b)} getView={() => mapRef.current?.getBounds() ?? null} palette={palette} draft={draft} setDraft={setDraft} drawing={drawing} setDrawing={setDrawing}
              quota={quota} onQuotaChange={refreshQuota}
              uploadFor={uploadFor} onCancelUpload={() => setUploadFor(null)} onLayerAdded={(id) => { setUploadFor(null); setFocusId(id); setTab('modelo'); }}
              virtual={[...(parcelRes ? [{ id: 'parcels', label: `Parcelas ≥ ${minPatchHa} ha`, role: `${parcelRes.parcels.length} parcelas`, swatch: '#6D28D9' }] : []), ...(baseline ? [{ id: 'diff', label: `Diferencia con el escenario ${baseline.label}`, role: palette === 'semaforo' ? 'rojo empeora · verde mejora' : 'naranja empeora · azul mejora', swatch: `linear-gradient(90deg, rgb(${PALETTES[palette].diffNeg.join(',')}), #eee, rgb(${PALETTES[palette].diffPos.join(',')}))` }] : [])]} />
          )}
          {tab === 'modelo' && (
            <GeoModelPanel isPack={!!geo.packId} onUploadFor={(id) => { setFocusId(null); setUploadFor(id); setTab('capas'); }} focusId={focusId} criteria={criteria} weights={weightResult.agg.w} cr={weightResult.agg.cr} nExperts={expertIds.length} layers={data?.info ?? {}} rules={geo.rules}
              onRule={(id, rule) => commit((c) => { const r = { ...c.rules }; if (rule) r[id] = rule; else delete r[id]; return { ...c, rules: r }; })}
              thresholds={thresholds} onThresholds={(c) => { setThresholds(c); commit((g) => ({ ...g, classes: c })); }}
              exploring={exploring} exploreWeights={exploreWeights} onExplore={(on, w) => { setExploring(on); setExploreWeights(w ?? null); }}
              minPatchHa={minPatchHa} onMinPatch={(ha) => { setMinPatchHa(ha); commit((g) => ({ ...g, minPatchHa: ha })); }}
              parcels={parcelRes?.parcels ?? null}
              onFlyTo={(col, row) => { if (data) { const [lon, lat] = pixelToLonLat(col, row, data.grid.transform, data.grid.crs); mapRef.current?.flyTo(lat, lon, 12); } }}
              stats={stats} baseline={baseline ? { label: baseline.label, stats: baseline.stats } : null}
              onSaveBaseline={(label) => { if (ev && stats) { setBaseline({ label, pct: ev.pct.slice(), stats }); setVis((v) => ({ ...v, diff: { on: true, op: 0.9 } })); } }}
              onClearBaseline={() => setBaseline(null)} />
          )}
          {tab === 'exportar' && (
            <div className="gv-sec-stack">
              {!ready && <p className="gv-hint">Para exportar hace falta un mapa calculado: define el área, sube capas y asígnalas a criterios con su regla.</p>}
              {props.share && (
                <GeoPublishPanel sb={supabase} projectId={props.projectId} isPublic={props.share.isPublic} token={props.share.token} onTogglePublic={props.share.onTogglePublic}
                  ready={ready} exploring={exploring} sig={resultSig} build={buildPublish}
                  warn={expertIds.length > 0 && weightResult.agg.cr >= 0.1 ? `Los juicios de los expertos son inconsistentes (CR ${weightResult.agg.cr.toFixed(3)} ≥ 0.10): los pesos no son confiables. La vista pública mostrará el CR, pero conviene corregirlos antes de publicar.` : undefined} />
              )}
              {isAdmin && supabase && !geo.packId && (
                <GeoCatalogPanel sb={supabase} userId={props.ownerId} title={props.title} objective={props.objective} criteria={criteria} geo={geo} cache={cache} ready={ready && !!geo.grid} />
              )}
              <ExportList disabled={!ready} items={[
                { k: 'zip', label: 'Paquete completo (.zip)', desc: 'Todo lo de abajo + cada capa de entrada como GeoTIFF + receta JSON. Lo que entregas al docente o abres en QGIS.', run: zip, primary: true },
                { k: 'tif', label: 'GeoTIFF de idoneidad (0–100) + estilo .qml', desc: `Ráster georreferenciado en ${data?.grid.crs ?? 'UTM'}. Ábrelo en QGIS/ArcGIS y carga el .qml para los colores.`, run: geotiffPct },
                { k: 'cls', label: 'GeoTIFF de clases + estilo .qml', desc: '3 alta · 2 moderada · 1 no apta · 4 vetada · 0 exclusión. Ideal para calcular áreas o vectorizar en QGIS.', run: geotiffCls },
                { k: 'png', label: 'PNG del mapa (con mapa base y leyenda)', desc: 'La vista actual tal como la ves, con título y leyenda, lista para tu informe.', run: pngMap },
                { k: 'pngr', label: 'PNG solo del resultado (transparente)', desc: 'Únicamente los píxeles, sin mapa base: para superponer en tu propio diseño.', run: pngOnly },
                { k: 'kmz', label: 'KMZ para Google Earth', desc: 'El resultado como imagen georreferenciada sobre el globo.', run: kmzOne },
                ...(parcelRes?.parcels.length ? [
                  { k: 'ptif', label: `GeoTIFF de parcelas (≥ ${minPatchHa} ha)`, desc: 'Cada parcela contigua de alta aptitud con su número (0 = ninguna). Ábrelo en QGIS y vectorízalo.', run: parcelsTif },
                  { k: 'pcsv', label: 'CSV de parcelas', desc: 'Número, hectáreas, idoneidad media y mínima y centroide (lon, lat) de cada parcela.', run: parcelsFile },
                ] : []),
                { k: 'csv', label: 'CSV de píxeles (lon, lat, %, clase)', desc: 'Importable como puntos en QGIS o Excel (máx. ~200 000 filas).', run: csv },
                { k: 'xls', label: 'Excel de resumen', desc: 'Pesos, reglas, superficie por clase y datos de las capas.', run: xlsx },
              ]} />
            </div>
          )}
        </div>
      </aside>

      <section className="gv-main">
        <div className="gv-stage">
          <GeoMap ref={mapRef} basemap={basemap} rasters={rasters} vectors={vectors} markers={markers} draft={draft} drawing={drawing}
            initialBounds={gridBounds} onClick={onMapClick} onMove={onMove} onMarkerClick={onMarkerClick}
            onDrawn={(b) => { setDraft(b); setDrawing(false); }} />

          <div className="gv-hud gv-hud-tr">
            <BasemapChips value={basemap} onChange={setBasemap} />
            <StyleChips value={style} onChange={setStyle} />
            <PaletteChips value={palette} onChange={setPalette} />
            <button type="button" className="gv-fit" onClick={() => setTour(true)} title="Repetir el recorrido guiado"><span aria-hidden="true">?</span> Recorrido</button>
            {gridBounds && <button type="button" className="gv-fit" onClick={() => mapRef.current?.fit(gridBounds)} title="Encajar el área de estudio"><Icon d={ICONS.fit} size={15} /> Área</button>}
          </div>

          <div className="gv-coords mono"><span ref={coordRef}>—</span></div>

          {loading && <div className="gv-toast" role="status">Cargando capas… {Math.round(progress * 100)}%</div>}
          {!ready && data && !loading && <div className="gv-toast" role="status">Asigna capas a tus criterios (pestaña Modelo) para ver el resultado.</div>}

          {(extraLegend || (ready && resultOn)) && (
            <div className="gv-legends">
              {extraLegend && <LayerLegend spec={extraLegend} palette={palette} />}
              {ready && resultOn && <ResultLegend style={style} thresholds={thresholds} palette={palette} />}
            </div>
          )}

          {point && (
            <div className="gv-point" role="status">
              <button type="button" className="x" aria-label="Cerrar" onClick={() => setSelected(null)}>×</button>
              <div className="big">{point.pct === null ? '—' : `${point.pct}%`}</div>
              <span className="cls-pill" style={{ background: `color-mix(in srgb, ${HEX[point.cls]} 22%, transparent)`, borderColor: HEX[point.cls] }}>
                <span className="dot" style={{ background: HEX[point.cls] }} />{point.label}
              </span>
              <div className="coords mono">{point.lat.toFixed(5)}, {point.lon.toFixed(5)}</div>
              <div className="tbl">
                {point.rows.map((r) => (
                  <div className={'r' + (r.veto ? ' veto' : '')} key={r.label}>
                    <span className="rl"><span className="k">{r.label}</span><span className="pv">{r.value}</span></span>
                    <span className="pc">{r.contrib}</span>
                  </div>
                ))}
              </div>
              <div className="disc">Índice de idoneidad 0–100, no una probabilidad. Con el mapa enfocado, Intro consulta el punto central.</div>
            </div>
          )}

          {empty && !loading && (
            <div className="gv-empty">
              <h3>Tu mapa de aptitud</h3>
              <p>Combina mapas (distancias, temperatura, profundidad, pendiente…) con los pesos de tus expertos para encontrar dónde es mejor ubicar algo: una boya, una finca solar, un cultivo.</p>
              <div className="gv-empty-acts">
                {props.examples.map((ex) => (
                  <button key={ex.id} type="button" className="gv-ex" onClick={() => props.onApplyExample(ex.id)}>
                    <b>{ex.label}{ex.source === 'catalog' && <em className="gv-tag">del curso</em>}</b><span>{ex.blurb}</span>
                  </button>
                ))}
              </div>
              <p className="small">O empieza en blanco: define tus criterios en «Proyecto» y sube tus mapas en la pestaña «Capas».</p>
            </div>
          )}
        </div>

        {stats && ready && (
          <div className="card gv-stats">
            <div className="bars">
              {([[CLASS_ALTA, stats.alta], [CLASS_MODERADA, stats.media], [CLASS_NO_APTA, stats.noapta], [CLASS_EXCLUDED, stats.excl]] as const).map(([c, s]) => (
                <div className="brow" key={c}>
                  <span>{CLASS_LABEL[c]}</span>
                  <span className="bar"><span className="bfill" style={{ width: `${c === CLASS_EXCLUDED ? (stats.totalHa ? (s.ha / stats.totalHa) * 100 : 0) : s.pct}%`, background: HEX[c] }} /></span>
                  <span className="mono">{s.ha.toLocaleString('es-CO', { maximumFractionDigits: 0 })} ha{c === CLASS_EXCLUDED ? '' : ` · ${s.pct.toFixed(1)} %`}</span>
                </div>
              ))}
            </div>
            <div className="muted mono" style={{ fontSize: 12 }}>
              Área evaluada: {stats.evaluableHa.toLocaleString('es-CO', { maximumFractionDigits: 0 })} ha · {data!.grid.resM} × {data!.grid.resM} m por celda{exploring ? ' · con pesos explorados' : ''}{data!.attribution ? ` · Datos: ${data!.attribution}` : ''}{parcelRes ? ` · ${parcelRes.parcels.length} parcela(s) ≥ ${minPatchHa} ha` : ''}
            </div>
            {coverage && coverage.partial > 0 && (
              <div className="gv-hint warn" role="status">
                {((100 * coverage.partial) / Math.max(1, coverage.valid)).toFixed(1)} % de las celdas evaluables no tienen dato en algún criterio (bordes de una capa que no cubre toda el área): allí el índice se calcula con los criterios que sí lo tienen, reescalando sus pesos.
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

type ExportItem = { k: string; label: string; desc: string; run: () => Promise<void>; primary?: boolean };
/** Lista de descargas. El resultado de cada una se muestra en línea (antes los errores salían en un `alert()` y los
 * éxitos no decían nada): así una descarga que falla nunca pasa desapercibida. */
function ExportList({ items, disabled }: { items: ExportItem[]; disabled: boolean }) {
  const [running, setRunning] = useState('');
  const [res, setRes] = useState<{ k: string; ok: boolean; msg: string } | null>(null);
  return (
    <>
      {items.map((it) => (
        <div className={'gv-export' + (it.primary ? ' primary' : '')} key={it.k}>
          <div><b>{it.label}</b><p>{it.desc}</p></div>
          <button type="button" className={'btn sm' + (it.primary ? ' primary' : '')} disabled={disabled || !!running} aria-busy={running === it.k}
            onClick={async () => {
              setRunning(it.k); setRes(null);
              try { await it.run(); setRes({ k: it.k, ok: true, msg: `«${it.label}»: listo, revisa tu carpeta de descargas.` }); }
              catch (e) { setRes({ k: it.k, ok: false, msg: `«${it.label}» no se pudo generar: ${e instanceof Error ? e.message : String(e)}` }); }
              setRunning('');
            }}>
            <Icon d={ICONS.download} size={13} /> {running === it.k ? 'Generando…' : 'Descargar'}
          </button>
        </div>
      ))}
      <p className={'gv-hint' + (res && !res.ok ? ' warn' : '')} role={res && !res.ok ? 'alert' : 'status'} aria-live="polite">{res?.msg ?? ''}</p>
    </>
  );
}

function evaluateOnePoint(data: GeoData, geo: GeoConfig, allRules: CriterionRule[], thr: GeoConfig['classes'], sel: { col: number; row: number }) {
  const i = sel.row * data.grid.width + sel.col;
  const [lon, lat] = pixelToLonLat(sel.col, sel.row, data.grid.transform, data.grid.crs);
  const m = data.mask[i];
  if (m !== MASK_VALID) {
    return { pct: null, cls: CLASS_EXCLUDED, label: m === 2 ? 'Exclusión' : 'Fuera del área de estudio', lat, lon, rows: [] as { label: string; value: string; contrib: string; veto: boolean }[] };
  }
  const rules = usableRules(data.layers, data.mask.length, allRules);
  // Mismo cálculo que `evaluatePixel`: los criterios sin dato en este punto no votan y los pesos se reescalan entre los que sí.
  const wUsed = rules.reduce((a, r) => (Number.isNaN(data.layers[r.key][i]) ? a : a + r.weight), 0);
  let sum = 0, anyVeto = false;
  const rows = rules.map((r) => {
    const info = data.info[r.key];
    const x = data.layers[r.key][i];
    const s = suitability(x, r.fn);
    const veto = vetoed(x, r.veto);
    if (veto) anyVeto = true;
    const wn = wUsed > 0 ? r.weight / wUsed : 0;
    if (!Number.isNaN(x)) sum += wn * s;
    const value = Number.isNaN(x) ? 'sin dato' : `${Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(2)} ${info?.unit ?? ''}`.trim();
    return { label: info?.label ?? r.key, value, contrib: Number.isNaN(x) ? 'no vota' : `${s.toFixed(2)} × ${wn.toFixed(2)}${veto ? ' · VETO' : ''}`, veto };
  });
  const s = wUsed <= 0 ? NaN : anyVeto ? 0 : sum;
  const cls = Number.isNaN(s) ? CLASS_EXCLUDED : anyVeto ? CLASS_VETO : s >= thr.alta ? CLASS_ALTA : s >= thr.media ? CLASS_MODERADA : CLASS_NO_APTA;
  void geo;
  return { pct: Number.isNaN(s) ? null : Math.round(s * 100), cls, label: Number.isNaN(s) ? 'Sin dato' : CLASS_LABEL[cls], lat, lon, rows };
}
