-- Clientes de Alex en Marga 2.5 (proyecto ehyqexzaauvjoioafqdz).
-- Diseño: docs/superpowers/specs/2026-11-03-alex-marga-prospectos-design.md
--
-- Alex (n8n) llama a alex_upsert_prospecto con cada cliente que le escribe y con
-- cada actualización de su CRM; la función crea o actualiza la tarjeta en
-- `marga_clients` (Prospectos). alex_caducar_prospectos borra las tarjetas del
-- bot que llevan 7 días sin modificarse. Solo `service_role` puede ejecutarlas.
--
-- Pruebas: marga/supabase/verificacion/alex_prospectos.sql

-- Últimos 10 dígitos de un teléfono ('+52 1 844 123 4567' → '8441234567').
create or replace function public.alex_tel10(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select right(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 10)
$$;

-- Etapa de Alex → id de columna de Marga (null si la etapa no se reconoce).
-- Alex nunca llega a 'proceso_comenzado': eso lo mueve un vendedor.
create or replace function public.alex_stage(etapa text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(btrim(coalesce(etapa, '')))
    when 'prospecto'     then 'primer_contacto'
    when 'catalogo'      then 'preguntas'
    when 'cotizado'      then 'interesado_proceso'
    when 'calificado'    then 'interesado_proceso'
    when 'documentacion' then 'envio_docs_cita'
    when 'cita'          then 'envio_docs_cita'
  end
$$;

-- Datos del cliente que Alex junta (atributos de Chatwoot): solo claves conocidas
-- y con valor; lo vacío no borra lo guardado.
create or replace function public.alex_atributos(a jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k, btrim(a->>k)), '{}'::jsonb)
    from unnest(array['enganche', 'pago_cotizado', 'ingresos', 'antiguedad_laboral',
                      'municipio', 'documentos', 'proximo_paso', 'notas_cliente']) as k
   where nullif(btrim(coalesce(a->>k, '')), '') is not null
$$;

-- p: { conversation_id (obligatorio), telefono, vendedor, nombre, etapa, moto,
--      resumen, atributos: { enganche, pago_cotizado, ingresos, antiguedad_laboral,
--      municipio, documentos, proximo_paso, notas_cliente },
--      caracteristicas: { compra, perfil, flex, temperatura, chatbot, alertas } }
-- Devuelve { accion: 'creada' | 'actualizada' | 'omitida', id }.
create or replace function public.alex_upsert_prospecto(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_conv    text  := nullif(btrim(coalesce(p->>'conversation_id', '')), '');
  v_tel     text  := public.alex_tel10(p->>'telefono');
  v_vend    text  := nullif(btrim(coalesce(p->>'vendedor', '')), '');
  v_nombre  text  := btrim(coalesce(p->>'nombre', ''));
  v_moto    text  := btrim(coalesce(p->>'moto', ''));
  v_resumen text  := btrim(coalesce(p->>'resumen', ''));
  v_stage   text  := public.alex_stage(p->>'etapa');
  v_car     jsonb := coalesce(p->'caracteristicas', '{}'::jsonb);
  v_orden   text[] := array['primer_contacto', 'preguntas', 'interesado_proceso', 'envio_docs_cita'];
  v_ahora   bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_id      text;
  v_d       jsonb;
  v_phone   text;
  v_words   text[];
  v_n       int;
  v_first   text;
  v_last    text;
  v_alertas_txt text;
  v_alertas jsonb;
  v_upd     jsonb;
  v_cat     jsonb;
  v_patch   jsonb;
  v_destino text;
  v_actual  text;
  v_actual_nombre text;
  v_bot     boolean;
begin
  if v_conv is null then
    raise exception 'alex_upsert_prospecto: falta conversation_id';
  end if;

  -- Un solo proceso a la vez por cliente: evita tarjetas duplicadas si llegan
  -- dos mensajes casi juntos.
  perform pg_advisory_xact_lock(hashtext(case when length(v_tel) = 10 then v_tel else 'alex-' || v_conv end));

  -- Características normalizadas (solo valores conocidos; lo vacío no se guarda).
  if jsonb_typeof(v_car->'alertas') = 'array' then
    select string_agg(value, ',') into v_alertas_txt from jsonb_array_elements_text(v_car->'alertas');
  else
    v_alertas_txt := v_car->>'alertas';
  end if;
  select coalesce(jsonb_agg(a order by a), '[]'::jsonb) into v_alertas
    from (
      select distinct lower(btrim(x)) as a
        from regexp_split_to_table(coalesce(v_alertas_txt, ''), ',') as x
       where lower(btrim(x)) in ('requiere_accion', 'no_califica', 'fuera_cobertura', 'refacciones', 'vacantes')
    ) s;

  v_upd := jsonb_strip_nulls(jsonb_build_object(
    'compra', case lower(btrim(coalesce(v_car->>'compra', '')))
                when 'credito' then 'credito' when 'contado' then 'contado' end,
    'perfil', case when lower(btrim(coalesce(v_car->>'perfil', ''))) in
                ('motonomina', 'seguridad', 'pensionado', 'credinamo', 'dueno_negocio', 'motoxpress', 'enganche_50')
              then lower(btrim(v_car->>'perfil')) end,
    'chatbot', case lower(btrim(coalesce(v_car->>'chatbot', '')))
                 when 'activado' then 'activado' when 'desactivado' then 'desactivado' end,
    'temperatura', case when lower(btrim(coalesce(v_car->>'temperatura', ''))) in ('caliente', 'tibio', 'frio')
              then lower(btrim(v_car->>'temperatura')) end,
    'flex', case when coalesce(v_car->>'flex', '') <> '' then to_jsonb(lower(v_car->>'flex') = 'true') end,
    'alertas', case when jsonb_array_length(v_alertas) > 0 then v_alertas end
  ));

  -- Buscar la tarjeta: por conversación, y si no, por teléfono (10 dígitos).
  select id, data into v_id, v_d
    from public.marga_clients
   where id = 'alex-' || v_conv or data->>'conversationId' = v_conv
   order by (id = 'alex-' || v_conv) desc
   limit 1;
  if not found and length(v_tel) = 10 then
    select id, data into v_id, v_d
      from public.marga_clients
     where public.alex_tel10(data->>'phone') = v_tel
     order by (data->>'section' = 'prospectos') desc,
              (data->>'origen' = 'alex') desc,
              coalesce((data->>'updatedAt')::bigint, 0) desc
     limit 1;
  end if;

  -- No existe tarjeta
  if v_d is null then
    if v_vend is null then
      return jsonb_build_object('accion', 'omitida', 'id', 'alex-' || v_conv);
    end if;

    v_words := regexp_split_to_array(v_nombre, '\s+');
    v_n := case when v_nombre = '' then 0 else array_length(v_words, 1) end;
    v_first := case when v_n = 0 then '' when v_n <= 2 then v_words[1]
                    else array_to_string(v_words[1:v_n - 2], ' ') end;
    v_last := case when v_n <= 1 then '' when v_n = 2 then v_words[2]
                   else array_to_string(v_words[v_n - 1:v_n], ' ') end;
    v_phone := case when length(v_tel) = 10
                    then substr(v_tel, 1, 3) || ' ' || substr(v_tel, 4, 3) || ' ' || substr(v_tel, 7)
                    else '' end;
    v_destino := coalesce(v_stage, 'primer_contacto');
    v_cat := v_upd || jsonb_build_object('catalogoEnviado', lower(btrim(coalesce(p->>'etapa', ''))) = 'catalogo');

    v_id := 'alex-' || v_conv;
    insert into public.marga_clients (id, data) values (v_id, jsonb_build_object(
      'id', v_id,
      'firstName', v_first, 'lastName', v_last, 'phone', v_phone,
      'saleType', '', 'creditScheme', '', 'motorcycles', v_moto,
      'prospectTeamSeller', '', 'promotorEncargado', '', 'notes', '',
      'buroAutorizado', false, 'engancheDejado', false,
      'section', 'prospectos', 'stage', v_destino,
      'order', (select coalesce(max((c.data->>'order')::int), -1) + 1
                  from public.marga_clients c
                 where c.data->>'section' = 'prospectos' and c.data->>'stage' = v_destino),
      'createdAt', v_ahora, 'updatedAt', v_ahora, 'createdBy', v_vend,
      'fechaInicioProceso', null, 'fechaEntrega', null,
      'notasPostVenta', '', 'notasRechazo', '', 'fechaCancelacion', null,
      'fechaFacturacion', null, 'comisionId', null,
      'origen', 'alex', 'conversationId', v_conv,
      'caracteristicas', v_cat, 'atributos', public.alex_atributos(p->'atributos'), 'resumenAlex', v_resumen,
      'nombreAlex', v_nombre, 'motoAlex', v_moto
    ));
    return jsonb_build_object('accion', 'creada', 'id', v_id);
  end if;

  -- La tarjeta ya salió de Prospectos: no se toca.
  if v_d->>'section' <> 'prospectos' then
    return jsonb_build_object('accion', 'omitida', 'id', v_id);
  end if;

  v_bot := v_d->>'origen' = 'alex';
  v_cat := coalesce(v_d->'caracteristicas', '{}'::jsonb) || v_upd;
  v_cat := v_cat || jsonb_build_object(
    'catalogoEnviado',
    coalesce((v_d->'caracteristicas'->>'catalogoEnviado')::boolean, false)
      or lower(btrim(coalesce(p->>'etapa', ''))) = 'catalogo');
  v_patch := jsonb_build_object('updatedAt', v_ahora, 'caracteristicas', v_cat);
  if not (v_d ? 'conversationId') then
    v_patch := v_patch || jsonb_build_object('conversationId', v_conv);
  end if;

  -- Solo avanza de columna, nunca retrocede.
  v_actual := v_d->>'stage';
  if v_stage is not null
     and coalesce(array_position(v_orden, v_stage), 0) > coalesce(array_position(v_orden, v_actual), 0) then
    v_patch := v_patch || jsonb_build_object(
      'stage', v_stage,
      'order', (select coalesce(max((c.data->>'order')::int), -1) + 1
                  from public.marga_clients c
                 where c.data->>'section' = 'prospectos' and c.data->>'stage' = v_stage));
  end if;

  -- En las tarjetas del bot, Alex mantiene nombre, moto y resumen mientras
  -- ningún vendedor los haya editado.
  if v_bot then
    v_actual_nombre := btrim(coalesce(v_d->>'firstName', '') || ' ' || coalesce(v_d->>'lastName', ''));
    if v_nombre <> '' and (v_actual_nombre = '' or v_actual_nombre = coalesce(v_d->>'nombreAlex', '')) then
      v_words := regexp_split_to_array(v_nombre, '\s+');
      v_n := array_length(v_words, 1);
      v_first := case when v_n <= 2 then v_words[1] else array_to_string(v_words[1:v_n - 2], ' ') end;
      v_last := case when v_n = 1 then '' when v_n = 2 then v_words[2]
                     else array_to_string(v_words[v_n - 1:v_n], ' ') end;
      v_patch := v_patch || jsonb_build_object('firstName', v_first, 'lastName', v_last, 'nombreAlex', v_nombre);
    end if;
    if v_moto <> '' and (coalesce(v_d->>'motorcycles', '') = '' or v_d->>'motorcycles' = coalesce(v_d->>'motoAlex', '')) then
      v_patch := v_patch || jsonb_build_object('motorcycles', v_moto, 'motoAlex', v_moto);
    end if;
    if v_resumen <> '' then
      v_patch := v_patch || jsonb_build_object('resumenAlex', v_resumen);
    end if;
  end if;

  if v_bot then
    v_patch := v_patch || jsonb_build_object('atributos', coalesce(v_d->'atributos', '{}'::jsonb) || public.alex_atributos(p->'atributos'));
  end if;

  update public.marga_clients set data = data || v_patch where id = v_id;
  return jsonb_build_object('accion', 'actualizada', 'id', v_id);
end $$;

revoke all on function public.alex_tel10(text), public.alex_stage(text), public.alex_upsert_prospecto(jsonb)
  from public, anon, authenticated;
grant execute on function public.alex_tel10(text), public.alex_stage(text), public.alex_upsert_prospecto(jsonb)
  to service_role;

-- Borra las tarjetas del bot que siguen en Prospectos, nunca pasaron por
-- Procesos y llevan más de 7 días sin modificarse. Devuelve cuántas borró.
create or replace function public.alex_caducar_prospectos()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  with borradas as (
    delete from public.marga_clients
     where data->>'origen' = 'alex'
       and data->>'section' = 'prospectos'
       and data->>'fechaInicioProceso' is null
       and coalesce((data->>'updatedAt')::bigint, 0)
             < (extract(epoch from now() - interval '7 days') * 1000)::bigint
    returning 1
  )
  select count(*) into n from borradas;
  return n;
end $$;

revoke all on function public.alex_caducar_prospectos() from public, anon, authenticated;
grant execute on function public.alex_caducar_prospectos() to service_role;

-- Programación diaria: 09:00 UTC = 03:00 en Saltillo. Si pg_cron no está
-- disponible, un disparador diario de n8n debe llamar a la función por RPC.
create extension if not exists pg_cron;
select cron.schedule('marga_caducar_alex', '0 9 * * *', 'select public.alex_caducar_prospectos()');

revoke all on function public.alex_atributos(jsonb) from public, anon, authenticated;
grant execute on function public.alex_atributos(jsonb) to service_role;
