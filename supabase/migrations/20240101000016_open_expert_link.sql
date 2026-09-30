-- Enlace abierto para expertos: un solo enlace/QR que cualquier persona de un grupo base puede abrir
-- para autorregistrarse (nombre + rol) en vez de que el dueño cree cada experto a mano. Al enviar el
-- formulario en /o/<token> se crea una fila normal en `experts` — de ahí en adelante es indistinguible
-- de un experto agregado a mano: el dueño la ve, edita y quita igual en la pestaña Expertos, y esa
-- persona sigue respondiendo por su propio /e/<invite_token> (open_join reutiliza expert_get/save/submit,
-- no se duplica ninguna lógica de juicios).

alter table public.projects add column if not exists open_token text unique
  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
alter table public.projects add column if not exists open_enabled boolean not null default false;

alter table public.experts add column if not exists joined_via text not null default 'owner'
  check (joined_via in ('owner', 'open'));

-- Lo que ve alguien ANTES de llenar el formulario de /o/<token>: el título del proyecto y si todavía
-- acepta inscripciones, para no hacerle escribir su nombre y rol y enterarse después de que el enlace
-- ya está cerrado. No expone nada más (ni criterios, ni expertos existentes).
create or replace function public.open_info(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.projects%rowtype;
begin
  perform public._rate_limit('open_info:' || p_token, 60, interval '1 minute');
  select * into p from public.projects where open_token = p_token and public._project_owner_ok(id);
  if not found then return null; end if;
  return jsonb_build_object('title', p.title, 'open', p.open_enabled);
end $$;

create or replace function public.open_join(p_token text, p_name text, p_role text) returns text
language plpgsql security definer set search_path = public as $$
declare
  p public.projects%rowtype;
  v_name text := trim(coalesce(p_name, ''));
  v_role text := trim(coalesce(p_role, ''));
  new_token text;
begin
  perform public._rate_limit('open_join:' || p_token, 30, interval '1 minute');
  select * into p from public.projects where open_token = p_token;
  if not found or not p.open_enabled or not public._project_owner_ok(p.id) then
    raise exception 'enlace no válido o cerrado';
  end if;
  if v_name = '' or char_length(v_name) > 200 then raise exception 'nombre no válido'; end if;
  if char_length(v_role) > 300 then raise exception 'rol no válido'; end if;
  insert into public.experts (project_id, name, role_desc, position, filled_by, joined_via)
  values (p.id, v_name, v_role, (select count(*) from public.experts where project_id = p.id), 'expert', 'open')
  returning invite_token into new_token;
  return new_token;
end $$;

revoke all on function public.open_info(text) from public;
revoke all on function public.open_join(text, text, text) from public;
grant execute on function public.open_info(text) to anon, authenticated;
grant execute on function public.open_join(text, text, text) to anon, authenticated;
