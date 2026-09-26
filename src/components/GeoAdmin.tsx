'use client';

/** Backoffice del Geovisor (solo admin; las funciones `admin_geo_*` validan el rol en la base):
 * topes globales y cuota editables (suben o bajan; bajar nunca borra nada), uso por usuario,
 * catálogo de paquetes y limpieza de archivos huérfanos. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { deleteCatalogPack, listCatalog, type CatalogRow } from '@/lib/geo/catalog';
import { BUCKET, removeLayers } from '@/lib/geo/store';
import { friendlyError } from '@/lib/errors';
import { Num } from './GeoBits';
import ConfirmDialog from './ConfirmDialog';

type Settings = { quota_mb: number; max_layers: number; max_pixels: number; public_max_kb: number };
type Usage = { user_id: string; email: string; name: string | null; used_bytes: number; layers: number; projects: number; quota_bytes: number; custom_mb: number | null };
type Orphan = { name: string; bytes: number };
type Ask = { kind: 'pack'; pack: CatalogRow } | { kind: 'orphans' } | null;

const mb = (b: number) => (b / 1048576).toLocaleString('es-CO', { maximumFractionDigits: 1 });

/** Rangos que exige `admin_set_geo_settings` (migración 12). Se repiten aquí para avisar antes de enviar y para
 * limitar los campos; la base sigue siendo quien decide. */
const LIMITS = {
  quota_mb: { label: 'Cuota por usuario (MB)', min: 0, max: 10240 },
  max_layers: { label: 'Capas máximas por usuario', min: 1, max: 100 },
  max_pixels: { label: 'Celdas máximas por mapa', min: 10000, max: 4000000 },
  public_max_kb: { label: 'Tamaño máximo publicado (KB)', min: 100, max: 8000 },
} as const;

/** Las funciones admin_* lanzan mensajes en español pensados para mostrarse; lo técnico se traduce. */
function msgOf(e: unknown): string {
  const raw = e instanceof Error ? e.message : (e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : '');
  if (/^no autorizado$/i.test(raw.trim())) return 'Tu sesión ya no es de administrador. Recarga la página o vuelve a iniciar sesión.';
  const known = friendlyError(e, '');
  if (known) return known;
  return !raw || /does not exist|syntax|violates|relation|column|function |pgrst|pg_|schema/i.test(raw) ? 'No se pudo completar la acción. Intenta de nuevo.' : raw;
}

