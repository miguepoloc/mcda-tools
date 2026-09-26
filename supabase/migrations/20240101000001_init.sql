-- Plataforma MCDA: esquema, seguridad (RLS) y funciones para enlaces de expertos y resultados públicos.
-- Ejecutar completo en Supabase > SQL Editor (o con `supabase db push`).

-- ───────────────────────── Tablas ─────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  objective text not null default '',
  -- [{id, name, hint, src}]  ids sin guiones (se usan en las claves de pares)
  criteria jsonb not null default '[]'::jsonb,
  -- [{id, name}]
  alternatives jsonb not null default '[]'::jsonb,
  -- Estado de la Parte A (priorización de criterios): candidatos, tamizaje, panel, corte
  prioritization jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  public_token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_owner_idx on public.projects(owner_id);

create table if not exists public.experts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  role_desc text not null default '',
  invite_token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'submitted')),
  filled_by text not null default 'expert' check (filled_by in ('expert', 'owner')),
  submitted_at timestamptz,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists experts_project_idx on public.experts(project_id);

-- Un juicio de Saaty por par: value en [-8, 8].
--   0 = igual; negativo = gana el primer elemento del par; positivo = gana el segundo.
--   |value| + 1 es la intensidad de Saaty (1..9).
create table if not exists public.judgments (
  expert_id uuid not null references public.experts(id) on delete cascade,
  sheet text not null,      -- 'crit' o 'alt:<id del criterio>'
  pair_key text not null,   -- '<idA>-<idB>'
  value smallint not null check (value between -8 and 8),
  updated_at timestamptz not null default now(),
  primary key (expert_id, sheet, pair_key)
);

-- ───────────────────────── Triggers ─────────────────────────

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

drop trigger if exists judgments_touch on public.judgments;
create trigger judgments_touch before update on public.judgments
  for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── Seguridad por filas (RLS) ─────────────────────────
-- Regla: cada estudiante ve y edita SOLO lo suyo. Nadie más lee estas tablas directamente.
-- Los expertos (sin cuenta) y el público entran únicamente por las funciones de abajo, con token.

alter table public.profiles  enable row level security;
alter table public.projects  enable row level security;
alter table public.experts   enable row level security;
alter table public.judgments enable row level security;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists projects_owner on public.projects;
create policy projects_owner on public.projects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists experts_owner on public.experts;
create policy experts_owner on public.experts
  for all
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

drop policy if exists judgments_owner on public.judgments;
create policy judgments_owner on public.judgments
  for all
  using (exists (
    select 1 from public.experts e join public.projects p on p.id = e.project_id
    where e.id = expert_id and p.owner_id = auth.uid()))
  with check (exists (
    select 1 from public.experts e join public.projects p on p.id = e.project_id
    where e.id = expert_id and p.owner_id = auth.uid()));

-- ───────────────────────── Funciones por token ─────────────────────────
-- SECURITY DEFINER: se ejecutan con permisos del dueño de la función, pero cada una
-- valida el token y solo devuelve/escribe lo que ese token permite.

-- Lo que ve un experto al abrir su enlace: su proyecto (sin datos de otros) y sus propios juicios.
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
    'project', jsonb_build_object('title', p.title, 'objective', p.objective,
                                  'criteria', p.criteria, 'alternatives', p.alternatives),
    'judgments', j);
end $$;

-- Guarda (o borra, si p_value es null) un juicio del experto dueño del token.
create or replace function public.expert_save(p_token text, p_sheet text, p_pair text, p_value int)
returns void language plpgsql security definer set search_path = public as $$
declare e public.experts%rowtype;
begin
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
  update public.experts
     set status = 'submitted', submitted_at = now()
   where invite_token = p_token;
  if not found then raise exception 'enlace no válido'; end if;
end $$;

-- Resultados públicos: solo si el dueño activó "público". No expone nombres de expertos
-- (solo su rol) ni el enlace de invitación ni la Parte A.
create or replace function public.public_get(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.projects%rowtype;
begin
  select * into p from public.projects where public_token = p_token and is_public;
  if not found then return null; end if;
  return jsonb_build_object(
    'project', jsonb_build_object('title', p.title, 'objective', p.objective,
                                  'criteria', p.criteria, 'alternatives', p.alternatives),
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

revoke all on function public.expert_get(text) from public;
revoke all on function public.expert_save(text, text, text, int) from public;
revoke all on function public.expert_submit(text) from public;
revoke all on function public.public_get(text) from public;
grant execute on function public.expert_get(text) to anon, authenticated;
grant execute on function public.expert_save(text, text, text, int) to anon, authenticated;
grant execute on function public.expert_submit(text) to anon, authenticated;
grant execute on function public.public_get(text) to anon, authenticated;
