// Referencias de los métodos de PONDERACIÓN de criterios (AHP, CRITIC, Entropía) y referencias fundacionales adicionales de los
// métodos de ranking, en un solo lugar para que la pestaña de resultados, el informe ejecutivo y el modal científico citen lo
// mismo. Las citas «principales» de los métodos de ranking (TOPSIS, VIKOR…) viven en METHOD_SPECS (ScientificMethodModal.tsx).
//
// Regla de autenticidad (la misma del curso): cada entrada de este archivo se verificó contra la bibliografía del curso
// (03_Bibliografia_general/: bibliografia_ampliada_mcdm.md y sus PDF) o contra Crossref (DOI, volumen, número y páginas).
// No se agrega ninguna referencia que no esté en una de las dos fuentes. Lo que difiere entre fuentes se anota junto a la entrada.
import type { WeightingMethod } from './types.ts';

export type CiteFormat = 'ieee' | 'apa' | 'bibtex' | 'chicago';

export type Person = { family: string; /** «T. L.», con puntos y espacios. */ initials: string };

/** Referencia estructurada: de ella salen los cuatro formatos, así no se desincronizan entre sí. */
export type Ref = {
  id: string;
  kind: 'article' | 'book';
  authors: Person[];
  year: number;
  title: string;
  /** Revista (artículos). */
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  /** Artículos en dos entregas (Shannon, 1948): el segundo número y sus páginas. */
  part2?: { issue: string; pages: string };
  publisher?: string;
  place?: string;
  edition?: string;
  /** Colección o serie, tal como la da la fuente. */
  series?: string;
  doi?: string;
  url?: string;
  isbn?: string;
};

const P = (family: string, initials: string): Person => ({ family, initials });