export default function GeoAdmin({ client }: { client?: SupabaseClient } = {}) {
  const sb = useMemo(() => client ?? createClient(), [client]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [orphans, setOrphans] = useState<Orphan[]>([]);
  const [packs, setPacks] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ email: string; mb: number | null } | null>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [askError, setAskError] = useState('');
  const [q, setQ] = useState('');
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    const [s, u, o, c] = await Promise.all([sb.rpc('admin_geo_settings'), sb.rpc('admin_geo_usage'), sb.rpc('admin_geo_orphans'), listCatalog(sb)]);
    // Sin los topes no hay nada que administrar: se dice qué falló en vez de dejar la pestaña en blanco.
    if (s.error || !s.data) { setLoadError(s.error ? msgOf(s.error) : 'La base no devolvió la configuración.'); return; }
    setLoadError('');
    setSettings(s.data as Settings);
    setUsage((u.data as Usage[]) ?? []); setOrphans((o.data as Orphan[]) ?? []); setPacks(c);
  }, [sb]);
  useEffect(() => { void load().finally(() => setLoading(false)); }, [load]);

  /** Ejecuta una acción con un solo vuelo a la vez (doble clic), recarga y anuncia el resultado. */
  async function run(fn: () => Promise<string | void>): Promise<boolean> {
    if (inFlight.current) return false;
    inFlight.current = true; setBusy(true); setMsg(null);
    try { const m = await fn(); setMsg({ text: m || 'Guardado.', ok: true }); await load(); return true; }
    catch (e) { setMsg({ text: msgOf(e), ok: false }); return false; }
    finally { inFlight.current = false; setBusy(false); }
  }
  const rpc = async (name: string, args: Record<string, unknown>) => { const { error } = await sb.rpc(name, args); if (error) throw error; };

  if (loading) return <p className="muted" role="status">Cargando la configuración de mapas…</p>;
  if (!settings) {
    return (
      <div className="banner" role="alert">
        <span><b>No se pudo cargar la configuración de mapas.</b> {loadError}</span>
        <button type="button" className="btn sm" onClick={() => { setLoading(true); void load().finally(() => setLoading(false)); }}>Reintentar</button>
      </div>
    );
  }

  const orphanBytes = orphans.reduce((a, o) => a + o.bytes, 0);
  const invalid = (Object.keys(LIMITS) as (keyof Settings)[]).filter((k) => !(settings[k] >= LIMITS[k].min && settings[k] <= LIMITS[k].max));
  const qn = q.trim().toLowerCase();
  const usageRows = qn ? usage.filter((u) => `${u.name ?? ''} ${u.email}`.toLowerCase().includes(qn)) : usage;
  const closeAsk = () => { if (busy) return; setAsk(null); setAskError(''); };

  async function confirmAsk() {
    if (!ask) return;
    setAskError('');
    const done = await run(async () => {
      if (ask.kind === 'pack') { await deleteCatalogPack(sb, ask.pack); return `Borraste el paquete «${ask.pack.title}».`; }
      // De 100 en 100: una sola petición con cientos de rutas puede rechazarse por tamaño.
      const names = orphans.map((o) => o.name);
      for (let i = 0; i < names.length; i += 100) await removeLayers(sb, names.slice(i, i + 100));
      return `Se borraron ${names.length} archivo(s) huérfano(s) (bucket ${BUCKET}).`;
    });
    if (done) setAsk(null);
    else setAskError('No se pudo completar. Revisa el aviso de arriba e inténtalo de nuevo.');
  }

  return (
    <div className="stat-group" id="geovisor">
      <h2>Mapas de aptitud (Geovisor)</h2>
      <p className="muted" style={{ maxWidth: '75ch', fontSize: 13.5 }}>
        La cuota se mide sobre los archivos reales guardados. Puedes subirla o bajarla cuando quieras: <b>bajarla no borra nada</b>, solo bloquea nuevas subidas a quien ya la superó.
      </p>

      {/* Un solo lugar para el resultado de cualquier acción de esta pestaña (antes salía dentro de «Topes globales»). */}
      <div aria-live="polite">
        {msg && <p className={msg.ok ? 'gv-msg' : 'err'} role={msg.ok ? 'status' : 'alert'} style={{ fontSize: 13.5 }}>{msg.text}</p>}
      </div>

      <div className="card form">
        <h3 style={{ fontSize: 16 }}>Topes globales</h3>
        <div className="gv-admin-grid">
          {(Object.keys(LIMITS) as (keyof Settings)[]).map((k) => (
            <label key={k} className="gv-field"><span>{LIMITS[k].label}</span>
              <Num label={LIMITS[k].label} min={LIMITS[k].min} max={LIMITS[k].max} step="1" value={settings[k]} onChange={(n) => setSettings({ ...settings, [k]: Math.round(n) })} />
              <small className={'muted' + (invalid.includes(k) ? ' bad' : '')}>{invalid.includes(k) ? 'Fuera de rango: ' : 'Rango: '}{LIMITS[k].min.toLocaleString('es-CO')} a {LIMITS[k].max.toLocaleString('es-CO')}</small></label>
          ))}
        </div>
        <div className="acts">
          <button type="button" className="btn primary" disabled={busy || invalid.length > 0}
            onClick={() => void run(async () => { await rpc('admin_set_geo_settings', { p_quota_mb: settings.quota_mb, p_max_layers: settings.max_layers, p_max_pixels: settings.max_pixels, p_public_max_kb: settings.public_max_kb }); return 'Topes guardados.'; })}>
            {busy ? 'Guardando…' : 'Guardar topes'}
          </button>
        </div>
      </div>

      <details open style={{ marginTop: 12 }}>
        <summary>Uso por usuario ({usage.length})</summary>
        {usage.length > 6 && (
          <div className="usearch" style={{ marginTop: 10 }}>
            <label htmlFor="gu-search" className="sr-only">Buscar usuario por nombre o correo</label>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
            <input id="gu-search" type="search" placeholder="Buscar por nombre o correo" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          </div>
        )}
        <div className="tbl" style={{ marginTop: 10 }} role="region" aria-label="Uso de mapas por usuario (desplázala para ver más columnas)" tabIndex={0}>
          <table>
            <caption className="sr-only">Uso de almacenamiento de mapas por usuario, con su cuota</caption>
            <thead><tr><th scope="col">Usuario</th><th scope="col" className="n">Proyectos de mapa</th><th scope="col" className="n">Capas</th><th scope="col">Usado</th><th scope="col">Cuota</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              {usageRows.map((u) => (
                <tr key={u.user_id}>
                  <td>{u.name || '—'}<br /><span className="muted" style={{ fontSize: 12 }}>{u.email}</span></td>
                  <td className="n">{u.projects}</td><td className="n">{u.layers}</td>
                  <td>{mb(u.used_bytes)} MB{u.used_bytes > u.quota_bytes && <b className="gv-over"> · sobre la cuota</b>}</td>
                  <td>{edit?.email === u.email
                    ? <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Num label={`Cuota individual de ${u.email} en MB`} width={90} min={0} max={10240} step="1" value={edit.mb ?? settings.quota_mb} onChange={(n) => setEdit({ email: u.email, mb: Math.round(n) })} /> MB
                        <button type="button" className="btn sm primary" disabled={busy || (edit.mb ?? 0) < 0 || (edit.mb ?? 0) > 10240} onClick={() => void run(async () => { await rpc('admin_set_user_quota', { p_email: u.email, p_mb: edit.mb }); setEdit(null); return `Cuota de ${u.email}: ${edit.mb} MB.`; })}>Guardar</button>
                        <button type="button" className="btn sm" onClick={() => setEdit(null)}>Cancelar</button>
                      </span>
                    : <>{mb(u.quota_bytes)} MB{u.custom_mb !== null ? ' (individual)' : ' (global)'}</>}</td>
                  <td className="uact">
                    {edit?.email !== u.email && <button type="button" className="btn sm" onClick={() => setEdit({ email: u.email, mb: u.custom_mb })} aria-label={`Cambiar la cuota de ${u.email}`}>Cambiar cuota</button>}
                    {u.custom_mb !== null && edit?.email !== u.email && <button type="button" className="btn sm" style={{ marginLeft: 6 }} disabled={busy} aria-label={`Usar la cuota global para ${u.email}`}
                      onClick={() => void run(async () => { await rpc('admin_set_user_quota', { p_email: u.email, p_mb: null }); return `${u.email} usa ahora la cuota global.`; })}>Usar la global</button>}
                  </td>
                </tr>
              ))}
              {!usage.length && <tr><td colSpan={6} className="muted">Nadie ha creado mapas todavía.</td></tr>}
              {!!usage.length && !usageRows.length && <tr><td colSpan={6} className="muted">Ningún usuario coincide con «{q}».</td></tr>}
            </tbody>
          </table>
        </div>
      </details>

      <details open style={{ marginTop: 10 }}>
        <summary>Catálogo del curso ({packs.length})</summary>
        <p className="muted" style={{ fontSize: 13 }}>Los paquetes se crean desde un proyecto de mapa tuyo: Geovisor → Exportar → «Catálogo del curso». Aquí los activas, ocultas o borras.</p>
        <div className="tbl" style={{ marginTop: 10 }} role="region" aria-label="Paquetes del catálogo (desplázala para ver más columnas)" tabIndex={0}>
          <table>
            <caption className="sr-only">Paquetes del catálogo del curso</caption>
            <thead><tr><th scope="col">Paquete</th><th scope="col" className="n">Capas</th><th scope="col" className="n">Peso</th><th scope="col">Estado</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              {packs.map((p) => {
                const layers = Object.values(p.definition.geo.layers);
                return (
                  <tr key={p.id}>
                    <td><b>{p.title}</b><br /><span className="muted mono" style={{ fontSize: 12 }}>{p.id}</span></td>
                    <td className="n">{layers.length}</td><td className="n">{mb(layers.reduce((a, l) => a + (l.bytes || 0), 0))} MB</td>
                    <td>{p.is_active ? 'Activo' : 'Oculto'}</td>
                    <td className="uact">
                      <button type="button" className="btn sm" disabled={busy} aria-label={`${p.is_active ? 'Ocultar' : 'Activar'} el paquete ${p.title}`}
                        onClick={() => void run(async () => { const { error } = await sb.from('geo_packs').update({ is_active: !p.is_active }).eq('id', p.id); if (error) throw error; return `«${p.title}» ahora está ${p.is_active ? 'oculto' : 'activo'}.`; })}>{p.is_active ? 'Ocultar' : 'Activar'}</button>
                      <button type="button" className="btn sm danger" style={{ marginLeft: 6 }} disabled={busy} aria-label={`Borrar el paquete ${p.title}`}
                        onClick={() => { setMsg(null); setAsk({ kind: 'pack', pack: p }); }}>Borrar…</button>
                    </td>
                  </tr>
                );
              })}
              {!packs.length && <tr><td colSpan={5} className="muted">Aún no has publicado paquetes.</td></tr>}
            </tbody>
          </table>
        </div>
      </details>

      <details style={{ marginTop: 10 }}>
        <summary>Archivos huérfanos ({orphans.length} · {mb(orphanBytes)} MB)</summary>
        <p className="muted" style={{ fontSize: 13 }}>Capas cuyo proyecto ya no existe (quedan si falló una limpieza o si se eliminó una cuenta). Solo se listan y borran estas; nunca las de un proyecto vivo.</p>
        <div className="acts">
          <button type="button" className="btn sm danger" disabled={busy || !orphans.length} onClick={() => { setMsg(null); setAsk({ kind: 'orphans' }); }}>
            {orphans.length ? `Borrar los ${orphans.length} huérfanos…` : 'No hay huérfanos'}
          </button>
        </div>
      </details>

      {ask?.kind === 'pack' && (
        <ConfirmDialog
          title={`Borrar el paquete «${ask.pack.title}»`} confirmLabel="Borrar paquete" busyLabel="Borrando…"
          busy={busy} error={askError} onConfirm={() => void confirmAsk()} onClose={closeAsk}
          description={
            <>
              <p>Se borran el paquete <b className="mono">{ask.pack.id}</b> y sus capas del almacén público del curso. <b>No se puede deshacer.</b></p>
              <p>Los proyectos que se crearon a partir de este paquete <b>dejarán de cargar sus capas</b>. Si solo quieres que los estudiantes no lo vean al crear un mapa, mejor <b>ocúltalo</b>.</p>
            </>
          }
        />
      )}
      {ask?.kind === 'orphans' && (
        <ConfirmDialog
          title="Borrar los archivos huérfanos" confirmLabel="Borrar archivos" busyLabel="Borrando…"
          busy={busy} error={askError} onConfirm={() => void confirmAsk()} onClose={closeAsk}
          description={<><p>Se borrarán <b>{orphans.length}</b> archivo(s), {mb(orphanBytes)} MB, cuyo proyecto ya no existe. <b>No se puede deshacer.</b></p><p>Los archivos de proyectos vivos no se tocan.</p></>}
        />
      )}
    </div>
  );
}
