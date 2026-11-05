-- Marga con Supabase Auth — fase A (COMPATIBLE). Proyecto ehyqexzaauvjoioafqdz.
--
-- Después de esto la versión publicada de Marga funciona igual: las políticas
-- abiertas siguen en pie. El cierre está en marga_auth_cierre.sql y se aplica
-- cuando la versión nueva ya está publicada y Braulio entró una vez (su cuenta
-- se migra sola en ese login).
--
-- Mismo patrón que InstaTech CRM (2026-10-09): login por la Edge Function
-- `marga-auth`, cuenta de Auth con correo interno `<id>@marga.local`,
-- migración perezosa del hash SHA-256 viejo.

-- marga_users ↔ auth.users. auth_id nulo = la cuenta aún no migra.
alter table public.marga_users
  add column if not exists auth_id uuid unique references auth.users (id) on delete set null;

-- Hashes de quien no ha migrado. Sin políticas ni grants y fuera de Realtime:
-- solo la llave de servicio (Edge Functions) la lee.
create table if not exists public.marga_legacy_passwords (
  user_id       text primary key references public.marga_users (id) on delete cascade,
  password_hash text not null
);
alter table public.marga_legacy_passwords enable row level security;
revoke all on public.marga_legacy_passwords from anon, authenticated;

insert into public.marga_legacy_passwords (user_id, password_hash)
select id, data->>'passwordHash'
  from public.marga_users
 where coalesce(data->>'passwordHash', '') <> ''
on conflict (user_id) do update set password_hash = excluded.password_hash;

-- Mientras la versión vieja siga viva puede crear usuarios o cambiar
-- contraseñas: esto mantiene marga_legacy_passwords al día hasta el cierre.
create or replace function public.marga_users_sync_legacy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.auth_id is null and coalesce(new.data->>'passwordHash', '') <> '' then
    insert into public.marga_legacy_passwords (user_id, password_hash)
    values (new.id, new.data->>'passwordHash')
    on conflict (user_id) do update set password_hash = excluded.password_hash;
  end if;
  return new;
end $$;

drop trigger if exists marga_users_sync_legacy on public.marga_users;
create trigger marga_users_sync_legacy
  after insert or update of data on public.marga_users
  for each row execute function public.marga_users_sync_legacy();

-- Freno de intentos por nombre (lo escribe solo marga-auth).
create table if not exists public.marga_login_failures (
  username_key text primary key,
  failures     int not null,
  last_failure timestamptz not null
);
alter table public.marga_login_failures enable row level security;
revoke all on public.marga_login_failures from anon, authenticated;

-- Quién hace la petición. Se lee de marga_users en cada llamada (no del JWT):
-- un cambio de rol o un borrado aplica al instante.
create or replace function public.marga_usuario_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from public.marga_users u where u.auth_id = auth.uid()
$$;

create or replace function public.marga_rol()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.data->>'role' from public.marga_users u where u.auth_id = auth.uid()
$$;

create or replace function public.marga_es_miembro()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.marga_rol() is not null
$$;

revoke all on function public.marga_users_sync_legacy() from public, anon, authenticated;
revoke all on function public.marga_usuario_id(), public.marga_rol(), public.marga_es_miembro() from public, anon;
grant execute on function public.marga_usuario_id(), public.marga_rol(), public.marga_es_miembro()
  to authenticated;
