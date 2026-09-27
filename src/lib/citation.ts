import { APP_VERSION, APP_DOI, APP_DOI_URL, APP_AUTHOR, APP_ORCID } from './version';

export type CitationFormat = 'apa' | 'ieee' | 'bibtex' | 'ris' | 'chicago';

export interface CitationItem {
  id: CitationFormat;
  label: string;
  badge: string;
  filename?: string;
  mimeType?: string;
  description: string;
  text: string;
}

export const CITATION_DATA: Record<CitationFormat, CitationItem> = {
  apa: {
    id: 'apa',
    label: 'APA (7.ª ed.)',
    badge: 'Formato estándar',
    description: 'Recomendado para tesis de maestría, posgrados de ingeniería y revistas de ciencias aplicadas y sociales en Iberoamérica.',
    text: `Polo-Castañeda, M. A. (2026). mcda-tools: Open-source web platform for multi-criteria decision analysis (AHP, TOPSIS, VIKOR, ELECTRE, PROMETHEE, SAW, Fuzzy TOPSIS) and GIS-MCDA (Version ${APP_VERSION}) [Software de computación]. Zenodo. https://doi.org/${APP_DOI}`,
  },
  ieee: {
    id: 'ieee',
    label: 'IEEE',
    badge: 'Ingeniería y Sistemas',
    description: 'Estándar para artículos técnicos en computación, electrónica, telecomunicaciones y conferencias IEEE.',
    text: `M. A. Polo-Castañeda, "mcda-tools: Open-source web platform for multi-criteria decision analysis (AHP, TOPSIS, VIKOR, ELECTRE, PROMETHEE, SAW, Fuzzy TOPSIS) and GIS-MCDA," ver. ${APP_VERSION}, Zenodo, Sep. 2026. doi: ${APP_DOI}. [En línea]. Disponible: https://mcda.tools`,
  },
  bibtex: {
    id: 'bibtex',
    label: 'BibTeX',
    badge: 'LaTeX / Overleaf',
    filename: `mcda-tools-${APP_VERSION}.bib`,
    mimeType: 'application/x-bibtex',
    description: 'Para incluir directamente en tu archivo .bib en documentos preparados con LaTeX, Overleaf o Typst.',
    text: `@software{polo_castaneda_2026_mcda_tools,
  author       = {Polo-Castañeda, Miguel Angel},
  title        = {{mcda-tools: Open-source web platform for multi-criteria decision analysis (AHP, TOPSIS, VIKOR, ELECTRE, PROMETHEE, SAW, Fuzzy TOPSIS) and GIS-MCDA}},
  year         = {2026},
  month        = sep,
  publisher    = {Zenodo},
  version      = {v${APP_VERSION}},
  doi          = {${APP_DOI}},
  url          = {${APP_DOI_URL}}
}`,
  },
  ris: {
    id: 'ris',
    label: 'RIS (Zotero / Mendeley)',
    badge: 'Gestores bibliográficos',
    filename: `mcda-tools-${APP_VERSION}.ris`,
    mimeType: 'application/x-research-info-systems',
    description: 'Formato estándar compatible con Zotero, Mendeley, EndNote y Citavi para importar la referencia con un solo clic.',
    text: `TY  - COMP
TI  - mcda-tools: Open-source web platform for multi-criteria decision analysis (AHP, TOPSIS, VIKOR, ELECTRE, PROMETHEE, SAW, Fuzzy TOPSIS) and GIS-MCDA
AU  - Polo-Castañeda, Miguel Angel
PY  - 2026
PB  - Zenodo
ET  - ${APP_VERSION}
DO  - ${APP_DOI}
UR  - https://mcda.tools
ER  - `,
  },
  chicago: {
    id: 'chicago',
    label: 'Chicago (Autor-Fecha)',
    badge: 'Humanidades y Multidisciplinar',
    description: 'Estilo Chicago 17.ª edición con sistema autor-fecha para monografías y libros universitarios.',
    text: `Polo-Castañeda, Miguel Angel. 2026. "mcda-tools: Open-source web platform for multi-criteria decision analysis (AHP, TOPSIS, VIKOR, ELECTRE, PROMETHEE, SAW, Fuzzy TOPSIS) and GIS-MCDA." Version ${APP_VERSION}. Zenodo. https://doi.org/${APP_DOI}.`,
  },
};

export const CITATION_FORMATS = Object.keys(CITATION_DATA) as CitationFormat[];

/** Texto de plantilla para la sección metodológica de una tesis o artículo científico */
export const METHODOLOGY_SNIPPET = `La priorización de criterios y la evaluación comparativa de las alternativas de decisión se realizaron mediante la plataforma de código abierto mcda-tools v${APP_VERSION} (Polo-Castañeda, 2026), calculando la consistencia lógica (CR < 0.10) y la agregación de juicios mediante la media geométrica de Saaty (1980), junto con el método de ordenamiento [TOPSIS / VIKOR / ELECTRE / PROMETHEE]. Los cálculos y matrices de respaldo son verificables y reproducibles a través del registro persistente DOI: https://doi.org/${APP_DOI}.`;
