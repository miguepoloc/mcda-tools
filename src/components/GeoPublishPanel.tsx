'use client';

/** «Vista pública» del geovisor: interruptor de público, enlace y publicación del mapa calculado
 * (`geo_publish_result`). La vista pública solo recibe el resultado: nunca las capas de entrada. */
import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { changedParts, describeChanges, type SigParts } from '@/lib/geo/publishSig';

type Status = { updated_at: string; sig: string | null; parts: SigParts | null; size_bytes: number } | null;
type Props = {
  sb: SupabaseClient | null; projectId: string;
  isPublic: boolean; token: string; onTogglePublic: (on: boolean) => void;
  ready: boolean; exploring: boolean;
  /** Firma antigua (un solo hash): solo para publicaciones hechas antes de la firma por partes. */
  sig: string;
  /** Firma por partes de lo calculado ahora (null mientras cargan las capas). */
  parts: SigParts | null;
  /** Advertencia sobre la calidad de lo que se va a publicar (p. ej. pesos inconsistentes, CR ≥ 0.10). */
  warn?: string;
  build: () => Promise<{ b64: string; meta: unknown }>;
  /** Interruptor GLOBAL de puntos y ranking en la vista pública (por defecto apagado). */
  showPoints: boolean;
  onShowPoints: (on: boolean) => void;
  nPoints: number;
};

export default function GeoPublishPanel(p: Props) {
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/p/${p.token}`;

  const load = useCallback(async () => {
    if (!p.sb) return;
    const { data } = await p.sb.from('geo_results').select('updated_at,size_bytes,sig:meta->>sig,parts:meta->sigParts').eq('project_id', p.projectId).maybeSingle();
    setStatus((data as Status) ?? null);
  }, [p.sb, p.projectId]);
  useEffect(() => { void load(); }, [load]);

  async function publish() {
    if (!p.sb) return;
    setBusy(true); setMsg('');
    try {
      const { b64, meta } = await p.build();
      const { error } = await p.sb.rpc('geo_publish_result', { p_project: p.projectId, p_grid_b64: b64, p_meta: meta });
      if (error) throw new Error(error.message);
      setMsg('Mapa publicado.');
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }

  // Con firma por partes se dice QUÉ cambió; una publicación anterior solo tiene el hash viejo (aviso genérico).
  const changed = status?.parts && p.parts ? changedParts(status.parts, p.parts) : [];
  const stale = !!status && (status.parts ? changed.length > 0 : status.sig !== p.sig);
  return (
    <section className="gv-sec">
      <header><h4>Vista pública</h4><span className={'gv-badge ' + (p.isPublic ? 'ok' : 'warn')}>{p.isPublic ? 'público' : 'privado'}</span></header>
      <p className="gv-hint">Cualquiera con el enlace ve <b>el resultado y su AHP</b>: el mapa, las clases, los pesos de los criterios con su análisis (matriz de comparaciones, consistencia, consenso, incertidumbre y la consistencia y los pesos de cada experto <b>sin nombre</b>) y, al hacer clic, el % de idoneidad de un punto. No ve tus capas de entrada ni los nombres de tus expertos.</p>
      <label className="gv-check">
        <input type="checkbox" checked={p.isPublic} onChange={(e) => p.onTogglePublic(e.target.checked)} /> Hacer público con enlace
      </label>
      <label className="gv-check">
        <input type="checkbox" checked={p.showPoints} onChange={(e) => p.onShowPoints(e.target.checked)} /> Mostrar puntos y ranking en la vista pública
      </label>
      {p.showPoints ? (
        <p className="gv-hint warn" role="status">
          Los nombres y ubicaciones de {p.nPoints === 1 ? 'tu punto' : `tus ${p.nPoints} puntos`} serán públicos para cualquiera con el enlace, junto con su índice, clase y puesto. Se publican al pulsar «{status ? 'Actualizar el mapa publicado' : 'Publicar el mapa'}».
        </p>
      ) : (
        <p className="gv-hint">Apagado: la vista pública no recibe tus puntos (ni sus nombres ni ubicaciones).</p>
      )}
      {p.isPublic && (
        <div className="linkbox">
          <input type="text" readOnly value={url} aria-label="Enlace público" onFocus={(e) => e.target.select()} />
          <button type="button" className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(url); setMsg('Enlace copiado'); } catch { setMsg('Copia el enlace manualmente'); } }}>Copiar</button>
        </div>
      )}
      <div className="gv-kv"><span>Mapa publicado</span><b className="mono">{status ? new Date(status.updated_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : 'aún no'}</b></div>
      {stale && <p className="gv-hint warn" role="status">{changed.length ? `Cambios desde la última publicación: ${describeChanges(changed)}.` : 'Cambiaste pesos, reglas o capas desde la última publicación.'} La vista pública muestra la versión anterior.</p>}
      {p.warn && <p className="gv-hint warn" role="alert">{p.warn}</p>}
      {!p.isPublic && status && <p className="gv-hint warn">El mapa ya está publicado, pero el enlace no funciona mientras el proyecto sea privado: activa «Hacer público con enlace».</p>}
      {p.exploring && <p className="gv-hint warn">Estás explorando otros pesos. Vuelve a los del panel para publicar.</p>}
      <div className="gv-row-acts">
        <button type="button" className="btn primary sm" disabled={busy || !p.ready || p.exploring || !p.sb} onClick={publish}>
          {busy ? 'Publicando…' : status ? 'Actualizar el mapa publicado' : 'Publicar el mapa'}
        </button>
      </div>
      {!p.ready && <p className="gv-hint">Necesitas un mapa calculado para publicarlo.</p>}
      {msg && <p className="gv-hint" role="status">{msg}</p>}
    </section>
  );
}
