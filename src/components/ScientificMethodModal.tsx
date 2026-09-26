'use client';

import { useState, useEffect, useRef } from 'react';
import { METHOD_EXTRA_REFS, REFS, WEIGHTING_REFS, apa, formatCitation, type Ref } from '@/lib/references';

export type MethodKey = 'ahp' | 'topsis' | 'vikor' | 'promethee' | 'electre' | 'saw' | 'fuzzy_topsis';
/** Lo que puede abrir el modal: un método de ranking o uno de los dos métodos de ponderación objetiva (AHP como ponderación es el
 * propio método `ahp`). */
export type ModalKey = MethodKey | 'critic' | 'entropy';
export type CitationFormat = 'ieee' | 'apa' | 'bibtex' | 'chicago';

interface MethodDoc {
  name: string;
  family: string;
  color: string;
  author: string;
  year: number;
  publication: string;
  doi: string;
  doiUrl: string;
  /** Etiqueta del identificador cuando no es un DOI (p. ej. «RAND»). */
  idLabel?: string;
  summary: string;
  /** Cuándo conviene usarlo (lo positivo). */
  whenToUse: string;
  /** Lo que limita el resultado: se muestran siempre, para no venderlo como «el mejor». */
  limits: string[];
  steps: { title: string; formula?: string; desc: string }[];
  citations: Record<CitationFormat, string>;
  citationApa: string; // compatibilidad
}

