// Párrafo de metodología listo para pegar en un informe o artículo, en español e inglés, generado desde el estado del proyecto
// (método, ponderación, pesos con CR, parámetros). Nada es texto fijo con números: la versión y el DOI salen de version.ts.
// Lógica pura (sin React) para poder probarla con `npm test`.
//
// Las citas son solo las ya verificadas contra la bibliografía del curso (references.ts / ScientificMethodModal.tsx); SAW no lleva cita.
import type { Method, WeightingMethod } from './types.ts';
import { APP_DOI, APP_FULL_NAME, APP_VERSION } from './version.ts';

export type MethodologyLang = 'es' | 'en';

export type MethodologyInput = {
  method: Method;
  /** Ponderación efectiva de criterios (AHP si el método es AHP). */
  weighting: WeightingMethod;
  /** Cálculo de los pesos AHP: eigenvector de Saaty o promedio de columnas normalizadas. */
  weightMethod?: 'eigenvector' | 'mean';
  criteria: { name: string }[];
  /** Pesos finales, en el orden de `criteria`. */
  weights: number[];
  alternativeCount: number;
  /** Expertos cuyos juicios entraron al agregado (0 con CRITIC/Entropía). */
  expertCount?: number;
  /** Razón de consistencia de la matriz de criterios (solo con pesos AHP). */
  criteriaCr?: number;
  /** Mayor CR entre las matrices de alternativas (solo AHP como método de ranking). */
  altMaxCr?: number;
  vikorV?: number;
  /** Solo PROMETHEE: función de preferencia elegida por criterio (texto ya formado) y si alguna se apartó de la del curso. */
  prometheeFns?: { name: string; text: string }[];
  prometheeCustom?: boolean;
  cStar?: number;
  dStar?: number;
};

const f = (x: number, d = 3) => x.toFixed(d);
const CR_LIMIT = 0.1;

function weightsList(i: MethodologyInput): string {
  return i.criteria.map((c, k) => `${c.name} (${f(i.weights[k] ?? 0)})`).join('; ');
}

