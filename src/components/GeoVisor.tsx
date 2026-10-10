'use client';

/** Geovisor AHP + SIG (`kind:'spatial'`, ver docs/PLAN_geovisor_ahp_sig.md). Mapa web real
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
import { PALETTES, classHexOf, paintCriterion, paintDiff, paintFlag, paintParcels, paintRaw, modelRampColor, modelRampCss, modelRampHex, paintResult, type PaletteKey } from '@/lib/geo/paint';
import { DIR_TEXT, applySetup, classLabel, classRange, classSigValue, publishClassSig, resolveModel, setupFromGeo, type ClassSetup, type CutMode } from '@/lib/geo/classes';
import { normalizeBreaks } from '@/lib/geo/classes';
import { histogram, jenksBreaks, quantileBreaks } from '@/lib/geo/cuts';
import { findParcels } from '@/lib/geo/patches';
import { evaluateOnePoint, type PointEval } from '@/lib/geo/pointEval';
import { describeFn, describeVeto, suitability, vetoed } from '@/lib/geo/membership';
import { downloadLayer, getQuota, type Quota } from '@/lib/geo/store';
import { downloadRef, nameFields } from '@/lib/geo/refLayer';
import { buildZoneGrid, cellOf, defaultZoneOrder, toPublishedZones, zonalStats, zoneOrderHeading, zonesCsv } from '@/lib/geo/zonal';
import { exposure, populationPoints } from '@/lib/geo/population';
import { fcBounds, numericFields } from '@/lib/geo/vector';
import { CAT_PREFIX, getCatalogRow, loadCatalogLayer } from '@/lib/geo/catalog';
import { ahpSummary } from '@/lib/geo/ahpSummary';
import { encodePlanes, type PublishedMeta } from '@/lib/geo/publish';
import { publishParts } from '@/lib/geo/publishSig';
import type { Example } from '@/lib/geo/examples';
import GeoSharePanel from './GeoSharePanel';
import { createPortal } from 'react-dom';
import GeoCatalogPanel from './GeoCatalogPanel';
import { exportGroups, type ExportGroup, type ExportKey, type ExportSpec } from '@/lib/geo/share';
import './geo-share.css';
import GeoTour, { tourSeen, type TourStep } from './GeoTour';
import {
  classStats, classify, CLASS_EXCLUDED, CLASS_VETO, coverageStats, evaluateIndex, type ClassStats, type CriterionRule,
} from '@/lib/geo/suitability';
import { kmz, parcelsCsv, pixelsCsv, qmlClasses, qmlPct, resultRaster, safeName, slug, toGeoTiff, zipFiles } from '@/lib/geo/export';
import { downloadGeoExcelBytes, type GeoSummary } from '@/lib/geoExcel';
import type { Criterion, ExpertRow, GeoConfig, GeoLayerMeta } from '@/lib/types';
import { evaluateLonLat, MAX_POINTS, newPointId, nextPointName, pointState, rankHeading, rankingCsv, rankPoints, round6, sanitizePoints, toPublishedPoints, type GeoPoint } from '@/lib/geo/points';
import GeoMap, { BASEMAPS, type BasemapKey, type GeoMapHandle, type MapMarker, type PointMark, type RasterOverlay, type VectorOverlay } from './GeoMap';
import GeoLayersPanel, { type VecItem, type VisState } from './GeoLayersPanel';
import GeoModelPanel from './GeoModelPanel';
import type { LabelMode } from '@/lib/geo/pointLabels';
import PointFicha from './GeoPointFicha';
import GeoPointsPanel from './GeoPointsPanel';
import GeoZonesPanel from './GeoZonesPanel';
import type { ZoneRowView } from './GeoZonesTable';
import type { RankRow } from './GeoPointsList';
import { Icon, ICONS, usePalette } from './GeoBits';
import { BasemapChips, LayerLegend, PaletteChips, ResultLegend, StyleChips, type LayerLegendSpec } from './GeoHud';
import { canvasBytes, saveBytes, toCanvas, toUrl } from '@/lib/geo/canvas';
import { composeFileName, defaultOptions, type ComposeAvailability, type ComposeOptions } from '@/lib/geo/compose';
import { renderComposition, type ComposeInputs } from '@/lib/geo/composeCanvas';
import { jpegToPdf } from '@/lib/geo/pdfImage';
import { buildGeoReport } from '@/lib/geo/report';
import { APP_DOI, APP_FULL_NAME, APP_VERSION } from '@/lib/version';
import GeoComposeDialog from './GeoComposeDialog';
import GeoReportModal from './GeoReportModal';

type Props = {
  projectId: string; ownerId: string; title: string; objective: string;
  criteria: Criterion[]; experts: ExpertRow[]; idx: JIndex; geo: GeoConfig;
  supabase: SupabaseClient | null;
  onChangeGeo: (g: GeoConfig, immediate?: boolean) => void;
  examples: Example[];
  onApplyExample: (id: string) => void;
  /** Publicación: la tarjeta de «Compartir» se pinta con un portal en `slot` (contenedor de la pestaña Compartir del
   * proyecto) porque necesita el mapa calculado, que vive aquí.
   * El geovisor se oculta (no se desmonta) mientras la pestaña es Compartir. */
  share: {
    isPublic: boolean; token: string; onTogglePublic: (on: boolean) => void;
    slot: HTMLElement | null; away: boolean; fileBase: string;
    onGoExperts: () => void; onPrioExcel: () => void;
  } | null;
};

type Tab = 'capas' | 'modelo' | 'puntos' | 'zonas' | 'exportar';

