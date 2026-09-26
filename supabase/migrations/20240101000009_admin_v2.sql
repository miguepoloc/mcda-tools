-- Backoffice v2: amplía admin_stats() con lo que salió de una auditoría CTO+CPO+UX (22 sep 2026,
-- ver README § Historial de cambios). Todo lo que sigue es SOLO para profiles.role = 'admin'
-- (20240101000008_admin_role.sql); nada de esto cambia RLS ni el acceso del resto de la app.
--
-- Dos columnas nuevas, a propósito, aunque hoy no cambien ningún comportamiento visible:
--   - experts.first_saved_at: se fija UNA vez, la primera vez que expert_save() mueve a alguien de
--     'pending' a 'in_progress'. Sin esto, el único proxy de "cuándo empezó a responder" sería
--     min(judgments.updated_at), que se corre hacia adelante cada vez que el experto EDITA una
--     respuesta ya dada (judgments no tiene created_at, solo updated_at) — un drift real, no cosmético.
--   - profiles.cohort: para que "crecimiento semanal" siga significando algo cuando el curso se
--     repita (hoy solo hay una cohorte activa, así que ningún query de esta migración filtra por
--     cohort todavía — existe para no tener que migrar en caliente el día que haga falta).

alter table public.experts add column if not exists first_saved_at timestamptz;
alter table public.profiles add column if not exists cohort text not null default '2026-sep-oct';

update public.experts set first_saved_at = coalesce(first_saved_at, submitted_at)
  where first_saved_at is null and status <> 'pending';

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
    update public.experts set status = 'in_progress', first_saved_at = coalesce(first_saved_at, now()) where id = e.id;
  end if;
end $$;

-- ───────────────────────── Log de acceso al backoffice ─────────────────────────
-- Mismo patrón que rate_limit_log (20240101000006): sin políticas, solo lo tocan funciones
-- SECURITY DEFINER. Relevante ahora que promote_to_admin() ya permite un segundo admin.

create table if not exists public.admin_access_log (
  id bigint generated always as identity primary key,
  admin_id uuid not null references auth.users(id) on delete cascade,
  accessed_at timestamptz not null default now()
);
create index if not exists admin_access_log_time_idx on public.admin_access_log (accessed_at desc);
alter table public.admin_access_log enable row level security;

-- ───────────────────────── admin_stats() ampliado ─────────────────────────

create or replace function public.admin_stats() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  is_admin boolean;
  result jsonb;
