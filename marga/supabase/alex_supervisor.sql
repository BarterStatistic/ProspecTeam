-- Supervisor de Alex (proyecto ehyqexzaauvjoioafqdz). Requiere alex_embudo.sql.
--
-- El Supervisor es un módulo de Bartersito (n8n) que estudia a Alex con una sola medida:
-- clientes aptos que mandan documentación. Lunes: reporte semanal con propuestas que Braulio
-- decide por Telegram o en Marga. Jueves: reporte de avance, sin propuestas.
--
--   alex_reportes         cada reporte del Supervisor
--   alex_propuestas       lo que propone; nada se aplica sin que Braulio lo apruebe
--   alex_directivas       instrucciones aprobadas que Alex lee en cada mensaje (así el Supervisor
--                         cambia el comportamiento de Alex sin tocar el flujo de n8n)
--   alex_costos_config    precios y supuestos para estimar el costo mensual (IA y WhatsApp)
--
--   alex_supervisor_datos(dias)    lo que lee el Supervisor antes de escribir
--   alex_supervisor_guardar(json)  guarda reporte y propuestas
--   alex_decidir(id, accion, token, desde)  decide UNA vez una propuesta
--   alex_costos(dias)              costo estimado y proyección al mes
--   alex_panel(dias)               todo lo que muestra la pestaña "Alex IA" de Marga
--   marga_panel_alex / marga_alex_decidir   lo mismo, solo para el administrador de Marga
--
-- Tope: 8 directivas activas a la vez (más que eso y el modelo de Alex deja de obedecerlas).

-- La memoria de Alex no guardaba la hora de cada mensaje. Desde aquí sí (los anteriores quedan sin hora).
alter table public.n8n_chat_histories add column if not exists creado_en timestamptz;
alter table public.n8n_chat_histories alter column creado_en set default now();
create index if not exists n8n_chat_histories_creado_en on public.n8n_chat_histories (creado_en);
create index if not exists n8n_chat_histories_session on public.n8n_chat_histories (session_id, id);

create table if not exists public.alex_reportes (
  id        bigint generated always as identity primary key,
  tipo      text not null check (tipo in ('semanal', 'avance')),
  desde     date not null,
  hasta     date not null,
  resumen   text not null,
  datos     jsonb,
  salida    jsonb,
  modelo    text,
  creado_en timestamptz not null default now()
);

create table if not exists public.alex_directivas (
  id           bigint generated always as identity primary key,
  texto        text not null,
  motivo       text,
  propuesta_id bigint,
  activa       boolean not null default true,
  creada_en    timestamptz not null default now(),
  retirada_en  timestamptz
);

create table if not exists public.alex_propuestas (
  id             bigint generated always as identity primary key,
  reporte_id     bigint references public.alex_reportes (id) on delete set null,
  tipo           text not null check (tipo in ('agregar', 'retirar', 'infraestructura')),
  titulo         text not null,
  problema       text,
  evidencia      text,
  directiva      text,
  directiva_id   bigint references public.alex_directivas (id) on delete set null,
  impacto        text,
  estado         text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada', 'caducada')),
  token          uuid not null default gen_random_uuid(),
  creado_en      timestamptz not null default now(),
  decidido_en    timestamptz,
  decidido_desde text
);

create table if not exists public.alex_costos_config (
  clave       text primary key,
  valor       numeric not null,
  nota        text,
  fuente      text,
  actualizado date not null default current_date
);

alter table public.alex_reportes enable row level security;
alter table public.alex_directivas enable row level security;
alter table public.alex_propuestas enable row level security;
alter table public.alex_costos_config enable row level security;
revoke all on public.alex_reportes, public.alex_directivas, public.alex_propuestas, public.alex_costos_config from anon, authenticated;

