/** Informe ejecutivo de un proyecto de mapa (R2): arma el CONTENIDO del documento (secciones, tablas, textos) a partir de
 * `GeoSummary` —el mismo objeto que alimenta el Excel— y del resumen AHP. Es lógica pura: ninguna cifra se recalcula, solo
 * se formatea. El componente `GeoReportModal` lo pinta y el navegador lo imprime a PDF. Los expertos van sin nombre. */
import type { GeoSummary } from '../geoExcel.ts';
import { buildGeoMethodologyParagraph } from '../methodologyText.ts';
import { CITATION_DATA } from '../citation.ts';
import { APP_DOI, APP_DOI_URL, APP_FULL_NAME, APP_RELEASE_TAG, APP_VERSION } from '../version.ts';
import type { AhpSummary } from './ahpSummary.ts';
import { fmtDateEs, fmtNum, fmtPct, legendRows } from './compose.ts';
import { DIR_TEXT } from './classes.ts';

export type ReportTable = {
  caption?: string;
  head: string[];
  rows: string[][];
  /** Columnas numéricas (alineadas a la derecha), por índice. */
  numeric?: number[];
  note?: string;
};
export type ReportSection = {
  id: 'objective' | 'weights' | 'rules' | 'map' | 'classes' | 'zones' | 'points' | 'methodology' | 'citation';
  title: string;
  paragraphs: string[];
  tables: ReportTable[];
};
export type GeoReport = {
  title: string;
  subtitle: string;
  date: string;
  dateLong: string;
  meta: [string, string][];
  banners: { tone: 'warn' | 'info'; text: string }[];
  sections: ReportSection[];
  version: { version: string; tag: string; doi: string; doiUrl: string; fullName: string };
};

export type GeoReportInput = {
  summary: GeoSummary;
  ahp: AhpSummary | null;
  /** Pesos explorados a mano (no son los del panel). */
  exploring?: boolean;
  /** Datos de ejemplo cargados desde un paquete / botón de ejemplo. */
  exampleData?: boolean;
  /** Hay mapa compuesto que insertar. */
  hasMap?: boolean;
  weightMethod?: 'eigenvector' | 'mean';
};

const CATEGORY_LABEL = { 'very-low': 'muy bajo', low: 'bajo', moderate: 'moderado', high: 'alto', 'very-high': 'muy alto' } as const;
const CR_LIMIT = 0.1;
const dash = '—';

/** Cifras que ya salen de la UI (porcentajes 0–100 con 1 decimal, hectáreas sin decimales cuando son grandes). */
const ha = (x: number) => fmtNum(x, x >= 100 ? 0 : 1);

