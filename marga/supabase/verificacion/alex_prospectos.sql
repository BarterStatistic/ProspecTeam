-- Pruebas de las funciones alex_* (marga/supabase/alex_prospectos.sql).
-- Cada bloque DO termina con `raise exception 'PRUEBAS OK ...'`: el error final
-- deshace todo lo que insertó, así que no deja filas de prueba en producción.
-- Esperado: el único mensaje es "PRUEBAS OK"; cualquier otro es una aserción fallida.
-- Correr cada bloque por separado (ejecutar como service_role / MCP execute_sql).

-- ===== Bloque 1: alex_tel10, alex_stage, alex_upsert_prospecto =====
do $$
declare
  r jsonb;
  d jsonb;
  esperado_orden int;
  n int;
begin
  -- Funciones puras
  assert public.alex_tel10('+52 1 844 123 4567') = '8441234567', 'tel10 con lada';
  assert public.alex_tel10('844 123 4567') = '8441234567', 'tel10 con espacios';
  assert public.alex_tel10('') = '', 'tel10 vacío';
  assert public.alex_stage('prospecto') = 'primer_contacto', 'stage prospecto';
  assert public.alex_stage('catalogo') = 'preguntas', 'stage catalogo';
  assert public.alex_stage('cotizado') = 'interesado_proceso', 'stage cotizado';
  assert public.alex_stage('calificado') = 'interesado_proceso', 'stage calificado';
  assert public.alex_stage('documentacion') = 'envio_docs_cita', 'stage documentacion';
  assert public.alex_stage('cita') = 'envio_docs_cita', 'stage cita';
  assert public.alex_stage(' Cotizado ') = 'interesado_proceso', 'stage con espacios y mayúsculas';
  assert public.alex_stage('inventada') is null, 'stage desconocida';
  assert public.alex_stage('') is null, 'stage vacía';

  -- Crear
  select coalesce(max((data->>'order')::int), -1) + 1 into esperado_orden
    from public.marga_clients
   where data->>'section' = 'prospectos' and data->>'stage' = 'primer_contacto';
  r := public.alex_upsert_prospecto(jsonb_build_object(
    'conversation_id', 9000001, 'telefono', '+52 1 844 000 0001',
    'nombre', 'Juan Pérez López', 'vendedor', 'Alejandro Acosta'));
  assert r->>'accion' = 'creada', 'crear: accion';
  assert r->>'id' = 'alex-9000001', 'crear: id';
  select data into d from public.marga_clients where id = 'alex-9000001';
  assert d->>'section' = 'prospectos' and d->>'stage' = 'primer_contacto', 'crear: columna';
  assert d->>'origen' = 'alex', 'crear: origen';
  assert d->>'createdBy' = 'Alejandro Acosta', 'crear: vendedor';
  assert d->>'phone' = '844 000 0001', 'crear: teléfono con formato de Marga';
  assert d->>'firstName' = 'Juan' and d->>'lastName' = 'Pérez López', 'crear: nombre partido';
  assert (d->>'order')::int = esperado_orden, 'crear: order al final de la columna';
  assert (d->>'createdAt')::bigint > 1700000000000, 'crear: createdAt en milisegundos';

  -- Avanzar
  r := public.alex_upsert_prospecto(jsonb_build_object('conversation_id', 9000001, 'etapa', 'catalogo'));
  assert r->>'accion' = 'actualizada', 'avanzar: accion';
  select data into d from public.marga_clients where id = 'alex-9000001';
  assert d->>'stage' = 'preguntas', 'avanzar: preguntas';
  assert (d->'caracteristicas'->>'catalogoEnviado')::boolean, 'avanzar: catálogo enviado';
  r := public.alex_upsert_prospecto(jsonb_build_object('conversation_id', 9000001, 'etapa', 'cotizado'));
  select data into d from public.marga_clients where id = 'alex-9000001';
  assert d->>'stage' = 'interesado_proceso', 'avanzar: interesado';
  assert (d->'caracteristicas'->>'catalogoEnviado')::boolean, 'avanzar: catálogo sigue activo';

  -- No retroceder, pero sí refrescar updatedAt
  update public.marga_clients set data = data || '{"updatedAt": 1}'::jsonb where id = 'alex-9000001';
  r := public.alex_upsert_prospecto(jsonb_build_object('conversation_id', 9000001, 'etapa', 'prospecto'));
  select data into d from public.marga_clients where id = 'alex-9000001';
  assert d->>'stage' = 'interesado_proceso', 'no retrocede';
  assert (d->>'updatedAt')::bigint > 1700000000000, 'refresca updatedAt';

  -- Etapa inventada no mueve ni falla
  r := public.alex_upsert_prospecto(jsonb_build_object('conversation_id', 9000001, 'etapa', 'inventada'));
  select data into d from public.marga_clients where id = 'alex-9000001';
  assert d->>'stage' = 'interesado_proceso', 'etapa inventada no mueve';

  -- Mismo teléfono con otro formato y otra conversación: misma tarjeta, sin duplicar
  r := public.alex_upsert_prospecto(jsonb_build_object(
    'conversation_id', 9000009, 'telefono', '+528440000001', 'vendedor', 'Emmanuel Bernal'));
  assert r->>'id' = 'alex-9000001' and r->>'accion' = 'actualizada', 'mismo teléfono, misma tarjeta';
  select count(*) into n from public.marga_clients where public.alex_tel10(data->>'phone') = '8440000001';
  assert n = 1, 'una sola tarjeta por teléfono';

  -- Tarjeta de un vendedor (sin origen): solo avanza columna y mezcla características
  insert into public.marga_clients (id, data) values ('test-vend-1', jsonb_build_object(
    'id', 'test-vend-1', 'firstName', 'Luis', 'lastName', 'Soto', 'phone', '844 000 0002',
    'motorcycles', 'Rayo', 'notes', 'nota del vendedor', 'section', 'prospectos',
    'stage', 'primer_contacto', 'order', 0, 'createdBy', 'Emmanuel Bernal', 'updatedAt', 5));
  r := public.alex_upsert_prospecto(jsonb_build_object(
    'conversation_id', 9000002, 'telefono', '+52 1 844 000 0002', 'nombre', 'Otro Nombre',
    'vendedor', 'Alejandro Acosta', 'etapa', 'cotizado', 'moto', 'Cargo',
    'caracteristicas', jsonb_build_object('compra', 'credito', 'temperatura', 'caliente')));
  assert r->>'id' = 'test-vend-1' and r->>'accion' = 'actualizada', 'vendedor: misma tarjeta';
  select data into d from public.marga_clients where id = 'test-vend-1';
  assert d->>'stage' = 'interesado_proceso', 'vendedor: avanza';
  assert not (d ? 'origen'), 'vendedor: no se le pone origen';
  assert d->>'createdBy' = 'Emmanuel Bernal', 'vendedor: createdBy intacto';
  assert d->>'firstName' = 'Luis' and d->>'motorcycles' = 'Rayo' and d->>'notes' = 'nota del vendedor',
    'vendedor: no se pisan sus datos';
  assert d->'caracteristicas'->>'compra' = 'credito', 'vendedor: mezcla características';

  -- Tarjeta fuera de Prospectos: omitida, sin duplicar
  insert into public.marga_clients (id, data) values ('test-proc-1', jsonb_build_object(
    'id', 'test-proc-1', 'phone', '844 000 0003', 'section', 'procesos', 'stage', 'bnc',
    'order', 0, 'createdBy', 'Emmanuel Bernal', 'updatedAt', 5));
  r := public.alex_upsert_prospecto(jsonb_build_object(
    'conversation_id', 9000003, 'telefono', '8440000003', 'vendedor', 'Alejandro Acosta', 'etapa', 'catalogo'));
  assert r->>'accion' = 'omitida', 'procesos: omitida';
  assert not exists (select 1 from public.marga_clients where id = 'alex-9000003'), 'procesos: no crea otra';
  select data into d from public.marga_clients where id = 'test-proc-1';
  assert d->>'stage' = 'bnc' and (d->>'updatedAt')::bigint = 5, 'procesos: intacta';

  -- Respeta lo que editó el vendedor
  r := public.alex_upsert_prospecto(jsonb_build_object(
    'conversation_id', 9000004, 'telefono', '8440000004', 'nombre', 'Ana Ruiz',
    'vendedor', 'Alejandro Acosta', 'moto', 'Rayo 175'));
  update public.marga_clients
     set data = data || '{"firstName": "Ana María", "motorcycles": "Alien"}'::jsonb
   where id = 'alex-9000004';
  r := public.alex_upsert_prospecto(jsonb_build_object(
    'conversation_id', 9000004, 'nombre', 'Ana Torres Díaz', 'moto', 'Cargo', 'resumen', 'nuevo resumen'));
  select data into d from public.marga_clients where id = 'alex-9000004';
  assert d->>'firstName' = 'Ana María' and d->>'motorcycles' = 'Alien', 'no pisa lo que editó el vendedor';
  assert d->>'resumenAlex' = 'nuevo resumen', 'el resumen de Alex sí se actualiza';

  -- Mientras nadie lo edite, Alex sí actualiza nombre y moto
  r := public.alex_upsert_prospecto(jsonb_build_object(
    'conversation_id', 9000005, 'telefono', '8440000005', 'nombre', 'Beto',
    'vendedor', 'Alejandro Acosta', 'moto', 'Rayo'));
  r := public.alex_upsert_prospecto(jsonb_build_object(
    'conversation_id', 9000005, 'nombre', 'Beto Gómez Ruiz', 'moto', 'Rayo 175'));
  select data into d from public.marga_clients where id = 'alex-9000005';
  assert d->>'firstName' = 'Beto' and d->>'lastName' = 'Gómez Ruiz', 'Alex completa el nombre';
  assert d->>'motorcycles' = 'Rayo 175', 'Alex actualiza la moto';

  -- Datos raros: sin nombre, sin teléfono, valores sin definir, alertas como texto
  r := public.alex_upsert_prospecto(jsonb_build_object(
    'conversation_id', 9000006, 'telefono', '', 'nombre', '', 'vendedor', 'Emmanuel Bernal',
    'etapa', 'inventada',
    'caracteristicas', jsonb_build_object('compra', 'sin_definir', 'perfil', 'sin_definir',
      'alertas', 'requiere_accion, no_califica')));
  assert r->>'accion' = 'creada', 'raros: se crea';
  select data into d from public.marga_clients where id = 'alex-9000006';
  assert d->>'firstName' = '' and d->>'phone' = '' and d->>'stage' = 'primer_contacto', 'raros: vacíos';
  assert jsonb_array_length(d->'caracteristicas'->'alertas') = 2, 'raros: alertas como arreglo';
  assert coalesce(d->'caracteristicas'->>'compra', '') = '', 'raros: compra sin definir queda vacía';
  assert coalesce(d->'caracteristicas'->>'perfil', '') = '', 'raros: perfil sin definir queda vacío';

  -- Dos clientes sin teléfono no se mezclan
  r := public.alex_upsert_prospecto(jsonb_build_object(
    'conversation_id', 9000007, 'telefono', '', 'vendedor', 'Emmanuel Bernal'));
  assert r->>'id' = 'alex-9000007' and r->>'accion' = 'creada', 'sin teléfono no se fusiona';

  -- Sin vendedor y sin tarjeta: omitida
  r := public.alex_upsert_prospecto(jsonb_build_object('conversation_id', 9000008, 'etapa', 'catalogo'));
  assert r->>'accion' = 'omitida', 'sin vendedor y sin tarjeta: omitida';
  assert not exists (select 1 from public.marga_clients where id = 'alex-9000008'), 'sin vendedor: no crea';

  raise exception 'PRUEBAS OK (bloque 1)';
