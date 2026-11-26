-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 011 · VENTA Y COBRANZA: cómo se usan las fórmulas de 010
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Las fórmulas están en 010_motor_financiero.sql. Aquí solo se juntan los datos del cliente y del producto,
-- se llaman esas fórmulas y se arma el resultado. Las validaciones van aparte (fn_validar_venta) para que
-- simular_venta y estado_cuenta se lean como el cálculo que hacen.
--
--   v_deuda_pendiente .... compras a fin de mes y cuotas sin pagar (una fila por ítem)
--   fn_validar_venta ..... reglas del negocio antes de vender
--   simular_venta ........ §2 ciclo → §3 fin de mes  ó  §4 cuotas
--   registrar_venta ...... guarda lo que devuelve simular_venta (el límite de crédito lo valida un trigger)
--   periodos_pendientes .. deuda agrupada por fecha de pago
--   estado_cuenta ........ listado de pago de un período + §3 mora
--   registrar_pago ....... pago total del período (sin parciales), prelación mora → interés → capital
-- ═════════════════════════════════════════════════════════════════════════════════════════════

-- ── Deuda pendiente: una fila por compra a fin de mes o por cuota sin pagar ──────────────────
create or replace view public.v_deuda_pendiente
with (security_invoker = true) as
  select v.cliente_id, v.id as venta_id, null::uuid as cuota_id, 'COMPRA' as tipo,
         v.fecha_compra, v.fecha_hora_compra, p.nombre || ' × ' || v.cantidad as descripcion,
         v.dias_interes as dias, v.fecha_pago_pactada as fecha_pago,
         v.monto_capital as capital, v.interes_compensatorio as interes,
         v.monto_capital + v.interes_compensatorio as total
    from public.ventas v left join public.productos p on p.id = v.producto_id
   where v.modalidad_pago = false and v.estado_pago = 'pendiente'
  union all
  select v.cliente_id, v.id, q.id, 'CUOTA',
         v.fecha_compra, v.fecha_hora_compra, p.nombre || ' — cuota ' || q.numero_cuota || '/' || v.num_cuotas,
         30, q.fecha_vencimiento,
         q.amortizacion, q.interes, q.cuota
    from public.cuotas q join public.ventas v on v.id = q.venta_id left join public.productos p on p.id = v.producto_id
   where q.estado_pago = 'pendiente';

revoke all on public.v_deuda_pendiente from public, anon;
grant select on public.v_deuda_pendiente to authenticated;

-- ── Validaciones de una venta (no son fórmulas) ──────────────────────────────────────────────
create or replace function public.fn_validar_venta(
  c public.clientes, pr public.productos, p_cantidad integer, p_num_cuotas integer)
returns void
language plpgsql
stable
set search_path to ''
as $function$
begin
  if c.id is null then raise exception 'Cliente no encontrado'; end if;
  if not c.estado then raise exception 'El cliente está dado de baja'; end if;
  if pr.id is null then raise exception 'Producto no encontrado en la tienda'; end if;
  if not pr.estado then raise exception 'El producto está dado de baja'; end if;
  if p_cantidad is null or p_cantidad < 1 then raise exception 'La cantidad debe ser al menos 1'; end if;
  -- modalidad_venta: 0 solo fin de mes · 1 solo cuotas · 2 ambas
  if p_num_cuotas is null and pr.modalidad_venta = 1 then
    raise exception 'Este producto solo se vende en cuotas';
  end if;
  if p_num_cuotas is not null and pr.modalidad_venta = 0 then
    raise exception 'Este producto solo se vende para pagar a fin de mes';
  end if;
  if p_num_cuotas is not null and (p_num_cuotas < 1 or p_num_cuotas > c.plazo_max_meses) then
    raise exception 'El número de cuotas debe estar entre 1 y % (plazo máximo del cliente)', c.plazo_max_meses;
  end if;
end;
$function$;

