-- =====================================================================
-- CuentaVecina — Migración 002
-- Motor financiero en BD, seguridad (RLS), auditoría y solicitudes.
-- Aditiva: no borra columnas ni datos del esquema 001.
--
-- Códigos usados por el esquema 001 (confirmados por el grupo):
--   periodo/capitalización (smallint 0..7):
--     0 diaria(1) 1 quincenal(15) 2 mensual(30) 3 bimestral(60)
--     4 trimestral(90) 5 cuatrimestral(120) 6 semestral(180) 7 anual(360)
--   tipo_tasa (boolean): false = EFECTIVA, true = NOMINAL
--   moneda (boolean): false = PEN (S/), true = USD ($)
--   ventas.modalidad_pago (boolean): false = fin de mes, true = en cuotas
--   productos.modalidad_venta (0..2): 0 solo fin de mes, 1 solo cuotas, 2 ambas
-- Convenciones (Anexo A): año 360 días, mes 30 días, montos a 2 decimales,
-- prelación de pagos: mora → interés compensatorio → capital.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Funciones financieras base
-- ---------------------------------------------------------------------
create or replace function public.fn_dias_periodo(p_codigo smallint)
returns integer
language sql immutable
set search_path = ''
as $$
  select (array[1, 15, 30, 60, 90, 120, 180, 360])[p_codigo + 1];
$$;

-- Tasa efectiva para un plazo de p_dias días (TEP).
--   Efectiva: TEP = (1 + TE)^(dias/periodo) − 1
--   Nominal:  m = periodo/cap, n = dias/cap, TEP = (1 + TN/m)^n − 1
create or replace function public.fn_tep(
  p_nominal boolean, p_tasa numeric, p_periodo smallint, p_capitalizacion smallint, p_dias integer)
returns numeric
language plpgsql immutable
set search_path = ''
as $$
declare
  v_tasa numeric := p_tasa / 100;
  v_periodo integer := public.fn_dias_periodo(p_periodo);
  v_cap integer;
begin
  if p_dias is null or p_dias <= 0 then
    return 0;
  end if;
  if not p_nominal then
    return power(1 + v_tasa, p_dias::numeric / v_periodo) - 1;
  end if;
  v_cap := public.fn_dias_periodo(p_capitalizacion);
  if v_cap is null then
    raise exception 'La tasa nominal requiere un período de capitalización';
  end if;
  return power(1 + v_tasa / (v_periodo::numeric / v_cap), p_dias::numeric / v_cap) - 1;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Columnas nuevas (todas con valor por defecto o nulas)
-- ---------------------------------------------------------------------
alter table public.tiendas
  add column if not exists hora_corte time not null default '23:59:59';
comment on column public.tiendas.hora_corte is 'Hora límite del día de corte (hora de Lima). Compras posteriores pasan al mes siguiente.';

alter table public.perfiles
  add column if not exists usuario varchar(60) unique,
  add column if not exists activo boolean not null default true;
comment on column public.perfiles.usuario is 'Nombre de usuario para el login (DNI en clientes). El correo interno se deriva de este valor.';

-- Tasa moratoria: el enunciado permite nominal o efectiva (antes se asumía TEA).
alter table public.clientes
  add column if not exists tipo_tasa_moratoria boolean not null default false,
  add column if not exists periodo_tasa_moratoria smallint not null default 7,
  add column if not exists capitalizacion_moratoria smallint;
alter table public.clientes
  add constraint chk_cliente_periodo_mora check (periodo_tasa_moratoria between 0 and 7),
  add constraint chk_cliente_capitalizacion_mora check (
        (tipo_tasa_moratoria = false and capitalizacion_moratoria is null)
     or (tipo_tasa_moratoria = true and capitalizacion_moratoria between 0 and 7));

