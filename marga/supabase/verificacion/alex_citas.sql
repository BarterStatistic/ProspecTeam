-- Pruebas de public.alex_crear_cita (marga/supabase/alex_citas.sql).
-- Cada bloque DO termina con `raise exception 'PRUEBAS OK ...'`: el error final
-- deshace todo lo que insertó, así que no deja filas de prueba en producción.
-- Esperado: el único mensaje es "PRUEBAS OK"; cualquier otro es una aserción fallida.
-- Correr cada bloque por separado (como service_role / MCP execute_sql).

-- ===== Bloque 1: crear, actualizar, duplicado, asistencia ya marcada =====
do $$
declare
  r jsonb;
  d jsonb;
  hoy date := (now() at time zone 'America/Monterrey')::date;
  f1 text := to_char(hoy + 3, 'YYYY-MM-DD');
  f2 text := to_char(hoy + 4, 'YYYY-MM-DD');
  n int;
  esperado bigint;
begin
  -- Crear
  r := public.alex_crear_cita(jsonb_build_object(
    'conversation_id', 9100001, 'fecha', f1, 'hora', '16:30',
    'telefono', '+52 1 844 000 0001', 'nombre', 'Juan Pérez',
    'moto', 'Super sport', 'vendedor', 'Alejandro Acosta',
    'motivo', 'Quiere ver la moto y llevar documentos'));
  assert r->>'accion' = 'creada', 'crear: accion';
  assert r->>'id' = 'alex-cita-9100001', 'crear: id';
  select data into d from public.marga_citas where id = 'alex-cita-9100001';
  assert d->>'origen' = 'alex', 'crear: origen';
  assert d->>'confirmacion' = 'pendiente', 'crear: confirmacion';
  assert d->>'asistencia' = 'pendiente', 'crear: asistencia';
  assert d->>'createdBy' = 'Alejandro Acosta', 'crear: createdBy';
  assert d->>'vendedor' = 'Alejandro Acosta', 'crear: vendedor';
  assert d->>'clientName' = 'Juan Pérez', 'crear: clientName';
  assert d->>'phone' = '+52 1 844 000 0001', 'crear: phone';
  assert d->>'motorcycle' = 'Super sport', 'crear: moto';
  assert d->>'conversationId' = '9100001', 'crear: conversationId';
  assert (d->>'hasTime')::boolean, 'crear: hasTime';
  assert (d->>'atendida')::boolean = false, 'crear: atendida';
  esperado := (extract(epoch from ((f1 || ' 16:30')::timestamp at time zone 'America/Monterrey')) * 1000)::bigint;
  assert (d->>'fechaCita')::bigint = esperado, 'crear: fechaCita en hora de Monterrey';

  -- Notificación al vendedor
  select count(*) into n from public.marga_notificaciones
   where data->>'citaId' = 'alex-cita-9100001' and data->>'destinatario' = 'Alejandro Acosta'
     and data->>'tipo' = 'cita_nueva' and (data->>'leida')::boolean = false;
  assert n = 1, 'crear: notificacion al vendedor';

  -- El vendedor confirma; Alex mueve la hora: misma cita, vuelve a pendiente
  update public.marga_citas set data = data || '{"confirmacion":"confirmada"}' where id = 'alex-cita-9100001';
  r := public.alex_crear_cita(jsonb_build_object(
    'conversation_id', 9100001, 'fecha', f2, 'hora', '11:00', 'vendedor', 'Alejandro Acosta'));
  assert r->>'accion' = 'actualizada', 'actualizar: accion';
  assert r->>'id' = 'alex-cita-9100001', 'actualizar: misma id';
  select data into d from public.marga_citas where id = 'alex-cita-9100001';
  assert d->>'confirmacion' = 'pendiente', 'actualizar: confirmacion vuelve a pendiente';
  assert d->>'clientName' = 'Juan Pérez', 'actualizar: no borra el nombre';
  assert d->>'motorcycle' = 'Super sport', 'actualizar: no borra la moto';
  esperado := (extract(epoch from ((f2 || ' 11:00')::timestamp at time zone 'America/Monterrey')) * 1000)::bigint;
  assert (d->>'fechaCita')::bigint = esperado, 'actualizar: nueva fecha';
  select count(*) into n from public.marga_citas where data->>'conversationId' = '9100001';
  assert n = 1, 'actualizar: sigue siendo una sola cita';

  -- Sin hora: hasTime falso y medianoche local
  r := public.alex_crear_cita(jsonb_build_object(
    'conversation_id', 9100002, 'fecha', f1, 'vendedor', 'Emmanuel Bernal', 'nombre', 'Ana'));
  select data into d from public.marga_citas where id = 'alex-cita-9100002';
  assert not (d->>'hasTime')::boolean, 'sin hora: hasTime falso';

  -- Asistencia ya marcada: la siguiente cita de la conversación es nueva
  update public.marga_citas
     set data = data || '{"asistencia":"asistio","atendida":true}' where id = 'alex-cita-9100001';
  r := public.alex_crear_cita(jsonb_build_object(
    'conversation_id', 9100001, 'fecha', f2, 'hora', '12:00', 'vendedor', 'Alejandro Acosta'));
  assert r->>'accion' = 'creada', 'asistencia marcada: crea otra';
  assert r->>'id' = 'alex-cita-9100001-2', 'asistencia marcada: id con sufijo';
  select data into d from public.marga_citas where id = 'alex-cita-9100001';
  assert d->>'asistencia' = 'asistio', 'asistencia marcada: la anterior no se toca';

  raise exception 'PRUEBAS OK bloque 1';
