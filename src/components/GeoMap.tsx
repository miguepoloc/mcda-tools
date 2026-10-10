'use client';

/** Mapa web del geovisor (Leaflet): mapa base mundial, pan/zoom, capas ráster reproyectadas como
 * imagen, vectores originales, marcadores, dibujo de un rectángulo y captura a canvas para PNG. Es
 * solo "el lienzo": no sabe nada de AHP; GeoVisor le pasa qué pintar. */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type * as Lf from 'leaflet';
import type { Bounds } from '@/lib/geo/grid';
import type { FC } from '@/lib/geo/vector';
import { estimateLabelWidth, labelPriority, labelText, layoutLabels, LABEL_H, type LabelMode } from '@/lib/geo/pointLabels';

export type BasemapKey = 'sat' | 'osm' | 'topo' | 'ocean' | 'dark';

export const BASEMAPS: Record<BasemapKey, { label: string; url: string; attr: string; maxZoom: number; subdomains?: string }> = {
  sat: { label: 'Satélite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Imágenes © Esri, Maxar, Earthstar Geographics', maxZoom: 18 },
  osm: { label: 'Calles', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© colaboradores de OpenStreetMap', maxZoom: 19 },
  topo: { label: 'Relieve', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap, SRTM · estilo © OpenTopoMap (CC-BY-SA)', maxZoom: 17, subdomains: 'abc' },
  ocean: { label: 'Océano', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', attr: 'Esri, GEBCO, NOAA, National Geographic, DeLorme', maxZoom: 13 },
  dark: { label: 'Oscuro', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attr: '© OpenStreetMap © CARTO', maxZoom: 19, subdomains: 'abcd' },
};

export type RasterOverlay = { id: string; url: string; bounds: Bounds; opacity: number; visible: boolean; z: number };
/** `weight`/`fillOpacity`: estilo del contorno y del relleno (referencia: relleno 0 = solo contorno). `fills[i]`: color de
 * relleno del elemento i (coroplético; null = sin color). `labels[i]`: etiqueta permanente del elemento i. */
export type VectorOverlay = {
  id: string; fc: FC; color: string; visible: boolean;
  weight?: number; fillOpacity?: number; fills?: (string | null)[]; labels?: (string | null)[];
};
export type MapMarker = { id: string; lat: number; lon: number; label?: string; selected?: boolean };
/** Punto del ranking: `color` = el de su clase (gris si no se evaluó), `tip` = «nombre · índice», `rank` = puesto (null = sin puesto). */
export type PointMark = { id: string; lat: number; lon: number; tip: string; color: string; rank: number | null; name: string; pct: number | null };

/** Estilo de un punto del ranking: el seleccionado es más grande y con aro blanco (no solo cambia el color); el que no
 * se evaluó va con relleno traslúcido y borde discontinuo. */
const pointStyle = (k: PointMark, selected: boolean): Lf.PathOptions & { radius: number } => ({
  radius: selected ? 10 : 6, color: selected ? '#FFFFFF' : '#0B0F17', weight: selected ? 3 : 2, fillColor: k.color,
  fillOpacity: k.rank === null ? 0.5 : 1, dashArray: k.rank === null && !selected ? '3 2' : undefined,
});

export type GeoMapHandle = {
  fit: (b: Bounds) => void;
  /** Extensión lon/lat de lo que se ve ahora (alternativa táctil a dibujar el área con el ratón). */
  getBounds: () => Bounds | null;
  flyTo: (lat: number, lon: number, zoom?: number) => void;
  /** Centra suavemente sin cambiar el zoom (sin animación con «reducir movimiento»). */
  panTo: (lat: number, lon: number) => void;
  /** Dibuja mapa base + capas visibles en un canvas (para el PNG). Lanza si el navegador bloquea las teselas. */
  capture: () => Promise<HTMLCanvasElement>;
  size: () => { w: number; h: number };
};

type Props = {
  basemap: BasemapKey;
  rasters: RasterOverlay[];
  vectors: VectorOverlay[];
  markers: MapMarker[];
  /** Puntos del ranking (capa aparte de `markers`: cambiarlos no recrea los de referencia ni el de selección). */
  pointMarks?: PointMark[];
  selectedPointId?: string | null;
  /** Modo «Agregar punto»: cursor de cruz; el clic lo interpreta quien lo recibe. */
  addMode?: boolean;
  onPointClick?: (id: string) => void;
  /** Etiquetas permanentes con el nombre de cada punto (null/ausente = apagadas). Solo caben las que no se solapan. */
  labels?: { mode: LabelMode } | null;
  /** Avisa si hubo etiquetas descartadas por falta de lugar («Acerca el mapa para ver más nombres»). */
  onLabelsTrimmed?: (trimmed: boolean) => void;
  draft: Bounds | null;
  drawing: boolean;
  initialBounds: Bounds | null;
  onClick: (lat: number, lon: number) => void;
  onMove: (lat: number, lon: number) => void;
  onDrawn: (b: Bounds) => void;
  onMarkerClick?: (id: string) => void;
};

/** Tooltip como nodo de texto: Leaflet interpreta un string como HTML y los nombres de los puntos los escribe (o importa) el usuario. */
const tipEl = (text: string) => { const s = document.createElement('span'); s.textContent = text; return s; };
const toLBounds =(L: typeof Lf, b: Bounds) => L.latLngBounds([b.south, b.west], [b.north, b.east]);
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const GeoMap = forwardRef<GeoMapHandle, Props>(function GeoMap(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const [L, setL] = useState<typeof Lf | null>(null);
  const map = useRef<Lf.Map | null>(null);
  const base = useRef<Lf.TileLayer | null>(null);
  const imgs = useRef(new Map<string, Lf.ImageOverlay>());
  const vecs = useRef(new Map<string, Lf.GeoJSON>());
  const vsig = useRef(new Map<string, string>());
  const marks = useRef(new Map<string, Lf.CircleMarker>());
  /** Marcadores del ranking: `sig` = lo que determina su estilo, `tip` = el texto del tooltip ya puesto. */
  const pmarks = useRef(new Map<string, { o: Lf.CircleMarker; sig: string; tip: string; mark: PointMark }>());
  const lastSel = useRef<string | null>(null);
  /** Etiquetas permanentes puestas ahora (el `el` es un nodo de texto propio: nunca HTML). */
  const lmarks = useRef(new Map<string, { o: Lf.Marker; el: HTMLElement; text: string; sel: boolean; lat: number; lon: number }>());
  /** Lo que se ve rotulado (para dibujarlo en el PNG) y si hubo descartes. */
  const shownLabels = useRef<{ text: string; lat: number; lon: number }[]>([]);
  const trimmed = useRef(false);
  const relabel = useRef<() => void>(() => {});
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
    const m = L.map(host.current, { zoomControl: false, attributionControl: true, worldCopyJump: true, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90, scrollWheelZoom: false, zoomAnimation: !calm, fadeAnimation: !calm, markerZoomAnimation: !calm });
    m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>');
    L.control.zoom({ position: 'topleft', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(m);
    L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 140 }).addTo(m);
    m.createPane('gv-raster').style.zIndex = '410';
    m.createPane('gv-vector').style.zIndex = '420';
    m.createPane('gv-marks').style.zIndex = '430';
    const lp = m.createPane('gv-labels');
    lp.style.zIndex = '440'; lp.style.pointerEvents = 'none';
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
    // La rueda solo acerca con Ctrl/⌘ (o el pellizco del panel táctil, que llega como Ctrl + rueda): sin tecla, la
    // página sigue desplazándose y se muestra un aviso breve. Zoom táctil y teclado (+/−) no pasan por aquí.
    const box = m.getContainer();
    const hint = document.createElement('div');
    hint.className = 'gv-wheelhint';
    hint.setAttribute('role', 'status');
    box.appendChild(hint);
    let hintTimer: ReturnType<typeof setTimeout> | undefined;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) {
        hint.textContent = navigator.platform?.includes('Mac') ? '⌘ + rueda para acercar' : 'Ctrl + rueda para acercar';
        hint.classList.add('on');
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => { hint.classList.remove('on'); hint.textContent = ''; }, 1600);
        return;
      }
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? 400 : 1);
      acc -= dy;
      const snap = m.options.zoomSnap || 0.25;
      const steps = Math.trunc(acc / (90 * snap));
      if (!steps) return;
      acc -= steps * 90 * snap;
      m.setZoomAround(m.mouseEventToContainerPoint(e), m.getZoom() + steps * snap, { animate: false });
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    m.on('mousemove', (e) => cb.current.onMove(e.latlng.lat, e.latlng.lng));
    // Las etiquetas se reparten de nuevo al terminar de mover, acercar o redimensionar (con debounce).
    let labelTimer: ReturnType<typeof setTimeout> | undefined;
    const onView = () => { clearTimeout(labelTimer); labelTimer = setTimeout(() => relabel.current(), 120); };
    m.on('moveend zoomend resize', onView);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(host.current);
    const el = m.getContainer();
    return () => { clearTimeout(labelTimer); ro.disconnect(); el.removeEventListener('keydown', onKey); el.removeEventListener('wheel', onWheel); clearTimeout(hintTimer); hint.remove(); m.remove(); map.current = null; base.current = null; imgs.current.clear(); vecs.current.clear(); marks.current.clear(); pmarks.current.clear(); lmarks.current.clear(); shownLabels.current = []; trimmed.current = false; lastSel.current = null; draftRect.current = null; };
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
    for (const [id, o] of vecs.current) if (!live.has(id)) { o.remove(); vecs.current.delete(id); vsig.current.delete(id); }
    for (const v of props.vectors) {
      let o = vecs.current.get(v.id);
      // Estilo/relleno/etiquetas cambian la capa: se recrea (el FeatureCollection es el mismo objeto; la firma evita rehacerla sin motivo).
      const sig = `${v.fc.features.length}|${v.color}|${v.weight ?? ''}|${v.fillOpacity ?? ''}|${(v.fills ?? []).join(',')}|${(v.labels ?? []).join('¦')}`;
      if (o && (vsig.current.get(v.id) !== sig || (o as unknown as { __fc?: FC }).__fc !== v.fc)) { o.remove(); vecs.current.delete(v.id); o = undefined; }
      if (!o) {
        const renderer = L.canvas({ pane: 'gv-vector' });
        const order = new Map(v.fc.features.map((f, i) => [f, i] as const));
        o = L.geoJSON(v.fc as never, {
          pane: 'gv-vector', renderer,
          style: (f: unknown) => {
            const i = order.get(f as never) ?? -1;
            const fill = v.fills?.[i];
            return { color: v.color, weight: v.weight ?? 1.5, fillColor: fill ?? v.color, fillOpacity: fill ? 0.55 : (v.fillOpacity ?? 0.12), opacity: 0.95 };
          },
          pointToLayer: (_f: unknown, ll: Lf.LatLngExpression) => L.circleMarker(ll, { radius: 4, color: v.color, weight: 1.5, fillOpacity: 0.7, pane: 'gv-vector', renderer }),
          onEachFeature: (f: unknown, lyr: Lf.Layer) => {
            const t = v.labels?.[order.get(f as never) ?? -1];
            if (t) lyr.bindTooltip(tipEl(t), { permanent: true, direction: 'center', className: 'gv-zlabel' });
          },
          interactive: false,
        } as never);
        (o as unknown as { __fc?: FC }).__fc = v.fc;
        vecs.current.set(v.id, o);
        vsig.current.set(v.id, sig);
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

  // puntos del ranking: se actualizan en sitio (posición, estilo y tooltip solo si cambian) para que 300 puntos no
  // recreen capas en cada pasada.
  useEffect(() => {
    const m = map.current;
    if (!L || !m) return;
    const list = props.pointMarks ?? [];
    const live = new Set(list.map((k) => k.id));
    for (const [id, e] of pmarks.current) if (!live.has(id)) { e.o.remove(); pmarks.current.delete(id); }
    const selId = cb.current.selectedPointId ?? null;
    for (const k of list) {
      const sig = `${k.color}|${k.rank === null}`;
      const e = pmarks.current.get(k.id);
      if (!e) {
        const o = L.circleMarker([k.lat, k.lon], { ...pointStyle(k, k.id === selId), pane: 'gv-marks', bubblingMouseEvents: false }).addTo(m);
        o.bindTooltip(tipEl(k.tip), { direction: 'top', offset: [0, -6] });
        o.on('click', (ev) => { L.DomEvent.stopPropagation(ev); cb.current.onPointClick?.(k.id); });
        pmarks.current.set(k.id, { o, sig, tip: k.tip, mark: k });
        continue;
      }
      if (e.mark.lat !== k.lat || e.mark.lon !== k.lon) e.o.setLatLng([k.lat, k.lon]);
      if (e.sig !== sig) { e.o.setStyle(pointStyle(k, k.id === selId)); e.sig = sig; }
      if (e.tip !== k.tip) { e.o.setTooltipContent(tipEl(k.tip)); e.tip = k.tip; }
      e.mark = k;
    }
  }, [L, props.pointMarks]);

  // punto seleccionado (tabla <-> mapa): solo se re-estilan el anterior y el nuevo
  useEffect(() => {
    const id = props.selectedPointId ?? null;
    const prev = lastSel.current;
    lastSel.current = id;
    if (prev && prev !== id) { const e = pmarks.current.get(prev); if (e) e.o.setStyle(pointStyle(e.mark, false)); }
    if (id) { const e = pmarks.current.get(id); if (e) { e.o.setStyle(pointStyle(e.mark, true)); e.o.bringToFront(); } }
  }, [L, props.selectedPointId]);

  // etiquetas con el nombre: solo las que caben (descarte voraz por puesto, ver `lib/geo/pointLabels.ts`). Se actualizan en
  // sitio; el texto va como nodo de texto porque los nombres los escribe o importa el usuario.
  const labelMode = props.labels?.mode ?? null;
  useEffect(() => {
    const m = map.current;
    if (!L || !m) return;
    const run = () => {
      const lab = cb.current.labels;
      const list = lab ? cb.current.pointMarks ?? [] : [];
      let visible: string[] = [];
      let hidden = 0;
      const byId = new Map(list.map((k) => [k.id, k]));
      if (lab && list.length) {
        const size = m.getSize();
        const selId = cb.current.selectedPointId ?? null;
        const items = list.map((k, i) => {
          const p = m.latLngToContainerPoint([k.lat, k.lon]);
          return { id: k.id, x: p.x, y: p.y, w: estimateLabelWidth(labelText(k, lab.mode)), h: LABEL_H, priority: labelPriority(k.rank, k.id === selId, i) };
        });
        ({ visible, hidden } = layoutLabels(items, { width: size.x, height: size.y }));
      }
      const keep = new Set(visible);
      for (const [id, e] of lmarks.current) if (!keep.has(id)) { e.o.remove(); lmarks.current.delete(id); }
      const selId = cb.current.selectedPointId ?? null;
      const shown: { text: string; lat: number; lon: number }[] = [];
      for (const id of visible) {
        const k = byId.get(id);
        if (!k || !lab) continue;
        const text = labelText(k, lab.mode);
        const sel = id === selId;
        shown.push({ text, lat: k.lat, lon: k.lon });
        const e = lmarks.current.get(id);
        if (!e) {
          const el = document.createElement('div');
          el.className = 'gv-plabel' + (sel ? ' sel' : '');
          el.textContent = text;
          const o = L.marker([k.lat, k.lon], { icon: L.divIcon({ className: 'gv-plabel-icon', html: el, iconSize: [0, 0] }), interactive: false, keyboard: false, pane: 'gv-labels' }).addTo(m);
          lmarks.current.set(id, { o, el, text, sel, lat: k.lat, lon: k.lon });
          continue;
        }
        if (e.text !== text) { e.el.textContent = text; e.text = text; }
        if (e.sel !== sel) { e.el.classList.toggle('sel', sel); e.sel = sel; }
        if (e.lat !== k.lat || e.lon !== k.lon) { e.o.setLatLng([k.lat, k.lon]); e.lat = k.lat; e.lon = k.lon; }
      }
      shownLabels.current = shown;
      const t = hidden > 0;
      if (trimmed.current !== t) { trimmed.current = t; cb.current.onLabelsTrimmed?.(t); }
    };
    relabel.current = run;
    run();
  }, [L, props.pointMarks, labelMode, props.selectedPointId]);

  // modo «Agregar punto»: cursor de cruz sobre el mapa
  useEffect(() => {
    const m = map.current;
    if (!L || !m) return;
    const el = m.getContainer();
    if (props.addMode) el.classList.add('gv-addmode'); else el.classList.remove('gv-addmode');
    return () => el.classList.remove('gv-addmode');
  }, [L, props.addMode]);

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
    panTo: (lat, lon) => { map.current?.panTo([lat, lon], { animate: !reducedMotion(), duration: 0.5 }); },
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
      // Los marcadores de puntos son SVG (no canvas): se dibujan aquí a mano con su posición actual en pantalla.
      const pm = cb.current.pointMarks ?? [];
      const labels = pm.length <= 100;
      ctx.globalAlpha = 1;
      for (const k of pm) {
        const p = m.latLngToContainerPoint([k.lat, k.lon]);
        if (p.x < -12 || p.y < -12 || p.x > cv.width + 12 || p.y > cv.height + 12) continue;
        ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.globalAlpha = k.rank === null ? 0.55 : 1;
        ctx.fillStyle = k.color; ctx.fill();
        ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeStyle = '#0B0F17'; ctx.stroke();
        if (k.rank !== null && labels) {
          ctx.font = '700 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 2.5; ctx.strokeStyle = '#0B0F17'; ctx.strokeText(String(k.rank), p.x, p.y + 0.5);
          ctx.fillStyle = '#FFFFFF'; ctx.fillText(String(k.rank), p.x, p.y + 0.5);
          ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
        }
      }
      // Etiquetas con nombre (si el interruptor está activo): las mismas que se ven en el mapa, con su caja.
      if (cb.current.labels && shownLabels.current.length) {
        ctx.font = '600 11px system-ui, sans-serif'; ctx.textBaseline = 'middle';
        for (const l of shownLabels.current) {
          const p = m.latLngToContainerPoint([l.lat, l.lon]);
          const w = Math.min(170, ctx.measureText(l.text).width + 12);
          ctx.globalAlpha = 1;
          ctx.fillStyle = 'rgba(11,15,23,.8)'; ctx.fillRect(p.x + 9, p.y - 10, w, 20);
          ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.strokeRect(p.x + 9.5, p.y - 9.5, w - 1, 19);
          ctx.fillStyle = '#FFFFFF'; ctx.fillText(l.text, p.x + 15, p.y + 0.5, w - 12);
        }
        ctx.textBaseline = 'alphabetic';
      }
      ctx.globalAlpha = 1;
      cv.toDataURL('image/png'); // lanza SecurityError si alguna tesela contaminó el lienzo
      return cv;
    },
  }), [L]);

  return <div ref={host} className="gv-leaflet" role="application" aria-label="Mapa interactivo. Con el mapa enfocado: flechas para moverte, más y menos para acercar, Intro para consultar la idoneidad del punto central." />;
});

export default GeoMap;