/** Catálogo. Fuente de cada una entre paréntesis: [bib] = bibliografia_ampliada_mcdm.md / PDF del curso; [crossref] = Crossref. */
export const REFS = {
  // [crossref] 10.1016/0305-0548(94)00059-H — el libro de Aznar y Guijarro (p. 56) da pp. 763-777 en el texto y 763-771 en su lista;
  // Crossref y el artículo de Pamučar et al. (2020, del curso) dan 763-770, que es lo que se usa aquí.
  diakoulaki1995: {
    id: 'diakoulaki1995', kind: 'article',
    authors: [P('Diakoulaki', 'D.'), P('Mavrotas', 'G.'), P('Papayannakis', 'L.')], year: 1995,
    title: 'Determining objective weights in multiple criteria problems: The CRITIC method',
    journal: 'Computers & Operations Research', volume: '22', issue: '7', pages: '763–770', doi: '10.1016/0305-0548(94)00059-H',
  },
  // [crossref] las dos entregas del artículo (julio y octubre de 1948). Su Crossref: 10.1002/j.1538-7305.1948.tb01338.x (parte 1).
  shannon1948: {
    id: 'shannon1948', kind: 'article', authors: [P('Shannon', 'C. E.')], year: 1948,
    title: 'A mathematical theory of communication',
    journal: 'Bell System Technical Journal', volume: '27', issue: '3', pages: '379–423', part2: { issue: '4', pages: '623–656' },
    doi: '10.1002/j.1538-7305.1948.tb01338.x',
  },
  // [bib] Aznar y Guijarro (p. 63) y Varekar & Karmakar (2015) lo citan como la fuente de la entropía de información.
  shannonWeaver1949: {
    id: 'shannonWeaver1949', kind: 'book', authors: [P('Shannon', 'C. E.'), P('Weaver', 'W.')], year: 1949,
    title: 'The mathematical theory of communication', publisher: 'University of Illinois Press', place: 'Urbana, IL',
  },
  // [bib] lista de referencias de Aznar y Guijarro (2012).
  zeleny1982: {
    id: 'zeleny1982', kind: 'book', authors: [P('Zeleny', 'M.')], year: 1982,
    title: 'Multiple criteria decision making', publisher: 'McGraw-Hill', place: 'New York',
  },
  // [bib] portada del PDF del curso: 2.ª edición, 2012, Editorial UPV, ISBN 978-84-8363-982-5. Capítulo 3: CRITIC y Entropía.
  aznarGuijarro2012: {
    id: 'aznarGuijarro2012', kind: 'book', authors: [P('Aznar Bellver', 'J.'), P('Guijarro Martínez', 'F.')], year: 2012,
    title: 'Nuevos métodos de valoración: Modelos multicriterio', edition: '2.ª ed.',
    publisher: 'Editorial Universitat Politècnica de València', place: 'Valencia', isbn: '978-84-8363-982-5',
  },
  // [bib] ul Amin et al. (2022), PDF local del curso (VIKOR–CRITIC).
  ulAmin2022: {
    id: 'ulAmin2022', kind: 'article',
    authors: [P('ul Amin', 'F.'), P('Qian-Li', 'D.'), P('Grzybowska', 'K.'), P('Ahmed', 'Z.'), P('Bo-Rui', 'Y.')], year: 2022,
    title: 'A novel fuzzy-based VIKOR–CRITIC soft computing method for evaluation of sustainable supply chain risk management',
    journal: 'Sustainability', volume: '14', issue: '5', pages: '2827', doi: '10.3390/su14052827',
  },
  // [bib] Su & Sun (2023), PDF local del curso: entropía + TOPSIS.
  suSun2023: {
    id: 'suSun2023', kind: 'article', authors: [P('Su', 'J.'), P('Sun', 'Y.')], year: 2023,
    title: 'An improved TOPSIS model based on cumulative prospect theory: Application to ESG performance evaluation of state-owned mining enterprises',
    journal: 'Sustainability', volume: '15', issue: '13', pages: '10046', doi: '10.3390/su151310046',
  },
  // [bib] Aznar y Guijarro (2012, lista de referencias) citan Saaty (1980); [crossref] no aplica a libros.
  saaty1980: {
    id: 'saaty1980', kind: 'book', authors: [P('Saaty', 'T. L.')], year: 1980,
    title: 'The Analytic Hierarchy Process: Planning, priority setting, resource allocation', publisher: 'McGraw-Hill', place: 'New York',
  },
  // [crossref] 10.1016/0377-2217(90)90057-I
  saaty1990: {
    id: 'saaty1990', kind: 'article', authors: [P('Saaty', 'T. L.')], year: 1990,
    title: 'How to make a decision: The Analytic Hierarchy Process',
    journal: 'European Journal of Operational Research', volume: '48', issue: '1', pages: '9–26', doi: '10.1016/0377-2217(90)90057-I',
  },
  // [crossref] 10.1016/S0377-2217(97)00244-0
  formanPeniwati1998: {
    id: 'formanPeniwati1998', kind: 'article', authors: [P('Forman', 'E.'), P('Peniwati', 'K.')], year: 1998,
    title: 'Aggregating individual judgments and priorities with the Analytic Hierarchy Process',
    journal: 'European Journal of Operational Research', volume: '108', issue: '1', pages: '165–169', doi: '10.1016/S0377-2217(97)00244-0',
  },
  // [crossref] 10.1016/0305-0483(83)90047-6 — es el número 3 (Crossref); bibliografia_ampliada_mcdm.md dice «11(1)», que es un error.
  beltonGear1983: {
    id: 'beltonGear1983', kind: 'article', authors: [P('Belton', 'V.'), P('Gear', 'T.')], year: 1983,
    title: "On a short-coming of Saaty's method of analytic hierarchies",
    journal: 'Omega', volume: '11', issue: '3', pages: '228–230', doi: '10.1016/0305-0483(83)90047-6',
  },
  // [bib] Roy (1968): la bibliografía del curso da «RIRO, 8, 57–75» (el 8 es el número de la revista, año 2); Chu & Nghiem (2023) y
  // Baseer et al. (2023), también del curso, dan «2, 57–75». Coinciden en 2(8), 57–75.
  roy1968: {
    id: 'roy1968', kind: 'article', authors: [P('Roy', 'B.')], year: 1968,
    title: 'Classement et choix en présence de points de vue multiples (la méthode ELECTRE)',
    journal: "Revue Française d'Informatique et de Recherche Opérationnelle", volume: '2', issue: '8', pages: '57–75',
  },
  // [bib] Zadeh (1965) — fundamento de los números difusos que usa Fuzzy TOPSIS.
  zadeh1965: {
    id: 'zadeh1965', kind: 'article', authors: [P('Zadeh', 'L. A.')], year: 1965, title: 'Fuzzy sets',
    journal: 'Information and Control', volume: '8', issue: '3', pages: '338–353', doi: '10.1016/S0019-9958(65)90241-X',
  },
  // [bib] manual del curso (PDF local): modelos aditivos lineales en el cap. 6 y el apéndice 4.
  dclg2009: {
    id: 'dclg2009', kind: 'book', authors: [], year: 2009,
    title: 'Multi-criteria analysis: A manual', publisher: 'Department for Communities and Local Government', place: 'London',
  },
} satisfies Record<string, Ref>;

// ---- formatos ----

const doiUrl = (r: Ref) => (r.doi ? `https://doi.org/${r.doi}` : (r.url ?? ''));
const dash = (s: string) => s.replaceAll('–', '--');
const last = <T,>(a: T[]) => a[a.length - 1];
/** Sin autores personales (informe institucional) la editorial hace de autora. */
const corporate = (r: Ref) => (r.authors.length === 0 ? (r.publisher ?? '') : '');