alter table public.ventas
  add column if not exists fecha_hora_compra timestamptz not null default now(),
  add column if not exists precio_unitario numeric(10,2),
  add column if not exists fecha_corte_pactada date,
  add column if not exists tipo_tasa_moratoria_pactada boolean not null default false,
  add column if not exists periodo_tasa_moratoria_pactada smallint not null default 7,
  add column if not exists capitalizacion_moratoria_pactada smallint,
  add column if not exists dias_interes integer,
  add column if not exists tep_aplicada numeric(16,12),
  add column if not exists interes_compensatorio numeric(10,2) not null default 0,
  add column if not exists capital_capitalizado numeric(10,2),
  add column if not exists tem numeric(16,12),
  add column if not exists valor_cuota numeric(10,2),
  add column if not exists registrado_por uuid references auth.users(id) on delete set null;
comment on column public.ventas.dias_interes is 'Fin de mes: días compra→pago. Cuotas: días de gracia total capitalizados.';

alter table public.pagos
  add column if not exists fecha_vencimiento date,
  add column if not exists interes_compensatorio numeric(10,2) not null default 0,
  add column if not exists capital numeric(10,2) not null default 0,
  add column if not exists registrado_por uuid references auth.users(id) on delete set null;
alter table public.pagos
  add constraint chk_pago_prelacion check (monto_pagado = interes_moratorio + interes_compensatorio + capital);

create index if not exists idx_ventas_cliente_fecha_pago on public.ventas (cliente_id, fecha_pago_pactada) where estado_pago = 'pendiente';
create index if not exists idx_cuotas_fecha_venc on public.cuotas (fecha_vencimiento) where estado_pago = 'pendiente';
create index if not exists idx_clientes_tienda on public.clientes (tienda_id);
create index if not exists idx_productos_tienda on public.productos (tienda_id);

-- ---------------------------------------------------------------------
-- 3. Funciones de sesión (RLS): un usuario dado de baja, o de una tienda
--    dada de baja, pierde el acceso.
-- ---------------------------------------------------------------------
create or replace function public.fn_rol_actual()
returns public.rol_usuario
language sql stable security definer
set search_path = ''
as $$
  select p.rol
    from public.perfiles p
    left join public.tiendas t on t.id = p.tienda_id
    left join public.clientes c on c.id = p.cliente_id
   where p.id = auth.uid()
     and p.activo
     and (p.rol = 'admin_sistema' or t.estado)
     and (p.rol <> 'cliente' or c.estado);
$$;

create or replace function public.fn_tienda_actual()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select p.tienda_id from public.perfiles p
   where p.id = auth.uid() and public.fn_rol_actual() is not null;
$$;

create or replace function public.fn_cliente_actual()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select p.cliente_id from public.perfiles p
   where p.id = auth.uid() and public.fn_rol_actual() = 'cliente';
$$;

revoke execute on function public.fn_rol_actual() from public, anon;
revoke execute on function public.fn_tienda_actual() from public, anon;
revoke execute on function public.fn_cliente_actual() from public, anon;
grant execute on function public.fn_rol_actual() to authenticated;
grant execute on function public.fn_tienda_actual() to authenticated;
grant execute on function public.fn_cliente_actual() to authenticated;

-- Corrige search_path de las funciones del 001 (advertencia del linter).
alter function public.fn_set_updated_at() set search_path = '';

-- ---------------------------------------------------------------------
-- 4. Políticas RLS
--    Antes: las políticas de "admin_tienda" solo comparaban tienda_id, así
--    que un cliente con tienda asignada habría podido editar todo. Ahora
--    cada política exige el rol. Todas aplican solo a usuarios autenticados.
-- ---------------------------------------------------------------------
drop policy if exists tiendas_admin_sistema_all on public.tiendas;
drop policy if exists tiendas_admin_tienda_select on public.tiendas;
create policy tiendas_admin_sistema on public.tiendas for all to authenticated
  using ((select public.fn_rol_actual()) = 'admin_sistema')
  with check ((select public.fn_rol_actual()) = 'admin_sistema');
create policy tiendas_propia_select on public.tiendas for select to authenticated
  using (id = (select public.fn_tienda_actual()));

drop policy if exists perfiles_select_propio on public.perfiles;
create policy perfiles_select on public.perfiles for select to authenticated
  using (id = auth.uid()
      or (select public.fn_rol_actual()) = 'admin_sistema'
      or ((select public.fn_rol_actual()) = 'admin_tienda' and tienda_id = (select public.fn_tienda_actual())));

