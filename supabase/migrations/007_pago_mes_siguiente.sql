-- 007 · Fecha de pago en el mes siguiente al corte.
--
-- Como en una tarjeta de crédito (p. ej. corte el 10 y pago el 5): si el día de pago es menor o igual al día
-- de corte, la fecha de pago cae en ese día del mes siguiente al corte (corte 10/11 → pago 05/12). Si es mayor
-- (corte 20, pago 26), sigue en el mismo mes. El enunciado solo pide un día de corte y un día de pago mensual.
-- Cambia: la regla de la tabla clientes, simular_venta (ciclo de la compra), y el cálculo de la fecha de corte
-- a partir de la fecha de pago en estado_cuenta y periodos_pendientes. Las ventas ya registradas guardan sus
-- fechas, así que no cambian.

alter table public.clientes drop constraint if exists chk_cliente_dias;
alter table public.clientes add constraint chk_cliente_dias
  check (dia_corte between 1 and 28 and dia_pago between 1 and 28);

-- Fecha de corte del período cuya fecha de pago es p_fecha_pago.
create or replace function public.fn_fecha_corte(p_fecha_pago date, p_dia_corte integer, p_dia_pago integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select (date_trunc('month', p_fecha_pago)
          - case when p_dia_pago <= p_dia_corte then interval '1 month' else interval '0 month' end)::date
         + (p_dia_corte - 1);
$$;
revoke execute on function public.fn_fecha_corte(date, integer, integer) from public, anon;
grant execute on function public.fn_fecha_corte(date, integer, integer) to authenticated;

create or replace function public.simular_venta(
  p_cliente_id uuid, p_producto_id uuid, p_cantidad integer,
  p_num_cuotas integer default null, p_fecha_hora timestamp with time zone default now())
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  c public.clientes;
  pr public.productos;
  v_hora_corte time;
  v_local timestamp := p_fecha_hora at time zone 'America/Lima';
  v_fecha date := v_local::date;
  v_hora time := v_local::time;
  v_dia integer := extract(day from v_local);
  v_trasladada boolean;
  v_base date;
  v_corte date;
  v_pago date;
  v_capital numeric;
  v_dias integer;
  v_tep numeric;
  v_interes numeric;
  v_cc numeric;
  v_tem numeric;
  v_r numeric;
  v_saldo numeric;
  v_i numeric;
  v_a numeric;
  v_crono jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_deuda numeric;
  v_res jsonb;
begin
  select * into c from public.clientes where id = p_cliente_id;
  if not found then raise exception 'Cliente no encontrado'; end if;
  if not c.estado then raise exception 'El cliente está dado de baja'; end if;
  select * into pr from public.productos where id = p_producto_id and tienda_id = c.tienda_id;
  if not found then raise exception 'Producto no encontrado en la tienda'; end if;
  if not pr.estado then raise exception 'El producto está dado de baja'; end if;
  if p_cantidad is null or p_cantidad < 1 then raise exception 'La cantidad debe ser al menos 1'; end if;
  if p_num_cuotas is null and pr.modalidad_venta = 1 then
    raise exception 'Este producto solo se vende en cuotas';
  end if;
  if p_num_cuotas is not null then
    if pr.modalidad_venta = 0 then raise exception 'Este producto solo se vende para pagar a fin de mes'; end if;
    if p_num_cuotas < 1 or p_num_cuotas > c.plazo_max_meses then
      raise exception 'El número de cuotas debe estar entre 1 y % (plazo máximo del cliente)', c.plazo_max_meses;
    end if;
  end if;

  select hora_corte into v_hora_corte from public.tiendas where id = c.tienda_id;
  v_trasladada := not (v_dia < c.dia_corte or (v_dia = c.dia_corte and v_hora <= v_hora_corte));
  v_base := (date_trunc('month', v_fecha) + case when v_trasladada then interval '1 month' else interval '0 month' end)::date;
  v_corte := v_base + (c.dia_corte - 1);
  -- Pago en el mismo mes del corte o, si el día de pago es ≤ al de corte (corte 10, pago 5), en el mes siguiente.
  v_pago := (v_base + case when c.dia_pago <= c.dia_corte then interval '1 month' else interval '0 month' end)::date + (c.dia_pago - 1);
  v_dias := v_pago - v_fecha;
  v_capital := round(pr.precio_lista * p_cantidad, 2);
  v_tep := public.fn_tep(c.tipo_tasa, c.tasa_compensatoria, c.periodo_tasa, c.capitalizacion, v_dias);
  v_deuda := public.fn_deuda_vigente(c.id);

  v_res := jsonb_build_object(
    'clienteId', c.id, 'productoId', pr.id, 'producto', pr.nombre, 'cantidad', p_cantidad,
    'precioUnitario', pr.precio_lista, 'moneda', case when c.moneda then 'USD' else 'PEN' end,
    'fechaCompra', v_fecha, 'horaCompra', to_char(v_hora, 'HH24:MI:SS'),
    'fechaCorte', v_corte, 'fechaPago', v_pago, 'trasladada', v_trasladada,
    'capital', v_capital, 'deudaVigente', v_deuda, 'limiteCredito', c.limite_credito,
    'disponible', c.limite_credito - v_deuda, 'excedeLimite', (v_deuda + v_capital) > c.limite_credito);

  if p_num_cuotas is null then
    v_interes := round(v_capital * v_tep, 2);
    return v_res || jsonb_build_object(
      'modalidad', 'FIN_DE_MES', 'dias', v_dias, 'tep', v_tep,
      'interes', v_interes, 'total', v_capital + v_interes);
  end if;

  v_cc := round(v_capital * (1 + v_tep), 2);
  v_tem := public.fn_tep(c.tipo_tasa, c.tasa_compensatoria, c.periodo_tasa, c.capitalizacion, 30);
  -- Cuota igual en todas (ver fn_cuota_francesa).
  v_r := public.fn_cuota_francesa(v_cc, v_tem, p_num_cuotas);
  v_saldo := v_cc;
  for k in 1..p_num_cuotas loop
    if k = p_num_cuotas then
      -- Última: amortiza el saldo exacto; su interés (R − saldo) absorbe el redondeo.
      v_a := v_saldo;
      v_i := v_r - v_saldo;
    else
      v_i := round(v_saldo * v_tem, 2);
      v_a := v_r - v_i;
    end if;
    v_crono := v_crono || jsonb_build_object(
      'numero', k, 'fechaVencimiento', (v_pago + make_interval(months => k))::date,
      'saldoInicial', v_saldo, 'interes', v_i, 'amortizacion', v_a,
      'cuota', v_r, 'saldoFinal', v_saldo - v_a);
    v_total := v_total + v_r;
    v_saldo := v_saldo - v_a;
  end loop;
  return v_res || jsonb_build_object(
    'modalidad', 'CUOTAS', 'numeroCuotas', p_num_cuotas, 'diasGracia', v_dias, 'tepGracia', v_tep,
    'capitalCapitalizado', v_cc, 'tem', v_tem, 'valorCuota', v_r,
    'totalIntereses', v_total - v_capital, 'totalPagar', v_total, 'cronograma', v_crono);
end;
$function$;

CREATE OR REPLACE FUNCTION public.estado_cuenta(p_cliente_id uuid, p_fecha_pago date, p_fecha_efectiva date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  c public.clientes;
  v_items jsonb;
  v_capital numeric;
  v_interes numeric;
  v_mora numeric := 0;
  v_dias_mora integer := greatest(0, coalesce(p_fecha_efectiva, p_fecha_pago) - p_fecha_pago);
  g record;
begin
  select * into c from public.clientes where id = p_cliente_id;
  if not found then raise exception 'Cliente no encontrado'; end if;

  with it as (
    select v.id as venta_id, null::uuid as cuota_id, 'COMPRA' as tipo, v.fecha_compra, v.fecha_hora_compra,
           p.nombre || ' × ' || v.cantidad as descripcion, v.dias_interes as dias,
           v.monto_capital as capital, v.interes_compensatorio as interes,
           v.monto_capital + v.interes_compensatorio as total
      from public.ventas v join public.productos p on p.id = v.producto_id
     where v.cliente_id = p_cliente_id and v.modalidad_pago = false and v.estado_pago = 'pendiente'
       and v.fecha_pago_pactada = p_fecha_pago
    union all
    select v.id, q.id, 'CUOTA', v.fecha_compra, v.fecha_hora_compra,
           p.nombre || ' — cuota ' || q.numero_cuota || '/' || v.num_cuotas, 30,
           q.amortizacion, q.interes, q.cuota
      from public.cuotas q join public.ventas v on v.id = q.venta_id join public.productos p on p.id = v.producto_id
     where v.cliente_id = p_cliente_id and q.estado_pago = 'pendiente' and q.fecha_vencimiento = p_fecha_pago)
  select coalesce(jsonb_agg(to_jsonb(it) - 'fecha_hora_compra' order by it.fecha_hora_compra), '[]'::jsonb),
         coalesce(sum(it.capital), 0), coalesce(sum(it.interes), 0)
    into v_items, v_capital, v_interes
    from it;

  if v_dias_mora > 0 then
    for g in
      select v.tipo_tasa_moratoria_pactada t, v.tasa_moratoria_pactada r, v.periodo_tasa_moratoria_pactada per,
             v.capitalizacion_moratoria_pactada cap, sum((x->>'total')::numeric) total
        from jsonb_array_elements(v_items) x join public.ventas v on v.id = (x->>'venta_id')::uuid
       group by 1, 2, 3, 4
    loop
      v_mora := v_mora + round(g.total * public.fn_tep(g.t, g.r, g.per, g.cap, v_dias_mora), 2);
    end loop;
  end if;

  return jsonb_build_object(
    'clienteId', c.id, 'cliente', c.nombre, 'documento', c.documento,
    'moneda', case when c.moneda then 'USD' else 'PEN' end,
    'fechaCorte', public.fn_fecha_corte(p_fecha_pago, c.dia_corte, c.dia_pago), 'fechaPago', p_fecha_pago,
    'fechaEfectiva', coalesce(p_fecha_efectiva, p_fecha_pago), 'diasMora', v_dias_mora,
    'items', v_items, 'capital', v_capital, 'interesCompensatorio', v_interes,
    'interesMoratorio', v_mora, 'total', v_capital + v_interes + v_mora);
end;
$function$;

CREATE OR REPLACE FUNCTION public.periodos_pendientes(p_cliente_id uuid)
 RETURNS TABLE(fecha_pago date, fecha_corte date, items integer, capital numeric, interes numeric, total numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with c as (select * from public.clientes where id = p_cliente_id),
  items as (
    select v.fecha_pago_pactada as fecha_pago, v.monto_capital as capital, v.interes_compensatorio as interes
      from public.ventas v where v.cliente_id = p_cliente_id and v.modalidad_pago = false and v.estado_pago = 'pendiente'
    union all
    select q.fecha_vencimiento, q.amortizacion, q.interes
      from public.cuotas q join public.ventas v on v.id = q.venta_id
     where v.cliente_id = p_cliente_id and q.estado_pago = 'pendiente')
  select i.fecha_pago, public.fn_fecha_corte(i.fecha_pago, (select dia_corte from c), (select dia_pago from c)),
         count(*)::integer, sum(i.capital), sum(i.interes), sum(i.capital + i.interes)
    from items i group by i.fecha_pago order by i.fecha_pago;
$function$;
