-- Centro de mando de la agencia en Marga (Fase C del plan 2026-11-14, C3 y C5). SIN APLICAR:
-- lo aplica Braulio desde el panel de Supabase (proyecto ehyqexzaauvjoioafqdz) cuando lo apruebe.
--
-- Requiere sql/043_decidir.sql del repo de la agencia (ya aplicada el 2026-11-15): public.agencia_por_decidir
-- y la columna decidido_desde.
--
-- 1. marga_por_decidir(): la bandeja "Por decidir hoy". Corre como dueña (security definer) y
--    rechaza a quien no sea administrador (marga_rol(), ver marga_auth_base.sql). No trae tokens.
-- 2. Lectura solo para el administrador en las 5 tablas de decisiones. Hoy tienen RLS prendido y
--    ninguna política (nadie las lee con la llave pública). Esta política existe solo para que
--    Supabase Realtime le avise a Marga cuando algo se decide en Telegram (Realtime respeta RLS):
--    vendedores y promotores siguen sin ver nada.
-- 3. Las 5 tablas entran a la publicación supabase_realtime.
--
-- Para quitarlo: drop function public.marga_por_decidir(); drop policy ... (5); y
-- alter publication supabase_realtime drop table ... (5).

create or replace function public.marga_por_decidir()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(public.marga_rol(), '') <> 'admin' then
    raise exception 'Solo el administrador puede ver lo que hay por decidir.' using errcode = '42501';
  end if;
  return public.agencia_por_decidir('dinamo');
end;
$$;

revoke all on function public.marga_por_decidir() from public, anon;
grant execute on function public.marga_por_decidir() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['creativo_ideas', 'ads_propuestas', 'creativo_campanas', 'creativo_cuentas', 'fb_comentarios'] loop
    execute format('drop policy if exists marga_admin_lee on public.%I', t);
    execute format('create policy marga_admin_lee on public.%I for select to authenticated using (public.marga_rol() = ''admin'')', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