drop policy if exists productos_admin_sistema on public.productos;
drop policy if exists productos_admin_tienda on public.productos;
drop policy if exists productos_cliente_select on public.productos;
create policy productos_admin_sistema_select on public.productos for select to authenticated
  using ((select public.fn_rol_actual()) = 'admin_sistema');
create policy productos_admin_tienda on public.productos for all to authenticated
  using ((select public.fn_rol_actual()) = 'admin_tienda' and tienda_id = (select public.fn_tienda_actual()))
  with check ((select public.fn_rol_actual()) = 'admin_tienda' and tienda_id = (select public.fn_tienda_actual()));
create policy productos_cliente_select on public.productos for select to authenticated
  using ((select public.fn_rol_actual()) = 'cliente' and tienda_id = (select public.fn_tienda_actual()));

drop policy if exists clientes_admin_sistema on public.clientes;
drop policy if exists clientes_admin_tienda on public.clientes;
drop policy if exists clientes_propio_select on public.clientes;
create policy clientes_admin_sistema_select on public.clientes for select to authenticated
  using ((select public.fn_rol_actual()) = 'admin_sistema');
create policy clientes_admin_tienda on public.clientes for all to authenticated
  using ((select public.fn_rol_actual()) = 'admin_tienda' and tienda_id = (select public.fn_tienda_actual()))
  with check ((select public.fn_rol_actual()) = 'admin_tienda' and tienda_id = (select public.fn_tienda_actual()));
create policy clientes_propio_select on public.clientes for select to authenticated
  using (id = (select public.fn_cliente_actual()));

-- Ventas, cuotas y pagos: lectura directa; la escritura va SOLO por las
-- funciones registrar_venta / registrar_pago (no hay política de escritura).
drop policy if exists ventas_admin_tienda on public.ventas;
drop policy if exists ventas_cliente_select on public.ventas;
create policy ventas_admin_tienda_select on public.ventas for select to authenticated
  using ((select public.fn_rol_actual()) = 'admin_tienda'
     and exists (select 1 from public.clientes c where c.id = ventas.cliente_id and c.tienda_id = (select public.fn_tienda_actual())));
create policy ventas_cliente_select on public.ventas for select to authenticated
  using (cliente_id = (select public.fn_cliente_actual()));

drop policy if exists cuotas_admin_tienda on public.cuotas;
drop policy if exists cuotas_cliente_select on public.cuotas;
create policy cuotas_admin_tienda_select on public.cuotas for select to authenticated
  using ((select public.fn_rol_actual()) = 'admin_tienda'
     and exists (select 1 from public.ventas v join public.clientes c on c.id = v.cliente_id
                  where v.id = cuotas.venta_id and c.tienda_id = (select public.fn_tienda_actual())));
create policy cuotas_cliente_select on public.cuotas for select to authenticated
  using (exists (select 1 from public.ventas v where v.id = cuotas.venta_id and v.cliente_id = (select public.fn_cliente_actual())));

drop policy if exists pagos_admin_tienda on public.pagos;
drop policy if exists pagos_cliente_select on public.pagos;
create policy pagos_admin_tienda_select on public.pagos for select to authenticated
  using ((select public.fn_rol_actual()) = 'admin_tienda'
     and exists (select 1 from public.clientes c where c.id = pagos.cliente_id and c.tienda_id = (select public.fn_tienda_actual())));
create policy pagos_cliente_select on public.pagos for select to authenticated
  using (cliente_id = (select public.fn_cliente_actual()));

-- parametros_bcrp tenía RLS desactivado (expuesta a cualquiera con la clave pública).
alter table public.parametros_bcrp enable row level security;
create policy bcrp_lectura on public.parametros_bcrp for select to authenticated using (true);
create policy bcrp_admin_sistema on public.parametros_bcrp for all to authenticated
  using ((select public.fn_rol_actual()) = 'admin_sistema')
  with check ((select public.fn_rol_actual()) = 'admin_sistema');

