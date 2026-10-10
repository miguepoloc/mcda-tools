'use client';

/** Pestaña «Puntos» del geovisor: agregar puntos con clic (modo explícito), importarlos de un CSV o GeoJSON con vista
 * previa, y ver su ranking por índice. El cálculo vive en `lib/geo/points.ts`; aquí solo la interfaz. */
import { useRef, useState, type ReactNode } from 'react';
import { MAX_POINTS, rankHeading, type GeoPoint, type RankedPoint } from '@/lib/geo/points';
import { mergeImported, parseCsvPoints, pointsFromFc, type ImportResult } from '@/lib/geo/pointsImport';
import type { Direction } from '@/lib/geo/suitability';
import ConfirmDialog from './ConfirmDialog';
import { Icon, ICONS } from './GeoBits';
import GeoPointsList, { type RankRow } from './GeoPointsList';

type Preview = { fileName: string; result: ImportResult; fc: unknown | null };
/** `after` = firma de la lista tal como quedó: el «Deshacer» solo se ofrece mientras nada más la haya cambiado. */
type Undo = { msg: string; prev: GeoPoint[]; after: string };
const sigOf = (pts: GeoPoint[]) => pts.map((x) => `${x.id}\u0001${x.name}`).join('\u0002');

type Props = {
  points: GeoPoint[];
  ranked: RankedPoint[];
  rows: RankRow[];
  /** Ficha del punto abierto en la lista (misma que la consulta del mapa). */
  renderDetail?: (row: RankRow) => ReactNode;
  direction: Direction;
  criticalLabel: string;
  /** Hay un mapa calculado (con área y reglas): sin él, los puntos se guardan pero no se evalúan. */
  ready: boolean;
  addMode: boolean;
  onAddMode: (on: boolean) => void;
  /** Aviso del último intento de agregar (p. ej. tope alcanzado). */
  addNote: string;
  selectedKey: string | null;
  onSelect: (id: string | null) => void;
  onCenter: (id: string) => void;
  onChange: (points: GeoPoint[]) => void;
  onExportCsv: () => void;
};

const TEXT_EXT = /\.(csv|txt|tsv)$/i;

