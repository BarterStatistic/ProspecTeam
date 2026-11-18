-- Turno del vendedor por regreso del cliente (proyecto ehyqexzaauvjoioafqdz). 2026-11-17.
--
-- Antes, "Asignar Asesor" (n8n, ALEX 3.2) calculaba el turno con la fecha en que se CREÓ la
-- conversación en Chatwoot. Un cliente que escribió el 6 de octubre en el turno de Emmanuel y
-- volvió el 17 de noviembre en el turno de Alejandro seguía siendo de Emmanuel: Alex le daba el
-- contacto de Emmanuel, el aviso de Telegram le llegaba a Emmanuel y la tarjeta seguía a su nombre.
--
-- Regla (Braulio, 2026-11-17): el vendedor se reinicia cada vez que el cliente vuelve a escribirle a
-- Alex. "Vuelve" = pasaron más de 24 horas desde su mensaje anterior. Dentro de esas 24 horas se
-- queda con quien lo atiende (así no cambia de vendedor a media plática cuando cambia el turno).
--
--   alex_turno(conv, creada_s, horas)   lo llama n8n ANTES de "Asignar Asesor". Devuelve el momento
--                                       desde el que se calcula el turno y si es un regreso.
--   alex_reasignar(conv, vendedor, nuevo)  lo llama n8n DESPUÉS: guarda el vendedor y, si es un
--                                       regreso, pasa la tarjeta de Marga al vendedor del turno, solo
--                                       si sigue en Prospectos y la creó Alex (origen 'alex'). Si un
--                                       vendedor ya la pasó a Procesos o la capturó él, no se toca.
--
-- Solo `service_role` puede ejecutarlas.

create table if not exists public.alex_turnos (
  conversation_id text primary key,
  inicio      timestamptz not null,           -- desde cuándo cuenta el turno actual
  ultimo      timestamptz not null,           -- último mensaje del cliente
  episodios   int not null default 1,         -- cuántas veces ha "vuelto"
  asesor      text,                           -- vendedor del turno actual
  asesor_antes text,                          -- vendedor del turno anterior (para revisar cambios)
  cambiado_en timestamptz
);

alter table public.alex_turnos enable row level security;
revoke all on public.alex_turnos from anon, authenticated;

create or replace function public.alex_turno(p_conversation_id text, p_creada_s bigint default null, p_horas int default 24)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_conv  text := nullif(btrim(coalesce(p_conversation_id, '')), '');
  v_ahora timestamptz := now();
  v_gap   interval := make_interval(hours => greatest(coalesce(p_horas, 24), 1));
  v_t     public.alex_turnos;
  v_creada timestamptz := case when p_creada_s > 0 then to_timestamp(p_creada_s) end;
  v_nuevo boolean;
begin
  if v_conv is null then
    raise exception 'alex_turno: falta conversation_id';
  end if;
  select * into v_t from public.alex_turnos where conversation_id = v_conv for update;
  if not found then
    -- Primera vez que se ve esta conversación con esta regla. Si se creó hace poco, es una plática
    -- en curso (cuenta desde que se creó); si es vieja, el cliente está volviendo ahora.
    v_nuevo := true;
    insert into public.alex_turnos (conversation_id, inicio, ultimo)
    values (v_conv, case when v_creada is not null and v_creada > v_ahora - v_gap then v_creada else v_ahora end, v_ahora)
    returning * into v_t;
  elsif v_ahora - v_t.ultimo > v_gap then
    v_nuevo := true;
    update public.alex_turnos set inicio = v_ahora, ultimo = v_ahora, episodios = episodios + 1
     where conversation_id = v_conv returning * into v_t;
  else
    v_nuevo := false;
    update public.alex_turnos set ultimo = v_ahora where conversation_id = v_conv returning * into v_t;
  end if;
  return jsonb_build_object(
    'inicio_s', floor(extract(epoch from v_t.inicio))::bigint,
    'nuevo', v_nuevo,
    'episodio', v_t.episodios,
    'asesor_anterior', v_t.asesor);
end $$;

