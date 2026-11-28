-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 012 · BOLETA CON VARIOS PRODUCTOS · la forma de pago se elige al vender, no en el producto
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- · Una venta (boleta) tiene una o más líneas en venta_items (producto, cantidad, precio de lista).
-- · El capital de la venta es la suma de sus líneas; sobre ese capital se aplican las fórmulas de 010
--   (fin de mes o cuotas), igual que antes con un solo producto.
-- · productos.modalidad_venta desaparece: la modalidad (fin de mes / cuotas) se elige en la venta.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

-- ── Líneas de la boleta ──────────────────────────────────────────────────────────────────────
create table public.venta_items (
  id              uuid primary key default gen_random_uuid(),
  venta_id        uuid not null references public.ventas(id) on delete cascade,
  producto_id     uuid not null references public.productos(id) on delete restrict,
  cantidad        integer not null check (cantidad >= 1),
  precio_unitario numeric(10,2) not null check (precio_unitario > 0)
);
create index venta_items_venta_idx on public.venta_items (venta_id);

-- Se ve si se ve la venta (las políticas de ventas aplican dentro del exists). Solo registrar_venta escribe.
alter table public.venta_items enable row level security;
create policy venta_items_select on public.venta_items for select to authenticated
  using (exists (select 1 from public.ventas v where v.id = venta_items.venta_id));
revoke all on public.venta_items from public, anon, authenticated;
grant select on public.venta_items to authenticated;

-- Las ventas existentes pasan a ser boletas de una línea (antes del trigger de auditoría: no es una venta nueva).
insert into public.venta_items (venta_id, producto_id, cantidad, precio_unitario)
select v.id, v.producto_id, v.cantidad, coalesce(v.precio_unitario, round(v.monto_capital / v.cantidad, 2))
  from public.ventas v;

create trigger trg_venta_items_auditoria after insert or update or delete on public.venta_items
  for each row execute function public.fn_auditar();

-- ── Detalle de una boleta: "Arroz × 2, Aceite × 1" ───────────────────────────────────────────
create or replace function public.fn_detalle_venta(p_venta_id uuid)
returns text
language sql
stable
set search_path to ''
as $function$
  select string_agg(p.nombre || ' × ' || i.cantidad, ', ' order by p.nombre)
    from public.venta_items i join public.productos p on p.id = i.producto_id
   where i.venta_id = p_venta_id;
$function$;

create or replace view public.v_deuda_pendiente
with (security_invoker = true) as
  select v.cliente_id, v.id as venta_id, null::uuid as cuota_id, 'COMPRA' as tipo,
         v.fecha_compra, v.fecha_hora_compra, public.fn_detalle_venta(v.id) as descripcion,
         v.dias_interes as dias, v.fecha_pago_pactada as fecha_pago,
         v.monto_capital as capital, v.interes_compensatorio as interes,
         v.monto_capital + v.interes_compensatorio as total
    from public.ventas v
   where v.modalidad_pago = false and v.estado_pago = 'pendiente'
  union all
  select v.cliente_id, v.id, q.id, 'CUOTA',
         v.fecha_compra, v.fecha_hora_compra,
         public.fn_detalle_venta(v.id) || ' — cuota ' || q.numero_cuota || '/' || v.num_cuotas,
         30, q.fecha_vencimiento,
         q.amortizacion, q.interes, q.cuota
    from public.cuotas q join public.ventas v on v.id = q.venta_id
   where q.estado_pago = 'pendiente';

-- ── Fuera las columnas de un solo producto y la modalidad del producto ──────────────────────
drop function public.registrar_venta(uuid, uuid, integer, integer, timestamptz);
drop function public.simular_venta(uuid, uuid, integer, integer, timestamptz);
drop function public.fn_validar_venta(public.clientes, public.productos, integer, integer);
alter table public.ventas drop column producto_id, drop column cantidad, drop column precio_unitario;
alter table public.productos drop column modalidad_venta;

