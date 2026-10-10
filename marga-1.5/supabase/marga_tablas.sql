-- Marga 2.5 en Supabase (proyecto ehyqexzaauvjoioafqdz, el mismo de Alex y del
-- catálogo). Cada colección de Firestore pasa a una tabla `marga_*` con forma de
-- documento: `data` guarda el registro tal cual lo escribía la app, así que los
-- campos que se agregan sin migrar siguen funcionando igual que en Firestore.
--
-- Acceso: igual que las reglas abiertas de Firestore, la llave pública puede
-- leer y escribir estas tablas (Marga tiene su propio login). Las tablas de
-- Alex y del catálogo no se tocan.
--
-- Aplicada con el MCP de Supabase como migración `marga_tablas`.

create or replace function public.marga_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'marga_clients', 'marga_users', 'marga_citas', 'marga_buro_autorizaciones',
    'marga_comisiones', 'marga_cotizaciones', 'marga_notificaciones', 'marga_config'
  ] loop
    execute format(
      'create table if not exists public.%I (
         id text primary key,
         data jsonb not null default ''{}''::jsonb,
         updated_at timestamptz not null default now()
       )', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists marga_app on public.%I', t);
    execute format(
      'create policy marga_app on public.%I for all to anon, authenticated using (true) with check (true)', t);
    execute format('drop trigger if exists marga_updated_at on public.%I', t);
    execute format(
      'create trigger marga_updated_at before update on public.%I
         for each row execute function public.marga_touch()', t);
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Solo estas tablas pueden pasar por las funciones genéricas de abajo.
create or replace function public.marga_tabla(t text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if t not in (
    'marga_clients', 'marga_users', 'marga_citas', 'marga_buro_autorizaciones',
    'marga_comisiones', 'marga_cotizaciones', 'marga_notificaciones', 'marga_config'
  ) then
    raise exception 'Tabla no permitida: %', t;
  end if;
  return t;
end $$;

-- Equivalente a un writeBatch de updateDoc: mezcla cada `patch` sobre el
-- documento (primer nivel, como updateDoc) y falla todo si alguno no existe.
-- items = [{ "id": "...", "patch": { ... } }, ...]
create or replace function public.marga_patch_many(t text, items jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  item jsonb;
  n int;
begin
  for item in select * from jsonb_array_elements(items) loop
    execute format('update public.%I set data = data || $1 where id = $2', public.marga_tabla(t))
      using item->'patch', item->>'id';
    get diagnostics n = row_count;
    if n = 0 then
      raise exception 'No existe el documento % en %', item->>'id', t;
    end if;
  end loop;
end $$;

-- Equivalente a un writeBatch de setDoc: reemplaza (o crea) cada documento.
-- rows = [{ "id": "...", ...campos }, ...]
create or replace function public.marga_set_many(t text, rows jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format(
    'insert into public.%I (id, data)
       select r->>''id'', r from jsonb_array_elements($1) r
     on conflict (id) do update set data = excluded.data', public.marga_tabla(t))
    using rows;
end $$;

-- Equivalente a setDoc con { merge: true } para los documentos únicos de
-- configuración: crea el documento si no existe y mezcla el primer nivel.
create or replace function public.marga_merge(t text, doc_id text, patch jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format(
    'insert into public.%I as d (id, data) values ($1, $2)
     on conflict (id) do update set data = d.data || excluded.data', public.marga_tabla(t))
    using doc_id, patch;
end $$;

create or replace function public.marga_delete_many(t text, ids text[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('delete from public.%I where id = any($1)', public.marga_tabla(t)) using ids;
end $$;

-- Borra el cliente y sus comisiones en una sola transacción, para no dejar
-- comisiones huérfanas sumando en la nómina si la conexión se corta.
create or replace function public.marga_delete_client(client_id text, comision_ids text[])
returns void
language sql
set search_path = ''
as $$
  delete from public.marga_comisiones where id = any(comision_ids);
  delete from public.marga_clients where id = client_id;
$$;

grant execute on function
  public.marga_patch_many(text, jsonb),
  public.marga_set_many(text, jsonb),
  public.marga_merge(text, text, jsonb),
  public.marga_delete_many(text, text[]),
  public.marga_delete_client(text, text[])
to anon, authenticated;
