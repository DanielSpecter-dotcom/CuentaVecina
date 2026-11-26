-- 009 · Listado de pago generado en la fecha de corte (enunciado, punto 6).
--
-- "El sistema debe generar en la fecha de corte el listado de pago que debe realizar cada cliente en la fecha de
-- pago pactada". Al cerrarse el corte (día de corte del cliente, a la hora de corte de la tienda) se genera:
--   · para cada cliente, un aviso con su listado del período: número de compras/cuotas, capital, intereses,
--     total y fecha de pago (el detalle completo está en Mi cuenta);
--   · para la tienda, un resumen de los clientes que cerraron corte y el total por cobrar.
-- El cron corre cada 15 minutos (a los :14, :29, :44 y :59), así una hora de corte 23:59:59 se procesa a las
-- 23:59 del mismo día. Si una corrida se pierde, la siguiente recupera el corte del día anterior. La clave de
-- cada aviso evita duplicados.

alter table public.notificaciones drop constraint if exists notificaciones_tipo_check;
alter table public.notificaciones add constraint notificaciones_tipo_check
  check (tipo in ('VENTA', 'PAGO', 'RECORDATORIO', 'VENCIDO', 'RESUMEN', 'SISTEMA', 'CORTE'));

create or replace function public.fn_generar_listados_corte(p_ahora timestamptz default now())
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_local timestamp := p_ahora at time zone 'America/Lima';
  v_hoy date := v_local::date;
  v_hm text := to_char(v_local, 'HH24:MI');
  v_antes integer;
  r record;
begin
  select count(*) into v_antes from public.notificaciones;

  -- Períodos (cliente + fecha de pago) cuyo corte se cerró hoy (ya pasó la hora de corte) o ayer (recuperación).
  drop table if exists tmp_listados;
  create temporary table tmp_listados on commit drop as
  with pendientes as (
    select v.cliente_id, v.fecha_pago_pactada as fecha_pago, v.monto_capital as capital, v.interes_compensatorio as interes
      from public.ventas v where v.modalidad_pago = false and v.estado_pago = 'pendiente'
    union all
    select v.cliente_id, q.fecha_vencimiento, q.amortizacion, q.interes
      from public.cuotas q join public.ventas v on v.id = q.venta_id where q.estado_pago = 'pendiente'
  )
  select c.id as cliente_id, c.tienda_id, t.nombre_comercial, p.fecha_pago,
         public.fn_fecha_corte(p.fecha_pago, c.dia_corte, c.dia_pago) as fecha_corte,
         count(*)::integer as items, sum(p.capital) as capital, sum(p.interes) as interes,
         sum(p.capital + p.interes) as total
    from pendientes p
    join public.clientes c on c.id = p.cliente_id and c.estado
    join public.tiendas t on t.id = c.tienda_id and t.estado
   group by c.id, c.tienda_id, t.nombre_comercial, p.fecha_pago, c.dia_corte, c.dia_pago, t.hora_corte
  having (public.fn_fecha_corte(p.fecha_pago, c.dia_corte, c.dia_pago) = v_hoy
          and to_char(coalesce(t.hora_corte, '23:59:59'::time), 'HH24:MI') <= v_hm)
      or public.fn_fecha_corte(p.fecha_pago, c.dia_corte, c.dia_pago) = v_hoy - 1;

  -- Aviso a cada cliente con su listado del período.
  for r in select * from tmp_listados loop
    perform public.fn_notificar(pf.id, 'CORTE', 'Tu listado de pago del corte',
      format('Corte del %s en %s: %s %s por %s (capital %s + intereses %s). Págalo el %s; si pagas después se cobrarán intereses moratorios.',
        to_char(r.fecha_corte, 'DD/MM/YYYY'), r.nombre_comercial, r.items,
        case when r.items = 1 then 'compra o cuota' else 'compras o cuotas' end,
        public.fn_monto(r.total, false), public.fn_monto(r.capital, false), public.fn_monto(r.interes, false),
        to_char(r.fecha_pago, 'DD/MM/YYYY')),
      '/mi-cuenta', format('corte:%s:%s', pf.id, r.fecha_pago))
    from public.perfiles pf where pf.cliente_id = r.cliente_id and pf.rol = 'cliente' and pf.activo;
  end loop;

  -- Resumen a los administradores de cada tienda.
  for r in
    select tienda_id, fecha_corte, count(distinct cliente_id) as clientes, sum(total) as total, min(fecha_pago) as primer_pago
      from tmp_listados group by tienda_id, fecha_corte
  loop
    perform public.fn_notificar(pf.id, 'CORTE', 'Corte cerrado: listado de pago',
      format('Se cerró el corte del %s: %s cliente(s) deben pagar %s en total (primera fecha de pago: %s). Revisa el listado de pagos.',
        to_char(r.fecha_corte, 'DD/MM/YYYY'), r.clientes, public.fn_monto(r.total, false), to_char(r.primer_pago, 'DD/MM/YYYY')),
      '/tienda', format('corte-tienda:%s:%s', pf.id, r.fecha_corte))
    from public.perfiles pf where pf.tienda_id = r.tienda_id and pf.rol = 'admin_tienda' and pf.activo;
  end loop;

  return (select count(*) from public.notificaciones) - v_antes;
end;
$function$;

revoke execute on function public.fn_generar_listados_corte(timestamptz) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'cuentavecina-listados-corte';
select cron.schedule('cuentavecina-listados-corte', '14,29,44,59 * * * *', 'select public.fn_generar_listados_corte()');