end $$;

-- ===== Bloque 2: alex_caducar_prospectos =====
do $$
declare
  ahora bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  dia   bigint := 86400000;
  n     int;
  r     jsonb;
begin
  -- Tarjetas de prueba: (id, origen, section, updatedAt, fechaInicioProceso)
  insert into public.marga_clients (id, data)
  select v.id, jsonb_strip_nulls(jsonb_build_object(
           'id', v.id, 'section', v.section, 'stage', 'primer_contacto', 'order', 0,
           'phone', '', 'origen', v.origen, 'createdBy', 'Emmanuel Bernal',
           'updatedAt', v.upd, 'fechaInicioProceso', v.proceso))
    from (values
      ('cad-vencida',    'alex', 'prospectos', ahora - 8 * dia,           null::bigint),
      ('cad-reciente',   'alex', 'prospectos', ahora - 6 * dia - 23 * 3600000, null),
      ('cad-vendedor',   null,   'prospectos', ahora - 30 * dia,          null),
      ('cad-procesos',   'alex', 'procesos',   ahora - 30 * dia,          null),
      ('cad-regresada',  'alex', 'prospectos', ahora - 30 * dia,          ahora - 40 * dia),
      ('cad-reanimada',  'alex', 'prospectos', ahora - 30 * dia,          null)
    ) as v(id, origen, section, upd, proceso);

  -- Una actualización de Alex le renueva el plazo (conversationId permite hallarla).
  update public.marga_clients set data = data || '{"conversationId": "9100001"}'::jsonb where id = 'cad-reanimada';
  r := public.alex_upsert_prospecto(jsonb_build_object('conversation_id', 9100001));

  n := public.alex_caducar_prospectos();
  assert n = 1, 'solo caduca una tarjeta (devolvió ' || n || ')';
  assert not exists (select 1 from public.marga_clients where id = 'cad-vencida'), 'la vencida se borra';
  assert exists (select 1 from public.marga_clients where id = 'cad-reciente'), 'la de 6 días 23 h se queda';
  assert exists (select 1 from public.marga_clients where id = 'cad-vendedor'), 'la de vendedor no caduca';
  assert exists (select 1 from public.marga_clients where id = 'cad-procesos'), 'la de Procesos no caduca';
  assert exists (select 1 from public.marga_clients where id = 'cad-regresada'), 'la que pasó por Procesos no caduca';
  assert exists (select 1 from public.marga_clients where id = 'cad-reanimada'), 'la actualizada por Alex se queda';

  raise exception 'PRUEBAS OK (bloque 2)';
