-- Esperado: 5 filas, todas con rls = true y politicas = 1.
select c.relname as tabla,
       c.relrowsecurity as rls,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname and p.cmd = 'SELECT') as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('modelos','esquemas','esquema_niveles','multiplicadores','parametros')
order by 1;
