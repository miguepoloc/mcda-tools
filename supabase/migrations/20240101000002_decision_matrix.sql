-- Plataforma MCDA: soporte multicriterio real (Sesión 3+ del curso).
-- Agrega a `projects` lo mínimo para que un proyecto elija cómo se ranquean las alternativas dado
-- un peso de criterios ya fijado: AHP por pares (como hasta ahora, sin cambios) o una matriz de
-- decisión cuantitativa (TOPSIS, y a futuro VIKOR/ELECTRE/PROMETHEE sobre la MISMA matriz — ver
-- plataforma/README.md § "Visión: plataforma multicriterio completa"). El paso de PESAR criterios
-- (AHP por pares vía `experts`/`judgments`, sheet='crit') no cambia con ninguno de estos métodos.
--
-- Por qué no hay una tabla nueva de "resultados": ningún método persiste su resultado, todos se
-- recalculan en el navegador a partir de los juicios/matriz guardados (mismo patrón que ya usa AHP
-- en Results.tsx). Comparar métodos entre sí es correr varias funciones puras sobre los MISMOS datos
-- de entrada, no leer filas distintas.

alter table public.projects
  add column if not exists method text not null default 'ahp' check (method in ('ahp', 'topsis')),
  -- { "values": { "<altId>": { "<critId>": number } }, "types": { "<critId>": "max" | "min" } }
  -- Igual que `criteria`/`alternatives`, se referencia por id (no por posición): reordenar o
  -- renombrar un criterio/alternativa no invalida la matriz.
  add column if not exists decision_matrix jsonb not null default '{}'::jsonb;

-- expert_get y public_get deben devolver `method` (para que el frontend sepa qué hojas de juicio
-- mostrarle al experto y qué vista de resultados armar) y public_get además `decision_matrix`
-- (dato objetivo del dueño, no hay nada de un experto que proteger ahí).

create or replace function public.expert_get(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.experts%rowtype;
  p public.projects%rowtype;
  j jsonb;
begin
  select * into e from public.experts where invite_token = p_token;
  if not found then return null; end if;
  select * into p from public.projects where id = e.project_id;
  select coalesce(jsonb_agg(jsonb_build_object('sheet', sheet, 'pair_key', pair_key, 'value', value)), '[]'::jsonb)
    into j from public.judgments where expert_id = e.id;
  return jsonb_build_object(
    'expert', jsonb_build_object('name', e.name, 'role_desc', e.role_desc, 'status', e.status),
    'project', jsonb_build_object('title', p.title, 'objective', p.objective, 'method', p.method,
                                  'criteria', p.criteria, 'alternatives', p.alternatives),
    'judgments', j);
end $$;

create or replace function public.public_get(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.projects%rowtype;
begin
  select * into p from public.projects where public_token = p_token and is_public;
  if not found then return null; end if;
  return jsonb_build_object(
    'project', jsonb_build_object('title', p.title, 'objective', p.objective, 'method', p.method,
                                  'criteria', p.criteria, 'alternatives', p.alternatives,
                                  'decision_matrix', p.decision_matrix),
    'experts', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', x.id,
               'label', coalesce(nullif(x.role_desc, ''), 'Experto ' || (x.position + 1))
             ) order by x.position, x.created_at), '[]'::jsonb)
        from public.experts x
       where x.project_id = p.id
         and exists (select 1 from public.judgments j where j.expert_id = x.id)),
    'judgments', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'expert_id', j.expert_id, 'sheet', j.sheet, 'pair_key', j.pair_key, 'value', j.value)), '[]'::jsonb)
        from public.judgments j join public.experts x on x.id = j.expert_id
       where x.project_id = p.id));
end $$;
