-- Marga ↔ agentes de Dinamo. Proyecto ehyqexzaauvjoioafqdz.
-- Requiere: bandeja-dinamo/supabase/migracion.sql + multiagente.sql y
-- marga_auth_base.sql (marga_rol / marga_es_miembro).
--
-- Las tablas de la bandeja siguen privadas: Marga solo entra por estas
-- funciones, que revisan quién llama.

-- Estado para el indicador «En vivo» y el panel de máquinas (cualquier miembro).
-- Sin tokens ni enlaces de la intranet.
create or replace function public.dinamo_panel()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.marga_es_miembro() then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'ahora', now(),
    'estado', (select jsonb_build_object(
        'ultima_sync', e.ultima_sync, 'intervalo_min', e.intervalo_min, 'solicitud_desde', e.solicitud_desde,
        'ultimo_error', e.ultimo_error, 'tipo_error', e.tipo_error, 'error_en', e.error_en,
        'total', e.total, 'fallas_login', e.fallas_login, 'leyendo', e.turno_hasta > now())
      from public.bandeja_estado e where e.id = 1),
    'agentes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'nombre', a.nombre, 'activo', a.activo, 'version', a.version,
        'ultimo_latido', a.ultimo_latido, 'ultima_sync', a.ultima_sync,
        'ultimo_error', a.ultimo_error, 'error_en', a.error_en) order by a.creado_en)
      from public.dinamo_agentes a), '[]'::jsonb))
  into v;
  return v;
end $$;

-- «Forzar actualización»: la siguiente máquina que dé latido lee la bandeja.
-- Al terminar la lectura, el contador del intervalo vuelve a empezar.
-- También desbloquea tras 3 fallos de login (alguien corrigió la contraseña).
create or replace function public.dinamo_forzar()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.marga_es_miembro() then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  update public.bandeja_estado set solicitud_desde = now(), fallas_login = 0 where id = 1;
end $$;

-- Intervalo entre lecturas automáticas (solo admin). 30 min por defecto.
create or replace function public.dinamo_intervalo(p_minutos int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.marga_rol() is distinct from 'admin' then
    raise exception 'Solo un administrador cambia el intervalo.' using errcode = '42501';
  end if;
  if p_minutos is null or p_minutos < 1 or p_minutos > 1440 then
    raise exception 'El intervalo va de 1 a 1440 minutos.';
  end if;
  update public.bandeja_estado set intervalo_min = p_minutos where id = 1;
end $$;

-- Activar o revocar una máquina (solo admin). Revocada, su token deja de servir.
create or replace function public.dinamo_maquina_activa(p_id text, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.marga_rol() is distinct from 'admin' then
    raise exception 'Solo un administrador activa o revoca máquinas.' using errcode = '42501';
  end if;
  update public.dinamo_agentes set activo = p_activo where id = p_id;
end $$;

-- Detalle de un crédito (BNC, VF, CC, EC): lo que ya se leyó y si hay una
-- lectura pendiente.
create or replace function public.dinamo_detalle(p_folio text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.marga_es_miembro() then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  return (select jsonb_build_object(
      'datos', d.datos, 'actualizado_en', d.actualizado_en, 'pendiente', d.solicitado_en is not null)
    from public.bandeja_detalle d where d.folio = p_folio);
end $$;

-- Pedir el detalle: una máquina lo trae en su próximo latido. Los enlaces los
-- arma el servidor con la última foto (por eso aquí van vacíos).
create or replace function public.dinamo_pedir_detalle(p_folio text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.marga_es_miembro() then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  if p_folio !~ '^\d+$' then
    raise exception 'Folio inválido.';
  end if;
  insert into public.bandeja_detalle as d (folio, enlaces, solicitado_en)
  values (p_folio, null, now())
  on conflict (folio) do update
     set enlaces = null, solicitado_en = now(), turno_agente = null, turno_hasta = null;
end $$;

revoke all on function
  public.dinamo_panel(), public.dinamo_forzar(), public.dinamo_intervalo(int),
  public.dinamo_maquina_activa(text, boolean), public.dinamo_detalle(text), public.dinamo_pedir_detalle(text)
from public, anon;
grant execute on function
  public.dinamo_panel(), public.dinamo_forzar(), public.dinamo_intervalo(int),
  public.dinamo_maquina_activa(text, boolean), public.dinamo_detalle(text), public.dinamo_pedir_detalle(text)
to authenticated;