-- ---------------------------------------------------------------------
-- 5. Validaciones de negocio (triggers)
-- ---------------------------------------------------------------------
-- Deuda vigente = capital pendiente de compras a fin de mes
--               + amortización pendiente de cuotas.
create or replace function public.fn_deuda_vigente(p_cliente_id uuid)
returns numeric
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select sum(v.monto_capital) from public.ventas v
                    where v.cliente_id = p_cliente_id and v.modalidad_pago = false and v.estado_pago = 'pendiente'), 0)
       + coalesce((select sum(q.amortizacion) from public.cuotas q join public.ventas v on v.id = q.venta_id
                    where v.cliente_id = p_cliente_id and q.estado_pago = 'pendiente'), 0);
$$;
revoke execute on function public.fn_deuda_vigente(uuid) from public, anon;
grant execute on function public.fn_deuda_vigente(uuid) to authenticated;

create or replace function public.fn_validar_limite_credito()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_deuda numeric;
  v_limite numeric;
  v_estado boolean;
begin
  select limite_credito, estado into v_limite, v_estado from public.clientes where id = new.cliente_id;
  if not v_estado then
    raise exception 'Venta rechazada: el cliente está dado de baja';
  end if;
  v_deuda := public.fn_deuda_vigente(new.cliente_id);
  if v_deuda + new.monto_capital > v_limite then
    raise exception 'Venta rechazada: excede el límite de crédito (deuda vigente % + compra % > límite %)',
      v_deuda, new.monto_capital, v_limite;
  end if;
  return new;
end;
$$;

-- Tasas pactadas ≤ tasas máximas BCRP vigentes (si hay parámetros cargados).
create or replace function public.fn_validar_tasas_bcrp()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  p public.parametros_bcrp;
  v_tea numeric;
  v_tea_mor numeric;
  v_max numeric;
  v_max_mor numeric;
begin
  select * into p from public.parametros_bcrp
   where current_date >= vigente_desde and (vigente_hasta is null or current_date < vigente_hasta)
   order by vigente_desde desc limit 1;
  if not found then
    return new;
  end if;
  v_tea := public.fn_tep(new.tipo_tasa, new.tasa_compensatoria, new.periodo_tasa, new.capitalizacion, 360) * 100;
  v_tea_mor := public.fn_tep(new.tipo_tasa_moratoria, new.tasa_moratoria, new.periodo_tasa_moratoria, new.capitalizacion_moratoria, 360) * 100;
  v_max := case when new.moneda then p.tasa_max_usd else p.tasa_max_pen end;
  v_max_mor := case when new.moneda then p.tasa_max_mor_usd else p.tasa_max_mor_pen end;
  if v_tea > v_max then
    raise exception 'La tasa compensatoria pactada equivale a una TEA de % %%, que supera la máxima BCRP vigente (% %%)',
      round(v_tea, 4), round(v_max, 4);
  end if;
  if v_tea_mor > v_max_mor then
    raise exception 'La tasa moratoria pactada equivale a una TEA de % %%, que supera la máxima BCRP vigente (% %%)',
      round(v_tea_mor, 4), round(v_max_mor, 4);
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_validar_tasas_bcrp() from public, anon, authenticated;

drop trigger if exists trg_clientes_validar_bcrp on public.clientes;
create trigger trg_clientes_validar_bcrp
  before insert or update of tasa_compensatoria, tipo_tasa, periodo_tasa, capitalizacion, tasa_moratoria,
    tipo_tasa_moratoria, periodo_tasa_moratoria, capitalizacion_moratoria, moneda
  on public.clientes for each row execute function public.fn_validar_tasas_bcrp();

-- ---------------------------------------------------------------------
-- 6. Auditoría: "registrar todas las operaciones realizadas"
-- ---------------------------------------------------------------------
create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  tabla text not null,
  operacion text not null,
  registro_id uuid,
  usuario_id uuid,
  tienda_id uuid,
  datos_antes jsonb,
  datos_despues jsonb,
  fecha timestamptz not null default now()
);
create index if not exists idx_auditoria_tienda_fecha on public.auditoria (tienda_id, fecha desc);
alter table public.auditoria enable row level security;
create policy auditoria_admin_sistema on public.auditoria for select to authenticated
  using ((select public.fn_rol_actual()) = 'admin_sistema');