function methodSentence(i: MethodologyInput, lang: MethodologyLang): string {
  const es = lang === 'es';
  const nAlt = i.alternativeCount, nCri = i.criteria.length;
  switch (i.method) {
    case 'ahp':
      return es
        ? `Se aplicó el Proceso Analítico Jerárquico (AHP; Saaty, 1980): los expertos compararon por pares los ${nCri} criterios y las ${nAlt} alternativas en la escala de Saaty, los juicios individuales se agregaron con la media geométrica y la prioridad global de cada alternativa resultó de sintetizar el peso de cada criterio por su prioridad local.`
        : `The Analytic Hierarchy Process (AHP; Saaty, 1980) was applied: experts compared the ${nCri} criteria and the ${nAlt} alternatives pairwise on Saaty's scale, individual judgments were aggregated with the geometric mean, and each alternative's global priority was obtained by synthesizing criterion weights with local priorities.`;
    case 'topsis':
      return es
        ? `Las ${nAlt} alternativas se ordenaron con TOPSIS (Hwang y Yoon, 1981): normalización vectorial de la matriz de decisión, ponderación, y cercanía relativa a la solución ideal medida con distancia euclidiana.`
        : `The ${nAlt} alternatives were ranked with TOPSIS (Hwang & Yoon, 1981): vector normalization of the decision matrix, weighting, and relative closeness to the ideal solution using Euclidean distance.`;
    case 'vikor':
      return es
        ? `Las ${nAlt} alternativas se ordenaron con VIKOR (Opricovic y Tzeng, 2004) con v = ${f(i.vikorV ?? 0.5, 2)} (peso de la estrategia de utilidad de grupo, definido por el decisor), y se verificaron las dos condiciones de ventaja aceptable y estabilidad para declarar una solución de compromiso.`
        : `The ${nAlt} alternatives were ranked with VIKOR (Opricovic & Tzeng, 2004) with v = ${f(i.vikorV ?? 0.5, 2)} (weight of the group-utility strategy, set by the decision maker), and the two conditions of acceptable advantage and stability were checked before declaring a compromise solution.`;
    case 'promethee': {
      if (i.prometheeCustom && i.prometheeFns?.length) {
        const list = i.prometheeFns.map((x) => `${x.name}: ${x.text}`).join('; ');
        return es
          ? `Las ${nAlt} alternativas se ordenaron con PROMETHEE II (Brans y Vincke, 1985) mediante el flujo neto de preferencia, y se examinó el orden parcial de PROMETHEE I con los flujos de salida y de entrada. La función de preferencia y sus umbrales (definidos por el decisor, en la unidad de cada criterio) fueron: ${list}.`
          : `The ${nAlt} alternatives were ranked with PROMETHEE II (Brans & Vincke, 1985) using the net preference flow, and the partial order of PROMETHEE I was examined from the outgoing and incoming flows. The preference function and thresholds (set by the decision maker, in each criterion's unit) were: ${list}.`;
      }
      return es
        ? `Las ${nAlt} alternativas se ordenaron con PROMETHEE II (Brans y Vincke, 1985) mediante el flujo neto de preferencia, con función de preferencia lineal (Tipo III; q = 0, p = rango de cada criterio).`
        : `The ${nAlt} alternatives were ranked with PROMETHEE II (Brans & Vincke, 1985) using the net preference flow, with a linear preference function (Type III; q = 0, p = range of each criterion).`;
    }
    case 'electre':
      return es
        ? `Las ${nAlt} alternativas se compararon con ELECTRE (Roy, 1968) con umbral de concordancia c* = ${f(i.cStar ?? 0.65, 2)} y umbral de discordancia d* = ${f(i.dStar ?? 0.3, 2)}; el resultado es una relación de superación con posibles incomparabilidades y su núcleo, no un ranking total.`
        : `The ${nAlt} alternatives were compared with ELECTRE (Roy, 1968) using a concordance threshold c* = ${f(i.cStar ?? 0.65, 2)} and a discordance threshold d* = ${f(i.dStar ?? 0.3, 2)}; the result is an outranking relation with possible incomparabilities and its kernel, not a complete ranking.`;
    case 'saw':
      return es
        ? `Las ${nAlt} alternativas se ordenaron con la suma ponderada simple (SAW) tras una normalización mín–máx de la matriz de decisión.`
        : `The ${nAlt} alternatives were ranked with Simple Additive Weighting (SAW) after min–max normalization of the decision matrix.`;
    case 'fuzzy_topsis':
      return es
        ? `Las ${nAlt} alternativas se ordenaron con TOPSIS difuso (Chen, 2000): las evaluaciones lingüísticas se convirtieron en números triangulares difusos y se calculó el coeficiente de cercanía a partir de la distancia entre vértices.`
        : `The ${nAlt} alternatives were ranked with Fuzzy TOPSIS (Chen, 2000): linguistic ratings were converted to triangular fuzzy numbers and the closeness coefficient was computed from the vertex distance.`;
  }
}

