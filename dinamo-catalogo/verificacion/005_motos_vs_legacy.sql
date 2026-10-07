-- Compara la vista nueva contra la tabla original, columna por columna.
-- Esperado: solo las diferencias conocidas (ver Step 4).
with v as (select * from public."Motos"),
     l as (select * from public.motos_legacy)
select coalesce(v.id, l.id) as id,
       coalesce(v."Modelo", btrim(l."Modelo", E' \n')) as modelo,
       case when v.id is null then 'solo en legacy'
            when l.id is null then 'solo en vista'
            else 'difiere' end as caso,
       l."Precio lista (promoción)" as precio_antes, v."Precio lista (promoción)" as precio_ahora,
       l."Precio paquete" as paquete_antes, v."Precio paquete" as paquete_ahora,
       l."Pago quincenal en Motonomina" as mn_antes, v."Pago quincenal en Motonomina" as mn_ahora,
       l."Pago quincenal en credinamo, pensionados o dueño de negocio" as cr_antes,
       v."Pago quincenal en credinamo, pensionados o dueño de negocio" as cr_ahora,
       l."Pago quincenal en motoxpress" as mx_antes, v."Pago quincenal en motoxpress" as mx_ahora,
       l."Pago quincenal 50% de enganche" as e50_antes, v."Pago quincenal 50% de enganche" as e50_ahora,
       l."Pago quincenal para personal de seguridad" as seg_antes, v."Pago quincenal para personal de seguridad" as seg_ahora
from v
full join l on l.id = v.id
where v.id is null or l.id is null
   or v."Precio lista (promoción)" is distinct from l."Precio lista (promoción)"
   or v."Precio paquete" is distinct from l."Precio paquete"
   or v."Pago quincenal en Motonomina" is distinct from l."Pago quincenal en Motonomina"
   or v."Pago quincenal en credinamo, pensionados o dueño de negocio" is distinct from l."Pago quincenal en credinamo, pensionados o dueño de negocio"
   or v."Pago quincenal en motoxpress" is distinct from l."Pago quincenal en motoxpress"
   or v."Pago quincenal 50% de enganche" is distinct from l."Pago quincenal 50% de enganche"
   or v."Pago quincenal para personal de seguridad" is distinct from l."Pago quincenal para personal de seguridad"
order by 1;
