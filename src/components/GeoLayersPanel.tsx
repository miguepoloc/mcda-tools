'use client';

/** Pestaña «Capas» del geovisor: define el área de estudio (grilla), recibe archivos del estudiante
 * (GeoTIFF, GeoJSON, shapefile .zip, KML, GPX), los alinea a la grilla y los guarda; y lista las
 * capas con visibilidad, opacidad y borrado. */
import { useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { boundsIssue, boundsWarning, estimatePixels, gridBoundsLonLat, gridFromBounds, MAX_PIXELS, padBounds, suggestRes, unionBounds, type Bounds } from '@/lib/geo/grid';
import { parseFile, type Parsed } from '@/lib/geo/parse';
import { burn, distanceLayerPadded, interpolateSurface, type FC } from '@/lib/geo/vector';
import { layerRange, resampleToGrid } from '@/lib/geo/raster';
import { isQuotaError, layerPath, removeLayers, uploadLayer, type Quota } from '@/lib/geo/store';
import { slug } from '@/lib/geo/export';
import type { GeoData } from '@/lib/geo/data';
import type { FnSpec } from '@/lib/geo/membership';
import { RAW_RAMP_CSS, rampCss, type PaletteKey } from '@/lib/geo/paint';
import type { Criterion, GeoConfig, GeoGrid, GeoLayerMeta } from '@/lib/types';
import { Icon, ICONS, Num } from './GeoBits';

const kmFmt = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`);

export type VecItem = { id: string; name: string; fc: FC; color: string };
export type VisState = Record<string, { on: boolean; op: number }>;

type Role = GeoLayerMeta['role'];
type Pending = {
  pid: string; parsed: Parsed; label: string; unit: string; role: Role; criterionId: string;
  mode: 'distance' | 'presence' | 'attr' | 'surface'; field: string; categorical: boolean;
  status: 'idle' | 'working' | 'error'; err?: string;
};

const COLORS = ['#22D3EE', '#F472B6', '#FACC15', '#A78BFA', '#FB923C', '#34D399'];
const ROLE_LABEL: Record<Role, string> = { criterion: 'Criterio', exclusion: 'Exclusión', area: 'Área de estudio' };
const ROLE_HINT: Record<Role, string> = {
  criterion: 'Un valor por celda que alimenta un criterio (temperatura, profundidad, distancia a algo…).',
  exclusion: 'Zonas donde NO se puede instalar (p. ej. concesiones). Se muestran en gris y no entran al cálculo.',
  area: 'La zona que se analiza (p. ej. la isóbata de 200 m). Fuera de ella no se calcula nada.',
};

const bytesFmt = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function defaultFn(min: number, max: number): FnSpec { return { type: 'up', a: min, b: max > min ? max : min + 1 }; }

function makePending(parsed: Parsed, defaultCriterion: string): Pending {
  const vec = parsed.kind === 'vector';
  return {
    pid: Math.random().toString(36).slice(2, 8), parsed, label: parsed.name.replace(/[_-]+/g, ' '),
    unit: vec ? 'm' : '', role: 'criterion', criterionId: defaultCriterion,
    mode: 'distance', field: parsed.kind === 'vector' ? parsed.fields[0] ?? '' : '', categorical: false, status: 'idle',
  };
}

type Props = {
  geo: GeoConfig; data: GeoData | null; criteria: Criterion[];
  commit: (mutate: (g: GeoConfig) => GeoConfig) => void;
  cache: MutableRefObject<Record<string, Float32Array>>;
  sb: SupabaseClient | null; ownerId: string; projectId: string;
  vecs: VecItem[]; setVecs: Dispatch<SetStateAction<VecItem[]>>;
  vis: VisState; setVis: Dispatch<SetStateAction<VisState>>;
  fit: (b: Bounds) => void;
  /** Extensión que se ve en el mapa ahora (alternativa táctil a dibujar con el ratón). */
  getView?: () => Bounds | null;
  palette: PaletteKey;
  draft: Bounds | null; setDraft: (b: Bounds | null) => void;
  drawing: boolean; setDrawing: (d: boolean) => void;
  quota: Quota | null; onQuotaChange: () => void;
  /** Criterio para el que se está subiendo un mapa (viene del botón «Subir el mapa de este criterio»). */
  uploadFor?: string | null; onCancelUpload?: () => void; onLayerAdded?: (criterionId: string) => void;
  virtual: { id: string; label: string; role: string; swatch: string }[];
};

export default function GeoLayersPanel(p: Props) {
  const { geo, data } = p;
  const isPack = !!geo.packId;
  const grid = geo.grid;
  // Grilla a la que se alinean los archivos nuevos: la propia del proyecto o, en un proyecto con
  // paquete del curso (solo lectura), la del paquete — así lo que subes calza con sus capas.
  const targetGrid = isPack ? data?.grid : grid;
  const [pending, setPending] = useState<Pending[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [confirmArea, setConfirmArea] = useState(false);
  const [bbox, setBbox] = useState<Bounds | null>(null);
  const [res, setRes] = useState(250);
  const [editingArea, setEditingArea] = useState(false);
  const [touched, setTouched] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const layers = geo.layers ?? {};
  const maxPx = p.quota?.max_pixels ?? MAX_PIXELS;

  // el rectángulo dibujado en el mapa alimenta el formulario del área
  useEffect(() => {
    if (p.draft && p.drawing === false && touched) { setBbox(p.draft); setRes(suggestRes(p.draft)); }
  }, [p.draft]);

  // El área propuesta la manda el archivo marcado «Área de estudio»; si no hay, los criterios; las
  // exclusiones (p. ej. concesiones de todo el país) nunca agrandan la grilla por sí solas.
  const pendingBounds = useMemo(() => {
    const pick = (r: Role) => pending.filter((x) => x.role === r);
    const set = pick('area').length ? pick('area') : pick('criterion').length ? pick('criterion') : pending;
    return set.reduce<Bounds | null>((acc, x) => unionBounds(acc, x.parsed.bounds), null);
  }, [pending]);
  useEffect(() => {
    if (grid || isPack || touched || !pendingBounds) return;
    const b = padBounds(pendingBounds, 0.05);
    setBbox(b); setRes(suggestRes(b)); p.setDraft(b); p.fit(b);
  }, [pendingBounds]); // eslint-disable-line react-hooks/exhaustive-deps
  const px = bbox ? estimatePixels(bbox, res) : 0;

  async function onFiles(files: FileList | File[]) {
    setMsg('');
    const list = Array.from(files);
    const next: Pending[] = [];
    const errs: string[] = [];
    for (const f of list) {
      try {
        const parsed = await parseFile(f);
        for (const x of parsed) next.push(makePending(x, p.uploadFor ?? ''));
      } catch (e) { errs.push(e instanceof Error ? e.message : String(e)); }
    }
    // Un lote con varios archivos malos debe mostrar TODOS los motivos, no solo el último.
    if (errs.length) setMsg(errs.join('\n'));
    if (!next.length) return;
    setPending((cur) => [...cur, ...next]);
  }

  const upd = (pid: string, patch: Partial<Pending>) => setPending((cur) => cur.map((x) => (x.pid === pid ? { ...x, ...patch } : x)));

  function createGrid(): GeoGrid | null {
    if (!bbox) return null;
    const issue = boundsIssue(bbox);
    if (issue) { setMsg(issue); return null; }
    if (!(res > 0)) { setMsg('La resolución debe ser mayor que 0 metros.'); return null; }
    if (px > maxPx) { setMsg(`Con esa resolución la grilla tendría ${px.toLocaleString('es-CO')} píxeles (máximo ${maxPx.toLocaleString('es-CO')}). Usa una resolución más gruesa o un área más pequeña.`); return null; }
    let g: GeoGrid;
    try { g = gridFromBounds(bbox, res); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); return null; }
    p.commit((c) => ({ ...c, grid: g }));
    p.setDraft(null); setEditingArea(false); setMsg('');
    return g;
  }

  async function dropLayer(key: string) {
    const meta = layers[key];
    delete p.cache.current[key];
    if (meta?.path && p.sb) { try { await removeLayers(p.sb, [meta.path]); } catch { /* huérfano: no bloquea */ } }
    p.commit((c) => {
      const { [key]: _gone, ...rest } = c.layers ?? {};
      const rules = Object.fromEntries(Object.entries(c.rules).filter(([, r]) => r.layerKey !== key));
      return { ...c, layers: rest, rules };
    });
    p.setVecs((v) => v.filter((x) => x.id !== key));
    p.onQuotaChange();
  }

  async function resetArea() {
    if (p.sb) { try { await removeLayers(p.sb, Object.values(layers).map((l) => l.path).filter(Boolean)); } catch { /* huérfanos */ } }
    p.cache.current = {};
    p.setVecs([]);
    p.commit((c) => ({ ...c, grid: undefined, layers: {} }));
    setConfirmArea(false); setEditingArea(true); setBbox(p.draft ?? null);
    p.onQuotaChange();
  }

  async function addOne(pn: Pending, g: GeoGrid) {
    upd(pn.pid, { status: 'working', err: undefined });
    // Deja pintar «Procesando…» antes de un cálculo largo y síncrono (distancias, interpolación de isolíneas): sin esto
    // la pantalla parecía congelada sin explicación.
    await new Promise((r) => setTimeout(r, 30));
    try {
      const ps = pn.parsed;
      let arr: Float32Array, origin: string;
      if (ps.kind === 'raster') {
        const src = await ps.read(g);
        if (!src) throw new Error('El ráster no toca el área de estudio.');
        // Categóricos y máscaras (exclusión / área): nunca se interpolan (una franja de 0.3 «excluiría» todo el borde).
        const discrete = pn.categorical || pn.role !== 'criterion';
        arr = resampleToGrid(src, g, discrete ? 'nearest' : 'bilinear');
        origin = discrete ? 'Ráster remuestreado (vecino más cercano; moda si es más fino que la grilla)' : 'Ráster remuestreado (bilineal; promedio si es más fino que la grilla)';
      } else if (pn.mode === 'distance') {
        const dl = distanceLayerPadded(ps.fc, g);
        arr = dl.values;
        origin = `Distancia euclidiana a los elementos${dl.padM > 0 ? ` (cuenta los que están hasta ${kmFmt(dl.padM)} fuera del área)` : ''}`;
      } else if (pn.mode === 'surface') {
        if (!pn.field) throw new Error('Elige el campo numérico (p. ej. la profundidad de cada isolínea).');
        const known = burn(ps.fc, g, { kind: 'attr', field: pn.field });
        let nk = 0; for (let i = 0; i < known.length; i++) if (!Number.isNaN(known[i])) nk++;
        if (!nk) throw new Error('Ninguna celda con valor cae dentro del área de estudio.');
        arr = interpolateSurface(known, g.width, g.height); origin = `Superficie interpolada desde «${pn.field}»`;
      } else if (pn.mode === 'attr') {
        if (!pn.field) throw new Error('Elige el campo numérico que quieres rasterizar.');
        arr = burn(ps.fc, g, { kind: 'attr', field: pn.field }); origin = `Atributo «${pn.field}» rasterizado`;
      } else {
        arr = burn(ps.fc, g, { kind: 'presence' }); for (let i = 0; i < arr.length; i++) if (Number.isNaN(arr[i])) arr[i] = 0;
        origin = 'Presencia (1 dentro, 0 fuera)';
      }
      const range = layerRange(arr);
      let anyValid = false;
      for (let i = 0; i < arr.length && !anyValid; i++) if (!Number.isNaN(arr[i])) anyValid = true;
      if (!anyValid) throw new Error('Ningún elemento cae dentro del área de estudio. Revisa que el archivo esté en la misma zona.');
      if (pn.role !== 'criterion') {
        let any = false; for (let i = 0; i < arr.length && !any; i++) if (arr[i] > 0) any = true;
        if (!any) throw new Error('La capa no marca ninguna celda dentro del área.');
      }
      let key = slug(pn.label).slice(0, 18) || 'capa';
      // Las claves del paquete (temp, precip…) también están ocupadas: la capa propia no las pisa.
      const taken = new Set([...Object.keys(layers), ...Object.keys(data?.info ?? {}), ...Object.keys(p.cache.current)]);
      for (let n = 2; taken.has(key); n++) key = `${slug(pn.label).slice(0, 15)}-${n}`;

      let path = '', bytes = arr.byteLength, warn = '';
      if (p.sb) {
        try { path = layerPath(p.ownerId, p.projectId, key); bytes = await uploadLayer(p.sb, path, arr); }
        catch (e) {
          path = '';
          const m = e instanceof Error ? e.message : String(e);
          if (isQuotaError(m)) throw e;
          warn = /bucket not found|not found/i.test(m)
            ? 'La capa quedó solo en esta sesión: falta aplicar la migración 20240101000011_geo_storage.sql en Supabase (crea el almacén de capas).'
            : `La capa quedó solo en esta sesión (no se pudo guardar: ${m}).`;
        }
      }
      p.cache.current[key] = arr;
      const meta: GeoLayerMeta = { label: pn.label.trim() || key, unit: pn.unit.trim(), role: pn.role, origin, source: ps.name, min: range.min, max: range.max, path, bytes };
      p.commit((c) => {
        const next: GeoConfig = { ...c, layers: { ...(c.layers ?? {}), [key]: meta } };
        if (pn.role === 'criterion' && pn.criterionId) {
          const prev = c.rules[pn.criterionId];
          next.rules = { ...c.rules, [pn.criterionId]: { layerKey: key, fn: prev?.fn ?? defaultFn(range.min, range.max), veto: prev?.veto } };
        }
        return next;
      });
      if (ps.kind === 'vector') p.setVecs((v) => [...v, { id: key, name: meta.label, fc: ps.fc, color: COLORS[v.length % COLORS.length] }]);
      // Solo la última capa añadida queda visible (un lote de 6 apiladas tapa el mapa); el resultado no se toca.
      p.setVis((v) => ({ ...Object.fromEntries(Object.entries(v).map(([id, s]) => [id, id.startsWith('l:') ? { ...s, on: false } : s])), [`l:${key}`]: { on: true, op: 0.85 } }));
      setPending((cur) => cur.filter((x) => x.pid !== pn.pid));
      p.onQuotaChange();
      if (warn) setMsg(warn);
      if (pn.role === 'criterion' && pn.criterionId) p.onLayerAdded?.(pn.criterionId);
    } catch (e) { upd(pn.pid, { status: 'error', err: e instanceof Error ? e.message : String(e) }); }
  }

  async function addAll() {
    let g = targetGrid ?? null;
    setBusy(true);
    if (!g && !isPack) g = createGrid();
    if (g) for (const pn of pending) await addOne(pn, g);
    setBusy(false);
  }

  const outside = (b: Bounds) => {
    if (!targetGrid) return false;
    const gb = gridBoundsLonLat(targetGrid);
    return b.east < gb.west || b.west > gb.east || b.north < gb.south || b.south > gb.north;
  };

  return (
    <div className="gv-sec-stack">
      <section className="gv-sec">
        <header><h4>1 · Área de estudio</h4></header>
        {isPack && data && (
          <p className="gv-hint">Paquete del curso: <b>{data.grid.width}×{data.grid.height}</b> celdas de <b>{data.grid.resM} m</b> ({(data.grid.width * data.grid.height * data.grid.haPerPixel).toLocaleString('es-CO', { maximumFractionDigits: 0 })} ha). El área y sus mapas son de solo lectura, pero <b>puedes añadir tus propios mapas</b> (paso 2): se recortan y alinean solos a esta misma grilla.</p>
        )}
        {isPack && !data && <p className="gv-hint">Cargando el paquete del curso… en cuanto termine podrás subir tus propios mapas aquí.</p>}
        {!isPack && grid && !editingArea && (
          <>
            <div className="gv-kv"><span>Grilla</span><b className="mono">{grid.width} × {grid.height} celdas</b></div>
            <div className="gv-kv"><span>Resolución</span><b className="mono">{grid.resM} m</b></div>
            <div className="gv-kv"><span>Área</span><b className="mono">{(grid.width * grid.height * grid.haPerPixel).toLocaleString('es-CO', { maximumFractionDigits: 0 })} ha</b></div>
            <div className="gv-kv"><span>Sistema</span><b className="mono">{grid.crs}</b></div>
            <div className="gv-row-acts">
              <button type="button" className="btn sm" onClick={() => p.fit(gridBoundsLonLat(grid))}><Icon d={ICONS.fit} size={13} /> Ver en el mapa</button>
              {!confirmArea
                ? <button type="button" className="btn sm" onClick={() => (Object.keys(layers).length ? setConfirmArea(true) : setEditingArea(true))}>Cambiar área</button>
                : <button type="button" className="btn sm danger" onClick={resetArea}>¿Seguro? Borra las {Object.keys(layers).length} capas</button>}
            </div>
          </>
        )}
        {!isPack && (!grid || editingArea) && (
          <div className="gv-area">
            <p className="gv-hint">Sube un archivo (abajo) y el área se propone sola, o dibújala en el mapa, o escribe las coordenadas. Todas las capas se alinean a esta grilla.</p>
            <div className="gv-bbox">
              {(['north', 'west', 'east', 'south'] as const).map((k) => (
                <label key={k} className={'b-' + k}><span>{{ north: 'Norte', south: 'Sur', east: 'Este', west: 'Oeste' }[k]} °</span>
                  <Num label={`${{ north: 'Norte', south: 'Sur', east: 'Este', west: 'Oeste' }[k]} en grados`} value={bbox?.[k] ?? NaN} step="0.001" onChange={(n) => { setTouched(true); const b = { ...(bbox ?? { west: NaN, south: NaN, east: NaN, north: NaN }), [k]: n }; setBbox(b); if ([b.west, b.south, b.east, b.north].every(Number.isFinite)) { p.setDraft(b); } }} />
                </label>
              ))}
            </div>
            <div className="gv-row-acts">
              <button type="button" className={'btn sm' + (p.drawing ? ' primary' : '')} onClick={() => { setTouched(true); p.setDrawing(!p.drawing); }}>
                <Icon d={ICONS.square} size={13} /> {p.drawing ? 'Arrastra sobre el mapa…' : 'Dibujar en el mapa'}
              </button>
              {p.getView && <button type="button" className="btn sm" title="Toma como área lo que se ve ahora en el mapa (útil en pantallas táctiles, donde no se puede arrastrar un rectángulo)" onClick={() => { const v = p.getView?.(); if (!v) return; setTouched(true); setBbox(v); setRes(suggestRes(v)); p.setDraft(v); }}>Usar la vista del mapa</button>}
              {pendingBounds && <button type="button" className="btn sm" onClick={() => { setTouched(false); const b = padBounds(pendingBounds, 0.05); setBbox(b); setRes(suggestRes(b)); p.setDraft(b); p.fit(b); }}>Usar el archivo</button>}
            </div>
            <label className="gv-field"><span>Resolución (metros por celda)</span>
              <div className="gv-res"><Num label="Resolución en metros" value={res} min={1} onChange={setRes} />
                {bbox && <button type="button" className="btn sm" onClick={() => setRes(suggestRes(bbox))}>Sugerida</button>}</div>
            </label>
            {bbox && boundsIssue(bbox) && [bbox.west, bbox.south, bbox.east, bbox.north].every(Number.isFinite) && <p className="gv-hint warn" role="alert">{boundsIssue(bbox)}</p>}
            {bbox && boundsWarning(bbox) && <p className="gv-hint warn">{boundsWarning(bbox)}</p>}
            {bbox && <p className={'gv-hint' + (px > maxPx ? ' warn' : '')}>{px.toLocaleString('es-CO')} celdas{px > maxPx ? ` — demasiadas (máx. ${maxPx.toLocaleString('es-CO')})` : ' · ok'}. Más fino = más detalle, pero más lento y más pesado.</p>}
            <div className="gv-row-acts">
              <button type="button" className="btn primary sm" disabled={!bbox || !!boundsIssue(bbox) || px > maxPx || !(px > 0) || !(res > 0)} onClick={createGrid}>Crear área de estudio</button>
              {editingArea && <button type="button" className="btn sm" onClick={() => { setEditingArea(false); p.setDraft(null); }}>Cancelar</button>}
            </div>
          </div>
        )}
      </section>

      {(!isPack || data) && (
        <section className="gv-sec">
          <header><h4>2 · Añadir mapas</h4></header>
          <ol className="gv-howto" aria-label="Cómo cargar tu mapa">
            <li className={targetGrid ? 'done' : ''}><i>{targetGrid ? '✓' : '1'}</i><span><b>Área de estudio</b> {targetGrid ? (isPack ? 'lista: la fija el paquete del curso.' : 'lista.') : 'pendiente: arriba, o se propone sola desde tu primer archivo.'}</span></li>
            <li className={pending.length ? 'done' : ''}><i>{pending.length ? '✓' : '2'}</i><span><b>Sube tu archivo</b> aquí abajo (GeoTIFF, GeoJSON, shapefile .zip, KML/KMZ o GPX).</span></li>
            <li><i>3</i><span><b>Elige el criterio</b> al que alimenta (o «Exclusión» si marca zonas prohibidas) y pulsa «Añadir al proyecto».</span></li>
            <li><i>4</i><span><b>Ajusta su regla</b> en la pestaña «Modelo»: cómo el valor de tu mapa se vuelve idoneidad de 0 a 1.</span></li>
          </ol>
          {p.uploadFor && (
            <div className="gv-hint" role="status">
              Subiendo el mapa del criterio <b>«{p.criteria.find((c) => c.id === p.uploadFor)?.name ?? '—'}»</b>. Elige un archivo; después ajustas su regla en la pestaña «Modelo».
              {' '}<button type="button" className="btn sm" onClick={p.onCancelUpload}>Cancelar</button>
            </div>
          )}
          <label
            className={'gv-drop' + (over ? ' over' : '')}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); void onFiles(e.dataTransfer.files); }}
          >
            <Icon d={ICONS.upload} size={22} />
            <b>Arrastra aquí tus archivos</b>
            <span>o haz clic para elegirlos</span>
            <em>GeoTIFF (.tif) · GeoJSON · shapefile en .zip · KML/KMZ · GPX</em>
            <input ref={fileRef} type="file" multiple accept=".tif,.tiff,.geojson,.json,.zip,.kml,.kmz,.gpx" onChange={(e) => { if (e.target.files) void onFiles(e.target.files); e.target.value = ''; }} />
          </label>
          {msg && <p className="gv-hint warn gv-pre" role="alert">{msg}</p>}

          {pending.map((pn) => {
            const ps = pn.parsed;
            const rng = ps.kind === 'raster' ? `${ps.width}×${ps.height} px · ${ps.res.toPrecision(3)} ${ps.unit}/px · ${ps.crs}` : `${ps.count.toLocaleString('es-CO')} elementos · ${ps.geoms.map((g) => ({ point: 'puntos', line: 'líneas', polygon: 'polígonos' }[g])).join(', ')}`;
            return (
              <div className="gv-pending" key={pn.pid}>
                <div className="hd"><b title={ps.name}>{ps.name}</b><span className="mono">{ps.kind === 'raster' ? 'ráster' : 'vector'}</span></div>
                <div className="meta mono">{rng}</div>
                {ps.kind === 'raster' && ps.bands > 1 && <p className="gv-hint warn">Este archivo trae {ps.bands} bandas: solo se usa la primera. Si es una imagen a color (RGB) no sirve como mapa de valores.</p>}
                {targetGrid && outside(ps.bounds) && <p className="gv-hint warn">Este archivo está fuera del área de estudio{isPack ? ' del paquete (no se podrá añadir)' : ''}.</p>}
                <label className="gv-field"><span>Nombre de la capa</span><input type="text" value={pn.label} onChange={(e) => upd(pn.pid, { label: e.target.value })} /></label>
                <label className="gv-field"><span>Qué es</span>
                  <select value={pn.role} onChange={(e) => { const role = e.target.value as Role; upd(pn.pid, { role, mode: role === 'criterion' ? 'distance' : 'presence', unit: role === 'criterion' && ps.kind === 'vector' ? 'm' : '' }); }}>
                    {(Object.keys(ROLE_LABEL) as Role[]).filter((r) => !(isPack && r === 'area')).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </label>
                <p className="gv-hint">{ROLE_HINT[pn.role]}{ps.kind === 'raster' && pn.role !== 'criterion' ? ' En un ráster, cada celda con valor mayor que 0 cuenta como marcada.' : ''}</p>
                {isPack && <p className="gv-hint">El «Área de estudio» no se ofrece aquí: la fija el paquete del curso.</p>}
                {pn.role === 'criterion' && (
                  <label className="gv-field"><span>Criterio al que alimenta</span>
                    <select value={pn.criterionId} onChange={(e) => upd(pn.pid, { criterionId: e.target.value })}>
                      <option value="">— ninguno todavía (solo verla) —</option>
                      {p.criteria.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                )}
                {ps.kind === 'vector' && (
                  <fieldset className="gv-modes">
                    <legend>Qué calcular con el vector</legend>
                    <label><input type="radio" checked={pn.mode === 'distance'} onChange={() => upd(pn.pid, { mode: 'distance', unit: 'm' })} /> Distancia (m) al elemento más cercano</label>
                    <label><input type="radio" checked={pn.mode === 'presence'} onChange={() => upd(pn.pid, { mode: 'presence', unit: '' })} /> Dentro / fuera (1 / 0)</label>
                    <label className={ps.fields.length ? '' : 'off'} title={ps.fields.length ? undefined : 'Este archivo no tiene campos numéricos.'}><input type="radio" disabled={!ps.fields.length} checked={pn.mode === 'attr'} onChange={() => upd(pn.pid, { mode: 'attr', unit: '' })} /> Valor de un atributo numérico (polígonos)
                      {pn.mode === 'attr' && <select value={pn.field} onChange={(e) => upd(pn.pid, { field: e.target.value })}>{ps.fields.map((f) => <option key={f} value={f}>{f}</option>)}</select>}
                    </label>
                    <label className={ps.fields.length ? '' : 'off'} title={ps.fields.length ? undefined : 'Este archivo no tiene campos numéricos.'}><input type="radio" disabled={!ps.fields.length} checked={pn.mode === 'surface'} onChange={() => upd(pn.pid, { mode: 'surface', unit: '' })} /> Superficie continua desde un atributo (isolíneas o puntos)
                      {pn.mode === 'surface' && <select value={pn.field} onChange={(e) => upd(pn.pid, { field: e.target.value })}>{ps.fields.map((f) => <option key={f} value={f}>{f}</option>)}</select>}
                    </label>
                  </fieldset>
                )}
                {ps.kind === 'raster' && (
                  <label className="gv-check"><input type="checkbox" checked={pn.categorical} onChange={(e) => upd(pn.pid, { categorical: e.target.checked })} /> Es categórico (clases): no promediar celdas vecinas</label>
                )}
                {pn.role === 'criterion' && <label className="gv-field"><span>Unidad</span><input type="text" value={pn.unit} placeholder="m, °C, mm…" onChange={(e) => upd(pn.pid, { unit: e.target.value })} /></label>}
                {pn.err && <p className="gv-hint warn" role="alert">{pn.err}</p>}
                {!targetGrid && !bbox && <p className="gv-hint warn">Falta el área de estudio: dibújala en el mapa o escribe sus coordenadas (paso 1) para poder añadir este archivo.</p>}
                <div className="gv-row-acts">
                  <button type="button" className="btn primary sm" disabled={busy || pn.status === 'working' || (!targetGrid && !bbox)} onClick={async () => {
                    setBusy(true);
                    let g = targetGrid ?? null;
                    if (!g && !isPack) g = createGrid();
                    if (g) await addOne(pn, g);
                    setBusy(false);
                  }}>{pn.status === 'working' ? 'Procesando…' : targetGrid ? 'Añadir al proyecto' : 'Crear área y añadir'}</button>
                  <button type="button" className="btn sm" disabled={pn.status === 'working'} onClick={() => setPending((cur) => cur.filter((x) => x.pid !== pn.pid))}>Quitar</button>
                </div>
              </div>
            );
          })}
          {pending.length > 1 && <div className="gv-row-acts"><button type="button" className="btn primary sm" disabled={busy} onClick={addAll}>{busy ? 'Procesando…' : `Añadir las ${pending.length} capas`}</button></div>}
        </section>
      )}

      <section className="gv-sec">
        <header><h4>{isPack ? '2' : '3'} · Capas del proyecto</h4></header>
        {p.quota && (
          <div className={'gv-quota' + (p.quota.used_bytes > p.quota.quota_bytes ? ' over' : '')} title="Espacio de mapas de tu cuenta (todos tus proyectos)">
            <span className="bar"><span style={{ width: `${Math.min(100, (p.quota.used_bytes / Math.max(1, p.quota.quota_bytes)) * 100)}%` }} /></span>
            <span className="mono">{bytesFmt(p.quota.used_bytes)} de {bytesFmt(p.quota.quota_bytes)} · {p.quota.layers}/{p.quota.max_layers} capas</span>
            {p.quota.used_bytes > p.quota.quota_bytes && <b>Sobre la cuota: no puedes subir más hasta borrar capas.</b>}
          </div>
        )}
        <LayerRow id="result" label="Resultado (idoneidad)" role="resultado" vis={p.vis} setVis={p.setVis} swatch={rampCss(p.palette)} />
        {p.virtual.map((x) => <LayerRow key={x.id} id={x.id} label={x.label} role={x.role} vis={p.vis} setVis={p.setVis} swatch={x.swatch} />)}
        {data && Object.entries(data.info).map(([k, l]) => (
          <LayerRow key={k} id={`l:${k}`} label={l.label} role={ROLE_LABEL[l.role].toLowerCase()} vis={p.vis} setVis={p.setVis}
            swatch={l.role === 'exclusion' ? '#7F8C8D' : l.role === 'area' ? '#84CC16' : Object.values(geo.rules).some((r) => r.layerKey === k) ? rampCss(p.palette) : RAW_RAMP_CSS}
            note={[l.origin ? `${l.origin}${layers[k] && !layers[k].path ? ' · sin guardar (solo esta sesión)' : ''}` : '', !layers[k] && isPack ? 'Del paquete del curso · solo lectura (no se puede borrar)' : '', l.license ? `Licencia: ${l.license}` : ''].filter(Boolean).join(' · ') || undefined}
            onDelete={layers[k] ? () => dropLayer(k) : undefined} />
        ))}
        {p.vecs.map((v) => (
          <LayerRow key={v.id} id={`v:${v.id}`} label={`${v.name} · vector original`} role="vector" vis={p.vis} setVis={p.setVis} swatch={v.color} />
        ))}
        {!data && !isPack && !grid && <p className="gv-hint">Aún no hay capas. Empieza por el área de estudio.</p>}
      </section>
    </div>
  );
}

function LayerRow({ id, label, role, vis, setVis, swatch, note, onDelete }: {
  id: string; label: string; role: string; vis: VisState; setVis: Dispatch<SetStateAction<VisState>>; swatch: string; note?: string; onDelete?: () => void;
}) {
  const v = vis[id] ?? { on: id === 'result' || id === 'parcels' || id === 'diff', op: id === 'result' ? 0.9 : 0.85 };
  const [ask, setAsk] = useState(false);
  return (
    <div className={'gv-layer' + (v.on ? ' on' : '')}>
      <button type="button" className="eye" aria-pressed={v.on} aria-label={`${v.on ? 'Ocultar' : 'Mostrar'} ${label}`} onClick={() => setVis((s) => ({ ...s, [id]: { ...v, on: !v.on } }))}>
        <Icon d={v.on ? ICONS.eye : ICONS.eyeOff} />
      </button>
      <span className="sw" style={{ background: swatch }} />
      <span className="nm" title={label}>{label}<small>{role}</small></span>
      {onDelete && (
        <button type="button" className={'del' + (ask ? ' ask' : '')} aria-label={`Borrar ${label}`} onClick={() => (ask ? onDelete() : (setAsk(true), setTimeout(() => setAsk(false), 3000)))}>
          {ask ? '¿Seguro?' : <Icon d={ICONS.trash} size={14} />}
        </button>
      )}
      <input type="range" min={0.1} max={1} step={0.05} value={v.op} aria-label={`Opacidad de ${label}`} onChange={(e) => setVis((s) => ({ ...s, [id]: { ...v, op: Number(e.target.value) } }))} />
      {note && <small className="note">{note}</small>}
    </div>
  );
}
