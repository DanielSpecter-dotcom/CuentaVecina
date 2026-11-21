-- =====================================================================
-- CuentaVecina — REINICIAR LA DEMO (borra TODOS los datos)
-- =====================================================================
-- Úsalo solo para dejar la app en blanco antes de una prueba en vivo con el profesor:
-- después, la pantalla de inicio de sesión mostrará "Configurar CuentaVecina".
--
-- ⚠️ IRREVERSIBLE: borra usuarios, tiendas, clientes, productos, ventas, cuotas, pagos,
--    notificaciones, solicitudes y auditoría. Conserva el esquema, las funciones y las tasas BCRP.
--    Las imágenes de productos quedan en Storage (bórralas desde Storage → productos si quieres).
--
-- Cómo usarlo: Supabase → SQL Editor → pegar todo → Run. Se ejecuta en una transacción:
-- si algo falla, no se borra nada.
-- =====================================================================
begin;

-- Para no generar miles de filas de auditoría al borrar.
alter table public.ventas disable trigger trg_ventas_auditoria;
alter table public.cuotas disable trigger trg_cuotas_auditoria;
alter table public.pagos disable trigger trg_pagos_auditoria;
alter table public.clientes disable trigger trg_clientes_auditoria;
alter table public.productos disable trigger trg_productos_auditoria;
alter table public.perfiles disable trigger trg_perfiles_auditoria;
alter table public.tiendas disable trigger trg_tiendas_auditoria;

delete from public.notificaciones;
delete from public.suscripciones_push;
update public.ventas set pago_id = null;
update public.cuotas set pago_id = null;
delete from public.cuotas;
delete from public.ventas;
delete from public.pagos;
delete from public.perfiles;
delete from public.clientes;
delete from public.productos;
delete from public.solicitudes_tienda;
delete from public.tiendas;
delete from public.auditoria;
-- Solo las cuentas de la app (dominio interno); no toca otros usuarios de Auth.
delete from auth.users where email like '%@usuarios.cuentavecina.pe';

alter table public.ventas enable trigger trg_ventas_auditoria;
alter table public.cuotas enable trigger trg_cuotas_auditoria;
alter table public.pagos enable trigger trg_pagos_auditoria;
alter table public.clientes enable trigger trg_clientes_auditoria;
alter table public.productos enable trigger trg_productos_auditoria;
alter table public.perfiles enable trigger trg_perfiles_auditoria;
alter table public.tiendas enable trigger trg_tiendas_auditoria;

commit;

-- Comprobación: debe devolver true (la app pedirá crear el administrador del sistema).
select public.instalacion_pendiente();
