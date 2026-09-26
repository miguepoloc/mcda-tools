-- Panel admin (solo el docente): una función security definer que agrega conteos globales.
-- Sigue el mismo patrón que expert_get/public_get (20240101000001_init.sql): la función revisa
-- por sí misma quién puede usarla, en vez de exponer una policy de RLS que lea todo. No se toca
-- ninguna tabla ni policy existente: RLS sigue exigiendo owner_id = auth.uid() para el resto de
-- la app, esta función es la única puerta que agrega across-owner, y solo devuelve números.

create or replace function public.admin_stats() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  is_admin boolean;
begin
  select auth.email() = 'REDACTED_EMAIL' into is_admin;
  if not is_admin then
    raise exception 'no autorizado';
  end if;

  return jsonb_build_object(
    'proyectos_total', (select count(*) from public.projects),
    'proyectos_publicos', (select count(*) from public.projects where is_public),
    'proyectos_privados', (select count(*) from public.projects where not is_public),
    'usuarios_total', (select count(*) from public.profiles),
    'expertos_total', (select count(*) from public.experts),
    'expertos_pending', (select count(*) from public.experts where status = 'pending'),
    'expertos_in_progress', (select count(*) from public.experts where status = 'in_progress'),
    'expertos_submitted', (select count(*) from public.experts where status = 'submitted'),
    'criterios_total', (select coalesce(sum(jsonb_array_length(criteria)), 0) from public.projects),
    'alternativas_total', (select coalesce(sum(jsonb_array_length(alternatives)), 0) from public.projects),
    'juicios_total', (select count(*) from public.judgments)
  );
end $$;

revoke all on function public.admin_stats() from public;
grant execute on function public.admin_stats() to authenticated;
