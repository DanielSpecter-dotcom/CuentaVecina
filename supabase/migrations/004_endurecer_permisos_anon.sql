-- CuentaVecina — Migración 004
-- Defensa en profundidad para el rol anon (cualquiera con la publishable key, sin sesión).
-- Hoy RLS ya le devuelve 0 filas, pero si alguien desactivara RLS por error en una tabla,
-- sus datos quedarían públicos. Con esto anon no tiene permisos sobre las tablas aunque falle RLS.
-- Única excepción: "Registra tu negocio" (insertar en solicitudes_tienda, sin leer).

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;

grant insert on public.solicitudes_tienda to anon;

-- Lo mismo para tablas y funciones que se creen en el futuro.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