export function buildGeoReport(inp: GeoReportInput): GeoReport {
  const s = inp.summary;
  const T = DIR_TEXT[s.direction === 'risk' ? 'risk' : 'suitability'];
  const risk = s.direction === 'risk';
  const nClasses = s.ranges?.length ?? s.classes.length - 1;
  const hasExperts = s.nExperts > 0;
  const crBad = hasExperts && s.cr >= CR_LIMIT;

  const banners: GeoReport['banners'] = [];
  if (inp.exampleData) banners.push({ tone: 'warn', text: 'DATOS DE EJEMPLO. Este mapa se construyó con un caso de ejemplo de la plataforma: no corresponde a un panel de expertos ni a una decisión reales y este documento no debe presentarse como tal.' });
  if (inp.exploring) banners.push({ tone: 'warn', text: 'PESOS EXPLORADOS A MANO. Los pesos de este informe no son los del panel de expertos: son un escenario de exploración.' });
  if (crBad) banners.push({ tone: 'warn', text: `Los juicios de los expertos son inconsistentes (CR ${fmtNum(s.cr, 3)} ≥ 0,10): los pesos no son confiables y conviene corregirlos antes de decidir con este mapa.` });

  // --- 1. Objetivo y alcance
  const objective: ReportSection = {
    id: 'objective', title: 'Objetivo y alcance',
    paragraphs: [
      s.objective.trim() || 'El proyecto no declara un objetivo.',
      `${T.mapTitle}: ${T.indexName.toLowerCase()} de 0 a 100 (${T.meaning}) clasificado en ${nClasses} clases. Área de estudio en ${s.crs}, celdas de ${fmtNum(s.resM, 0)} m (${fmtNum(s.width, 0)} × ${fmtNum(s.height, 0)} celdas).`,
    ],
    tables: [],
  };

  // --- 2. Pesos
  const weights: ReportSection = { id: 'weights', title: 'Pesos de los criterios', paragraphs: [], tables: [] };
  weights.paragraphs.push(`Origen de los pesos: ${s.weightsOrigin}.`);
  if (hasExperts) {
    const how = (inp.ahp?.method ?? inp.weightMethod) === 'mean' ? 'promedio de columnas normalizadas' : 'eigenvector principal de Saaty';
    weights.paragraphs.push(`${s.nExperts} experto${s.nExperts === 1 ? '' : 's'} con juicios; agregación por media geométrica y pesos por ${how}.`);
    weights.paragraphs.push(`Razón de consistencia de la matriz de criterios: CR = ${fmtNum(s.cr, 4)} (${crBad ? 'NO aceptable: CR ≥ 0,10' : 'aceptable: CR < 0,10, según Saaty'}).`);
    if (inp.ahp) {
      weights.paragraphs.push(`λmax = ${fmtNum(inp.ahp.lambda, 4)}; CI = ${fmtNum(inp.ahp.ci, 4)}; RI = ${fmtNum(inp.ahp.ri, 2)}.`);
      if (inp.ahp.consensus) weights.paragraphs.push(`Consenso del panel: S* = ${fmtPct(inp.ahp.consensus.sStar * 100)} (${CATEGORY_LABEL[inp.ahp.consensus.category]}).`);
    }
  } else {
    weights.paragraphs.push('No hay juicios de expertos: todos los criterios pesan lo mismo.');
  }
  const withUnc = !!inp.ahp?.uncertainty && inp.ahp.names.length === s.criteria.length;
  weights.tables.push({
    caption: 'Peso del panel y peso efectivo por criterio',
    head: ['Criterio', 'Peso del panel', 'Peso efectivo', ...(withUnc ? ['− Δ', '+ Δ'] : [])],
    rows: s.criteria.map((c, i) => [
      c.name, fmtPct(c.weight * 100), c.layer === dash ? 'Sin mapa' : fmtPct((c.effective ?? 0) * 100),
      ...(withUnc ? [fmtPct((inp.ahp!.uncertainty!.minus[i] ?? 0) * 100), fmtPct((inp.ahp!.uncertainty!.plus[i] ?? 0) * 100)] : []),
    ]),
    numeric: withUnc ? [1, 2, 3, 4] : [1, 2],
    note: 'El peso efectivo reescala los pesos de los criterios que tienen mapa para que sumen 100 %; un criterio sin mapa no entra al cálculo.'
      + (withUnc ? ' «± Δ»: lo que puede subir o bajar cada peso al variar al azar los juicios; mide el redondeo de los juicios, no el desacuerdo entre expertos.' : ''),
  });
  if (inp.ahp && inp.ahp.experts.length > 1) {
    weights.tables.push({
      caption: 'Consistencia por experto (sin nombres)',
      head: ['Experto', 'CR', 'Estado'],
      rows: inp.ahp.experts.map((e) => [e.label, fmtNum(e.cr, 4), e.cr < CR_LIMIT ? 'Consistente' : 'Revisar (CR ≥ 0,10)']),
      numeric: [1],
    });
  }

  // --- 3. Reglas
  const rules: ReportSection = {
    id: 'rules', title: `Reglas de ${risk ? 'riesgo' : 'idoneidad'} por criterio`, paragraphs: [],
    tables: [{
      head: ['Criterio', 'Capa', risk ? 'Regla de riesgo' : 'Regla de idoneidad', 'Veto'],
      rows: s.criteria.map((c) => [c.name, c.layer, c.rule, c.veto]),
    }],
  };

  // --- 4. Mapa
  const map: ReportSection = {
    id: 'map', title: `${T.mapTitle}`,
    paragraphs: inp.hasMap
      ? [`Composición del mapa con el mapa base y las capas elegidas; leyenda de ${nClasses} clases (${T.meaning}).`]
      : ['No hay un mapa compuesto disponible: el resultado aún no se ha calculado.'],
    tables: [],
  };

  // --- 5. Área por clase
  const rows = legendRows({ classes: s.classes, ranges: s.ranges ?? [] });
  const classes: ReportSection = {
    id: 'classes', title: 'Área por clase', paragraphs: [],
    tables: [{
      head: ['Clase', `Rango del índice (0–100)`, 'Hectáreas', '% del área evaluada'],
      // `legendRows` conserva el orden de `s.classes` (de la clase más alta a la más baja y, al final, la exclusión).
      rows: s.classes.map((c, i) => {
        const r = rows[i];
        const excl = i === s.classes.length - 1 && /exclusi/i.test(c.label);
        return [c.label, excl ? dash : (r?.range || dash), ha(c.ha), excl ? dash : fmtPct(c.pct)];
      }),
      numeric: [2, 3],
      note: `${T.disclaimer} Las celdas vetadas se suman a la clase extrema (${risk ? 'la más alta' : 'la más baja'}) y la exclusión queda fuera del porcentaje.`,
    }],
  };
  if (s.coverage && s.coverage.valid) {
    classes.paragraphs.push(`Celdas con dato incompleto: ${fmtNum(s.coverage.partial, 0)} de ${fmtNum(s.coverage.valid, 0)} (${fmtPct((100 * s.coverage.partial) / s.coverage.valid)}); se calculan con los criterios que sí tienen dato.`);
  }

  const sections: ReportSection[] = [objective, weights, rules, map, classes];

  // --- 6. Zonas (+ población)
  if (s.zones?.rows.length) {
    const z = s.zones;
    const zones: ReportSection = {
      id: 'zones', title: `Resumen por zonas · ${z.layer}`,
      paragraphs: [`${z.order || ''}${z.order ? '. ' : ''}Cada celda pertenece a la zona que contiene su centro; solo cuentan las celdas evaluadas. Una zona sin celdas evaluadas se rotula «Sin área evaluada» (nunca 0 %).`],
      tables: [{
        caption: 'Índice medio y distribución por clase',
        head: ['Zona', `${risk ? 'Riesgo' : 'Idoneidad'} medio (0–100)`, 'ha evaluadas', 'ha en exclusión', ...z.classNames.map((n) => `% ${n}`), 'Puntos'],
        rows: z.rows.map((r) => {
          const has = r.meanPct !== null;
          return [r.name, has ? fmtNum(r.meanPct as number, 1) : 'Sin área evaluada', has ? ha(r.ha) : dash, ha(r.exclHa), ...r.classPct.map((p) => (p === null ? dash : fmtNum(p, 1))), String(r.points)];
        }),
        numeric: [1, 2, 3, ...z.classNames.map((_, i) => 4 + i), 4 + z.classNames.length],
      }],
    };
    if (z.rows.some((r) => r.pop)) {
      const ex = z.extremeName ?? 'la clase extrema';
      zones.tables.push({
        caption: 'Exposición de la población',
        head: ['Zona', ...z.classNames.map((n) => `Personas ${n}`), 'Evaluadas', 'Sin evaluar', `% en «${ex}»`],
        rows: z.rows.map((r) => (r.pop
          ? [r.name, ...r.pop.byClass.map((v) => fmtNum(Math.round(v), 0)), fmtNum(Math.round(r.pop.evaluated), 0), fmtNum(Math.round(r.pop.notEvaluated), 0), r.pop.extremePct === null ? dash : fmtPct(r.pop.extremePct)]
          : [r.name, ...z.classNames.map(() => dash), dash, dash, dash])),
        numeric: z.classNames.map((_, i) => 1 + i).concat([1 + z.classNames.length, 2 + z.classNames.length, 3 + z.classNames.length]),
        note: 'La población de cada polígono se asigna entera a la celda de su centroide (el total se conserva; un polígono que cruza varias celdas cuenta en una sola).',
      });
    }
    sections.push(zones);
  }

  // --- 7. Puntos
  if (s.points?.length) {
    const evaluated = s.points.filter((p) => p.rank !== null).length;
    sections.push({
      id: 'points', title: `Ranking de puntos · ${s.pointsOrder ?? ''}`.replace(/ · $/, ''),
      paragraphs: [`${s.points.length} punto${s.points.length === 1 ? '' : 's'}; ${evaluated} con puesto. Cada punto toma el índice de la celda donde cae; los empates comparten puesto (1, 2, 2, 4). Excluido, fuera del área o sin dato = «Sin puesto», sin índice (nunca 0 %).`],
      tables: [{
        head: ['Puesto', 'Nombre', 'Latitud', 'Longitud', `${T.indexName} (0–100)`, 'Clase', 'Estado'],
        rows: s.points.map((p) => [p.rank === null ? 'Sin puesto' : String(p.rank), p.name, fmtNum(p.lat, 5), fmtNum(p.lon, 5), p.pct === null ? 'Sin índice' : fmtNum(p.pct, 0), p.classLabel || dash, p.state]),
        numeric: [2, 3, 4],
      }],
    });
  }

  // --- 8. Metodología y 9. Cita
  const anyVeto = s.criteria.some((c) => c.veto && c.veto !== dash);
  const mi = {
    criteria: s.criteria.map((c) => ({ name: c.name, weight: c.weight })), expertCount: s.nExperts,
    weightMethod: inp.ahp?.method ?? inp.weightMethod, cr: hasExperts ? s.cr : undefined, exploring: inp.exploring,
    direction: risk ? 'risk' as const : 'suitability' as const, nClasses, resM: s.resM, crs: s.crs, hasExclusion: s.layers.some((l) => l.role === 'exclusion'), hasVeto: anyVeto,
  };
  sections.push({
    id: 'methodology', title: 'Metodología', tables: [],
    paragraphs: [buildGeoMethodologyParagraph(mi, 'es'), buildGeoMethodologyParagraph(mi, 'en')],
  });
  sections.push({ id: 'citation', title: 'Cómo citar', tables: [], paragraphs: [CITATION_DATA.apa.text] });

  return {
    title: s.title || 'Proyecto sin título',
    subtitle: `Informe ejecutivo · ${T.mapTitle}`,
    date: s.date, dateLong: fmtDateEs(s.date),
    meta: [
      ['Fecha', fmtDateEs(s.date)],
      ['Dirección', risk ? 'Riesgo (alto = peor)' : 'Aptitud (alto = mejor)'],
      ['Clases', String(nClasses)],
      ['Expertos', hasExperts ? String(s.nExperts) : 'Pesos iguales'],
    ],
    banners, sections,
    version: { version: APP_VERSION, tag: APP_RELEASE_TAG, doi: APP_DOI, doiUrl: APP_DOI_URL, fullName: APP_FULL_NAME },
  };
}