create or replace function public.alex_reasignar(p_conversation_id text, p_vendedor text, p_nuevo boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_conv text := nullif(btrim(coalesce(p_conversation_id, '')), '');
  v_vend text := nullif(btrim(coalesce(p_vendedor, '')), '');
  v_ahora bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_id text;
  v_antes text;
begin
  if v_conv is null or v_vend is null then
    return jsonb_build_object('accion', 'omitida');
  end if;
  update public.alex_turnos
     set asesor_antes = case when asesor is distinct from v_vend then asesor else asesor_antes end,
         cambiado_en  = case when asesor is distinct from v_vend then now() else cambiado_en end,
         asesor = v_vend
   where conversation_id = v_conv;
  if not coalesce(p_nuevo, false) then
    return jsonb_build_object('accion', 'sin_regreso');
  end if;
  select id, data->>'createdBy' into v_id, v_antes
    from public.marga_clients
   where (id = 'alex-' || v_conv or data->>'conversationId' = v_conv)
     and data->>'section' = 'prospectos'
     and data->>'origen' = 'alex'
   order by (id = 'alex-' || v_conv) desc
   limit 1;
  if v_id is null or v_antes is not distinct from v_vend then
    return jsonb_build_object('accion', 'sin_cambio', 'id', v_id);
  end if;
  update public.marga_clients
     set data = data || jsonb_build_object(
           'createdBy', v_vend,
           'updatedAt', v_ahora,
           'reasignadoAlex', jsonb_build_object('de', v_antes, 'a', v_vend, 'cuando', v_ahora))
   where id = v_id;
  return jsonb_build_object('accion', 'reasignada', 'id', v_id, 'de', v_antes, 'a', v_vend);
end $$;

revoke all on function public.alex_turno(text, bigint, int), public.alex_reasignar(text, text, boolean) from public, anon, authenticated;
grant execute on function public.alex_turno(text, bigint, int), public.alex_reasignar(text, text, boolean) to service_role;

-- ---------------------------------------------------------------------------------------------
-- La etiqueta del vendedor en Chatwoot = ya le escribió (2026-11-17).
--
-- Los vendedores se ponen su etiqueta (alejandro / emmanuel) en el chat de Chatwoot cuando empiezan
-- a atender al cliente. El flujo n8n "Marga - Contacto por etiqueta de Chatwoot" (KjAL0LFdlADd8t9c)
-- revisa cada 2 minutos los chats con esas etiquetas (actividad de los últimos 7 días) y llama a
-- alex_contacto_por_etiqueta. Cuando aparece una etiqueta nueva de un vendedor en un cliente que en
-- Marga es SUYO (Prospectos, origen alex, createdBy = ese vendedor), registra en la tarjeta el mismo
-- `contacto` que el botón "Le escribí" (con via = 'etiqueta_chatwoot'). No duplica si ya hay un
-- contacto desde que el cliente empezó a escribir esta vez (alex_turnos.inicio). La etiqueta de otro
-- vendedor (por ejemplo, una vieja de antes de que el cliente volviera) no cuenta.
-- La primera corrida solo aprende las etiquetas que ya estaban (tabla alex_etiquetas_vendedor).

create table if not exists public.alex_etiquetas_vendedor (
  conversation_id text not null,
  vendedor        text not null,
  visto_en        timestamptz not null default now(),
  primary key (conversation_id, vendedor)
);

alter table public.alex_etiquetas_vendedor enable row level security;
revoke all on public.alex_etiquetas_vendedor from anon, authenticated;

create or replace function public.alex_contacto_por_etiqueta(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_base   boolean := not exists (select 1 from public.alex_etiquetas_vendedor);
  v_item   jsonb;
  v_conv   text;
  v_vend   text;
  v_nueva  boolean;
  v_id     text;
  v_d      jsonb;
  v_desde  bigint;
  v_ahora  bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_nuevas int := 0;
  v_marcadas jsonb := '[]'::jsonb;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    v_conv := nullif(btrim(coalesce(v_item->>'conv', '')), '');
    continue when v_conv is null;
    for v_vend in select btrim(x) from jsonb_array_elements_text(coalesce(v_item->'vendedores', '[]'::jsonb)) x loop
      continue when v_vend = '';
      insert into public.alex_etiquetas_vendedor (conversation_id, vendedor) values (v_conv, v_vend)
      on conflict do nothing;
      get diagnostics v_nueva = row_count;
      continue when not v_nueva;
      v_nuevas := v_nuevas + 1;
      continue when v_base;
      select id, data into v_id, v_d
        from public.marga_clients
       where (id = 'alex-' || v_conv or data->>'conversationId' = v_conv)
         and data->>'section' = 'prospectos'
         and data->>'origen' = 'alex'
         and data->>'createdBy' = v_vend
       order by (id = 'alex-' || v_conv) desc
       limit 1;
      continue when v_id is null;
      v_desde := coalesce(
        (select (extract(epoch from t.inicio) * 1000)::bigint from public.alex_turnos t where t.conversation_id = v_conv),
        (v_d->>'createdAt')::bigint, 0);
      continue when coalesce((v_d->'contacto'->>'ultimoEn')::bigint, 0) >= v_desde;
      update public.marga_clients
         set data = data || jsonb_build_object(
               'contacto', jsonb_build_object(
                 'primeroEn', coalesce((v_d->'contacto'->>'primeroEn')::bigint, v_ahora),
                 'ultimoEn', v_ahora,
                 'ultimoTipo', 'whatsapp',
                 'ultimoPor', v_vend,
                 'veces', coalesce((v_d->'contacto'->>'veces')::int, 0) + 1,
                 'via', 'etiqueta_chatwoot'),
               'updatedAt', v_ahora)
       where id = v_id;
      v_marcadas := v_marcadas || jsonb_build_object('id', v_id, 'vendedor', v_vend);
    end loop;
  end loop;
  return jsonb_build_object('base', v_base, 'nuevas', v_nuevas, 'marcadas', v_marcadas);
end $$;

revoke all on function public.alex_contacto_por_etiqueta(jsonb) from public, anon, authenticated;
grant execute on function public.alex_contacto_por_etiqueta(jsonb) to service_role;
