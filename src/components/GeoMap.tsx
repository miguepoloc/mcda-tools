'use client';

/** Mapa web del geovisor (Leaflet): mapa base mundial, pan/zoom, capas ráster reproyectadas como
 * imagen, vectores originales, marcadores, dibujo de un rectángulo y captura a canvas para PNG. Es
 * solo "el lienzo": no sabe nada de AHP; GeoVisor le pasa qué pintar. */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type * as Lf from 'leaflet';
import type { Bounds } from '@/lib/geo/grid';
import type { FC } from '@/lib/geo/vector';

export type BasemapKey = 'sat' | 'osm' | 'topo' | 'ocean' | 'dark';

export const BASEMAPS: Record<BasemapKey, { label: string; url: string; attr: string; maxZoom: number; subdomains?: string }> = {
  sat: { label: 'Satélite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Imágenes © Esri, Maxar, Earthstar Geographics', maxZoom: 18 },
  osm: { label: 'Calles', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© colaboradores de OpenStreetMap', maxZoom: 19 },
  topo: { label: 'Relieve', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap, SRTM · estilo © OpenTopoMap (CC-BY-SA)', maxZoom: 17, subdomains: 'abc' },
  ocean: { label: 'Océano', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', attr: 'Esri, GEBCO, NOAA, National Geographic, DeLorme', maxZoom: 13 },
  dark: { label: 'Oscuro', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attr: '© OpenStreetMap © CARTO', maxZoom: 19, subdomains: 'abcd' },
};

export type RasterOverlay = { id: string; url: string; bounds: Bounds; opacity: number; visible: boolean; z: number };
export type VectorOverlay = { id: string; fc: FC; color: string; visible: boolean };
export type MapMarker = { id: string; lat: number; lon: number; label?: string; selected?: boolean };

export type GeoMapHandle = {
  fit: (b: Bounds) => void;
  /** Extensión lon/lat de lo que se ve ahora (alternativa táctil a dibujar el área con el ratón). */
  getBounds: () => Bounds | null;
  flyTo: (lat: number, lon: number, zoom?: number) => void;
  /** Dibuja mapa base + capas visibles en un canvas (para el PNG). Lanza si el navegador bloquea las teselas. */
  capture: () => Promise<HTMLCanvasElement>;
  size: () => { w: number; h: number };
};

type Props = {
  basemap: BasemapKey;
  rasters: RasterOverlay[];
  vectors: VectorOverlay[];
  markers: MapMarker[];
  draft: Bounds | null;
  drawing: boolean;
  initialBounds: Bounds | null;
  onClick: (lat: number, lon: number) => void;
  onMove: (lat: number, lon: number) => void;
  onDrawn: (b: Bounds) => void;
  onMarkerClick?: (id: string) => void;
};

const toLBounds = (L: typeof Lf, b: Bounds) => L.latLngBounds([b.south, b.west], [b.north, b.east]);
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const GeoMap = forwardRef<GeoMapHandle, Props>(function GeoMap(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const [L, setL] = useState<typeof Lf | null>(null);
  const map = useRef<Lf.Map | null>(null);
  const base = useRef<Lf.TileLayer | null>(null);
  const imgs = useRef(new Map<string, Lf.ImageOverlay>());
  const vecs = useRef(new Map<string, Lf.GeoJSON>());
  const marks = useRef(new Map<string, Lf.CircleMarker>());
  const draftRect = useRef<Lf.Rectangle | null>(null);
  const cb = useRef(props);
  cb.current = props;

  // Leaflet toca `window`: se carga solo en el navegador.
  useEffect(() => {
    let alive = true;
    import('leaflet').then((m) => alive && setL(m.default ?? (m as unknown as typeof Lf)));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!L || !host.current || map.current) return;
    // Con «reducir movimiento» del sistema, sin animaciones de zoom, fundido ni vuelo.
    const calm = reducedMotion();
    const m = L.map(host.current, { zoomControl: false, attributionControl: true, worldCopyJump: true, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90, zoomAnimation: !calm, fadeAnimation: !calm, markerZoomAnimation: !calm });
    m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>');
    L.control.zoom({ position: 'topleft', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(m);
    L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 140 }).addTo(m);
    m.createPane('gv-raster').style.zIndex = '410';
    m.createPane('gv-vector').style.zIndex = '420';
    m.createPane('gv-marks').style.zIndex = '430';
    const ib = cb.current.initialBounds;
    if (ib) m.fitBounds(toLBounds(L, ib), { padding: [30, 30] });
    else m.setView([8, -74], 5);
    m.on('click', (e) => cb.current.onClick(e.latlng.lat, e.latlng.lng));
    // Sin ratón no hay «clic»: con el mapa enfocado, Intro consulta el punto del centro (las flechas lo desplazan).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.target !== m.getContainer()) return;
      e.preventDefault();
      const c = m.getCenter();
      cb.current.onClick(c.lat, c.lng);
    };
    m.getContainer().addEventListener('keydown', onKey);
    m.on('mousemove', (e) => cb.current.onMove(e.latlng.lat, e.latlng.lng));
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(host.current);
    const el = m.getContainer();
    return () => { ro.disconnect(); el.removeEventListener('keydown', onKey); m.remove(); map.current = null; base.current = null; imgs.current.clear(); vecs.current.clear(); marks.current.clear(); draftRect.current = null; };
  }, [L]);

  // mapa base
  useEffect(() => {
    const m = map.current;
    if (!L || !m) return;
    const b = BASEMAPS[props.basemap];
    base.current?.remove();
    base.current = L.tileLayer(b.url, { attribution: b.attr, maxZoom: b.maxZoom, subdomains: b.subdomains ?? 'abc', crossOrigin: true, maxNativeZoom: b.maxZoom }).addTo(m);
    base.current.bringToBack();
  }, [L, props.basemap]);

  // capas ráster
  useEffect(() => {
    const m = map.current;
    if (!L || !m) return;
    const live = new Set(props.rasters.map((r) => r.id));
    for (const [id, o] of imgs.current) if (!live.has(id)) { o.remove(); imgs.current.delete(id); }
    for (const r of props.rasters) {
      let o = imgs.current.get(r.id);
      const bounds = toLBounds(L, r.bounds);
      if (!o) {
        o = L.imageOverlay(r.url, bounds, { pane: 'gv-raster', interactive: false, className: 'gv-px', opacity: r.opacity, zIndex: r.z });
        imgs.current.set(r.id, o);
      } else {
        if (o.getElement()?.getAttribute('src') !== r.url) o.setUrl(r.url);
        o.setBounds(bounds);
        o.setOpacity(r.opacity);
        o.setZIndex(r.z);
      }
      if (r.visible && !m.hasLayer(o)) o.addTo(m);
      if (!r.visible && m.hasLayer(o)) o.remove();
    }
  }, [L, props.rasters]);

  // vectores originales
  useEffect(() => {
    const m = map.current;
    if (!L || !m) return;
    const live = new Set(props.vectors.map((v) => v.id));
    for (const [id, o] of vecs.current) if (!live.has(id)) { o.remove(); vecs.current.delete(id); }
    for (const v of props.vectors) {
      let o = vecs.current.get(v.id);
      if (!o) {
        const renderer = L.canvas({ pane: 'gv-vector' });
        o = L.geoJSON(v.fc as never, {
          pane: 'gv-vector', renderer,
          style: () => ({ color: v.color, weight: 1.5, fillColor: v.color, fillOpacity: 0.12, opacity: 0.95 }),
          pointToLayer: (_f: unknown, ll: Lf.LatLngExpression) => L.circleMarker(ll, { radius: 4, color: v.color, weight: 1.5, fillOpacity: 0.7, pane: 'gv-vector', renderer }),
          interactive: false,
        } as never);
        vecs.current.set(v.id, o);
      }
      if (v.visible && !m.hasLayer(o)) o.addTo(m);
      if (!v.visible && m.hasLayer(o)) o.remove();
    }
  }, [L, props.vectors]);

  // marcadores (puntos de referencia y punto consultado)
  useEffect(() => {
    const m = map.current;
    if (!L || !m) return;
    const live = new Set(props.markers.map((k) => k.id));
    for (const [id, o] of marks.current) if (!live.has(id)) { o.remove(); marks.current.delete(id); }
    for (const k of props.markers) {
      let o = marks.current.get(k.id);
      const style = k.selected
        ? { radius: 9, color: '#0B0F17', weight: 3, fillColor: '#84CC16', fillOpacity: 1 }
        : { radius: 6, color: '#0B0F17', weight: 2, fillColor: '#ffffff', fillOpacity: 1 };
      if (!o) {
        o = L.circleMarker([k.lat, k.lon], { ...style, pane: 'gv-marks' }).addTo(m);
        o.on('click', (e) => { L.DomEvent.stopPropagation(e); cb.current.onMarkerClick?.(k.id); });
        marks.current.set(k.id, o);
      } else { o.setLatLng([k.lat, k.lon]); o.setStyle(style); }
      if (k.label) o.bindTooltip(k.label, { direction: 'top', offset: [0, -6] });
      if (k.selected) o.bringToFront();
    }
  }, [L, props.markers]);

  // rectángulo del área de estudio (borrador) + dibujo
  useEffect(() => {
    const m = map.current;
    if (!L || !m) return;
    draftRect.current?.remove(); draftRect.current = null;
    if (props.draft) {
      draftRect.current = L.rectangle(toLBounds(L, props.draft), { color: '#84CC16', weight: 2, dashArray: '6 4', fillOpacity: 0.08, interactive: false, pane: 'gv-vector' }).addTo(m);
    }
  }, [L, props.draft]);

  useEffect(() => {
    const m = map.current;
    if (!L || !m || !props.drawing) return;
    const el = m.getContainer();
    let start: Lf.LatLng | null = null;
    let rect: Lf.Rectangle | null = null;
    m.dragging.disable(); el.style.cursor = 'crosshair';
    const down = (e: Lf.LeafletMouseEvent) => { start = e.latlng; };
    const move = (e: Lf.LeafletMouseEvent) => {
      if (!start) return;
      const b = L.latLngBounds(start, e.latlng);
      if (!rect) rect = L.rectangle(b, { color: '#84CC16', weight: 2, interactive: false, pane: 'gv-vector' }).addTo(m); else rect.setBounds(b);
    };
    const up = (e: Lf.LeafletMouseEvent) => {
      if (!start) return;
      const b = L.latLngBounds(start, e.latlng);
      rect?.remove(); rect = null; start = null;
      if (b.getEast() - b.getWest() > 1e-5 && b.getNorth() - b.getSouth() > 1e-5) cb.current.onDrawn({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
    };
    m.on('mousedown', down); m.on('mousemove', move); m.on('mouseup', up);
    return () => { m.off('mousedown', down); m.off('mousemove', move); m.off('mouseup', up); rect?.remove(); m.dragging.enable(); el.style.cursor = ''; };
  }, [L, props.drawing]);

  useImperativeHandle(ref, () => ({
    fit: (b) => { if (L && map.current) map.current.fitBounds(toLBounds(L, b), { padding: [30, 30], animate: !reducedMotion() }); },
    getBounds: () => {
      const b = map.current?.getBounds();
      return b ? { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() } : null;
    },
    flyTo: (lat, lon, zoom) => {
      const m = map.current; if (!m) return;
      const z = zoom ?? Math.max(m.getZoom(), 12);
      if (reducedMotion()) m.setView([lat, lon], z, { animate: false }); else m.flyTo([lat, lon], z, { duration: 0.8 });
    },
    size: () => { const s = map.current?.getSize(); return { w: s?.x ?? 0, h: s?.y ?? 0 }; },
    capture: async () => {
      const m = map.current;
      if (!m) throw new Error('El mapa no está listo.');
      const root = m.getContainer(), rr = root.getBoundingClientRect();
      const cv = document.createElement('canvas');
      cv.width = Math.round(rr.width); cv.height = Math.round(rr.height);
      const ctx = cv.getContext('2d');
      if (!ctx) throw new Error('No se pudo crear el lienzo.');
      ctx.fillStyle = '#0B0F17'; ctx.fillRect(0, 0, cv.width, cv.height);
      const draw = (img: HTMLImageElement, alpha = 1, smooth = true) => {
        const r = img.getBoundingClientRect();
        if (!img.complete || !r.width) return;
        ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = smooth;
        ctx.drawImage(img, r.left - rr.left, r.top - rr.top, r.width, r.height);
      };
      root.querySelectorAll<HTMLImageElement>('.leaflet-tile-pane img.leaflet-tile').forEach((i) => draw(i));
      root.querySelectorAll<HTMLImageElement>('.leaflet-gv-raster-pane img').forEach((i) => draw(i, Number(i.style.opacity || 1), false));
      root.querySelectorAll<HTMLCanvasElement>('.leaflet-gv-vector-pane canvas').forEach((c) => {
        const r = c.getBoundingClientRect();
        ctx.globalAlpha = 1; ctx.drawImage(c, r.left - rr.left, r.top - rr.top, r.width, r.height);
      });
      ctx.globalAlpha = 1;
      cv.toDataURL('image/png'); // lanza SecurityError si alguna tesela contaminó el lienzo
      return cv;
    },
  }), [L]);

  return <div ref={host} className="gv-leaflet" role="application" aria-label="Mapa interactivo. Con el mapa enfocado: flechas para moverte, más y menos para acercar, Intro para consultar la idoneidad del punto central." />;
});

export default GeoMap;
