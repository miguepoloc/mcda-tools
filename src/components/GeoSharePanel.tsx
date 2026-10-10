'use client';

/** Pestaña «Compartir» de un proyecto de mapa: publicar el resultado con enlace público (+ QR), elegir qué ve quien lo
 * abra y otras formas de compartir. Se monta en la pestaña del proyecto mediante un portal desde el geovisor, que es el
 * dueño del mapa calculado (`build`) y de las firmas de publicación. La vista pública solo recibe el resultado: nunca
 * las capas de entrada. */
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import QrModal from './QrModal';
import type { SigParts } from '@/lib/geo/publishSig';
import { publicLink, publishView, viewerRows, type PublishedStatus } from '@/lib/geo/share';
import './geo-share.css';

type Props = {
  sb: SupabaseClient | null; projectId: string; title: string; fileBase: string;
  isPublic: boolean; token: string; onTogglePublic: (on: boolean) => void;
  ready: boolean; exploring: boolean;
  /** Firma antigua (un solo hash): solo para publicaciones hechas antes de la firma por partes. */
  sig: string;
  /** Firma por partes de lo calculado ahora (null mientras cargan las capas). */
  parts: SigParts | null;
  /** Advertencia sobre la calidad de lo que se va a publicar (p. ej. pesos inconsistentes, CR ≥ 0.10). */
  warn?: string;
  build: () => Promise<{ b64: string; meta: unknown }>;
  showPoints: boolean; onShowPoints: (on: boolean) => void; nPoints: number;
  showZones: boolean; onShowZones: (on: boolean) => void;
  zonesReady: boolean; hasPop: boolean;
  /** «Otras formas de compartir». */
  onGoExperts: () => void; onPrioExcel: () => void;
  /** Solo docente/admin en un proyecto sin paquete: el panel del catálogo del curso (plegado). */
  catalog?: ReactNode;
};

const fmtDate = (iso: string) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

