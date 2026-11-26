-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 011 · Listado de pago, mora y registro del pago: versión vigente documentada
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Continúa 010: reúne en un solo archivo la versión vigente de estas funciones (antes repartidas entre
-- 002, 007 y 008), con la fórmula en comentarios. La lógica no cambia: se verificó que estado_cuenta y
-- periodos_pendientes devuelven exactamente lo mismo antes y después.
--
--   §5 Listado y mora .... periodos_pendientes, estado_cuenta     ↔ TS: calcularMora
--   §6 Pago .............. registrar_pago (sin pagos parciales, prelación mora → interés → capital)
-- ═════════════════════════════════════════════════════════════════════════════════════════════

-- ── §5 Períodos pendientes ───────────────────────────────────────────────────────────────────
-- Agrupa por fecha de pago todo lo pendiente del cliente (compras a fin de mes y cuotas).
-- La fecha de corte de cada período se obtiene con fn_fecha_corte.
create or replace function public.periodos_pendientes(p_cliente_id uuid)
returns table (fecha_pago date, fecha_corte date, items integer, capital numeric, interes numeric, total numeric)
language sql
stable
set search_path to ''
as $function$
  with c as (select * from public.clientes where id = p_cliente_id),
  items as (
    -- Compras a fin de mes pendientes: capital + interés compensatorio (C · TEP) guardados al vender.
    select v.fecha_pago_pactada as fecha_pago, v.monto_capital as capital, v.interes_compensatorio as interes
      from public.ventas v where v.cliente_id = p_cliente_id and v.modalidad_pago = false and v.estado_pago = 'pendiente'
    union all
    -- Cuotas pendientes: amortización + interés de la fila del cronograma.
    select q.fecha_vencimiento, q.amortizacion, q.interes
      from public.cuotas q join public.ventas v on v.id = q.venta_id
     where v.cliente_id = p_cliente_id and q.estado_pago = 'pendiente')
  select i.fecha_pago, public.fn_fecha_corte(i.fecha_pago, (select dia_corte from c), (select dia_pago from c)),
         count(*)::integer, sum(i.capital), sum(i.interes), sum(i.capital + i.interes)
    from items i group by i.fecha_pago order by i.fecha_pago;
$function$;

-- ── §5 Listado de pago de un período (enunciado, punto 6) ───────────────────────────────────
-- Ítems: compras a fin de mes y cuotas con esa fecha de pago, ordenadas por fecha y hora de compra.
--   Compra:  capital C, interés C · TEP(días compra → pago), total C + I   (guardados por registrar_venta)
--   Cuota:   amortización Aₖ, interés Iₖ, cuota R                          (fila del cronograma)
-- Mora (ítem aparte "Intereses por mora"), si se paga después de la fecha de pago:
--   días de mora = fecha efectiva − fecha de pago
--   Mora = Σ por tasa moratoria pactada [ round(Total del grupo · TEP_mora(días de mora), 2) ]
--   (cada venta guarda la tasa moratoria pactada al momento de la compra; normalmente hay un solo grupo)
-- Total a pagar = capital + interés compensatorio + mora.
create or replace function public.estado_cuenta(p_cliente_id uuid, p_fecha_pago date, p_fecha_efectiva date default null)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
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

  -- Ítems del período, ordenados por fecha y hora de compra.
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

  -- Mora = Total · TEP_mora(días de mora), por cada tasa moratoria pactada.
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
    'moneda', 'PEN',
    'fechaCorte', public.fn_fecha_corte(p_fecha_pago, c.dia_corte, c.dia_pago), 'fechaPago', p_fecha_pago,
    'fechaEfectiva', coalesce(p_fecha_efectiva, p_fecha_pago), 'diasMora', v_dias_mora,
    'items', v_items, 'capital', v_capital, 'interesCompensatorio', v_interes,
    'interesMoratorio', v_mora, 'total', v_capital + v_interes + v_mora);
end;
$function$;

-- ── §6 Registro del pago (enunciado, punto 5 y Anexo A) ──────────────────────────────────────
-- · Solo el administrador de la tienda del cliente; la fecha efectiva no puede ser futura.
-- · Los períodos se pagan en orden: primero el más antiguo.
-- · Sin pagos parciales: el monto debe ser exactamente el total de estado_cuenta.
-- · Prelación (Anexo A): el pago se imputa mora → interés compensatorio → capital; como se paga el total,
--   cada concepto se guarda completo en su columna de pagos (interes_moratorio, interes_compensatorio, capital).
create or replace function public.registrar_pago(p_cliente_id uuid, p_fecha_pago date, p_fecha_efectiva date, p_monto numeric)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  c public.clientes;
  ec jsonb;
  v_pago_id uuid;
  v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  select * into c from public.clientes where id = p_cliente_id;
  if not found or public.fn_rol_actual() is distinct from 'admin_tienda' or c.tienda_id <> public.fn_tienda_actual() then
    raise exception 'No autorizado para registrar pagos de este cliente';
  end if;
  if p_fecha_efectiva > v_hoy then raise exception 'La fecha de pago no puede ser futura'; end if;
  if exists (select 1 from public.periodos_pendientes(p_cliente_id) pp where pp.fecha_pago < p_fecha_pago) then
    raise exception 'Primero debe pagarse el período más antiguo pendiente';
  end if;

  ec := public.estado_cuenta(p_cliente_id, p_fecha_pago, p_fecha_efectiva);
  if jsonb_array_length(ec->'items') = 0 then
    raise exception 'No hay deuda pendiente para la fecha de pago %', p_fecha_pago;
  end if;
  if round(p_monto, 2) <> (ec->>'total')::numeric then
    raise exception 'No se permiten pagos parciales: el monto a pagar es exactamente %', ec->>'total';
  end if;

  -- Prelación: mora → interés compensatorio → capital.
  insert into public.pagos (cliente_id, monto_pagado, fecha_efectiva_pago, fecha_corte_periodo, fecha_vencimiento,
                            dias_mora, interes_moratorio, interes_compensatorio, capital, registrado_por)
  values (c.id, (ec->>'total')::numeric, p_fecha_efectiva, (ec->>'fechaCorte')::date, p_fecha_pago,
          (ec->>'diasMora')::integer, (ec->>'interesMoratorio')::numeric,
          (ec->>'interesCompensatorio')::numeric, (ec->>'capital')::numeric, auth.uid())
  returning id into v_pago_id;

  -- Marca como pagadas las compras y cuotas del período (y la venta en cuotas cuando ya no le quedan cuotas).
  update public.ventas set estado_pago = 'pagado', pago_id = v_pago_id
   where cliente_id = c.id and modalidad_pago = false and estado_pago = 'pendiente' and fecha_pago_pactada = p_fecha_pago;
  update public.cuotas q set estado_pago = 'pagado', pago_id = v_pago_id
    from public.ventas v
   where v.id = q.venta_id and v.cliente_id = c.id and q.estado_pago = 'pendiente' and q.fecha_vencimiento = p_fecha_pago;
  update public.ventas v set estado_pago = 'pagado'
   where v.cliente_id = c.id and v.modalidad_pago = true and v.estado_pago = 'pendiente'
     and not exists (select 1 from public.cuotas q where q.venta_id = v.id and q.estado_pago = 'pendiente');
  return v_pago_id;
end;
$function$;