function apaAuthors(a: Person[]): string {
  const p = a.map((x) => `${x.family}, ${x.initials}`);
  if (p.length <= 1) return p[0] ?? '';
  return p.length === 2 ? `${p[0]}, & ${p[1]}` : `${p.slice(0, -1).join(', ')}, & ${last(p)}`;
}
function ieeeAuthors(a: Person[]): string {
  const p = a.map((x) => `${x.initials} ${x.family}`);
  return p.length <= 2 ? p.join(' and ') : `${p.slice(0, -1).join(', ')}, and ${last(p)}`;
}
function chicagoAuthors(a: Person[]): string {
  const p = a.map((x, i) => (i === 0 ? `${x.family}, ${x.initials}` : `${x.initials} ${x.family}`));
  return p.length <= 2 ? p.join(', and ') : `${p.slice(0, -1).join(', ')}, and ${last(p)}`;
}

function apaCite(r: Ref): string {
  const who = corporate(r) ? `${corporate(r)}.` : apaAuthors(r.authors);
  if (r.kind === 'book') {
    const head = `${who} (${r.year}). ${r.title}${r.edition ? ` (${r.edition})` : ''}.`;
    const tail = [corporate(r) ? '' : `${r.publisher}.`, r.isbn ? `ISBN ${r.isbn}.` : ''].filter(Boolean).join(' ');
    return [head, tail].filter(Boolean).join(' ');
  }
  const p1 = `${r.volume}${r.issue ? `(${r.issue})` : ''}, ${r.pages}`;
  const p2 = r.part2 ? `; ${r.volume}(${r.part2.issue}), ${r.part2.pages}` : '';
  return [`${who} (${r.year}). ${r.title}. ${r.journal}, ${p1}${p2}.`, doiUrl(r)].filter(Boolean).join(' ');
}

function ieeeCite(r: Ref): string {
  const who = corporate(r) || ieeeAuthors(r.authors);
  if (r.kind === 'book') {
    const ed = r.edition ? `, ${r.edition.replace('.ª ed.', 'nd ed')}` : '';
    return `${who}, ${r.title}${ed}. ${r.place ? `${r.place}: ` : ''}${r.publisher}, ${r.year}.`;
  }
  const pp = `no. ${r.issue}, pp. ${r.pages}${r.part2 ? `, and no. ${r.part2.issue}, pp. ${r.part2.pages}` : ''}`;
  return `${who}, "${r.title}," ${r.journal}, vol. ${r.volume}, ${pp}, ${r.year}${r.doi ? `, doi: ${r.doi}` : ''}.`;
}

function chicagoCite(r: Ref): string {
  const who = corporate(r) || chicagoAuthors(r.authors);
  // las iniciales ya terminan en punto: «Roy, B.» + «.» daría «B..»
  const by = who.endsWith('.') ? who : `${who}.`;
  if (r.kind === 'book') return `${by} ${r.year}. ${r.title}. ${r.place ? `${r.place}: ` : ''}${r.publisher}.`;
  const p1 = `${r.volume}${r.issue ? ` (${r.issue})` : ''}: ${r.pages}`;
  const p2 = r.part2 ? `; ${r.volume} (${r.part2.issue}): ${r.part2.pages}` : '';
  const url = doiUrl(r);
  return `${by} ${r.year}. "${r.title}." ${r.journal} ${p1}${p2}.${url ? ` ${url}.` : ''}`;
}

function bibtexCite(r: Ref): string {
  const authors = r.authors.map((x) => `${x.family}, ${x.initials}`).join(' and ');
  const article = r.kind === 'article';
  const pages = article ? [r.pages, r.part2?.pages].filter(Boolean).map((x) => dash(x as string)).join(', ') : undefined;
  const number = r.part2 ? `${r.issue}--${r.part2.issue}` : r.issue;
  const fields: [string, string | undefined][] = [
    ['author', authors || undefined], ['title', r.title],
    ...(article
      ? ([['journal', r.journal], ['volume', r.volume], ['number', number], ['pages', pages]] as [string, string | undefined][])
      : ([['edition', r.edition], ['publisher', r.publisher], ['address', r.place], ['isbn', r.isbn]] as [string, string | undefined][])),
    ['year', String(r.year)], ['doi', r.doi],
  ];
  const body = fields.filter(([, v]) => v).map(([k, v]) => `  ${k.padEnd(9)} = {${v}}`).join(',\n');
  return `@${article ? 'article' : 'book'}{${r.id},\n${body}\n}`;
}

/** Cita de una referencia en el formato pedido (los cuatro salen de la misma entrada, no pueden desincronizarse). */
export function formatCitation(r: Ref, fmt: CiteFormat): string {
  if (fmt === 'apa') return apaCite(r);
  if (fmt === 'ieee') return ieeeCite(r);
  if (fmt === 'chicago') return chicagoCite(r);
  return bibtexCite(r);
}

