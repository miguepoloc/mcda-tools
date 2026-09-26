import type { SupabaseClient } from '@supabase/supabase-js';
import { fromLegacy, isLegacy, type Imported } from './legacy.ts';
import { parseCourseWorkbook } from './courseExcel.ts';
import { friendlyError } from './errors.ts';

/** Lee un respaldo de la herramienta HTML (.json o el .xlsx descargado, con la hoja oculta _datos) o un Excel
 * del taller de AHP (`Ejercicio.xlsx`/plantillas y sus entregas, sin _datos: ver courseExcel.ts). */
export async function parseLegacyFile(file: File): Promise<Imported | null> {
  try {
    let state: unknown = null;
    if (/\.xlsx$/i.test(file.name)) {
      const XLSX = (await import('xlsx-js-style')).default as any;
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets['_datos'];
      if (!ws) {
        const c = parseCourseWorkbook(wb);
        return c ? { ...c.imp, warnings: c.warnings } : null;
      }
      let t = '';
      for (let r = 1; ws['A' + r]; r++) t += ws['A' + r].v;
      state = JSON.parse(t);
    } else {
      state = JSON.parse(await file.text());
    }
    return isLegacy(state) ? fromLegacy(state) : null;
  } catch {
    return null;
  }
}

export async function createFromImport(
  supabase: SupabaseClient,
  ownerId: string,
  imp: Imported,
  title: string,
): Promise<{ id?: string; error?: string }> {
  const { data: proj, error } = await supabase
    .from('projects')
    .insert({
      owner_id: ownerId,
      title,
      objective: imp.objective,
      criteria: imp.criteria,
      alternatives: imp.alternatives,
      prioritization: imp.prio,
      method: imp.method,
      decision_matrix: imp.decisionMatrix,
      ...(imp.weighting ? { weighting_method: imp.weighting } : {}),
    })
    .select('id')
    .single();
  if (error || !proj) return { error: error ? friendlyError(error, 'No se pudo crear el proyecto.') : 'No se pudo crear el proyecto.' };

  const { data: exps, error: e2 } = await supabase
    .from('experts')
    .insert(
      imp.experts.map((e, i) => ({
        project_id: proj.id,
        name: e.name,
        role_desc: e.role_desc,
        position: i,
        filled_by: 'owner',
        status: imp.judgments.some((j) => j.legacyId === e.legacyId) ? 'submitted' : 'pending',
      })),
    )
    .select('id, position');
  if (e2 || !exps) return { id: proj.id, error: e2 ? friendlyError(e2, 'No se pudieron importar los expertos.') : undefined };

  const byPos = new Map(exps.map((x: { id: string; position: number }) => [x.position, x.id]));
  const rows = imp.judgments.flatMap((j) => {
    const pos = imp.experts.findIndex((e) => e.legacyId === j.legacyId);
    const expert_id = byPos.get(pos);
    return expert_id ? [{ expert_id, sheet: j.sheet, pair_key: j.pair_key, value: j.value }] : [];
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { error: e3 } = await supabase.from('judgments').insert(rows.slice(i, i + 500));
    if (e3) return { id: proj.id, error: friendlyError(e3, 'No se pudieron importar los juicios.') };
  }
  return { id: proj.id };
}
