-- Reemplaza el chequeo por email hardcodeado de admin_stats() (20240101000007_admin_stats.sql)
-- por una columna de rol en profiles. A partir de aquí, ningún archivo del repo vuelve a
-- mencionar el correo del docente: quién es admin vive solo como dato en la base.
--
-- Esta migración NO siembra ningún admin — eso queda a propósito fuera de git (ver README,
-- Historial de cambios). Tras correr esto, otórgate el rol a mano, una sola vez, en el SQL Editor:
--   update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'TU-EMAIL');

alter table public.profiles add column if not exists role text not null default 'user' check (role in ('user', 'admin'));

create or replace function public.admin_stats() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  is_admin boolean;
begin
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') into is_admin;
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

-- Deja promover un segundo admin (p.ej. un co-instructor) sin volver a tocar SQL a mano: solo
-- un admin YA existente puede llamarla, así el primer admin sigue teniendo que sembrarse fuera
-- de git (arriba), pero los siguientes no.
create or replace function public.promote_to_admin(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare
  caller_is_admin boolean;
  target_id uuid;
begin
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') into caller_is_admin;
  if not caller_is_admin then
    raise exception 'no autorizado';
  end if;

  select id into target_id from auth.users where email = p_email;
  if target_id is null then
    raise exception 'no existe una cuenta con ese correo';
  end if;

  update public.profiles set role = 'admin' where id = target_id;
end $$;

revoke all on function public.admin_stats() from public;
revoke all on function public.promote_to_admin(text) from public;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.promote_to_admin(text) to authenticated;
