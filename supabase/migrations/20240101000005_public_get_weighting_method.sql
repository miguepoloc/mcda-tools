-- Plataforma MCDA: asegura que public_get retorne weighting_method para vistas públicas

create or replace function public.public_get(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.projects%rowtype;
begin
  select * into p from public.projects where public_token = p_token and is_public;
  if not found then return null; end if;
  return jsonb_build_object(
    'project', jsonb_build_object(
      'title', p.title,
      'objective', p.objective,
      'method', p.method,
      'weighting_method', coalesce(p.weighting_method, 'ahp'),
      'criteria', p.criteria,
      'alternatives', p.alternatives,
      'decision_matrix', p.decision_matrix
    ),
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