create policy auditoria_admin_tienda on public.auditoria for select to authenticated
  using ((select public.fn_rol_actual()) = 'admin_tienda' and tienda_id = (select public.fn_tienda_actual()));

create or replace function public.fn_auditar()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_fila jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_tienda uuid;
begin
  if tg_table_name = 'tiendas' then
    v_tienda := (v_fila->>'id')::uuid;
  elsif v_fila ? 'tienda_id' then
    v_tienda := (v_fila->>'tienda_id')::uuid;
  elsif v_fila ? 'cliente_id' then
    select tienda_id into v_tienda from public.clientes where id = (v_fila->>'cliente_id')::uuid;
  elsif v_fila ? 'venta_id' then
    select c.tienda_id into v_tienda from public.ventas v join public.clientes c on c.id = v.cliente_id
     where v.id = (v_fila->>'venta_id')::uuid;
  end if;
  insert into public.auditoria (tabla, operacion, registro_id, usuario_id, tienda_id, datos_antes, datos_despues)
  values (tg_table_name, tg_op, (v_fila->>'id')::uuid, auth.uid(), v_tienda,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return null;
end;
$$;
revoke execute on function public.fn_auditar() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['tiendas','perfiles','productos','clientes','ventas','cuotas','pagos','parametros_bcrp'] loop
    execute format('drop trigger if exists trg_%1$s_auditoria on public.%1$I', t);
    execute format('create trigger trg_%1$s_auditoria after insert or update or delete on public.%1$I
                    for each row execute function public.fn_auditar()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7. Solicitudes de alta de negocio (formulario público "Registra tu negocio")
-- ---------------------------------------------------------------------
create table if not exists public.solicitudes_tienda (
  id uuid primary key default gen_random_uuid(),
  nombre_comercial varchar(100) not null,
  ruc char(11) not null check (ruc ~ '^[0-9]{11}$'),
  giro varchar(50) not null,
  direccion varchar(150) not null,
  telefono char(9) check (telefono is null or telefono ~ '^9[0-9]{8}$'),
  correo varchar(100),
  contacto_nombre varchar(100) not null,
  contacto_dni char(8) not null check (contacto_dni ~ '^[0-9]{8}$'),
  estado varchar(10) not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'APROBADA', 'RECHAZADA')),
  tienda_id uuid references public.tiendas(id),
  observacion varchar(250),
  created_at timestamptz not null default now(),
  revisado_at timestamptz
);
alter table public.solicitudes_tienda enable row level security;
create policy solicitudes_insert_publico on public.solicitudes_tienda for insert to anon, authenticated
  with check (estado = 'PENDIENTE' and tienda_id is null and revisado_at is null and observacion is null);
create policy solicitudes_admin_sistema on public.solicitudes_tienda for all to authenticated
  using ((select public.fn_rol_actual()) = 'admin_sistema')
  with check ((select public.fn_rol_actual()) = 'admin_sistema');

-- ---------------------------------------------------------------------
-- 8. Motor financiero (RPC). SECURITY INVOKER: respetan RLS del usuario.
-- ---------------------------------------------------------------------

-- Simula una venta a crédito sin guardarla. Devuelve el mismo formato que
-- src/lib/motorFinanciero.ts (ResultadoFinDeMes / ResultadoCuotas).
create or replace function public.simular_venta(
  p_cliente_id uuid, p_producto_id uuid, p_cantidad integer,
  p_num_cuotas integer default null, p_fecha_hora timestamptz default now())