-- ── Simulación de una venta (fuente oficial) ─────────────────────────────────────────────────
-- Fin de mes:  I = Capital · TEP(días compra → pago)
-- Cuotas:      C′ = Capital · (1 + TEP(días de gracia)),  TEM = TEP(30),  R = cuota francesa,  cronograma
create or replace function public.simular_venta(
  p_cliente_id uuid, p_producto_id uuid, p_cantidad integer,
  p_num_cuotas integer default null, p_fecha_hora timestamp with time zone default now())
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  c       public.clientes;
  pr      public.productos;
  ciclo   record;
  capital numeric;
  dias    integer;
  tep     numeric;
  interes numeric;
  cc      numeric;
  tem     numeric;
  r       numeric;
  venta   jsonb;
begin
  select * into c  from public.clientes  where id = p_cliente_id;
  select * into pr from public.productos where id = p_producto_id and tienda_id = c.tienda_id;
  perform public.fn_validar_venta(c, pr, p_cantidad, p_num_cuotas);

  -- §2 Fecha de corte y fecha de pago de la compra
  select * into ciclo
    from public.fn_ciclo_compra(p_fecha_hora, c.dia_corte, c.dia_pago,
                                (select hora_corte from public.tiendas where id = c.tienda_id));

  -- §1 TEP con la tasa pactada, por los días de la compra a la fecha de pago
  capital := round(pr.precio_lista * p_cantidad, 2);
  dias    := ciclo.fecha_pago - ciclo.fecha_compra;
  tep     := public.fn_tep(c.tipo_tasa, c.tasa_compensatoria, c.periodo_tasa, c.capitalizacion, dias);

  venta := jsonb_build_object(
    'clienteId', c.id, 'productoId', pr.id, 'producto', pr.nombre, 'cantidad', p_cantidad,
    'precioUnitario', pr.precio_lista, 'moneda', 'PEN', 'capital', capital,
    'fechaCompra', ciclo.fecha_compra, 'horaCompra', to_char(ciclo.hora_compra, 'HH24:MI:SS'),
    'fechaCorte', ciclo.fecha_corte, 'fechaPago', ciclo.fecha_pago, 'trasladada', ciclo.trasladada);

  -- §3 Fin de mes: I = Capital · TEP
  if p_num_cuotas is null then
    interes := public.fn_interes(capital, tep);
    return venta || jsonb_build_object(
      'modalidad', 'FIN_DE_MES', 'dias', dias, 'tep', tep, 'interes', interes, 'total', capital + interes);
  end if;

  -- §4 Cuotas: gracia total capitalizada, TEM a 30 días y cuota francesa igual en todas
  cc  := public.fn_capitalizar(capital, tep);
  tem := public.fn_tep(c.tipo_tasa, c.tasa_compensatoria, c.periodo_tasa, c.capitalizacion, 30);
  r   := public.fn_cuota_francesa(cc, tem, p_num_cuotas);
  return venta || jsonb_build_object(
    'modalidad', 'CUOTAS', 'numeroCuotas', p_num_cuotas, 'diasGracia', dias, 'tepGracia', tep,
    'capitalCapitalizado', cc, 'tem', tem, 'valorCuota', r,
    'totalPagar', r * p_num_cuotas, 'totalIntereses', r * p_num_cuotas - capital,
    'cronograma', (select jsonb_agg(jsonb_build_object(
                     'numero', f.numero, 'fechaVencimiento', f.fecha_vencimiento, 'saldoInicial', f.saldo_inicial,
                     'interes', f.interes, 'amortizacion', f.amortizacion, 'cuota', f.cuota, 'saldoFinal', f.saldo_final)
                     order by f.numero)
                     from public.fn_cronograma_frances(cc, tem, r, p_num_cuotas, ciclo.fecha_pago) f));
end;
$function$;

-- ── Registro de la venta ─────────────────────────────────────────────────────────────────────
-- Guarda la venta con los valores de simular_venta y, si es en cuotas, su cronograma.
-- El límite de crédito (deuda vigente + compra ≤ límite) lo valida el trigger trg_ventas_validar_limite.
create or replace function public.registrar_venta(
  p_cliente_id uuid, p_producto_id uuid, p_cantidad integer,
  p_num_cuotas integer default null, p_fecha_hora timestamp with time zone default now())
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  c           public.clientes;
  s           jsonb;
  nueva_venta uuid;
