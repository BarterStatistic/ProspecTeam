-- Citas de Alex en Marga (proyecto ehyqexzaauvjoioafqdz).
-- Diseño: docs/superpowers/specs/2026-11-18-alex-citas-marga-design.md
--
-- Alex (n8n) llama a alex_crear_cita cuando agenda una cita con un cliente. La
-- función crea (o actualiza) la cita en `marga_citas` con origen 'alex',
-- confirmación y asistencia en 'pendiente', y avisa al vendedor en su campana.
-- Solo `service_role` puede ejecutarla.
--
-- Pruebas: marga/supabase/verificacion/alex_citas.sql

-- p: { conversation_id (obligatorio), fecha 'YYYY-MM-DD' (obligatoria), hora 'HH:MM',
--      telefono, nombre, moto, vendedor, motivo }
-- Una cita por conversación (id 'alex-cita-<conv>'). Si ya existe y su asistencia
-- sigue pendiente, se actualiza (fecha, hora y lo que venga) y la confirmación
-- vuelve a 'pendiente'. Si ya tiene asistencia marcada, se crea otra con sufijo
-- '-2', '-3'… sin tocar la anterior.
-- Devuelve { accion: 'creada' | 'actualizada', id }.
create or replace function public.alex_crear_cita(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_conv    text := nullif(btrim(coalesce(p->>'conversation_id', '')), '');
  v_ftxt    text := btrim(coalesce(p->>'fecha', ''));
  v_htxt    text := btrim(coalesce(p->>'hora', ''));
  v_vend    text := btrim(coalesce(p->>'vendedor', ''));
  v_nombre  text := btrim(coalesce(p->>'nombre', ''));
  v_tel     text := btrim(coalesce(p->>'telefono', ''));
  v_moto    text := btrim(coalesce(p->>'moto', ''));
  v_motivo  text := btrim(coalesce(p->>'motivo', ''));
  v_hoy     date := (now() at time zone 'America/Monterrey')::date;
  v_ahora   bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_fecha   date;
  v_hora    time;
  v_ts      timestamp;
  v_ms      bigint;
  v_base    text;
  v_id      text;
  v_n       int := 1;
  v_d       jsonb;
  v_existe  boolean := false;
  v_cuando  text;
  v_cliente text;
  v_msg     text;
  v_nid     text;
begin
  if v_conv is null then
    raise exception 'alex_crear_cita: falta conversation_id';
  end if;

  if v_ftxt !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'alex_crear_cita: fecha invalida, usa YYYY-MM-DD';
  end if;
  begin
    v_fecha := v_ftxt::date;
  exception when others then
    raise exception 'alex_crear_cita: la fecha % no existe', v_ftxt;
  end;
  if v_fecha < v_hoy then
    raise exception 'alex_crear_cita: la fecha % ya paso', v_ftxt;
  end if;

  if v_htxt <> '' then
    if v_htxt !~ '^\d{1,2}:\d{2}$' then
      raise exception 'alex_crear_cita: hora invalida, usa HH:MM';
    end if;
    begin
      v_hora := v_htxt::time;
    exception when others then
      raise exception 'alex_crear_cita: la hora % no existe', v_htxt;
    end;
  end if;

  v_ts := v_fecha + coalesce(v_hora, time '00:00');
  v_ms := (extract(epoch from (v_ts at time zone 'America/Monterrey')) * 1000)::bigint;
  v_cuando := to_char(v_ts, 'DD/MM/YYYY') || case when v_hora is not null then ' a las ' || to_char(v_ts, 'HH24:MI') else '' end;

  -- Un solo proceso a la vez por conversación: evita citas duplicadas.
  perform pg_advisory_xact_lock(hashtext('alex-cita-' || v_conv));

  -- Alex ya avisó al vendedor por Telegram (con la nota y el resumen del
  -- cliente): que marga_avisar no mande un segundo aviso por esta escritura.
  perform set_config('marga.sin_aviso', '1', true);

  v_base := 'alex-cita-' || v_conv;
  loop
    v_id := case when v_n = 1 then v_base else v_base || '-' || v_n end;
    select data into v_d from public.marga_citas where id = v_id;
    if not found then
      exit;
    end if;
    -- Pendiente de asistencia: es la cita viva de esta conversación.
    if coalesce(v_d->>'asistencia', 'pendiente') = 'pendiente'
       and coalesce((v_d->>'atendida')::boolean, false) = false then
      v_existe := true;
      exit;
    end if;
    v_n := v_n + 1;
  end loop;

  if v_existe then
    update public.marga_citas
       set data = data || jsonb_strip_nulls(jsonb_build_object(
             'fechaCita', v_ms,
             'hasTime', v_hora is not null,
             'confirmacion', 'pendiente',
             'updatedAt', v_ahora,
             'clientName', nullif(v_nombre, ''),
             'phone', nullif(v_tel, ''),
             'motorcycle', nullif(v_moto, ''),
             'description', nullif(v_motivo, '')))
     where id = v_id;
    v_cliente := coalesce(nullif(v_nombre, ''), nullif(v_d->>'clientName', ''), 'un cliente');
    v_msg := 'Alex reagendó la cita con ' || v_cliente || ' para el ' || v_cuando;
  else
    insert into public.marga_citas (id, data)
    values (v_id, jsonb_build_object(
      'id', v_id,
      'clientName', v_nombre,
      'phone', v_tel,
      'motorcycle', v_moto,
      'description', v_motivo,
      'fechaCita', v_ms,
      'hasTime', v_hora is not null,
      'ineImage', '',
      'atendida', false,
      'notaAtencion', '',
      'fechaAtencion', null,
      'origen', 'alex',
      'conversationId', v_conv,
      'vendedor', v_vend,
      'confirmacion', 'pendiente',
      'asistencia', 'pendiente',
      'createdBy', v_vend,
      'createdAt', v_ahora,
      'updatedAt', v_ahora));
    v_cliente := coalesce(nullif(v_nombre, ''), 'un cliente');
    v_msg := 'Alex agendó una cita con ' || v_cliente || ' para el ' || v_cuando;
  end if;

  if v_vend <> '' then
    v_nid := gen_random_uuid()::text;
    insert into public.marga_notificaciones (id, data)
    values (v_nid, jsonb_build_object(
      'id', v_nid,
      'destinatario', v_vend,
      'tipo', 'cita_nueva',
      'mensaje', v_msg,
      'clienteId', '',
      'citaId', v_id,
      'createdAt', v_ahora,
      'leida', false));
  end if;

  -- La marca solo vale para las escrituras de arriba.
  perform set_config('marga.sin_aviso', '', true);

  return jsonb_build_object('accion', case when v_existe then 'actualizada' else 'creada' end, 'id', v_id);
end
$$;

revoke all on function public.alex_crear_cita(jsonb) from public, anon, authenticated;
grant execute on function public.alex_crear_cita(jsonb) to service_role;

-- marga_avisar (disparador de marga_clients y marga_citas hacia la Edge Function
-- marga-avisos): igual que antes, salvo que se salta la escritura que hace
-- alex_crear_cita (`marga.sin_aviso`, local a la transacción), porque Alex ya
-- manda su propio Telegram al vendedor.
create or replace function public.marga_avisar()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_url text;
  v_secreto text;
  v_antes jsonb;
begin
  if coalesce(current_setting('marga.sin_aviso', true), '') = '1' then
    return null;
  end if;

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
end $function$;
