/* eslint-disable @typescript-eslint/no-explicit-any */
// Excel de resumen de un mapa de aptitud: pesos, reglas, superficies por clase y datos del área.
// Valores (no fórmulas vivas): el cálculo píxel a píxel no cabe en una hoja; lo reproducible está
// en el GeoTIFF y en la receta JSON del paquete.
export type GeoSummary = {
  title: string; objective: string; date: string; crs: string; resM: number; width: number; height: number;
  cr: number; nExperts: number; weightsOrigin: string;
  /** `weight` = peso del panel; `effective` = reescalado entre los criterios con mapa (los que de verdad se combinan). */
  criteria: { name: string; weight: number; effective?: number; layer: string; rule: string; veto: string }[];
  thresholds: { alta: number; media: number };
  classes: { label: string; ha: number; pct: number }[];
  /** Celdas evaluables con dato incompleto (un criterio sin dato se omite y los pesos se reescalan en esa celda). */
  coverage?: { valid: number; partial: number; none: number } | null;
  layers: { key: string; label: string; role: string; origin: string; source: string; unit: string; min: number; max: number }[];
};

export function buildGeoWorkbook(XLSX: any, s: GeoSummary) {
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: (string | number)[][], widths: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  add('Resumen', [
    ['Mapa de aptitud (AHP + SIG)'], [],
    ['Proyecto', s.title], ['Objetivo', s.objective], ['Fecha', s.date], [],
    ['Sistema de coordenadas', s.crs], ['Resolución (m)', s.resM], ['Tamaño de la grilla (px)', `${s.width} × ${s.height}`], [],
    ['Pesos', s.weightsOrigin], ['Expertos con juicios', s.nExperts], ['Razón de consistencia (CR)', s.nExperts ? Number(s.cr.toFixed(4)) : 'n/a'],
    ['Interpretación del CR', !s.nExperts ? 'Sin juicios de expertos: pesos iguales' : s.cr >= 0.1 ? 'CR ≥ 0.10: juicios inconsistentes, los pesos NO son confiables' : 'CR < 0.10: consistencia aceptable (Saaty)'], [],
    ['Umbral clase alta (≥ %)', Math.round(s.thresholds.alta * 100)], ['Umbral clase moderada (≥ %)', Math.round(s.thresholds.media * 100)],
    ...(s.coverage && s.coverage.valid ? [['Celdas con dato incompleto', `${s.coverage.partial.toLocaleString('es-CO')} de ${s.coverage.valid.toLocaleString('es-CO')} (${((100 * s.coverage.partial) / s.coverage.valid).toFixed(1)} %): se calculan con los criterios que sí tienen dato`]] : []),
    [], ['Nota', 'Índice de idoneidad 0–100 (suma ponderada de las idoneidades parciales, con vetos). No es una probabilidad.'],
  ], [30, 90]);
  add('Criterios', [['Criterio', 'Peso del panel', 'Peso efectivo', 'Capa', 'Regla de idoneidad', 'Veto'], ...s.criteria.map((c) => [c.name, Number(c.weight.toFixed(6)), Number((c.effective ?? 0).toFixed(6)), c.layer, c.rule, c.veto]), [], ['Suma de pesos', Number(s.criteria.reduce((a, c) => a + c.weight, 0).toFixed(6)), Number(s.criteria.reduce((a, c) => a + (c.effective ?? 0), 0).toFixed(6))], ['Nota', 'El peso efectivo reescala los pesos de los criterios que tienen mapa para que sumen 1; un criterio sin mapa no entra al cálculo.']], [38, 14, 14, 30, 70, 24]);
  add('Superficie por clase', [['Clase', 'Hectáreas', '% del área evaluada'], ...s.classes.map((c) => [c.label, Number(c.ha.toFixed(2)), Number(c.pct.toFixed(2))])], [26, 16, 22]);
  add('Capas', [['Clave', 'Nombre', 'Papel', 'Cómo se derivó', 'Archivo', 'Unidad', 'Mín', 'Máx'], ...s.layers.map((l) => [l.key, l.label, l.role, l.origin, l.source, l.unit, Number(l.min.toFixed(4)), Number(l.max.toFixed(4))])], [16, 32, 14, 28, 34, 8, 12, 12]);
  return wb;
}

export async function downloadGeoExcelBytes(s: GeoSummary): Promise<Uint8Array> {
  const XLSX = (await import('xlsx-js-style')).default as any;
  const out = XLSX.write(buildGeoWorkbook(XLSX, s), { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Uint8Array(out);
}