begin
  select * into c from public.clientes where id = p_cliente_id;
  if c.id is null or public.fn_rol_actual() is distinct from 'admin_tienda' or c.tienda_id <> public.fn_tienda_actual() then
    raise exception 'No autorizado para registrar ventas de este cliente';
  end if;
  if p_fecha_hora > now() + interval '1 minute' then
    raise exception 'La fecha de compra no puede ser futura';
  end if;

  s := public.simular_venta(p_cliente_id, p_producto_id, p_cantidad, p_num_cuotas, p_fecha_hora);

  -- La venta guarda también las condiciones pactadas (tasas) vigentes al momento de la compra.
  insert into public.ventas (
    cliente_id, producto_id, cantidad, precio_unitario, fecha_compra, fecha_hora_compra,
    modalidad_pago, num_cuotas, monto_capital, traslado_periodo,
    moneda_pactada, tipo_tasa_pactada, tasa_compensatoria_pactada, periodo_tasa_pactada, capitalizacion_pactada,
    tasa_moratoria_pactada, tipo_tasa_moratoria_pactada, periodo_tasa_moratoria_pactada, capitalizacion_moratoria_pactada,
    fecha_corte_pactada, fecha_pago_pactada, dias_interes, tep_aplicada, interes_compensatorio,
    capital_capitalizado, tem, valor_cuota, registrado_por)
  values (
    c.id, p_producto_id, p_cantidad, (s->>'precioUnitario')::numeric, (s->>'fechaCompra')::date, p_fecha_hora,
    p_num_cuotas is not null, p_num_cuotas, (s->>'capital')::numeric, (s->>'trasladada')::boolean,
    c.moneda, c.tipo_tasa, c.tasa_compensatoria, c.periodo_tasa, c.capitalizacion,
    c.tasa_moratoria, c.tipo_tasa_moratoria, c.periodo_tasa_moratoria, c.capitalizacion_moratoria,
    (s->>'fechaCorte')::date, (s->>'fechaPago')::date,
    coalesce((s->>'dias')::integer, (s->>'diasGracia')::integer),
    coalesce((s->>'tep')::numeric, (s->>'tepGracia')::numeric),
    coalesce((s->>'interes')::numeric, 0),
    (s->>'capitalCapitalizado')::numeric, (s->>'tem')::numeric, (s->>'valorCuota')::numeric, auth.uid())
  returning ventas.id into nueva_venta;

  insert into public.cuotas (venta_id, numero_cuota, fecha_vencimiento, saldo_inicial, interes, amortizacion, cuota, saldo_final)
  select nueva_venta, (f->>'numero')::smallint, (f->>'fechaVencimiento')::date, (f->>'saldoInicial')::numeric,
         (f->>'interes')::numeric, (f->>'amortizacion')::numeric, (f->>'cuota')::numeric, (f->>'saldoFinal')::numeric
    from jsonb_array_elements(coalesce(s->'cronograma', '[]'::jsonb)) f;

  return nueva_venta;
end;
$function$;

-- ── Deuda por fecha de pago ──────────────────────────────────────────────────────────────────
create or replace function public.periodos_pendientes(p_cliente_id uuid)
returns table (fecha_pago date, fecha_corte date, items integer, capital numeric, interes numeric, total numeric)
language sql
stable
set search_path to ''
as $function$
  select d.fecha_pago, public.fn_fecha_corte(d.fecha_pago, c.dia_corte, c.dia_pago),
         count(*)::integer, sum(d.capital), sum(d.interes), sum(d.capital + d.interes)
    from public.v_deuda_pendiente d join public.clientes c on c.id = d.cliente_id
   where d.cliente_id = p_cliente_id
   group by d.fecha_pago, c.dia_corte, c.dia_pago
   order by d.fecha_pago;
$function$;