export const METHOD_SPECS: Record<MethodKey, MethodDoc> = {
  ahp: {
    name: 'AHP · Analytic Hierarchy Process',
    family: 'Pares Saaty',
    color: 'var(--m-ahp)',
    author: 'Saaty, Thomas L.',
    year: 1990,
    publication: 'European Journal of Operational Research, 48(1), 9–26',
    doi: '10.1016/0377-2217(90)90057-I',
    doiUrl: 'https://doi.org/10.1016/0377-2217(90)90057-I',
    summary: 'Descompone el problema en una jerarquía y compara sus elementos de a pares con la escala fundamental de Saaty (1 a 9). El vector de prioridades es el eigenvector principal de la matriz de comparaciones (A · w = λ_max · w) y la Razón de Consistencia (CR < 0.10) dice si los juicios se contradicen. En la plataforma, varios expertos se agregan con la media geométrica de sus juicios.',
    whenToUse: 'Pocos criterios y alternativas (la literatura sugiere no pasar de unos 7 elementos por matriz), sin datos cuantitativos comparables y con expertos accesibles; o cuando importa documentar el consenso y la consistencia del panel.',
    limits: [
      'Es subjetivo: el resultado es tan bueno como quienes juzgan. La plataforma no verifica quiénes son los expertos ni su idoneidad.',
      'El esfuerzo crece como n(n − 1)/2 comparaciones por experto y por matriz.',
      'CR < 0.10 es una convención de Saaty: mide coherencia interna de los juicios, no que sean «correctos».',
      'Como método de ranking completo, agregar o quitar una alternativa puede invertir el orden de las demás (inversión de rango; Belton & Gear, 1983).',
    ],
    steps: [
      {
        title: '1. Matriz recíproca A por experto',
        formula: 'a_ij > 0,   a_ji = 1 / a_ij,   a_ii = 1,   a_ij ∈ {1/9, …, 1/2, 1, 2, …, 9}',
        desc: 'La plataforma guarda cada juicio como un entero v ∈ [−8, 8]: v = 0 es igual importancia; si gana el primer elemento, a_ij = |v| + 1; si gana el segundo, a_ij = 1 / (|v| + 1). Un par sin juicio cuenta como 1.',
      },
      {
        title: '2. Agregación entre expertos (AIJ)',
        formula: 'a_ij = ( Π_k a_ij^(k) )^(1/K),   k = 1 … K expertos',
        desc: 'Media geométrica de los K juicios individuales: es la agregación que conserva la reciprocidad (Forman & Peniwati, 1998). Un experto sin juicios no entra al agregado.',
      },
      {
        title: '3. Vector de prioridades (eigenvector principal)',
        formula: 'w(t+1) = A · w(t) / Σ_i (A · w(t))_i   hasta converger;   λ_max = (1/n) · Σ_i (A · w)_i / w_i',
        desc: 'Iteración de potencias, que converge al eigenvector principal de Perron-Frobenius (el que define Saaty). El promedio de columnas normalizadas (procedimiento a mano del curso) queda como opción y da valores muy parecidos cuando la matriz es casi consistente.',
      },
      {
        title: '4. Índice y Razón de Consistencia',
        formula: 'CI = (λ_max − n) / (n − 1),   CR = CI / RI_n,   RI_n = 0.58, 0.90, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49  (n = 3 … 10)',
        desc: 'Si CR < 0.10 los juicios son aceptablemente consistentes; si no, hay que revisarlos. Con n < 3 el CR es siempre 0 y no informa; para n > 10 la plataforma usa RI = 1.49.',
      },
      {
        title: '5. Síntesis jerárquica (solo AHP como método de ranking)',
        formula: 'S_i = Σ_j w_j · p_ij',
        desc: 'w_j: peso del criterio j; p_ij: prioridad local de la alternativa i bajo el criterio j (una matriz de comparación por criterio). Gana la mayor S_i.',
      },
    ],
    citationApa: 'Saaty, T. L. (1990). How to make a decision: The Analytic Hierarchy Process. European Journal of Operational Research, 48(1), 9–26. https://doi.org/10.1016/0377-2217(90)90057-I',
    citations: {
      ieee: 'T. L. Saaty, "How to make a decision: The Analytic Hierarchy Process," European Journal of Operational Research, vol. 48, no. 1, pp. 9–26, 1990, doi: 10.1016/0377-2217(90)90057-I.',
      apa: 'Saaty, T. L. (1990). How to make a decision: The Analytic Hierarchy Process. European Journal of Operational Research, 48(1), 9–26. https://doi.org/10.1016/0377-2217(90)90057-I',
      bibtex: `@article{saaty1990how,
  author    = {Saaty, Thomas L.},
  title     = {How to make a decision: The Analytic Hierarchy Process},
  journal   = {European Journal of Operational Research},
  volume    = {48},
  number    = {1},
  pages     = {9--26},
  year      = {1990},
  doi       = {10.1016/0377-2217(90)90057-I}
}`,
      chicago: 'Saaty, Thomas L. 1990. "How to Make a Decision: The Analytic Hierarchy Process." European Journal of Operational Research 48 (1): 9–26. https://doi.org/10.1016/0377-2217(90)90057-I.',
    },
  },
  topsis: {
    name: 'TOPSIS · Technique for Order Preference by Similarity to Ideal Solution',
    family: 'Distancia Ideal',
    color: 'var(--m-topsis)',
    author: 'Hwang, Ching-Lai & Yoon, Kwangsun',
    year: 1981,
    publication: 'Multiple Attribute Decision Making: Methods and Applications. Springer-Verlag',
    doi: '10.1007/978-3-642-48318-9',
    doiUrl: 'https://doi.org/10.1007/978-3-642-48318-9',
    summary: 'Selecciona la alternativa con la menor distancia euclidiana a la Solución Ideal Positiva (PIS, A⁺) y a la vez la mayor distancia a la Solución Ideal Negativa o anti-ideal (NIS, A⁻). Trabaja con una matriz de decisión cuantitativa, normalización vectorial y pesos dados de fuera.',
    whenToUse: 'Matriz de decisión cuantitativa con criterios de beneficio y de costo, cuando se quiere una regla simple, sin parámetros que fijar y fácil de explicar («la más cercana al ideal»).',
    limits: [
      'Es compensatorio: un mal valor en un criterio puede taparse con buenos valores en otros.',
      'No deriva los pesos: los recibe (AHP, CRITIC, Entropía…) y el ranking es sensible a ellos; conviene probar otros pesos (simulador de sensibilidad).',
      'Los criterios «objetivo» se convierten antes en costo (distancia al valor objetivo).',
    ],
    steps: [
      {
        title: '1. Normalización vectorial',
        formula: 'r_ij = x_ij / √( Σ_k x_kj² )',
        desc: 'Transforma datos de distintas magnitudes y unidades a una escala adimensional.',
      },
      {
        title: '2. Matriz ponderada y soluciones ideales',
        formula: 'v_ij = w_j · r_ij;   A⁺ = (max_i v_ij | j∈B, min_i v_ij | j∈C);   A⁻ = (min_i v_ij | j∈B, max_i v_ij | j∈C)',
        desc: 'Los pesos se renormalizan para sumar 1. Mejores y peores desempeños ponderados para criterios de beneficio (B) y costo (C).',
      },
      {
        title: '3. Distancias euclidianas',
        formula: 'd_i⁺ = √( Σ_j (v_ij − v_j⁺)² ),   d_i⁻ = √( Σ_j (v_ij − v_j⁻)² )',
        desc: 'Qué tan lejos queda cada alternativa de la ideal (d⁺, menor es mejor) y de la anti-ideal (d⁻, mayor es mejor).',
      },
      {
        title: '4. Coeficiente de proximidad relativa',
        formula: 'C_i = d_i⁻ / ( d_i⁺ + d_i⁻ ),   C_i ∈ [0, 1]',
        desc: 'Cuanto más cercano a 1 sea C_i, mayor es la preferencia de la alternativa.',
      },
    ],
    citationApa: 'Hwang, C. L., & Yoon, K. (1981). Multiple Attribute Decision Making: Methods and Applications. Springer-Verlag, Berlin/Heidelberg. https://doi.org/10.1007/978-3-642-48318-9',
    citations: {
      ieee: 'C.-L. Hwang and K. Yoon, Multiple Attribute Decision Making: Methods and Applications. Berlin, Heidelberg: Springer-Verlag, 1981, doi: 10.1007/978-3-642-48318-9.',
      apa: 'Hwang, C. L., & Yoon, K. (1981). Multiple Attribute Decision Making: Methods and Applications. Springer-Verlag, Berlin/Heidelberg. https://doi.org/10.1007/978-3-642-48318-9',
      bibtex: `@book{hwang1981multiple,
  author    = {Hwang, Ching-Lai and Yoon, Kwangsun},
  title     = {Multiple Attribute Decision Making: Methods and Applications},
  publisher = {Springer-Verlag},
  address   = {Berlin, Heidelberg},
  year      = {1981},
  doi       = {10.1007/978-3-642-48318-9}
}`,
      chicago: 'Hwang, Ching-Lai, and Kwangsun Yoon. 1981. Multiple Attribute Decision Making: Methods and Applications. Berlin: Springer-Verlag. https://doi.org/10.1007/978-3-642-48318-9.',
    },
  },
  vikor: {
    name: 'VIKOR · VlseKriterijumska Optimizacija I Kompromisno Resenje',
    family: 'Compromiso',
    color: 'var(--m-vikor)',
    author: 'Opricovic, Serafim & Tzeng, Gwo-Hshiung',
    year: 2004,
    publication: 'European Journal of Operational Research, 156(2), 445–455',
    doi: '10.1016/S0377-2217(03)00020-1',
    doiUrl: 'https://doi.org/10.1016/S0377-2217(03)00020-1',
    summary: 'Busca una solución de compromiso: la alternativa más cercana al ideal según dos medidas a la vez, la utilidad de grupo (S, mayoría) y el pesar individual máximo (R, el peor desempeño en un solo criterio), sintetizadas en el índice Q. Solo declara ganador único si además cumple dos condiciones de Opricovic y Tzeng; si no, propone un conjunto de compromiso.',
    whenToUse: 'Cuando quien decide acepta una solución de compromiso y quiere controlar cuánto pesa la mayoría frente al peor desempeño individual (parámetro v), sobre una matriz cuantitativa.',
    limits: [
      'v (peso de la estrategia de mayoría) lo fija quien decide, no sale de los datos; 0.5 es solo una convención. El ranking puede cambiar con v (ver la gráfica de sensibilidad).',
      'Si falla C1 (ventaja aceptable) o C2 (estabilidad), NO hay ganador único: el resultado es un conjunto de compromiso.',
      'El índice Q depende del rango de las alternativas incluidas (S⁻, S*, R⁻, R*), así que agregar o quitar una alternativa extrema puede cambiar los valores.',
    ],
    steps: [
      {
        title: '1. Utilidad de grupo (S_i) y pesar individual (R_i)',
        formula: 'S_i = Σ_j w_j · (f_j* − f_ij) / (f_j* − f_j⁻),   R_i = max_j [ w_j · (f_j* − f_ij) / (f_j* − f_j⁻) ]',
        desc: 'f_j* y f_j⁻ son el mejor y el peor valor del criterio j (al revés en criterios de costo). Menor S y menor R es mejor.',
      },
      {
        title: '2. Índice de compromiso Q_i',
        formula: 'Q_i = v · (S_i − S*) / (S⁻ − S*) + (1 − v) · (R_i − R*) / (R⁻ − R*)',
        desc: 'S* = min S, S⁻ = max S, R* = min R, R⁻ = max R. v pondera la estrategia de máxima utilidad de grupo (típicamente v = 0.5). Se ordena de menor a mayor Q.',
      },
      {
        title: '3. Condiciones de decisión aceptable',
        formula: 'C1: Q(A²) − Q(A¹) ≥ DQ = 1 / (m − 1)     C2: A¹ también es la mejor en S y/o en R',
        desc: 'm = número de alternativas; A¹ y A² son la 1.ª y la 2.ª por Q. Si solo falla C2, el conjunto de compromiso es {A¹, A²}; si falla C1, son todas las A^M con Q(A^M) − Q(A¹) < DQ.',
      },
    ],
    citationApa: 'Opricovic, S., & Tzeng, G. H. (2004). Compromise solution by MCDM methods: A comparative analysis of VIKOR and TOPSIS. European Journal of Operational Research, 156(2), 445–455. https://doi.org/10.1016/S0377-2217(03)00020-1',
    citations: {
      ieee: 'S. Opricovic and G.-H. Tzeng, "Compromise solution by MCDM methods: A comparative analysis of VIKOR and TOPSIS," European Journal of Operational Research, vol. 156, no. 2, pp. 445–455, 2004, doi: 10.1016/S0377-2217(03)00020-1.',
      apa: 'Opricovic, S., & Tzeng, G. H. (2004). Compromise solution by MCDM methods: A comparative analysis of VIKOR and TOPSIS. European Journal of Operational Research, 156(2), 445–455. https://doi.org/10.1016/S0377-2217(03)00020-1',
      bibtex: `@article{opricovic2004compromise,
  author    = {Opricovic, Serafim and Tzeng, Gwo-Hshiung},
  title     = {Compromise solution by MCDM methods: A comparative analysis of VIKOR and TOPSIS},
  journal   = {European Journal of Operational Research},
  volume    = {156},
  number    = {2},
  pages     = {445--455},
  year      = {2004},
  doi       = {10.1016/S0377-2217(03)00020-1}
}`,
      chicago: 'Opricovic, Serafim, and Gwo-Hshiung Tzeng. 2004. "Compromise Solution by MCDM Methods: A Comparative Analysis of VIKOR and TOPSIS." European Journal of Operational Research 156 (2): 445–455. https://doi.org/10.1016/S0377-2217(03)00020-1.',
    },
  },
  promethee: {
    name: 'PROMETHEE II · Preference Ranking Organization METHod',
    family: 'Superación',
    color: 'var(--m-promethee)',
    author: 'Brans, Jean-Pierre & Vincke, Philippe',
    year: 1985,
    publication: 'Management Science, 31(6), 647–656',
    doi: '10.1287/mnsc.31.6.647',
    doiUrl: 'https://doi.org/10.1287/mnsc.31.6.647',
    summary: 'Método de superación (outranking) que compara cada par de alternativas criterio por criterio con una función de preferencia P_j(a, b), agrega esas preferencias con los pesos en un índice π(a, b) y resume cada alternativa con sus flujos de salida (Φ⁺), de entrada (Φ⁻) y neto (Φ). PROMETHEE II ordena por el flujo neto: preorden completo.',
    whenToUse: 'Matriz cuantitativa donde importa cuánto mejor es una alternativa que otra (no solo si lo es) y se quiere un orden completo con flujos que expliquen «a quién supera y quién la supera».',
    limits: [
      'La plataforma usa solo la función de preferencia lineal (tipo III/V) con umbral de indiferencia q = 0 y umbral de preferencia p = rango de cada criterio, como el notebook del curso. No implementa las demás formas (usual, con zona de indiferencia, gaussiana) ni umbrales por criterio elegidos por quien decide.',
      'Es compensatorio en el flujo neto: un flujo alto en unos criterios compensa flujos bajos en otros.',
      'Los pesos vienen de fuera (AHP, CRITIC, Entropía…).',
    ],
    steps: [
      {
        title: '1. Preferencia por criterio',
        formula: 'P_j(a, b) = min( 1,  max(0, g_j(a) − g_j(b)) / p_j ),   p_j = max_i g_j − min_i g_j',
        desc: 'g_j es el valor en dirección «mayor es mejor» (en criterios de costo se invierte el signo). Función lineal (tipo III/V) con q = 0.',
      },
      {
        title: '2. Índice de preferencia global',
        formula: 'π(a, b) = Σ_j w_j · P_j(a, b)',
        desc: 'Con los pesos normalizados a suma 1: cuánto se prefiere a sobre b considerando todos los criterios.',
      },
      {
        title: '3. Flujos de salida y de entrada',
        formula: 'Φ⁺(a) = 1/(m−1) Σ_x π(a, x),   Φ⁻(a) = 1/(m−1) Σ_x π(x, a)',
        desc: 'Φ⁺ indica el poder de superación de a sobre las demás; Φ⁻ su debilidad frente a las demás.',
      },
      {
        title: '4. Flujo neto (PROMETHEE II)',
        formula: 'Φ(a) = Φ⁺(a) − Φ⁻(a),   Σ_a Φ(a) = 0',
        desc: 'Da un preorden completo: mayor Φ es mejor.',
      },
    ],
    citationApa: 'Brans, J. P., & Vincke, P. (1985). A preference ranking organisation method: The PROMETHEE method for multiple criteria decision-making. Management Science, 31(6), 647–656. https://doi.org/10.1287/mnsc.31.6.647',
    citations: {
      ieee: 'J.-P. Brans and P. Vincke, "A preference ranking organisation method: The PROMETHEE method for multiple criteria decision-making," Management Science, vol. 31, no. 6, pp. 647–656, 1985, doi: 10.1287/mnsc.31.6.647.',
      apa: 'Brans, J. P., & Vincke, P. (1985). A preference ranking organisation method: The PROMETHEE method for multiple criteria decision-making. Management Science, 31(6), 647–656. https://doi.org/10.1287/mnsc.31.6.647',
      bibtex: `@article{brans1985preference,
  author    = {Brans, Jean-Pierre and Vincke, Philippe},
  title     = {A preference ranking organisation method: The {PROMETHEE} method for multiple criteria decision-making},
  journal   = {Management Science},
  volume    = {31},
  number    = {6},
  pages     = {647--656},
  year      = {1985},
  doi       = {10.1287/mnsc.31.6.647}
}`,
      chicago: 'Brans, Jean-Pierre, and Philippe Vincke. 1985. "A Preference Ranking Organisation Method: The PROMETHEE Method for Multiple Criteria Decision-Making." Management Science 31 (6): 647–656. https://doi.org/10.1287/mnsc.31.6.647.',
    },
  },
  electre: {
    name: 'ELECTRE · ELimination Et Choix Traduisant la REalité',
    family: 'Concordancia',
    color: 'var(--m-electre)',
    author: 'Roy, Bernard',
    year: 1991,
    publication: 'Theory and Decision, 31(1), 49–73',
    doi: '10.1007/BF00134132',
    doiUrl: 'https://doi.org/10.1007/BF00134132',
    summary: 'Familia de métodos de superación con una idea distinta a la de sumar puntajes: la alternativa i «supera» a la k si una mayoría suficiente de criterios (por peso) la respalda y ninguno se opone con demasiada fuerza. La plataforma implementa ELECTRE I con la convención del notebook del curso. No produce un ranking: produce una relación de superación en la que puede haber alternativas incomparables.',
    whenToUse: 'Cuando no se quiere que un buen valor en un criterio compense uno muy malo en otro (la discordancia actúa como veto) y se acepta que el resultado sea una relación, con núcleo de alternativas no superadas, y no un orden total.',
    limits: [
      'No da un ranking ni un puntaje: puede haber pares incomparables y ciclos. No es una falla, es la información que los datos permiten.',
      'c* (concordancia mínima) y d* (discordancia máxima) los elige quien decide: no salen de los datos y cambian la relación. La plataforma parte de c* = 0.65 y d* = 0.30, convención del curso, no un estándar de la literatura.',
      'Es ELECTRE I: no usa umbrales de indiferencia, preferencia y veto por criterio (ELECTRE III), y la discordancia se normaliza con el rango de cada criterio.',
    ],
    steps: [
      {
        title: '1. Índice de concordancia',
        formula: 'C_ik = Σ w_j  sobre  j ∈ J⁺(i,k) = { j : i es al menos tan buena como k en j },   con Σ_j w_j = 1',
        desc: '«Al menos tan buena» es x_ij ≥ x_kj en criterios de beneficio y x_ij ≤ x_kj en criterios de costo. C_ik es el peso total de los criterios que respaldan que i supera a k.',
      },
      {
        title: '2. Índice de discordancia',
        formula: 'D_ik = max sobre { j : k es mejor que i en j } de |x_kj − x_ij| / R_j,     R_j = max_a x_aj − min_a x_aj',
        desc: 'La mayor objeción a que i supere a k, normalizada por el rango R_j de ese criterio (0 si k no es mejor en ninguno). Es la convención del notebook del curso.',
      },
      {
        title: '3. Relación de superación y núcleo',
        formula: 'i S k  ⇔  C_ik ≥ c*  y  D_ik ≤ d*',
        desc: 'El grafo une con flecha a quien supera y con línea punteada a las alternativas incomparables. El núcleo (Roy, 1991) es el conjunto de alternativas que ninguna otra del núcleo supera y que, juntas, superan a todas las demás; las que se superan en ciclo cuentan como un bloque. Puede tener varios elementos: una alternativa aislada (ni supera ni es superada) entra al núcleo sin ganar nada, y solo hay ganador cuando el núcleo es una única alternativa.',
      },
    ],
    citationApa: 'Roy, B. (1991). The outranking approach and the foundations of ELECTRE methods. Theory and Decision, 31(1), 49–73. https://doi.org/10.1007/BF00134132',
    citations: {
      ieee: 'B. Roy, "The outranking approach and the foundations of ELECTRE methods," Theory and Decision, vol. 31, no. 1, pp. 49–73, 1991, doi: 10.1007/BF00134132.',
      apa: 'Roy, B. (1991). The outranking approach and the foundations of ELECTRE methods. Theory and Decision, 31(1), 49–73. https://doi.org/10.1007/BF00134132',
      bibtex: `@article{roy1991outranking,
  author    = {Roy, Bernard},
  title     = {The outranking approach and the foundations of {ELECTRE} methods},
  journal   = {Theory and Decision},
  volume    = {31},
  number    = {1},
  pages     = {49--73},
  year      = {1991},
  doi       = {10.1007/BF00134132}
}`,
      chicago: 'Roy, Bernard. 1991. "The Outranking Approach and the Foundations of ELECTRE Methods." Theory and Decision 31 (1): 49–73. https://doi.org/10.1007/BF00134132.',
    },
  },
  saw: {
    name: 'SAW · Simple Additive Weighting',
    family: 'Suma Directa',
    color: 'var(--m-saw)',
    author: 'MacCrimmon, Kenneth R.',
    year: 1968,
    publication: 'Decisionmaking among multiple-attribute alternatives: a survey and consolidated approach. RAND Memorandum RM-4823-ARPA',
    doi: 'RM-4823-ARPA',
    idLabel: 'RAND',
    doiUrl: 'https://www.rand.org/pubs/research_memoranda/RM4823.html',
    summary: 'El método aditivo más simple y transparente: normaliza cada criterio a [0, 1] con Min–Max y calcula la suma ponderada. Es el modelo «aditivo lineal» de los manuales de análisis multicriterio y sirve como línea base para comparar con métodos más elaborados.',
    whenToUse: 'Cuando se quiere máxima transparencia ante un comité: cada puntaje se puede reconstruir a mano y ver cuánto aportó cada criterio.',
    limits: [
      'Compensación total: un valor muy malo en un criterio se paga con buenos valores en otros.',
      'La normalización Min–Max depende de las alternativas presentes: agregar una alternativa extrema cambia el puntaje de todas.',
      'Los pesos vienen de fuera (AHP, CRITIC, Entropía…) y se interpretan como tasas de sustitución entre criterios solo si los valores se normalizan de forma coherente.',
    ],
    steps: [
      {
        title: '1. Normalización lineal Min–Max',
        formula: 'Beneficio: r_ij = (x_ij − min x_j) / (max x_j − min x_j);   Costo: r_ij = (max x_j − x_ij) / (max x_j − min x_j)',
        desc: 'El mejor desempeño de cada criterio toma 1 y el peor 0.',
      },
      {
        title: '2. Suma ponderada',
        formula: 'S_i = Σ_j w_j · r_ij',
        desc: 'Con los pesos normalizados a suma 1: producto punto entre el vector de pesos y el vector normalizado de la alternativa.',
      },
      {
        title: '3. Ranking',
        formula: 'A* = arg max_i S_i',
        desc: 'La alternativa con mayor S_i encabeza el orden de prioridad.',
      },
    ],
    citationApa: 'MacCrimmon, K. R. (1968). Decisionmaking among multiple-attribute alternatives: A survey and consolidated approach (RAND Memorandum RM-4823-ARPA). RAND Corporation. https://www.rand.org/pubs/research_memoranda/RM4823.html',
    citations: {
      ieee: 'K. R. MacCrimmon, "Decisionmaking among multiple-attribute alternatives: A survey and consolidated approach," RAND Corporation, Santa Monica, CA, Memorandum RM-4823-ARPA, Dec. 1968. [Online]. Available: https://www.rand.org/pubs/research_memoranda/RM4823.html',
      apa: 'MacCrimmon, K. R. (1968). Decisionmaking among multiple-attribute alternatives: A survey and consolidated approach (RAND Memorandum RM-4823-ARPA). RAND Corporation. https://www.rand.org/pubs/research_memoranda/RM4823.html',
      bibtex: `@techreport{maccrimmon1968decisionmaking,
  author      = {MacCrimmon, Kenneth R.},
  title       = {Decisionmaking among multiple-attribute alternatives: A survey and consolidated approach},
  institution = {RAND Corporation},
  address     = {Santa Monica, CA},
  number      = {RM-4823-ARPA},
  month       = dec,
  year        = {1968},
  url         = {https://www.rand.org/pubs/memoranda/RM4823.html}
}`,
      chicago: 'MacCrimmon, Kenneth R. 1968. "Decisionmaking among Multiple-Attribute Alternatives: A Survey and Consolidated Approach." RAND Memorandum RM-4823-ARPA. Santa Monica, CA: RAND Corporation. https://www.rand.org/pubs/research_memoranda/RM4823.html.',
    },
  },
  fuzzy_topsis: {
    name: 'Fuzzy TOPSIS · Números Difusos Triangulares (TFN)',
    family: 'Lógica Difusa',
    color: 'var(--m-fuzzy)',
    author: 'Chen, Chen-Tung',
    year: 2000,
    publication: 'Fuzzy Sets and Systems, 114(1), 1–9',
    doi: '10.1016/S0165-0114(97)00377-1',
    doiUrl: 'https://doi.org/10.1016/S0165-0114(97)00377-1',
    summary: 'Extiende TOPSIS a evaluaciones lingüísticas («Bueno», «Pobre»…) representadas como Números Difusos Triangulares (l, m, u). Las distancias a la solución ideal y anti-ideal difusas se calculan con el método del vértice, sin desdifusificar antes de tiempo. La plataforma usa una versión simplificada de Chen (2000): 5 etiquetas y pesos numéricos.',
    whenToUse: 'Cuando las evaluaciones son cualitativas o inciertas y no hay datos medidos: se prefiere una etiqueta («Bueno») a inventar un número exacto.',
    limits: [
      'Simplificación de Chen (2000): escala de 5 niveles (VP, P, F, G, VG) y pesos numéricos, no lingüísticos; cada celda guarda una sola etiqueta (no agrega varios decisores dentro de la celda).',
      'Una celda sin evaluación cuenta como «Regular» (F) y se marca en el informe.',
      'Con pesos CRITIC o Entropía, esos pesos se calculan sobre el valor nítido (centroide) de cada etiqueta, no sobre los números difusos.',
    ],
    steps: [
      {
        title: '1. Escala lingüística y Números Difusos Triangulares',
        formula: 'VP = (0, 0, 1),  P = (0, 1, 3),  F = (1, 3, 5),  G = (5, 7, 9),  VG = (7, 9, 10)',
        desc: 'Cada etiqueta es una tripleta (l, m, u) sobre el eje 0–10 (Zadeh, 1965, para el fundamento de los conjuntos difusos).',
      },
      {
        title: '2. Normalización y ponderación',
        formula: 'Beneficio: r = (l/u*, m/u*, u/u*), u* = max_i u_ij;   Costo: r = (l*/u, l*/m, l*/l), l* = min_i l_ij;   v_ij = w_j · r_ij',
        desc: 'Normalización lineal que deja los TFN en [0, 1]; luego se ponderan con pesos numéricos que suman 1.',
      },
      {
        title: '3. Distancia por método del vértice',
        formula: 'd(x̃, ỹ) = √[ 1/3 · ( (l_x − l_y)² + (m_x − m_y)² + (u_x − u_y)² ) ]',
        desc: 'FPIS A* = (1, 1, 1) y FNIS A⁻ = (0, 0, 0) en cada criterio; d_i* y d_i⁻ suman las distancias de la alternativa i a ellos.',
      },
      {
        title: '4. Coeficiente de cercanía difuso',
        formula: 'CC_i = d_i⁻ / ( d_i* + d_i⁻ )',
        desc: 'Mayor CC_i = más cerca del ideal difuso y más lejos del anti-ideal.',
      },
    ],
    citationApa: 'Chen, C. T. (2000). Extensions of the TOPSIS for group decision-making under fuzzy environment. Fuzzy Sets and Systems, 114(1), 1–9. https://doi.org/10.1016/S0165-0114(97)00377-1',
    citations: {
      ieee: 'C.-T. Chen, "Extensions of the TOPSIS for group decision-making under fuzzy environment," Fuzzy Sets and Systems, vol. 114, no. 1, pp. 1–9, 2000, doi: 10.1016/S0165-0114(97)00377-1.',
      apa: 'Chen, C. T. (2000). Extensions of the TOPSIS for group decision-making under fuzzy environment. Fuzzy Sets and Systems, 114(1), 1–9. https://doi.org/10.1016/S0165-0114(97)00377-1',
      bibtex: `@article{chen2000extensions,
  author    = {Chen, Chen-Tung},
  title     = {Extensions of the {TOPSIS} for group decision-making under fuzzy environment},
  journal   = {Fuzzy Sets and Systems},
  volume    = {114},
  number    = {1},
  pages     = {1--9},
  year      = {2000},
  doi       = {10.1016/S0165-0114(97)00377-1}
}`,
      chicago: 'Chen, Chen-Tung. 2000. "Extensions of the TOPSIS for Group Decision-Making under Fuzzy Environment." Fuzzy Sets and Systems 114 (1): 1–9. https://doi.org/10.1016/S0165-0114(97)00377-1.',
    },
  },
};

