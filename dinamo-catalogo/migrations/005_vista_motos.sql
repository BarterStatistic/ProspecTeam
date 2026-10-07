-- Alex (workflow n8n "ALEX 3.0", id hRswhOzLQtfHJo2W) solo lee "Motos".
-- La tabla original se guarda como motos_legacy y "Motos" pasa a ser una vista
-- con las mismas columnas, calculadas desde el catálogo compartido.
-- Pagos: 72 quincenas, sin servicio, enganche mínimo de cada esquema.
-- "Personal de seguridad" = Motonomina con 30 % de enganche.
alter table public."Motos" rename to motos_legacy;

create view public."Motos"
with (security_invoker = true)
as
select
  mo.id,
  mo.tipo                                   as "Tipo de moto",
  mo.nombre                                 as "Modelo",
  mo.precio_lista::bigint                   as "Precio lista (promoción)",
  mo.descripcion                            as "Descripción moto",
  (select c.parcialidad from public.cotizar(mo.nombre, 'motonomina', 5, false) c where c.plazo = 72)::bigint
                                            as "Pago quincenal en Motonomina",
  mo.imagen_url                             as "Image_URL",
  (select c.parcialidad from public.cotizar(mo.nombre, 'enganche50', 50, false) c where c.plazo = 72)::bigint
                                            as "Pago quincenal 50% de enganche",
  (select c.parcialidad from public.cotizar(mo.nombre, 'credinamo', 10, false) c where c.plazo = 72)::bigint
                                            as "Pago quincenal en credinamo, pensionados o dueño de negocio",
  (select c.parcialidad from public.cotizar(mo.nombre, 'motoxpress', 15, false) c where c.plazo = 72)::bigint
                                            as "Pago quincenal en motoxpress",
  (select c.parcialidad from public.cotizar(mo.nombre, 'motonomina', 30, false) c where c.plazo = 72)::bigint
                                            as "Pago quincenal para personal de seguridad",
  (mo.precio_lista + mo.servicio_preventivo)::bigint
                                            as "Precio paquete"
from public.modelos mo
where mo.activo
order by mo.orden;

comment on view public."Motos" is 'Compatibilidad con Alex: catálogo compartido con las columnas de la tabla original (ver motos_legacy).';