begin
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') into is_admin;
  if not is_admin then
    raise exception 'no autorizado';
  end if;

  insert into public.admin_access_log (admin_id) values (auth.uid());

  select jsonb_build_object(
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
    'juicios_total', (select count(*) from public.judgments),

    -- Mezcla de métodos y de ponderación elegidos (projects.method/weighting_method ya existen).
    'metodos', (
      select coalesce(jsonb_agg(jsonb_build_object('metodo', coalesce(method, 'ahp'), 'total', total) order by total desc), '[]'::jsonb)
      from (select method, count(*) as total from public.projects group by method) s
    ),
    'ponderacion', (
      select coalesce(jsonb_agg(jsonb_build_object('metodo', coalesce(weighting_method, 'ahp'), 'total', total) order by total desc), '[]'::jsonb)
      from (select weighting_method, count(*) as total from public.projects group by weighting_method) s
    ),

    -- % de expertos que el propio dueño llenó en vez de invitar a alguien externo (experts.filled_by).
    'expertos_filled_by', (
      select coalesce(jsonb_agg(jsonb_build_object('quien', filled_by, 'total', total)), '[]'::jsonb)
      from (select filled_by, count(*) as total from public.experts group by filled_by) s
    ),

    -- Embudo con tiempos: invitado -> empezó (first_saved_at) -> envió (submitted_at).
    'embudo_expertos', jsonb_build_object(
      'invitados', (select count(*) from public.experts),
      'empezaron', (select count(*) from public.experts where first_saved_at is not null or status <> 'pending'),
      'enviaron', (select count(*) from public.experts where status = 'submitted'),
      'avg_dias_invitado_a_empezar',
        (select avg(extract(epoch from (first_saved_at - created_at)) / 86400)
           from public.experts where first_saved_at is not null),
      'avg_dias_empezar_a_enviar',
        (select avg(extract(epoch from (submitted_at - first_saved_at)) / 86400)
           from public.experts where submitted_at is not null and first_saved_at is not null)
    ),

    -- Crecimiento semanal (últimas 8 semanas). judgments no tiene created_at (solo updated_at,
    -- ver comentario arriba) así que "juicios_nuevos" es un proxy: cuenta ediciones/altas por
    -- semana, no altas puras — un juicio editado dos veces en semanas distintas cuenta en ambas.
    'crecimiento_semanal', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'semana', semana,
               'usuarios', (select count(*) from public.profiles where date_trunc('week', created_at) = semana),
               'proyectos', (select count(*) from public.projects where date_trunc('week', created_at) = semana),
               'juicios', (select count(*) from public.judgments where date_trunc('week', updated_at) = semana)
             ) order by semana), '[]'::jsonb)
      from (select date_trunc('week', now()) - (n || ' weeks')::interval as semana from generate_series(7, 0, -1) n) s
    ),

    -- Proyectos con >=14 días sin tocarse y sin ningún experto que haya enviado — abandono real,
    -- no solo "viejo". Necesita identificar el proyecto/dueño para ser accionable (a propósito
    -- rompe la regla de "solo agregados" del primer admin_stats(), aprobado explícitamente).
    'proyectos_abandonados', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', p.id, 'titulo', p.title, 'dueño_email', u.email,
               'creado', p.created_at, 'actualizado', p.updated_at,
               'expertos_total', (select count(*) from public.experts e where e.project_id = p.id)
             ) order by p.updated_at asc), '[]'::jsonb)
      from public.projects p
      join auth.users u on u.id = p.owner_id
      where p.updated_at < now() - interval '14 days'
        and not exists (select 1 from public.experts e where e.project_id = p.id and e.status = 'submitted')
    ),

    -- Historial cronológico con detalle individual (aprobado explícitamente, ver README).
    'usuarios_historial', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'email', u.email, 'nombre', pr.full_name, 'creado', pr.created_at
             ) order by pr.created_at desc), '[]'::jsonb)
      from public.profiles pr join auth.users u on u.id = pr.id
    ),
    'proyectos_historial', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', p.id, 'titulo', p.title, 'dueño_email', u.email,
               'metodo', coalesce(p.method, 'ahp'), 'publico', p.is_public, 'creado', p.created_at
             ) order by p.created_at desc), '[]'::jsonb)
      from public.projects p join auth.users u on u.id = p.owner_id
    ),

    -- Picos de uso de las funciones con límite de frecuencia (20240101000006), últimas 24h, para
    -- saber si el límite (hardcodeado ahí: 60/240/10/60 por minuto) está frenando gente real.
    -- Los límites se repiten aquí a propósito para poder marcar "cerca del límite" sin otra
    -- consulta — si cambian en 20240101000006, hay que actualizarlos aquí también.
    'rate_limit_picos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'funcion', funcion, 'pico_por_minuto', pico,
               'limite', limite, 'cerca_del_limite', pico >= limite * 0.8
             ) order by funcion), '[]'::jsonb)
      from (
        select funcion, max(por_minuto) as pico,
               case funcion when 'expert_get' then 60 when 'expert_save' then 240
                             when 'expert_submit' then 10 when 'public_get' then 60 else 60 end as limite
        from (
          select split_part(rl_key, ':', 1) as funcion, date_trunc('minute', called_at) as minuto,
                 count(*) as por_minuto
          from public.rate_limit_log
          where called_at > now() - interval '24 hours'
          group by 1, 2
        ) por_min
        group by funcion
      ) picos
    ),

    -- Últimos accesos al propio backoffice (incluye el que acaba de insertar esta misma llamada).
    'accesos_recientes', (
      select coalesce(jsonb_agg(jsonb_build_object('email', u.email, 'fecha', l.accessed_at)), '[]'::jsonb)
      from (select admin_id, accessed_at from public.admin_access_log order by accessed_at desc limit 20) l
      join auth.users u on u.id = l.admin_id
    )
  ) into result;

  return result;
end $$;

-- ───────────────────────── admin_ahp_raw() ─────────────────────────
-- Judgments crudos + criteria/alternatives de cada proyecto con al menos un juicio, para que
-- src/app/admin/page.tsx corra la MISMA lógica de src/lib/ahp.ts (expertMatrix/analyze) que ya
-- usa ExpertFlow.tsx, en vez de reimplementar la iteración de eigenvector en SQL (riesgo real de
-- que los dos cálculos diverjan silenciosamente).

create or replace function public.admin_ahp_raw() returns jsonb
language plpgsql security definer set search_path = public as $$
declare is_admin boolean;
begin
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') into is_admin;
  if not is_admin then
    raise exception 'no autorizado';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'project_id', p.id,
      'criteria', p.criteria,
      'alternatives', p.alternatives,
      'judgments', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'expert_id', j.expert_id, 'sheet', j.sheet, 'pair_key', j.pair_key, 'value', j.value)), '[]'::jsonb)
        from public.judgments j join public.experts e on e.id = j.expert_id
        where e.project_id = p.id
      )
    ))
    from public.projects p
    where exists (select 1 from public.judgments j join public.experts e on e.id = j.expert_id where e.project_id = p.id)
  ), '[]'::jsonb);
end $$;

revoke all on function public.admin_stats() from public;
revoke all on function public.admin_ahp_raw() from public;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_ahp_raw() to authenticated;