insert into public.alex_costos_config (clave, valor, nota, fuente) values
  ('ia_usd_millon_entrada', 0.25, 'Gemini 3.1 Flash-Lite, tokens de entrada', 'Listados de precios de terceros (oct 2026); confirmar en ai.google.dev/gemini-api/docs/pricing'),
  ('ia_usd_millon_salida', 1.50, 'Gemini 3.1 Flash-Lite, tokens de salida', 'Listados de precios de terceros (oct 2026); confirmar en ai.google.dev/gemini-api/docs/pricing'),
  ('tokens_entrada_por_llamada', 16000, 'Promedio por llamada al modelo: prompt + herramientas + memoria', 'Medido 15,169 con el prompt 3.3 (ejecución 67141, 2026-11-17)'),
  ('tokens_salida_por_llamada', 60, 'Promedio de respuesta', 'Medido 30 con el prompt 3.3 (ejecución 67141); redondeado hacia arriba'),
  ('imagen_usd', 0.002, 'Análisis de una imagen o documento (Gemini 2.5)', 'Estimado'),
  ('audio_usd', 0.003, 'Transcripción de una nota de voz (~30 s)', 'Estimado con US$0.006 por minuto'),
  ('wa_servicio_usd', 0.0085, 'Mensaje de servicio de WhatsApp a México, después de los gratis', 'Guías de terceros dicen que Meta lo cobra a la tarifa de utilidad; la tarifa oficial no se pudo leer. Confirmar en la tarjeta de tarifas de Meta'),
  ('wa_gratis_mes', 1000, 'Mensajes de servicio gratis al mes por número', 'developers.facebook.com/documentation/business-messaging/whatsapp/pricing (vigente desde 2026-10-01)'),
  ('wa_anuncio_horas', 72, 'Horas gratis cuando el cliente llega de un anuncio de clic a WhatsApp', 'Meta dice 72 h en una página y hasta 7 días en otra; se usa la menor')
on conflict (clave) do nothing;

-- Mensajes de texto de la conversación (sin llamadas ni resultados de herramientas).
create or replace view public.alex_mensajes
with (security_invoker = true) as
select id, session_id, creado_en,
       message->>'type' as quien,
       message->>'content' as texto
  from public.n8n_chat_histories
 where message->>'type' in ('human', 'ai')
   and btrim(coalesce(message->>'content', '')) <> ''
   and message->>'content' !~ '^\s*(\[\s*[\{\]]|Calling tools)';

revoke all on public.alex_mensajes from anon, authenticated;