function weightingSentence(i: MethodologyInput, lang: MethodologyLang): string {
  const es = lang === 'es';
  const list = weightsList(i);
  if (i.weighting === 'critic') {
    return es
      ? `Los pesos de los ${i.criteria.length} criterios se derivaron objetivamente de la matriz de decisión con CRITIC (Diakoulaki et al., 1995): ${list}.`
      : `The weights of the ${i.criteria.length} criteria were derived objectively from the decision matrix with CRITIC (Diakoulaki et al., 1995): ${list}.`;
  }
  if (i.weighting === 'entropy') {
    return es
      ? `Los pesos de los ${i.criteria.length} criterios se derivaron objetivamente de la matriz de decisión con el método de entropía de Shannon (1948): ${list}.`
      : `The weights of the ${i.criteria.length} criteria were derived objectively from the decision matrix with Shannon's (1948) entropy method: ${list}.`;
  }
  const how = i.weightMethod === 'mean'
    ? (es ? 'el promedio de columnas normalizadas' : 'the normalized column average')
    : (es ? 'el eigenvector principal de Saaty' : "Saaty's principal eigenvector");
  const nExp = i.expertCount ?? 0;
  const experts = es ? `${nExp} experto${nExp === 1 ? '' : 's'}` : `${nExp} expert${nExp === 1 ? '' : 's'}`;
  let s = es
    ? `Los pesos de los ${i.criteria.length} criterios provienen de la comparación por pares de ${experts} (media geométrica entre expertos; pesos por ${how}): ${list}.`
    : `Criterion weights come from the pairwise comparisons of ${experts} (geometric mean across experts; weights by ${how}): ${list}.`;
  if (i.criteriaCr != null) {
    const ok = i.criteriaCr < CR_LIMIT;
    s += es
      ? ` La razón de consistencia de la matriz de criterios fue CR = ${f(i.criteriaCr, 4)} (${ok ? 'aceptable, < 0.10' : 'NO cumple el umbral de 0.10'}).`
      : ` The consistency ratio of the criteria matrix was CR = ${f(i.criteriaCr, 4)} (${ok ? 'acceptable, < 0.10' : 'does NOT meet the 0.10 threshold'}).`;
  }
  if (i.altMaxCr != null) {
    const ok = i.altMaxCr < CR_LIMIT;
    s += es
      ? ` El mayor CR entre las matrices de alternativas fue ${f(i.altMaxCr, 4)} (${ok ? 'aceptable' : 'no cumple el umbral de 0.10'}).`
      : ` The largest CR among the alternative matrices was ${f(i.altMaxCr, 4)} (${ok ? 'acceptable' : 'does not meet the 0.10 threshold'}).`;
  }
  return s;
}

/** Párrafo de metodología (un solo bloque de texto) para pegar en un informe. */
export function buildMethodologyParagraph(i: MethodologyInput, lang: MethodologyLang = 'es'): string {
  const es = lang === 'es';
  const software = es
    ? `El análisis se realizó con ${APP_FULL_NAME} (versión ${APP_VERSION}; https://doi.org/${APP_DOI}).`
    : `The analysis was carried out with ${APP_FULL_NAME} (version ${APP_VERSION}; https://doi.org/${APP_DOI}).`;
  return [software, weightingSentence(i, lang), methodSentence(i, lang)].join(' ');
}

// ------------------------------------------------------------------ proyectos de mapa (Geovisor AHP + SIG)
export type GeoMethodologyInput = {
  criteria: { name: string; weight: number }[];
  /** Expertos con juicios (0 = pesos iguales). */
  expertCount: number;
  weightMethod?: 'eigenvector' | 'mean';
  /** CR de la matriz de criterios (solo con expertos). */
  cr?: number;
  /** Los pesos se exploraron a mano: no son los del panel. */
  exploring?: boolean;
  direction: 'suitability' | 'risk';
  nClasses: number;
  /** Resolución de la grilla en metros y su CRS. */
  resM?: number;
  crs?: string;
  hasExclusion?: boolean;
  hasVeto?: boolean;
};

/** Párrafo de metodología de un mapa AHP + SIG (suma ponderada con vetos y exclusión, clasificada en N clases), es / en.
 * Los números salen del estado del proyecto; la versión y el DOI, de version.ts. */
