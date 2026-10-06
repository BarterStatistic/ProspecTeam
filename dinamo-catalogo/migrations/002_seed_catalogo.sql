-- GENERADO por dinamo-catalogo/scripts/generar-seed.mjs desde cotizador-pt/index.html.
-- No editar a mano: corregir la fuente y volver a generar.

insert into public.parametros (clave, valor) values ('lista_vigente', '2026-08-25');

insert into public.esquemas (id, etiqueta, enganche_min, enganche_max, unidad_plazo, orden) values
  ('motonomina', 'Motonomina', 5, 75, 'quincenas', 1),
  ('credinamo', 'Credinamo', 10, 75, 'quincenas', 2),
  ('motoxpress', 'Motoxpress', 15, 75, 'quincenas', 3),
  ('enganche50', '50% de Enganche', 50, 75, 'quincenas', 4),
  ('motonomina_flex', 'Motonomina Flex', 5, 75, 'semanas', 5),
  ('credinamo_flex', 'Credinamo Flex', 10, 75, 'semanas', 6),
  ('motoxpress_flex', 'Motoxpress Flex', 15, 75, 'semanas', 7);

with n as (insert into public.esquema_niveles (esquema_id, enganche_desde, enganche_hasta) values ('motonomina', 0, 24.99) returning id)
insert into public.multiplicadores (nivel_id, plazo, factor) select n.id, v.plazo, v.factor from n cross join (values (12, 0.101449), (18, 0.074421), (24, 0.060494), (36, 0.048471), (48, 0.043846), (60, 0.042256), (72, 0.040495)) as v(plazo, factor);
with n as (insert into public.esquema_niveles (esquema_id, enganche_desde, enganche_hasta) values ('motonomina', 25, 29.99) returning id)
insert into public.multiplicadores (nivel_id, plazo, factor) select n.id, v.plazo, v.factor from n cross join (values (12, 0.10144), (18, 0.074428), (24, 0.060498), (36, 0.048482), (48, 0.043838), (60, 0.042257), (72, 0.040493)) as v(plazo, factor);
with n as (insert into public.esquema_niveles (esquema_id, enganche_desde, enganche_hasta) values ('motonomina', 30, 100) returning id)
insert into public.multiplicadores (nivel_id, plazo, factor) select n.id, v.plazo, v.factor from n cross join (values (12, 0.097719), (18, 0.070579), (24, 0.056545), (36, 0.04417), (48, 0.039177), (60, 0.037233), (72, 0.035218)) as v(plazo, factor);
with n as (insert into public.esquema_niveles (esquema_id, enganche_desde, enganche_hasta) values ('credinamo', 10, 19.99) returning id)
insert into public.multiplicadores (nivel_id, plazo, factor) select n.id, v.plazo, v.factor from n cross join (values (12, 0.103978), (18, 0.07703), (24, 0.063198), (36, 0.051441), (48, 0.047086), (60, 0.045741), (72, 0.044146)) as v(plazo, factor);
with n as (insert into public.esquema_niveles (esquema_id, enganche_desde, enganche_hasta) values ('credinamo', 20, 29.99) returning id)
insert into public.multiplicadores (nivel_id, plazo, factor) select n.id, v.plazo, v.factor from n cross join (values (12, 0.10145), (18, 0.074411), (24, 0.060493), (36, 0.048478), (48, 0.043844), (60, 0.042268), (72, 0.04049)) as v(plazo, factor);
with n as (insert into public.esquema_niveles (esquema_id, enganche_desde, enganche_hasta) values ('credinamo', 30, 49.99) returning id)
insert into public.multiplicadores (nivel_id, plazo, factor) select n.id, v.plazo, v.factor from n cross join (values (12, 0.097719), (18, 0.070579), (24, 0.056545), (36, 0.04417), (48, 0.039177), (60, 0.037233), (72, 0.035218)) as v(plazo, factor);
with n as (insert into public.esquema_niveles (esquema_id, enganche_desde, enganche_hasta) values ('credinamo', 50, 75) returning id)
insert into public.multiplicadores (nivel_id, plazo, factor) select n.id, v.plazo, v.factor from n cross join (values (12, 0.101446), (18, 0.074417), (24, 0.06049), (36, 0.048469), (48, 0.04384), (60, 0.04226), (72, 0.040489)) as v(plazo, factor);
with n as (insert into public.esquema_niveles (esquema_id, enganche_desde, enganche_hasta) values ('motoxpress', 0, 100) returning id)
insert into public.multiplicadores (nivel_id, plazo, factor) select n.id, v.plazo, v.factor from n cross join (values (12, 0.106526), (18, 0.079696), (24, 0.06598), (36, 0.054497), (48, 0.050399), (60, 0.04932), (72, 0.047874)) as v(plazo, factor);
with n as (insert into public.esquema_niveles (esquema_id, enganche_desde, enganche_hasta) values ('enganche50', 0, 100) returning id)
insert into public.multiplicadores (nivel_id, plazo, factor) select n.id, v.plazo, v.factor from n cross join (values (12, 0.101446), (18, 0.074417), (24, 0.06049), (36, 0.048469), (48, 0.04384), (60, 0.04226), (72, 0.040489)) as v(plazo, factor);
with n as (insert into public.esquema_niveles (esquema_id, enganche_desde, enganche_hasta) values ('motonomina_flex', 0, 100) returning id)
insert into public.multiplicadores (nivel_id, plazo, factor) select n.id, v.plazo, v.factor from n cross join (values (52, 0.028695), (65, 0.025093), (96, 0.0207137), (128, 0.018691), (142, 0.018162), (154, 0.017812), (170, 0.017455)) as v(plazo, factor);
with n as (insert into public.esquema_niveles (esquema_id, enganche_desde, enganche_hasta) values ('credinamo_flex', 10, 49.99) returning id)
insert into public.multiplicadores (nivel_id, plazo, factor) select n.id, v.plazo, v.factor from n cross join (values (52, 0.029317), (65, 0.025751), (96, 0.021436), (128, 0.019474), (142, 0.018972), (154, 0.018641), (170, 0.01829)) as v(plazo, factor);
with n as (insert into public.esquema_niveles (esquema_id, enganche_desde, enganche_hasta) values ('credinamo_flex', 50, 75) returning id)
insert into public.multiplicadores (nivel_id, plazo, factor) select n.id, v.plazo, v.factor from n cross join (values (52, 0.028701), (65, 0.02509), (96, 0.020707), (128, 0.018693), (142, 0.018158), (154, 0.017806), (170, 0.017467)) as v(plazo, factor);
with n as (insert into public.esquema_niveles (esquema_id, enganche_desde, enganche_hasta) values ('motoxpress_flex', 0, 100) returning id)
insert into public.multiplicadores (nivel_id, plazo, factor) select n.id, v.plazo, v.factor from n cross join (values (52, 0.029955), (65, 0.026416), (96, 0.022169), (128, 0.020269), (142, 0.019777), (144, 0.019714), (154, 0.01947), (170, 0.019148)) as v(plazo, factor);

