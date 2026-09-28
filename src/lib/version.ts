/**
 * Configuración de versión y metadatos de la plataforma.
 * Fuente única de verdad para la versión semántica y citación académica de la aplicación.
 */
export const APP_VERSION = '0.1.3';
export const APP_NAME = 'Plataforma MCDA';
export const APP_FULL_NAME = 'MCDA Tools';
export const APP_RELEASE_TAG = `v${APP_VERSION}`;
export const APP_RELEASE_URL = `https://github.com/miguepoloc/mcda-tools/releases/tag/${APP_RELEASE_TAG}`;
export const APP_REPO_URL = 'https://github.com/miguepoloc/mcda-tools';
export const APP_DOI = '10.5281/zenodo.23024510';
export const APP_DOI_URL = `https://doi.org/${APP_DOI}`;
/** Concept DOI: always resolves to the latest version's record on Zenodo. Use this one when citing "the software" in general rather than this exact version. */
export const APP_CONCEPT_DOI = '10.5281/zenodo.23002790';
export const APP_CONCEPT_DOI_URL = `https://doi.org/${APP_CONCEPT_DOI}`;
export const APP_AUTHOR = 'Miguel Angel Polo Castañeda';
export const APP_ORCID = '0000-0002-7461-2558';

export interface Researcher {
  name: string;
  givenNames: string;
  familyNames: string;
  affiliation: string;
  orcid: string;
  orcidUrl: string;
}

export const APP_RESEARCHERS: Researcher[] = [
  {
    name: 'Miguel Angel Polo Castañeda',
    givenNames: 'Miguel Angel',
    familyNames: 'Polo-Castañeda',
    affiliation: 'Universidad del Magdalena',
    orcid: '0000-0002-7461-2558',
    orcidUrl: 'https://orcid.org/0000-0002-7461-2558',
  },
  {
    name: 'Harold David Hernandez Solorzano',
    givenNames: 'Harold David',
    familyNames: 'Hernandez-Solorzano',
    affiliation: 'Universidad del Magdalena',
    orcid: '0009-0003-4837-3797',
    orcidUrl: 'https://orcid.org/0009-0003-4837-3797',
  },
  {
    name: 'Alexander Esteban Espinosa Valdez',
    givenNames: 'Alexander Esteban',
    familyNames: 'Espinosa-Valdez',
    affiliation: 'Universidad del Magdalena',
    orcid: '0000-0001-6281-8156',
    orcidUrl: 'https://orcid.org/0000-0001-6281-8156',
  },
  {
    name: 'Jorge Gómez Rojas',
    givenNames: 'Jorge',
    familyNames: 'Gómez-Rojas',
    affiliation: 'Universidad del Magdalena',
    orcid: '0000-0002-0840-8743',
    orcidUrl: 'https://orcid.org/0000-0002-0840-8743',
  },
];

export const APP_AUTHORS_APA = 'Polo-Castañeda, M. A., Hernandez-Solorzano, H. D., Espinosa-Valdez, A. E., & Gómez-Rojas, J.';
export const APP_AUTHORS_IEEE = 'M. A. Polo-Castañeda, H. D. Hernandez-Solorzano, A. E. Espinosa-Valdez, and J. Gómez-Rojas';
export const APP_AUTHORS_DISPLAY = 'Miguel Angel Polo Castañeda, Harold David Hernandez Solorzano, Alexander Esteban Espinosa Valdez, Jorge Gómez Rojas';
export const APP_IN_TEXT_CITATION = 'Polo-Castañeda et al., 2026';
