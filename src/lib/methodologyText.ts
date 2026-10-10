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
    case 'promethee':
      return es
        ? `Las ${nAlt} alternativas se ordenaron con PROMETHEE II (Brans y Vincke, 1985) mediante el flujo neto de preferencia, con función de preferencia lineal (Tipo III; q = 0, p = rango de cada criterio).`
        : `The ${nAlt} alternatives were ranked with PROMETHEE II (Brans & Vincke, 1985) using the net preference flow, with a linear preference function (Type III; q = 0, p = range of each criterion).`;
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