create temp table _cotizador (nombre text, precio_lista integer, servicio_preventivo integer, orden integer) on commit drop;
insert into _cotizador values
  ('U2', 21945, 2287, 1),
  ('KF-RACER', 21971, 2287, 2),
  ('U5', 26145, 2287, 3),
  ('U5 175', 27720, 2287, 4),
  ('METRO', 31395, 2250, 5),
  ('ADVENTURE ELITE', 31395, 2250, 6),
  ('ADVENTURE ELITE 175', 34545, 2250, 7),
  ('ALIEN R 175', 32445, 2250, 8),
  ('ROCKY 125', 37370, 2250, 9),
  ('SCORPION 200', 39575, 2512, 10),
  ('CUSTOM 150', 38745, 2287, 11),
  ('CUSTOM BLACK', 43985, 2287, 12),
  ('RAYO 175', 42945, 2287, 13),
  ('CHOPPER', 38556, 2962, 14),
  ('RENEGADA 250', 51650, 2962, 15),
  ('SCORPION XT', 41895, 2512, 16),
  ('RAYO ELITE 250', 52805, 2512, 17),
  ('R2 GT', 55010, 2512, 18),
  ('SPEEDFIRE SPDF 250', 56060, 3983, 19),
  ('DNM 2.5', 61520, 2636, 20),
  ('R4', 55335, 2962, 21),
  ('HEAVY-B CAB', 62895, 4725, 22),
  ('XTREME RLX 200', 57645, 2250, 23),
  ('CROSS COUNTRY ADV', 55246, 2512, 24),
  ('DNM 4 400', 75905, 3814, 25),
  ('GOLIAT', 78110, 2250, 26),
  ('B52 250', 68145, 4133, 27),
  ('SUPER SPORT 400', 80315, 3814, 28),
  ('HEAVY CAB - R 200', 69195, 4725, 29),
  ('SKELETON', 81470, 3983, 30),
  ('DNM 3.0', 83675, 2438, 31),
  ('COMANDO', 83895, 3983, 32),
  ('MOTO TX', 85995, 5832, 33),
  ('MOLOTOV C2', 81795, 2437, 34),
  ('HEAVY MAX 250', 94395, 7114, 35),
  ('BANDID', 83895, 4766, 36),
  ('HEAVY CAB 300', 90195, 5832, 37);

