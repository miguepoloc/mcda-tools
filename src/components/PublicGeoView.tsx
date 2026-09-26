'use client';

/** Vista pública (solo lectura) de un mapa de aptitud publicado: el mapa, las clases, los pesos, el análisis AHP de los criterios
 * (si se publicó) y, al hacer clic, el % de idoneidad del punto. Recibe únicamente el resultado publicado (dos planos Uint8 +
 * metadatos): nunca las capas de entrada ni los nombres de los expertos. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lonLatToPixel, pixelToLonLat } from '@/lib/geo/crs';
import { toUrl } from '@/lib/geo/canvas';
import { buildOverlayMap } from '@/lib/geo/overlay';
import { CLASS_LABEL, PALETTES, classHex, paintResult } from '@/lib/geo/paint';
import { decodePlanes, type PublishedMeta } from '@/lib/geo/publish';
import { CLASS_ALTA, CLASS_EXCLUDED, CLASS_MODERADA, CLASS_NO_APTA, MASK_EXCLUDED, MASK_NODATA } from '@/lib/geo/suitability';
import GeoMap, { type BasemapKey, type GeoMapHandle, type MapMarker, type RasterOverlay } from './GeoMap';
import { BasemapChips, PaletteChips, ResultLegend, StyleChips } from './GeoHud';
import { Icon, ICONS, usePalette } from './GeoBits';
import PublicAhp from './PublicAhp';

export type PublicGeo = { status: 'ok'; title: string; objective: string; grid_b64: string; meta: PublishedMeta; updated_at: string };

/** Variables CSS de clase según la paleta (recuadros de color de los paneles). */
const paletteVars = (pal: keyof typeof PALETTES) => {
  const h = classHex(pal);
  return { '--geo-alta': h[CLASS_ALTA], '--geo-media': h[CLASS_MODERADA], '--geo-noapta': h[CLASS_NO_APTA], '--geo-excl': h[CLASS_EXCLUDED] } as React.CSSProperties;
};

export default function PublicGeoView({ data }: { data: PublicGeo }) {
  const { meta } = data;
  const [planes, setPlanes] = useState<Awaited<ReturnType<typeof decodePlanes>> | null>(null);
  const [error, setError] = useState('');
  const [basemap, setBasemap] = useState<BasemapKey>('sat');
  const [style, setStyle] = useState<'continuous' | 'classes'>('continuous');
  const [palette, setPalette] = usePalette();
  const HEX = useMemo(() => classHex(palette), [palette]);
  const [sel, setSel] = useState<{ col: number; row: number } | null>(null);
  const mapRef = useRef<GeoMapHandle>(null);
  const coordRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let alive = true;
    decodePlanes(data.grid_b64, meta.grid.width * meta.grid.height).then((p) => alive && setPlanes(p)).catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; };
  }, [data.grid_b64, meta.grid.width, meta.grid.height]);

  const om = useMemo(() => buildOverlayMap(meta.grid, 'mercator'), [meta.grid]);
  const rasters = useMemo<RasterOverlay[]>(() => (planes ? [{ id: 'result', url: toUrl(om, paintResult(planes.pct, planes.cls, planes.mask, style, palette)), bounds: om.bounds, opacity: 0.9, visible: true, z: 20 }] : []), [planes, om, style, palette]);

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
    return { lat, lon, pct: planes.pct[i], cls: planes.cls[i], label: CLASS_LABEL[planes.cls[i]] };
  }, [sel, planes, meta.grid]);
  const markers = useMemo<MapMarker[]>(() => (point ? [{ id: 'sel', lat: point.lat, lon: point.lon, selected: true }] : []), [point]);

  if (error) return <div className="banner"><span><b>No se pudo mostrar el mapa:</b> {error}</span></div>;
  const rows = [[CLASS_ALTA, meta.classes.alta, meta.pct.alta], [CLASS_MODERADA, meta.classes.media, meta.pct.media], [CLASS_NO_APTA, meta.classes.noapta, meta.pct.noapta]] as const;

  return (
    <div className="gv-wrap gv-public">
      <div className="gv-shell" style={paletteVars(palette)}>
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
                  {rows.map(([c, ha, pct]) => (
                    <div className="brow" key={c} style={{ gridTemplateColumns: '92px minmax(0,1fr) 92px' }}>
                      <span>{CLASS_LABEL[c]}</span>
                      <span className="bar"><span className="bfill" style={{ width: `${pct}%`, background: HEX[c] }} /></span>
                      <span className="mono">{pct.toFixed(1)} %</span>
                      <span className="mono muted" style={{ gridColumn: '2 / -1', fontSize: 11 }}>{ha.toLocaleString('es-CO', { maximumFractionDigits: 0 })} ha</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="gv-hint">Área evaluada: {meta.evaluableHa.toLocaleString('es-CO', { maximumFractionDigits: 0 })} ha{meta.classes.excl > 0 ? ` · exclusión: ${meta.classes.excl.toLocaleString('es-CO', { maximumFractionDigits: 0 })} ha` : ''} · celdas de {meta.grid.resM} m.</p>
            </section>
            <section className="gv-sec">
              <p className="gv-hint">Haz clic en el mapa (o, con el teclado, enfócalo, muévelo con las flechas y pulsa Intro) para ver la idoneidad de un punto. Es un <b>índice de 0 a 100</b> (suma ponderada de criterios), <b>no una probabilidad</b>.</p>
              <p className="gv-hint">Publicado el {new Date(data.updated_at).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })}{meta.attribution ? ` · Datos: ${meta.attribution}` : ''}</p>
            </section>
          </div>
        </aside>
        <section className="gv-main">
          <div className="gv-stage">
            <GeoMap ref={mapRef} basemap={basemap} rasters={rasters} vectors={[]} markers={markers} draft={null} drawing={false}
              initialBounds={meta.bounds} onClick={onClick} onMove={onMove} onDrawn={() => {}} />
            <div className="gv-hud gv-hud-tr">
              <BasemapChips value={basemap} onChange={setBasemap} />
              <StyleChips value={style} onChange={setStyle} />
              <PaletteChips value={palette} onChange={setPalette} />
              <button type="button" className="gv-fit" onClick={() => mapRef.current?.fit(meta.bounds)}><Icon d={ICONS.fit} size={15} /> Área</button>
            </div>
            <div className="gv-coords mono"><span ref={coordRef}>—</span></div>
            {!planes && <div className="gv-toast" role="status">Cargando el mapa…</div>}
            {planes && <div className="gv-legends"><ResultLegend style={style} thresholds={meta.thresholds} palette={palette} /></div>}
            {point && (
              <div className="gv-point" role="status">
                <button type="button" className="x" aria-label="Cerrar" onClick={() => setSel(null)}>×</button>
                <div className="big">{point.pct === null ? '—' : `${point.pct}%`}</div>
                <span className="cls-pill" style={{ background: `color-mix(in srgb, ${HEX[point.cls]} 22%, transparent)`, borderColor: HEX[point.cls] }}>
                  <span className="dot" style={{ background: HEX[point.cls] }} />{point.label}
                </span>
                <div className="coords mono">{point.lat.toFixed(5)}, {point.lon.toFixed(5)}</div>
                <div className="disc">Índice de idoneidad 0–100, no una probabilidad.</div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
