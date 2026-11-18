-- Apropiación de un cliente desde Chatwoot, Marga o Telegram (proyecto ehyqexzaauvjoioafqdz). 2026-11-17.
-- Requiere alex_turnos.sql (alex_turnos, alex_etiquetas_vendedor, alex_contacto_por_etiqueta).
--
-- Tres formas de decir "ya le escribí", y cada una deja las otras al día:
--   1. Etiqueta del vendedor en Chatwoot  → contacto en Marga (alex_contacto_por_etiqueta, ya existía).
--   2. Burbuja de WhatsApp / "Le escribí" en Marga → etiqueta en Chatwoot (espejo: alex_espejo_pendientes /
--      alex_espejo_hecho, los usa el flujo n8n "Marga - Contacto por etiqueta de Chatwoot" cada 2 min).
--   3. Botón "✅ Ya le escribí" del aviso de Telegram → contacto en Marga (alex_toma_crear / alex_toma_usar);
--      el espejo pone después la etiqueta en Chatwoot.
-- Solo service_role ejecuta estas funciones.

-- Etiqueta de Chatwoot de cada vendedor.
create or replace function public.alex_etiqueta_de(p_vendedor text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(coalesce(p_vendedor, '')) like '%alejandro%' then 'alejandro'
    when lower(coalesce(p_vendedor, '')) ~ '(emmanuel|emanuel|bernal)' then 'emmanuel'
  end
$$;

-- Registra un contacto en la tarjeta (mismo formato que el botón "Le escribí" de Marga).
create or replace function public.alex_registrar_contacto(p_id text, p_vendedor text, p_via text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_d jsonb;
  v_ahora bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  select data into v_d from public.marga_clients where id = p_id for update;
  if v_d is null then
    return null;
  end if;
  update public.marga_clients
     set data = data || jsonb_build_object(
           'contacto', jsonb_build_object(
             'primeroEn', coalesce((v_d->'contacto'->>'primeroEn')::bigint, v_ahora),
             'ultimoEn', v_ahora,
             'ultimoTipo', 'whatsapp',
             'ultimoPor', p_vendedor,
             'veces', coalesce((v_d->'contacto'->>'veces')::int, 0) + 1,
             'via', p_via),
           'updatedAt', v_ahora)
   where id = p_id;
  return jsonb_build_object('id', p_id, 'ultimoEn', v_ahora);
end $$;

-- ---------------------------------------------------------------- espejo Marga → Chatwoot
create table if not exists public.alex_espejo (
  conversation_id text primary key,
  vendedor        text not null,
  contacto_en     bigint not null,
  hecho_en        timestamptz not null default now()
);
alter table public.alex_espejo enable row level security;
revoke all on public.alex_espejo from anon, authenticated;

-- Contactos registrados fuera de Chatwoot (Marga o Telegram) en los últimos 2 días, cuya etiqueta
-- todavía no se puso. Solo tarjetas con conversación de Chatwoot (las de Alex).
create or replace function public.alex_espejo_pendientes()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('conv', conv, 'vendedor', vend, 'etiqueta', etiqueta, 'contacto_en', en)), '[]'::jsonb)
    from (
      select c.data->>'conversationId' as conv,
             c.data->'contacto'->>'ultimoPor' as vend,
             public.alex_etiqueta_de(c.data->'contacto'->>'ultimoPor') as etiqueta,
             (c.data->'contacto'->>'ultimoEn')::bigint as en
        from public.marga_clients c
       where c.data->>'origen' = 'alex'
         and coalesce(c.data->>'conversationId', '') ~ '^\d+$'
         and c.data->'contacto'->>'via' is distinct from 'etiqueta_chatwoot'
         and (c.data->'contacto'->>'ultimoEn')::bigint > (extract(epoch from now() - interval '2 days') * 1000)::bigint
         and public.alex_etiqueta_de(c.data->'contacto'->>'ultimoPor') is not null
         and not exists (select 1 from public.alex_espejo e
                          where e.conversation_id = c.data->>'conversationId'
                            and e.contacto_en >= (c.data->'contacto'->>'ultimoEn')::bigint)
       order by en desc
       limit 20) s
$$;

