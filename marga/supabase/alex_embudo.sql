-- Embudo de Alex (proyecto ehyqexzaauvjoioafqdz).
--
-- La medida de éxito de Alex es: clientes APTOS que mandan documentación.
-- Las tarjetas del bot en `marga_clients` caducan a los 7 días, así que no sirven
-- para medir. Esta tabla guarda una fila por conversación, que no caduca, y se
-- llena sola con un disparador sobre `marga_clients` (no hay que tocar n8n).
--
--   alex_embudo              una fila por conversación, con la fecha de cada paso
--   alex_embudo_semanal      el embudo por semana (hora de Saltillo)
--   alex_embudo_por_anuncio  el mismo embudo por anuncio de origen (leads_origen)
--   alex_embudo_resumen(d)   resumen de los últimos d días, en JSON (n8n / Bartersito)
--   alex_contexto(conv)      lo que Alex lee antes de contestar: anuncio y tarjeta de Marga
--
-- "Apto con documentos" = mandó documentos y, a crédito, requisitos = cumple;
-- de contado, basta con que no esté marcado no_cumple.

create table if not exists public.alex_embudo (
  conversation_id text primary key,
  primera_vez     timestamptz not null default now(),
  ultima_vez      timestamptz not null default now(),
  vendedor        text,
  moto            text,
  compra          text,
  perfil          text,
  temperatura     text,
  requisitos      text,
  motivos         text,
  alternativa     text,
  columna         text,
  seccion         text,
  documentos      text,
  interesado_at   timestamptz,  -- llegó a cotizado/calificado
  docs_at         timestamptz,  -- mandó documentos (apto o no)
  docs_apto_at    timestamptz,  -- mandó documentos Y es apto: la medida que se maximiza
  no_cumple_at    timestamptz,  -- se marcó que no cumple requisitos
  proceso_at      timestamptz,  -- un vendedor lo pasó a Procesos
  venta_at        timestamptz   -- llegó a Ventas
);

alter table public.alex_embudo enable row level security;
revoke all on public.alex_embudo from anon, authenticated;

create or replace function public.alex_embudo_registrar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  d      jsonb := new.data;
  v_conv text  := nullif(btrim(coalesce(d->>'conversationId', '')), '');
  v_car  jsonb := coalesce(d->'caracteristicas', '{}'::jsonb);
  v_docs text  := nullif(btrim(coalesce(d->'atributos'->>'documentos', '')), '');
  v_req  text  := nullif(v_car->>'requisitos', '');
  v_compra text := nullif(v_car->>'compra', '');
  v_col  text  := d->>'stage';
  v_sec  text  := d->>'section';
  v_apto boolean;
  v_ahora timestamptz := now();
begin
  if d->>'origen' is distinct from 'alex' or v_conv is null then
    return new;
  end if;
  v_apto := v_docs is not null and v_docs !~* 'no apta'
            and (v_req = 'cumple' or (v_compra = 'contado' and v_req is distinct from 'no_cumple'));
  insert into public.alex_embudo as e (
    conversation_id, primera_vez, ultima_vez, vendedor, moto, compra, perfil, temperatura,
    requisitos, motivos, alternativa, columna, seccion, documentos,
    interesado_at, docs_at, docs_apto_at, no_cumple_at, proceso_at, venta_at)
  values (
    v_conv,
    coalesce(to_timestamp((d->>'createdAt')::bigint / 1000.0), v_ahora), v_ahora,
    d->>'createdBy', nullif(d->>'motorcycles', ''), v_compra, nullif(v_car->>'perfil', ''),
    nullif(v_car->>'temperatura', ''), v_req,
    (select string_agg(x, ',') from jsonb_array_elements_text(
       case when jsonb_typeof(v_car->'motivos') = 'array' then v_car->'motivos' else '[]'::jsonb end) x),
    nullif(v_car->>'alternativa', ''), v_col, v_sec, v_docs,
    case when v_col in ('interesado_proceso', 'envio_docs_cita', 'envio_docs_no_cumple') then v_ahora end,
    case when v_docs is not null then v_ahora end,
    case when v_apto then v_ahora end,
    case when v_req = 'no_cumple' then v_ahora end,
    case when v_sec = 'procesos' then v_ahora end,
    case when v_sec = 'ventas' then v_ahora end)
  on conflict (conversation_id) do update set
    ultima_vez    = excluded.ultima_vez,
    vendedor      = coalesce(excluded.vendedor, e.vendedor),
    moto          = coalesce(excluded.moto, e.moto),
    compra        = coalesce(excluded.compra, e.compra),
    perfil        = coalesce(excluded.perfil, e.perfil),
    temperatura   = coalesce(excluded.temperatura, e.temperatura),
    requisitos    = coalesce(excluded.requisitos, e.requisitos),
    motivos       = coalesce(excluded.motivos, e.motivos),
    alternativa   = coalesce(excluded.alternativa, e.alternativa),
    columna       = coalesce(excluded.columna, e.columna),
    seccion       = coalesce(excluded.seccion, e.seccion),
    documentos    = coalesce(excluded.documentos, e.documentos),
    interesado_at = coalesce(e.interesado_at, excluded.interesado_at),
    docs_at       = coalesce(e.docs_at, excluded.docs_at),
    docs_apto_at  = coalesce(e.docs_apto_at, excluded.docs_apto_at),
    no_cumple_at  = coalesce(e.no_cumple_at, excluded.no_cumple_at),
    proceso_at    = coalesce(e.proceso_at, excluded.proceso_at),
    venta_at      = coalesce(e.venta_at, excluded.venta_at);
  return new;
