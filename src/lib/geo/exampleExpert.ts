import type { SupabaseClient } from '@supabase/supabase-js';
import type { Example } from './examples';

/** Si el ejemplo trae expertos (p. ej. los 4 de la encuesta de la boya), los crea ya completados en el proyecto.
 * Devuelve un mensaje de error o `null`. Fallar aquí no debe impedir abrir el proyecto: sin expertos el mapa usa pesos iguales. */
export async function seedExampleExpert(sb: SupabaseClient, projectId: string, ex: Example | null | undefined): Promise<string | null> {
  if (!ex?.experts?.length) return null;
  for (const [position, e] of ex.experts.entries()) {
    const { data, error } = await sb.from('experts').insert({
      project_id: projectId, name: e.name, role_desc: e.roleDesc, position,
      status: 'submitted', filled_by: 'owner', submitted_at: new Date().toISOString(),
    }).select('id').single();
    if (error || !data) return 'No se pudo crear un experto de ejemplo.';
    const { error: je } = await sb.from('judgments').insert(e.judgments.map((j) => ({ expert_id: data.id, sheet: 'crit', pair_key: j.key, value: j.value })));
    if (je) return 'No se pudieron guardar los juicios de un experto de ejemplo.';
  }
  return null;
}