-- ── Validaciones de una venta (no son fórmulas) ──────────────────────────────────────────────
-- p_items: [{"productoId": uuid, "cantidad": entero}, …]
create function public.fn_validar_venta(c public.clientes, p_items jsonb, p_num_cuotas integer)
returns void
language plpgsql
stable
set search_path to ''
as $function$
begin
  if c.id is null then raise exception 'Cliente no encontrado'; end if;
  if not c.estado then raise exception 'El cliente está dado de baja'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La boleta debe tener al menos un producto';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_items) x("productoId" uuid, cantidad integer)
              left join public.productos p on p.id = x."productoId" and p.tienda_id = c.tienda_id
             where p.id is null) then
    raise exception 'Producto no encontrado en la tienda';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_items) x("productoId" uuid, cantidad integer)
              join public.productos p on p.id = x."productoId" where not p.estado) then
    raise exception 'Un producto de la boleta está dado de baja';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_items) x("productoId" uuid, cantidad integer)
             where x.cantidad is null or x.cantidad < 1) then
    raise exception 'La cantidad debe ser al menos 1';
  end if;
  if p_num_cuotas is not null and (p_num_cuotas < 1 or p_num_cuotas > c.plazo_max_meses) then
    raise exception 'El número de cuotas debe estar entre 1 y % (plazo máximo del cliente)', c.plazo_max_meses;
  end if;
end;
$function$;