const citeAll = (r: Ref): Record<CitationFormat, string> => ({
  ieee: formatCitation(r, 'ieee'),
  apa: formatCitation(r, 'apa'),
  bibtex: formatCitation(r, 'bibtex'),
  chicago: formatCitation(r, 'chicago'),
});

/** Métodos de ponderación de criterios, documentados con el mismo formato que los de ranking. Las referencias salen de
 * WEIGHTING_REFS (references.ts), la misma lista que cita el informe ejecutivo. Las fórmulas siguen lo que calculan `ahp.ts`
 * y `weights.ts`; el texto de CRITIC y Entropía sigue el capítulo 3 de Aznar y Guijarro (2012), del curso. */
export const WEIGHTING_SPECS: Record<'ahp' | 'critic' | 'entropy', MethodDoc> = {
  ahp: {
    ...METHOD_SPECS.ahp,
    name: 'AHP · Pesos por juicio de expertos',
    family: 'Ponderación subjetiva',
    summary: WEIGHTING_REFS.ahp.how + ' Es el único de los tres que pide juicios de personas; CRITIC y Entropía leen la matriz de decisión.',
    whenToUse: WEIGHTING_REFS.ahp.when,
    limits: [
      WEIGHTING_REFS.ahp.caveat,
      'La plataforma no verifica quiénes son los expertos ni su idoneidad: un informe con juicios de ejemplo no es un dictamen de un panel real.',
    ],
    steps: METHOD_SPECS.ahp.steps.slice(0, 4),
  },
  critic: {
    name: 'CRITIC · CRiteria Importance Through Intercriteria Correlation',
    family: 'Ponderación objetiva',
    color: 'var(--pb)',
    author: 'Diakoulaki, D.; Mavrotas, G. & Papayannakis, L.',
    year: 1995,
    publication: 'Computers & Operations Research, 22(7), 763–770',
    doi: REFS.diakoulaki1995.doi,
    doiUrl: `https://doi.org/${REFS.diakoulaki1995.doi}`,
    summary: WEIGHTING_REFS.critic.how,
    whenToUse: WEIGHTING_REFS.critic.when,
    limits: [
      WEIGHTING_REFS.critic.caveat,
      'La plataforma calcula σ con divisor n; Aznar y Guijarro (2012) usan n − 1. El factor es común a todos los criterios, así que los pesos normalizados son idénticos.',
      'Los criterios de costo se orientan en la normalización (mayor = mejor) y los criterios «objetivo» ya llegan convertidos a distancia (costo).',
    ],
    steps: [
      {
        title: '1. Normalización Min–Max según el tipo de criterio',
        formula: 'Beneficio: r_ij = (x_ij − min_i x_ij) / (max_i x_ij − min_i x_ij);   Costo: r_ij = (max_i x_ij − x_ij) / (max_i x_ij − min_i x_ij)',
        desc: 'Hace comparables criterios de distintas unidades. Una columna constante (max = min) queda en 0 y aporta contraste nulo.',
      },
      {
        title: '2. Contraste y correlación entre criterios',
        formula: 'σ_j = √( Σ_i (r_ij − r̄_j)² / n ),     ρ_jk = cov(r_j, r_k) / (σ_j · σ_k)   (Pearson)',
        desc: 'σ_j mide cuánto varía el criterio entre las n alternativas; ρ_jk cuánto se parece a cada otro criterio (si σ = 0 la plataforma toma ρ = 0).',
      },
      {
        title: '3. Cantidad de información de cada criterio',
        formula: 'C_j = σ_j · Σ_k (1 − ρ_jk)',
        desc: 'Pesa más el criterio que varía más (σ alta) y que aporta información distinta de la de los demás (correlación baja).',
      },
      {
        title: '4. Pesos normalizados',
        formula: 'w_j = C_j / Σ_k C_k',
        desc: 'Suman 1. No dependen de juicios de expertos: cambian si cambia la matriz.',
      },
    ],
    citationApa: apa(REFS.diakoulaki1995),
    citations: citeAll(REFS.diakoulaki1995),
  },
  entropy: {
    name: 'Entropía de Shannon · Pesos por dispersión de la información',
    family: 'Ponderación objetiva',
    color: 'var(--pa)',
    author: 'Shannon, C. E. (uso como método de pesos: Zeleny, 1982)',
    year: 1948,
    publication: 'Bell System Technical Journal, 27(3), 379–423 y 27(4), 623–656',
    doi: REFS.shannon1948.doi,
    doiUrl: `https://doi.org/${REFS.shannon1948.doi}`,
    summary: WEIGHTING_REFS.entropy.how + ' La entropía viene de la teoría de la información de Shannon; su uso como método de pesos multicriterio se atribuye a Zeleny (1982), según Aznar y Guijarro (2012).',
    whenToUse: WEIGHTING_REFS.entropy.when,
    limits: [
      WEIGHTING_REFS.entropy.caveat,
      'Con valores iguales en todas las alternativas la entropía es máxima y el criterio recibe peso 0: eso no significa que sea irrelevante para quien decide.',
    ],
    steps: [
      {
        title: '1. Proporciones por criterio',
        formula: 'p_ij = x_ij / Σ_i x_ij     (criterio de costo: x_ij se sustituye por 1 / x_ij antes de normalizar)',
        desc: 'Requiere valores no negativos: Aznar y Guijarro (2012) sustituyen los negativos por 0.01 antes del logaritmo; la plataforma no transforma los datos.',
      },
      {
        title: '2. Entropía de cada criterio',
        formula: 'E_j = − k · Σ_i p_ij · ln(p_ij),   k = 1 / ln(m),   0 · ln 0 = 0,   E_j ∈ [0, 1]',
        desc: 'm = número de alternativas. E_j es máxima (1) cuando todas las alternativas valen lo mismo. La base del logaritmo no cambia el resultado porque k la compensa.',
      },
      {
        title: '3. Diversidad (grado de diferenciación)',
        formula: 'd_j = 1 − E_j',
        desc: 'Cuanto más se diferencian las alternativas en un criterio, más información aporta y mayor es d_j.',
      },
      {
        title: '4. Pesos normalizados',
        formula: 'w_j = d_j / Σ_k d_k',
        desc: 'Suman 1. No dependen de juicios de expertos: cambian si cambia la matriz.',
      },
    ],
    citationApa: apa(REFS.shannon1948),
    citations: citeAll(REFS.shannon1948),
  },
};

