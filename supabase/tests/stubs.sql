-- Sustitutos mínimos de lo que Supabase ya trae (roles, auth, storage) para poder correr las
-- migraciones y las pruebas de RLS en un PostgreSQL local vacío. NO se aplica a Supabase real.
do $$ begin
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb default '{}'::jsonb, last_sign_in_at timestamptz, banned_until timestamptz, email_confirmed_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text,
  owner uuid, metadata jsonb, unique (bucket_id, name));
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $$;

grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant select on auth.users to authenticated;
grant all on all tables in schema storage to authenticated, service_role;
grant select on storage.buckets to anon, authenticated;
-- Como Supabase: lo que crea `postgres` en public queda accesible a los roles de la API (RLS decide).
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;
