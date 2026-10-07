-- Reversa de 005: regresa la tabla original a su nombre.
drop view public."Motos";
alter table public.motos_legacy rename to "Motos";
