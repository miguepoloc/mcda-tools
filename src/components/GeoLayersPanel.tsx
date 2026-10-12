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
import { isQuotaError, layerPath, refPath, removeLayers, uploadLayer, type Quota } from '@/lib/geo/store';
import { nameFields, polygonsOnly, uploadRef, zonalAfterDrop, zonalAfterReplace } from '@/lib/geo/refLayer';
import { refsAfterDrop, refsAfterReplace } from '@/lib/geo/refPublic';
import { slug } from '@/lib/geo/export';
import type { GeoData } from '@/lib/geo/data';
import type { FnSpec } from '@/lib/geo/membership';
import { RAW_RAMP_CSS, rampCss, type PaletteKey } from '@/lib/geo/paint';
import { styleRampCss, type LayerStyle, type LayerStyles } from '@/lib/geo/layerStyle';
import type { Criterion, GeoConfig, GeoGrid, GeoLayerMeta } from '@/lib/types';
import { Icon, ICONS, Num } from './GeoBits';
import ConfirmDialog from './ConfirmDialog';
import GeoLayerStyle, { STYLE_ICON, type StyleKind } from './GeoLayerStyle';

const kmFmt = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`);

/** `ref`: capa de polígonos de referencia (persistida; su estilo vive en `geo.layers[id].ref`). */
export type VecItem = { id: string; name: string; fc: FC; color: string; ref?: boolean };
export type VisState = Record<string, { on: boolean; op: number }>;

type Role = GeoLayerMeta['role'];
type Pending = {
  pid: string; parsed: Parsed; label: string; unit: string; role: Role; criterionId: string;
  mode: 'distance' | 'presence' | 'attr' | 'surface'; field: string; categorical: boolean;
  status: 'idle' | 'working' | 'error'; err?: string;
  /** Hay una capa con el mismo archivo de origen: true = reemplazarla (conserva reglas), false = subir como nueva. */
  replace?: boolean;
};

const COLORS = ['#22D3EE', '#F472B6', '#FACC15', '#A78BFA', '#FB923C', '#34D399'];
const ROLE_LABEL: Record<Role, string> = { criterion: 'Criterio', exclusion: 'Exclusión', area: 'Área de estudio', reference: 'Referencia (polígonos)' };
const ROLE_HINT: Record<Role, string> = {
  criterion: 'Un valor por celda que alimenta un criterio (temperatura, profundidad, distancia a algo…).',
  exclusion: 'Zonas donde NO se puede instalar (p. ej. concesiones). Se muestran en gris y no entran al cálculo.',
  area: 'La zona que se analiza (p. ej. la isóbata de 200 m). Fuera de ella no se calcula nada.',
  reference: 'Polígonos que solo se dibujan (contorno) sobre el mapa y sirven de zonas para el resumen por zonas (comunas, sectores, manzanas). NO entran al modelo ni se rasterizan; se guardan tal cual.',
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
  /** Qué significa un valor alto del índice (para rotular y orientar la rampa del resultado). */
  direction?: "suitability" | "risk";
  draft: Bounds | null; setDraft: (b: Bounds | null) => void;
  drawing: boolean; setDrawing: (d: boolean) => void;
  quota: Quota | null; onQuotaChange: () => void;
  /** Hectáreas realmente evaluadas (sin exclusiones ni fuera del área de estudio); null si aún no hay resultado. */
  evaluableHa?: number | null;
  /** Criterio para el que se está subiendo un mapa (viene del botón «Subir el mapa de este criterio»). */
  uploadFor?: string | null; onCancelUpload?: () => void; onLayerAdded?: (criterionId: string) => void;
  virtual: { id: string; label: string; role: string; swatch: string }[];
  /** Estilo por capa (G3): lo guardado en `geo.styles`, el cambio de un campo y el restablecer. Ausentes = sin editor de estilo. */
  styles?: LayerStyles;
  onStyle?: (id: string, patch: Partial<Record<keyof LayerStyle, unknown>>) => void;
  onResetStyle?: (id: string) => void;
  /** `linear-gradient` de la rampa del resultado según el modelo de clases (para el recuadro de color de «Resultado»). */
  resultCss?: string;
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
  const [confirmDrop, setConfirmDrop] = useState<string | null>(null);
  const [bbox, setBbox] = useState<Bounds | null>(null);
  const [res, setRes] = useState(250);
  const [editingArea, setEditingArea] = useState(false);
  const [touched, setTouched] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  // Capa cuyo editor de estilo está abierto (id de la lista: `l:<clave>` o `v:<clave>`).
  const [styleKey, setStyleKey] = useState<string | null>(null);
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

  // Capa ya cargada desde un archivo con el mismo nombre (la clave de `geo.layers`), si la hay.
  const dupKeyOf = (name: string) => Object.entries(layers).find(([, m]) => m.source === name)?.[0];

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
      return { ...refsAfterDrop(zonalAfterDrop({ ...c, layers: rest, rules }, key), key) };
    });
    p.setVecs((v) => v.filter((x) => x.id !== key));
    p.onQuotaChange();
  }

  // Edición segura post-carga: nombre/unidad/criterio no tocan el array ya procesado (solo metadatos
  // y a qué criterio apunta en `rules`). Cambiar rol/modo/cómo se calculó sí lo tocaría — eso sigue
  // requiriendo borrar y volver a subir el archivo original, que no se conserva tras añadir la capa.
  function saveLayerEdit(key: string, patch: { label: string; unit: string; criterionId?: string }) {
    p.commit((c) => {
      const meta = c.layers?.[key];
      if (!meta) return c;
      const nextLayers = { ...(c.layers ?? {}), [key]: { ...meta, label: patch.label.trim() || meta.label, unit: patch.unit.trim() } };
      let nextRules = c.rules;
      if (meta.role === 'criterion' && patch.criterionId !== undefined) {
        const prevCriterionId = Object.entries(c.rules).find(([, r]) => r.layerKey === key)?.[0];
        if (prevCriterionId !== patch.criterionId) {
          nextRules = { ...c.rules };
          if (prevCriterionId) delete nextRules[prevCriterionId];
          if (patch.criterionId) {
            const existing = nextRules[patch.criterionId];
            nextRules[patch.criterionId] = existing?.layerKey === key
              ? existing
              : { layerKey: key, fn: defaultFn(meta.min, meta.max) };
          }
        }
      }
      return { ...c, layers: nextLayers, rules: nextRules };
    });
    setEditKey(null);
  }

  async function resetArea() {
    if (p.sb) { try { await removeLayers(p.sb, Object.values(layers).map((l) => l.path).filter(Boolean)); } catch { /* huérfanos */ } }
    p.cache.current = {};
    p.setVecs([]);
    p.commit((c) => ({ ...c, grid: undefined, layers: {} }));
    setConfirmArea(false); setEditingArea(true); setBbox(p.draft ?? null);
    p.onQuotaChange();
  }

  /** Polígonos de referencia: se guarda el FeatureCollection original (sin rasterizar) y se dibuja como vector. No
   * toca la caché de rásters ni las reglas: no entra al modelo. */
  async function addReference(pn: Pending) {
    const ps = pn.parsed;
    if (ps.kind !== 'vector') throw new Error('Una capa de referencia debe ser un vector de polígonos (GeoJSON, shapefile .zip, KML).');
    const { fc, dropped } = polygonsOnly(ps.fc);
    if (!fc.features.length) throw new Error('El archivo no tiene polígonos: una capa de referencia necesita polígonos (puntos y líneas no sirven como zonas).');
    let key = slug(pn.label).slice(0, 18) || 'zonas';
    const taken = new Set([...Object.keys(layers), ...Object.keys(data?.info ?? {}), ...Object.keys(p.cache.current)]);
    for (let n = 2; taken.has(key); n++) key = `${slug(pn.label).slice(0, 15)}-${n}`;
    let path = '', bytes = 0, warn = '';
    if (p.sb) {
      try { path = refPath(p.ownerId, p.projectId, key); bytes = await uploadRef(p.sb, path, fc); }
      catch (e) {
        path = '';
        const m = e instanceof Error ? e.message : String(e);
        if (isQuotaError(m)) throw e;
        warn = `Los polígonos quedaron solo en esta sesión (no se pudo guardar: ${m}).`;
      }
    }
    const repKey = pn.replace ? dupKeyOf(ps.name) : undefined;
    const repMeta = repKey ? layers[repKey] : undefined;
    const color = COLORS[Object.values(layers).filter((l) => l.role === 'reference').length % COLORS.length];
    const meta: GeoLayerMeta = {
      label: pn.label.trim() || key, unit: '', role: 'reference', origin: `Polígonos de referencia (${fc.features.length})${dropped ? `; se omitieron ${dropped} elementos que no eran polígonos` : ''}`,
      source: ps.name, min: 0, max: 0, path, bytes,
      ref: { color, weight: 2, labels: false, nameField: nameFields(fc)[0], count: fc.features.length },
    };
    p.commit((c) => {
      let next: GeoConfig = { ...c, layers: { ...(c.layers ?? {}), [key]: meta } };
      if (repKey) {
        const { [repKey]: _old, ...others } = next.layers ?? {};
        next = refsAfterReplace(zonalAfterReplace({ ...next, layers: others }, repKey, key), repKey, key);
      }
      return next;
    });
    if (repKey && repMeta?.path && p.sb) { try { await removeLayers(p.sb, [repMeta.path]); } catch { /* huérfano: no bloquea */ } }
    p.setVecs((v) => [...v.filter((x) => x.id !== repKey), { id: key, name: meta.label, fc, color, ref: true }]);
    p.setVis((v) => ({ ...v, [`v:${key}`]: { on: true, op: 1 } }));
    setPending((cur) => cur.filter((x) => x.pid !== pn.pid));
    p.onQuotaChange();
    if (warn) setMsg(warn);
  }

  async function addOne(pn: Pending, g: GeoGrid) {
    upd(pn.pid, { status: 'working', err: undefined });
    // Deja pintar «Procesando…» antes de un cálculo largo y síncrono (distancias, interpolación de isolíneas): sin esto
    // la pantalla parecía congelada sin explicación.
    await new Promise((r) => setTimeout(r, 30));
    try {
      const ps = pn.parsed;
      if (pn.role === 'reference') { await addReference(pn); return; }
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
      // «Reemplazar»: la capa anterior del mismo archivo se retira al final, y sus reglas pasan a la nueva.
      const repKey = pn.replace ? dupKeyOf(ps.name) : undefined;
      const repMeta = repKey ? layers[repKey] : undefined;
      const meta: GeoLayerMeta = { label: pn.label.trim() || key, unit: pn.unit.trim(), role: pn.role, origin, source: ps.name, min: range.min, max: range.max, path, bytes };
      p.commit((c) => {
        const next: GeoConfig = { ...c, layers: { ...(c.layers ?? {}), [key]: meta } };
        if (repKey) {
          const { [repKey]: _old, ...others } = next.layers ?? {};
          next.layers = others;
          const moved: GeoConfig['rules'] = {};
          for (const [cid, r] of Object.entries(c.rules)) {
            if (r.layerKey !== repKey) { moved[cid] = r; continue; }
            // La regla (función, veto) sigue a la capa nueva solo si esta también es un criterio y no se la reasigna a otro.
            if (pn.role === 'criterion' && (!pn.criterionId || pn.criterionId === cid)) moved[cid] = { ...r, layerKey: key };
          }
          next.rules = moved;
        }
        if (pn.role === 'criterion' && pn.criterionId) {
          const prev = c.rules[pn.criterionId];
          next.rules = { ...c.rules, [pn.criterionId]: { layerKey: key, fn: prev?.fn ?? defaultFn(range.min, range.max), veto: prev?.veto } };
        }
        return next;
      });
      if (repKey) {
        delete p.cache.current[repKey];
        if (repMeta?.path && p.sb) { try { await removeLayers(p.sb, [repMeta.path]); } catch { /* huérfano: no bloquea */ } }
      }
      if (ps.kind === 'vector') p.setVecs((v) => [...v.filter((x) => x.id !== repKey), { id: key, name: meta.label, fc: ps.fc, color: COLORS[v.length % COLORS.length] }]);
      else if (repKey) p.setVecs((v) => v.filter((x) => x.id !== repKey));
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
      {confirmArea && (
        <ConfirmDialog
          title="¿Cambiar el área de estudio?"
          description={<>Cambiar el área borra las <b>{Object.keys(layers).length}</b> capas del proyecto (se recortaron a la grilla actual) y sus reglas. No se puede deshacer.</>}
          confirmLabel="Cambiar área y borrar capas"
          onConfirm={() => void resetArea()}
          onClose={() => setConfirmArea(false)}
        />
      )}
      {confirmDrop && layers[confirmDrop] && (
        <ConfirmDialog
          title={`¿Borrar la capa «${layers[confirmDrop].label}»?`}
          description={Object.values(geo.rules).some((r) => r.layerKey === confirmDrop)
            ? 'Alimenta un criterio: su regla también se quita y el resultado se recalcula sin ese criterio. No se puede deshacer.'
            : 'Se quita del proyecto y de tu espacio de mapas. No se puede deshacer.'}
          confirmLabel="Borrar capa"
          onConfirm={() => { const k = confirmDrop; setConfirmDrop(null); void dropLayer(k); }}
          onClose={() => setConfirmDrop(null)}
        />
      )}
      <section className="gv-sec">
        <header><h3>1 · Área de estudio</h3></header>
        {isPack && data && (
          <p className="gv-hint">Paquete del curso: <b>{data.grid.width}×{data.grid.height}</b> celdas de <b>{data.grid.resM} m</b> (extensión de la grilla: {(data.grid.width * data.grid.height * data.grid.haPerPixel).toLocaleString('es-CO', { maximumFractionDigits: 0 })} ha{p.evaluableHa != null ? <>; <b>área evaluada: {p.evaluableHa.toLocaleString('es-CO', { maximumFractionDigits: 0 })} ha</b></> : null}). El área y sus mapas son de solo lectura, pero <b>puedes añadir tus propios mapas</b> (paso 2): se recortan y alinean solos a esta misma grilla.</p>
        )}
        {isPack && !data && <p className="gv-hint">Cargando el paquete del curso… en cuanto termine podrás subir tus propios mapas aquí.</p>}
        {!isPack && grid && !editingArea && (
          <>
            <div className="gv-kv"><span>Grilla</span><b className="mono">{grid.width} × {grid.height} celdas</b></div>
            <div className="gv-kv"><span>Resolución</span><b className="mono">{grid.resM} m</b></div>
            {p.evaluableHa != null && <div className="gv-kv"><span>Área evaluada</span><b className="mono">{p.evaluableHa.toLocaleString('es-CO', { maximumFractionDigits: 0 })} ha</b></div>}
            <div className="gv-kv"><span>Extensión de la grilla</span><b className="mono">{(grid.width * grid.height * grid.haPerPixel).toLocaleString('es-CO', { maximumFractionDigits: 0 })} ha</b></div>
            <div className="gv-kv"><span>Sistema</span><b className="mono">{grid.crs}</b></div>
            <div className="gv-row-acts">
              <button type="button" className="btn sm" onClick={() => p.fit(gridBoundsLonLat(grid))}><Icon d={ICONS.fit} size={13} /> Ver en el mapa</button>
              <button type="button" className="btn sm" onClick={() => (Object.keys(layers).length ? setConfirmArea(true) : setEditingArea(true))}>Cambiar área</button>
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
          <header><h3>2 · Añadir mapas</h3></header>
          <details className="gv-help">
            <summary>❓ ¿Qué pasa cuando subo un mapa? · Qué guarda la app</summary>
            <div className="gv-help-body">
              <p>Todo lo que subas — un <b>ráster</b> (una imagen con un valor por celda, como temperatura o elevación) o un <b>vector</b> (líneas o puntos, como vías o subestaciones) — se convierte en <b>un solo número por cada celda de tu área de estudio</b>. Así, sin importar de dónde vino, todos los criterios quedan comparables entre sí y se pueden combinar.</p>
              <ul>
                <li><b>Vector, «Distancia al elemento más cercano»:</b> para cada celda de la grilla se mide la distancia en línea recta hasta el punto más cercano de esa capa. Cerca = número chico; lejos = número grande.</li>
                <li><b>Vector, «Dentro / fuera»:</b> cada celda dentro del polígono vale 1; fuera, 0.</li>
                <li><b>Ráster:</b> se remuestrea (se ajusta) a la resolución y el encuadre de tu grilla, celda por celda.</li>
              </ul>
              <p><b>El archivo que arrastraste no se guarda</b> (salvo los polígonos que marques como «Referencia»: esos se guardan tal cual, se dibujan sobre el mapa y sirven de zonas para el resumen por zonas, pero no entran al cálculo). Lo que queda guardado es el resultado ya calculado: esa grilla de números. Por eso puedes editar después el nombre, la unidad o a qué criterio alimenta una capa (es solo una etiqueta) — pero no cómo se calculó: para eso la app necesitaría el archivo original, que ya no tiene.</p>
              <p>Ese número por celda se vuelve idoneidad (0 a 1) con la regla que defines en la pestaña <b>Modelo</b>. Lo que el mapa pinta con colores es esa idoneidad, no el dato crudo.</p>
            </div>
          </details>
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
            const dup = dupKeyOf(ps.name);
            const rng = ps.kind === 'raster' ? `${ps.width}×${ps.height} px · ${ps.res.toPrecision(3)} ${ps.unit}/px · ${ps.crs}` : `${ps.count.toLocaleString('es-CO')} elementos · ${ps.geoms.map((g) => ({ point: 'puntos', line: 'líneas', polygon: 'polígonos' }[g])).join(', ')}`;
            return (
              <div className="gv-pending" key={pn.pid}>
                <div className="hd"><b title={ps.name}>{ps.name}</b><span className="mono">{ps.kind === 'raster' ? 'ráster' : 'vector'}</span></div>
                <div className="meta mono">{rng}</div>
                {ps.kind === 'raster' && ps.bands > 1 && <p className="gv-hint warn">Este archivo trae {ps.bands} bandas: solo se usa la primera. Si es una imagen a color (RGB) no sirve como mapa de valores.</p>}
                {targetGrid && outside(ps.bounds) && <p className="gv-hint warn">Este archivo está fuera del área de estudio{isPack ? ' del paquete (no se podrá añadir)' : ''}.</p>}
                {dup && (
                  <fieldset className="gv-modes" aria-describedby={`dup-${pn.pid}`}>
                    <legend>Ya subiste este archivo</legend>
                    <p className="gv-hint warn" id={`dup-${pn.pid}`}>La capa «{layers[dup].label}» viene de un archivo con el mismo nombre ({ps.name}).</p>
                    <label><input type="radio" name={`dup-${pn.pid}`} checked={!!pn.replace} onChange={() => upd(pn.pid, { replace: true })} /> Reemplazar «{layers[dup].label}» (conserva sus reglas y pesos)</label>
                    <label><input type="radio" name={`dup-${pn.pid}`} checked={!pn.replace} onChange={() => upd(pn.pid, { replace: false })} /> Subir como una capa nueva (quedan las dos)</label>
                  </fieldset>
                )}
                <label className="gv-field"><span>Nombre de la capa</span><input type="text" value={pn.label} onChange={(e) => upd(pn.pid, { label: e.target.value })} /></label>
                <label className="gv-field"><span>Qué es</span>
                  <select value={pn.role} onChange={(e) => { const role = e.target.value as Role; upd(pn.pid, { role, mode: role === 'criterion' ? 'distance' : 'presence', unit: role === 'criterion' && ps.kind === 'vector' ? 'm' : '' }); }}>
                    {(Object.keys(ROLE_LABEL) as Role[]).filter((r) => !(isPack && r === 'area') && !(r === 'reference' && !(ps.kind === 'vector' && ps.geoms.includes('polygon')))).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
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
                {ps.kind === 'vector' && pn.role !== 'reference' && (
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
        <header><h3>{isPack ? '2' : '3'} · Capas del proyecto</h3></header>
        {p.quota && (
          <div className={'gv-quota' + (p.quota.used_bytes > p.quota.quota_bytes ? ' over' : '')} title="Espacio de mapas de tu cuenta (todos tus proyectos)">
            <span className="bar"><span style={{ width: `${Math.min(100, (p.quota.used_bytes / Math.max(1, p.quota.quota_bytes)) * 100)}%` }} /></span>
            <span className="mono">{bytesFmt(p.quota.used_bytes)} de {bytesFmt(p.quota.quota_bytes)} · {p.quota.layers}/{p.quota.max_layers} capas</span>
            {p.quota.used_bytes > p.quota.quota_bytes && <b>Sobre la cuota: no puedes subir más hasta borrar capas.</b>}
          </div>
        )}
        <LayerRow id="result" label={p.direction === "risk" ? "Resultado (riesgo)" : "Resultado (idoneidad)"} role="resultado" vis={p.vis} setVis={p.setVis} swatch={p.resultCss ?? rampCss(p.palette, p.direction)} />
        {p.virtual.map((x) => <LayerRow key={x.id} id={x.id} label={x.label} role={x.role} vis={p.vis} setVis={p.setVis} swatch={x.swatch} />)}
        {data && Object.entries(data.info).map(([k, l]) => {
          const meta = layers[k];
          const sid = `l:${k}`, st = p.styles?.[sid];
          const hasRule = Object.values(geo.rules).some((r) => r.layerKey === k);
          const autoRamp = hasRule ? rampCss(p.palette, p.direction) : RAW_RAMP_CSS;
          const skind: StyleKind = l.role === 'exclusion' || l.role === 'area' ? 'flag' : hasRule ? 'criterion' : 'raw';
          const flagDef = l.role === 'exclusion' ? '#7F8C8D' : '#84CC16';
          return (
            <div key={k}>
              <LayerRow id={sid} label={l.label} role={ROLE_LABEL[l.role].toLowerCase()} vis={p.vis} setVis={p.setVis}
                swatch={skind === 'flag' ? st?.color ?? flagDef : styleRampCss(st, autoRamp)}
                onStyle={p.onStyle ? () => setStyleKey((cur) => (cur === sid ? null : sid)) : undefined} styling={styleKey === sid}
                note={[l.origin ? `${l.origin}${meta && !meta.path ? ' · sin guardar (solo esta sesión)' : ''}` : '', !meta && isPack ? 'Del paquete del curso · solo lectura (no se puede borrar)' : '', l.license ? `Licencia: ${l.license}` : ''].filter(Boolean).join(' · ') || undefined}
                onDelete={meta ? () => setConfirmDrop(k) : undefined}
                onEdit={meta ? () => setEditKey((cur) => (cur === k ? null : k)) : undefined}
                editing={editKey === k} />
              {styleKey === sid && p.onStyle && (
                <GeoLayerStyle kind={skind} label={l.label} style={st} defaults={{ color: flagDef }} autoRampCss={autoRamp}
                  onPatch={(patch) => p.onStyle?.(sid, patch)} onReset={() => p.onResetStyle?.(sid)} onClose={() => setStyleKey(null)} />
              )}
              {editKey === k && meta && (
                <LayerEditForm
                  meta={meta}
                  criteria={p.criteria}
                  currentCriterionId={Object.entries(geo.rules).find(([, r]) => r.layerKey === k)?.[0]}
                  rules={geo.rules}
                  layers={layers}
                  onCancel={() => setEditKey(null)}
                  onSave={(patch) => saveLayerEdit(k, patch)}
                />
              )}
            </div>
          );
        })}
        {p.vecs.filter((v) => layers[v.id]?.role !== 'reference').map((v) => {
          const sid = `v:${v.id}`, st = p.styles?.[sid];
          return (
            <div key={v.id}>
              <LayerRow id={sid} label={`${v.name} · vector original`} role="vector" vis={p.vis} setVis={p.setVis} swatch={st?.color ?? v.color}
                onStyle={p.onStyle ? () => setStyleKey((cur) => (cur === sid ? null : sid)) : undefined} styling={styleKey === sid} />
              {styleKey === sid && p.onStyle && (
                <GeoLayerStyle kind="vector" label={v.name} style={st} defaults={{ color: v.color, weight: 1.5, fillOp: 0.12 }}
                  onPatch={(patch) => p.onStyle?.(sid, patch)} onReset={() => p.onResetStyle?.(sid)} onClose={() => setStyleKey(null)} />
              )}
            </div>
          );
        })}
        {Object.entries(layers).filter(([, m]) => m.role === 'reference').map(([k, m]) => {
          const v = p.vecs.find((x) => x.id === k);
          const sid = `v:${k}`, st = p.styles?.[sid];
          return (
            <div key={k}>
              <LayerRow id={sid} label={m.label} role={`referencia · ${m.ref?.count ?? '?'} polígonos`} vis={p.vis} setVis={p.setVis} swatch={m.ref?.color ?? '#22D3EE'} defaultOn
                onStyle={p.onStyle ? () => setStyleKey((cur) => (cur === sid ? null : sid)) : undefined} styling={styleKey === sid}
                note={!m.path ? 'Solo esta sesión: no se pudo guardar' : !v ? 'No se pudo cargar (revisa tu conexión y recarga)' : `${m.origin} · guardada tal cual (${bytesFmt(m.bytes)})`}
                onDelete={() => setConfirmDrop(k)} onEdit={() => setEditKey((cur) => (cur === k ? null : k))} editing={editKey === k} />
              {styleKey === sid && p.onStyle && (
                // Color y grosor de una referencia viven en `layers[k].ref` (lo mismo que edita el lápiz); borde y relleno, en `styles`.
                <GeoLayerStyle kind="reference" label={m.label} style={{ ...st, color: m.ref?.color ?? '#22D3EE', weight: m.ref?.weight ?? 2 }}
                  defaults={{ color: m.ref?.color ?? '#22D3EE', weight: m.ref?.weight ?? 2, fillOp: 0 }}
                  onPatch={(patch) => {
                    const own: Record<string, unknown> = {}, rest: Record<string, unknown> = {};
                    for (const [pk, pv] of Object.entries(patch)) (pk === 'color' || pk === 'weight' ? own : rest)[pk] = pv;
                    if (Object.keys(rest).length) p.onStyle?.(sid, rest);
                    if (Object.keys(own).length) p.commit((c) => { const cur = c.layers?.[k]; if (!cur) return c; return { ...c, layers: { ...(c.layers ?? {}), [k]: { ...cur, ref: { ...(cur.ref ?? { count: 0, labels: false }), ...(own.color ? { color: String(own.color) } : {}), ...(typeof own.weight === 'number' ? { weight: own.weight } : {}) } as NonNullable<GeoLayerMeta['ref']> } } }; });
                  }}
                  onReset={() => {
                    p.onResetStyle?.(sid);
                    p.commit((c) => { const cur = c.layers?.[k]; if (!cur?.ref) return c; return { ...c, layers: { ...(c.layers ?? {}), [k]: { ...cur, ref: { ...cur.ref, color: '#22D3EE', weight: 2 } } } }; });
                  }}
                  onClose={() => setStyleKey(null)} />
              )}
              {editKey === k && (
                <RefEditForm meta={m} fields={v ? nameFields(v.fc) : []} onCancel={() => setEditKey(null)}
                  onSave={(patch) => { p.commit((c) => { const cur = c.layers?.[k]; if (!cur) return c; return { ...c, layers: { ...(c.layers ?? {}), [k]: { ...cur, label: patch.label.trim() || cur.label, ref: { ...(cur.ref ?? { count: 0 }), color: patch.color, weight: patch.weight, labels: patch.labels, nameField: patch.nameField } } } }; }); setEditKey(null); }} />
              )}
            </div>
          );
        })}
        {!data && !isPack && !grid && <p className="gv-hint">Aún no hay capas. Empieza por el área de estudio.</p>}
      </section>
    </div>
  );
}

function LayerRow({ id, label, role, vis, setVis, swatch, note, onDelete, onEdit, editing, defaultOn, onStyle, styling }: {
  defaultOn?: boolean; id: string; label: string; role: string; vis: VisState; setVis: Dispatch<SetStateAction<VisState>>; swatch: string; note?: string; onDelete?: () => void;
  onEdit?: () => void; editing?: boolean; onStyle?: () => void; styling?: boolean;
}) {
  const v = vis[id] ?? { on: defaultOn ?? (id === 'result' || id === 'parcels' || id === 'diff'), op: id === 'result' ? 0.9 : 0.85 };
  return (
    <div className={'gv-layer' + (v.on ? ' on' : '') + (editing ? ' editing' : '')}>
      <button type="button" className="eye" aria-pressed={v.on} aria-label={`${v.on ? 'Ocultar' : 'Mostrar'} ${label}`} onClick={() => setVis((s) => ({ ...s, [id]: { ...v, on: !v.on } }))}>
        <Icon d={v.on ? ICONS.eye : ICONS.eyeOff} />
      </button>
      <span className="sw" style={{ background: swatch }} />
      <span className="nm" title={label}>{label}<small>{role}</small></span>
      <span className="gv-layer-acts">
        {onStyle && (
          <button type="button" className={'btn icon sm' + (styling ? ' on' : '')} aria-pressed={styling} aria-label={`${styling ? 'Cerrar el estilo de' : 'Estilo de'} ${label}`} title="Estilo (color, borde, grosor)" onClick={onStyle}>
            <Icon d={STYLE_ICON} size={14} />
          </button>
        )}
        {onEdit && (
          <button type="button" className={'btn icon sm' + (editing ? ' on' : '')} aria-pressed={editing} aria-label={`${editing ? 'Cerrar edición de' : 'Editar'} ${label}`} onClick={onEdit}>
            <Icon d={ICONS.edit} size={14} />
          </button>
        )}
        {onDelete && (
          <button type="button" className="del" aria-label={`Borrar ${label}`} onClick={onDelete}>
            <Icon d={ICONS.trash} size={14} />
          </button>
        )}
      </span>
      <input type="range" min={0.1} max={1} step={0.05} value={v.op} aria-label={`Opacidad de ${label}`} onChange={(e) => setVis((s) => ({ ...s, [id]: { ...v, op: Number(e.target.value) } }))} />
      {note && <small className="note">{note}</small>}
    </div>
  );
}

function LayerEditForm({ meta, criteria, currentCriterionId, rules, layers, onCancel, onSave }: {
  meta: GeoLayerMeta; criteria: Criterion[]; currentCriterionId?: string;
  rules: GeoConfig['rules']; layers: Record<string, GeoLayerMeta>;
  onCancel: () => void; onSave: (patch: { label: string; unit: string; criterionId?: string }) => void;
}) {
  const [label, setLabel] = useState(meta.label);
  const [unit, setUnit] = useState(meta.unit);
  const [criterionId, setCriterionId] = useState(currentCriterionId ?? '');
  const conflictKey = meta.role === 'criterion' && criterionId && criterionId !== currentCriterionId ? rules[criterionId]?.layerKey : undefined;
  const conflictLabel = conflictKey ? layers[conflictKey]?.label : undefined;
  return (
    <div className="gv-pending">
      <label className="gv-field"><span>Nombre de la capa</span><input type="text" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
      {meta.role === 'criterion' && (
        <>
          <label className="gv-field"><span>Unidad</span><input type="text" value={unit} placeholder="m, °C, mm…" onChange={(e) => setUnit(e.target.value)} /></label>
          <label className="gv-field"><span>Criterio al que alimenta</span>
            <select value={criterionId} onChange={(e) => setCriterionId(e.target.value)}>
              <option value="">— ninguno todavía (solo verla) —</option>
              {criteria.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          {conflictLabel && <p className="gv-hint warn">Ese criterio ya lo alimenta «{conflictLabel}» — al guardar, esta capa lo reemplaza.</p>}
        </>
      )}
      <p className="gv-hint">Para cambiar el tipo de capa (criterio/exclusión/área) o cómo se calculó (distancia, presencia…), bórrala y súbela de nuevo: eso sí necesita reprocesar el archivo original.</p>
      <div className="gv-row-acts">
        <button type="button" className="btn primary sm" onClick={() => onSave({ label, unit, criterionId: meta.role === 'criterion' ? criterionId : undefined })}>Guardar</button>
        <button type="button" className="btn sm" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

/** Edición de una capa de referencia: nombre, color y grosor del contorno, etiquetas y atributo con el nombre de cada polígono. */
function RefEditForm({ meta, fields, onCancel, onSave }: {
  meta: GeoLayerMeta; fields: string[]; onCancel: () => void;
  onSave: (patch: { label: string; color: string; weight: number; labels: boolean; nameField?: string }) => void;
}) {
  const [label, setLabel] = useState(meta.label);
  const [color, setColor] = useState(meta.ref?.color ?? '#22D3EE');
  const [weight, setWeight] = useState(meta.ref?.weight ?? 2);
  const [labels, setLabels] = useState(!!meta.ref?.labels);
  const [nameField, setNameField] = useState(meta.ref?.nameField ?? '');
  const opts = Array.from(new Set([...(nameField ? [nameField] : []), ...fields]));
  return (
    <div className="gv-pending">
      <label className="gv-field"><span>Nombre de la capa</span><input type="text" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
      <label className="gv-field"><span>Color del contorno</span><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#22D3EE'} onChange={(e) => setColor(e.target.value)} /></label>
      <label className="gv-field"><span>Grosor del contorno ({weight} px)</span><input type="range" min={1} max={6} step={1} value={weight} onChange={(e) => setWeight(Number(e.target.value))} /></label>
      <label className="gv-field"><span>Atributo con el nombre de cada polígono</span>
        <select value={nameField} onChange={(e) => setNameField(e.target.value)}>
          <option value="">— ninguno —</option>
          {opts.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </label>
      <label className="gv-check"><input type="checkbox" checked={labels} disabled={!nameField} onChange={(e) => setLabels(e.target.checked)} /> Mostrar el nombre sobre cada polígono</label>
      <p className="gv-hint">Solo se dibuja el contorno (relleno transparente). Estos polígonos no entran al modelo.</p>
      <div className="gv-row-acts">
        <button type="button" className="btn primary sm" onClick={() => onSave({ label, color, weight, labels: labels && !!nameField, nameField: nameField || undefined })}>Guardar</button>
        <button type="button" className="btn sm" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
