import Link from 'next/link';
import CitationBox from './CitationBox';
import { APP_VERSION, APP_DOI } from '@/lib/version';

interface CitationSectionProps {
  showFullIntro?: boolean;
}

export default function CitationSection({ showFullIntro = true }: CitationSectionProps) {
  return (
    <section className="lsection cite-section-wrap" id="citar" aria-labelledby="cite-section-heading">
      <div className="wrap">
        <div className="lhead">
          <div className="eyebrow">Referencia Científica y Rigor Metodológico</div>
          <h2 id="cite-section-heading">Cómo citar esta plataforma</h2>
          {showFullIntro ? (
            <p>
              Si utilizas <strong>MCDA Tools</strong> en asignaturas de posgrado, tesis de maestría o doctorado, o artículos de investigación científica, cita este software para garantizar la <strong>reproducibilidad computacional</strong> de tus decisiones multicriterio.
            </p>
          ) : (
            <p>
              Formatos normalizados de referencia bibliográfica listos para copiar o exportar a tu gestor preferido (Zotero, Mendeley, Overleaf/LaTeX o Word).
            </p>
          )}
        </div>

        {/* Componente interactivo de cajas de citas */}
        <CitationBox />

        {/* 3 Pilares de citación científica */}
        <div className="cite-principles-grid">
          <div className="cite-principle-card">
            <div className="cite-principle-num">1</div>
            <h4>Reproducibilidad</h4>
            <p>
              Mencionar la versión exacta (<code className="mono">v{APP_VERSION}</code>) y el DOI persistente permite que pares evaluadores, jurados o lectores recalculen y verifiquen tus matrices con los mismos parámetros numéricos.
            </p>
          </div>

          <div className="cite-principle-card">
            <div className="cite-principle-num">2</div>
            <h4>Doble Atribución</h4>
            <p>
              En la sección de metodología cita <strong>ambas fuentes</strong>: la literatura teórica fundacional del método elegido (ej. Saaty 1980 para AHP, Hwang & Yoon 1981 para TOPSIS) y la herramienta computacional <code className="mono">mcda-tools</code>.
            </p>
          </div>

          <div className="cite-principle-card">
            <div className="cite-principle-num">3</div>
            <h4>DOI de Versión vs. Concepto</h4>
            <p>
              El DOI <code className="mono">{APP_DOI}</code> identifica con precisión el código de la versión 0.1.0 en el archivo global de Zenodo (CERN), garantizando su preservación a largo plazo.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
