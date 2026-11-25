-- Simula lo mínimo de Supabase (esquema auth y roles) para probar las
-- migraciones en un PostgreSQL local. No se usa en producción.
create schema if not exists auth;

-- En Supabase las extensiones (pgcrypto, etc.) viven en el esquema "extensions".
create schema if not exists extensions;

create table if not exists auth.users (
    id uuid primary key default gen_random_uuid()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
    end if;
end
$$;

grant usage on schema auth to authenticated;
grant select on auth.users to authenticated;
