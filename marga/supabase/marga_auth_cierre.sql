-- Marga con Supabase Auth — fase B (CIERRE). Proyecto ehyqexzaauvjoioafqdz.
--
-- Aplicar SOLO cuando:
--   1. marga_auth_base.sql está aplicada y las Edge Functions marga-auth y
--      marga-usuarios están desplegadas;
--   2. la versión de Marga con login por Supabase Auth está publicada;
--   3. Braulio (admin) ya entró una vez con la versión nueva (cuenta migrada).
--
-- Después de esto la llave pública ya no lee ni escribe nada de Marga. Los
-- demás usuarios se migran solos en su primer login (su hash vive en
-- marga_legacy_passwords). Alex 3.2 escribe con service_role: no le afecta.

-- ---------------------------------------------------------------------------
-- Tablas de documentos: solo miembros con sesión.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'marga_clients', 'marga_citas', 'marga_buro_autorizaciones',
    'marga_comisiones', 'marga_cotizaciones', 'marga_notificaciones', 'marga_config'
  ] loop
    execute format('drop policy if exists marga_app on public.%I', t);
    execute format('drop policy if exists marga_miembros on public.%I', t);
    execute format(
      'create policy marga_miembros on public.%I for all to authenticated
         using (public.marga_es_miembro()) with check (public.marga_es_miembro())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Usuarios: todos los miembros leen; cada quien edita su propio registro (foto)
-- y el admin cualquiera. Altas y bajas solo por la Edge Function marga-usuarios.
-- ---------------------------------------------------------------------------
drop policy if exists marga_app on public.marga_users;
drop policy if exists marga_users_leer on public.marga_users;
drop policy if exists marga_users_editar on public.marga_users;
create policy marga_users_leer on public.marga_users for select to authenticated
  using (public.marga_es_miembro());
create policy marga_users_editar on public.marga_users for update to authenticated
  using (public.marga_rol() = 'admin' or auth_id = auth.uid())
  with check (public.marga_rol() = 'admin' or auth_id = auth.uid());
revoke all on public.marga_users from anon;
revoke insert, delete on public.marga_users from authenticated;
grant select, update on public.marga_users to authenticated;

-- El hash ya no vive en el documento (está en marga_legacy_passwords).
update public.marga_users set data = data - 'passwordHash' where data ? 'passwordHash';

-- Nadie con sesión normal cambia su propio rol, su nombre ni su auth_id, y el
-- documento nunca vuelve a guardar un hash.
-- Sin security definer a propósito: `current_user` es quien llama
-- (authenticated desde la app; service_role desde las Edge Functions y el
-- servidor de los agentes; postgres en migraciones).
create or replace function public.marga_users_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.data := new.data - 'passwordHash';
  if tg_op = 'UPDATE' and current_user in ('authenticated', 'anon') then
    new.auth_id := old.auth_id;
    if coalesce(public.marga_rol(), '') <> 'admin' and (
         new.data->>'role' is distinct from old.data->>'role'
      or new.data->>'username' is distinct from old.data->>'username') then
      raise exception 'Solo un administrador cambia nombre o rol.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists marga_users_guard on public.marga_users;
create trigger marga_users_guard
  before insert or update on public.marga_users
  for each row execute function public.marga_users_guard();

-- La versión vieja ya no existe: el respaldo del hash por trigger sobra.
drop trigger if exists marga_users_sync_legacy on public.marga_users;

-- ---------------------------------------------------------------------------
-- Funciones genéricas (security invoker: las políticas de arriba aplican).
-- ---------------------------------------------------------------------------
revoke execute on function
  public.marga_patch_many(text, jsonb),
  public.marga_set_many(text, jsonb),
  public.marga_merge(text, text, jsonb),
  public.marga_delete_many(text, text[]),
  public.marga_delete_client(text, text[])
from public, anon;
grant execute on function
  public.marga_patch_many(text, jsonb),
  public.marga_set_many(text, jsonb),
  public.marga_merge(text, text, jsonb),
  public.marga_delete_many(text, text[]),
  public.marga_delete_client(text, text[])
to authenticated, service_role;

revoke all on function public.marga_users_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Créditos de Dinamo: los ven los miembros; los escribe solo el servidor.
-- ---------------------------------------------------------------------------
drop policy if exists dinamo_creditos_leer on public.dinamo_creditos;
create policy dinamo_creditos_leer on public.dinamo_creditos for select to authenticated
  using (public.marga_es_miembro());
grant select on public.dinamo_creditos to authenticated;