-- 1) Modelos que ya están en Motos: conservan id, tipo, descripción e imagen.
--    Se ignoran las filas duplicadas con salto de línea en el nombre ("Metro 125\n", "Renegada\n").
--    "R4 250" de Motos es el "R4" del cotizador; gana el precio del cotizador.
insert into public.modelos (id, nombre, precio_lista, servicio_preventivo, tipo, descripcion, imagen_url, activo, orden)
overriding system value
select m.id, c.nombre, c.precio_lista, c.servicio_preventivo,
       nullif(btrim(m."Tipo de moto", E' \n\r\t'), ''), nullif(btrim(m."Descripción moto", E' \n\r\t'), ''), m."Image_URL", true, c.orden
from _cotizador c
join public."Motos" m
  on position(E'\n' in m."Modelo") = 0
 and (upper(regexp_replace(btrim(m."Modelo", E' \n\r\t'), '[\s-]+', ' ', 'g')) = upper(regexp_replace(btrim(c.nombre, E' \n\r\t'), '[\s-]+', ' ', 'g'))
      or (c.nombre = 'R4' and upper(regexp_replace(btrim(m."Modelo", E' \n\r\t'), '[\s-]+', ' ', 'g')) = 'R4 250'));

-- 2) Solo en Motos: se conservan inactivos (no se muestran, no se borran).
insert into public.modelos (id, nombre, precio_lista, servicio_preventivo, tipo, descripcion, imagen_url, activo, orden)
overriding system value
select m.id, btrim(m."Modelo", E' \n\r\t'), m."Precio lista (promoción)",
       coalesce(m."Precio paquete" - m."Precio lista (promoción)", 0),
       nullif(btrim(m."Tipo de moto", E' \n\r\t'), ''), nullif(btrim(m."Descripción moto", E' \n\r\t'), ''), m."Image_URL", false, 1000 + m.id
from public."Motos" m
where upper(regexp_replace(btrim(m."Modelo", E' \n\r\t'), '[\s-]+', ' ', 'g')) in ('MONKEY', 'XTREME ROCKY');

-- 3) La identidad sigue después del mayor id de Motos (no se reusan los ids de los duplicados).
select setval(pg_get_serial_sequence('public.modelos', 'id'), (select max(id) from public."Motos"));

-- 4) Solo en el cotizador: entran con id nuevo y sin descripción.
insert into public.modelos (nombre, precio_lista, servicio_preventivo, activo, orden)
select c.nombre, c.precio_lista, c.servicio_preventivo, true, c.orden
from _cotizador c
where not exists (select 1 from public.modelos mo where mo.nombre = c.nombre);