/** Referencias complementarias en APA de la ficha abierta (además de la cita principal, que va en cuatro formatos). */
function extraRefsFor(key: ModalKey): string[] {
  if (key === 'critic' || key === 'entropy') return WEIGHTING_REFS[key].apa.slice(1);
  return (METHOD_EXTRA_REFS[key] ?? []).map(apa);
}

const FORMAT_LABELS: Record<CitationFormat, string> = {
  ieee: 'IEEE',
  apa: 'APA 7.ª',
  bibtex: 'BibTeX',
  chicago: 'Chicago',
};

/** Ficha de un método: los de ranking salen de METHOD_SPECS; CRITIC y Entropía (y AHP visto como ponderación) de WEIGHTING_SPECS. */
export function specFor(key: ModalKey): MethodDoc {
  if (key === 'critic' || key === 'entropy') return WEIGHTING_SPECS[key];
  return METHOD_SPECS[key] || METHOD_SPECS.topsis;
}

export default function ScientificMethodModal({
  methodKey,
  onClose,
}: {
  methodKey: ModalKey;
  onClose: () => void;
}) {
  const method = specFor(methodKey);
  const isWeighting = methodKey === 'critic' || methodKey === 'entropy';
  // Un método de ranking que recibe los pesos de fuera (todos menos AHP) muestra al final cómo se obtienen esos pesos.
  const showWeightingBlock = !isWeighting && methodKey !== 'ahp';
  const extraRefs = extraRefsFor(methodKey);
  const [format, setFormat] = useState<CitationFormat>('ieee');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const timer = setTimeout(() => setToastMsg(null), 2800);
    return () => clearTimeout(timer);
  }, [toastMsg]);

  const activeCitation = method.citations[format];

  function copyCitation() {
    navigator.clipboard?.writeText(activeCitation);
    setToastMsg(`Cita en formato ${FORMAT_LABELS[format]} copiada al portapapeles`);
  }

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(7, 10, 16, 0.84)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Toast Notificación Glassmórfica («Toast Lindo») */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(17, 24, 39, 0.95)',
            border: '1px solid rgba(0, 229, 255, 0.5)',
            boxShadow: '0 12px 35px rgba(0, 0, 0, 0.7), 0 0 20px rgba(0, 229, 255, 0.25)',
            borderRadius: 12,
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            zIndex: 3000,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            animation: 'toastSlideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: 'rgba(0, 229, 255, 0.2)',
              border: '1px solid #00E5FF',
              color: '#00E5FF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            ✓
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#FFFFFF' }}>{toastMsg}</div>
            <div style={{ fontSize: 11.5, color: '#94A3B8' }}>Lista para pegar en tu artículo o Overleaf</div>
          </div>
        </div>
      )}

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="smm-title"
        tabIndex={-1}
        style={{
          background: 'var(--surface)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderTop: `4px solid ${method.color}`,
          borderRadius: 14,
          maxWidth: 700,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85)',
          padding: '28px',
          display: 'grid',
          gap: 20,
          animation: 'fadeIn 0.2s ease-out',
          position: 'relative',
        }}
      >
        {/* Encabezado */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--f-mono)',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: method.color,
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  border: `1px solid ${method.color}`,
                }}
              >
                {method.family}
              </span>
              <span style={{ fontSize: 12, fontFamily: 'var(--f-mono)', color: 'var(--muted)' }}>
                {isWeighting ? 'MÉTODO DE PONDERACIÓN' : 'FUNDAMENTO MATEMÁTICO'}
              </span>
            </div>
            <h2 id="smm-title" style={{ fontSize: 22, margin: 0, color: 'var(--ink)' }}>{method.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid var(--line)',
              color: 'var(--muted)',
              fontSize: 16,
              width: 32,
              height: 32,
              borderRadius: 6,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Resumen Conceptual */}
        <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
          {method.summary}
        </p>

        {/* Selector de Formato de Cita Bibliográfica */}
        <div
          style={{
            background: 'var(--surface2)',
            border: '1px solid var(--line)',
            borderRadius: 10,
            padding: '16px 18px',
            display: 'grid',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 11.5, fontFamily: 'var(--f-mono)', textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.06em', fontWeight: 600 }}>
              Formato de Cita para Publicación:
            </div>
            {/* Tabs de formatos */}
            <div style={{ display: 'flex', gap: 6 }}>
              {(['ieee', 'apa', 'bibtex', 'chicago'] as CitationFormat[]).map((fmt) => {
                const isActive = format === fmt;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setFormat(fmt)}
                    style={{
                      appearance: 'none',
                      background: isActive ? method.color : 'rgba(255, 255, 255, 0.05)',
                      color: isActive ? '#0B0F17' : 'var(--muted)',
                      border: `1px solid ${isActive ? method.color : 'var(--line)'}`,
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 11.5,
                      fontFamily: 'var(--f-mono)',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.18s ease',
                    }}
                  >
                    {FORMAT_LABELS[fmt]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Caja con la cita en el formato elegido */}
          <div
            style={{
              fontSize: format === 'bibtex' ? 12 : 13,
              fontFamily: 'var(--f-mono)',
              color: 'var(--ink)',
              lineHeight: 1.55,
              background: 'rgba(0, 0, 0, 0.35)',
              padding: '12px 14px',
              borderRadius: 6,
              border: '1px solid rgba(255, 255, 255, 0.06)',
              whiteSpace: format === 'bibtex' ? 'pre' : 'normal',
              overflowX: 'auto',
            }}
          >
            {activeCitation}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--f-mono)' }}>
            <span>{method.idLabel ?? 'DOI'}: <b style={{ color: method.color }}>{method.doi}</b></span>
            <button
              type="button"
              onClick={copyCitation}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid var(--line)',
                color: 'var(--ink)',
                padding: '4px 12px',
                borderRadius: 5,
                fontSize: 12,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: 'var(--f-body)',
                fontWeight: 600,
                transition: 'all 0.18s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = method.color;
                e.currentTarget.style.color = method.color;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--line)';
                e.currentTarget.style.color = 'var(--ink)';
              }}
            >
              Copiar cita en {FORMAT_LABELS[format]}
            </button>
          </div>
        </div>

        {/* Formulación Matemática Paso a Paso */}
        <div>
          <div style={{ fontSize: 12, fontFamily: 'var(--f-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 10 }}>
            Ecuaciones y Algoritmo de Cálculo
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {method.steps.map((step, idx) => (
              <div
                key={idx}
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--line)',
                  borderLeft: `3px solid ${method.color}`,
                  borderRadius: 8,
                  padding: '12px 14px',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--ink)' }}>{step.title}</div>
                {step.formula && (
                  <div
                    style={{
                      fontFamily: 'var(--f-mono)',
                      fontSize: 12.5,
                      color: method.color,
                      background: 'rgba(0, 0, 0, 0.25)',
                      padding: '6px 10px',
                      borderRadius: 4,
                      margin: '6px 0',
                      wordBreak: 'break-word',
                    }}
                  >
                    {step.formula}
                  </div>
                )}
                <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.4 }}>{step.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Cuándo conviene y qué limita el resultado: sin esto el método parece «el mejor» y no lo es */}
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 12, fontFamily: 'var(--f-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>
            Cuándo usarlo y límites
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.55, margin: 0 }}>
            <b>Conviene cuando:</b> {method.whenToUse}
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
            {method.limits.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </div>

        {extraRefs.length > 0 && (
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 12, fontFamily: 'var(--f-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>
              Referencias complementarias (APA 7.ª)
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4, fontSize: 12, color: 'var(--ink)', lineHeight: 1.5 }}>
              {extraRefs.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}

        {showWeightingBlock && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12, fontFamily: 'var(--f-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>
              De dónde salen los pesos de los criterios
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>
              {method.name.split(' · ')[0]} no deriva los pesos: los recibe. En la plataforma salen de tres métodos; cada proyecto elige uno.
            </p>
            {(['ahp', 'critic', 'entropy'] as const).map((k) => {
              const w = WEIGHTING_SPECS[k];
              return (
                <details key={k} style={{ background: 'var(--surface2)', border: '1px solid var(--line)', borderLeft: `3px solid ${w.color}`, borderRadius: 8, padding: '8px 12px' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13.5, color: 'var(--ink)' }}>{WEIGHTING_REFS[k].label}</summary>
                  <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                    <p style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.5, margin: 0 }}>{WEIGHTING_REFS[k].how}</p>
                    {w.steps.map((st, i) => (
                      <div key={i} style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.45 }}>
                        <b style={{ color: 'var(--ink)' }}>{st.title}</b>
                        {st.formula && <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: w.color, background: 'rgba(0, 0, 0, 0.25)', padding: '5px 8px', borderRadius: 4, margin: '4px 0', wordBreak: 'break-word' }}>{st.formula}</div>}
                        <div>{st.desc}</div>
                      </div>
                    ))}
                    <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}><b style={{ color: 'var(--ink)' }}>Límites:</b> {WEIGHTING_REFS[k].caveat}</p>
                    <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 3, fontSize: 12, color: 'var(--ink)', lineHeight: 1.45 }}>
                      {WEIGHTING_REFS[k].apa.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                </details>
              );
            })}
          </div>
        )}

        {/* Botones de Acción */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', paddingTop: 10, borderTop: '1px solid var(--line)' }}>
          <button
            type="button"
            className="btn sm"
            onClick={copyCitation}
            style={{ fontWeight: 600 }}
          >
            Copiar {FORMAT_LABELS[format]}
          </button>
          <a
            href={method.doiUrl}
            target="_blank"
            rel="noreferrer"
            className="btn primary sm"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            Abrir la fuente original ↗
          </a>
        </div>
      </div>

      <style jsx global>{`
        @keyframes toastSlideDown {
          from {
            opacity: 0;
            transform: translate(-50%, -16px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
      `}</style>
    </div>
  );
}