end $$;

-- ===== Bloque 3: chatbot activado/desactivado y alta con etapa y características de golpe =====
do $$
declare
  r jsonb;
  d jsonb;
begin
  r := public.alex_upsert_prospecto(jsonb_build_object(
    'conversation_id', 9200001, 'telefono', '8440000010', 'vendedor', 'Emmanuel Bernal',
    'etapa', 'cotizado',
    'caracteristicas', jsonb_build_object('compra', 'credito', 'perfil', 'motonomina',
      'temperatura', 'caliente', 'chatbot', 'activado')));
  select data into d from public.marga_clients where id = 'alex-9200001';
  assert d->>'stage' = 'interesado_proceso', 'alta con etapa: cae en su columna';
  assert d->'caracteristicas'->>'chatbot' = 'activado', 'chatbot activado se guarda';
  assert d->'caracteristicas'->>'perfil' = 'motonomina' and d->'caracteristicas'->>'temperatura' = 'caliente', 'alta con características';
  r := public.alex_upsert_prospecto(jsonb_build_object(
    'conversation_id', 9200001, 'caracteristicas', jsonb_build_object('chatbot', 'desactivado')));
  select data into d from public.marga_clients where id = 'alex-9200001';
  assert d->'caracteristicas'->>'chatbot' = 'desactivado', 'chatbot desactivado reemplaza';
  r := public.alex_upsert_prospecto(jsonb_build_object(
    'conversation_id', 9200001, 'caracteristicas', jsonb_build_object('chatbot', 'raro')));
  select data into d from public.marga_clients where id = 'alex-9200001';
  assert d->'caracteristicas'->>'chatbot' = 'desactivado', 'valor desconocido no cambia nada';
  raise exception 'PRUEBAS OK (bloque 3)';