-- Marca como hechas las etiquetas que el flujo ya puso en Chatwoot. También las anota como "ya vistas"
-- para que el lector de etiquetas no las tome como nuevas.
create or replace function public.alex_espejo_hecho(p jsonb)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v jsonb;
  n int := 0;
begin
  for v in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    continue when coalesce(v->>'conv', '') = '' or coalesce(v->>'vendedor', '') = '';
    insert into public.alex_espejo (conversation_id, vendedor, contacto_en)
    values (v->>'conv', v->>'vendedor', coalesce((v->>'contacto_en')::bigint, 0))
    on conflict (conversation_id) do update
      set vendedor = excluded.vendedor, contacto_en = excluded.contacto_en, hecho_en = now();
    insert into public.alex_etiquetas_vendedor (conversation_id, vendedor) values (v->>'conv', v->>'vendedor')
    on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- botón de Telegram
create table if not exists public.alex_tomas (
  token           uuid primary key default gen_random_uuid(),
  conversation_id text not null,
  vendedor        text not null,
  creado_en       timestamptz not null default now(),
  usado_en        timestamptz
);
alter table public.alex_tomas enable row level security;
revoke all on public.alex_tomas from anon, authenticated;

-- Lo llama el aviso de Telegram antes de enviarse: devuelve el token del botón (o null si el vendedor no
-- es uno de los que tienen etiqueta en Chatwoot).
create or replace function public.alex_toma_crear(p_conversation_id text, p_vendedor text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_vend text := case public.alex_etiqueta_de(p_vendedor) when 'alejandro' then 'Alejandro Acosta'
                                                          when 'emmanuel' then 'Emmanuel Bernal' end;
  v_token uuid;
begin
  if v_vend is null or coalesce(p_conversation_id, '') !~ '^\d+$' then
    return jsonb_build_object('token', null);
  end if;
  insert into public.alex_tomas (conversation_id, vendedor) values (p_conversation_id, v_vend) returning token into v_token;
  return jsonb_build_object('token', v_token, 'vendedor', v_vend);
end $$;

-- GET: solo lee. POST (p_usar = true): registra el contacto una vez. Los botones valen 7 días.
create or replace function public.alex_toma_usar(p_token uuid, p_usar boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  t public.alex_tomas;
  v_id text;
  v_nombre text;
  v_secc text;
begin
  select * into t from public.alex_tomas where token = p_token for update;
  if not found or t.creado_en < now() - interval '7 days' then
    return jsonb_build_object('ok', false, 'error', 'Este botón ya no es válido.');
  end if;
  select id, btrim(coalesce(data->>'firstName', '') || ' ' || coalesce(data->>'lastName', '')), data->>'section'
    into v_id, v_nombre, v_secc
    from public.marga_clients
   where id = 'alex-' || t.conversation_id or data->>'conversationId' = t.conversation_id
   order by (id = 'alex-' || t.conversation_id) desc
   limit 1;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'No encontré la tarjeta de este cliente en Marga.');
  end if;
  if t.usado_en is not null then
    return jsonb_build_object('ok', true, 'cambio', false, 'cliente', v_nombre, 'vendedor', t.vendedor,
      'mensaje', 'Ya estaba registrado.');
  end if;
  if not coalesce(p_usar, false) then
    return jsonb_build_object('ok', true, 'cambio', false, 'pendiente', true, 'cliente', v_nombre, 'vendedor', t.vendedor,
      'conversacion', t.conversation_id);
  end if;
  perform public.alex_registrar_contacto(v_id, t.vendedor, 'telegram');
  update public.alex_tomas set usado_en = now() where token = p_token;
  return jsonb_build_object('ok', true, 'cambio', true, 'cliente', v_nombre, 'vendedor', t.vendedor,
    'mensaje', 'Listo: en Marga ya aparece que le escribiste, y en unos minutos se pone tu etiqueta en Chatwoot.');
end $$;

revoke all on function public.alex_etiqueta_de(text), public.alex_registrar_contacto(text, text, text),
  public.alex_espejo_pendientes(), public.alex_espejo_hecho(jsonb), public.alex_toma_crear(text, text),
  public.alex_toma_usar(uuid, boolean) from public, anon, authenticated;
grant execute on function public.alex_espejo_pendientes(), public.alex_espejo_hecho(jsonb),
  public.alex_toma_crear(text, text), public.alex_toma_usar(uuid, boolean) to service_role;
