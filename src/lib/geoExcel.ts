/* eslint-disable @typescript-eslint/no-explicit-any */
// Excel de resumen de un mapa de aptitud: pesos, reglas, superficies por clase y datos del área.
// Valores (no fórmulas vivas): el cálculo píxel a píxel no cabe en una hoja; lo reproducible está
// en el GeoTIFF y en la receta JSON del paquete.
import { DIR_TEXT } from './geo/classes.ts';

export type GeoSummary = {
  title: string; objective: string; date: string; crs: string; resM: number; width: number; height: number;
  cr: number; nExperts: number; weightsOrigin: string;
  /** `weight` = peso del panel; `effective` = reescalado entre los criterios con mapa (los que de verdad se combinan). */
  criteria: { name: string; weight: number; effective?: number; layer: string; rule: string; veto: string }[];
  /** Cortes de 3 clases (formato histórico); si hay `ranges` mandan estos. */
  thresholds?: { alta: number; media: number };
  /** Qué significa un valor alto: ausente = 'suitability'. */
  direction?: 'suitability' | 'risk';
  /** Rango (0–1, [from, to)) de cada clase evaluada, de menor a mayor índice. */
  ranges?: { label: string; from: number; to: number }[];
  classes: { label: string; ha: number; pct: number }[];
  /** Celdas evaluables con dato incompleto (un criterio sin dato se omite y los pesos se reescalan en esa celda). */
  coverage?: { valid: number; partial: number; none: number } | null;
  layers: { key: string; label: string; role: string; origin: string; source: string; unit: string; min: number; max: number }[];
  /** Ranking de puntos ya ordenado (puesto null = no evaluado). Ausente o vacío = sin hoja «Puntos». */
  points?: { rank: number | null; name: string; lat: number; lon: number; pct: number | null; classLabel: string; state: string }[];
  /** Texto del orden: «Más apto primero» / «Mayor riesgo primero». */
  pointsOrder?: string;
  /** Filas ya armadas de la hoja «Escenarios» (solo valores; ver `scenarioRows`). Ausente o vacío = sin hoja. */
  scenarioRows?: (string | number)[][];
  /** Resumen por zonas ya ordenado. Ausente = sin hoja «Zonas». `meanPct`/`classPct` null = sin área evaluada (celda vacía, nunca 0). */
  zones?: {
    layer: string; order: string; classNames: string[]; extremeName?: string;
    rows: { name: string; meanPct: number | null; ha: number; exclHa: number; classPct: (number | null)[]; points: number; pop?: { byClass: number[]; evaluated: number; notEvaluated: number; extremePct: number | null } }[];
  };
};

