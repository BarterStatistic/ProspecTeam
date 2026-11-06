-- Avisos de Marga fuera de la app + orden de pila de Prospectos.
-- Proyecto ehyqexzaauvjoioafqdz. Aplicada como migración `marga_avisos`.
--
-- 1. `llegoAColumna`: cada vez que una tarjeta cambia de columna (la mueva la
--    app, Alex o la bandeja de Dinamo) se sella la hora; Prospectos se ordena
--    con eso como pila (lo más reciente arriba).
-- 2. Suscripciones push por dispositivo (`marga_push_subs`), escritas solo por
--    las funciones `marga_push_suscribir` / `marga_push_baja`.
-- 3. `marga_avisar`: trigger que manda cada cambio de columna y cada cita
--    nueva o reagendada a la Edge Function `marga-avisos` (pg_net), que decide
--    a quién avisar (supabase/functions/_shared/avisosLogic.js).
--
-- Los secretos (llaves VAPID, secreto del trigger, URL de n8n) se cargan a
-- mano en `marga_avisos_config`; no van en el repo.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Llegada a la columna
-- ---------------------------------------------------------------------------
create or replace function public.marga_llegada()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ahora bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if tg_op = 'INSERT' then
    if not (new.data ? 'llegoAColumna') then
      new.data := new.data || jsonb_build_object('llegoAColumna', coalesce(new.data->'createdAt', to_jsonb(v_ahora)));
    end if;
  elsif (new.data->>'section', new.data->>'stage') is distinct from (old.data->>'section', old.data->>'stage')
        and new.data->'llegoAColumna' is not distinct from old.data->'llegoAColumna' then
    -- Lo movió alguien que no sella (Alex, Dinamo): se sella aquí.
    new.data := new.data || jsonb_build_object('llegoAColumna', v_ahora);
  end if;
  return new;
end $$;

drop trigger if exists marga_llegada on public.marga_clients;
create trigger marga_llegada
  before insert or update on public.marga_clients
  for each row execute function public.marga_llegada();

-- ---------------------------------------------------------------------------
-- 2. Configuración y suscripciones
-- ---------------------------------------------------------------------------
create table if not exists public.marga_avisos_config (
  id int primary key default 1 check (id = 1),
  funcion_url text,
  secreto text,
  vapid_public text,
  vapid_private text,
  vapid_subject text default 'mailto:prospectteamaa@gmail.com',
  telegram_webhook text, -- URL del webhook de n8n + '#' + token
  telegram_token text    -- opcional: si se pone, se usa la API de Telegram directo
);
alter table public.marga_avisos_config enable row level security;
revoke all on public.marga_avisos_config from public, anon, authenticated;

create table if not exists public.marga_push_subs (
  endpoint text primary key,
  usuario_id text not null references public.marga_users(id) on delete cascade,
  subscription jsonb not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists marga_push_subs_usuario on public.marga_push_subs (usuario_id);
alter table public.marga_push_subs enable row level security;
revoke all on public.marga_push_subs from public, anon, authenticated;

-- Registra (o reasigna) este dispositivo al usuario con sesión. Un mismo
-- teléfono que cambia de cuenta deja de recibir los avisos de la anterior.
create or replace function public.marga_push_suscribir(sub jsonb, ua text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario text := public.marga_usuario_id();
begin
  if v_usuario is null then
    raise exception 'Sin sesión de Marga' using errcode = '42501';
  end if;
  if coalesce(sub->>'endpoint', '') !~ '^https://' then
    raise exception 'Suscripción inválida';
  end if;
  insert into public.marga_push_subs (endpoint, usuario_id, subscription, user_agent)
  values (sub->>'endpoint', v_usuario, sub, left(coalesce(ua, ''), 300))
  on conflict (endpoint) do update
    set usuario_id = excluded.usuario_id, subscription = excluded.subscription,
        user_agent = excluded.user_agent, created_at = now();
end $$;

create or replace function public.marga_push_baja(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.marga_push_subs
   where endpoint = p_endpoint and usuario_id = public.marga_usuario_id();
$$;

-- ¿Este dispositivo ya está suscrito para el usuario con sesión?
create or replace function public.marga_push_activo(p_endpoint text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.marga_push_subs
     where endpoint = p_endpoint and usuario_id = public.marga_usuario_id()
  );
$$;

revoke all on function public.marga_push_suscribir(jsonb, text), public.marga_push_baja(text),
  public.marga_push_activo(text) from public, anon;
grant execute on function public.marga_push_suscribir(jsonb, text), public.marga_push_baja(text),
  public.marga_push_activo(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Disparo hacia la Edge Function
-- ---------------------------------------------------------------------------
create or replace function public.marga_avisar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secreto text;
  v_antes jsonb;
begin
  if tg_table_name = 'marga_clients' then
    if tg_op = 'UPDATE' and (new.data->>'section', new.data->>'stage')
         is not distinct from (old.data->>'section', old.data->>'stage') then
      return null;
    end if;
    if tg_op = 'UPDATE' then
      v_antes := jsonb_build_object('section', old.data->>'section', 'stage', old.data->>'stage');
    end if;
  elsif tg_table_name = 'marga_citas' then
    if tg_op = 'UPDATE' and new.data->'fechaCita' is not distinct from old.data->'fechaCita' then
      return null;
    end if;
    if tg_op = 'UPDATE' then
      v_antes := jsonb_build_object('fechaCita', old.data->'fechaCita');
    end if;
  else
    return null;
  end if;

  select funcion_url, secreto into v_url, v_secreto from public.marga_avisos_config where id = 1;
  if v_url is null or v_secreto is null then
    return null;
  end if;

  -- Asíncrono: pg_net encola la petición y la escritura no espera ni falla.
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('tabla', tg_table_name, 'op', tg_op, 'antes', v_antes, 'data', new.data),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-marga-secreto', v_secreto),
    timeout_milliseconds := 10000
  );
  return null;
end $$;

revoke all on function public.marga_avisar(), public.marga_llegada() from public, anon, authenticated;

drop trigger if exists marga_avisar on public.marga_clients;
create trigger marga_avisar
  after insert or update on public.marga_clients
  for each row execute function public.marga_avisar();

drop trigger if exists marga_avisar on public.marga_citas;
create trigger marga_avisar
  after insert or update on public.marga_citas
  for each row execute function public.marga_avisar();