-- ── Simulación de una boleta (fuente oficial) ────────────────────────────────────────────────
-- Capital = Σ precio de lista · cantidad (cada línea redondeada a 2 decimales)
-- Fin de mes:  I = Capital · TEP(días compra → pago)
-- Cuotas:      C′ = Capital · (1 + TEP(días de gracia)),  TEM = TEP(30),  R = cuota francesa,  cronograma
create function public.simular_venta(
  p_cliente_id uuid, p_items jsonb,
  p_num_cuotas integer default null, p_fecha_hora timestamp with time zone default now())
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  c       public.clientes;
  ciclo   record;
  lineas  jsonb;
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

  -- Boleta: cada línea al precio de lista; el capital es la suma de las líneas
  select jsonb_agg(jsonb_build_object(
           'productoId', p.id, 'producto', p.nombre, 'cantidad', x.cantidad,
           'precioUnitario', p.precio_lista, 'subtotal', round(p.precio_lista * x.cantidad, 2))),
         sum(round(p.precio_lista * x.cantidad, 2))
    into lineas, capital
    from jsonb_to_recordset(p_items) x("productoId" uuid, cantidad integer)
    join public.productos p on p.id = x."productoId";

  -- §2 Fecha de corte y fecha de pago de la compra
  select * into ciclo
    from public.fn_ciclo_compra(p_fecha_hora, c.dia_corte, c.dia_pago,
                                (select hora_corte from public.tiendas where id = c.tienda_id));

  -- §1 TEP con la tasa pactada, por los días de la compra a la fecha de pago
  dias := ciclo.fecha_pago - ciclo.fecha_compra;
  tep  := public.fn_tep(c.tipo_tasa, c.tasa_compensatoria, c.periodo_tasa, c.capitalizacion, dias);

  venta := jsonb_build_object(
    'clienteId', c.id, 'items', lineas, 'moneda', 'PEN', 'capital', capital,
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
-- Guarda la venta con los valores de simular_venta, sus líneas y, si es en cuotas, su cronograma.
-- El límite de crédito (deuda vigente + compra ≤ límite) lo valida el trigger trg_ventas_validar_limite.
create function public.registrar_venta(
  p_cliente_id uuid, p_items jsonb,
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

  s := public.simular_venta(p_cliente_id, p_items, p_num_cuotas, p_fecha_hora);

  -- La venta guarda también las condiciones pactadas (tasas) vigentes al momento de la compra.
  insert into public.ventas (
    cliente_id, fecha_compra, fecha_hora_compra,
    modalidad_pago, num_cuotas, monto_capital, traslado_periodo,
    moneda_pactada, tipo_tasa_pactada, tasa_compensatoria_pactada, periodo_tasa_pactada, capitalizacion_pactada,
    tasa_moratoria_pactada, tipo_tasa_moratoria_pactada, periodo_tasa_moratoria_pactada, capitalizacion_moratoria_pactada,
    fecha_corte_pactada, fecha_pago_pactada, dias_interes, tep_aplicada, interes_compensatorio,
    capital_capitalizado, tem, valor_cuota, registrado_por)
  values (
    c.id, (s->>'fechaCompra')::date, p_fecha_hora,
    p_num_cuotas is not null, p_num_cuotas, (s->>'capital')::numeric, (s->>'trasladada')::boolean,
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

revoke execute on function public.fn_validar_venta(public.clientes, jsonb, integer) from public, anon;
revoke execute on function public.simular_venta(uuid, jsonb, integer, timestamptz) from public, anon;
revoke execute on function public.registrar_venta(uuid, jsonb, integer, timestamptz) from public, anon;
grant execute on function public.simular_venta(uuid, jsonb, integer, timestamptz) to authenticated;
grant execute on function public.registrar_venta(uuid, jsonb, integer, timestamptz) to authenticated;

-- ── Aviso de compra: con el detalle de la boleta ─────────────────────────────────────────────
-- Diferido al final de la transacción para que las líneas (venta_items) ya existan.
create or replace function public.fn_notificar_venta()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_detalle text := public.fn_detalle_venta(new.id);
  v_cuerpo text;
  p record;
begin
  if new.modalidad_pago then
    v_cuerpo := format('%s por %s en %s cuotas de %s. La primera vence el %s.',
      v_detalle, public.fn_monto(new.monto_capital, new.moneda_pactada), new.num_cuotas,
      public.fn_monto(new.valor_cuota, new.moneda_pactada),
      to_char((new.fecha_pago_pactada + interval '1 month')::date, 'DD/MM/YYYY'));
  else
    v_cuerpo := format('%s. Pagas %s (incluye %s de interés) el %s.',
      v_detalle, public.fn_monto(new.monto_capital + new.interes_compensatorio, new.moneda_pactada),
      public.fn_monto(new.interes_compensatorio, new.moneda_pactada), to_char(new.fecha_pago_pactada, 'DD/MM/YYYY'));
  end if;
  for p in select id from public.perfiles where cliente_id = new.cliente_id and rol = 'cliente' and activo loop
    perform public.fn_notificar(p.id, 'VENTA', 'Nueva compra registrada', v_cuerpo, '/mi-cuenta', 'venta:' || new.id);
  end loop;
  return null;
end;
$$;
drop trigger if exists trg_ventas_notificar on public.ventas;
create constraint trigger trg_ventas_notificar after insert on public.ventas
  deferrable initially deferred
  for each row execute function public.fn_notificar_venta();

-- ── Descripciones ────────────────────────────────────────────────────────────────────────────
comment on table public.venta_items is 'Líneas de una boleta: producto, cantidad y precio de lista al momento de la venta.';
comment on function public.fn_detalle_venta(uuid) is 'Texto de la boleta: "Producto × cantidad, …".';
comment on function public.fn_validar_venta(public.clientes, jsonb, integer) is
  'Reglas del negocio antes de vender: cliente y productos activos, cantidades válidas y plazo máximo.';
comment on function public.simular_venta(uuid, jsonb, integer, timestamptz) is
  'Simulación oficial de una boleta: capital = Σ líneas; §2 ciclo, §3 fin de mes (I = C·TEP) o §4 cuotas (C′, TEM, R, cronograma).';
comment on function public.registrar_venta(uuid, jsonb, integer, timestamptz) is
  'Guarda la boleta (venta + líneas) con el resultado de simular_venta y su cronograma. El límite lo valida un trigger.';