-- En qué punto se quedó una conversación, según lo último que dijo Alex.
create or replace function public.alex_punto_de_fuga(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when t is null then 'Sin respuesta de Alex'
    when t ~* '\mINE\M' then 'Alex pidió la INE y no llegó'
    when t ~* 'c[oó]mo recibes' then 'Pregunta de ingresos'
    when t ~* 'cu[aá]nto tiempo llevas' then 'Pregunta de antigüedad'
    when t ~* 'municipio' then 'Pregunta de municipio'
    when t ~* 'te acomoda|quincena|por semana|aproximad' then 'Después de una cotización'
    when t ~* 'cat[aá]logo|canva\.site' then 'Después de mandar el catálogo'
    when t ~* 'Alejandro Acosta|Emmanuel Bernal|un asesor' then 'Después de pasarlo con un asesor'
    when t ~* 'modelo en mente|para qu[eé] la' then 'Pregunta de qué moto quiere'
    when t ~* 'tu nombre|c[oó]mo te llamas' then 'Alex pidió el nombre'
    else 'Otro'
  end
$$;

-- Texto de un mensaje para mostrarlo fuera: sin números largos y sin el detalle de documentos.
create or replace function public.alex_texto_seguro(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when t ~ 'ANALIZAD' then '[mandó un archivo] ' || coalesce(substring(t from 'TIPO:[^\n]*'), '')
    else left(regexp_replace(regexp_replace(t, '\d{7,}', '[número]', 'g'), '\s+', ' ', 'g'), 300)
  end
$$;

create or replace function public.alex_directivas_texto()
returns text
language sql
stable
set search_path = ''
as $$
  select string_agg(n || '. ' || texto, E'\n' order by n)
    from (select row_number() over (order by id) as n, texto
            from public.alex_directivas where activa) d
$$;

-- Lo que Alex lee antes de contestar: anuncio, tarjeta de Marga y directivas del Supervisor.
create or replace function public.alex_contexto(p_conversation_id text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'anuncio', (
      select left(regexp_replace(coalesce(o.anuncio_texto, ''), '\s+', ' ', 'g'), 280)
        from public.leads_origen o
       where o.conversation_id::text = btrim(p_conversation_id)
       order by o.llegada desc limit 1),
    'tarjeta', (
      select jsonb_build_object(
               'seccion', c.data->>'section',
               'columna', c.data->>'stage',
               'vendedor', c.data->>'createdBy',
               'en_proceso', c.data->>'section' <> 'prospectos',
               'buro_autorizado', coalesce((c.data->>'buroAutorizado')::boolean, false))
        from public.marga_clients c
       where c.id = 'alex-' || btrim(p_conversation_id)
          or c.data->>'conversationId' = btrim(p_conversation_id)
       order by (c.id = 'alex-' || btrim(p_conversation_id)) desc
       limit 1),
    'directivas', public.alex_directivas_texto()
  )
$$;

-- Embudo de un periodo [p_desde, p_hasta).
create or replace function public.alex_embudo_periodo(p_desde timestamptz, p_hasta timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'conversaciones', count(*),
    'interesados', count(interesado_at),
    'con_documentos', count(docs_at),
    'aptos_con_documentos', count(docs_apto_at),
    'no_cumplen', count(no_cumple_at),
    'pasaron_a_proceso', count(proceso_at),
    'ventas', count(venta_at),
    'pct_aptos_con_documentos', round(100.0 * count(docs_apto_at) / nullif(count(*), 0), 1))
  from public.alex_embudo
  where primera_vez >= p_desde and primera_vez < p_hasta
$$;

-- Costo estimado de Alex: lo medido en los últimos p_dias y su proyección a 30 días.
create or replace function public.alex_costos(p_dias int default 30)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c        jsonb;
  v_min    timestamptz;
  v_desde  timestamptz;
  v_dias   numeric;
  v_llam   bigint;  v_resp bigint;  v_resp_cobrables bigint;  v_img bigint;  v_aud bigint;
  v_ia     numeric;  v_factor numeric;  v_wa_mes numeric;  v_cobrables numeric;
  v_config jsonb;
begin
  select jsonb_object_agg(clave, valor) into c from public.alex_costos_config;
  select jsonb_agg(jsonb_build_object('clave', clave, 'valor', valor, 'nota', nota, 'fuente', fuente) order by clave)
    into v_config from public.alex_costos_config;
  -- La hora de cada mensaje se guarda desde el 2026-11-16: antes de eso no hay con qué medir.
  select min(creado_en) into v_min from public.n8n_chat_histories where creado_en is not null;
  if v_min is null then
    return jsonb_build_object('medido', false, 'config', v_config);
  end if;
  v_desde := greatest(v_min, now() - make_interval(days => p_dias));
  -- Con menos de un día medido la proyección se dispara: se proyecta como si fuera un día completo.
  v_dias := greatest(extract(epoch from now() - v_desde) / 86400.0, 1);
  select count(*) filter (where h.message->>'type' = 'ai'),
         count(*) filter (where h.message->>'type' = 'human' and h.message->>'content' ~ '\[(IMAGEN|DOCUMENTO) ANALIZAD'),
         count(*) filter (where h.message->>'type' = 'human' and h.message->>'content' ~ 'AUDIO TRANSCRITO')
    into v_llam, v_img, v_aud
    from public.n8n_chat_histories h where h.creado_en >= v_desde;
  select count(*),
         count(*) filter (where not exists (
           select 1 from public.leads_origen o
            where o.conversation_id::text = m.session_id
              and m.creado_en <= o.llegada + make_interval(hours => (c->>'wa_anuncio_horas')::int)))
    into v_resp, v_resp_cobrables
    from public.alex_mensajes m where m.quien = 'ai' and m.creado_en >= v_desde;
  v_ia := v_llam * ((c->>'tokens_entrada_por_llamada')::numeric * (c->>'ia_usd_millon_entrada')::numeric
                  + (c->>'tokens_salida_por_llamada')::numeric * (c->>'ia_usd_millon_salida')::numeric) / 1e6
        + v_img * (c->>'imagen_usd')::numeric + v_aud * (c->>'audio_usd')::numeric;
  v_factor := 30.0 / v_dias;
  v_wa_mes := v_resp_cobrables * v_factor;
  v_cobrables := greatest(v_wa_mes - (c->>'wa_gratis_mes')::numeric, 0);
  return jsonb_build_object(
    'medido', true,
    'preliminar', extract(epoch from now() - v_desde) / 86400.0 < 7,
    'desde', v_desde,
    'dias_medidos', round(extract(epoch from now() - v_desde) / 86400.0, 1),
    'llamadas_modelo', v_llam,
    'respuestas_enviadas', v_resp,
    'respuestas_fuera_de_ventana_de_anuncio', v_resp_cobrables,
    'imagenes', v_img,
    'audios', v_aud,
    'ia_usd_medido', round(v_ia, 2),
    'ia_usd_mes', round(v_ia * v_factor, 2),
    'wa_mensajes_mes', round(v_wa_mes),
    'wa_gratis_mes', (c->>'wa_gratis_mes')::numeric,
    'wa_cobrables_mes', round(v_cobrables),
    'wa_usd_mes', round(v_cobrables * (c->>'wa_servicio_usd')::numeric, 2),
    'total_usd_mes', round(v_ia * v_factor + v_cobrables * (c->>'wa_servicio_usd')::numeric, 2),
    'config', v_config);
end $$;

-- Lo que lee el Supervisor antes de escribir su reporte.
create or replace function public.alex_supervisor_datos(p_dias int default 7)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with lim as (
    select now() - make_interval(days => p_dias) as desde, now() - make_interval(days => 2 * p_dias) as antes
  ),
  conv as (
    select e.*,
           (select m.texto from public.alex_mensajes m
             where m.session_id = e.conversation_id and m.quien = 'ai' order by m.id desc limit 1) as ultimo_alex,
           (select count(*) from public.alex_mensajes m
             where m.session_id = e.conversation_id and m.quien = 'human') as mensajes_cliente
      from public.alex_embudo e, lim where e.primera_vez >= lim.desde
  ),
  charla as (
    select c.conversation_id,
           (select jsonb_agg(x.linea order by x.id) from (
              select m.id, case m.quien when 'human' then 'Cliente: ' else 'Alex: ' end || public.alex_texto_seguro(m.texto) as linea
                from public.alex_mensajes m where m.session_id = c.conversation_id order by m.id desc limit 10) x) as mensajes
      from conv c
  )
  select jsonb_build_object(
    'meta', 'Clientes aptos (crédito o contado) que mandan documentación',
    'dias', p_dias,
    'periodo', jsonb_build_object('desde', (select (desde at time zone 'America/Monterrey')::date from lim),
                                  'hasta', (now() at time zone 'America/Monterrey')::date),
    'embudo_actual', (select public.alex_embudo_periodo(desde, now()) from lim),
    'embudo_anterior', (select public.alex_embudo_periodo(antes, desde) from lim),
    'historico_semanal', (select coalesce(jsonb_agg(to_jsonb(s) order by s.semana), '[]'::jsonb)
                            from (select * from public.alex_embudo_semanal limit 8) s),
    'donde_se_quedaron', (select coalesce(jsonb_object_agg(punto, n), '{}'::jsonb) from (
        select public.alex_punto_de_fuga(ultimo_alex) as punto, count(*) as n
          from conv where docs_at is null and proceso_at is null group by 1) f),
    'por_columna_de_marga', (select coalesce(jsonb_object_agg(coalesce(columna, 'sin columna'), n), '{}'::jsonb)
                               from (select columna, count(*) n from conv group by 1) k),
    'motivos_no_cumple', (select coalesce(jsonb_object_agg(m, n), '{}'::jsonb) from (
        select m, count(*) n from conv, regexp_split_to_table(coalesce(motivos, ''), ',') m where m <> '' group by 1) q),
    'por_anuncio', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from (
        select coalesce(left(regexp_replace(max(o.anuncio_texto), '\s+', ' ', 'g'), 70), 'sin anuncio') as anuncio,
               count(*) as conversaciones, count(c.docs_apto_at) as aptos_con_documentos
          from conv c left join public.leads_origen o on o.conversation_id::text = c.conversation_id
         group by coalesce(o.ad_id, 'sin anuncio') order by 2 desc limit 6) a),
    'conversaciones_que_se_quedaron', (select coalesce(jsonb_agg(z), '[]'::jsonb) from (
        select jsonb_build_object('conversacion', c.conversation_id, 'columna', c.columna, 'moto', c.moto,
                 'perfil', c.perfil, 'punto', public.alex_punto_de_fuga(c.ultimo_alex), 'mensajes', ch.mensajes) as z
          from conv c join charla ch using (conversation_id)
         where c.docs_at is null and c.proceso_at is null and c.mensajes_cliente >= 2
         order by (c.interesado_at is not null) desc, c.mensajes_cliente desc limit 12) s),
    'conversaciones_que_mandaron_documentos', (select coalesce(jsonb_agg(z), '[]'::jsonb) from (
        select jsonb_build_object('conversacion', c.conversation_id, 'moto', c.moto, 'perfil', c.perfil,
                 'apto', c.docs_apto_at is not null, 'mensajes', ch.mensajes) as z
          from conv c join charla ch using (conversation_id)
         where c.docs_at is not null order by c.docs_at desc limit 5) s),
    'directivas_activas', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', d.id, 'texto', d.texto, 'motivo', d.motivo, 'desde', (d.creada_en at time zone 'America/Monterrey')::date,
          'dias_activa', round(extract(epoch from now() - d.creada_en) / 86400.0, 1),
          'embudo_desde_que_esta', public.alex_embudo_periodo(d.creada_en, now()),
          'embudo_7_dias_antes', public.alex_embudo_periodo(d.creada_en - interval '7 days', d.creada_en)) order by d.id), '[]'::jsonb)
        from public.alex_directivas d where d.activa),
    'propuestas_pendientes', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'tipo', tipo, 'titulo', titulo, 'directiva', directiva) order by id), '[]'::jsonb)
                                from public.alex_propuestas where estado = 'pendiente'),
    'decisiones_recientes', (select coalesce(jsonb_agg(z), '[]'::jsonb) from (
        select jsonb_build_object('id', id, 'tipo', tipo, 'titulo', titulo, 'directiva', directiva, 'estado', estado) as z
          from public.alex_propuestas where estado in ('aprobada', 'rechazada') order by decidido_en desc limit 12) s),
    'costos', public.alex_costos(30) - 'config'
  )
