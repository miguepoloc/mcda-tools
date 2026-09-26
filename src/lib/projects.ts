// Lo que necesita el listado «Mis proyectos» para mostrar de qué trata cada uno sin abrirlo.
import type { Method, WeightingMethod } from './types.ts';

export const PROJECT_LIST_SELECT = 'id,title,objective,is_public,updated_at,kind,method,weighting_method,criteria,alternatives,geo,experts(status)';

export type ProjectListRow = {
  id: string;
  title: string;
  objective: string;
  is_public: boolean;
  updated_at?: string | null;
  kind?: 'decision' | 'spatial' | null;
  method?: Method | null;
  weighting_method?: WeightingMethod | null;
  criteria?: unknown[] | null;
  alternatives?: unknown[] | null;
  geo?: { packId?: string; layers?: Record<string, unknown> } | null;
  experts?: { status: string }[] | null;
};

export const METHOD_LABEL: Record<Method, string> = {
  ahp: 'AHP', topsis: 'TOPSIS', vikor: 'VIKOR', electre: 'ELECTRE', promethee: 'PROMETHEE', saw: 'SAW', fuzzy_topsis: 'Fuzzy TOPSIS',
};
export const WEIGHTING_LABEL: Record<WeightingMethod, string> = { ahp: 'AHP', critic: 'CRITIC', entropy: 'Entropía' };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Resumen de una fila: qué es (método o mapa SIG) y su tamaño. Solo texto, sin colores, para poder probarlo. */
export function describeProject(p: ProjectListRow) {
  const spatial = p.kind === 'spatial';
  const method = p.method ?? 'ahp';
  const nCrit = p.criteria?.length ?? 0;
  const nAlt = p.alternatives?.length ?? 0;
  const experts = p.experts ?? [];
  const answered = experts.filter((e) => e.status === 'submitted').length;
  const kind = spatial ? 'Mapa de aptitud (SIG)' : METHOD_LABEL[method];
  const weights = !spatial && method !== 'ahp' && p.weighting_method && p.weighting_method !== 'ahp' ? `pesos ${WEIGHTING_LABEL[p.weighting_method]}` : '';
  const size = [plural(nCrit, 'criterio', 'criterios')];
  if (spatial) size.push(p.geo?.packId ? 'paquete del curso' : plural(Object.keys(p.geo?.layers ?? {}).length, 'capa', 'capas'));
  else size.push(plural(nAlt, 'alternativa', 'alternativas'));
  const people = experts.length ? `${plural(experts.length, 'experto', 'expertos')} · ${answered} ${answered === 1 ? 'respondió' : 'respondieron'}` : 'sin expertos';
  return { spatial, method, kind, weights, size, people };
}
