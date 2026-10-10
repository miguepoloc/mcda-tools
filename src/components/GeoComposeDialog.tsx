'use client';
// «Componer mapa para entregar» (R1): arma una lámina (título, mapa, leyenda, escala, norte, fuente) a partir del estado del
// proyecto —NO de lo que se ve en pantalla— y la exporta a PNG de alta resolución o PDF. El dibujo lo hace `renderComposition`
// (que quien abre el diálogo envuelve con sus datos); aquí solo están los controles y la vista previa.
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COMPOSE_WIDTHS, planComposition, type ComposeAvailability, type ComposeOptions, type ComposeWidth } from '@/lib/geo/compose';
import './geo-compose.css';

type Props = {
  initial: ComposeOptions;
  avail: ComposeAvailability;
  basemaps: { key: string; label: string }[];
  zoneName?: string;
  onClose: () => void;
  /** Dibuja la lámina con las opciones dadas (devuelve el canvas y avisos). */
  render: (o: ComposeOptions) => Promise<{ canvas: HTMLCanvasElement; warnings: string[] }>;
  /** Guarda el archivo (PNG o PDF) con el canvas ya dibujado a la resolución elegida. */
  save: (canvas: HTMLCanvasElement, kind: 'png' | 'pdf', o: ComposeOptions) => Promise<void>;
};

const PREVIEW_W = 1000 as unknown as ComposeWidth;