export default function GeoPointsPanel(p: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [undo, setUndo] = useState<Undo | null>(null);
  const [toDelete, setToDelete] = useState<GeoPoint | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const full = p.points.length >= MAX_POINTS;

  async function onFile(file: File) {
    setErr(''); setPreview(null); setUndo(null); setBusy(true);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error(`«${file.name}» pesa ${(file.size / 1048576).toFixed(0)} MB: es demasiado para una lista de puntos.`);
      if (TEXT_EXT.test(file.name)) {
        setPreview({ fileName: file.name, result: parseCsvPoints(await file.text()), fc: null });
      } else {
        // GeoJSON, KML/KMZ, GPX o shapefile .zip: `parseFile` valida el sistema de coordenadas y devuelve la FeatureCollection.
        const { parseFile } = await import('@/lib/geo/parse');
        const parsed = await parseFile(file);
        const vec = parsed.find((x) => x.kind === 'vector');
        if (!vec || vec.kind !== 'vector') throw new Error(`«${file.name}» no trae geometrías vectoriales (los puntos vienen de un CSV, GeoJSON, KML, GPX o shapefile).`);
        setPreview({ fileName: file.name, result: pointsFromFc(vec.fc), fc: vec.fc });
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function apply() {
    if (!preview) return;
    const m = mergeImported(p.points, preview.result.rows);
    p.onChange(m.points);
    setUndo({ prev: p.points, after: sigOf(m.points), msg: `Se agregaron ${m.added} punto(s) de «${preview.fileName}»${m.dropped ? `; ${m.dropped} no cupieron (tope de ${MAX_POINTS})` : ''}.` });
    setPreview(null);
  }

  const res = preview?.result;
  const room = MAX_POINTS - p.points.length;
  const unit = preview?.fc ? 'Entidad' : 'Fila';

  return (
    <div className="gv-sec-stack">
      <section className="gv-sec">
        <header><h4>Puntos</h4><span className="gv-badge ok">{p.points.length} / {MAX_POINTS}</span></header>
        <p className="gv-hint">Marca sitios de interés (candidatos a boya, parcelas, estaciones…) y mira cuál queda mejor. Cada punto toma el índice de la celda donde cae, el mismo valor que ves en el mapa.</p>
        <div className="gv-row-acts">
          <button type="button" className={'btn sm' + (p.addMode ? ' primary' : '')} aria-pressed={p.addMode} disabled={full && !p.addMode} onClick={() => p.onAddMode(!p.addMode)}>
            <Icon d={ICONS.plus} size={13} /> {p.addMode ? 'Terminar de agregar' : 'Agregar punto'}
          </button>
          <button type="button" className="btn sm" disabled={busy || full} onClick={() => fileRef.current?.click()}>
            <Icon d={ICONS.upload} size={13} /> {busy ? 'Leyendo…' : 'Importar archivo'}
          </button>
          <input ref={fileRef} type="file" hidden accept=".csv,.txt,.tsv,.geojson,.json,.kml,.kmz,.gpx,.zip" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
          <button type="button" className="btn sm" disabled={!p.points.length} onClick={p.onExportCsv}>
            <Icon d={ICONS.download} size={13} /> Ranking (CSV)
          </button>
        </div>
        <p className="gv-hint">CSV con columnas <code>nombre,lat,lon</code> (o <code>x,y</code>), separador coma o «;», coma o punto decimal. También GeoJSON, KML, GPX o shapefile .zip (solo sus puntos).</p>
        {p.addMode && (
          <div className="gv-addnote" role="status">
            <b>Modo agregar punto activo.</b> Cada clic en el mapa crea un punto (con el mapa enfocado, Intro pone uno en el centro). Pulsa Esc o «Terminar de agregar» para volver a consultar.
          </div>
        )}
        {p.addNote && <p className="gv-hint warn" role="status">{p.addNote}</p>}
        {full && <p className="gv-hint warn">Llegaste al tope de {MAX_POINTS} puntos: elimina alguno para agregar más.</p>}
        {err && <p className="gv-hint warn" role="alert">{err}</p>}
      </section>

      {preview && res && (
        <section className="gv-sec" aria-label="Vista previa de la importación">
          <header><h4>Vista previa</h4></header>
          <p className="gv-hint"><b>{preview.fileName}</b>: {res.rows.length} punto(s) válido(s){res.errors.length ? ` · ${res.errors.length} aviso(s) o error(es)` : ''}.</p>
          {preview.fc !== null && res.nameFields.length > 0 && (
            <label className="gv-field">
              <span className="gv-hint">Propiedad con el nombre</span>
              <select value={res.nameField} onChange={(e) => setPreview({ ...preview, result: pointsFromFc(preview.fc, e.target.value) })}>
                <option value="">(sin nombre: «Punto N»)</option>
                {res.nameFields.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
          )}
          {res.rows.length > room && <p className="gv-hint warn">Hay lugar para {room} punto(s) más: se agregarán los primeros {room} y se omitirán {res.rows.length - room}.</p>}
          {res.errors.length > 0 && (
            <ul className="gv-perrs">
              {res.errors.slice(0, 8).map((e, i) => <li key={i}>{e.line !== null ? `${unit} ${e.line}: ` : ''}{e.msg}</li>)}
              {res.errors.length > 8 && <li>… y {res.errors.length - 8} más.</li>}
            </ul>
          )}
          {res.rows.length > 0 && (
            <ul className="gv-perrs ok">
              {res.rows.slice(0, 3).map((r, i) => <li key={i}>{r.name || '(sin nombre)'} · {r.lat.toFixed(5)}, {r.lon.toFixed(5)}</li>)}
              {res.rows.length > 3 && <li>… y {res.rows.length - 3} más.</li>}
            </ul>
          )}
          <div className="gv-row-acts">
            <button type="button" className="btn primary sm" disabled={!res.rows.length || room <= 0} onClick={apply}>Agregar {Math.min(res.rows.length, room)} punto(s)</button>
            <button type="button" className="btn sm" onClick={() => setPreview(null)}>Cancelar</button>
          </div>
        </section>
      )}

      {undo && sigOf(p.points) === undo.after && (
        <div className="gv-addnote ok" role="status">
          {undo.msg} <button type="button" className="btn sm" onClick={() => { p.onChange(undo.prev); setUndo(null); }}>Deshacer</button>
        </div>
      )}

      <section className="gv-sec">
        {p.points.length === 0 ? (
          <p className="gv-hint">Aún no hay puntos. Usa «Agregar punto» y haz clic en el mapa, o importa un archivo.</p>
        ) : (
          <>
            {!p.ready && <p className="gv-hint warn" role="status">Todavía no hay un mapa calculado (área, capas y reglas): los puntos se guardan y se evaluarán cuando lo haya.</p>}
            <GeoPointsList
              rows={p.rows} renderDetail={p.renderDetail} heading={rankHeading(p.direction)} criticalLabel={p.criticalLabel}
              selectedKey={p.selectedKey} onSelect={p.onSelect} onCenter={p.onCenter}
              onRename={(id, name) => p.onChange(p.points.map((x) => (x.id === id ? { ...x, name } : x)))}
              onDelete={(id) => setToDelete(p.points.find((x) => x.id === id) ?? null)}
            />
            {p.ranked.some((r) => r.status !== 'ok') && <p className="gv-hint">Los puntos sin evaluar van al final, sin puesto: no cuentan como 0 %.</p>}
          </>
        )}
      </section>

      {toDelete && (
        <ConfirmDialog
          title={`Eliminar «${toDelete.name}»`}
          description={<>Se quita el punto <b>{toDelete.name}</b> ({toDelete.lat.toFixed(5)}, {toDelete.lon.toFixed(5)}) de la lista y del ranking. Podrás deshacerlo justo después.</>}
          confirmLabel="Eliminar punto"
          onClose={() => setToDelete(null)}
          onConfirm={() => {
            const prev = p.points;
            const next = prev.filter((x) => x.id !== toDelete.id);
            p.onChange(next);
            setUndo({ prev, after: sigOf(next), msg: `Se eliminó «${toDelete.name}».` });
            if (p.selectedKey === toDelete.id) p.onSelect(null);
            setToDelete(null);
          }}
        />
      )}
    </div>
  );
}