end $$;

-- ===== Bloque 2: entradas inválidas =====
do $$
declare
  hoy date := (now() at time zone 'America/Monterrey')::date;
  futuro text := to_char(hoy + 3, 'YYYY-MM-DD');
  n int;
  fallo boolean;
begin
  fallo := false;
  begin perform public.alex_crear_cita('{"fecha":"2030-01-01"}'::jsonb);
  exception when others then fallo := true; end;
  assert fallo, 'falta conversation_id debe fallar';

  fallo := false;
  begin perform public.alex_crear_cita(jsonb_build_object('conversation_id', 9100003, 'fecha', 'mañana'));
  exception when others then fallo := true; end;
  assert fallo, 'fecha en texto debe fallar';

  fallo := false;
  begin perform public.alex_crear_cita(jsonb_build_object('conversation_id', 9100003, 'fecha', '2027-02-30'));
  exception when others then fallo := true; end;
  assert fallo, 'fecha inexistente debe fallar';

  fallo := false;
  begin perform public.alex_crear_cita(jsonb_build_object('conversation_id', 9100003, 'fecha', to_char(hoy - 1, 'YYYY-MM-DD')));
  exception when others then fallo := true; end;
  assert fallo, 'fecha pasada debe fallar';

  fallo := false;
  begin perform public.alex_crear_cita(jsonb_build_object('conversation_id', 9100003, 'fecha', futuro, 'hora', '25:99'));
  exception when others then fallo := true; end;
  assert fallo, 'hora inválida debe fallar';

  select count(*) into n from public.marga_citas where data->>'conversationId' = '9100003';
  assert n = 0, 'las entradas inválidas no escriben nada';

  raise exception 'PRUEBAS OK bloque 2';
end $$;

-- ===== Bloque 3: marga_avisar no encola aviso para la escritura de Alex =====
-- (si no hay marga_avisos_config, ningún caso encola; la prueba solo corre con ella)
do $$
declare
  hoy date := (now() at time zone 'America/Monterrey')::date;
  antes bigint;
  despues bigint;
begin
  select count(*) into antes from net.http_request_queue;
  perform public.alex_crear_cita(jsonb_build_object(
    'conversation_id', 9100004, 'fecha', to_char(hoy + 3, 'YYYY-MM-DD'), 'vendedor', 'Alejandro Acosta'));
  select count(*) into despues from net.http_request_queue;
  assert despues = antes, 'la cita de Alex no encola aviso de marga_avisar';

  -- Una cita manual sí sigue avisando (si hay configuración de avisos)
  if exists (select 1 from public.marga_avisos_config where id = 1 and funcion_url is not null) then
    insert into public.marga_citas (id, data) values ('prueba-manual-9100004',
      jsonb_build_object('fechaCita', 1, 'clientName', 'x', 'createdBy', 'Alejandro Acosta'));
    select count(*) into despues from net.http_request_queue;
    assert despues = antes + 1, 'una cita manual sí encola aviso';
  end if;

  raise exception 'PRUEBAS OK bloque 3';
end $$;