export const apa = (r: Ref) => formatCitation(r, 'apa');

// ---- ponderación de criterios ----

export type WeightingRef = {
  label: string;
  /** Una frase que dice qué hace y de dónde salen los pesos. */
  how: string;
  /** Cuándo conviene (lo positivo; lo que NO hace va en `caveat`). */
  when: string;
  /** Cita corta entre paréntesis (autor, año) para el texto corrido del informe; corresponde a las referencias de `apa`. */
  cite: string;
  /** Referencias APA 7.ª: la fundacional primero. Todas se citan en el informe. */
  apa: string[];
  /** Las mismas, estructuradas (para los otros formatos de cita en el modal científico). */
  refs: Ref[];
  /** Cuándo no conviene y qué limita el resultado (para no presentarlo como «mejor» sin matices). */
  caveat: string;
};

const wr = (w: Omit<WeightingRef, 'apa'>): WeightingRef => ({ ...w, apa: w.refs.map(apa) });

export const WEIGHTING_REFS: Record<WeightingMethod, WeightingRef> = {
  ahp: wr({
    label: 'AHP (expertos)',
    cite: 'Saaty, 1980, 1990; Forman & Peniwati, 1998',
    how: 'Los pesos salen de la comparación por pares de criterios que hacen los expertos (eigenvector principal de Saaty; media geométrica entre expertos).',
    when: 'Cuando la importancia de los criterios es cuestión de juicio de quienes deciden (expertos, partes interesadas) y no se puede leer de los datos.',
    refs: [REFS.saaty1980, REFS.saaty1990, REFS.formanPeniwati1998, REFS.beltonGear1983],
    caveat: 'Refleja las preferencias del panel, no una verdad objetiva: depende de quién juzga y exige juicios consistentes (CR < 0.10). Como método de ranking completo (no solo para los pesos), agregar o quitar una alternativa puede invertir el orden de las demás (Belton & Gear, 1983).',
  }),
  critic: wr({
    label: 'CRITIC (objetivo)',
    cite: 'Diakoulaki et al., 1995; Aznar & Guijarro, 2012',
    how: 'Los pesos se calculan solos a partir de la matriz de decisión: un criterio pesa más cuanto más varía entre alternativas (desviación estándar) y cuanto menos se parece a los demás (correlación baja). No intervienen expertos.',
    when: 'Cuando no hay expertos disponibles o se quiere una ponderación reproducible desde los datos, con criterios cuantitativos que varíen entre alternativas.',
    refs: [REFS.diakoulaki1995, REFS.aznarGuijarro2012, REFS.ulAmin2022],
    caveat: 'Mide contraste de los datos, no importancia para quien decide: un criterio muy relevante pero casi igual en todas las alternativas recibe peso bajo, y uno muy correlacionado con otros también. Necesita al menos 2 alternativas y variación en los criterios. Se recalcula si cambia la matriz.',
  }),
  entropy: wr({
    label: 'Entropía de Shannon (objetivo)',
    cite: 'Shannon, 1948; Zeleny, 1982; Aznar & Guijarro, 2012',
    how: 'Los pesos se calculan solos a partir de la matriz de decisión: un criterio cuyos valores se diferencian más entre alternativas tiene menor entropía, informa más y recibe más peso. No intervienen expertos.',
    when: 'Cuando no hay expertos disponibles o se quiere una ponderación reproducible desde los datos, y la diversidad de valores entre alternativas es un buen indicio de que el criterio discrimina.',
    refs: [REFS.shannon1948, REFS.shannonWeaver1949, REFS.zeleny1982, REFS.aznarGuijarro2012, REFS.suSun2023],
    caveat: 'Mide dispersión de los datos, no importancia para quien decide; necesita valores positivos (no admite negativos) y varias alternativas. Los criterios de costo se invierten (1/x) antes de calcular las proporciones. Se recalcula si cambia la matriz.',
  }),
};

/** Los pesos objetivos (CRITIC/Entropía) no usan juicios de expertos: el flujo de expertos, CR y consenso no aplica. */
export const isObjectiveWeighting = (w: WeightingMethod | null | undefined): w is 'critic' | 'entropy' => w === 'critic' || w === 'entropy';

// ---- referencias adicionales de los métodos de ranking ----

/** Referencias fundacionales o de apoyo que complementan la cita principal de cada método en METHOD_SPECS. Solo entran las que
 * están en la bibliografía del curso (ver la regla arriba). Clave = MethodKey del modal científico. */
export const METHOD_EXTRA_REFS: Record<string, Ref[]> = {
  ahp: [REFS.saaty1980, REFS.formanPeniwati1998, REFS.beltonGear1983],
  electre: [REFS.roy1968],
  saw: [REFS.dclg2009],
  fuzzy_topsis: [REFS.zadeh1965],
};
