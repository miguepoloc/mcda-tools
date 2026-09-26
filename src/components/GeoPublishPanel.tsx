'use client';

/** «Vista pública» del geovisor: interruptor de público, enlace y publicación del mapa calculado
 * (`geo_publish_result`). La vista pública solo recibe el resultado: nunca las capas de entrada. */
import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type Status = { updated_at: string; sig: string | null; size_bytes: number } | null;
type Props = {
  sb: SupabaseClient | null; projectId: string;
  isPublic: boolean; token: string; onTogglePublic: (on: boolean) => void;
  ready: boolean; exploring: boolean; sig: string;
  /** Advertencia sobre la calidad de lo que se va a publicar (p. ej. pesos inconsistentes, CR ≥ 0.10). */
  warn?: string;
  build: () => Promise<{ b64: string; meta: unknown }>;
};

export default function GeoPublishPanel(p: Props) {
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/p/${p.token}`;

  const load = useCallback(async () => {
    if (!p.sb) return;
    const { data } = await p.sb.from('geo_results').select('updated_at,size_bytes,sig:meta->>sig').eq('project_id', p.projectId).maybeSingle();
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

  const stale = status && status.sig !== p.sig;
  return (
    <section className="gv-sec">
      <header><h4>Vista pública</h4><span className={'gv-badge ' + (p.isPublic ? 'ok' : 'warn')}>{p.isPublic ? 'público' : 'privado'}</span></header>
      <p className="gv-hint">Cualquiera con el enlace ve <b>el resultado y su AHP</b>: el mapa, las clases, los pesos de los criterios con su análisis (matriz de comparaciones, consistencia, consenso, incertidumbre y la consistencia y los pesos de cada experto <b>sin nombre</b>) y, al hacer clic, el % de idoneidad de un punto. No ve tus capas de entrada ni los nombres de tus expertos.</p>
      <label className="gv-check">
        <input type="checkbox" checked={p.isPublic} onChange={(e) => p.onTogglePublic(e.target.checked)} /> Hacer público con enlace
      </label>
      {p.isPublic && (
        <div className="linkbox">
          <input type="text" readOnly value={url} aria-label="Enlace público" onFocus={(e) => e.target.select()} />
          <button type="button" className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(url); setMsg('Enlace copiado'); } catch { setMsg('Copia el enlace manualmente'); } }}>Copiar</button>
        </div>
      )}
      <div className="gv-kv"><span>Mapa publicado</span><b className="mono">{status ? new Date(status.updated_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : 'aún no'}</b></div>
      {stale && <p className="gv-hint warn">Cambiaste pesos, reglas o capas desde la última publicación: la vista pública muestra la versión anterior.</p>}
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