$$;

-- Guarda un reporte y sus propuestas. Devuelve el id del reporte y las propuestas con su token.
create or replace function public.alex_supervisor_guardar(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_tipo text := case when p->>'tipo' = 'semanal' then 'semanal' else 'avance' end;
  v_rep  bigint;
  v_p    jsonb;
  v_t    text;
  v_dir  text;
  v_did  bigint;
  v_out  jsonb := '[]'::jsonb;
  v_fila public.alex_propuestas;
  v_n    int := 0;
begin
  if btrim(coalesce(p->>'resumen', '')) = '' then
    raise exception 'alex_supervisor_guardar: falta el resumen';
  end if;
  insert into public.alex_reportes (tipo, desde, hasta, resumen, datos, salida, modelo)
  values (v_tipo, (p->>'desde')::date, (p->>'hasta')::date, p->>'resumen', p->'datos', p->'salida', p->>'modelo')
  returning id into v_rep;
  if v_tipo = 'semanal' then
    -- Cada lunes se decide lo de esa semana: lo que quedó sin decidir de la anterior caduca.
    update public.alex_propuestas set estado = 'caducada', decidido_en = now(), decidido_desde = 'caducidad'
     where estado = 'pendiente';
    for v_p in select * from jsonb_array_elements(coalesce(p->'propuestas', '[]'::jsonb)) loop
      exit when v_n >= 4;
      v_t := lower(btrim(coalesce(v_p->>'tipo', '')));
      v_dir := nullif(btrim(coalesce(v_p->>'directiva', '')), '');
      v_did := nullif(regexp_replace(coalesce(v_p->>'directiva_id', ''), '\D', '', 'g'), '')::bigint;
      continue when v_t not in ('agregar', 'retirar', 'infraestructura');
      continue when btrim(coalesce(v_p->>'titulo', '')) = '';
      continue when v_t = 'agregar' and (v_dir is null or length(v_dir) < 20 or length(v_dir) > 700);
      continue when v_t = 'retirar' and not exists (select 1 from public.alex_directivas where id = v_did and activa);
      insert into public.alex_propuestas (reporte_id, tipo, titulo, problema, evidencia, directiva, directiva_id, impacto)
      values (v_rep, v_t, left(v_p->>'titulo', 140), v_p->>'problema', v_p->>'evidencia',
              case when v_t = 'agregar' then v_dir end, case when v_t = 'retirar' then v_did end, v_p->>'impacto')
      returning * into v_fila;
      v_n := v_n + 1;
      v_out := v_out || jsonb_build_object('id', v_fila.id, 'tipo', v_fila.tipo, 'titulo', v_fila.titulo,
        'problema', v_fila.problema, 'evidencia', v_fila.evidencia, 'directiva', v_fila.directiva,
        'directiva_id', v_fila.directiva_id, 'impacto', v_fila.impacto, 'token', v_fila.token,
        'directiva_a_retirar', (select texto from public.alex_directivas where id = v_fila.directiva_id));
    end loop;
  end if;
  return jsonb_build_object('reporte_id', v_rep, 'tipo', v_tipo, 'propuestas', v_out);
end $$;

-- Decide UNA vez una propuesta. Aprobar "agregar" enciende la directiva; aprobar "retirar" la apaga;
-- aprobar "infraestructura" solo la deja anotada (la hace una persona).
create or replace function public.alex_decidir(p_id bigint, p_accion text, p_token uuid, p_desde text default 'telegram')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v public.alex_propuestas;
  v_accion text := lower(btrim(coalesce(p_accion, '')));
  v_activas int;
begin
  if v_accion not in ('aprobar', 'rechazar') then
    return jsonb_build_object('ok', false, 'error', 'Acción no válida.');
  end if;
  select * into v from public.alex_propuestas where id = p_id for update;
  if not found or (p_token is not null and v.token <> p_token) then
    return jsonb_build_object('ok', false, 'error', 'No encontré esa propuesta.');
  end if;
  if v.estado <> 'pendiente' then
    return jsonb_build_object('ok', true, 'cambio', false, 'estado', v.estado, 'titulo', v.titulo,
      'mensaje', case v.estado when 'caducada' then 'Esta propuesta ya caducó.'
                 else 'Ya estaba ' || v.estado || ' (desde ' || coalesce(v.decidido_desde, '?') || ').' end);
  end if;
  if v_accion = 'aprobar' and v.tipo = 'agregar' then
    select count(*) into v_activas from public.alex_directivas where activa;
    if v_activas >= 8 then
      return jsonb_build_object('ok', false, 'titulo', v.titulo,
        'error', 'Ya hay 8 directivas activas. Retira una antes de aprobar otra.');
    end if;
    insert into public.alex_directivas (texto, motivo, propuesta_id) values (v.directiva, v.problema, v.id);
  elsif v_accion = 'aprobar' and v.tipo = 'retirar' then
    update public.alex_directivas set activa = false, retirada_en = now() where id = v.directiva_id and activa;
  end if;
  update public.alex_propuestas
     set estado = case v_accion when 'aprobar' then 'aprobada' else 'rechazada' end,
         decidido_en = now(), decidido_desde = coalesce(nullif(btrim(p_desde), ''), 'telegram')
   where id = v.id;
  return jsonb_build_object('ok', true, 'cambio', true, 'titulo', v.titulo, 'tipo', v.tipo,
    'estado', case v_accion when 'aprobar' then 'aprobada' else 'rechazada' end,
    'mensaje', case
      when v_accion = 'rechazar' then 'Rechazada. Alex sigue igual.'
      when v.tipo = 'agregar' then 'Aprobada. Alex ya la aplica desde su siguiente mensaje.'
      when v.tipo = 'retirar' then 'Aprobada. Alex dejó de aplicar esa directiva.'
      else 'Aprobada. Este cambio no es automático: queda anotado para hacerlo a mano.' end);
end $$;

-- Todo lo que muestra la pestaña "Alex IA".
create or replace function public.alex_panel(p_dias int default 56)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with lim as (select (now() at time zone 'America/Monterrey')::date as hoy,
                      least(greatest(coalesce(p_dias, 56), 7), 180) as dias)
  select jsonb_build_object(
    'generado', now(),
    'dias', (select dias from lim),
    'porDia', (select coalesce(jsonb_agg(jsonb_build_object('fecha', d.dia, 'conversaciones', coalesce(e.n, 0),
                 'conDocumentos', coalesce(e.docs, 0), 'aptos', coalesce(e.aptos, 0)) order by d.dia), '[]'::jsonb)
        from lim, generate_series(lim.hoy - (lim.dias - 1), lim.hoy, interval '1 day') as g(x)
        cross join lateral (select g.x::date as dia) d
        left join (
          select (primera_vez at time zone 'America/Monterrey')::date as dia, count(*) n,
                 count(docs_at) docs, count(docs_apto_at) aptos
            from public.alex_embudo group by 1) e on e.dia = d.dia),
    'porSemana', (select coalesce(jsonb_agg(to_jsonb(s) order by s.semana), '[]'::jsonb)
                    from (select * from public.alex_embudo_semanal limit 12) s),
    'periodo', (select public.alex_embudo_periodo((lim.hoy - (lim.dias - 1))::timestamp at time zone 'America/Monterrey', now()) from lim),
    'semana', public.alex_embudo_periodo(now() - interval '7 days', now()),
    'semanaAnterior', public.alex_embudo_periodo(now() - interval '14 days', now() - interval '7 days'),
    'dondeSeQuedaron', (public.alex_supervisor_datos(7))->'donde_se_quedaron',
    'reportes', (select coalesce(jsonb_agg(z), '[]'::jsonb) from (
        select jsonb_build_object('id', id, 'tipo', tipo, 'desde', desde, 'hasta', hasta, 'resumen', resumen, 'creado', creado_en) as z
          from public.alex_reportes order by id desc limit 12) r),
    'propuestas', (select coalesce(jsonb_agg(z), '[]'::jsonb) from (
        select jsonb_build_object('id', p.id, 'tipo', p.tipo, 'titulo', p.titulo, 'problema', p.problema, 'evidencia', p.evidencia,
                 'directiva', coalesce(p.directiva, d.texto), 'impacto', p.impacto, 'estado', p.estado, 'creado', p.creado_en,
                 'decidido', p.decidido_en, 'desde', p.decidido_desde) as z
          from public.alex_propuestas p left join public.alex_directivas d on d.id = p.directiva_id
         order by (p.estado = 'pendiente') desc, p.id desc limit 20) q),
    'directivas', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'texto', texto, 'motivo', motivo, 'desde', creada_en) order by id), '[]'::jsonb)
                     from public.alex_directivas where activa),
    'costos', public.alex_costos(30)
  )