export default function GeoComposeDialog({ initial, avail, basemaps, zoneName, onClose, render, save }: Props) {
  const [o, setO] = useState<ComposeOptions>(initial);
  const [preview, setPreview] = useState('');
  const [prevWarn, setPrevWarn] = useState<string[]>([]);
  const [busy, setBusy] = useState<'' | 'png' | 'pdf' | 'prev'>('prev');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const tid = useId();
  const renderRef = useRef(render);
  renderRef.current = render;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const set = <K extends keyof ComposeOptions>(k: K, v: ComposeOptions[K]) => setO((c) => ({ ...c, [k]: v }));

  // Foco al abrir y al cerrar; Esc cierra; Tab queda dentro del diálogo.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const f = panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href]');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); opener?.focus?.(); };
  }, []);

  // Vista previa (baja resolución) con espera para no recargar teselas en cada tecla.
  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current;
    setBusy((b) => (b === 'png' || b === 'pdf' ? b : 'prev'));
    const t = setTimeout(async () => {
      try {
        const r = await renderRef.current({ ...o, width: PREVIEW_W });
        if (seq.current !== my) return;
        setPreview(r.canvas.toDataURL('image/png')); setPrevWarn(r.warnings);
      } catch (e) {
        if (seq.current === my) { setPreview(''); setPrevWarn([e instanceof Error ? e.message : String(e)]); }
      } finally { if (seq.current === my) setBusy((b) => (b === 'prev' ? '' : b)); }
    }, 500);
    return () => clearTimeout(t);
  }, [o]);

  const plan = planComposition(o, avail);
  const run = async (kind: 'png' | 'pdf') => {
    setBusy(kind); setMsg(null);
    try {
      const r = await renderRef.current(plan.opts);
      await save(r.canvas, kind, plan.opts);
      setMsg({ ok: true, text: `${kind.toUpperCase()} listo (${r.canvas.width} × ${r.canvas.height} px), revisa tu carpeta de descargas.${r.warnings.length ? ' Avisos: ' + r.warnings.join(' ') : ''}` });
    } catch (e) { setMsg({ ok: false, text: `No se pudo generar el ${kind.toUpperCase()}: ${e instanceof Error ? e.message : String(e)}` }); }
    setBusy('');
  };

  const chk = (k: 'result' | 'zones' | 'points' | 'basemap' | 'legend' | 'rankingTable' | 'pointNames' | 'scaleBar' | 'northArrow', label: string, disabled = false) => (
    <label className="gv-cmp-chk">
      <input type="checkbox" checked={o[k]} disabled={disabled} onChange={(e) => set(k, e.target.checked)} /> {label}
    </label>
  );
  const working = busy === 'png' || busy === 'pdf';

  const node = (
    <div className="gv-cmp-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gv-cmp" ref={panel} role="dialog" aria-modal="true" aria-labelledby={`${tid}-t`} tabIndex={-1}>
        <div className="gv-cmp-form">
          <h2 id={`${tid}-t`}>Componer mapa para entregar</h2>
          <p className="gv-hint">La lámina se arma con el estado del proyecto, no con lo que ves ahora en pantalla.</p>
          <label>Título
            <input type="text" value={o.title} onChange={(e) => set('title', e.target.value)} maxLength={140} />
          </label>
          <label>Subtítulo (opcional)
            <input type="text" value={o.subtitle} onChange={(e) => set('subtitle', e.target.value)} maxLength={200} />
          </label>
          <fieldset>
            <legend>Capas</legend>
            {chk('result', 'Resultado', !avail.result)}
            <label>Estilo del resultado
              <select value={o.style} onChange={(e) => set('style', e.target.value as ComposeOptions['style'])} disabled={!o.result}>
                <option value="classes">Por clases (N clases)</option>
                <option value="continuous">Continuo (rampa 0–100)</option>
              </select>
            </label>
            {chk('zones', `Resumen por zonas (coroplético)${zoneName ? `: ${zoneName}` : ''}`, !avail.zones)}
            {avail.references.map((r) => (
              <label className="gv-cmp-chk" key={r.id}>
                <input type="checkbox" checked={o.referenceIds.includes(r.id)} onChange={(e) => set('referenceIds', e.target.checked ? [...o.referenceIds, r.id] : o.referenceIds.filter((x) => x !== r.id))} />
                Referencia: {r.name}
              </label>
            ))}
            {chk('points', `Puntos con puesto${avail.points ? ` (${avail.points})` : ''}`, avail.points === 0)}
            {chk('basemap', 'Mapa base')}
            <label>Cuál mapa base
              <select value={o.basemapKey} onChange={(e) => set('basemapKey', e.target.value)} disabled={!o.basemap}>
                {basemaps.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </label>
          </fieldset>
          <fieldset>
            <legend>Elementos</legend>
            {chk('legend', 'Leyenda')}
            {chk('rankingTable', `Tabla de ranking de puntos${avail.points ? ` (${avail.points})` : ''}`, avail.points === 0)}
            {chk('pointNames', 'Nombre junto a cada punto', avail.points === 0 || !o.points)}
            {chk('scaleBar', 'Escala gráfica')}
            {chk('northArrow', 'Flecha de norte')}
          </fieldset>
          <label>Resolución de salida
            <select value={o.width} onChange={(e) => set('width', Number(e.target.value) as ComposeWidth)}>
              {COMPOSE_WIDTHS.map((w) => <option key={w} value={w}>{w} px de ancho{w === 1600 ? ' (pantalla)' : w === 2400 ? ' (informe)' : ' (impresión)'}</option>)}
            </select>
          </label>
          <div className="gv-cmp-actions">
            <button type="button" className="btn sm primary" disabled={working} aria-busy={busy === 'png'} onClick={() => run('png')}>{busy === 'png' ? 'Generando…' : 'Descargar PNG'}</button>
            <button type="button" className="btn sm" disabled={working} aria-busy={busy === 'pdf'} onClick={() => run('pdf')}>{busy === 'pdf' ? 'Generando…' : 'Descargar PDF'}</button>
            <button type="button" className="btn sm" onClick={onClose}>Cerrar</button>
          </div>
          <p className={'gv-hint' + (msg && !msg.ok ? ' warn' : '')} role={msg && !msg.ok ? 'alert' : 'status'} aria-live="polite">{msg?.text ?? ''}</p>
        </div>
        <div className="gv-cmp-prev">
          <b style={{ fontSize: 13 }}>Vista previa</b>
          <div className="frame" aria-busy={busy === 'prev'}>
            {preview ? <img src={preview} alt={`Vista previa de la composición «${o.title}»`} /> : <span className="gv-hint">{busy === 'prev' ? 'Componiendo…' : 'Sin vista previa.'}</span>}
          </div>
          {[...plan.warnings, ...prevWarn].map((w, i) => <p className="gv-cmp-warn" key={i} role="status">{w}</p>)}
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? node : createPortal(node, document.body);
}
