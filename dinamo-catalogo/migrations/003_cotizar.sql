-- Cotiza un modelo en un esquema: una fila por plazo del nivel aplicable.
-- Misma fórmula que render() de cotizador-pt/index.html.
create or replace function public.cotizar(
  p_modelo text,
  p_esquema text,
  p_enganche numeric,
  p_con_servicio boolean default true
)
returns table (
  plazo integer,
  unidad text,
  precio numeric,
  enganche_monto numeric,
  a_financiar numeric,
  parcialidad integer
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_modelo   public.modelos%rowtype;
  v_esquema  public.esquemas%rowtype;
  v_nivel    bigint;
  v_precio   numeric;
  v_enganche numeric;
begin
  select * into v_modelo from public.modelos where nombre = p_modelo and activo;
  if not found then
    raise exception 'Modelo no encontrado o inactivo: %', p_modelo;
  end if;

  select * into v_esquema from public.esquemas where id = p_esquema;
  if not found then
    raise exception 'Esquema no encontrado: %', p_esquema;
  end if;

  if p_enganche is null or p_enganche < v_esquema.enganche_min or p_enganche > v_esquema.enganche_max then
    raise exception 'Enganche de % %% fuera del rango de % (% %% a % %%)',
      p_enganche, v_esquema.etiqueta, v_esquema.enganche_min, v_esquema.enganche_max;
  end if;

  select n.id into v_nivel
  from public.esquema_niveles n
  where n.esquema_id = p_esquema
    and p_enganche between n.enganche_desde and n.enganche_hasta
  order by n.enganche_desde
  limit 1;
  if v_nivel is null then
    raise exception 'No hay nivel de % para un enganche de % %%', v_esquema.etiqueta, p_enganche;
  end if;

  v_precio   := v_modelo.precio_lista + case when p_con_servicio then v_modelo.servicio_preventivo else 0 end;
  v_enganche := v_precio * p_enganche / 100;

  return query
    select m.plazo,
           v_esquema.unidad_plazo,
           v_precio,
           v_enganche,
           v_precio - v_enganche,
           round((v_precio - v_enganche) * m.factor)::integer
    from public.multiplicadores m
    where m.nivel_id = v_nivel
    order by m.plazo;
end;
$$;

grant execute on function public.cotizar(text, text, numeric, boolean) to anon, authenticated;
