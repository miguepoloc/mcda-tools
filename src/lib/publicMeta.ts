import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { socialText } from '@/lib/embed';

/** Título y objetivo de un proyecto público para las vistas previas (Open Graph / Twitter / imagen). Usa `public_get`
 * (liviana: no trae el mapa) y solo conserva título y objetivo; un token inválido o privado → null. Nunca lanza. */
export const publicProjectInfo = cache(async (token: string): Promise<{ title: string; objective: string; spatial: boolean } | null> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('public_get', { p_token: token });
    if (error || !data) return null;
    const p = (data as { project?: { title?: unknown; objective?: unknown; method?: unknown; criteria?: unknown; alternatives?: unknown; decision_matrix?: unknown } }).project;
    if (!p || typeof p.title !== 'string' || !p.title) return null;
    // Un mapa de aptitud no tiene alternativas ni matriz de decisión: se distingue de un proyecto de decisión por eso.
    const spatial = !(Array.isArray(p.alternatives) && p.alternatives.length > 0) && !(p.decision_matrix && typeof p.decision_matrix === 'object' && Object.keys(p.decision_matrix).length > 0);
    return { title: p.title, objective: typeof p.objective === 'string' ? p.objective : '', spatial };
  } catch {
    return null;
  }
});

export async function publicSocial(token: string) {
  const info = await publicProjectInfo(token);
  return { info, ...socialText(info) };
}
