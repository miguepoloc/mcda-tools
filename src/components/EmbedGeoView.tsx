'use client';

/** Mapa publicado, versión mínima para incrustar en otra página (`/p/<token>/embed`): el mapa, la leyenda de clases,
 * el selector de vista (continuo / clases, mapa base y, si el dueño los publicó, puntos y zonas) y una atribución
 * discreta con enlace a la vista completa. Recibe únicamente lo publicado (como la vista pública): nunca las capas
 * de entrada ni los nombres de los expertos, y respeta `showPoints` / `showZones` a través de las mismas funciones
 * (`publishedPoints`, `publishedZones`) que la vista completa. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lonLatToPixel, pixelToLonLat } from '@/lib/geo/crs';
import { toUrl } from '@/lib/geo/canvas';
import { buildOverlayMap } from '@/lib/geo/overlay';
import { classHexOf, modelRampHex, paintResult, type PaletteKey } from '@/lib/geo/paint';
import { decodePlanes, publishedPoints, publishedView, publishedZones } from '@/lib/geo/publish';
import { DIR_TEXT } from '@/lib/geo/classes';
import { rankHeading, STATUS_LABEL } from '@/lib/geo/points';
import { CLASS_EXCLUDED, CLASS_VETO, MASK_EXCLUDED, MASK_NODATA } from '@/lib/geo/suitability';
import { embedViews, resolvePanel, type EmbedBase, type EmbedPanel, type EmbedStyle } from '@/lib/embed';
import GeoMap, { type GeoMapHandle, type MapMarker, type PointMark, type RasterOverlay } from './GeoMap';
import GeoPointsList, { type RankRow } from './GeoPointsList';
import GeoZonesTable from './GeoZonesTable';
import { BasemapChips, ResultLegend, StyleChips } from './GeoHud';
import type { PublicGeo } from './PublicGeoView';
import './embed.css';

const PANEL_LABEL: Record<EmbedPanel, string> = { map: 'Mapa', points: 'Puntos', zones: 'Zonas' };

export default function EmbedGeoView({ data, token, initial }: { data: PublicGeo; token: string; initial: { style: EmbedStyle; base: EmbedBase; panel: EmbedPanel } }) {
  const { meta } = data;
  const view = useMemo(() => publishedView(meta), [meta]);
  const model = useMemo(() => ({
    n: view.classes.length, direction: view.direction, names: view.classes.map((c) => c.name),
    colors: view.classes.map((c) => c.color), breaks: view.classes.slice(1).map((c) => c.from),
  }), [view]);
  const T = DIR_TEXT[view.direction];
  const palette: PaletteKey = 'semaforo';
  const HEX = useMemo(() => classHexOf(model, palette), [model]);
  const [planes, setPlanes] = useState<Awaited<ReturnType<typeof decodePlanes>> | null>(null);
  const [error, setError] = useState('');
  const [basemap, setBasemap] = useState<EmbedBase>(initial.base);
  const [style, setStyle] = useState<EmbedStyle>(initial.style);
  const [sel, setSel] = useState<{ col: number; row: number } | null>(null);
  const [selPoint, setSelPoint] = useState<string | null>(null);
  const mapRef = useRef<GeoMapHandle>(null);

  const pubPoints = useMemo(() => publishedPoints(meta), [meta]);
  const pubZones = useMemo(() => publishedZones(meta), [meta]);
  const views = useMemo(() => embedViews(meta), [meta]);
  const [panel, setPanel] = useState<EmbedPanel>(() => resolvePanel(initial.panel, meta));

  useEffect(() => {
    let alive = true;
    decodePlanes(data.grid_b64, meta.grid.width * meta.grid.height, { legacyVeto: view.legacyVeto }).then((p) => alive && setPlanes(p)).catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; };
  }, [data.grid_b64, meta.grid.width, meta.grid.height, view.legacyVeto]);

  const om = useMemo(() => buildOverlayMap(meta.grid, 'mercator'), [meta.grid]);
  const rasters = useMemo<RasterOverlay[]>(() => (planes ? [{ id: 'result', url: toUrl(om, paintResult(planes.pct, planes.cls, planes.mask, style, palette, model)), bounds: om.bounds, opacity: 0.9, visible: true, z: 20 }] : []), [planes, om, style, model]);

  const onClick = useCallback((lat: number, lon: number) => {
    const [c, r] = lonLatToPixel(lon, lat, meta.grid.transform, meta.grid.crs);
    const col = Math.round(c), row = Math.round(r);
    setSel(col < 0 || row < 0 || col >= meta.grid.width || row >= meta.grid.height ? null : { col, row });
  }, [meta.grid]);

  const point = useMemo(() => {
    if (!sel || !planes) return null;
    const i = sel.row * meta.grid.width + sel.col;
    const [lon, lat] = pixelToLonLat(sel.col, sel.row, meta.grid.transform, meta.grid.crs);
    const m = planes.mask[i];
    if (m === MASK_NODATA) return { lat, lon, pct: null as number | null, cls: CLASS_EXCLUDED, label: 'Fuera del área de estudio' };
    if (m === MASK_EXCLUDED) return { lat, lon, pct: null, cls: CLASS_EXCLUDED, label: 'Exclusión (no se evalúa)' };
    return { lat, lon, pct: planes.pct[i], cls: planes.cls[i], label: planes.cls[i] === CLASS_VETO ? T.critical : (model.names[planes.cls[i] - 1] ?? 'Sin clase') };
  }, [sel, planes, meta.grid, model, T]);
  const markers = useMemo<MapMarker[]>(() => (point ? [{ id: 'sel', lat: point.lat, lon: point.lon, selected: true }] : []), [point]);

  const rankRows = useMemo<RankRow[]>(() => (pubPoints ?? []).map((p, i) => {
    const ok = p.status === 'ok';
    const veto = ok && p.cls === CLASS_VETO;
    return {
      key: String(i), rank: p.rank, name: p.name || `Punto ${i + 1}`, lat: p.lat, lon: p.lon, pct: ok ? p.pct : null, status: p.status, vetoed: veto,
      color: !ok ? '#9CA3AF' : style === 'continuous' && p.pct !== null && p.pct !== undefined ? modelRampHex(p.pct / 100, model, palette) : HEX[p.cls] ?? '#9CA3AF',
      label: !ok ? STATUS_LABEL[p.status as Exclude<typeof p.status, 'ok'>] : veto ? model.names[view.direction === 'risk' ? model.n - 1 : 0] : (model.names[p.cls - 1] ?? `Clase ${p.cls}`),
    };
  }), [pubPoints, HEX, model, view.direction, style]);
  const pointMarks = useMemo<PointMark[]>(() => rankRows.map((r) => ({
    id: r.key, lat: r.lat, lon: r.lon, color: r.color, rank: r.rank, name: r.name, pct: r.pct,
    tip: r.status === 'ok' ? `${r.rank}. ${r.name} · ${r.pct} % · ${r.label}${r.vetoed ? ` (${T.critical})` : ''}` : `${r.name} · ${r.label}`,
  })), [rankRows, T]);

  if (error) return <div className="emb-msg" role="alert"><b>No se pudo mostrar el mapa:</b> {error}</div>;
  const fullHref = `/p/${encodeURIComponent(token)}`;
  const vars = { '--geo-alta': HEX[view.direction === 'risk' ? 1 : model.n], '--geo-media': HEX[Math.ceil(model.n / 2)], '--geo-noapta': HEX[view.direction === 'risk' ? model.n : 1], '--geo-excl': HEX[CLASS_EXCLUDED] } as React.CSSProperties;

  return (
    <div className="gv-wrap gv-embed" style={vars}>
      <div className="emb-stage gv-stage">
        <GeoMap ref={mapRef} basemap={basemap} rasters={rasters} vectors={[]} markers={markers} pointMarks={pointMarks} selectedPointId={selPoint}
          onPointClick={(k) => { setSelPoint(k); }} draft={null} drawing={false}
          initialBounds={meta.bounds} onClick={onClick} onMove={() => {}} onDrawn={() => {}} />
        <div className="gv-hud gv-hud-tr">
          <BasemapChips value={basemap} onChange={setBasemap} />
          <StyleChips value={style} onChange={setStyle} nClasses={model.n} />
        </div>
        {views.length > 1 && (
          <div className="emb-views gv-chips" role="group" aria-label="Vista">
            {views.map((v) => <button key={v} type="button" aria-pressed={panel === v} onClick={() => setPanel(v)}>{PANEL_LABEL[v]}</button>)}
          </div>
        )}
        {!planes && <div className="gv-toast" role="status">Cargando el mapa…</div>}
        {planes && panel === 'map' && <div className="gv-legends"><ResultLegend style={style} model={model} palette={palette} /></div>}
        {panel === 'points' && rankRows.length > 0 && (
          <div className="emb-panel" role="region" aria-label="Puntos y ranking">
            <GeoPointsList rows={rankRows} heading={rankHeading(view.direction)} criticalLabel={T.critical} selectedKey={selPoint}
              onSelect={(k) => { setSelPoint(k); const r = k ? rankRows.find((x) => x.key === k) : null; if (r) mapRef.current?.panTo(r.lat, r.lon); }}
              onCenter={(k) => { const r = rankRows.find((x) => x.key === k); if (r) { setSelPoint(k); mapRef.current?.flyTo(r.lat, r.lon, 13); } }} />
          </div>
        )}
        {panel === 'zones' && pubZones && (
          <div className="emb-panel" role="region" aria-label="Resumen por zonas">
            <GeoZonesTable
              rows={pubZones.rows.map((r, i) => ({
                key: String(i), name: r.name, meanPct: r.meanPct, ha: r.ha, classPct: r.classPct, points: r.points ?? null,
                ...(pubZones.extremeName ? { pop: r.pop ?? 0, popExtremePct: r.popExtremePct ?? null } : {}),
              }))}
              classNames={model.names} indexLabel={view.direction === 'risk' ? 'Riesgo medio' : 'Idoneidad media'}
              heading={view.direction === 'risk' ? 'Mayor riesgo primero' : 'Más apto primero'}
              showPoints={pubZones.rows.some((r) => r.points !== undefined)} showPop={!!pubZones.extremeName} extremeName={pubZones.extremeName} />
          </div>
        )}
        {point && panel === 'map' && (
          <div className="gv-point emb-point" role="status">
            <button type="button" className="x" aria-label="Cerrar" onClick={() => setSel(null)}>×</button>
            <div className="big">{point.pct === null ? '—' : `${point.pct}%`}</div>
            <span className="cls-pill" style={{ background: `color-mix(in srgb, ${HEX[point.cls]} 22%, transparent)`, borderColor: HEX[point.cls] }}>
              <span className="dot" style={{ background: HEX[point.cls] }} />{point.label}
            </span>
            <div className="disc">{T.disclaimer}</div>
          </div>
        )}
      </div>
      <div className="emb-foot">
        <span className="emb-title" title={data.title}>{data.title}</span>
        <a href={fullHref} target="_blank" rel="noopener noreferrer">Ver la vista completa en mcda.tools ↗</a>
      </div>
    </div>
  );
}
