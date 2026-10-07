-- Todo el catálogo en la forma exacta de MODELS y SCHEMES de los cotizadores,
-- para que cambien su fuente de datos sin tocar su lógica de cálculo.
-- Devuelve json (no jsonb) para conservar el orden de los esquemas.
create or replace function public.catalogo()
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select json_build_object(
    'lista_vigente', (select valor from public.parametros where clave = 'lista_vigente'),
    'modelos', coalesce((
      select json_agg(json_build_array(mo.nombre, mo.precio_lista, mo.servicio_preventivo) order by mo.orden)
      from public.modelos mo
      where mo.activo
    ), '[]'::json),
    'esquemas', coalesce((
      select json_object_agg(e.id, json_build_object(
        'label', e.etiqueta,
        'min', e.enganche_min,
        'max', e.enganche_max,
        'termUnit', e.unidad_plazo,
        'terms', (
          select json_agg(t.plazo order by t.plazo)
          from (
            select distinct m.plazo
            from public.multiplicadores m
            join public.esquema_niveles n on n.id = m.nivel_id
            where n.esquema_id = e.id
          ) t
        ),
        'levels', (
          select json_agg(json_build_object(
            'range', json_build_array(n.enganche_desde, n.enganche_hasta),
            'm', (
              select json_object_agg(m.plazo::text, m.factor order by m.plazo)
              from public.multiplicadores m
              where m.nivel_id = n.id
            )
          ) order by n.enganche_desde)
          from public.esquema_niveles n
          where n.esquema_id = e.id
        )
      ) order by e.orden)
      from public.esquemas e
    ), '{}'::json)
  );
$$;

grant execute on function public.catalogo() to anon, authenticated;