$$;

revoke all on function public.alex_punto_de_fuga(text), public.alex_texto_seguro(text), public.alex_directivas_texto(),
  public.alex_contexto(text), public.alex_embudo_periodo(timestamptz, timestamptz), public.alex_costos(int),
  public.alex_supervisor_datos(int), public.alex_supervisor_guardar(jsonb), public.alex_decidir(bigint, text, uuid, text),
  public.alex_panel(int) from public, anon, authenticated;
grant execute on function public.alex_contexto(text), public.alex_costos(int), public.alex_supervisor_datos(int),
  public.alex_supervisor_guardar(jsonb), public.alex_decidir(bigint, text, uuid, text), public.alex_panel(int) to service_role;

-- Marga: solo el administrador (misma regla que Publicidad y agencia).
create or replace function public.marga_panel_alex(p_dias int default 56)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(public.marga_rol(), '') <> 'admin' then
    raise exception 'Solo el administrador puede ver el panel de Alex.' using errcode = '42501';
  end if;
  return public.alex_panel(p_dias);
end $$;

create or replace function public.marga_alex_decidir(p_id bigint, p_accion text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.marga_rol(), '') <> 'admin' then
    raise exception 'Solo el administrador puede decidir.' using errcode = '42501';
  end if;
  return public.alex_decidir(p_id, p_accion, null, 'marga');
end $$;

revoke all on function public.marga_panel_alex(int), public.marga_alex_decidir(bigint, text) from public, anon;
grant execute on function public.marga_panel_alex(int), public.marga_alex_decidir(bigint, text) to authenticated;
