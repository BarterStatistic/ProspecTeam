-- Buen Fin 2026 — proyecto Supabase ehyqexzaauvjoioafqdz (calculadora cotizar_monto + agencia)
-- Revertir al terminar (ver bloque REVERTIR al final).
begin;
update esquemas set enganche_min=5  where id in ('credinamo','credinamo_flex');
update esquema_niveles set enganche_desde=5 where esquema_id in ('credinamo','credinamo_flex') and enganche_desde=10; -- 5–9.99% usa el multiplicador del nivel más bajo (supuesto)
update esquemas set enganche_min=15 where id in ('motoxpress','motoxpress_flex');
insert into creativo_promociones (texto, condiciones, vigente_desde, vigente_hasta, activa) values
('Buen Fin: hasta 20% de descuento en motos Dinamo','Comando, R1, Super Sport, DNM 400 y Crosscountry 20%; Scorpion XT, Rayo Elite, Renegada, Rayo 175, Bandid, Chopper 250 y DNM 3.0 15%; KF-Racer 150/250, Skeleton y R2 GT 10%. Sobre precio de lista, contado y crédito. Sin descuento: Scorpion 200, Custom Black, B-52, Custom 150, R4, DNM 2.5, Speedfire.','2026-11-13','2026-11-23',true),
('Buen Fin: 20% de descuento en motos de trabajo de contado','U5 150, U5 175, U2 150, Metro y Fénix. Solo contado en una sola exhibición, no aplica a MSI. A crédito: 5% de enganche sin descuento.','2026-11-13','2026-11-23',true),
('Buen Fin: 15% de enganche sin comprobar ingresos','Motos hasta el precio de la R4. Informales solo dos ruedas; dueños de negocio también motocarros.','2026-11-13','2026-11-23',true),
('Buen Fin: modelos de años anteriores hasta 15% de descuento','2025 5%, 2024 10%, 2023 y anteriores 15%, sobre precio 2026 o último precio marcado.','2026-11-13','2026-11-23',true);
commit;

-- REVERTIR:
-- update esquemas set enganche_min=10 where id in ('credinamo','credinamo_flex');
-- update esquema_niveles set enganche_desde=10 where esquema_id in ('credinamo','credinamo_flex') and enganche_desde=5;
-- update esquemas set enganche_min=25 where id in ('motoxpress','motoxpress_flex');
