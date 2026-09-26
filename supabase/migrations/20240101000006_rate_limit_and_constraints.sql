-- Plataforma MCDA: límite de frecuencia (rate limit) en las funciones públicas por token, y
-- longitud máxima en los campos de texto libre que no tenían ninguna cota.
-- Motivación: auditoría de seguridad (20 sep 2026) — expert_get/expert_save/expert_submit/public_get
-- son alcanzables por cualquiera con el token (sin cuenta), sin ningún límite de solicitudes por
-- minuto; y projects.title/objective y experts.name/role_desc no tenían tope de tamaño en la base
-- de datos (solo truncado cosmético en la UI), lo que permite guardar texto arbitrariamente largo.

-- ───────────────────────── Rate limit ─────────────────────────

create table if not exists public.rate_limit_log (
  id bigint generated always as identity primary key,
  rl_key text not null,
  called_at timestamptz not null default now()
);
create index if not exists rate_limit_log_key_idx on public.rate_limit_log (rl_key, called_at);
alter table public.rate_limit_log enable row level security;
-- Sin políticas: nadie hace select/insert directo a esta tabla, solo las funciones de abajo (SECURITY DEFINER).

-- Registra una llamada bajo p_key y lanza una excepción si hay más de p_max en la ventana p_window.
-- Poda su propio historial viejo en cada llamada, así no crece sin límite.
create or replace function public._rate_limit(p_key text, p_max int, p_window interval)
returns void language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  delete from public.rate_limit_log where called_at < now() - p_window;
  insert into public.rate_limit_log (rl_key) values (p_key);
  select count(*) into cnt from public.rate_limit_log where rl_key = p_key and called_at >= now() - p_window;
  if cnt > p_max then
    raise exception 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.';
  end if;
end $$;
revoke all on function public._rate_limit(text, int, interval) from public;

create or replace function public.expert_get(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.experts%rowtype;
  p public.projects%rowtype;
  j jsonb;
begin
  perform public._rate_limit('expert_get:' || p_token, 60, interval '1 minute');
  select * into e from public.experts where invite_token = p_token;
  if not found then return null; end if;
  select * into p from public.projects where id = e.project_id;
  select coalesce(jsonb_agg(jsonb_build_object('sheet', sheet, 'pair_key', pair_key, 'value', value)), '[]'::jsonb)
    into j from public.judgments where expert_id = e.id;
  return jsonb_build_object(
    'expert', jsonb_build_object('name', e.name, 'role_desc', e.role_desc, 'status', e.status),
    'project', jsonb_build_object('title', p.title, 'objective', p.objective,
                                  'criteria', p.criteria, 'alternatives', p.alternatives,
                                  'method', coalesce(p.method, 'ahp')),
    'judgments', j);
end $$;

create or replace function public.expert_save(p_token text, p_sheet text, p_pair text, p_value int)
returns void language plpgsql security definer set search_path = public as $$
declare e public.experts%rowtype;
begin
  perform public._rate_limit('expert_save:' || p_token, 240, interval '1 minute');
  select * into e from public.experts where invite_token = p_token;
  if not found then raise exception 'enlace no válido'; end if;
  if e.status = 'submitted' then raise exception 'las respuestas ya fueron enviadas'; end if;
  if p_sheet is null or p_pair is null or length(p_sheet) > 80 or length(p_pair) > 80 then
    raise exception 'datos no válidos';
  end if;
  if p_sheet <> 'crit' and p_sheet not like 'alt:%' then raise exception 'hoja no válida'; end if;
  if p_value is null then
    delete from public.judgments where expert_id = e.id and sheet = p_sheet and pair_key = p_pair;
  else
    if p_value < -8 or p_value > 8 then raise exception 'valor fuera de rango'; end if;
    if (select count(*) from public.judgments where expert_id = e.id) >= 3000 then
      raise exception 'demasiados juicios';
    end if;
    insert into public.judgments (expert_id, sheet, pair_key, value)
    values (e.id, p_sheet, p_pair, p_value)
    on conflict (expert_id, sheet, pair_key) do update set value = excluded.value;
  end if;
  if e.status = 'pending' then
    update public.experts set status = 'in_progress' where id = e.id;
  end if;
end $$;

create or replace function public.expert_submit(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._rate_limit('expert_submit:' || p_token, 10, interval '1 minute');
  update public.experts
     set status = 'submitted', submitted_at = now()
   where invite_token = p_token;
  if not found then raise exception 'enlace no válido'; end if;
end $$;

create or replace function public.public_get(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.projects%rowtype;
begin
  perform public._rate_limit('public_get:' || p_token, 60, interval '1 minute');
  select * into p from public.projects where public_token = p_token and is_public;
  if not found then return null; end if;
  return jsonb_build_object(
    'project', jsonb_build_object('title', p.title, 'objective', p.objective,
                                  'criteria', p.criteria, 'alternatives', p.alternatives,
                                  'method', coalesce(p.method, 'ahp'),
                                  'decision_matrix', p.decision_matrix,
                                  'weighting_method', coalesce(p.weighting_method, 'ahp')),
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

-- ───────────────────────── Longitud máxima en texto libre ─────────────────────────
-- Antes solo se truncaba en la UI (cosmético); sin tope en la base, un cliente sin pasar por la UI
-- normal podía guardar texto arbitrariamente largo (abultamiento de almacenamiento, no inyección:
-- React escapa al renderizar y las consultas ya son parametrizadas).

alter table public.projects drop constraint if exists projects_title_len;
alter table public.projects add constraint projects_title_len check (char_length(title) <= 300);

alter table public.projects drop constraint if exists projects_objective_len;
alter table public.projects add constraint projects_objective_len check (char_length(objective) <= 5000);

alter table public.experts drop constraint if exists experts_name_len;
alter table public.experts add constraint experts_name_len check (char_length(name) <= 200);

alter table public.experts drop constraint if exists experts_role_desc_len;
alter table public.experts add constraint experts_role_desc_len check (char_length(role_desc) <= 300);
