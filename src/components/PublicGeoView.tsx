'use client';

/** Vista pública (solo lectura) de un mapa de aptitud publicado: el mapa, las clases, los pesos, el análisis AHP de los criterios
 * (si se publicó) y, al hacer clic, el % de idoneidad del punto. Recibe únicamente el resultado publicado (dos planos Uint8 +
 * metadatos): nunca las capas de entrada ni los nombres de los expertos. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lonLatToPixel, pixelToLonLat } from '@/lib/geo/crs';
import { toUrl } from '@/lib/geo/canvas';
import { buildOverlayMap } from '@/lib/geo/overlay';
import { PALETTES, classHexOf, paintResult } from '@/lib/geo/paint';
import { decodePlanes, publishedPoints, publishedView, publishedZones, type PublishedMeta } from '@/lib/geo/publish';
import { DIR_TEXT } from '@/lib/geo/classes';
import { rankHeading, STATUS_LABEL } from '@/lib/geo/points';
import { CLASS_EXCLUDED, CLASS_VETO, MASK_EXCLUDED, MASK_NODATA } from '@/lib/geo/suitability';
import GeoMap, { type BasemapKey, type GeoMapHandle, type MapMarker, type PointMark, type RasterOverlay } from './GeoMap';
import GeoPointsList, { type RankRow } from './GeoPointsList';
import GeoZonesTable from './GeoZonesTable';
import { BasemapChips, PaletteChips, ResultLegend, StyleChips } from './GeoHud';
import { Icon, ICONS, usePalette } from './GeoBits';
import PublicAhp from './PublicAhp';

export type PublicGeo = { status: 'ok'; title: string; objective: string; grid_b64: string; meta: PublishedMeta; updated_at: string };

/** Variables CSS de clase según la paleta (recuadros de color de los paneles). */
const paletteVars = (h: Record<number, string>, n: number, risk: boolean) => (
  { '--geo-alta': h[risk ? 1 : n], '--geo-media': h[Math.ceil(n / 2)], '--geo-noapta': h[risk ? n : 1], '--geo-excl': h[CLASS_EXCLUDED] } as React.CSSProperties
);

