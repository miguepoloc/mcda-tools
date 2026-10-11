/** Lógica pura de la insignia de método y del botón «Compartir» de un proyecto (etiquetas, descripciones, enlace
 * público, código para incrustar y frases de «qué ve quien abra el enlace»). Sin React ni E/S: la verifica
 * `scripts/check-share-ui.ts`. Los textos de cada método salen de `METHOD_GUIDE` (el mismo de /metodo). */
import { FAMILY, METHOD_GUIDE } from './methodGuide.ts';
import type { Method } from './types.ts';

/** Variable de color de cada método (las mismas `--m-*` de las tarjetas de método y de la Comparativa). */
export const METHOD_VAR: Record<Method, string> = {
  ahp: 'var(--m-ahp)', topsis: 'var(--m-topsis)', vikor: 'var(--m-vikor)', promethee: 'var(--m-promethee)',
  electre: 'var(--m-electre)', saw: 'var(--m-saw)', fuzzy_topsis: 'var(--m-fuzzy)',
};

export type MethodBadgeInfo = { key: Method; label: string; family: string; color: string; what: string; input: string; result: string };

/** Datos de la insignia. El texto siempre lleva el nombre y la familia: el color es solo un refuerzo. */
export function methodBadge(method: Method): MethodBadgeInfo {
  const g = METHOD_GUIDE[method] ?? METHOD_GUIDE.ahp;
  return { key: g.key, label: g.label, family: FAMILY[g.family], color: METHOD_VAR[g.key], what: g.what, input: g.input, result: g.result };
}

/** «Resultados · TOPSIS», «Comparativa · TOPSIS»… */
export const methodTitle = (base: string, method: Method) => `${base} · ${methodBadge(method).label}`;

/** Enlace público de un proyecto. */
export const publicUrl = (origin: string, token: string) => `${origin}/p/${token}`;

/** Código HTML para incrustar la vista pública en otra página. El título se escapa. */
export function embedCode(url: string, title: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<iframe src="${esc(url)}" title="${esc(title || 'Proyecto MCDA')}" width="100%" height="720" style="border:0" loading="lazy"></iframe>`;
}

/** Texto de estado del enlace. */
export function shareStateText(isPublic: boolean, kind: 'decision' | 'spatial'): { label: string; detail: string } {
  if (!isPublic) return { label: 'Privado', detail: 'Solo tú ves este proyecto. Activa el enlace para que otras personas puedan verlo.' };
  return {
    label: 'Público',
    detail: kind === 'spatial'
      ? 'Cualquier persona con el enlace ve el mapa que publicaste.'
      : 'Cualquier persona con el enlace ve los resultados, solo para leer.',
  };
}

/** Qué ve el público y qué no, en frases cortas para un estudiante. */
export function publicSees(o: { kind: 'decision' | 'spatial'; method: Method; objectiveWeights: boolean; weightsLabel?: string }): { sees: string[]; hidden: string[] } {
  if (o.kind === 'spatial') {
    return {
      sees: ['El mapa de aptitud publicado, con sus clases y los pesos de los criterios.', 'Los puntos y el resumen por zonas, solo si decides mostrarlos.'],
      hidden: ['Las capas con las que construiste el mapa.', 'Los nombres de tus expertos y sus enlaces.'],
    };
  }
  const label = methodBadge(o.method).label;
  const sees: string[] = [`El ranking de las alternativas con ${label}.`, 'Los pesos de los criterios.'];
  if (o.method === 'ahp') sees.push('Qué tan consistentes son los juicios de los expertos.');
  else sees.push('La matriz de decisión con los datos de cada alternativa.');
  if (o.objectiveWeights) sees.push(`Los pesos ${o.weightsLabel ?? ''} salen solos de la matriz, sin depender de los expertos.`.replace('  ', ' '));
  const hidden = ['Los nombres de tus expertos y sus enlaces.', 'La priorización de criterios (Sesión 1).'];
  if (o.objectiveWeights) hidden.push('Los juicios de expertos que tengas guardados: con estos pesos no se usan.');
  return { sees, hidden };
}

/** Línea corta de la ventana «Compartir» según el tipo de proyecto. */
export function shareBlurb(kind: 'decision' | 'spatial'): string {
  return kind === 'spatial'
    ? 'El público ve el mapa que publicaste, no tus capas de entrada.'
    : 'El público ve el ranking, los pesos y la matriz, solo para leer. No ve a tus expertos.';
}
