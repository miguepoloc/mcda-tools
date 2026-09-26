-- Cierra un escalamiento de privilegios: `profiles_self` (init) era `for all using (id = auth.uid())`,
-- así que cualquier usuario con sesión podía hacer, contra la API REST,
--     PATCH /rest/v1/profiles?id=eq.<su id>   {"role": "admin"}
-- y convertirse en admin (también podía subirse `geo_quota_mb` a 10 GB o, con la migración 15,
-- quitarse su propia suspensión). Verificado en el PostgreSQL de pruebas antes de esta migración:
-- `update public.profiles set role='admin' ... where id = auth.uid()` funcionaba como `authenticated`.
--
-- Ahora, para `authenticated`: puede LEER su propia fila y ACTUALIZAR solo `full_name`. Ni insertar
-- (lo hace el trigger handle_new_user, SECURITY DEFINER), ni borrar, ni tocar role/cohort/cuotas/estado.
-- El resto de escrituras (rol, cuota, suspensión) ya pasan por funciones SECURITY DEFINER de admin.
--
-- Va en su propia migración a propósito: es una corrección de seguridad independiente y puede
-- desplegarse sola, sin esperar a las cuentas suspendidas/desactivadas (migración 15).

drop policy if exists profiles_self on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Los privilegios por columna son la barrera real: la política decide QUÉ FILA, esto decide QUÉ COLUMNA.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;
