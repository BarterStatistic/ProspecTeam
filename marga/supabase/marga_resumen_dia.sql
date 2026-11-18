-- Resumen del día para "Mi día" del administrador (proyecto ehyqexzaauvjoioafqdz). 2026-11-17.
--
-- Una sola lectura con lo que no está ya en los datos de Marga (clientes y citas sí lo están):
--   · Alex: conversaciones, documentos y aptos con documentos de hoy y de los últimos 7 días
--   · Publicidad: gasto de la cuenta propia hoy, ayer, 7 días y mes en curso (pesos)
--   · IA: costo de la agencia en el mes (dólares, agencia_costos) y costo estimado de Alex al mes
--   · Reportes: los últimos del Analista de Meta Ads, del Supervisor de Alex y el mensual de la gerencia
--   · Decisiones: cuántas cosas esperan decisión (agencia y Supervisor de Alex)
-- Corre como dueña y rechaza a quien no sea administrador (marga_rol()).

create or replace function public.marga_resumen_dia()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoy   date := (now() at time zone 'America/Monterrey')::date;
  v_ini   timestamptz := v_hoy::timestamp at time zone 'America/Monterrey';
  v_bandeja jsonb;
  v_alex  jsonb;
begin
  if coalesce(public.marga_rol(), '') <> 'admin' then
    raise exception 'Solo el administrador puede ver el resumen del día.' using errcode = '42501';
  end if;

  begin
    v_bandeja := public.agencia_por_decidir('dinamo');
  exception when others then
    v_bandeja := null;
  end;
  begin
    v_alex := public.alex_costos(30);
  exception when others then
    v_alex := null;
  end;

  return jsonb_build_object(
    'generado', now(),
    'hoy', v_hoy,
    'alex', jsonb_build_object(
      'hoy', public.alex_embudo_periodo(v_ini, now()),
      'semana', public.alex_embudo_periodo(now() - interval '7 days', now()),
      'semanaAnterior', public.alex_embudo_periodo(now() - interval '14 days', now() - interval '7 days')),
    'gasto', (
      select jsonb_build_object(
        'hoy', coalesce(sum(spend) filter (where fecha = v_hoy), 0),
        'ayer', coalesce(sum(spend) filter (where fecha = v_hoy - 1), 0),
        'semana', coalesce(sum(spend) filter (where fecha > v_hoy - 7), 0),
        'mes', coalesce(sum(spend) filter (where fecha >= date_trunc('month', v_hoy)::date), 0),
        'conversacionesSemana', coalesce(sum(conversaciones) filter (where fecha > v_hoy - 7), 0),
        'ultimoDia', max(fecha) filter (where spend > 0))
      from public.ads_insights),
    'ia', jsonb_build_object(
      'agenciaUsdMes', (select coalesce(round(sum(usd), 2), 0) from public.agencia_costos
                         where creado_en >= date_trunc('month', v_ini)),
      'agenciaUsdHoy', (select coalesce(round(sum(usd), 2), 0) from public.agencia_costos where creado_en >= v_ini),
      'alexUsdMes', v_alex->'total_usd_mes',
      'alexPreliminar', coalesce((v_alex->>'preliminar')::boolean, true)),
    'decisiones', jsonb_build_object(
      'agencia', case when v_bandeja is null then null else
        coalesce(jsonb_array_length(v_bandeja->'ideas'), 0) + coalesce(jsonb_array_length(v_bandeja->'piezas'), 0)
        + coalesce(jsonb_array_length(v_bandeja->'propuestas'), 0) + coalesce(jsonb_array_length(v_bandeja->'campanas'), 0)
        + coalesce(jsonb_array_length(v_bandeja->'cuentas'), 0) + coalesce(jsonb_array_length(v_bandeja->'comentarios'), 0) end,
      'alex', (select count(*) from public.alex_propuestas where estado = 'pendiente')),
    'reportes', (
      select coalesce(jsonb_agg(r order by r->>'creado' desc), '[]'::jsonb) from (
        (select jsonb_build_object('origen', 'analista', 'titulo', 'Meta Ads · reporte semanal', 'id', id,
                  'creado', creado_en, 'resumen', resumen) as r
           from public.ads_reportes order by creado_en desc limit 6)
        union all
        (select jsonb_build_object('origen', 'supervisor',
                  'titulo', case tipo when 'semanal' then 'Supervisor de Alex · semanal' else 'Supervisor de Alex · avance' end,
                  'id', id, 'creado', creado_en, 'resumen', resumen)
           from public.alex_reportes order by creado_en desc limit 6)
        union all
        (select jsonb_build_object('origen', 'mensual', 'titulo', 'Reporte mensual para la gerencia · ' || mes,
                  'id', mes, 'creado', creado_en, 'url', url)
           from public.agencia_reportes order by creado_en desc limit 3)
      ) x)
  );
end $$;

revoke all on function public.marga_resumen_dia() from public, anon;
grant execute on function public.marga_resumen_dia() to authenticated;
