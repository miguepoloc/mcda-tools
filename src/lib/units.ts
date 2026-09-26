import type { Criterion } from './types.ts';

/** Nombre del criterio con su unidad, «Alcance (km)»; sin unidad, solo el nombre. Un valor de la matriz (10, 0,5…) no significa nada
 * sin saber si son km o m, USD o COP, años o meses: por eso la unidad viaja con el criterio a resultados, informe y Excel. */
export const withUnit = (c: Pick<Criterion, 'name' | 'unit'>): string => {
  const u = c.unit?.trim();
  return u ? `${c.name} (${u})` : c.name;
};

/** Criterios de una matriz cuantitativa que aún no tienen unidad. */
export const missingUnits = (criteria: Criterion[]): Criterion[] => criteria.filter((c) => !c.unit?.trim());
