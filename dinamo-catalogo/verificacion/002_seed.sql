-- Esperado (una fila):
-- total=39, activos=37, esquemas=7, niveles=13, lista='2026-08-25',
-- sin_descripcion='ADVENTURE ELITE 175, U5 175', inactivos='Monkey, Xtreme Rocky',
-- r4_id=38, r4_precio=55335, nuevos_min_id=42, multiplicadores=92
select
  (select count(*) from public.modelos) as total,
  (select count(*) from public.modelos where activo) as activos,
  (select count(*) from public.esquemas) as esquemas,
  (select count(*) from public.esquema_niveles) as niveles,
  (select valor from public.parametros where clave = 'lista_vigente') as lista,
  (select string_agg(nombre, ', ' order by nombre) from public.modelos where activo and descripcion is null) as sin_descripcion,
  (select string_agg(nombre, ', ' order by nombre) from public.modelos where not activo) as inactivos,
  (select id from public.modelos where nombre = 'R4') as r4_id,
  (select precio_lista from public.modelos where nombre = 'R4') as r4_precio,
  (select min(id) from public.modelos where nombre in ('U5 175', 'ADVENTURE ELITE 175')) as nuevos_min_id,
  (select count(*) from public.multiplicadores) as multiplicadores;