end $$;

-- ===== Bloque 4: atributos del cliente =====
do $$
declare
  r jsonb;
  d jsonb;
begin
  r := public.alex_upsert_prospecto(jsonb_build_object(
    'conversation_id', 9300001, 'telefono', '8440000020', 'vendedor', 'Alejandro Acosta',
    'atributos', jsonb_build_object('enganche', '$10,000', 'pago_cotizado', '$1,334 quincenal',
      'ingresos', '', 'desconocida', 'x')));
  select data into d from public.marga_clients where id = 'alex-9300001';
  assert d->'atributos' = '{"enganche": "$10,000", "pago_cotizado": "$1,334 quincenal"}'::jsonb,
    'alta: solo atributos conocidos y con valor (' || coalesce(d->>'atributos', 'null') || ')';

  r := public.alex_upsert_prospecto(jsonb_build_object(
    'conversation_id', 9300001,
    'atributos', jsonb_build_object('ingresos', 'estados de cuenta', 'enganche', '$5,000')));
  select data into d from public.marga_clients where id = 'alex-9300001';
  assert d->'atributos' = '{"enganche": "$5,000", "pago_cotizado": "$1,334 quincenal", "ingresos": "estados de cuenta"}'::jsonb,
    'actualización: se mezclan, lo nuevo reemplaza';

  r := public.alex_upsert_prospecto(jsonb_build_object('conversation_id', 9300001, 'atributos', jsonb_build_object('enganche', '')));
  select data into d from public.marga_clients where id = 'alex-9300001';
  assert d->'atributos'->>'enganche' = '$5,000', 'un valor vacío no borra el guardado';

  insert into public.marga_clients (id, data) values ('test-vend-2', jsonb_build_object(
    'id', 'test-vend-2', 'phone', '844 000 0021', 'section', 'prospectos', 'stage', 'primer_contacto',
    'order', 0, 'createdBy', 'Emmanuel Bernal', 'updatedAt', 5));
  r := public.alex_upsert_prospecto(jsonb_build_object(
    'conversation_id', 9300002, 'telefono', '8440000021', 'atributos', jsonb_build_object('enganche', '$1')));
  select data into d from public.marga_clients where id = 'test-vend-2';
  assert not (d ? 'atributos'), 'tarjeta de vendedor: no se le escriben atributos';

  raise exception 'PRUEBAS OK (bloque 4)';
end $$;
