// Texto de orientación de los 7 métodos y de las 3 formas de pesar criterios, un solo lugar para que la portada,
// el asistente «¿Qué método uso?» y el formulario «Nuevo proyecto» digan lo mismo. Las referencias APA de los
// métodos de ranking viven en METHOD_SPECS (ScientificMethodModal.tsx) y las de ponderación en references.ts;
// aquí solo hay lenguaje llano para quien está aprendiendo MCDA, sin prometer nada que la plataforma no calcule.
import type { Method, WeightingMethod } from './types.ts';

export type Family = 'pares' | 'dist' | 'out' | 'saw' | 'fuzzy';

/** Nombre de la familia y su variable de color (definida en globals.css como --fam-*). */
export const FAMILY: Record<Family, string> = {
  pares: 'Comparación por pares',
  dist: 'Distancia al ideal',
  out: 'Sobreclasificación',
  saw: 'Suma ponderada',
  fuzzy: 'Distancia difusa al ideal',
};

export type MethodGuide = {
  key: Method;
  label: string;
  family: Family;
  /** Una frase: qué hace. */
  what: string;
  /** Con qué datos se alimenta. */
  input: string;
  /** Cuándo conviene. */
  when: string;
  /** Qué hay que tener presente (límite honesto). */
  watch: string;
  /** Forma del resultado. */
  result: string;
};

export const METHOD_GUIDE: Record<Method, MethodGuide> = {
  ahp: {
    key: 'ahp', label: 'AHP', family: 'pares',
    what: 'Comparas cada par de alternativas (y cada par de criterios): cuánto más importa uno que el otro, en la escala 1–9 de Saaty. El método deriva los pesos y el ranking, y te avisa si te contradijiste (CR).',
    input: 'Juicios de expertos por pares; no hace falta ningún dato numérico.',
    when: 'Las alternativas se valoran por criterio experto o no tienen una medida objetiva, y son pocas (hasta unas 9).',
    watch: 'Las comparaciones crecen rápido con cada alternativa nueva, y los juicios deben ser consistentes (CR < 0.10).',
    result: 'Ranking completo con pesos y razón de consistencia.',
  },
  topsis: {
    key: 'topsis', label: 'TOPSIS', family: 'dist',
    what: 'Con datos reales por criterio, mide qué tan cerca está cada alternativa de una combinación ideal y qué tan lejos de la peor combinación posible.',
    input: 'Matriz de decisión con un número por alternativa y criterio.',
    when: 'Tienes datos cuantitativos y quieres un ranking completo con un argumento geométrico fácil de explicar.',
    watch: 'Es compensatorio: una nota muy buena en un criterio puede tapar una muy mala en otro.',
    result: 'Ranking completo por coeficiente de cercanía (0 a 1).',
  },
  vikor: {
    key: 'vikor', label: 'VIKOR', family: 'dist',
    what: 'Como TOPSIS, pero busca una solución de compromiso: evita alternativas que queden muy mal en un solo criterio, aunque sumen bien en total.',
    input: 'Matriz de decisión numérica y el parámetro v (peso de la mayoría frente al pesar individual).',
    when: 'Hay partes con intereses en conflicto y te importa que la elegida no deje a nadie muy perjudicado.',
    watch: 'Si no se cumplen las dos condiciones de Opricovic y Tzeng, el resultado es un conjunto de compromiso (varias alternativas), no un ganador único. El orden depende de v.',
    result: 'Ranking por Q (con S y R) o conjunto de compromiso.',
  },
  promethee: {
    key: 'promethee', label: 'PROMETHEE', family: 'out',
    what: 'Compara cada par de alternativas directamente, criterio por criterio, y arma el ranking con las preferencias netas (flujos Φ).',
    input: 'Matriz de decisión numérica.',
    when: 'Quieres que una diferencia pequeña pese poco y una grande pese mucho, en vez de comparar solo «gana / pierde».',
    watch: 'La plataforma usa PROMETHEE II con la función de preferencia lineal (tipo III) y el rango de cada criterio como umbral, como en el curso.',
    result: 'Ranking completo por flujo neto Φ.',
  },
  electre: {
    key: 'electre', label: 'ELECTRE', family: 'out',
    what: 'Construye una relación de superación entre alternativas y puede decir honestamente que dos no son comparables, en vez de forzar un orden.',
    input: 'Matriz de decisión numérica y los umbrales de concordancia (c*) y discordancia (d*).',
    when: 'No quieres que un buen valor compense uno inaceptable: si una alternativa pierde por mucho en un criterio (discordancia alta), no puede superar a la otra.',
    watch: 'No entrega un ranking: entrega un grafo de superación con posibles incomparables. Los umbrales los eliges tú.',
    result: 'Grafo de superación y núcleo (puede tener varias alternativas: no siempre hay un ganador único).',
  },
  saw: {
    key: 'saw', label: 'SAW', family: 'saw',
    what: 'El método más simple: normaliza los datos (mín–máx) y suma criterio a criterio con sus pesos. Transparente, rápido y fácil de explicar.',
    input: 'Matriz de decisión numérica.',
    when: 'Necesitas un resultado que cualquiera pueda auditar con una hoja de cálculo, o una primera aproximación antes de métodos más finos.',
    watch: 'Compensatorio y sensible a los valores extremos de cada criterio (los usa para normalizar).',
    result: 'Ranking completo por puntaje ponderado.',
  },
  fuzzy_topsis: {
    key: 'fuzzy_topsis', label: 'Fuzzy TOPSIS', family: 'fuzzy',
    what: 'Cuando los datos son inciertos o subjetivos, evalúas con etiquetas (Muy mala → Muy buena) y el método maneja la imprecisión con números difusos triangulares.',
    input: 'Una etiqueta lingüística por alternativa y criterio (VP, P, F, G, VG); no números.',
    when: 'Solo tienes percepciones («buena», «regular»…) y quieres que la imprecisión quede en el modelo, no escondida en un número inventado.',
    watch: 'Las etiquetas se traducen a números difusos fijos (escala de Chen, 2000); dos personas pueden leer «Regular» distinto.',
    result: 'Ranking completo por coeficiente de cercanía difuso.',
  },
};

