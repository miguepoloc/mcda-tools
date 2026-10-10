'use client';
// Informe ejecutivo (PDF) de un proyecto de mapa (R2). El contenido lo arma `buildGeoReport` (lógica pura, mismas cifras que
// la UI y el Excel); aquí solo se pinta, en tema claro, y se imprime con el diálogo del navegador («Guardar como PDF»),
// igual que el dictamen de los proyectos de decisión: comparte su contenedor y sus reglas de impresión (`@media print`).
import { useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { GeoReport, ReportTable } from '@/lib/geo/report';

type Props = {
  report: GeoReport;
  /** Imagen del mapa compuesto (data URL) o null mientras se genera / si falló. */
  mapUrl: string | null;
  mapBusy: boolean;
  mapWarnings: string[];
  onClose: () => void;
};

const MONO: CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' };
const cssString = (t: string) => t.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('<', '\\3C ').replaceAll(/[\r\n]+/g, ' ');

function Table({ t }: { t: ReportTable }) {
  const wide = t.head.length >= 9;
  const fs = wide ? 9.5 : t.head.length >= 6 ? 11 : 12;
  const num = new Set(t.numeric ?? []);
  return (
    <div className={t.rows.length <= 14 ? 'rpt-keep' : undefined} style={{ display: 'grid', gap: 6 }}>
      <table className="rpt-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: fs, tableLayout: wide ? 'auto' : undefined }}>
        {t.caption && <caption style={{ textAlign: 'left', fontWeight: 700, padding: '0 0 6px', color: '#0F172A', fontSize: 12.5 }}>{t.caption}</caption>}
        <thead>
          <tr style={{ background: '#F1F5F9' }}>
            {t.head.map((h, i) => (
              <th key={i} scope="col" style={{ textAlign: num.has(i) ? 'right' : 'left', padding: '6px 8px', borderBottom: '2px solid #0F172A', fontWeight: 700, color: '#0F172A', verticalAlign: 'bottom' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => {
                const common: CSSProperties = { textAlign: num.has(ci) ? 'right' : 'left', padding: '5px 8px', borderBottom: '1px solid #E2E8F0', color: '#0F172A', verticalAlign: 'top', overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' };
                return ci === 0 ? <th key={ci} scope="row" style={{ ...common, fontWeight: 600 }}>{c}</th> : <td key={ci} style={common}>{c}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {t.note && <p style={{ margin: 0, fontSize: 11.5, color: '#475569' }}>{t.note}</p>}
    </div>
  );
}

export default function GeoReportModal({ report, mapUrl, mapBusy, mapWarnings, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const f = panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); opener?.focus?.(); };
  }, []);

  const pageRule = `@page { @top-left { content: "${cssString(report.title.slice(0, 70))}"; } @bottom-left { content: "Informe ejecutivo del mapa · Universidad del Magdalena"; } }`;
  const btn: CSSProperties = { minHeight: 36, padding: '8px 16px', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer' };
  const h2: CSSProperties = { fontSize: 16, fontWeight: 800, margin: 0, color: '#0F172A', borderBottom: '1px solid #CBD5E1', paddingBottom: 4 };

  const node = (
    <div className="rpt-portal">
      <style dangerouslySetInnerHTML={{ __html: pageRule }} />
      <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(5,8,14,.85)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div id="executive-report-container" ref={panel} role="dialog" aria-modal="true" aria-labelledby="geo-report-title" tabIndex={-1}
          style={{ background: '#FFFFFF', color: '#0F172A', borderRadius: 12, maxWidth: 900, width: '100%', maxHeight: '94vh', overflowY: 'auto', padding: '32px 40px', display: 'grid', gap: 22, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', lineHeight: 1.5 }}>
          <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderBottom: '1px solid #E2E8F0', paddingBottom: 14 }}>
            <span style={{ fontSize: 13, color: '#475569' }}>Vista previa · se imprime en A4; en el diálogo elige «Guardar como PDF».</span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => window.print()} disabled={mapBusy} aria-busy={mapBusy}
                style={{ ...btn, background: '#0369A1', color: '#fff', border: 'none', opacity: mapBusy ? 0.6 : 1 }}>
                {mapBusy ? 'Componiendo el mapa…' : 'Imprimir / Guardar como PDF'}
              </button>
              <button type="button" onClick={onClose} style={{ ...btn, background: '#F1F5F9', border: '1px solid #CBD5E1', color: '#334155' }}>Cerrar</button>
            </div>
          </div>
          {mapWarnings.length > 0 && <div className="no-print" role="status" style={{ fontSize: 12.5, color: '#92400E' }}>{mapWarnings.join(' ')}</div>}

          <header style={{ borderBottom: '2px solid #0F172A', paddingBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: '#0369A1' }}>Universidad del Magdalena · Facultad de Ingeniería</div>
            <h1 id="geo-report-title" style={{ fontSize: 24, fontWeight: 800, margin: '4px 0 2px' }}>{report.title}</h1>
            <div style={{ fontSize: 14, color: '#475569' }}>{report.subtitle}</div>
            <dl style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 22px', margin: '10px 0 0', fontSize: 12.5, color: '#334155' }}>
              {report.meta.map(([k, v]) => (<div key={k}><dt style={{ display: 'inline', fontWeight: 700 }}>{k}: </dt><dd style={{ display: 'inline', margin: 0 }}>{v}</dd></div>))}
            </dl>
          </header>

          {report.banners.map((b, i) => (
            <div key={i} className="rpt-box" role="note" style={{ background: '#FEF3C7', border: '2px solid #B45309', borderRadius: 8, padding: '10px 16px', color: '#78350F', fontSize: 13 }}>{b.text}</div>
          ))}

          {report.sections.map((sec) => (
            <section key={sec.id} style={{ display: 'grid', gap: 10 }}>
              <h2 className="rpt-h" style={h2}>{sec.title}</h2>
              {sec.id === 'map' && (
                <figure className="rpt-fig" style={{ margin: 0 }}>
                  {mapUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={mapUrl} alt={`Mapa compuesto: ${report.title}`} style={{ width: '100%', height: 'auto', border: '1px solid #CBD5E1', borderRadius: 4, display: 'block' }} />
                    : <div style={{ border: '1px dashed #94A3B8', borderRadius: 4, padding: 24, textAlign: 'center', color: '#475569', fontSize: 13 }}>{mapBusy ? 'Componiendo el mapa…' : 'No se pudo componer el mapa.'}</div>}
                </figure>
              )}
              {sec.paragraphs.map((p, i) => (
                <p key={i} lang={sec.id === 'methodology' && i === 1 ? 'en' : undefined}
                  style={{ margin: 0, fontSize: sec.id === 'citation' ? 12 : 13, color: '#1E293B', ...(sec.id === 'citation' ? MONO : {}), overflowWrap: 'anywhere' }}>
                  {sec.id === 'methodology' && <b style={{ fontSize: 11, color: '#0369A1' }}>{i === 0 ? 'ES · ' : 'EN · '}</b>}{p}
                </p>
              ))}
              {sec.tables.map((t, i) => <Table key={i} t={t} />)}
            </section>
          ))}

          <footer className="rpt-foot" style={{ borderTop: '1px solid #CBD5E1', paddingTop: 10, fontSize: 11.5, color: '#475569' }}>
            Generado con {report.version.fullName} v{report.version.version} · DOI <a href={report.version.doiUrl}>{report.version.doi}</a> · {report.dateLong}. Los nombres de los expertos no se incluyen.
          </footer>
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? node : createPortal(node, document.body);
}
