'use client';

import { useState } from 'react';
import {
  CITATION_DATA,
  CITATION_FORMATS,
  METHODOLOGY_SNIPPET,
  type CitationFormat,
} from '@/lib/citation';
import { APP_VERSION, APP_DOI, APP_DOI_URL, APP_AUTHOR, APP_ORCID, APP_RESEARCHERS } from '@/lib/version';

export default function CitationBox() {
  const [selectedFormat, setSelectedFormat] = useState<CitationFormat>('apa');
  const [copied, setCopied] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [showSnippet, setShowSnippet] = useState(false);

  const current = CITATION_DATA[selectedFormat];

  const handleCopy = async (text: string, isSnippet = false) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      if (isSnippet) {
        setCopiedSnippet(true);
        setTimeout(() => setCopiedSnippet(false), 2500);
      } else {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // fallback gracioso
    }
  };

  const handleDownload = (filename: string, text: string, mime: string) => {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="cite-card" id="citation-box">
      <div className="cite-top">
        <div className="cite-author-row">
          <div className="cite-author-info">
            <span className="cite-tag">Software Científico y Académico</span>
            <h3 className="cite-title">mcda-tools <span className="cite-ver">v{APP_VERSION}</span></h3>
            <div className="cite-by-team">
              <span className="cite-by-label">Investigadores · Universidad del Magdalena:</span>
              <div className="cite-researchers-list">
                {APP_RESEARCHERS.map((r, idx) => (
                  <span key={r.name} className="cite-researcher-item">
                    <strong>{r.name}</strong>
                    {r.orcidUrl && (
                      <a
                        href={r.orcidUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cite-orcid-link"
                        title={`Perfil ORCID de ${r.name}`}
                        aria-label={`ORCID de ${r.name}`}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="#A6CE39" aria-hidden="true">
                          <path d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zM7.369 4.378c.525 0 .947.431.947.947s-.422.947-.947.947a.95.95 0 0 1-.947-.947c0-.525.422-.947.947-.947zm-.722 3.038h1.444v10.041H6.647V7.416zm3.562 0h3.9c3.712 0 5.344 2.653 5.344 5.025 0 2.578-2.016 5.016-5.325 5.016h-3.919V7.416zm1.444 1.306v7.444h2.244c2.531 0 3.716-1.528 3.716-3.722 0-2.016-1.122-3.722-3.691-3.722h-2.269z"/>
                        </svg>
                        <span>ORCID</span>
                      </a>
                    )}
                    {idx < APP_RESEARCHERS.length - 1 && <span className="cite-researcher-sep">·</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="cite-doi-badge-wrap">
            <a
              href={APP_DOI_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="cite-doi-pill"
              title="Ver registro del software en Zenodo (CERN)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
              <span>DOI: {APP_DOI}</span>
            </a>
          </div>
        </div>

        {/* Barra de pestañas de formato */}
        <div className="cite-tabs-wrap" role="tablist" aria-label="Formatos de citación bibliográfica">
          {CITATION_FORMATS.map((fmtKey) => {
            const item = CITATION_DATA[fmtKey];
            const isSelected = selectedFormat === fmtKey;
            return (
              <button
                key={fmtKey}
                type="button"
                role="tab"
                id={`tab-${fmtKey}`}
                aria-selected={isSelected}
                aria-controls={`panel-${fmtKey}`}
                tabIndex={isSelected ? 0 : -1}
                className={`cite-tab-btn ${isSelected ? 'active' : ''}`}
                onClick={() => {
                  setSelectedFormat(fmtKey);
                  setCopied(false);
                }}
              >
                <span className="cite-tab-name">{item.label}</span>
                <span className="cite-tab-badge">{item.badge}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Contenedor del código / texto formateado */}
      <div
        id={`panel-${current.id}`}
        role="tabpanel"
        aria-labelledby={`tab-${current.id}`}
        className="cite-body"
      >
        <div className="cite-meta-desc">
          <p>{current.description}</p>
        </div>

        <div className="cite-snippet-container">
          <pre className="cite-pre" tabIndex={0} aria-label={`Texto de citación en formato ${current.label}`}>
            <code>{current.text}</code>
          </pre>

          <div className="cite-actions-row">
            <button
              type="button"
              className={`btn sm ${copied ? 'cite-copied-btn' : 'primary'}`}
              onClick={() => handleCopy(current.text, false)}
              aria-live="polite"
              title="Copiar texto de citación al portapapeles"
            >
              {copied ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>¡Copiado!</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copiar cita</span>
                </>
              )}
            </button>

            {current.filename && current.mimeType && (
              <button
                type="button"
                className="btn sm"
                onClick={() => handleDownload(current.filename!, current.text, current.mimeType!)}
                title={`Descargar archivo ${current.filename}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Descargar {current.filename.split('.').pop()?.toUpperCase()}</span>
              </button>
            )}

            <button
              type="button"
              className="btn sm"
              style={{ marginLeft: 'auto' }}
              onClick={() => setShowSnippet(!showSnippet)}
              aria-expanded={showSnippet}
              title="Ver texto modelo para redactar la sección de metodología en un paper o tesis"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <span>{showSnippet ? 'Ocultar redacción metodológica' : 'Ver ejemplo para tesis/paper'}</span>
            </button>
          </div>
        </div>

        {/* Bloque desplegable de ejemplo de redacción para la sección Metodología */}
        {showSnippet && (
          <div className="cite-methodology-card" role="region" aria-label="Ejemplo de redacción metodológica">
            <div className="cite-methodology-head">
              <span className="cite-methodology-badge">Plantilla sugerida para la sección "Metodología" o "Materiales y Métodos"</span>
              <button
                type="button"
                className={`btn sm ${copiedSnippet ? 'cite-copied-btn' : ''}`}
                onClick={() => handleCopy(METHODOLOGY_SNIPPET, true)}
                title="Copiar texto de metodología"
              >
                {copiedSnippet ? '¡Párrafo copiado!' : 'Copiar párrafo'}
              </button>
            </div>
            <p className="cite-methodology-text">{METHODOLOGY_SNIPPET}</p>
            <p className="cite-methodology-tip">
              <strong>Tip de rigor académico:</strong> En una tesis o artículo, se recomienda citar tanto la herramienta computacional (<code className="mono">mcda-tools</code>, con su DOI) para garantizar la reproducibilidad del cálculo, como los autores fundacionales del método utilizado (por ejemplo, Saaty para AHP, Hwang & Yoon para TOPSIS, Opricovic para VIKOR).
            </p>
          </div>
        )}

        <div className="cite-footer-details">
          <div className="cite-zenodo-links">
            <span>Enlaces de citación persistente:</span>
            <a href={APP_DOI_URL} target="_blank" rel="noopener noreferrer">
              Registro Zenodo (v{APP_VERSION})
            </a>
            <span aria-hidden="true">·</span>
            <a href="https://doi.org/10.5281/zenodo.23002790" target="_blank" rel="noopener noreferrer">
              Concept DOI (Todas las versiones)
            </a>
            <span aria-hidden="true">·</span>
            <a href={`https://orcid.org/${APP_ORCID}`} target="_blank" rel="noopener noreferrer">
              ORCID: {APP_ORCID}
            </a>
            <span aria-hidden="true">·</span>
            <a href="https://github.com/miguepoloc/mcda-tools/blob/main/CITATION.cff" target="_blank" rel="noopener noreferrer">
              CITATION.cff en GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