exception when others then
  -- Medir nunca debe impedir que Marga guarde un cliente.
  return new;
end $$;

revoke all on function public.alex_embudo_registrar() from public, anon, authenticated;

drop trigger if exists alex_embudo_registrar on public.marga_clients;
create trigger alex_embudo_registrar
  after insert or update on public.marga_clients
  for each row execute function public.alex_embudo_registrar();

-- Embudo por semana (lunes a domingo, hora de Saltillo).
create or replace view public.alex_embudo_semanal
with (security_invoker = true) as
select
  date_trunc('week', primera_vez at time zone 'America/Monterrey')::date as semana,
  count(*)                                   as conversaciones,
  count(interesado_at)                       as interesados,
  count(docs_at)                             as con_documentos,
  count(docs_apto_at)                        as aptos_con_documentos,
  count(no_cumple_at)                        as no_cumplen,
  count(proceso_at)                          as pasaron_a_proceso,
  count(venta_at)                            as ventas,
  round(100.0 * count(docs_apto_at) / nullif(count(*), 0), 1) as pct_aptos_con_documentos
from public.alex_embudo
group by 1
order by 1 desc;

-- El mismo embudo por anuncio de origen: qué anuncio trae clientes aptos que sí mandan papeles.
create or replace view public.alex_embudo_por_anuncio
with (security_invoker = true) as
select
  coalesce(o.ad_id, 'sin anuncio')            as ad_id,
  max(left(regexp_replace(coalesce(o.anuncio_texto, ''), '\s+', ' ', 'g'), 90)) as anuncio,
  count(*)                                    as conversaciones,
  count(e.docs_at)                            as con_documentos,
  count(e.docs_apto_at)                       as aptos_con_documentos,
  count(e.no_cumple_at)                       as no_cumplen,
  round(100.0 * count(e.docs_apto_at) / nullif(count(*), 0), 1) as pct_aptos_con_documentos
from public.alex_embudo e
left join public.leads_origen o on o.conversation_id::text = e.conversation_id
group by 1
order by aptos_con_documentos desc, conversaciones desc;

revoke all on public.alex_embudo_semanal, public.alex_embudo_por_anuncio from anon, authenticated;

-- Resumen de los últimos p_dias días, para un reporte o para preguntarlo desde Bartersito.
create or replace function public.alex_embudo_resumen(p_dias int default 7)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'dias', p_dias,
    'conversaciones', count(*),
    'interesados', count(interesado_at),
    'con_documentos', count(docs_at),
    'aptos_con_documentos', count(docs_apto_at),
    'no_cumplen', count(no_cumple_at),
    'pasaron_a_proceso', count(proceso_at),
    'ventas', count(venta_at),
    'pct_aptos_con_documentos', round(100.0 * count(docs_apto_at) / nullif(count(*), 0), 1),
    'motivos_no_cumple', (
      select coalesce(jsonb_object_agg(m, n), '{}'::jsonb) from (
        select m, count(*) n
          from public.alex_embudo x, regexp_split_to_table(coalesce(x.motivos, ''), ',') m
         where x.primera_vez >= now() - make_interval(days => p_dias) and m <> ''
         group by 1) s)
  )
  from public.alex_embudo
  where primera_vez >= now() - make_interval(days => p_dias)
$$;

revoke all on function public.alex_embudo_resumen(int) from public, anon, authenticated;
grant execute on function public.alex_embudo_resumen(int) to service_role;

-- Lo que Alex lee antes de contestar: de qué anuncio llegó el cliente y cómo va su
-- tarjeta en Marga (si un vendedor ya lo pasó a Procesos, Alex no vuelve a pedir papeles).
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
       limit 1)
  )
$$;

revoke all on function public.alex_contexto(text) from public, anon, authenticated;
grant execute on function public.alex_contexto(text) to service_role;

-- Carga inicial con las tarjetas del bot que existen hoy. Se inserta directo (sin
-- tocar `marga_clients`, para no disparar sus avisos); las fechas de cada paso quedan
-- en la última modificación de la tarjeta, que es lo más cercano que se conserva.
insert into public.alex_embudo (
  conversation_id, primera_vez, ultima_vez, vendedor, moto, compra, perfil, temperatura,
  requisitos, motivos, alternativa, columna, seccion, documentos,
  interesado_at, docs_at, docs_apto_at, no_cumple_at, proceso_at, venta_at)