-- ── Listado de pago de un período (enunciado, punto 6) ──────────────────────────────────────
-- Ítems ordenados por fecha de compra; si se paga tarde, un ítem aparte de mora:
--   días de mora = fecha efectiva − fecha de pago
--   Mora = Total · TEP_mora(días de mora)   (con la tasa moratoria pactada en cada venta)
-- Total a pagar = capital + interés compensatorio + mora
create or replace function public.estado_cuenta(p_cliente_id uuid, p_fecha_pago date, p_fecha_efectiva date default null)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  c         public.clientes;
  items     jsonb;
  capital   numeric;
  interes   numeric;
  mora      numeric := 0;
  dias_mora integer := greatest(0, coalesce(p_fecha_efectiva, p_fecha_pago) - p_fecha_pago);
begin
  select * into c from public.clientes where id = p_cliente_id;
  if c.id is null then raise exception 'Cliente no encontrado'; end if;

  -- Ítems del período (compras y cuotas), ordenados por fecha y hora de compra
  select coalesce(jsonb_agg(to_jsonb(d) - 'cliente_id' - 'fecha_pago' - 'fecha_hora_compra' order by d.fecha_hora_compra), '[]'::jsonb),
         coalesce(sum(d.capital), 0), coalesce(sum(d.interes), 0)
    into items, capital, interes
    from public.v_deuda_pendiente d
   where d.cliente_id = p_cliente_id and d.fecha_pago = p_fecha_pago;

  -- §3 Mora = Total · TEP_mora(días de mora), por cada tasa moratoria pactada
  if dias_mora > 0 then
    select coalesce(sum(public.fn_interes(g.total, public.fn_tep(g.nominal, g.tasa, g.periodo, g.cap, dias_mora))), 0)
      into mora
      from (select v.tipo_tasa_moratoria_pactada as nominal, v.tasa_moratoria_pactada as tasa,
                   v.periodo_tasa_moratoria_pactada as periodo, v.capitalizacion_moratoria_pactada as cap,
                   sum(d.total) as total
              from public.v_deuda_pendiente d join public.ventas v on v.id = d.venta_id
             where d.cliente_id = p_cliente_id and d.fecha_pago = p_fecha_pago
             group by 1, 2, 3, 4) g;
  end if;

  return jsonb_build_object(
    'clienteId', c.id, 'cliente', c.nombre, 'documento', c.documento, 'moneda', 'PEN',
    'fechaCorte', public.fn_fecha_corte(p_fecha_pago, c.dia_corte, c.dia_pago), 'fechaPago', p_fecha_pago,
    'fechaEfectiva', coalesce(p_fecha_efectiva, p_fecha_pago), 'diasMora', dias_mora,
    'items', items, 'capital', capital, 'interesCompensatorio', interes,
    'interesMoratorio', mora, 'total', capital + interes + mora);
end;
$function$;

-- ── Registro del pago (enunciado, punto 5 y Anexo A) ────────────────────────────────────────
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

-- ── Descripciones ────────────────────────────────────────────────────────────────────────────
comment on view public.v_deuda_pendiente is 'Compras a fin de mes y cuotas sin pagar (una fila por ítem).';
comment on function public.fn_validar_venta(public.clientes, public.productos, integer, integer) is
  'Reglas del negocio antes de vender: cliente y producto activos, modalidad permitida y plazo máximo.';
comment on function public.simular_venta(uuid, uuid, integer, integer, timestamptz) is
  'Simulación oficial de una venta: §2 ciclo, §3 fin de mes (I = C·TEP) o §4 cuotas (C′, TEM, R, cronograma). TS: simularFinDeMes / simularCuotas.';
comment on function public.registrar_venta(uuid, uuid, integer, integer, timestamptz) is
  'Guarda la venta con el resultado de simular_venta y su cronograma. El límite de crédito lo valida un trigger.';
comment on function public.periodos_pendientes(uuid) is
  'Deuda pendiente de un cliente agrupada por fecha de pago (con su fecha de corte).';
comment on function public.estado_cuenta(uuid, date, date) is
  'Listado de pago de un período: compras y cuotas por fecha, intereses y mora = total · TEP_mora(días). TS: calcularMora.';
comment on function public.registrar_pago(uuid, date, date, numeric) is
  'Pago total del período más antiguo (sin pagos parciales); prelación mora → interés compensatorio → capital.';
comment on function public.fn_deuda_vigente(uuid) is
  'Deuda vigente (capital pendiente) de un cliente, para validar el límite de crédito.';
