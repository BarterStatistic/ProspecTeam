-- Cotización a partir del enganche en pesos, para la "Calculadora de Parcialidades"
-- de Alex. Convierte el monto a porcentaje del precio y delega en cotizar(), así la
-- calculadora usa los mismos precios y multiplicadores que el resto del catálogo.
--   * p_esquema acepta '50_enganche' (nombre que usa Alex) como alias de 'enganche50'.
--   * p_modelo se empareja sin distinguir mayúsculas, espacios ni guiones.
--   * Precio sin servicio preventivo por omisión, igual que la vista "Motos".
create or replace function public.cotizar_monto(
  p_modelo text,
  p_esquema text,
  p_enganche_monto numeric,
  p_con_servicio boolean default false
)
returns json
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_modelo   public.modelos%rowtype;
  v_esquema  public.esquemas%rowtype;
  v_precio   numeric;
  v_pct      numeric;
  v_res      json;
begin
  select * into v_modelo
  from public.modelos mo
  where mo.activo
    and upper(regexp_replace(btrim(mo.nombre), '[\s-]+', ' ', 'g'))
      = upper(regexp_replace(btrim(p_modelo), '[\s-]+', ' ', 'g'))
  order by mo.orden
  limit 1;
  if not found then
    raise exception 'Modelo no encontrado o inactivo: %', p_modelo;
  end if;

  select * into v_esquema
  from public.esquemas
  where id = case p_esquema when '50_enganche' then 'enganche50' else p_esquema end;
  if not found then
    raise exception 'Esquema no encontrado: %', p_esquema;
  end if;

  v_precio := v_modelo.precio_lista + case when p_con_servicio then v_modelo.servicio_preventivo else 0 end;

  if p_enganche_monto is null or p_enganche_monto < v_precio * v_esquema.enganche_min / 100
     or p_enganche_monto > v_precio * v_esquema.enganche_max / 100 then
    raise exception 'Enganche de $% fuera del rango de % para % (de $% a $%, % %% a % %% del precio $%)',
      round(p_enganche_monto), v_esquema.etiqueta, v_modelo.nombre,
      ceil(v_precio * v_esquema.enganche_min / 100), floor(v_precio * v_esquema.enganche_max / 100),
      v_esquema.enganche_min::float8, v_esquema.enganche_max::float8, v_precio;
  end if;

  v_pct := p_enganche_monto * 100 / v_precio;
  -- Entre niveles hay huecos de 0.01 (p. ej. 24.99 → 25). Un monto que cae ahí se
  -- cotiza con el nivel inferior, como hacía la calculadora (enganche < 25 % → nivel 1).
  if not exists (
    select 1 from public.esquema_niveles n
    where n.esquema_id = v_esquema.id and v_pct between n.enganche_desde and n.enganche_hasta
  ) then
    v_pct := trunc(v_pct, 2);
  end if;

  select json_build_object(
           'modelo', v_modelo.nombre,
           'esquema', v_esquema.id,
           'unidad', min(c.unidad),
           'precio', v_precio,
           'con_servicio', p_con_servicio,
           'enganche_monto', round(p_enganche_monto),
           'enganche_porcentaje', round(v_pct, 2),
           'a_financiar', round(min(c.a_financiar)),
           'parcialidades', json_object_agg(c.plazo::text, c.parcialidad order by c.plazo)
         )
  into v_res
  from public.cotizar(v_modelo.nombre, v_esquema.id, v_pct, p_con_servicio) c;

  return v_res;
end;
$$;

grant execute on function public.cotizar_monto(text, text, numeric, boolean) to anon, authenticated;
