'use client';

import { useEffect, useId, useRef, useState } from 'react';
import QRCode from 'qrcode';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/** QR de un enlace (individual o abierto), en el mismo patrón de foco/Escape que ConfirmDialog. «Descargar
 * PNG» baja el QR pelado, o — si se da `card` — una tarjeta lista para imprimir (título + QR + enlace en
 * texto), pensada para pegar en un salón/taller presencial. */
export default function QrModal({
  title, url, caption, fileBase, card, onClose,
}: {
  title: string;
  url: string;
  caption?: string;
  fileBase: string;
  card?: { heading: string; subheading?: string };
  onClose: () => void;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { width: 512, margin: 1, color: { dark: '#0F172A', light: '#FFFFFF' } })
      .then((d) => { if (alive) setQrUrl(d); })
      .catch(() => { if (alive) setErr('No se pudo generar el código QR.'); });
    return () => { alive = false; };
  }, [url]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    box.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab' || !box.current) return;
      const f = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus?.();
    };
  }, [onClose]);

  async function download() {
    if (!qrUrl) return;
    setBusy(true);
    try {
      const out = card ? await composeCard(qrUrl, card.heading, card.subheading, url) : qrUrl;
      const a = document.createElement('a');
      a.href = out;
      a.download = `${fileBase}.png`;
      a.click();
    } catch {
      setErr('No se pudo generar la imagen para descargar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" ref={box} role="dialog" aria-modal="true" tabIndex={-1} aria-labelledby={`${id}-t`} style={{ maxWidth: 360, textAlign: 'center' }}>
        <h3 id={`${id}-t`}>{title}</h3>
        {caption && <p className="modal-desc" style={{ marginTop: -6 }}>{caption}</p>}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrUrl} alt={`Código QR: ${title}`} width={220} height={220} style={{ borderRadius: 8, border: '1px solid var(--line)' }} />
          ) : (
            <div className="muted" style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
              {err || 'Generando…'}
            </div>
          )}
        </div>
        <div className="linkbox"><input type="text" readOnly value={url} aria-label="Enlace" onFocus={(e) => e.target.select()} /></div>
        {err && qrUrl && <p className="err" role="alert" style={{ marginTop: 4, fontSize: 13 }}>{err}</p>}
        <div className="acts" style={{ justifyContent: 'center', marginTop: 8 }}>
          <button type="button" className="btn sm primary" onClick={download} disabled={!qrUrl || busy}>{busy ? 'Generando…' : 'Descargar PNG'}</button>
          <button type="button" className="btn sm" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

/** Tarjeta imprimible: fondo blanco, título/subtítulo del proyecto, QR grande centrado y el enlace en texto
 * por si el QR no escanea bien (impresión en blanco y negro, distancia, etc.). */
function composeCard(qrDataUrl: string, heading: string, subheading: string | undefined, url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const W = 900, H = 1200;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('sin canvas 2D')); return; }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0F172A';
      ctx.font = '700 44px system-ui, sans-serif';
      let y = wrapText(ctx, heading, W / 2, 110, W - 120, 54);
      if (subheading) {
        ctx.font = '400 28px system-ui, sans-serif';
        ctx.fillStyle = '#475569';
        y = wrapText(ctx, subheading, W / 2, y + 16, W - 160, 36);
      }
      const qrSize = 620;
      const qrTop = Math.max(y + 40, 280);
      ctx.drawImage(img, (W - qrSize) / 2, qrTop, qrSize, qrSize);
      ctx.font = '400 22px ui-monospace, monospace';
      ctx.fillStyle = '#334155';
      wrapText(ctx, url, W / 2, qrTop + qrSize + 60, W - 120, 30);
      ctx.font = '400 20px system-ui, sans-serif';
      ctx.fillStyle = '#94A3B8';
      ctx.fillText('Escanea para entrar · MCDA Tools', W / 2, H - 40);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('no se pudo cargar el QR'));
    img.src = qrDataUrl;
  });
}

/** Centrado y con salto de línea manual (canvas 2D no lo hace solo). Devuelve la posición Y tras la última línea. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(test).width > maxWidth) {
      ctx.fillText(line, x, cy);
      line = w;
      cy += lineHeight;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, cy);
  return cy;
}