select
  s.conv, s.creada, s.modificada, s.d->>'createdBy', nullif(s.d->>'motorcycles', ''),
  s.compra, nullif(s.car->>'perfil', ''), nullif(s.car->>'temperatura', ''), s.req,
  (select string_agg(x, ',') from jsonb_array_elements_text(
     case when jsonb_typeof(s.car->'motivos') = 'array' then s.car->'motivos' else '[]'::jsonb end) x),
  nullif(s.car->>'alternativa', ''), s.d->>'stage', s.d->>'section', s.docs,
  case when s.d->>'stage' in ('interesado_proceso', 'envio_docs_cita', 'envio_docs_no_cumple') then s.modificada end,
  case when s.docs is not null then s.modificada end,
  case when s.docs is not null and s.docs !~* 'no apta'
        and (s.req = 'cumple' or (s.compra = 'contado' and s.req is distinct from 'no_cumple')) then s.modificada end,
  case when s.req = 'no_cumple' then s.modificada end,
  case when s.d->>'section' = 'procesos' then s.modificada end,
  case when s.d->>'section' = 'ventas' then s.modificada end
from (
  select distinct on (data->>'conversationId')
         data as d,
         data->>'conversationId' as conv,
         coalesce(data->'caracteristicas', '{}'::jsonb) as car,
         nullif(data->'caracteristicas'->>'requisitos', '') as req,
         nullif(data->'caracteristicas'->>'compra', '') as compra,
         nullif(btrim(coalesce(data->'atributos'->>'documentos', '')), '') as docs,
         to_timestamp((data->>'createdAt')::bigint / 1000.0) as creada,
         to_timestamp((data->>'updatedAt')::bigint / 1000.0) as modificada
    from public.marga_clients
   where data->>'origen' = 'alex'
     and nullif(btrim(coalesce(data->>'conversationId', '')), '') is not null
   order by data->>'conversationId', (data->>'updatedAt')::bigint desc
) s
on conflict (conversation_id) do nothing;

-- ---------------------------------------------------------------------------------------------
-- 2026-11-16 (Supervisor de Alex): la INE cuenta en cuanto llega al chat.
-- Antes solo contaba si Alex anotaba `documentos` en el CRM, y su modelo a veces no lo hace.
-- Apto = la validación de la INE (edad y vigencia, calculadas por el sistema) pasa y el cliente
-- no está marcado como no_cumple. Si después se marca no_cumple, deja de contar como apto.
create or replace function public.alex_embudo_desde_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t text := new.message->>'content';
  v_valida boolean;
begin
  if new.message->>'type' = 'human' and t ~* 'TIPO:\s*INE' then
    v_valida := t ~ '-> CUMPLE' and t ~ '-> VIGENTE';
    update public.alex_embudo
       set docs_at = coalesce(docs_at, now()),
           documentos = coalesce(documentos, 'INE (vista en el chat)'),
           docs_apto_at = case when v_valida and requisitos is distinct from 'no_cumple'
                               then coalesce(docs_apto_at, now()) else docs_apto_at end,
           ultima_vez = now()
     where conversation_id = new.session_id;
  end if;
  return new;
exception when others then
  -- Medir nunca debe impedir que Alex guarde su memoria.
  return new;
end $$;

revoke all on function public.alex_embudo_desde_chat() from public, anon, authenticated;

drop trigger if exists alex_embudo_desde_chat on public.n8n_chat_histories;
create trigger alex_embudo_desde_chat
  after insert on public.n8n_chat_histories
  for each row execute function public.alex_embudo_desde_chat();

create or replace function public.alex_embudo_no_cumple()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.requisitos = 'no_cumple' then
    new.docs_apto_at := null;
  end if;
  return new;
end $$;

revoke all on function public.alex_embudo_no_cumple() from public, anon, authenticated;

drop trigger if exists alex_embudo_no_cumple on public.alex_embudo;
create trigger alex_embudo_no_cumple
  before insert or update on public.alex_embudo
  for each row execute function public.alex_embudo_no_cumple();

-- Historia: conversaciones donde ya se había recibido una INE antes de empezar a medir.
-- Cuentan como "con documentos"; si eran aptas no se puede saber (no se validaba la INE).
update public.alex_embudo e
   set docs_at = e.ultima_vez,
       documentos = coalesce(e.documentos, 'INE (vista en el chat, antes de medir)')
 where e.docs_at is null
   and exists (select 1 from public.n8n_chat_histories h
                where h.session_id = e.conversation_id
                  and h.message->>'type' = 'human'
                  and h.message->>'content' ~* 'TIPO:\s*INE');
