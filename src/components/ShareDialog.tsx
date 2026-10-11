'use client';

/** «Compartir» universal de un proyecto: `PublicLinkBlock` (enlace + Copiar, QR, «Ver como lo ve el público»,
 * «Compartir…» del sistema y código para incrustar) y `ShareButton`, la ventana que lo trae al encabezado y a la
 * parte alta de Resultados/Comparativa. En un mapa de aptitud NO publica nada aquí: la publicación (mapa, puntos,
 * firma) vive en la pestaña Compartir (GeoSharePanel); la ventana solo muestra el estado y lleva a esa pestaña. */
import { useEffect, useId, useState } from 'react';
import QRCode from 'qrcode';
import QrModal from './QrModal';
import SharePopover from './SharePopover';
import { embedCode, shareBlurb, shareStateText } from '@/lib/shareUi';
import './share.css';

/** Copia al portapapeles y devuelve el mensaje que se anuncia (aria-live). */
async function copyText(t: string, ok: string): Promise<string> {
  try { await navigator.clipboard.writeText(t); return ok; } catch { return 'No se pudo copiar: selecciona el texto y cópialo a mano.'; }
}

export function PublicLinkBlock({ url, title, fileBase, qrSubheading, canShare = true }: {
  url: string; title: string; fileBase: string; qrSubheading: string; canShare?: boolean;
}) {
  const [msg, setMsg] = useState('');
  const [qrImg, setQrImg] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [nativeShare, setNativeShare] = useState(false);
  useEffect(() => { setNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function'); }, []);
  useEffect(() => {
    if (!url) { setQrImg(''); return; }
    let alive = true;
    QRCode.toDataURL(url, { width: 224, margin: 1, color: { dark: '#0F172A', light: '#FFFFFF' } })
      .then((d) => { if (alive) setQrImg(d); }).catch(() => { if (alive) setQrImg(''); });
    return () => { alive = false; };
  }, [url]);

  async function share() {
    try { await navigator.share({ title, url }); setMsg('Listo: enlace compartido.'); }
    catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // la persona cerró el menú
      setMsg(await copyText(url, 'Enlace copiado.'));
    }
  }

  return (
    <>
      <div className="sh-link">
        <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
          <div className="linkbox">
            <input type="text" readOnly value={url} aria-label="Enlace público" onFocus={(e) => e.target.select()} />
            <button type="button" className="btn sm" onClick={async () => setMsg(await copyText(url, 'Enlace copiado.'))}>Copiar</button>
          </div>
          <div className="sh-acts">
            <a className="btn sm" href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>Ver como lo ve el público ↗</a>
            {canShare && nativeShare && <button type="button" className="btn sm" onClick={share}>Compartir…</button>}
          </div>
        </div>
        <div className="sh-qr">
          {qrImg
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={qrImg} alt="Código QR del enlace público" width={112} height={112} />
            : <div className="ph">Generando QR…</div>}
        </div>
      </div>
      <div className="sh-acts">
        <button type="button" className="btn sm" onClick={() => setQrOpen(true)}>Ver QR grande y descargar</button>
        <button type="button" className="btn sm" onClick={async () => setMsg(await copyText(embedCode(`${url}/embed`, title), 'Código para incrustar copiado.'))}>Copiar código para incrustar</button>
      </div>
      <p className="sh-msg" role="status" aria-live="polite">{msg}</p>
      {qrOpen && (
        <QrModal title="Enlace público" url={url} caption={title} fileBase={`${fileBase}_enlace_publico`}
          card={{ heading: title, subheading: qrSubheading }} onClose={() => setQrOpen(false)} />
      )}
    </>
  );
}

type Props = {
  kind: 'decision' | 'spatial';
  isPublic: boolean;
  token: string;
  title: string;
  fileBase: string;
  /** Solo proyectos de decisión: activar o apagar el enlace público. */
  onTogglePublic?: (on: boolean) => void;
  /** Lleva a la pestaña «Compartir» (opciones completas; en mapas, la publicación). */
  onGoShareTab: () => void;
  /** Texto del botón. */
  label?: string;
  align?: 'left' | 'right';
};

export default function ShareButton({ kind, isPublic, token, title, fileBase, onTogglePublic, onGoShareTab, label = 'Compartir', align = 'right' }: Props) {
  const uid = useId();
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/p/${token}`;
  const state = shareStateText(isPublic, kind);
  return (
    <SharePopover triggerClassName="sh-share" align={align} trigger={<><span aria-hidden="true">↗</span><span>{label}</span></>}>
      {(close) => (
        <>
          <div className="sh-head" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <h3 id={`${uid}-h`}>Compartir este proyecto</h3>
            <span className={'sh-state' + (isPublic ? ' on' : '')}><span className="dot" aria-hidden="true" />{state.label}</span>
          </div>
          <p className="sh-muted">{state.detail}</p>
          {kind === 'decision' && onTogglePublic && (
            <label className="sh-switch">
              <input type="checkbox" checked={isPublic} onChange={(e) => onTogglePublic(e.target.checked)} /> Hacer público con enlace
            </label>
          )}
          {isPublic
            ? <PublicLinkBlock url={url} title={title} fileBase={fileBase} qrSubheading={kind === 'spatial' ? 'Escanea para ver el mapa de aptitud' : 'Escanea para ver los resultados'} />
            : kind === 'spatial' && <p className="sh-muted">Para publicar el mapa, activa el enlace y pulsa «Publicar» en la pestaña Compartir.</p>}
          <p className="sh-muted">{shareBlurb(kind)}</p>
          <div className="sh-acts">
            <button type="button" className="btn sm" onClick={() => { close(); onGoShareTab(); }}>
              {kind === 'spatial' ? 'Ir a Compartir para publicar el mapa' : 'Más opciones en la pestaña Compartir'}
            </button>
          </div>
        </>
      )}
    </SharePopover>
  );
}
