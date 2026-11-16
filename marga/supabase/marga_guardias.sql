-- Fase B — aviso push de inicio de guardia (leads calientes sin tocar 24 h o más).
-- Proyecto ehyqexzaauvjoioafqdz. APLICADA el 2026-11-15 con el visto bueno de Braulio
-- (marga-avisos desplegada con los turnos; ensayo con simular: true OK: domingo,
-- solo Alejandro). Primer aviso real: lunes 16-nov, 9 am.
--
-- Depende de `marga_avisos.sql` (tabla `marga_avisos_config` con la URL de la
-- Edge Function `marga-avisos` y su secreto) y de pg_net. La Edge Function
-- cuenta los leads con la misma regla que "Mi día" y el Panel ADMIN
-- (supabase/functions/_shared/rezagadosLogic.js) y manda el push a cada
-- vendedor que tenga al menos uno.
--
-- Horario: Monterrey es UTC-6 todo el año (México ya no cambia de horario).
--    9:00 Monterrey = 15:00 UTC  → guardia 'manana' (inicia el turno de la mañana)
--   16:00 Monterrey = 22:00 UTC  → guardia 'tarde'
-- Los dos cron corren todos los días; la Edge Function solo avisa al vendedor que
-- está de turno (tabla TURNOS en _shared/rezagadosLogic.js): lun–vie Alejandro
-- por la mañana y Emmanuel por la tarde, sábado Emmanuel, domingo Alejandro.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.marga_avisar_guardia(p_guardia text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secreto text;
begin
  if p_guardia not in ('manana', 'tarde') then
    raise exception 'Guardia desconocida: %', p_guardia;
  end if;
  select funcion_url, secreto into v_url, v_secreto from public.marga_avisos_config where id = 1;
  if v_url is null or v_secreto is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('tipo', 'guardia', 'guardia', p_guardia),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-marga-secreto', v_secreto),
    timeout_milliseconds := 20000
  );
end $$;

revoke all on function public.marga_avisar_guardia(text) from public, anon, authenticated;

select cron.schedule('marga_guardia_manana', '0 15 * * *', $$select public.marga_avisar_guardia('manana')$$);
select cron.schedule('marga_guardia_tarde',  '0 22 * * *', $$select public.marga_avisar_guardia('tarde')$$);

-- Para pausar los avisos sin borrar nada:
--   select cron.unschedule('marga_guardia_manana'); select cron.unschedule('marga_guardia_tarde');