export const METHOD_ORDER: Method[] = ['ahp', 'topsis', 'vikor', 'promethee', 'electre', 'saw', 'fuzzy_topsis'];

/** Ayuda para elegir cómo pesar los criterios (solo aplica cuando el método no es AHP: AHP siempre pesa por pares). */
export type WeightingGuide = {
  key: WeightingMethod;
  label: string;
  short: string;
  when: string;
  needs: string;
};

export const WEIGHTING_GUIDE: Record<WeightingMethod, WeightingGuide> = {
  ahp: {
    key: 'ahp', label: 'AHP (expertos)', short: 'Juicios por pares',
    when: 'Los pesos deben reflejar lo que le importa a quien decide: tienes expertos o decisores que pueden opinar qué criterio pesa más.',
    needs: 'Un panel de expertos (pestaña Expertos).',
  },
  critic: {
    key: 'critic', label: 'CRITIC', short: 'Contraste y correlación de los datos',
    when: 'No tienes expertos a mano, o quieres un respaldo objetivo. Premia los criterios que separan bien las alternativas y que no repiten lo que ya dice otro criterio.',
    needs: 'La matriz de decisión llena (con varias alternativas).',
  },
  entropy: {
    key: 'entropy', label: 'Entropía de Shannon', short: 'Dispersión de los datos',
    when: 'Igual que CRITIC pero más simple: pesa más los criterios cuyos valores más se diferencian entre alternativas. Útil cuando los criterios son poco correlacionados.',
    needs: 'La matriz de decisión llena, con valores positivos y varias alternativas.',
  },
};

export const WEIGHTING_ORDER: WeightingMethod[] = ['ahp', 'critic', 'entropy'];

/** Validadores para los parámetros de `/dashboard?new_method=…&new_weighting=…`. */
export const isMethod = (v: string | null | undefined): v is Method => !!v && v in METHOD_GUIDE;
export const isWeighting = (v: string | null | undefined): v is WeightingMethod => v === 'ahp' || v === 'critic' || v === 'entropy';
