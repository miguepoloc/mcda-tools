-- Último acceso de cada usuario, para el backoffice (solo profiles.role = 'admin', vía is_admin()).
--
-- No hay tabla ni columna nuevas: Supabase Auth ya guarda auth.users.last_sign_in_at. Es un
-- SECURITY DEFINER porque `authenticated` no puede leer auth.users completo. Ojo con lo que mide:
-- last_sign_in_at cambia cuando la persona INICIA sesión (contraseña, enlace, OAuth), no cuando
-- su sesión se renueva sola. Alguien que sigue con la sesión abierta días puede aparecer con un
-- «último acceso» viejo aunque use la plataforma; es el último login, no la última actividad.
-- null = nunca ha iniciado sesión (cuenta creada pero sin confirmar, o invitada y sin usar).

create or replace function public.admin_users_activity() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'no autorizado'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'email', u.email, 'nombre', pr.full_name,
             'creado', pr.created_at, 'ultimo_acceso', u.last_sign_in_at
           ) order by u.last_sign_in_at desc nulls last, pr.created_at desc)
      from auth.users u join public.profiles pr on pr.id = u.id
  ), '[]'::jsonb);
end $$;

revoke all on function public.admin_users_activity() from public, anon;
grant execute on function public.admin_users_activity() to authenticated;