export default function GeoSharePanel(p: Props) {
  const uid = useId();
  const [status, setStatus] = useState<PublishedStatus>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [qrImg, setQrImg] = useState('');
  const url = typeof window === 'undefined' ? '' : publicLink(window.location.origin, p.token);

  const load = useCallback(async () => {
    if (!p.sb) return;
    const { data } = await p.sb.from('geo_results').select('updated_at,size_bytes,sig:meta->>sig,parts:meta->sigParts').eq('project_id', p.projectId).maybeSingle();
    setStatus((data as PublishedStatus) ?? null);
  }, [p.sb, p.projectId]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!p.isPublic || !url) { setQrImg(''); return; }
    let alive = true;
    QRCode.toDataURL(url, { width: 264, margin: 1, color: { dark: '#0F172A', light: '#FFFFFF' } })
      .then((d) => { if (alive) setQrImg(d); }).catch(() => { if (alive) setQrImg(''); });
    return () => { alive = false; };
  }, [p.isPublic, url]);

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

  const view = publishView(status, p.parts, p.sig);
  const rows = viewerRows({ showPoints: p.showPoints, showZones: p.showZones, nPoints: p.nPoints, zonesReady: p.zonesReady, hasPop: p.hasPop, published: !!status });
  const toggles: Record<string, (on: boolean) => void> = { points: p.onShowPoints, zones: p.onShowZones };

  return (
    <div className="gs-slot">
      <section className="card form gs-card" aria-labelledby={`${uid}-pub`}>
        <div className="gs-head">
          <h3 id={`${uid}-pub`}>Enlace público</h3>
          <span className={'pill ' + (p.isPublic ? '' : 'neutral')}>{p.isPublic ? 'Público' : 'Privado'}</span>
        </div>
        <label className="gs-switch">
          <input type="checkbox" checked={p.isPublic} onChange={(e) => p.onTogglePublic(e.target.checked)} /> Hacer público con enlace
        </label>
        {p.isPublic ? (
          <div className="gs-link">
            <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
              <div className="linkbox">
                <input type="text" readOnly value={url} aria-label="Enlace público" onFocus={(e) => e.target.select()} />
                <button type="button" className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(url); setMsg('Enlace copiado.'); } catch { setMsg('Copia el enlace manualmente.'); } }}>Copiar</button>
              </div>
              <div className="acts">
                <button type="button" className="btn sm" onClick={() => setQrOpen(true)}>Ver QR grande y descargar</button>
              </div>
            </div>
            <div className="gs-qr">
              {qrImg
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={qrImg} alt="Código QR del enlace público" width={132} height={132} />
                : <div className="gs-qr-ph">Generando QR…</div>}
            </div>
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Ahora mismo solo tú ves el mapa. Al activar el enlace, cualquiera que lo tenga ve el resultado publicado.</p>
        )}

        <div className="gs-kv">
          <span>Publicado: <b>{status ? fmtDate(status.updated_at) : 'aún no'}</b></span>
        </div>
        {status && (
          <div className={'gs-state ' + (view.state === 'current' ? 'ok' : 'stale')} role="status">
            <span className="dot" aria-hidden="true" />
            <span>{view.label}{view.state === 'stale' ? '. La vista pública muestra la versión anterior.' : '.'}</span>
          </div>
        )}
        {p.warn && <p className="gs-warn-inline" role="alert"><b>Ojo:</b> {p.warn}</p>}
        {!p.isPublic && status && <p className="gs-warn-inline">El mapa ya está publicado, pero el enlace no funciona mientras el proyecto sea privado: activa «Hacer público con enlace».</p>}
        {p.exploring && <p className="gs-warn-inline">Estás explorando otros pesos en el Geovisor. Vuelve a los del panel para publicar.</p>}
        {!p.ready && <p className="muted" style={{ fontSize: 13, margin: 0 }}>Necesitas un mapa calculado (pestaña «Geovisor») para publicarlo.</p>}
        <div className="acts">
          <button type="button" className="btn primary" disabled={busy || !p.ready || p.exploring || !p.sb} onClick={publish}>
            {busy ? 'Publicando…' : status ? 'Publicar / Actualizar el mapa publicado' : 'Publicar el mapa'}
          </button>
        </div>
        <p className="gs-msg" role="status" aria-live="polite">{msg}</p>
      </section>

      <section className="card form gs-card" aria-labelledby={`${uid}-see`}>
        <h3 id={`${uid}-see`}>Qué ve quien abra el enlace</h3>
        <div className="gs-rows">
          {rows.map((r) => (
            <div className="gs-row" key={r.key}>
              <input id={`${uid}-${r.key}`} type="checkbox" checked={r.checked} disabled={r.locked}
                onChange={(e) => toggles[r.key]?.(e.target.checked)} aria-describedby={`${uid}-${r.key}-d`} />
              <label htmlFor={`${uid}-${r.key}`}><b>{r.label}</b></label>
              <p id={`${uid}-${r.key}-d`} style={{ gridColumn: 2 }}>{r.desc}</p>
              {r.warn && <p className="gs-warn" role="status">{r.warn}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="card form gs-card" aria-labelledby={`${uid}-oth`}>
        <h3 id={`${uid}-oth`}>Otras formas de compartir</h3>
        <div className="gs-other">
          <div className="gs-other-row">
            <div><b>Enlace para expertos</b><p>Cada experto, o un enlace abierto para todo un grupo, llena sus juicios sin crear cuenta.</p></div>
            <button type="button" className="btn sm" onClick={p.onGoExperts}>Ir a Expertos</button>
          </div>
          <div className="gs-other-row">
            <div><b>Excel de la priorización de criterios</b><p>La Sesión 1, en un archivo aparte. El mapa se descarga desde Geovisor → Exportar.</p></div>
            <button type="button" className="btn sm" onClick={p.onPrioExcel}>Descargar Excel</button>
          </div>
          {p.catalog && (
            <details className="gs-details">
              <summary>Catálogo del curso (solo docente)</summary>
              {p.catalog}
            </details>
          )}
        </div>
      </section>

      {qrOpen && p.isPublic && (
        <QrModal title="Enlace público" url={url} caption={p.title} fileBase={`${p.fileBase}_enlace_publico`}
          card={{ heading: p.title, subheading: 'Escanea para ver el mapa de aptitud' }} onClose={() => setQrOpen(false)} />
      )}
    </div>
  );
}