export default function PublicGeoView({ data }: { data: PublicGeo }) {
  const { meta } = data;
  // v1 (aptitud, 3 clases) y v2 (dirección + N clases) se leen igual a través de la vista normalizada.
  const view = useMemo(() => publishedView(meta), [meta]);
  const model = useMemo(() => ({
    n: view.classes.length, direction: view.direction, names: view.classes.map((c) => c.name),
    colors: view.classes.map((c) => c.color), breaks: view.classes.slice(1).map((c) => c.from),
  }), [view]);
  const T = DIR_TEXT[view.direction];
  const [planes, setPlanes] = useState<Awaited<ReturnType<typeof decodePlanes>> | null>(null);
  const [error, setError] = useState('');
  const [basemap, setBasemap] = useState<BasemapKey>('sat');
  const [style, setStyle] = useState<'continuous' | 'classes'>('continuous');
  const [palette, setPalette] = usePalette();
  const HEX = useMemo(() => classHexOf(model, palette), [model, palette]);
  const [sel, setSel] = useState<{ col: number; row: number } | null>(null);
  const mapRef = useRef<GeoMapHandle>(null);
  const coordRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let alive = true;
    decodePlanes(data.grid_b64, meta.grid.width * meta.grid.height, { legacyVeto: view.legacyVeto }).then((p) => alive && setPlanes(p)).catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; };
  }, [data.grid_b64, meta.grid.width, meta.grid.height, view.legacyVeto]);

  const om = useMemo(() => buildOverlayMap(meta.grid, 'mercator'), [meta.grid]);
  const rasters = useMemo<RasterOverlay[]>(() => (planes ? [{ id: 'result', url: toUrl(om, paintResult(planes.pct, planes.cls, planes.mask, style, palette, model)), bounds: om.bounds, opacity: 0.9, visible: true, z: 20 }] : []), [planes, om, style, palette, model]);

  const onClick = useCallback((lat: number, lon: number) => {
    const [c, r] = lonLatToPixel(lon, lat, meta.grid.transform, meta.grid.crs);
    const col = Math.round(c), row = Math.round(r);
    setSel(col < 0 || row < 0 || col >= meta.grid.width || row >= meta.grid.height ? null : { col, row });
  }, [meta.grid]);
  const onMove = useCallback((lat: number, lon: number) => { if (coordRef.current) coordRef.current.textContent = `${lat.toFixed(5)}°, ${lon.toFixed(5)}°`; }, []);

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

  // Puntos con ranking: solo si el dueño los publicó (`showPoints`); publicaciones anteriores no los traen.
  const pubPoints = useMemo(() => publishedPoints(meta), [meta]);
  const pubZones = useMemo(() => publishedZones(meta), [meta]);
  const [selPoint, setSelPoint] = useState<string | null>(null);
  const rankRows = useMemo<RankRow[]>(() => (pubPoints ?? []).map((p, i) => {
    const ok = p.status === 'ok';
    const veto = ok && p.cls === CLASS_VETO;
    return {
      key: String(i), rank: p.rank, name: p.name || `Punto ${i + 1}`, lat: p.lat, lon: p.lon, pct: ok ? p.pct : null, status: p.status, vetoed: veto,
      color: ok ? HEX[p.cls] ?? '#9CA3AF' : '#9CA3AF',
      label: !ok ? STATUS_LABEL[p.status as Exclude<typeof p.status, 'ok'>] : veto ? model.names[view.direction === 'risk' ? model.n - 1 : 0] : (model.names[p.cls - 1] ?? `Clase ${p.cls}`),
    };
  }), [pubPoints, HEX, model, view.direction]);
  const pointMarks = useMemo<PointMark[]>(() => rankRows.map((r) => ({
    id: r.key, lat: r.lat, lon: r.lon, color: r.color, rank: r.rank, name: r.name, pct: r.pct,
    tip: r.status === 'ok' ? `${r.rank}. ${r.name} · ${r.pct} % · ${r.label}${r.vetoed ? ` (${T.critical})` : ''}` : `${r.name} · ${r.label}`,
  })), [rankRows, T]);

  if (error) return <div className="banner"><span><b>No se pudo mostrar el mapa:</b> {error}</span></div>;
  // De la clase más alta a la más baja (código = posición + 1).
  const rows = view.classes.map((c, i) => ({ code: i + 1, ...c })).reverse();

  return (
    <div className="gv-wrap gv-public">
      <div className="gv-shell" style={paletteVars(HEX, model.n, view.direction === 'risk')}>
        <aside className="gv-side">
          <div className="gv-side-body">
            <section className="gv-sec">
              <header><h4>Pesos de los criterios</h4>{meta.nExperts > 0 && <span className={'gv-cr' + (meta.cr >= 0.1 ? ' bad' : '')}>CR {meta.cr.toFixed(3)}{meta.cr >= 0.1 ? ' · inconsistente' : ''}</span>}</header>
              <p className="gv-hint">{meta.weightsOrigin}{meta.nExperts > 0 ? ` · ${meta.nExperts} experto(s)` : ''}</p>
              {meta.weights.map((w) => (
                <div className="gv-wbar" key={w.name}>
                  <span className="nm" title={w.name}>{w.name}</span><span className="v">{w.weight.toFixed(3)}</span>
                  <span className="track"><span className="fill" style={{ width: `${w.weight * 100}%` }} /></span>
                </div>
              ))}
            </section>
            {meta.ahp && <PublicAhp ahp={meta.ahp} />}
            <section className="gv-sec">
              <header><h4>Superficie por clase</h4></header>
              <div className="gv-stats" style={{ display: 'block' }}>
                <div className="bars">
                  {rows.map(({ code: c, name, ha, pct }) => (
                    <div className="brow" key={c} style={{ gridTemplateColumns: '92px minmax(0,1fr) 92px' }}>
                      <span title={name} style={{ overflowWrap: 'anywhere' }}>{name}</span>
                      <span className="bar"><span className="bfill" style={{ width: `${pct}%`, background: HEX[c] }} /></span>
                      <span className="mono">{pct.toFixed(1)} %</span>
                      <span className="mono muted" style={{ gridColumn: '2 / -1', fontSize: 11 }}>{ha.toLocaleString('es-CO', { maximumFractionDigits: 0 })} ha</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="gv-hint">Área evaluada: {meta.evaluableHa.toLocaleString('es-CO', { maximumFractionDigits: 0 })} ha{view.exclHa > 0 ? ` · exclusión: ${view.exclHa.toLocaleString('es-CO', { maximumFractionDigits: 0 })} ha` : ''} · celdas de {meta.grid.resM} m.</p>
              {view.vetoHa > 0 && <p className="gv-hint">{view.vetoHa.toLocaleString('es-CO', { maximumFractionDigits: 0 })} ha vetadas por algún criterio («{T.critical.toLowerCase()}»): cuentan en la clase «{model.names[view.direction === 'risk' ? model.n - 1 : 0]}».</p>}
            </section>
            {rankRows.length > 0 && (
              <section className="gv-sec">
                <GeoPointsList
                  rows={rankRows} heading={rankHeading(view.direction)} criticalLabel={T.critical}
                  selectedKey={selPoint}
                  onSelect={(k) => { setSelPoint(k); const r = k ? rankRows.find((x) => x.key === k) : null; if (r) mapRef.current?.panTo(r.lat, r.lon); }}
                  onCenter={(k) => { const r = rankRows.find((x) => x.key === k); if (r) { setSelPoint(k); mapRef.current?.flyTo(r.lat, r.lon, 13); } }} />
                <p className="gv-hint">Cada punto toma el índice de la celda donde cae. Los puntos sin evaluar van al final, sin puesto.</p>
              </section>
            )}
            {pubZones && (
              <section className="gv-sec">
                <header><h4>Resumen por zonas</h4><span className="gv-badge ok">{pubZones.rows.length}</span></header>
                <GeoZonesTable
                  rows={pubZones.rows.map((r, i) => ({
                    key: String(i), name: r.name, meanPct: r.meanPct, ha: r.ha, classPct: r.classPct, points: r.points ?? null,
                    ...(pubZones.extremeName ? { pop: r.pop ?? 0, popExtremePct: r.popExtremePct ?? null } : {}),
                  }))}
                  classNames={model.names} indexLabel={view.direction === 'risk' ? 'Riesgo medio' : 'Idoneidad media'}
                  heading={view.direction === 'risk' ? 'Mayor riesgo primero' : 'Más apto primero'}
                  showPoints={pubZones.rows.some((r) => r.points !== undefined)} showPop={!!pubZones.extremeName} extremeName={pubZones.extremeName} />
                <p className="gv-hint">Promedio del índice de las celdas evaluadas de cada zona{pubZones.layer ? ` («${pubZones.layer}»)` : ''}. Una zona sin celdas evaluadas se indica como «Sin área evaluada», no como 0 %.{pubZones.extremeName ? ' La población de cada polígono se asignó a la celda de su centroide.' : ''}</p>
              </section>
            )}
            <section className="gv-sec">
              <p className="gv-hint">Haz clic en el mapa (o, con el teclado, enfócalo, muévelo con las flechas y pulsa Intro) para ver el índice de {T.noun} de un punto. Es un <b>índice de 0 a 100</b> (suma ponderada de criterios), <b>no una probabilidad</b>.</p>
              <p className="gv-hint">Publicado el {new Date(data.updated_at).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })}{meta.attribution ? ` · Datos: ${meta.attribution}` : ''}</p>
            </section>
          </div>
        </aside>
        <section className="gv-main">
          <div className="gv-stage">
            <GeoMap ref={mapRef} basemap={basemap} rasters={rasters} vectors={[]} markers={markers} pointMarks={pointMarks} selectedPointId={selPoint} onPointClick={setSelPoint} draft={null} drawing={false}
              initialBounds={meta.bounds} onClick={onClick} onMove={onMove} onDrawn={() => {}} />
            <div className="gv-hud gv-hud-tr">
              <BasemapChips value={basemap} onChange={setBasemap} />
              <StyleChips value={style} onChange={setStyle} nClasses={model.n} />
              <PaletteChips value={palette} onChange={setPalette} />
              <button type="button" className="gv-fit" onClick={() => mapRef.current?.fit(meta.bounds)}><Icon d={ICONS.fit} size={15} /> Área</button>
            </div>
            <div className="gv-coords mono"><span ref={coordRef}>—</span></div>
            {!planes && <div className="gv-toast" role="status">Cargando el mapa…</div>}
            {planes && <div className="gv-legends"><ResultLegend style={style} model={model} palette={palette} /></div>}
            {point && (
              <div className="gv-point" role="status">
                <button type="button" className="x" aria-label="Cerrar" onClick={() => setSel(null)}>×</button>
                <div className="big">{point.pct === null ? '—' : `${point.pct}%`}</div>
                <span className="cls-pill" style={{ background: `color-mix(in srgb, ${HEX[point.cls]} 22%, transparent)`, borderColor: HEX[point.cls] }}>
                  <span className="dot" style={{ background: HEX[point.cls] }} />{point.label}
                </span>
                <div className="coords mono">{point.lat.toFixed(5)}, {point.lon.toFixed(5)}</div>
                <div className="disc">{T.disclaimer}</div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
