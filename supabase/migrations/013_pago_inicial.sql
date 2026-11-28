-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 013 · PAGO INICIAL EN EFECTIVO: el cliente paga una parte de la boleta al momento
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Total boleta = Σ líneas.  Capital financiado = Total boleta − pago inicial (efectivo).
-- Solo el capital financiado va a crédito (fin de mes o cuotas) y cuenta para el límite de crédito.
-- El pago inicial debe ser ≥ 0 y menor que el total (si se paga todo, no es una venta a crédito).
-- ═════════════════════════════════════════════════════════════════════════════════════════════

alter table public.ventas
  add column pago_inicial numeric(10,2) not null default 0 constraint chk_venta_pago_inicial check (pago_inicial >= 0);
comment on column public.ventas.pago_inicial is 'Parte de la boleta pagada en efectivo al vender. monto_capital es el resto (lo financiado).';

-- Se agrega p_pago_inicial (al final, con default 0): las llamadas anteriores siguen funcionando.
drop function public.registrar_venta(uuid, jsonb, integer, timestamptz);
drop function public.simular_venta(uuid, jsonb, integer, timestamptz);

-- ── Simulación de una boleta (fuente oficial) ────────────────────────────────────────────────
-- Total boleta = Σ precio de lista · cantidad;  Capital = Total boleta − pago inicial
-- Fin de mes:  I = Capital · TEP(días compra → pago)
-- Cuotas:      C′ = Capital · (1 + TEP(días de gracia)),  TEM = TEP(30),  R = cuota francesa,  cronograma
create function public.simular_venta(
  p_cliente_id uuid, p_items jsonb,
  p_num_cuotas integer default null, p_fecha_hora timestamp with time zone default now(),
  p_pago_inicial numeric default 0)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  c       public.clientes;
  ciclo   record;
  lineas  jsonb;
  total   numeric;
  inicial numeric := round(coalesce(p_pago_inicial, 0), 2);
  capital numeric;
  dias    integer;
  tep     numeric;
  interes numeric;
  cc      numeric;
  tem     numeric;
  r       numeric;
  venta   jsonb;
