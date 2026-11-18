-- Costos de IA de la agencia, desglosados (Panel ADMIN de Marga → Publicidad → "Costo de la agencia").
--
-- Una sola función de lectura sobre `agencia_costos` (una fila por llamada a un modelo) para un rango de fechas:
-- total en dólares, tokens, y el reparto por agente, por paso (flujo completo), por modelo y por día, más el
-- detalle de las últimas llamadas. El agente es lo que va antes de " - " en `flujo` ("Aprendizaje - Analizar" →
-- agente "Aprendizaje", paso "Aprendizaje - Analizar").
--
-- Igual que marga_panel_publicidad: no abre la tabla (sigue sin política de lectura para los usuarios de Marga);
-- corre como dueña (security definer) y rechaza a quien no sea administrador (marga_rol()).
-- Las fechas son días de America/Monterrey, ambos incluidos; el rango se limita a 366 días.
-- Supabase de ProspecTeam (ehyqexzaauvjoioafqdz). NO aplicar en la base de Dinamo.

create or replace function public.marga_costos_agencia(p_desde date default null, p_hasta date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Monterrey')::date;
  v_hasta date := least(coalesce(p_hasta, v_hoy), v_hoy);
  v_desde date;
  v_out jsonb;
begin
  if coalesce(public.marga_rol(), '') <> 'admin' then
    raise exception 'Solo el administrador puede ver los costos de la agencia.' using errcode = '42501';
  end if;

  v_desde := greatest(coalesce(p_desde, v_hasta - 29), v_hasta - 365);
  if v_desde > v_hasta then
    v_desde := v_hasta;
  end if;

  with filas as (
    select c.id, c.creado_en,
      (c.creado_en at time zone 'America/Monterrey')::date as dia,
      c.flujo,
      coalesce(nullif(btrim(split_part(c.flujo, ' - ', 1)), ''), c.flujo) as agente,
      coalesce(nullif(c.modelo, ''), 'sin modelo') as modelo,
      coalesce(c.tokens_entrada, 0) as tin,
      coalesce(c.tokens_salida, 0) as tout,
      c.unidades,
      c.usd
    from agencia_costos c
    where (c.creado_en at time zone 'America/Monterrey')::date between v_desde and v_hasta
  ),
  dias as (
    select d::date as fecha, coalesce(sum(f.usd), 0) as usd
    from generate_series(v_desde, v_hasta, interval '1 day') d
    left join filas f on f.dia = d::date
    group by d
  )
  select jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hasta,
    'totalUsd', coalesce((select sum(usd) from filas), 0),
    'tokensEntrada', coalesce((select sum(tin) from filas), 0),
    'tokensSalida', coalesce((select sum(tout) from filas), 0),
    'llamadas', (select count(*) from filas),
    'sinPrecio', (select count(*) from filas where usd is null),
    'porAgente', coalesce((select jsonb_agg(x order by (x->>'usd')::numeric desc nulls last)
      from (select jsonb_build_object('nombre', agente, 'usd', sum(usd), 'llamadas', count(*),
              'tokensEntrada', sum(tin), 'tokensSalida', sum(tout)) as x
            from filas group by agente) s), '[]'::jsonb),
    'porPaso', coalesce((select jsonb_agg(x order by (x->>'usd')::numeric desc nulls last)
      from (select jsonb_build_object('nombre', flujo, 'agente', agente, 'usd', sum(usd), 'llamadas', count(*),
              'tokensEntrada', sum(tin), 'tokensSalida', sum(tout)) as x
            from filas group by flujo, agente) s), '[]'::jsonb),
    'porModelo', coalesce((select jsonb_agg(x order by (x->>'usd')::numeric desc nulls last)
      from (select jsonb_build_object('nombre', modelo, 'usd', sum(usd), 'llamadas', count(*),
              'tokensEntrada', sum(tin), 'tokensSalida', sum(tout), 'unidades', sum(unidades)) as x
            from filas group by modelo) s), '[]'::jsonb),
    'porDia', (select jsonb_agg(jsonb_build_object('fecha', fecha, 'usd', usd) order by fecha) from dias),
    'detalle', coalesce((select jsonb_agg(x order by x->>'cuando' desc)
      from (select jsonb_build_object('cuando', creado_en, 'flujo', flujo, 'agente', agente, 'modelo', modelo,
              'tokensEntrada', tin, 'tokensSalida', tout, 'unidades', unidades, 'usd', usd) as x
            from filas order by creado_en desc limit 300) s), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.marga_costos_agencia(date, date) from public, anon;
grant execute on function public.marga_costos_agencia(date, date) to authenticated;
