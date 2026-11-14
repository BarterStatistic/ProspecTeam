-- Publicidad y agencia (Panel ADMIN de Marga, solo administrador).
--
-- Una sola función de lectura que resume, para los últimos `p_dias`:
--   · gasto de la cuenta propia de anuncios (ads_insights) y su reparto por día
--   · costo de IA de la agencia, en dólares (agencia_costos)
--   · leads por anuncio (leads_origen) cruzados con su tarjeta de Marga
--     (marga_clients.data->>'conversationId'): calientes y ventas
--   · lo de hoy, lo que espera decisión y la última corrida de cada flujo
--
-- No abre ninguna tabla: las de la agencia siguen sin política de lectura para
-- los usuarios de Marga. La función corre como dueña (security definer) y
-- rechaza a quien no sea administrador (marga_rol(), ver marga_auth_base.sql),
-- así que ni vendedores ni promotores pueden leer esto, tampoco por la API.
--
-- Límite conocido: la mayoría de los leads llega de anuncios de la cuenta
-- interna de Dinamo (ads_externos), cuyo gasto no se recolecta. Esos anuncios
-- salen con gasto NULL ("externo": true) en vez de con $0.

create or replace function public.marga_panel_publicidad(p_dias int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Monterrey')::date;
  v_desde date;
  v_out jsonb;
begin
  if coalesce(public.marga_rol(), '') <> 'admin' then
    raise exception 'Solo el administrador puede ver la publicidad.' using errcode = '42501';
  end if;

  v_desde := v_hoy - (least(greatest(coalesce(p_dias, 30), 1), 180) - 1);

  with
  nombres as (
    select ad_id, max(ad_name) as nombre, false as externo from ads_insights group by ad_id
    union all
    select e.ad_id, e.nombre, true from ads_externos e
    where not exists (select 1 from ads_insights i where i.ad_id = e.ad_id)
  ),
  -- Una tarjeta por conversación; si hay varias, gana la que ya es venta.
  tarjetas as (
    select distinct on (c.data->>'conversationId')
      c.data->>'conversationId' as conv,
      c.data->>'section' as section,
      c.data->'caracteristicas'->>'temperatura' as temperatura
    from marga_clients c
    where coalesce(c.data->>'conversationId', '') <> ''
    order by c.data->>'conversationId', (c.data->>'section' = 'ventas') desc
  ),
  leads as (
    select l.ad_id, l.llegada,
      (l.llegada at time zone 'America/Monterrey')::date as dia,
      t.section, t.temperatura
    from leads_origen l
    left join tarjetas t on t.conv = l.conversation_id::text
    where (l.llegada at time zone 'America/Monterrey')::date between v_desde and v_hoy
  ),
  gasto as (
    select ad_id, sum(spend) as gasto from ads_insights
    where fecha between v_desde and v_hoy group by ad_id
  ),
  por_anuncio as (
    select a.ad_id,
      coalesce(n.nombre, 'Anuncio sin nombre') as nombre,
      coalesce(n.externo, true) as externo,
      g.gasto,
      count(l.*) as leads,
      count(l.*) filter (where l.temperatura = 'caliente') as calientes,
      count(l.*) filter (where l.section = 'ventas') as ventas
    from (select ad_id from gasto union select ad_id from leads where ad_id is not null) a
    left join nombres n on n.ad_id = a.ad_id
    left join gasto g on g.ad_id = a.ad_id
    left join leads l on l.ad_id = a.ad_id
    group by a.ad_id, n.nombre, n.externo, g.gasto
  ),
  dias as (
    select d::date as fecha, coalesce(sum(i.spend), 0) as monto
    from generate_series(v_desde, v_hoy, interval '1 day') d
    left join ads_insights i on i.fecha = d::date
    group by d
  ),
  costos as (
    select split_part(flujo, ' - ', 1) as nombre,
      sum(usd) filter (where (creado_en at time zone 'America/Monterrey')::date >= v_desde) as usd,
      max(creado_en) as ultima
    from agencia_costos group by 1
  ),
  eventos as (
    (select l.llegada as cuando, 'lead' as tipo, 'Lead nuevo' as titulo,
        coalesce('Llegó del anuncio “' || n.nombre || '”', 'Sin anuncio identificado') as detalle
      from leads_origen l left join nombres n on n.ad_id = l.ad_id
      order by l.llegada desc limit 6)
    union all
    (select i.actualizado_en, 'idea', 'Idea #' || i.id || ' lista para revisar',
        coalesce(nullif(i.titulo_imagen, ''), left(i.enfoque, 90), 'Sin título')
      from creativo_ideas i where i.estado = 'en_revision'
      order by i.actualizado_en desc limit 5)
    union all
    (select p.creado_en, 'propuesta', 'Propuesta #' || p.id, p.titulo
      from ads_propuestas p where p.estado = 'pendiente'
      order by p.creado_en desc limit 5)
    union all
    (select a.creado_en, 'alerta', 'Alerta de anuncios', left(a.detalle, 140)
      from ads_alertas a where a.creado_en >= now() - interval '7 days'
      order by a.creado_en desc limit 3)
  )
  select jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hoy,
    'gastoAnuncios', coalesce((select sum(gasto) from gasto), 0),
    'gastoPorDia', (select jsonb_agg(jsonb_build_object('fecha', fecha, 'monto', monto) order by fecha) from dias),
    'costosUsd', coalesce((select jsonb_agg(jsonb_build_object('label', nombre, 'usd', usd) order by usd desc)
                           from costos where usd > 0), '[]'::jsonb),
    'leads', (select count(*) from leads),
    'leadsConGasto', coalesce((select sum(leads) from por_anuncio where gasto is not null), 0),
    'ventasAtribuidas', (select count(*) from leads where section = 'ventas'),
    'anuncios', coalesce((select jsonb_agg(jsonb_build_object(
        'nombre', nombre, 'externo', externo, 'gasto', gasto,
        'leads', leads, 'calientes', calientes, 'ventas', ventas)
        order by leads desc, gasto desc nulls last) from por_anuncio), '[]'::jsonb),
    'hoy', jsonb_build_object(
      'leads', (select count(*) from leads where dia = v_hoy),
      'calientes', (select count(*) from leads where dia = v_hoy and temperatura = 'caliente'),
      'sinAtender', (select count(*) from marga_clients c
                     where c.data->>'section' = 'prospectos'
                       and c.data->'caracteristicas'->'alertas' ? 'requiere_accion'),
      'porDecidir', (select count(*) from creativo_ideas where estado = 'en_revision')
                  + (select count(*) from ads_propuestas where estado = 'pendiente')),
    'enVivo', coalesce((select jsonb_agg(jsonb_build_object(
        'cuando', cuando, 'tipo', tipo, 'titulo', titulo, 'detalle', detalle) order by cuando desc)
        from eventos), '[]'::jsonb),
    'agentes', coalesce((select jsonb_agg(jsonb_build_object('nombre', nombre, 'ultima', ultima) order by ultima desc)
                         from costos), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.marga_panel_publicidad(int) from public, anon;
grant execute on function public.marga_panel_publicidad(int) to authenticated;