begin
  select * into c from public.clientes where id = p_cliente_id;
  perform public.fn_validar_venta(c, p_items, p_num_cuotas);

  -- Boleta: cada línea al precio de lista; el total es la suma de las líneas
  select jsonb_agg(jsonb_build_object(
           'productoId', p.id, 'producto', p.nombre, 'cantidad', x.cantidad,
           'precioUnitario', p.precio_lista, 'subtotal', round(p.precio_lista * x.cantidad, 2))),
         sum(round(p.precio_lista * x.cantidad, 2))
    into lineas, total
    from jsonb_to_recordset(p_items) x("productoId" uuid, cantidad integer)
    join public.productos p on p.id = x."productoId";

  -- Pago inicial en efectivo: el resto es el capital a crédito
  if inicial < 0 then raise exception 'La cuota inicial no puede ser negativa'; end if;
  if inicial >= total then
    raise exception 'La cuota inicial (%) debe ser menor que el total de la boleta (%)', inicial, total;
  end if;
  capital := total - inicial;

  -- §2 Fecha de corte y fecha de pago de la compra
  select * into ciclo
    from public.fn_ciclo_compra(p_fecha_hora, c.dia_corte, c.dia_pago,
                                (select hora_corte from public.tiendas where id = c.tienda_id));

  -- §1 TEP con la tasa pactada, por los días de la compra a la fecha de pago
  dias := ciclo.fecha_pago - ciclo.fecha_compra;
  tep  := public.fn_tep(c.tipo_tasa, c.tasa_compensatoria, c.periodo_tasa, c.capitalizacion, dias);

  venta := jsonb_build_object(
    'clienteId', c.id, 'items', lineas, 'moneda', 'PEN',
    'totalBoleta', total, 'pagoInicial', inicial, 'capital', capital,
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

-- ── Registro de la boleta ────────────────────────────────────────────────────────────────────
-- Guarda la venta (con su pago inicial) con los valores de simular_venta, sus líneas y, si es en cuotas, su cronograma.
-- El límite de crédito (deuda vigente + capital financiado ≤ límite) lo valida el trigger trg_ventas_validar_limite.
create function public.registrar_venta(
  p_cliente_id uuid, p_items jsonb,
  p_num_cuotas integer default null, p_fecha_hora timestamp with time zone default now(),
  p_pago_inicial numeric default 0)
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

  s := public.simular_venta(p_cliente_id, p_items, p_num_cuotas, p_fecha_hora, p_pago_inicial);

  -- La venta guarda también las condiciones pactadas (tasas) vigentes al momento de la compra.
  insert into public.ventas (
    cliente_id, fecha_compra, fecha_hora_compra,
    modalidad_pago, num_cuotas, pago_inicial, monto_capital, traslado_periodo,
    moneda_pactada, tipo_tasa_pactada, tasa_compensatoria_pactada, periodo_tasa_pactada, capitalizacion_pactada,
    tasa_moratoria_pactada, tipo_tasa_moratoria_pactada, periodo_tasa_moratoria_pactada, capitalizacion_moratoria_pactada,
    fecha_corte_pactada, fecha_pago_pactada, dias_interes, tep_aplicada, interes_compensatorio,
    capital_capitalizado, tem, valor_cuota, registrado_por)
  values (
    c.id, (s->>'fechaCompra')::date, p_fecha_hora,
    p_num_cuotas is not null, p_num_cuotas, (s->>'pagoInicial')::numeric, (s->>'capital')::numeric, (s->>'trasladada')::boolean,
    c.moneda, c.tipo_tasa, c.tasa_compensatoria, c.periodo_tasa, c.capitalizacion,
    c.tasa_moratoria, c.tipo_tasa_moratoria, c.periodo_tasa_moratoria, c.capitalizacion_moratoria,
    (s->>'fechaCorte')::date, (s->>'fechaPago')::date,
    coalesce((s->>'dias')::integer, (s->>'diasGracia')::integer),
    coalesce((s->>'tep')::numeric, (s->>'tepGracia')::numeric),
    coalesce((s->>'interes')::numeric, 0),
    (s->>'capitalCapitalizado')::numeric, (s->>'tem')::numeric, (s->>'valorCuota')::numeric, auth.uid())
  returning ventas.id into nueva_venta;

  insert into public.venta_items (venta_id, producto_id, cantidad, precio_unitario)
  select nueva_venta, (i->>'productoId')::uuid, (i->>'cantidad')::integer, (i->>'precioUnitario')::numeric
    from jsonb_array_elements(s->'items') i;

  insert into public.cuotas (venta_id, numero_cuota, fecha_vencimiento, saldo_inicial, interes, amortizacion, cuota, saldo_final)
  select nueva_venta, (f->>'numero')::smallint, (f->>'fechaVencimiento')::date, (f->>'saldoInicial')::numeric,
         (f->>'interes')::numeric, (f->>'amortizacion')::numeric, (f->>'cuota')::numeric, (f->>'saldoFinal')::numeric
    from jsonb_array_elements(coalesce(s->'cronograma', '[]'::jsonb)) f;

  return nueva_venta;
end;
$function$;

revoke execute on function public.simular_venta(uuid, jsonb, integer, timestamptz, numeric) from public, anon;
revoke execute on function public.registrar_venta(uuid, jsonb, integer, timestamptz, numeric) from public, anon;
grant execute on function public.simular_venta(uuid, jsonb, integer, timestamptz, numeric) to authenticated;
grant execute on function public.registrar_venta(uuid, jsonb, integer, timestamptz, numeric) to authenticated;

comment on function public.simular_venta(uuid, jsonb, integer, timestamptz, numeric) is
  'Simulación oficial de una boleta: capital = Σ líneas − pago inicial; §2 ciclo, §3 fin de mes (I = C·TEP) o §4 cuotas (C′, TEM, R, cronograma).';
comment on function public.registrar_venta(uuid, jsonb, integer, timestamptz, numeric) is
  'Guarda la boleta (venta + líneas + pago inicial) con el resultado de simular_venta y su cronograma. El límite lo valida un trigger.';

-- ── Aviso de compra: menciona el pago en efectivo, si lo hubo ────────────────────────────────
create or replace function public.fn_notificar_venta()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_detalle text := public.fn_detalle_venta(new.id);
  v_efectivo text := case when new.pago_inicial > 0
                       then format(' Pagaste %s en efectivo; el saldo de %s', public.fn_monto(new.pago_inicial, new.moneda_pactada),
                                   public.fn_monto(new.monto_capital, new.moneda_pactada))
                     end;
  v_cuerpo text;
  p record;
begin
  if new.modalidad_pago then
    v_cuerpo := format('%s.%s va en %s cuotas de %s. La primera vence el %s.',
      v_detalle,
      coalesce(v_efectivo, ' ' || public.fn_monto(new.monto_capital, new.moneda_pactada)),
      new.num_cuotas, public.fn_monto(new.valor_cuota, new.moneda_pactada),
      to_char((new.fecha_pago_pactada + interval '1 month')::date, 'DD/MM/YYYY'));
  else
    v_cuerpo := format('%s.%s Pagas %s (incluye %s de interés) el %s.',
      v_detalle, coalesce(v_efectivo || ' queda a crédito.', ''),
      public.fn_monto(new.monto_capital + new.interes_compensatorio, new.moneda_pactada),
      public.fn_monto(new.interes_compensatorio, new.moneda_pactada), to_char(new.fecha_pago_pactada, 'DD/MM/YYYY'));
  end if;
  for p in select id from public.perfiles where cliente_id = new.cliente_id and rol = 'cliente' and activo loop
    perform public.fn_notificar(p.id, 'VENTA', 'Nueva compra registrada', v_cuerpo, '/mi-cuenta', 'venta:' || new.id);
  end loop;
  return null;
end;
$$;