const TOUR: TourStep[] = [
  { sel: '.gv-steps-bar', tab: 'capas', title: 'Cuatro pasos', text: 'Área → Capas → Reglas → Pesos. Cada marca se pone verde cuando ese paso está listo. Los pesos vienen de tus expertos (pestaña «Expertos» del proyecto).' },
  { sel: '.gv-drop, .gv-sec', tab: 'capas', title: 'Sube tus mapas', text: 'Arrastra GeoTIFF, GeoJSON, shapefile en .zip, KML o GPX. El área de estudio se propone sola desde el primer archivo. Cada archivo puede ser un criterio, una exclusión o el área de estudio.' },
  { sel: '.gv-side-body', tab: 'modelo', title: 'Pesos y reglas', text: 'Aquí ves los pesos del panel y, por cada criterio, eliges la capa y la regla que la traduce a idoneidad (0 a 1), con vista previa. El mapa cambia en vivo.' },
  { sel: '.gv-leaflet', title: 'El mapa', text: 'Muévete y acerca como en cualquier mapa. Haz clic en un punto para ver su % de idoneidad, su clase y cuánto aporta cada criterio.' },
  { sel: '.gv-hud-tr', title: 'Mapa base y estilo', text: 'Cambia el mapa base (satélite, calles, relieve, océano) y muestra el resultado continuo o por clases.' },
  { sel: '.gv-side-body', tab: 'exportar', title: 'Exportar y publicar', text: 'GeoTIFF (con estilo para QGIS), PNG, KMZ, CSV, Excel y un .zip con todo. Aquí también activas la vista pública con enlace.' },
];
type Deps = unknown[];
/** Variables CSS de clase según la paleta: así los recuadros de color de los paneles (`--geo-alta`…) siguen a la del mapa. */
const paletteVars = (hex: Record<number, string>, n: number, risk: boolean) => {
  // `--geo-alta` = el color «bueno» y `--geo-noapta` = el «malo» de la dirección (aptitud: clase alta = bueno; riesgo: al revés).
  return {
    '--geo-alta': hex[risk ? 1 : n], '--geo-media': hex[Math.ceil(n / 2)], '--geo-noapta': hex[risk ? n : 1], '--geo-excl': hex[CLASS_EXCLUDED],
  } as React.CSSProperties;
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
  const [vis, setVis] = useState<VisState>({});
  const [vecs, setVecs] = useState<VecItem[]>([]);
  const [selected, setSelected] = useState<{ col: number; row: number } | null>(null);
  // Puntos con ranking: modo «Agregar punto» (explícito), punto resaltado (tabla <-> mapa) y aviso del último intento.
  const [addMode, setAddMode] = useState(false);
  const [selPoint, setSelPoint] = useState<string | null>(null);
  // Etiquetas con el nombre de cada punto en el mapa (apagadas por defecto; la vista pública tiene su propio criterio).
  const [showNames, setShowNames] = useState(false);
  const [nameMode, setNameMode] = useState<LabelMode>('name');
  const [namesTrimmed, setNamesTrimmed] = useState(false);
  // Resumen por zonas: mapa coroplético (color por índice medio) y zona resaltada en la tabla.
  const [choro, setChoro] = useState(false);
  const [selZone, setSelZone] = useState<string | null>(null);
  const [addNote, setAddNote] = useState('');
  // Clases del mapa: dirección + N cortes + nombres/colores (ver lib/geo/classes.ts). Un proyecto antiguo con solo
  // `classes: {alta, media}` se lee como 3 clases de aptitud sin migrar nada.
  const [setup, setSetup] = useState<ClassSetup>(() => setupFromGeo(geo));
  const model = useMemo(() => resolveModel(setup), [setup]);
  const editHex = useMemo(() => classHexOf(model, palette), [model, palette]);
  const [exploring, setExploring] = useState(false);
  const [exploreWeights, setExploreWeights] = useState<number[] | null>(null);
  const [draft, setDraft] = useState<Bounds | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [imgs, setImgs] = useState<Record<string, string>>({});
  const [tour, setTour] = useState(false);
  const [minPatchHa, setMinPatchHa] = useState(geo.minPatchHa ?? 0);
  const [baseline, setBaseline] = useState<{ label: string; pct: Uint8Array; stats: ClassStats } | null>(null);
  // El recorrido automático solo cuando el geovisor está a la vista (montado oculto en «Compartir» no debe abrirse).
  const away = !!props.share?.away;
  useEffect(() => { if (!away && !tourSeen()) { const t = setTimeout(() => setTour(true), 900); return () => clearTimeout(t); } }, [away]);

  const mapRef = useRef<GeoMapHandle>(null);
  const coordRef = useRef<HTMLSpanElement>(null);
  const geoRef = useRef(geo);
  // Al cargar un ejemplo (o abrir otra configuración) los umbrales y el área mínima vienen en `geo`: sin esto la
  // interfaz seguía con los valores del montaje anterior (p. ej. 0.70/0.45 en vez de 0.75/0.25 de la boya).
  const classesKey = JSON.stringify([geo.direction ?? null, geo.classModel ?? null, geo.classes]);
  useEffect(() => { setSetup(setupFromGeo(geoRef.current)); }, [classesKey]);  useEffect(() => { setMinPatchHa(geo.minPatchHa ?? 0); }, [geo.minPatchHa]);
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
  // Editar las clases cambia el mapa solo en la vista «por clases»: si el usuario estaba en «Continuo» (rampa sin
  // cortes) no vería ningún efecto. Se pasa a la vista por clases al editar, para que el cambio se vea.
  const onSetup = useCallback((s: ClassSetup) => { setSetup(s); setStyle('classes'); commit((g) => applySetup(g, s)); }, [commit]);

  // ------------------------------------------------------------------ carga de datos
  const gridSig = geo.grid ? JSON.stringify(geo.grid) : '';
  // Las capas de referencia (polígonos) no alimentan el cálculo: no entran a la firma ni disparan la recarga de rásters.
  const layersSig = geo.packId + '|' + JSON.stringify(Object.entries(geo.layers ?? {}).filter(([, l]) => l.role !== 'reference').map(([k, l]) => [k, l.path, l.role, l.bytes, l.min, l.max]));
  useEffect(() => {
    let alive = true;
    setError('');
    // Descarga (o toma de la caché) las capas de `metas`. La caché la llenan también las cargas en
    // curso (GeoLayersPanel), así que aquí nunca se purga por comparación con `geo.layers` — un render
    // intermedio la vaciaría a mitad de un lote. Borrar una capa o cambiar el área limpia la caché de
    // forma explícita en GeoLayersPanel.
    const load = async (metas: Record<string, GeoLayerMeta>, fetchOne: (m: GeoLayerMeta) => Promise<Float32Array>, cells: number, errs: string[]) => {
      const need = Object.keys(metas).filter((k) => !cache.current[k] && metas[k].path && metas[k].role !== 'reference');
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
        if (m.role === 'reference') continue; // polígonos de referencia: viven en `vecs`, no en la grilla
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
  // Modelo con el que se calculó el mapa que se ve (diferido): leyendas, resumen y exportaciones usan este para que
  // nunca muestren N clases distintas de las que tiene el mapa pintado.
  const dSetup = useDeferredValue(setup);
  const rm = useMemo(() => resolveModel(dSetup), [dSetup]);
  const RHEX = useMemo(() => classHexOf(rm, palette), [rm, palette]);
  const T = DIR_TEXT[rm.direction];

  // Índice (sin clasificar) y clasificación separados: cambiar cortes, nombres o número de clases no reevalúa criterios.
  const ix = useMemo(() => (data ? evaluateIndex(data.layers, data.mask, dRules, rm.direction) : null), [data, dRules, rm.direction]);
  const ev = useMemo(() => (ix ? { pct: ix.pct, cls: classify(ix.s, ix.veto, rm.breaks) } : null), [ix, rm.breaks]);
  const stats = useMemo(() => (data && ev ? classStats(ev.cls, ev.pct, data.mask, data.grid.haPerPixel, rm.n, rm.direction) : null), [data, ev, rm.n, rm.direction]);
  const coverage = useMemo(() => (data ? coverageStats(data.layers, data.mask, dRules) : null), [data, dRules]);
  const dMinPatch = useDeferredValue(minPatchHa);
  const parcelRes = useMemo(() => {
    if (!data || !ev || !(dMinPatch > 0)) return null;
    return findParcels(ev.cls, ev.pct, data.mask, data.grid.width, data.grid.height, Math.ceil(dMinPatch / data.grid.haPerPixel), data.grid.haPerPixel, rm.n);
  }, [data, ev, dMinPatch, rm.n]);
  const om = useMemo(() => (data ? buildOverlayMap(data.grid, 'mercator') : null), [data]);
  const gridBounds = useMemo(() => (data ? gridBoundsLonLat(data.grid) : null), [data]);

  // Encuadra el área cada vez que cambia la grilla (ejemplo cargado, área nueva…).
  const boundsKey = gridBounds ? [gridBounds.west, gridBounds.south, gridBounds.east, gridBounds.north].map((n) => n.toFixed(4)).join(',') : '';
  useEffect(() => { if (gridBounds) setTimeout(() => mapRef.current?.fit(gridBounds), 60); }, [boundsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------ puntos con ranking
  const points = useMemo(() => sanitizePoints(geo.points), [geo.points]);
  // Rótulo de clase: la vetada cuenta en la clase extrema de la dirección (así lo define pointEval) y lleva su insignia aparte.
  const labelOf = useCallback((cls: number) => (cls === CLASS_VETO ? rm.names[rm.direction === 'risk' ? rm.n - 1 : 0] : (rm.names[cls - 1] ?? `Clase ${cls}`)), [rm]);
  // Se evalúa con las reglas diferidas y el modelo diferido, igual que el mapa pintado: el ranking nunca contradice lo que se ve.
  const ranked = useMemo(() => rankPoints(points, (pt) => (data
    ? evaluateLonLat(data, dRules, { breaks: rm.breaks, direction: rm.direction }, pt)
    : { status: 'nodata' as const, s: null, pct: null, cls: 0, vetoed: false, lat: pt.lat, lon: pt.lon, rows: [] }), labelOf), [points, data, dRules, rm, labelOf]);
  const rankRows = useMemo<RankRow[]>(() => ranked.map((r) => ({
    key: r.id, rank: r.rank, name: r.name, lat: r.lat, lon: r.lon, pct: r.pct, label: r.label, status: r.status, vetoed: r.vetoed,
    // «Continuo»: el color que la misma rampa del fondo asigna a su índice (así el punto no desentona con el mapa);
    // «N clases»: el de su clase. El nombre de la clase va siempre en texto (lista, tooltip, ficha).
    color: r.status !== 'ok' ? '#9CA3AF' : style === 'continuous' && r.pct !== null ? modelRampHex(r.pct / 100, rm, palette) : RHEX[r.cls] ?? '#9CA3AF',
  })), [ranked, RHEX, style, rm, palette]);
  const pointMarks = useMemo<PointMark[]>(() => rankRows.map((r) => ({
    id: r.key, lat: r.lat, lon: r.lon, color: r.color, rank: r.rank, name: r.name, pct: r.pct,
    tip: r.status === 'ok' ? `${r.rank}. ${r.name} · ${r.pct} % · ${r.label}${r.vetoed ? ` (${T.critical})` : ''}` : `${r.name} · ${r.label}`,
  })), [rankRows, T]);
  // Ficha de un punto de la lista (expansión en línea): el mismo cálculo y la misma presentación que la consulta del mapa.
  // Se evalúa solo el punto abierto, con las reglas y el modelo diferidos igual que el ranking.
  const renderPointDetail = useCallback((r: RankRow) => {
    if (!data) return null;
    const e = evaluateLonLat(data, dRules, { breaks: rm.breaks, direction: rm.direction }, { lat: r.lat, lon: r.lon });
    return <PointFicha pct={r.pct} label={r.label} color={r.status === 'ok' ? r.color : undefined} lat={r.lat} lon={r.lon} rows={e.rows} vetoLabel={r.vetoed ? T.critical : undefined} variant="inline" />;
  }, [data, dRules, rm, T]);
  const setPoints = useCallback((next: GeoPoint[]) => commit((g) => { const o = { ...g }; if (next.length) o.points = next; else delete o.points; return o; }), [commit]);
  // El modo «Agregar punto» no sobrevive a salir de la pestaña ni a Esc: un clic perdido no debe crear puntos.
  useEffect(() => { if (tab !== 'puntos') setAddMode(false); }, [tab]);
  useEffect(() => {
    if (!addMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAddMode(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [addMode]);
  useEffect(() => { if (addMode) { setAddNote(''); setSelected(null); } }, [addMode]);

  // ------------------------------------------------------------------ resumen por zonas
  const zoneLayers = useMemo(() => vecs.filter((v) => v.ref).map((v) => ({ key: v.id, label: geo.layers?.[v.id]?.label ?? v.name, count: v.fc.features.length, fields: nameFields(v.fc), numFields: numericFields(v.fc) })), [vecs, geo.layers]);
  const zoneVec = useMemo(() => (geo.zonal ? vecs.find((v) => v.ref && v.id === geo.zonal!.layer) ?? null : null), [vecs, geo.zonal]);
  const zoneGrid = useMemo(() => (zoneVec && data ? buildZoneGrid(zoneVec.fc, data.grid, geo.zonal?.nameField) : null), [zoneVec, data, geo.zonal?.nameField]);
  const zoneStats = useMemo(() => {
    if (!zoneGrid || !data || !ev) return null;
    const pointCells = points.map((p) => cellOf(data.grid, p.lon, p.lat));
    return zonalStats({ zones: zoneGrid, pct: ev.pct, cls: ev.cls, mask: data.mask, haPerPixel: data.grid.haPerPixel, nClasses: rm.n, direction: rm.direction, pointCells });
  }, [zoneGrid, data, ev, rm.n, rm.direction, points]);
  // Población (opcional): cada polígono con valor se asigna entero a la celda de su centroide.
  const popVec = useMemo(() => (geo.zonal?.popLayer && geo.zonal.popField ? vecs.find((v) => v.ref && v.id === geo.zonal!.popLayer) ?? null : null), [vecs, geo.zonal]);
  const popPts = useMemo(() => (popVec && geo.zonal?.popField ? populationPoints(popVec.fc, geo.zonal.popField) : null), [popVec, geo.zonal?.popField]);
  const popExp = useMemo(() => (popPts && data && ev
    ? exposure({ pts: popPts.pts, grid: data.grid, pct: ev.pct, cls: ev.cls, mask: data.mask, nClasses: rm.n, direction: rm.direction, zones: zoneGrid })
    : null), [popPts, data, ev, rm.n, rm.direction, zoneGrid]);
  const extremeName = rm.names[rm.direction === 'risk' ? rm.n - 1 : 0];
  const zoneRows = useMemo<ZoneRowView[] | null>(() => (zoneStats ? defaultZoneOrder(zoneStats).map((z) => ({
    key: String(z.index), name: z.name, meanPct: z.meanPct, ha: z.ha, classPct: z.classPct, points: points.length ? z.points : null,
    color: z.meanPct === null ? undefined : `rgb(${modelRampColor(z.meanPct / 100, rm, palette).join(',')})`,
    ...(popExp ? { pop: popExp.perZone[z.index]?.evaluated ?? 0, popExtremePct: popExp.perZone[z.index]?.extremePct ?? null } : {}),
  })) : null), [zoneStats, points.length, palette, rm, popExp]);
  const onZoneSel = useCallback((key: string) => {
    setSelZone(key);
    const f = zoneVec?.fc.features[Number(key)];
    const b = f ? fcBounds({ type: 'FeatureCollection', features: [f] }) : null;
    if (b) mapRef.current?.fit(b);
  }, [zoneVec]);

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
        if (id === 'result') { deps = [data, ev, om, style, palette, rm]; paint = () => paintResult(ev.pct, ev.cls, data.mask, style, palette, rm); }
        else if (id === 'parcels') { deps = [parcelRes, om]; paint = () => paintParcels(parcelRes!.labels); }
        else if (id === 'diff') { deps = [ev, baseline, om, data, palette, rm.direction]; paint = () => paintDiff(ev.pct, baseline!.pct, data.mask, 1, 30, palette, rm.direction); }
        else {
          const k = id.slice(2), info = data.info[k];
          const rule = Object.values(geo.rules).find((r) => r.layerKey === k);
          deps = [data, om, rule?.fn, palette, rm.direction];
          paint = () => (info.role === 'exclusion' ? paintFlag(data.layers[k], [127, 140, 141])
            : info.role === 'area' ? paintFlag(data.layers[k], [132, 204, 22])
              : rule ? paintCriterion(data.layers[k], data.mask, rule.fn, palette, rm.direction) : paintRaw(data.layers[k], info.min, info.max));
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
  }, [data, om, ev, style, onKey, geo.rules, parcelRes, baseline, palette, rm]);

  const rasters = useMemo<RasterOverlay[]>(() => {
    if (!om) return [];
    return Object.entries(imgs).map(([id, url]) => ({
      id, url, bounds: om.bounds, opacity: vis[id]?.op ?? (id === 'result' ? 0.9 : 0.85), visible: vis[id]?.on ?? defaultOn(id), z: id === 'result' ? 20 : id === 'diff' ? 22 : id === 'parcels' ? 21 : 10,
    }));
  }, [imgs, om, vis]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polígonos de referencia: se bajan de Storage al abrir el proyecto (el FC ya no vive solo en memoria).
  const refLoading = useRef(new Set<string>());
  const refSig = Object.entries(geo.layers ?? {}).filter(([, l]) => l.role === 'reference' && l.path).map(([k, l]) => `${k}:${l.path}`).join('|');
  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    for (const [k, l] of Object.entries(geoRef.current.layers ?? {})) {
      if (l.role !== 'reference' || !l.path || refLoading.current.has(k) || vecs.some((v) => v.id === k)) continue;
      refLoading.current.add(k);
      downloadRef(sb, l.path)
        .then((fc) => setVecs((cur) => (cur.some((v) => v.id === k) || !geoRef.current.layers?.[k] ? cur : [...cur, { id: k, name: l.label, fc, color: l.ref?.color ?? '#22D3EE', ref: true }])))
        .catch((e) => setLayerErrs((cur) => [...cur, `«${l.label}»: ${e instanceof Error ? e.message : String(e)}`]))
        .finally(() => refLoading.current.delete(k));
    }
  }, [refSig, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  const vectors = useMemo<VectorOverlay[]>(() => vecs.map((v) => {
    const meta = v.ref ? geo.layers?.[v.id]?.ref : undefined;
    if (!v.ref) return { id: v.id, fc: v.fc, color: v.color, visible: vis[`v:${v.id}`]?.on ?? false };
    const nf = meta?.labels ? meta.nameField : undefined;
    const base: VectorOverlay = {
      id: v.id, fc: v.fc, color: meta?.color ?? v.color, visible: vis[`v:${v.id}`]?.on ?? true, weight: meta?.weight ?? 2, fillOpacity: 0,
      ...(nf ? { labels: v.fc.features.map((f) => { const t = f.properties?.[nf]; return t === undefined || t === null || t === '' ? null : String(t); }) } : {}),
    };
    // Coroplético: la capa de zonas elegida se rellena con el color del índice medio de cada zona (gris = sin área evaluada).
    if (choro && zoneStats && zoneVec?.id === v.id) {
      base.fills = zoneStats.map((z) => (z.meanPct === null ? '#9CA3AF' : `rgb(${modelRampColor(z.meanPct / 100, rm, palette).join(',')})`));
      base.labels = zoneStats.map((z) => `${z.name} · ${z.meanPct === null ? 'sin área evaluada' : Math.round(z.meanPct)}`);
    }
    return base;
  }), [vecs, vis, geo.layers, choro, zoneStats, zoneVec, palette, rm.direction]);

  // ------------------------------------------------------------------ punto consultado
  const point = useMemo(() => (selected && data && ev ? pointView(evaluateOnePoint(data, rules, { breaks: rm.breaks, direction: rm.direction }, selected), rm) : null), [selected, data, ev, rules, rm]);

  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    if (data) Object.entries(data.points).forEach(([name, p]) => out.push({ id: `ref:${name}`, lat: p.lat, lon: p.lon, label: name }));
    if (selected && data) { const [lon, lat] = pixelToLonLat(selected.col, selected.row, data.grid.transform, data.grid.crs); out.push({ id: 'sel', lat, lon, selected: true }); }
    return out;
  }, [data, selected]);

  const onMapClick = useCallback((lat: number, lon: number) => {
    if (addMode) {
      // Modo explícito: cada clic crea un punto. Fuera del modo, el clic sigue siendo la consulta de un punto de siempre.
      const cur = sanitizePoints(geoRef.current.points);
      if (cur.length >= MAX_POINTS) { setAddNote(`Tope de ${MAX_POINTS} puntos alcanzado: elimina alguno para agregar más.`); return; }
      const id = newPointId();
      setPoints([...cur, { id, name: nextPointName(cur), lat: round6(lat), lon: round6(lon) }]);
      setSelPoint(id); setAddNote('');
      return;
    }
    if (!data) return;
    const [c, r] = lonLatToPixel(lon, lat, data.grid.transform, data.grid.crs);
    const col = Math.round(c), row = Math.round(r);
    if (col < 0 || row < 0 || col >= data.grid.width || row >= data.grid.height) { setSelected(null); return; }
    setSelected({ col, row });
  }, [data, addMode, setPoints]);

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
    direction: rm.direction,
    ranges: rm.names.map((label, i) => { const [from, to] = classRange(rm.breaks, i); return { label, from, to }; }),
    coverage,
    classes: stats ? [
      ...stats.classes.map((c, i) => {
        // Las vetadas ya están sumadas a la clase extrema de la dirección: se avisa en su fila.
        const extreme = rm.direction === 'risk' ? rm.n - 1 : 0;
        const note = i === extreme && stats.veto.ha > 0 ? ` (incluye ${stats.veto.ha.toLocaleString('es-CO', { maximumFractionDigits: 0 })} ha ${DIR_TEXT[rm.direction].critical.toLowerCase()})` : '';
        return { label: rm.names[i] + note, ha: c.ha, pct: c.pct };
      }).reverse(),
      { label: 'Exclusión (fuera del cálculo)', ha: stats.excl.ha, pct: 0 },
    ] : [],
    layers: data ? Object.entries(data.info).map(([k, l]) => ({ key: k, label: l.label, role: l.role, origin: l.origin ?? 'Paquete del catálogo', source: l.source ?? '', unit: l.unit, min: l.min, max: l.max })) : [],
    points: ranked.map((r) => ({ rank: r.rank, name: r.name, lat: r.lat, lon: r.lon, pct: r.pct, classLabel: r.status === 'ok' ? r.label : '', state: pointState(r, rm.direction) })),
    pointsOrder: rankHeading(rm.direction),
    ...(zoneStats && zoneVec ? {
      zones: {
        layer: geo.layers?.[zoneVec.id]?.label ?? zoneVec.name, order: zoneOrderHeading(rm.direction), classNames: rm.names, extremeName,
        rows: defaultZoneOrder(zoneStats).map((z) => ({
          name: z.name, meanPct: z.meanPct, ha: z.ha, exclHa: z.exclHa, classPct: z.classPct, points: z.points,
          ...(popExp?.perZone[z.index] ? { pop: popExp.perZone[z.index] } : {}),
        })),
      },
    } : {}),
  }), [props.title, props.objective, data, weightResult, expertIds.length, exploring, criteria, geo.rules, weights, rm, stats, effW, coverage, ranked, zoneStats, zoneVec, popExp, extremeName, geo.layers]);

  async function framePng(withBase: boolean): Promise<HTMLCanvasElement> {
    if (!data || !ev || !om || !stats) throw new Error('No hay mapa que exportar.');
    let cv: HTMLCanvasElement;
    let attribution = 'Mapa: solo resultado';
    if (withBase && mapRef.current) {
      cv = await mapRef.current.capture();
      attribution = `Base: ${BASEMAPS[basemap].attr}`;
    } else {
      return toCanvas(om, paintResult(ev.pct, ev.cls, data.mask, style, palette, rm));
    }
    const ctx = cv.getContext('2d')!;
    const W = cv.width, H = cv.height, f = Math.max(1, Math.round(W / 900));
    ctx.font = `700 ${16 * f}px system-ui, sans-serif`;
    const tw = Math.min(W - 24 * f, ctx.measureText(props.title).width + 28 * f);
    ctx.fillStyle = 'rgba(11,15,23,.82)'; ctx.fillRect(12 * f, 12 * f, tw, 50 * f);
    ctx.fillStyle = '#fff'; ctx.fillText(props.title, 24 * f, 34 * f, tw - 24 * f);
    ctx.font = `500 ${11 * f}px system-ui, sans-serif`; ctx.fillStyle = '#CBD5E1';
    ctx.fillText(`${T.indexName} AHP + SIG · ${new Date().toLocaleDateString('es-CO')}`, 24 * f, 52 * f, tw - 24 * f);
    // Leyenda: de la clase más alta a la más baja, con su rango y % del área evaluada; luego la exclusión.
    const rows: (readonly [number, string])[] = [
      ...rm.names.map((nm, i) => {
        const [from, to] = classRange(rm.breaks, i);
        const rng = i === 0 ? `< ${Math.round(to * 100)}` : i === rm.n - 1 ? `≥ ${Math.round(from * 100)}` : `${Math.round(from * 100)}–${Math.round(to * 100)}`;
        return [i + 1, `${nm} (${rng}) · ${stats.classes[i].pct.toFixed(1)} %`] as const;
      }).reverse(),
      [CLASS_EXCLUDED, 'Exclusión'] as const,
    ];
    const rampH = style === 'continuous' ? 34 : 0;
    ctx.font = `500 ${12 * f}px system-ui, sans-serif`;
    const widest = Math.max(...rows.map(([, t]) => ctx.measureText(t).width));
    const lw = Math.min(W * 0.7, Math.max(230 * f, widest + 40 * f)), lh = (rows.length * 20 + 16 + rampH) * f;
    ctx.fillStyle = 'rgba(11,15,23,.82)'; ctx.fillRect(W - lw - 12 * f, H - lh - 12 * f, lw, lh);
    if (rampH) {
      // Resultado continuo: la leyenda de clases sola no explica los colores del mapa, se añade la rampa 0–100.
      const gx = W - lw - 2 * f, gw = lw - 20 * f, gy = H - lh - 4 * f;
      const grad = ctx.createLinearGradient(gx, 0, gx + gw, 0);
      // Misma rampa que el mapa (sale del modelo de clases): se muestrea en 11 pasos.
      for (let k = 0; k <= 10; k++) { const [r, g, b] = modelRampColor(k / 10, rm, palette); grad.addColorStop(k / 10, `rgb(${r},${g},${b})`); }
      ctx.fillStyle = grad; ctx.fillRect(gx, gy, gw, 10 * f);
      ctx.fillStyle = '#E2E8F0'; ctx.font = `500 ${10 * f}px system-ui, sans-serif`;
      ctx.fillText('0', gx, gy + 22 * f); ctx.fillText('50', gx + gw / 2 - 6 * f, gy + 22 * f); ctx.fillText(`100 (${T.noun})`, gx + gw - 74 * f, gy + 22 * f);
    }
    rows.forEach(([c, txt], i) => {
      const y0 = H - lh - 4 * f + (rampH + i * 20) * f;
      ctx.fillStyle = RHEX[c]; ctx.fillRect(W - lw - 2 * f, y0, 14 * f, 14 * f);
      ctx.fillStyle = '#fff'; ctx.font = `500 ${12 * f}px system-ui, sans-serif`; ctx.fillText(txt, W - lw + 18 * f, y0 + 11 * f);
    });
    ctx.fillStyle = 'rgba(11,15,23,.7)'; ctx.fillRect(0, H - 16 * f, Math.min(W - lw - 20 * f, 520 * f), 16 * f);
    ctx.fillStyle = '#E2E8F0'; ctx.font = `${9 * f}px system-ui, sans-serif`; ctx.fillText(attribution, 6 * f, H - 5 * f);
    return cv;
  }

  const geotiffPct = async () => { const g = data!.grid; saveBytes(`${base}_${T.fileIdx}.tif`, await toGeoTiff(resultRaster(ev!.pct, ev!.cls, data!.mask, 'pct'), g, 255), 'image/tiff'); saveBytes(`${base}_${T.fileIdx}.qml`, qmlPct(palette, rm.direction), 'text/xml'); };
  const geotiffCls = async () => { const g = data!.grid; saveBytes(`${base}_clases.tif`, await toGeoTiff(resultRaster(ev!.pct, ev!.cls, data!.mask, 'classes', rm.n), g, 255), 'image/tiff'); saveBytes(`${base}_clases.qml`, qmlClasses(palette, rm), 'text/xml'); };
  const pngMap = async () => {
    try { saveBytes(`${base}_mapa.png`, await canvasBytes(await framePng(true)), 'image/png'); }
    catch (e) {
      if (e instanceof DOMException && e.name === 'SecurityError') { saveBytes(`${base}_resultado.png`, await canvasBytes(await framePng(false)), 'image/png'); throw new Error('El navegador bloqueó copiar el mapa base; se descargó solo el resultado (con transparencia).'); }
      throw e;
    }
  };
  const pngOnly = async () => saveBytes(`${base}_resultado.png`, await canvasBytes(await framePng(false)), 'image/png');

  // ------------------------------------------------------------------ composición de mapa (R1) e informe ejecutivo (R2)
  // Todo se arma desde el estado del proyecto (datos, resultado calculado, clases, capas, puntos), nunca de lo que está
  // visible en pantalla: el estilo (clases / continuo), las capas y el mapa base los fija el diálogo.
  const [composeOpen, setComposeOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMap, setReportMap] = useState<{ url: string | null; busy: boolean; warnings: string[] }>({ url: null, busy: false, warnings: [] });
  const refVecs = vecs.filter((v) => v.ref);
  const composeAvail: ComposeAvailability = {
    result: !!(data && ev && om && stats), zones: !!(zoneVec && zoneStats), points: points.length,
    references: refVecs.map((v) => ({ id: v.id, name: geo.layers?.[v.id]?.label ?? v.name })),
  };
  const composeDefaults = () => defaultOptions(props.title, composeAvail, basemap === 'dark' ? 'osm' : basemap, new Date().toISOString().slice(0, 10));
  const composeRender = async (o: ComposeOptions) => {
    if (!data || !ev || !om || !stats) throw new Error('No hay mapa que componer: calcula el resultado primero.');
    const summ = summary();
    const bm = BASEMAPS[(o.basemapKey in BASEMAPS ? o.basemapKey : 'osm') as BasemapKey];
    const inputs: ComposeInputs = {
      bounds: om.bounds,
      result: o.result ? toCanvas(om, paintResult(ev.pct, ev.cls, data.mask, o.style, palette, rm)) : null,
      basemap: { url: bm.url, attr: bm.attr, maxZoom: bm.maxZoom, subdomains: bm.subdomains },
      references: refVecs.map((v) => ({ id: v.id, name: geo.layers?.[v.id]?.label ?? v.name, fc: v.fc, color: geo.layers?.[v.id]?.ref?.color ?? v.color, weight: geo.layers?.[v.id]?.ref?.weight ?? 2 })),
      zones: zoneVec && zoneStats ? {
        name: geo.layers?.[zoneVec.id]?.label ?? zoneVec.name, fc: zoneVec.fc,
        fills: zoneStats.map((z) => (z.meanPct === null ? '#9CA3AF' : `rgb(${modelRampColor(z.meanPct / 100, rm, palette).join(',')})`)),
        labels: zoneStats.map((z) => `${z.name} · ${z.meanPct === null ? 'sin área evaluada' : Math.round(z.meanPct)}`),
      } : null,
      // Mismo orden y mismos puestos que la lista: sin puesto (fuera del área, excluido, sin dato) = hueco gris sin número.
      points: ranked.map((r) => ({ lat: r.lat, lon: r.lon, rank: r.rank, name: r.name, color: r.status === 'ok' ? RHEX[r.cls] ?? '#9CA3AF' : '#9CA3AF' })),
      legend: { classes: summ.classes, ranges: summ.ranges ?? [] },
      classColors: RHEX,
      // 11 muestras equiespaciadas de la rampa DEL MODELO (la misma del mapa y de la leyenda), no de la paleta fija.
      rampStops: Array.from({ length: 11 }, (_, k) => `rgb(${modelRampColor(k / 10, rm, palette).join(',')})`),
      texts: { legendTitle: T.legendTitle, lowEnd: T.lowEnd, highEnd: T.highEnd, direction: rm.direction, zoneRampTitle: `${T.indexName} medio por zona` },
      footer: {
        sources: summ.layers.map((l) => (l.source ? `${l.label} (${l.source})` : l.label)),
        dataAttribution: data.attribution, appName: APP_FULL_NAME, version: APP_VERSION, doi: APP_DOI,
      },
    };
    return renderComposition(o, inputs);
  };
  const composeSave = async (cv: HTMLCanvasElement, kind: 'png' | 'pdf', o: ComposeOptions) => {
    if (kind === 'png') { saveBytes(composeFileName(base, o.width, 'png'), await canvasBytes(cv), 'image/png'); return; }
    const jpg = await new Promise<Uint8Array>((res, rej) => cv.toBlob(async (b) => (b ? res(new Uint8Array(await b.arrayBuffer())) : rej(new Error('No se pudo generar la imagen del PDF'))), 'image/jpeg', 0.92));
    saveBytes(composeFileName(base, o.width, 'pdf'), jpegToPdf(jpg, cv.width, cv.height, { title: o.title }), 'application/pdf');
  };
  async function openReport() {
    setReportOpen(true);
    setReportMap({ url: null, busy: true, warnings: [] });
    try {
      const r = await composeRender({ ...composeDefaults(), width: 1600, zones: false, subtitle: '' });
      setReportMap({ url: r.canvas.toDataURL('image/jpeg', 0.9), busy: false, warnings: r.warnings });
    } catch (e) { setReportMap({ url: null, busy: false, warnings: [e instanceof Error ? e.message : String(e)] }); }
  }
  const kmzOne = async () => {
    const g = buildOverlayMap(data!.grid, 'geographic');
    saveBytes(`${base}.kmz`, kmz(props.title, g.bounds, await canvasBytes(toCanvas(g, paintResult(ev!.pct, ev!.cls, data!.mask, style, palette, rm)))), 'application/vnd.google-earth.kmz');
  };
  const parcelsTif = async () => { saveBytes(`${base}_parcelas.tif`, await toGeoTiff(Uint16Array.from(parcelRes!.labels), data!.grid, 0), 'image/tiff'); };
  const parcelsFile = async () => saveBytes(`${base}_parcelas.csv`, parcelsCsv(parcelRes!.parcels, data!.grid), 'text/csv');
  const csv = async () => saveBytes(`${base}_pixeles.csv`, pixelsCsv(ev!.pct, ev!.cls, data!.mask, data!.grid, 200_000, rm), 'text/csv');
  const xlsx = async () => saveBytes(`${base}_resumen.xlsx`, await downloadGeoExcelBytes(summary()), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const zip = async () => {
    const g = data!.grid; const files: Record<string, Uint8Array | string> = {};
    files[`${T.fileIdx}.tif`] = await toGeoTiff(resultRaster(ev!.pct, ev!.cls, data!.mask, 'pct'), g, 255); files[`${T.fileIdx}.qml`] = qmlPct(palette, rm.direction);
    files['clases.tif'] = await toGeoTiff(resultRaster(ev!.pct, ev!.cls, data!.mask, 'classes', rm.n), g, 255); files['clases.qml'] = qmlClasses(palette, rm);
    const used = new Set<string>();
    for (const [k, l] of Object.entries(data!.layers)) {
      let nm = safeName(k); for (let n = 2; used.has(nm); n++) nm = `${safeName(k)}_${n}`; used.add(nm);
      const c = new Float32Array(l); for (let i = 0; i < c.length; i++) if (Number.isNaN(c[i])) c[i] = -9999; files[`capas/${nm}.tif`] = await toGeoTiff(c, g, -9999);
    }
    try { files['mapa.png'] = await canvasBytes(await framePng(true)); } catch { files['resultado.png'] = await canvasBytes(await framePng(false)); }
    const og = buildOverlayMap(g, 'geographic');
    files['google-earth.kmz'] = kmz(props.title, og.bounds, await canvasBytes(toCanvas(og, paintResult(ev!.pct, ev!.cls, data!.mask, style, palette, rm))));
    if (parcelRes?.parcels.length) { files['parcelas.tif'] = await toGeoTiff(Uint16Array.from(parcelRes.labels), g, 0); files['parcelas.csv'] = parcelsCsv(parcelRes.parcels, g); }
    files['pixeles.csv'] = pixelsCsv(ev!.pct, ev!.cls, data!.mask, g, 200_000, rm);
    if (ranked.length) files['puntos_ranking.csv'] = rankingCsv(ranked, rm.direction);
    if (zoneStats) files['zonas.csv'] = zonesCsv(defaultZoneOrder(zoneStats), rm.names, rm.direction, popExp?.perZone, extremeName);
    files['resumen.xlsx'] = await downloadGeoExcelBytes(summary());
    const s = summary();
    files['receta.json'] = JSON.stringify({ ...s, grid: g, rules: geo.rules, layerMeta: Object.fromEntries(Object.entries(geo.layers ?? {}).map(([k, m]) => [k, { ...m, path: undefined }])), pack: geo.packId ?? null }, null, 2);
    // Códigos del GeoTIFF de clases: 1..N en orden ascendente del índice, N+1 = vetada, 0 = exclusión.
    const codes = rm.names.map((nm, i) => `${i + 1} = ${nm}`).concat([`${rm.n + 1} = ${T.critical.toLowerCase()}`, '0 = exclusión']).join(', ');
    files['LEEME.txt'] = `${T.mapTitle} «${props.title}»\n\n- ${T.fileIdx}.tif: ${T.indexName.toLowerCase()} 0–100 (255 = sin dato: fuera del área, exclusión o sin dato en todos los criterios; ${rm.direction === 'risk' ? 'un valor alto es más riesgo' : 'un valor alto es más apto'}) en ${g.crs}, ${g.resM} m/celda.\n- clases.tif: ${codes} (255 = fuera del área o sin dato).\n- *.qml: estilo para QGIS (Capa → Propiedades → Simbología → Estilo → Cargar estilo).\n- capas/: cada capa de entrada ya alineada a la grilla (Float32, -9999 = sin dato).\n- google-earth.kmz, mapa.png, pixeles.csv, resumen.xlsx, receta.json.\n${ranked.length ? `- puntos_ranking.csv: ranking de tus ${ranked.length} punto(s) (${rankHeading(rm.direction).toLowerCase()}); los no evaluados van al final, sin puesto ni índice. También en la hoja «Puntos» de resumen.xlsx.\n` : ''}${zoneStats ? `- zonas.csv: resumen por zona (${zoneOrderHeading(rm.direction).toLowerCase()}): ${T.indexName.toLowerCase()} medio, % del área evaluada por clase${popExp ? ' y personas por clase' : ''}; una zona sin celdas evaluadas va sin índice («Sin área evaluada»). También en la hoja «Zonas» de resumen.xlsx.\n` : ''}\nEl ${T.indexName.toLowerCase()} NO es una probabilidad.\n`;
    saveBytes(`${base}_paquete.zip`, zipFiles(files), 'application/zip');
  };

  // ------------------------------------------------------------------ publicar
  // Resumen por zonas público: con el interruptor apagado (o sin zonas elegidas) esto es null y no cambia ninguna firma.
  // Si hay zonas, su contenido lo fijan la capa, el atributo de nombre, la población y si se publican los puntos.
  const zonesSpec = useMemo(() => (geo.publicZones && zoneVec && zoneGrid
    ? [zoneVec.id, geo.layers?.[zoneVec.id]?.bytes ?? 0, geo.zonal?.nameField ?? '', popVec ? [popVec.id, geo.zonal?.popField ?? ''] : '', !!geo.publicPoints && points.length > 0]
    : null), [geo.publicZones, zoneVec, zoneGrid, popVec, geo.zonal, geo.layers, geo.publicPoints, points.length]);
  const resultSig = useMemo(() => {
    // Los puntos solo entran con el interruptor encendido: sin él la firma es la de siempre.
    const str = JSON.stringify([weightResult.agg.w.map((w) => Math.round(w * 1e6)), geo.rules, classSigValue(setup), layersSig, geo.packId ?? "", ...(geo.publicPoints ? [points.map((p) => [p.name, p.lat, p.lon])] : []), ...(zonesSpec ? [['zonas', zonesSpec]] : [])]);
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }, [weightResult, geo.rules, setup, layersSig, geo.packId, geo.publicPoints, points, zonesSpec]);

  // Firma por partes de lo que produce el mapa (ver lib/geo/publishSig): permite avisar QUÉ cambió desde lo publicado.
  const sigParts = useMemo(() => {
    if (!data) return null;
    return publishParts({
      criteria, weights: weightResult.agg.w, rules: geo.rules,
      // `thresholds` solo cuenta mientras el modelo sea el antiguo (3 clases de aptitud); con otro, manda `classSig`.
      thresholds: { alta: setup.breaks[setup.breaks.length - 1] ?? 0.7, media: setup.breaks[0] ?? 0.45 }, classSig: publishClassSig(setup),
      layers: Object.fromEntries(Object.entries(data.info).map(([k, l]) => [k, { role: l.role, min: l.min, max: l.max, bytes: l.bytes }])),
      packId: geo.packId, grid: data.grid,
      points: { show: !!geo.publicPoints, list: points },
      zones: { show: !!zonesSpec, spec: zonesSpec },
    });
  }, [data, criteria, weightResult, geo.rules, geo.packId, setup, geo.publicPoints, points, zonesSpec]);

  async function buildPublish() {
    if (!data || !ev || !stats || !gridBounds) throw new Error('No hay mapa que publicar.');
    const b64 = await encodePlanes(ev.pct, ev.cls, data.mask);
    const meta: PublishedMeta = {
      v: 2, grid: data.grid, bounds: gridBounds,
      direction: rm.direction,
      // Una entrada por clase: nombre, color propio (si lo hay), rango y superficie. Las vetadas ya están en la clase extrema.
      classes: rm.names.map((name, i) => {
        const [from, to] = classRange(rm.breaks, i);
        return { name, ...(rm.colors[i] ? { color: rm.colors[i] } : {}), from, to, ha: stats.classes[i].ha, pct: stats.classes[i].pct };
      }),
      vetoHa: stats.veto.ha, exclHa: stats.excl.ha,
      // Pesos EFECTIVOS (reescalados entre los criterios con mapa, suman 1): son los que produjeron el mapa publicado.
      weights: criteria.filter((c) => geo.rules[c.id] && data.layers[geo.rules[c.id].layerKey]).map((c) => ({ name: c.name, weight: effW[c.id] ?? 0 })),
      cr: weightResult.agg.cr, nExperts: expertIds.length,
      weightsOrigin: expertIds.length ? 'Panel de expertos (AHP)' : 'Pesos iguales (sin juicios de expertos)',
      evaluableHa: stats.evaluableHa,
      attribution: data.attribution, sig: resultSig, sigParts: sigParts ?? undefined,
      ahp: ahpSummary(criteria, weightResult) ?? undefined,
      // Con el interruptor apagado NO viaja ni la lista: el meta lo recibe cualquiera con el enlace.
      ...(geo.publicPoints ? { showPoints: true, points: toPublishedPoints(ranked) } : {}),
      // Solo agregados por zona (nunca los polígonos de entrada ni la población por manzana).
      ...(zonesSpec && zoneStats && zoneVec ? { showZones: true, zones: toPublishedZones(zoneStats, { layer: geo.layers?.[zoneVec.id]?.label ?? zoneVec.name, withPoints: !!geo.publicPoints && points.length > 0, pop: popExp?.perZone, extremeName }) } : {}),
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

  // Cortes calculados sobre la distribución del índice. Se CONGELAN en `breaks` (no se recalculan solos al cambiar
  // capas o pesos): «Recalcular» vuelve a llamar a esta función. Las celdas vetadas se dejan fuera del histograma
  // porque su índice es 0 ó 100 por construcción y distorsionarían los cortes.
  const recut = useCallback((mode: Exclude<CutMode, 'manual'>) => {
    if (!ix) return;
    const h = histogram(ix.pct, (i) => ix.veto[i] === 0);
    const n = setup.breaks.length + 1;
    const br = mode === 'quantile' ? quantileBreaks(h, n) : jenksBreaks(h, n);
    if (br.length !== n - 1) return;
    onSetup({ ...setup, breaks: normalizeBreaks(br), cut: mode });
  }, [ix, setup, onSetup]);

  return (
    <div className="gv-shell" style={paletteVars(RHEX, rm.n, rm.direction === "risk")}>
      <GeoTour steps={TOUR} open={tour} onClose={() => setTour(false)} onTab={setTab} />
      {composeOpen && (
        <GeoComposeDialog initial={composeDefaults()} avail={composeAvail} zoneName={zoneVec ? geo.layers?.[zoneVec.id]?.label ?? zoneVec.name : undefined}
          basemaps={Object.entries(BASEMAPS).map(([key, b]) => ({ key, label: b.label }))}
          onClose={() => setComposeOpen(false)} render={composeRender} save={composeSave} />
      )}
      {reportOpen && (
        <GeoReportModal onClose={() => setReportOpen(false)} mapUrl={reportMap.url} mapBusy={reportMap.busy} mapWarnings={reportMap.warnings}
          report={buildGeoReport({ summary: summary(), ahp: exploring ? null : ahpSummary(criteria, weightResult), exploring, hasMap: !!reportMap.url })} />
      )}
      <aside className="gv-side">
        <div className="gv-steps-bar" aria-label="Progreso">
          <span className={hasArea ? 'ok' : ''}><Icon d={hasArea ? ICONS.check : ICONS.minus} size={12} /> Área</span>
          <span className={critLayers ? 'ok' : ''}><Icon d={critLayers ? ICONS.check : ICONS.minus} size={12} /> Capas {critLayers}</span>
          <span className={criteria.length && rulesReady === criteria.length ? 'ok' : ''}><Icon d={criteria.length && rulesReady === criteria.length ? ICONS.check : ICONS.minus} size={12} /> Reglas {rulesReady}/{criteria.length}</span>
          <span className={expertIds.length ? 'ok' : ''}><Icon d={expertIds.length ? ICONS.check : ICONS.minus} size={12} /> Pesos {expertIds.length ? `(${expertIds.length} exp.)` : ''}</span>
        </div>
        <div className="gv-tabs" role="tablist" aria-label="Secciones del geovisor">
          {(['capas', 'modelo', 'puntos', 'zonas', 'exportar'] as Tab[]).map((t) => {
            const meta = { capas: ['Capas', ICONS.layers], modelo: ['Modelo', ICONS.sliders], puntos: ['Puntos', ICONS.pin], zonas: ['Zonas', ICONS.zones], exportar: ['Exportar', ICONS.download] }[t];
            const n = t === 'puntos' ? points.length : 0;
            return (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} title={meta[0]}>
                <Icon d={meta[1]} size={18} />
                <span className="lbl">{meta[0]}{n > 0 && <span className="n" aria-label={` (${n})`}>{n}</span>}</span>
              </button>
            );
          })}
        </div>
        <div className="gv-side-body">
          {lost > 0 && (
            <div className="banner" role="alert"><span>{lost} capa(s) no se pudieron recuperar (se añadieron en una sesión sin guardar o no se pudieron descargar). Los criterios que dependen de ellas no entran al mapa hasta que las vuelvas a subir.{layerErrs.length > 0 && <> Detalle: {layerErrs.join(' · ')}</>}</span></div>
          )}
          {error && <div className="banner"><span><b>No se pudo cargar:</b> {error}</span></div>}
          {tab === 'capas' && (
            <GeoLayersPanel geo={geo} data={data} criteria={criteria} commit={commit} cache={cache} sb={supabase} ownerId={props.ownerId} projectId={props.projectId}
              vecs={vecs} setVecs={setVecs} vis={vis} setVis={setVis} fit={(b) => mapRef.current?.fit(b)} getView={() => mapRef.current?.getBounds() ?? null} palette={palette} direction={rm.direction} draft={draft} setDraft={setDraft} drawing={drawing} setDrawing={setDrawing}
              quota={quota} onQuotaChange={refreshQuota} evaluableHa={stats?.evaluableHa ?? null}
              uploadFor={uploadFor} onCancelUpload={() => setUploadFor(null)} onLayerAdded={(id) => { setUploadFor(null); setFocusId(id); setTab('modelo'); }}
              virtual={[...(parcelRes ? [{ id: 'parcels', label: `Parcelas ≥ ${minPatchHa} ha`, role: `${parcelRes.parcels.length} parcelas`, swatch: '#6D28D9' }] : []), ...(baseline ? [{ id: 'diff', label: `Diferencia con el escenario ${baseline.label}`, role: palette === 'semaforo' ? 'rojo empeora · verde mejora' : 'naranja empeora · azul mejora', swatch: `linear-gradient(90deg, rgb(${PALETTES[palette].diffNeg.join(',')}), #eee, rgb(${PALETTES[palette].diffPos.join(',')}))` }] : [])]} />
          )}
          {tab === 'modelo' && (
            <GeoModelPanel isPack={!!geo.packId} onUploadFor={(id) => { setFocusId(null); setUploadFor(id); setTab('capas'); }} focusId={focusId} criteria={criteria} weights={weightResult.agg.w} cr={weightResult.agg.cr} nExperts={expertIds.length} layers={data?.info ?? {}} rules={geo.rules}
              onRule={(id, rule) => commit((c) => { const r = { ...c.rules }; if (rule) r[id] = rule; else delete r[id]; return { ...c, rules: r }; })}
              setup={setup} onSetup={onSetup} editHex={editHex} onCut={recut} canCut={!!ix}
              exploring={exploring} exploreWeights={exploreWeights} onExplore={(on, w) => { setExploring(on); setExploreWeights(w ?? null); }}
              minPatchHa={minPatchHa} onMinPatch={(ha) => { setMinPatchHa(ha); commit((g) => ({ ...g, minPatchHa: ha })); }}
              parcels={parcelRes?.parcels ?? null}
              onFlyTo={(col, row) => { if (data) { const [lon, lat] = pixelToLonLat(col, row, data.grid.transform, data.grid.crs); mapRef.current?.flyTo(lat, lon, 12); } }}
              stats={stats} baseline={baseline ? { label: baseline.label, stats: baseline.stats } : null}
              onSaveBaseline={(label) => { if (ev && stats) { setBaseline({ label, pct: ev.pct.slice(), stats }); setVis((v) => ({ ...v, diff: { on: true, op: 0.9 } })); } }}
              onClearBaseline={() => setBaseline(null)} />
          )}
          {tab === 'puntos' && (
            <GeoPointsPanel
              points={points} ranked={ranked} rows={rankRows} renderDetail={renderPointDetail} direction={rm.direction} criticalLabel={T.critical}
              ready={!!(data && rules.length > 0)} addMode={addMode} onAddMode={setAddMode} addNote={addNote}
              labels={{ on: showNames, mode: nameMode, trimmed: namesTrimmed, onOn: setShowNames, onMode: setNameMode }}
              selectedKey={selPoint}
              onSelect={(id) => { setSelPoint(id); const pt = id ? points.find((x) => x.id === id) : null; if (pt) mapRef.current?.panTo(pt.lat, pt.lon); }}
              onCenter={(id) => { const pt = points.find((x) => x.id === id); if (pt) { setSelPoint(id); mapRef.current?.flyTo(pt.lat, pt.lon, 13); } }}
              onChange={setPoints}
              onExportCsv={() => saveBytes(`${base}_ranking_puntos.csv`, rankingCsv(ranked, rm.direction), 'text/csv')} />
          )}
          {tab === 'zonas' && (
            <GeoZonesPanel
              layers={zoneLayers} sel={geo.zonal} ready={!!(data && ev && rules.length > 0)} rows={zoneRows} classNames={rm.names} direction={rm.direction}
              rampCss={modelRampCss(rm, palette)} choropleth={choro} onChoropleth={setChoro} nPoints={points.length}
              selectedKey={selZone} onSelect={onZoneSel} onGoLayers={() => setTab('capas')}
              extremeName={extremeName}
              expo={popExp && popPts ? { byClass: popExp.byClass, evaluated: popExp.evaluated, notEvaluated: popExp.notEvaluated, outside: popExp.outside, total: popExp.total, skipped: popPts.skipped } : null}
              onSel={(z) => commit((g) => { const o = { ...g }; if (z) o.zonal = z; else delete o.zonal; return o; })}
              onCsv={() => { if (zoneStats) saveBytes(`${base}_zonas.csv`, zonesCsv(defaultZoneOrder(zoneStats), rm.names, rm.direction, popExp?.perZone, extremeName), 'text/csv'); }} />
          )}
          {tab === 'exportar' && (
            <div className="gv-sec-stack">
              {!ready && <p className="gv-hint">Para exportar hace falta un mapa calculado: define el área, sube capas y asígnalas a criterios con su regla.</p>}
              {props.share && <p className="gv-hint">Para publicar el mapa con un enlace (y QR) usa la pestaña «Compartir» del proyecto.</p>}
              {isAdmin && supabase && !geo.packId && (
                <GeoCatalogPanel sb={supabase} userId={props.ownerId} title={props.title} objective={props.objective} criteria={criteria} geo={geo} cache={cache} ready={ready && !!geo.grid} />
              )}
              <ExportGroups disabled={!ready}
                groups={exportGroups({ noun: T.noun, crs: data?.grid.crs ?? '', classNames: rm.names, critical: T.critical,
                  parcels: parcelRes?.parcels.length ? { n: parcelRes.parcels.length, minHa: minPatchHa, label: rm.direction === 'risk' ? 'zona contigua de «' + rm.names[rm.n - 1] + '»' : 'parcela contigua de alta aptitud' } : null,
                  hasPoints: ranked.length > 0, hasZones: !!zoneStats })}
                run={{
                  compose: async () => setComposeOpen(true),
                  report: async () => { void openReport(); },
                  xls: xlsx, tif: geotiffPct, kmz: kmzOne, cls: geotiffCls, csv, ptif: parcelsTif, pcsv: parcelsFile,
                  rank: async () => saveBytes(`${base}_ranking_puntos.csv`, rankingCsv(ranked, rm.direction), 'text/csv'),
                  zcsv: async () => { if (zoneStats) saveBytes(`${base}_zonas.csv`, zonesCsv(defaultZoneOrder(zoneStats), rm.names, rm.direction, popExp?.perZone, extremeName), 'text/csv'); },
                  png: pngMap, pngr: pngOnly, zip,
                }} />
            </div>
          )}
        </div>
      </aside>

      <section className="gv-main">
        <div className="gv-stage">
          <GeoMap ref={mapRef} basemap={basemap} rasters={rasters} vectors={vectors} markers={markers} pointMarks={pointMarks} selectedPointId={selPoint} labels={showNames ? { mode: nameMode } : null} onLabelsTrimmed={setNamesTrimmed} addMode={addMode} onPointClick={setSelPoint} draft={draft} drawing={drawing}
            initialBounds={gridBounds} onClick={onMapClick} onMove={onMove} onMarkerClick={onMarkerClick}
            onDrawn={(b) => { setDraft(b); setDrawing(false); }} />

          <div className="gv-hud gv-hud-tr">
            <BasemapChips value={basemap} onChange={setBasemap} />
            <StyleChips value={style} onChange={setStyle} nClasses={rm.n} />
            <PaletteChips value={palette} onChange={setPalette} />
            <button type="button" className="gv-fit" onClick={() => setTour(true)} title="Repetir el recorrido guiado"><span aria-hidden="true">?</span> Recorrido</button>
            {gridBounds && <button type="button" className="gv-fit" onClick={() => mapRef.current?.fit(gridBounds)} title="Encajar el área de estudio"><Icon d={ICONS.fit} size={15} /> Área</button>}
          </div>

          <div className="gv-coords mono"><span ref={coordRef}>—</span></div>

          {addMode && (
            <div className="gv-addbar" role="status">
              <span><b>Agregar punto:</b> haz clic en el mapa para colocar cada punto.</span>
              <button type="button" className="btn sm" onClick={() => setAddMode(false)}>Terminar (Esc)</button>
            </div>
          )}
          {loading && <div className="gv-toast" role="status">Cargando capas… {Math.round(progress * 100)}%</div>}
          {!ready && data && !loading && <div className="gv-toast" role="status">Asigna capas a tus criterios (pestaña Modelo) para ver el resultado.</div>}

          {(extraLegend || (ready && resultOn)) && (
            <div className="gv-legends">
              {/* El resultado siempre a la vista; la de la capa activa de arriba, plegable debajo. */}
              {ready && resultOn && <ResultLegend style={style} model={rm} palette={palette} />}
              {extraLegend && (ready && resultOn ? (
                <details className="gv-legend-more">
                  <summary>Leyenda de otra capa activa</summary>
                  <LayerLegend spec={extraLegend} palette={palette} direction={rm.direction} />
                </details>
              ) : <LayerLegend spec={extraLegend} palette={palette} direction={rm.direction} />)}
            </div>
          )}

          {point && (
            <div className="gv-point" role="status">
              <button type="button" className="x" aria-label="Cerrar" onClick={() => setSelected(null)}>×</button>
              <PointFicha pct={point.pct} label={point.label} color={RHEX[point.cls]} lat={point.lat} lon={point.lon} rows={point.rows} />
              <div className="disc">{T.disclaimer} Con el mapa enfocado, Intro consulta el punto central.</div>
            </div>
          )}

          {empty && !loading && (
            <div className="gv-empty">
              <h3>Tu {T.mapTitle.toLowerCase()}</h3>
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
              {[...stats.classes.map((s, i) => [i + 1, s, rm.names[i]] as const).reverse(), [CLASS_EXCLUDED, stats.excl, 'Exclusión'] as const].map(([c, s, nm]) => (
                <div className="brow" key={c}>
                  <span title={nm} style={{ overflowWrap: 'anywhere' }}>{nm}</span>
                  <span className="bar"><span className="bfill" style={{ width: `${c === CLASS_EXCLUDED ? (stats.totalHa ? (s.ha / stats.totalHa) * 100 : 0) : s.pct}%`, background: RHEX[c] }} /></span>
                  <span className="mono">{s.ha.toLocaleString('es-CO', { maximumFractionDigits: 0 })} ha{c === CLASS_EXCLUDED ? '' : ` · ${s.pct.toFixed(1)} %`}</span>
                </div>
              ))}
            </div>
            {stats.veto.ha > 0 && (
              <div className="muted mono" style={{ fontSize: 12 }}>
                {stats.veto.ha.toLocaleString('es-CO', { maximumFractionDigits: 0 })} ha {T.critical.toLowerCase()}s por algún criterio: cuentan en «{rm.names[rm.direction === 'risk' ? rm.n - 1 : 0]}».
              </div>
            )}
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
      {props.share?.slot && createPortal(
        <GeoSharePanel sb={supabase} projectId={props.projectId} title={props.title} fileBase={props.share.fileBase}
          isPublic={props.share.isPublic} token={props.share.token} onTogglePublic={props.share.onTogglePublic}
          ready={ready} exploring={exploring} sig={resultSig} parts={sigParts} build={buildPublish}
          showPoints={!!geo.publicPoints} nPoints={points.length} showZones={!!geo.publicZones} zonesReady={!!zoneVec} hasPop={!!popVec}
          onShowZones={(on) => commit((g) => { const o = { ...g }; if (on) o.publicZones = true; else delete o.publicZones; return o; })}
          onShowPoints={(on) => commit((g) => { const o = { ...g }; if (on) o.publicPoints = true; else delete o.publicPoints; return o; })}
          warn={expertIds.length > 0 && weightResult.agg.cr >= 0.1 ? `Los juicios de los expertos son inconsistentes (CR ${weightResult.agg.cr.toFixed(3)} ≥ 0.10): los pesos no son confiables. La vista pública mostrará el CR, pero conviene corregirlos antes de publicar.` : undefined}
          onGoExperts={props.share.onGoExperts} onPrioExcel={props.share.onPrioExcel} />,
        props.share.slot,
      )}
    </div>
  );
}

/** Grupos de descargas de la pestaña «Exportar». El resultado de cada una se muestra en línea (antes los errores salían en un
 * `alert()` y los éxitos no decían nada): así una descarga que falla nunca pasa desapercibida. «Más formatos» va plegado. */
function ExportGroups({ groups, run, disabled }: { groups: ExportGroup[]; run: Partial<Record<ExportKey, () => Promise<void>>>; disabled: boolean }) {
  const [running, setRunning] = useState('');
  const [res, setRes] = useState<{ ok: boolean; msg: string } | null>(null);
  const row = (it: ExportSpec) => {
    const fn = run[it.k];
    return (
      <div className={'gv-export' + (it.primary ? ' primary' : '')} key={it.k}>
        <div><b>{it.label}</b><p>{it.desc}</p></div>
        <button type="button" className={'btn sm' + (it.primary ? ' primary' : '')} disabled={disabled || !!running || !fn} aria-busy={running === it.k}
          onClick={async () => {
            if (!fn) return;
            setRunning(it.k); setRes(null);
            try { await fn(); if (!it.opens) setRes({ ok: true, msg: `«${it.label}»: listo, revisa tu carpeta de descargas.` }); }
            catch (e) { setRes({ ok: false, msg: `«${it.label}» no se pudo generar: ${e instanceof Error ? e.message : String(e)}` }); }
            setRunning('');
          }}>
          <Icon d={ICONS.download} size={13} /> {running === it.k ? 'Generando…' : it.opens ? 'Abrir' : 'Descargar'}
        </button>
      </div>
    );
  };
  return (
    <>
      {groups.map((g) => g.folded ? (
        <details className="gx-group" key={g.id}>
          <summary>{g.title} <span className="gx-count">{g.items.length}</span></summary>
          <div className="gx-items">{g.items.map(row)}</div>
        </details>
      ) : (
        <section className="gx-group" key={g.id} aria-labelledby={`gx-${g.id}`}>
          <h4 id={`gx-${g.id}`} className="gx-title">{g.title}</h4>
          <div className="gx-items">{g.items.map(row)}</div>
        </section>
      ))}
      <p className={'gv-hint' + (res && !res.ok ? ' warn' : '')} role={res && !res.ok ? 'alert' : 'status'} aria-live="polite">{res?.msg ?? ''}</p>
    </>
  );
}

/** Texto de la ficha del punto a partir del cálculo puro (`lib/geo/pointEval.ts`). */
function pointView(p: PointEval, m: ReturnType<typeof resolveModel>) {
  const label = p.status === 'outside' ? 'Fuera del área de estudio' : p.status === 'excluded' ? 'Exclusión' : p.status === 'nodata' ? 'Sin dato' : classLabel(m, p.cls);
  return { pct: p.pct, cls: p.cls, label, lat: p.lat, lon: p.lon, rows: p.rows };
}
