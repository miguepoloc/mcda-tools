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
import { publicLink, publishView, viewerRows, type PublishedStatus, type RefShareRow } from '@/lib/geo/share';
import { BASEMAPS } from './GeoMap';
import { EMBED_BASES, EMBED_PRESETS, EMBED_SIZE, clampSize, embedUrl, iframeCode, type EmbedBase, type EmbedPanel, type EmbedStyle } from '@/lib/embed';
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
  /** Capas de «Referencia» del proyecto (una fila por capa, con su nombre), aviso de lo marcado y recortes. */
  refLayers: RefShareRow[]; refWarn: string; refNotes: string[]; onToggleRef: (id: string, on: boolean) => void;
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

  // «Incrustar en otra página»: el código y la vista previa salen de la misma URL embebida.
  const [embPreset, setEmbPreset] = useState('wide');
  const [embFull, setEmbFull] = useState(true);
  const [embW, setEmbW] = useState<number>(EMBED_SIZE.defW);
  const [embH, setEmbH] = useState<number>(520);
  const [embStyle, setEmbStyle] = useState<EmbedStyle>('continuous');
  const [embBase, setEmbBase] = useState<EmbedBase>('sat');
  const [embPanel, setEmbPanel] = useState<EmbedPanel>('map');
  const [embPreview, setEmbPreview] = useState(false);
  const panelOk = embPanel === 'map' || (embPanel === 'points' && p.showPoints && p.nPoints > 0) || (embPanel === 'zones' && p.showZones && p.zonesReady);
  const embUrl = embedUrl(typeof window === 'undefined' ? '' : window.location.origin, p.token, { style: embStyle, base: embBase, panel: panelOk ? embPanel : 'map' });
  const code = iframeCode({ url: embUrl, title: `Mapa: ${p.title}`, width: embFull ? '100%' : embW, height: embH });

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
        <fieldset className="gs-refs">
          <legend>Mostrar capas de referencia</legend>
          {p.refLayers.length === 0 ? (
            <p className="gs-hint-s">Este mapa no tiene capas de referencia. En «Capas», sube un archivo de polígonos con el papel «Referencia» (vías, resguardos, ríos…) para poder mostrarlo.</p>
          ) : (
            <>
              <p id={`${uid}-refs-d`} className="gs-hint-s">Elige qué capas de contexto se dibujan sobre el mapa público. Solo viaja la forma (simplificada) y el nombre de la capa; nunca sus atributos. No entran al cálculo.</p>
              <div className="gs-rows">
                {p.refLayers.map((r) => (
                  <div className="gs-row" key={r.id}>
                    <input id={`${uid}-ref-${r.id}`} type="checkbox" checked={r.checked} aria-describedby={`${uid}-refs-d`}
                      onChange={(e) => p.onToggleRef(r.id, e.target.checked)} />
                    <label htmlFor={`${uid}-ref-${r.id}`}><b>{r.label}</b> <span className="muted">· {r.count.toLocaleString('es-CO')} elemento(s)</span></label>
                  </div>
                ))}
              </div>
              {p.refWarn && <p className="gs-warn" role="status">{p.refWarn}</p>}
              {p.refNotes.length > 0 && <ul className="gs-hint-s gs-refnotes">{p.refNotes.map((n) => <li key={n}>{n}</li>)}</ul>}
            </>
          )}
        </fieldset>
      </section>

      <section className="card form gs-card" aria-labelledby={`${uid}-emb`}>
        <h3 id={`${uid}-emb`}>Incrustar en otra página</h3>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>Pega este código en tu sitio, blog o plataforma de aprendizaje. Muestra solo el mapa publicado, con su leyenda y el selector de vista; sin cabecera de la plataforma.</p>
        {!p.isPublic && <p className="gs-warn-inline">Activa «Hacer público con enlace» arriba: mientras el proyecto sea privado, el código mostrará «contenido no disponible».</p>}
        {p.isPublic && !status && <p className="gs-warn-inline">Aún no has publicado el mapa: el código mostrará «aún no publicado» hasta que lo hagas.</p>}
        <div className="gs-emb-grid">
          <label>Tamaño
            <select value={embPreset} onChange={(e) => {
              setEmbPreset(e.target.value);
              const pr = EMBED_PRESETS.find((x) => x.key === e.target.value);
              if (pr) { setEmbFull(pr.w === '100%'); if (pr.w !== '100%') setEmbW(pr.w); setEmbH(pr.h); }
            }}>
              {EMBED_PRESETS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              <option value="custom">Personalizado</option>
            </select>
          </label>
          <label>Ancho (px)
            <input type="number" inputMode="numeric" min={EMBED_SIZE.minW} max={EMBED_SIZE.maxW} step={10} value={embW} disabled={embFull}
              onChange={(e) => { setEmbW(Number(e.target.value)); setEmbPreset('custom'); }} />
          </label>
          <label>Alto (px)
            <input type="number" inputMode="numeric" min={EMBED_SIZE.minH} max={EMBED_SIZE.maxH} step={10} value={embH}
              onChange={(e) => { setEmbH(Number(e.target.value)); setEmbPreset('custom'); }} />
          </label>
          <label className="gs-emb-chk"><input type="checkbox" checked={embFull} onChange={(e) => { setEmbFull(e.target.checked); setEmbPreset('custom'); }} /> Ocupar todo el ancho disponible</label>
          <label>Estilo inicial
            <select value={embStyle} onChange={(e) => setEmbStyle(e.target.value as EmbedStyle)}>
              <option value="continuous">Continuo</option>
              <option value="classes">Por clases</option>
            </select>
          </label>
          <label>Mapa base
            <select value={embBase} onChange={(e) => setEmbBase(e.target.value as EmbedBase)}>
              {EMBED_BASES.map((b) => <option key={b} value={b}>{BASEMAPS[b].label}</option>)}
            </select>
          </label>
          <label>Vista inicial
            <select value={embPanel} onChange={(e) => setEmbPanel(e.target.value as EmbedPanel)}>
              <option value="map">Mapa</option>
              {p.showPoints && p.nPoints > 0 && <option value="points">Puntos y ranking</option>}
              {p.showZones && p.zonesReady && <option value="zones">Resumen por zonas</option>}
            </select>
          </label>
        </div>
        <textarea className="gs-emb-code" readOnly rows={4} value={code} aria-label="Código para incrustar" onFocus={(e) => e.target.select()} />
        <div className="acts">
          <button type="button" className="btn sm primary" onClick={async () => { try { await navigator.clipboard.writeText(code); setMsg('Código copiado.'); } catch { setMsg('Selecciona el código y cópialo manualmente.'); } }}>Copiar código</button>
          <button type="button" className="btn sm" onClick={() => setEmbPreview((v) => !v)} aria-expanded={embPreview}>{embPreview ? 'Ocultar vista previa' : 'Ver vista previa'}</button>
        </div>
        {embPreview && (
          <div className="gs-emb-prev">
            <iframe src={embUrl} title="Vista previa del mapa incrustado" loading="lazy"
              style={{ border: 0, width: embFull ? '100%' : `${clampSize(embW, EMBED_SIZE.minW, EMBED_SIZE.maxW, EMBED_SIZE.defW)}px`, maxWidth: '100%', height: `${clampSize(embH, EMBED_SIZE.minH, EMBED_SIZE.maxH, EMBED_SIZE.defH)}px` }} />
          </div>
        )}
        <p className="gs-hint-s">
          <b>Seguridad:</b> solo esta dirección (<code>/p/…/embed</code>) puede mostrarse dentro de otros sitios; el resto de la plataforma (tu cuenta, el panel, los enlaces de expertos) bloquea ser enmarcado. Quien incruste el mapa ve exactamente lo que ve quien abre el enlace: lo de «Qué ve quien abra el enlace». Para dejar de mostrarlo, vuelve el proyecto privado o genera un enlace nuevo.
        </p>
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