export function buildGeoWorkbook(XLSX: any, s: GeoSummary) {
  const wb = XLSX.utils.book_new();
  const risk = s.direction === 'risk';
  const T = DIR_TEXT[risk ? 'risk' : 'suitability'];
  const add = (name: string, rows: (string | number)[][], widths: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  add('Resumen', [
    [`${T.mapTitle} (AHP + SIG)`], [],
    ['Proyecto', s.title], ['Objetivo', s.objective], ['Fecha', s.date], [],
    ['Sistema de coordenadas', s.crs], ['Resolución (m)', s.resM], ['Tamaño de la grilla (px)', `${s.width} × ${s.height}`], [],
    ['Pesos', s.weightsOrigin], ['Expertos con juicios', s.nExperts], ['Razón de consistencia (CR)', s.nExperts ? Number(s.cr.toFixed(4)) : 'n/a'],
    ['Interpretación del CR', !s.nExperts ? 'Sin juicios de expertos: pesos iguales' : s.cr >= 0.1 ? 'CR ≥ 0.10: juicios inconsistentes, los pesos NO son confiables' : 'CR < 0.10: consistencia aceptable (Saaty)'], [],
    ['Dirección del índice', s.direction === 'risk' ? 'Riesgo: un valor alto es más riesgo (peor)' : 'Aptitud: un valor alto es más apto (mejor)'],
    ...(s.ranges?.length
      ? s.ranges.map((r, i, a) => [`Clase «${r.label}» (índice %)`, `${Math.round(r.from * 100)} – ${Math.round(r.to * 100)}${i === a.length - 1 ? ' (incl.)' : ' (excl.)'}`])
      : s.thresholds ? [['Umbral clase alta (≥ %)', Math.round(s.thresholds.alta * 100)], ['Umbral clase moderada (≥ %)', Math.round(s.thresholds.media * 100)]] : []),
    ...(s.coverage && s.coverage.valid ? [['Celdas con dato incompleto', `${s.coverage.partial.toLocaleString('es-CO')} de ${s.coverage.valid.toLocaleString('es-CO')} (${((100 * s.coverage.partial) / s.coverage.valid).toFixed(1)} %): se calculan con los criterios que sí tienen dato`]] : []),
    [], ['Nota', risk
      ? 'Índice de riesgo 0–100 (suma ponderada de los riesgos parciales). Un veto fuerza el índice al máximo y la celda se rotula «condición crítica». No es una probabilidad.'
      : 'Índice de idoneidad 0–100 (suma ponderada de las idoneidades parciales, con vetos). No es una probabilidad.'],
  ], [30, 90]);
  add('Criterios', [['Criterio', 'Peso del panel', 'Peso efectivo', 'Capa', risk ? 'Regla de riesgo' : 'Regla de idoneidad', 'Veto'], ...s.criteria.map((c) => [c.name, Number(c.weight.toFixed(6)), Number((c.effective ?? 0).toFixed(6)), c.layer, c.rule, c.veto]), [], ['Suma de pesos', Number(s.criteria.reduce((a, c) => a + c.weight, 0).toFixed(6)), Number(s.criteria.reduce((a, c) => a + (c.effective ?? 0), 0).toFixed(6))], ['Nota', 'El peso efectivo reescala los pesos de los criterios que tienen mapa para que sumen 1; un criterio sin mapa no entra al cálculo.']], [38, 14, 14, 30, 70, 24]);
  add('Superficie por clase', [['Clase', 'Hectáreas', '% del área evaluada'], ...s.classes.map((c) => [c.label, Number(c.ha.toFixed(2)), Number(c.pct.toFixed(2))])], [26, 16, 22]);
  add('Capas', [['Clave', 'Nombre', 'Papel', 'Cómo se derivó', 'Archivo', 'Unidad', 'Mín', 'Máx'], ...s.layers.map((l) => [l.key, l.label, l.role, l.origin, l.source, l.unit, Number(l.min.toFixed(4)), Number(l.max.toFixed(4))])], [16, 32, 14, 28, 34, 8, 12, 12]);
  if (s.points?.length) {
    add('Puntos', [
      [`Ranking de puntos · ${s.pointsOrder ?? ''}`.replace(/ · $/, '')], [],
      ['Puesto', 'Nombre', 'Latitud', 'Longitud', risk ? 'Índice de riesgo (0–100)' : 'Índice de idoneidad (0–100)', 'Clase', 'Estado'],
      // Los puntos sin evaluar llevan celdas vacías (nunca 0): no tienen puesto ni índice.
      ...s.points.map((p) => [p.rank ?? '', p.name, Number(p.lat.toFixed(6)), Number(p.lon.toFixed(6)), p.pct ?? '', p.classLabel, p.state]),
      [],
      ['Nota', 'Valores calculados al exportar (no son fórmulas vivas). Cada punto toma el índice de la celda del mapa donde cae; empates comparten puesto (1, 2, 2, 4). Excluido, fuera del área o sin dato = sin puesto ni índice.'],
    ], [9, 30, 12, 12, 24, 22, 24]);
  }
  if (s.zones?.rows.length) {
    const z = s.zones;
    const hasPop = z.rows.some((r) => r.pop);
    add('Zonas', [
      [`Resumen por zonas · ${z.layer}${z.order ? ` · ${z.order}` : ''}`], [],
      ['Zona', risk ? 'Riesgo medio (0–100)' : 'Idoneidad media (0–100)', 'ha evaluadas', 'ha en exclusión', ...z.classNames.map((n) => `% ${n}`), 'Puntos',
        ...(hasPop ? [...z.classNames.map((n) => `Personas ${n}`), 'Personas evaluadas', 'Personas sin evaluar', `% personas en «${z.extremeName ?? ''}»`] : []), 'Estado'],
      // Una zona sin área evaluada lleva celdas vacías (nunca 0 %): se rotula «Sin área evaluada».
      ...z.rows.map((r) => {
        const has = r.meanPct !== null;
        return [
          r.name, has ? Number((r.meanPct as number).toFixed(2)) : '', has ? Number(r.ha.toFixed(2)) : '', Number(r.exclHa.toFixed(2)),
          ...r.classPct.map((p) => (p === null ? '' : Number(p.toFixed(2)))), r.points,
          ...(hasPop ? (r.pop ? [...r.pop.byClass.map((v) => Math.round(v)), Math.round(r.pop.evaluated), Math.round(r.pop.notEvaluated), r.pop.extremePct === null ? '' : Number(r.pop.extremePct.toFixed(2))] : [...z.classNames.map(() => ''), '', '', '']) : []),
          has ? 'Evaluada' : 'Sin área evaluada',
        ];
      }),
      [],
      ['Nota', 'Valores calculados al exportar (no son fórmulas vivas). Cada celda pertenece a la zona que contiene su centro; solo cuentan las celdas evaluadas (exclusión y fuera del área no cuentan como 0 %). El índice medio es el promedio simple de esas celdas.'],
      ...(hasPop ? [['Población', 'La población de cada polígono se asigna entera a la celda de su centroide (el total se conserva; un polígono que cruza varias celdas cuenta en una sola).']] : []),
    ], [28, 18, 14, 14, ...z.classNames.map(() => 14), 9, ...(hasPop ? [...z.classNames.map(() => 14), 16, 18, 22] : []), 20]);
  }
  if (s.scenarioRows && s.scenarioRows.length > 2) add('Escenarios', s.scenarioRows, [34, 26, 16, 26, 60, 24]);
  return wb;
}

export async function downloadGeoExcelBytes(s: GeoSummary): Promise<Uint8Array> {
  const XLSX = (await import('xlsx-js-style')).default as any;
  const out = XLSX.write(buildGeoWorkbook(XLSX, s), { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Uint8Array(out);
}