export function buildGeoMethodologyParagraph(i: GeoMethodologyInput, lang: MethodologyLang = 'es'): string {
  const es = lang === 'es';
  const risk = i.direction === 'risk';
  const list = i.criteria.map((c) => `${c.name} (${f(c.weight)})`).join('; ');
  const software = es
    ? `El mapa se elaboró con ${APP_FULL_NAME} (versión ${APP_VERSION}; https://doi.org/${APP_DOI}).`
    : `The map was produced with ${APP_FULL_NAME} (version ${APP_VERSION}; https://doi.org/${APP_DOI}).`;
  const how = i.weightMethod === 'mean'
    ? (es ? 'el promedio de columnas normalizadas' : 'the normalized column average')
    : (es ? 'el eigenvector principal de Saaty' : "Saaty's principal eigenvector");
  let weights: string;
  if (i.exploring) {
    weights = es
      ? `Los pesos de los ${i.criteria.length} criterios se fijaron manualmente para explorar escenarios (no corresponden al panel de expertos): ${list}.`
      : `The weights of the ${i.criteria.length} criteria were set manually to explore scenarios (they are not the expert panel's): ${list}.`;
  } else if (i.expertCount > 0) {
    const ex = es ? `${i.expertCount} experto${i.expertCount === 1 ? '' : 's'}` : `${i.expertCount} expert${i.expertCount === 1 ? '' : 's'}`;
    weights = es
      ? `Los pesos de los ${i.criteria.length} criterios provienen de la comparación por pares de ${ex} en el Proceso Analítico Jerárquico (AHP; Saaty, 1980), con media geométrica entre expertos y pesos por ${how}: ${list}.`
      : `The weights of the ${i.criteria.length} criteria come from the pairwise comparisons of ${ex} in the Analytic Hierarchy Process (AHP; Saaty, 1980), with the geometric mean across experts and weights by ${how}: ${list}.`;
    if (i.cr != null) {
      const ok = i.cr < CR_LIMIT;
      weights += es
        ? ` La razón de consistencia fue CR = ${f(i.cr, 4)} (${ok ? 'aceptable, < 0.10' : 'NO cumple el umbral de 0.10'}).`
        : ` The consistency ratio was CR = ${f(i.cr, 4)} (${ok ? 'acceptable, < 0.10' : 'does NOT meet the 0.10 threshold'}).`;
    }
  } else {
    weights = es
      ? `No hay juicios de expertos: los ${i.criteria.length} criterios llevan pesos iguales (${list}).`
      : `There are no expert judgments: the ${i.criteria.length} criteria carry equal weights (${list}).`;
  }
  const cell = i.resM ? (es ? ` de ${i.resM} m` : ` of ${i.resM} m`) : '';
  const crs = i.crs ? (es ? ` en ${i.crs}` : ` in ${i.crs}`) : '';
  const veto = i.hasVeto
    ? (es
      ? (risk ? ' Un veto fuerza el índice de la celda al máximo y la rotula «condición crítica».' : ' Un veto fuerza el índice de la celda a 0.')
      : (risk ? " A veto forces the cell's index to the maximum and labels it 'critical condition'." : " A veto forces the cell's index to 0."))
    : '';
  const excl = i.hasExclusion ? (es ? ' Las áreas de exclusión quedan fuera del cálculo.' : ' Exclusion areas are left out of the calculation.') : '';
  const calc = es
    ? `Cada capa se transformó en ${risk ? 'un riesgo' : 'una idoneidad'} parcial de 0 a 1 con la regla de su criterio, y el índice de ${risk ? 'riesgo' : 'idoneidad'} de 0 a 100 de cada celda${cell}${crs} es la suma ponderada de esos parciales; si a una celda le falta un criterio, los pesos se reescalan entre los que sí tienen dato.${veto}${excl}`
    : `Each layer was transformed into a partial ${risk ? 'risk' : 'suitability'} score from 0 to 1 using its criterion's rule, and each cell's 0 to 100 ${risk ? 'risk' : 'suitability'} index${cell}${crs} is the weighted sum of those partial scores; when a criterion is missing in a cell, the weights are rescaled among those with data.${veto}${excl}`;
  const classes = es
    ? `El índice se clasificó en ${i.nClasses} clases ordenadas (un valor alto significa ${risk ? 'más riesgo, es decir peor' : 'más aptitud, es decir mejor'}). El índice no es una probabilidad.`
    : `The index was classified into ${i.nClasses} ordered classes (a high value means ${risk ? 'more risk, i.e. worse' : 'more suitability, i.e. better'}). The index is not a probability.`;
  return [software, weights, calc, classes].join(' ');
}