returns jsonb
language plpgsql stable
set search_path = ''
as $$
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
  v_pago := v_base + (c.dia_pago - 1);
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
  if v_tem = 0 then
    v_r := round(v_cc / p_num_cuotas, 2);
  else
    v_r := round(v_cc * v_tem / (1 - power(1 + v_tem, -p_num_cuotas)), 2);
  end if;
  v_saldo := v_cc;
  for k in 1..p_num_cuotas loop
    v_i := round(v_saldo * v_tem, 2);
    v_a := case when k = p_num_cuotas then v_saldo else round(v_r - v_i, 2) end;
    v_crono := v_crono || jsonb_build_object(
      'numero', k, 'fechaVencimiento', (v_pago + make_interval(months => k))::date,
      'saldoInicial', v_saldo, 'interes', v_i, 'amortizacion', v_a,
      'cuota', v_i + v_a, 'saldoFinal', v_saldo - v_a);
    v_total := v_total + v_i + v_a;
    v_saldo := v_saldo - v_a;
  end loop;
  return v_res || jsonb_build_object(
    'modalidad', 'CUOTAS', 'numeroCuotas', p_num_cuotas, 'diasGracia', v_dias, 'tepGracia', v_tep,
    'capitalCapitalizado', v_cc, 'tem', v_tem, 'valorCuota', v_r,
    'totalIntereses', v_total - v_capital, 'totalPagar', v_total, 'cronograma', v_crono);
end;
$$;

-- Registra la venta (y su cronograma si es en cuotas) en una sola transacción.
-- Se puede registrar con fecha pasada (pasar el cuaderno), nunca futura.
create or replace function public.registrar_venta(
  p_cliente_id uuid, p_producto_id uuid, p_cantidad integer,
  p_num_cuotas integer default null, p_fecha_hora timestamptz default now())
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.clientes;
  s jsonb;
  v_id uuid;
  f jsonb;
begin
  select * into c from public.clientes where id = p_cliente_id;
  if not found or public.fn_rol_actual() is distinct from 'admin_tienda' or c.tienda_id <> public.fn_tienda_actual() then
    raise exception 'No autorizado para registrar ventas de este cliente';
  end if;
  if p_fecha_hora > now() + interval '1 minute' then
    raise exception 'La fecha de compra no puede ser futura';
  end if;
  s := public.simular_venta(p_cliente_id, p_producto_id, p_cantidad, p_num_cuotas, p_fecha_hora);
  if (s->>'excedeLimite')::boolean then
    raise exception 'Venta rechazada: excede el límite de crédito (disponible %)', s->>'disponible';
  end if;

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
  returning id into v_id;

  if p_num_cuotas is not null then
    for f in select * from jsonb_array_elements(s->'cronograma') loop
      insert into public.cuotas (venta_id, numero_cuota, fecha_vencimiento, saldo_inicial, interes, amortizacion, cuota, saldo_final)
      values (v_id, (f->>'numero')::smallint, (f->>'fechaVencimiento')::date, (f->>'saldoInicial')::numeric,
              (f->>'interes')::numeric, (f->>'amortizacion')::numeric, (f->>'cuota')::numeric, (f->>'saldoFinal')::numeric);
    end loop;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.registrar_venta(uuid, uuid, integer, integer, timestamptz) from public, anon;
grant execute on function public.registrar_venta(uuid, uuid, integer, integer, timestamptz) to authenticated;

-- Períodos con deuda pendiente de un cliente (una fila por fecha de pago).
create or replace function public.periodos_pendientes(p_cliente_id uuid)
returns table (fecha_pago date, fecha_corte date, items integer, capital numeric, interes numeric, total numeric)
language sql stable
set search_path = ''
as $$
  with c as (select * from public.clientes where id = p_cliente_id),
  items as (
    select v.fecha_pago_pactada as fecha_pago, v.monto_capital as capital, v.interes_compensatorio as interes
      from public.ventas v where v.cliente_id = p_cliente_id and v.modalidad_pago = false and v.estado_pago = 'pendiente'
    union all
    select q.fecha_vencimiento, q.amortizacion, q.interes
      from public.cuotas q join public.ventas v on v.id = q.venta_id
     where v.cliente_id = p_cliente_id and q.estado_pago = 'pendiente')
  select i.fecha_pago, i.fecha_pago - ((select dia_pago from c) - (select dia_corte from c)),
         count(*)::integer, sum(i.capital), sum(i.interes), sum(i.capital + i.interes)
    from items i group by i.fecha_pago order by i.fecha_pago;
$$;

-- Estado de cuenta (listado de pago) de un cliente para una fecha de pago.
-- Si p_fecha_efectiva > p_fecha_pago, agrega el ítem de intereses por mora
-- sobre el total que debió pagarse (con la tasa moratoria pactada).
create or replace function public.estado_cuenta(
  p_cliente_id uuid, p_fecha_pago date, p_fecha_efectiva date default null)
returns jsonb
language plpgsql stable
set search_path = ''
as $$
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
    -- Mora sobre el total del período, agrupado por condición moratoria pactada.
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
    'fechaCorte', p_fecha_pago - (c.dia_pago - c.dia_corte), 'fechaPago', p_fecha_pago,
    'fechaEfectiva', coalesce(p_fecha_efectiva, p_fecha_pago), 'diasMora', v_dias_mora,
    'items', v_items, 'capital', v_capital, 'interesCompensatorio', v_interes,
    'interesMoratorio', v_mora, 'total', v_capital + v_interes + v_mora);
end;
$$;

-- Registra el pago TOTAL de un período (no se permiten pagos parciales).
-- Prelación: mora → interés compensatorio → capital.
create or replace function public.registrar_pago(
  p_cliente_id uuid, p_fecha_pago date, p_fecha_efectiva date, p_monto numeric)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
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

  insert into public.pagos (cliente_id, monto_pagado, fecha_efectiva_pago, fecha_corte_periodo, fecha_vencimiento,
                            dias_mora, interes_moratorio, interes_compensatorio, capital, registrado_por)
  values (c.id, (ec->>'total')::numeric, p_fecha_efectiva, (ec->>'fechaCorte')::date, p_fecha_pago,
          (ec->>'diasMora')::integer, (ec->>'interesMoratorio')::numeric,
          (ec->>'interesCompensatorio')::numeric, (ec->>'capital')::numeric, auth.uid())
  returning id into v_pago_id;

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
$$;
revoke execute on function public.registrar_pago(uuid, date, date, numeric) from public, anon;
grant execute on function public.registrar_pago(uuid, date, date, numeric) to authenticated;

revoke execute on function public.simular_venta(uuid, uuid, integer, integer, timestamptz) from public, anon;
revoke execute on function public.periodos_pendientes(uuid) from public, anon;
revoke execute on function public.estado_cuenta(uuid, date, date) from public, anon;
grant execute on function public.simular_venta(uuid, uuid, integer, integer, timestamptz) to authenticated;
grant execute on function public.periodos_pendientes(uuid) to authenticated;
grant execute on function public.estado_cuenta(uuid, date, date) to authenticated;

-- Primer administrador del sistema: crear el usuario en Authentication → Users
-- (Add user, Auto Confirm) y luego, en el SQL Editor:
--   select public.fn_promover_admin_sistema('admin@usuarios.cuentavecina.pe', 'Nombre');
create or replace function public.fn_promover_admin_sistema(p_email text, p_nombre text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then raise exception 'No existe un usuario con correo %', p_email; end if;
  insert into public.perfiles (id, rol, nombre, usuario)
  values (v_id, 'admin_sistema', p_nombre, split_part(lower(p_email), '@', 1))
  on conflict (id) do update set rol = 'admin_sistema', tienda_id = null, cliente_id = null, activo = true;
end;
$$;
revoke execute on function public.fn_promover_admin_sistema(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. Imágenes de productos (Storage): lectura pública, escritura solo
--    del admin de la tienda dentro de la carpeta <tienda_id>/
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('productos', 'productos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy productos_img_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'productos' and (select public.fn_rol_actual()) = 'admin_tienda'
              and (storage.foldername(name))[1] = (select public.fn_tienda_actual())::text);
create policy productos_img_update on storage.objects for update to authenticated
  using (bucket_id = 'productos' and (select public.fn_rol_actual()) = 'admin_tienda'
         and (storage.foldername(name))[1] = (select public.fn_tienda_actual())::text);
create policy productos_img_delete on storage.objects for delete to authenticated
  using (bucket_id = 'productos' and (select public.fn_rol_actual()) = 'admin_tienda'
         and (storage.foldername(name))[1] = (select public.fn_tienda_actual())::text);
