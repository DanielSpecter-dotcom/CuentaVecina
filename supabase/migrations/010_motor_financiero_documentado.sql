-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 010 · Motor financiero ordenado y documentado
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Este archivo reúne la versión vigente de las funciones con fórmulas financieras, cada una con la
-- fórmula en su encabezado y la función gemela del simulador en TypeScript (src/lib/motorFinanciero.ts).
-- Mapa completo: FORMULAS.md.
--
--   §1 Tasas ..................... fn_dias_periodo, fn_tep                 ↔ tasaEfectivaPeriodo
--   §2 Ciclo de facturación ...... fn_ciclo_compra, fn_fecha_corte        ↔ determinarCiclo
--   §4 Cuota francesa ............ fn_cuota_francesa                      ↔ cuotaFrancesa
--   §3/§4 Simulación de la venta . simular_venta                          ↔ simularFinDeMes / simularCuotas
--   (sin cambios en este archivo, solo documentadas con COMMENT ON)
--   §5 Listado y mora ............ estado_cuenta, periodos_pendientes     ↔ calcularMora
--   §6 Registro .................. registrar_venta, registrar_pago, fn_deuda_vigente, validaciones
--
-- Único cambio de lógica: el ciclo de la compra (antes dentro de simular_venta) pasa a fn_ciclo_compra,
-- con exactamente las mismas reglas. Se verificó que simular_venta devuelve lo mismo antes y después.
-- Convenciones (Anexo A): año 360 / mes 30 días; tasas sin redondear; montos con round(…, 2).
-- ═════════════════════════════════════════════════════════════════════════════════════════════

-- ── §1 Tasas ─────────────────────────────────────────────────────────────────────────────────

-- Días de cada período (códigos de periodo_tasa / capitalizacion). Igual que PERIODOS en src/lib/codigos.ts.
--   0 diaria 1 · 1 quincenal 15 · 2 mensual 30 · 3 bimestral 60 · 4 trimestral 90 · 5 cuatrimestral 120
--   6 semestral 180 · 7 anual 360
create or replace function public.fn_dias_periodo(p_codigo smallint)
returns integer
language sql
immutable
set search_path to ''
as $function$
  select (array[1, 15, 30, 60, 90, 120, 180, 360])[p_codigo + 1];
$function$;

-- Tasa efectiva para un plazo de p_dias días (TEP).                       TS: tasaEfectivaPeriodo
--   Efectiva:  TEP = (1 + TE)^(días / período) − 1
--   Nominal:   TEP = (1 + TN / m)^n − 1,   m = período / capitalización,   n = días / capitalización
create or replace function public.fn_tep(
  p_nominal boolean, p_tasa numeric, p_periodo smallint, p_capitalizacion smallint, p_dias integer)
returns numeric
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_tasa numeric := p_tasa / 100;
  v_periodo integer := public.fn_dias_periodo(p_periodo);
  v_cap integer;
begin
  if p_dias is null or p_dias <= 0 then
    return 0;
  end if;
  if not p_nominal then
    -- Efectiva: (1 + TE)^(días / período) − 1
    return power(1 + v_tasa, p_dias::numeric / v_periodo) - 1;
  end if;
  v_cap := public.fn_dias_periodo(p_capitalizacion);
  if v_cap is null then
    raise exception 'La tasa nominal requiere un período de capitalización';
  end if;
  -- Nominal: (1 + TN / m)^n − 1, con m = período / capitalización y n = días / capitalización
  return power(1 + v_tasa / (v_periodo::numeric / v_cap), p_dias::numeric / v_cap) - 1;
end;
$function$;

-- ── §2 Ciclo de facturación (enunciado, puntos 4 y 5) ────────────────────────────────────────

-- Ciclo de una compra.                                                    TS: determinarCiclo
--   · Compra hasta el día y la hora de corte → corte de ese mes; después → corte del mes siguiente.
--   · Pago = día de pago del mismo mes del corte; si día de pago ≤ día de corte (corte 10, pago 5),
--     el del mes siguiente al corte.
--   Ej. del enunciado: compra 15/09, corte 20, pago 26 → corte 20/09, pago 26/09.
create or replace function public.fn_ciclo_compra(
  p_fecha_hora timestamptz, p_dia_corte integer, p_dia_pago integer, p_hora_corte time default '23:59:59')
returns table (fecha_compra date, hora_compra time, fecha_corte date, fecha_pago date, trasladada boolean)
language sql
stable
set search_path to ''
as $function$
  with t as (select p_fecha_hora at time zone 'America/Lima' as l),
  c as (
    select t.l::date as f, t.l::time as h,
           not (extract(day from t.l) < p_dia_corte
                or (extract(day from t.l) = p_dia_corte and t.l::time <= coalesce(p_hora_corte, '23:59:59'))) as tras
      from t),
  b as (
    select c.*, (date_trunc('month', c.f) + case when c.tras then interval '1 month' else interval '0 month' end)::date as mes_corte
      from c)
  select b.f, b.h,
         b.mes_corte + (p_dia_corte - 1),
         (b.mes_corte + case when p_dia_pago <= p_dia_corte then interval '1 month' else interval '0 month' end)::date + (p_dia_pago - 1),
         b.tras
    from b;
$function$;

-- Fecha de corte del período cuya fecha de pago es p_fecha_pago (inversa de fn_ciclo_compra).
-- La usan estado_cuenta, periodos_pendientes y fn_generar_listados_corte.
create or replace function public.fn_fecha_corte(p_fecha_pago date, p_dia_corte integer, p_dia_pago integer)
returns date
language sql
immutable
set search_path to ''
as $function$
  select (date_trunc('month', p_fecha_pago)
          - case when p_dia_pago <= p_dia_corte then interval '1 month' else interval '0 month' end)::date
         + (p_dia_corte - 1);
$function$;

-- ── §4 Cuota francesa (enunciado, punto 4) ───────────────────────────────────────────────────

-- Cuota R en céntimos, igual en todas las cuotas.                         TS: cuotaFrancesa
--   R exacta = C′ · TEM / (1 − (1 + TEM)^(−n))
--   Se prueban la R redondeada y sus vecinas (±1, ±2… céntimos) y se elige la que deja el menor ajuste en el
--   interés de la última cuota (Iₙ = R − SIₙ frente a TEM · SIₙ), sin amortizaciones ni intereses negativos.
create or replace function public.fn_cuota_francesa(p_cc numeric, p_tem numeric, p_n integer)
returns numeric
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_base numeric;
  v_r numeric;
  v_saldo numeric;
  v_a numeric;
  v_valida boolean;
  v_ajuste numeric;
  v_mejor numeric;
  v_mejor_ajuste numeric;
  v_signo integer;
begin
  if p_n is null or p_n < 1 then raise exception 'Número de cuotas inválido'; end if;
  -- R exacta = C′ · TEM / (1 − (1 + TEM)^(−n)), redondeada a céntimos
  if p_tem = 0 then
    v_base := round(p_cc / p_n, 2);
  else
    v_base := round(p_cc * p_tem / (1 - power(1 + p_tem, -p_n)), 2);
  end if;

  for d in 0..p_n loop
    foreach v_signo in array case when d = 0 then array[1] else array[-1, 1] end loop
      v_r := v_base + v_signo * d * 0.01;
      continue when v_r <= 0;
      v_saldo := p_cc;
      v_valida := true;
      for k in 1..p_n - 1 loop
        v_a := v_r - round(v_saldo * p_tem, 2);
        if v_a <= 0 then v_valida := false; end if;
        v_saldo := v_saldo - v_a;
      end loop;
      -- La última cuota debe amortizar algo y su interés (R − saldo) no puede ser negativo.
      continue when not v_valida or v_saldo <= 0 or v_r - v_saldo < 0;
      v_ajuste := abs((v_r - v_saldo) - round(v_saldo * p_tem, 2));
      if v_mejor is null or v_ajuste < v_mejor_ajuste then
        v_mejor := v_r;
        v_mejor_ajuste := v_ajuste;
      end if;
    end loop;
    -- Siempre se comparan R y sus vecinas a ±1 céntimo; solo se amplía la búsqueda si ninguna es válida.
    exit when d >= 1 and v_mejor is not null;
  end loop;

  if v_mejor is null then
    raise exception 'Con % cuotas el monto es muy pequeño para repartirse en cuotas iguales. Elige menos cuotas.', p_n;
  end if;
  return v_mejor;
end;
$function$;

-- ── §3 y §4 Simulación de la venta (fuente oficial; registrar_venta guarda lo que devuelve) ──

-- Fin de mes (TS: simularFinDeMes):  días = pago − compra;  Interés = Capital · TEP(días);  Total = Capital + Interés
-- Cuotas     (TS: simularCuotas):
--   C′ = Capital · (1 + TEP(días de gracia));  TEM = TEP(30);  R = fn_cuota_francesa(C′, TEM, n)
--   k < n:  Iₖ = SIₖ · TEM,  Aₖ = R − Iₖ;      k = n:  Aₙ = SIₙ,  Iₙ = R − SIₙ;   vencimiento = pago + k meses
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
  v_fecha date;
  v_hora time;
  v_trasladada boolean;
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
  -- Validaciones: cliente y producto activos, modalidad permitida y plazo máximo del cliente.
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

  -- §2 Ciclo: fecha de corte y fecha de pago de la compra.
  select hora_corte into v_hora_corte from public.tiendas where id = c.tienda_id;
  select ci.fecha_compra, ci.hora_compra, ci.fecha_corte, ci.fecha_pago, ci.trasladada
    into v_fecha, v_hora, v_corte, v_pago, v_trasladada
    from public.fn_ciclo_compra(p_fecha_hora, c.dia_corte, c.dia_pago, v_hora_corte) ci;

  -- Días de interés (o de gracia) y TEP con la tasa pactada.
  v_dias := v_pago - v_fecha;
  v_capital := round(pr.precio_lista * p_cantidad, 2);
  v_tep := public.fn_tep(c.tipo_tasa, c.tasa_compensatoria, c.periodo_tasa, c.capitalizacion, v_dias);
  v_deuda := public.fn_deuda_vigente(c.id);

  v_res := jsonb_build_object(
    'clienteId', c.id, 'productoId', pr.id, 'producto', pr.nombre, 'cantidad', p_cantidad,
    'precioUnitario', pr.precio_lista, 'moneda', 'PEN',
    'fechaCompra', v_fecha, 'horaCompra', to_char(v_hora, 'HH24:MI:SS'),
    'fechaCorte', v_corte, 'fechaPago', v_pago, 'trasladada', v_trasladada,
    'capital', v_capital, 'deudaVigente', v_deuda, 'limiteCredito', c.limite_credito,
    'disponible', c.limite_credito - v_deuda, 'excedeLimite', (v_deuda + v_capital) > c.limite_credito);

  -- §3 Fin de mes: Interés = Capital · TEP(días).
  if p_num_cuotas is null then
    v_interes := round(v_capital * v_tep, 2);
    return v_res || jsonb_build_object(
      'modalidad', 'FIN_DE_MES', 'dias', v_dias, 'tep', v_tep,
      'interes', v_interes, 'total', v_capital + v_interes);
  end if;

  -- §4 Cuotas: gracia total capitalizada, TEM a 30 días y cuota francesa igual en todas.
  v_cc := round(v_capital * (1 + v_tep), 2);
  v_tem := public.fn_tep(c.tipo_tasa, c.tasa_compensatoria, c.periodo_tasa, c.capitalizacion, 30);
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

-- ── Permisos ─────────────────────────────────────────────────────────────────────────────────
revoke execute on function public.fn_ciclo_compra(timestamptz, integer, integer, time) from public, anon;
grant execute on function public.fn_ciclo_compra(timestamptz, integer, integer, time) to authenticated;

-- ── Documentación en la base (visible en Supabase → Database → Functions) ────────────────────
comment on function public.fn_dias_periodo(smallint) is
  '§1 Días de cada código de período: 0 diaria 1, 1 quincenal 15, 2 mensual 30, 3 bimestral 60, 4 trimestral 90, 5 cuatrimestral 120, 6 semestral 180, 7 anual 360.';
comment on function public.fn_tep(boolean, numeric, smallint, smallint, integer) is
  '§1 TEP a p_dias días. Efectiva: (1+TE)^(días/período)−1. Nominal: (1+TN/m)^n−1, m=período/cap, n=días/cap. TS: tasaEfectivaPeriodo.';
comment on function public.fn_ciclo_compra(timestamptz, integer, integer, time) is
  '§2 Ciclo de una compra: corte del mes si es hasta el día y hora de corte, si no del mes siguiente; pago en el mes del corte o en el siguiente si día de pago ≤ día de corte. TS: determinarCiclo.';
comment on function public.fn_fecha_corte(date, integer, integer) is
  '§2 Fecha de corte del período cuya fecha de pago es p_fecha_pago (inversa de fn_ciclo_compra).';
comment on function public.fn_cuota_francesa(numeric, numeric, integer) is
  '§4 Cuota francesa en céntimos igual en todas: R = C′·TEM/(1−(1+TEM)^(−n)), ajustada a la R vecina con menor ajuste en la última cuota. TS: cuotaFrancesa.';
comment on function public.simular_venta(uuid, uuid, integer, integer, timestamptz) is
  '§3/§4 Simulación oficial de una venta. Fin de mes: I = C·TEP(días). Cuotas: C′ = C·(1+TEP(gracia)), TEM = TEP(30), cronograma francés. TS: simularFinDeMes / simularCuotas.';
comment on function public.registrar_venta(uuid, uuid, integer, integer, timestamptz) is
  '§6 Registra la venta con el resultado de simular_venta (y sus cuotas). Rechaza si excede el límite de crédito.';
comment on function public.estado_cuenta(uuid, date, date) is
  '§5 Listado de pago de un período: compras y cuotas ordenadas por fecha, intereses y el ítem "Intereses por mora" = total · TEP_mora(días de mora). TS: calcularMora.';
comment on function public.periodos_pendientes(uuid) is
  '§5 Períodos con deuda pendiente de un cliente (fecha de pago, fecha de corte y totales).';
comment on function public.registrar_pago(uuid, date, date, numeric) is
  '§6 Registra el pago total del período más antiguo (sin pagos parciales); guarda la prelación mora → interés compensatorio → capital.';
comment on function public.fn_deuda_vigente(uuid) is
  '§6 Deuda vigente (capital pendiente) de un cliente, para validar el límite de crédito.';
comment on function public.fn_generar_listados_corte(timestamptz) is
  '§5 Genera en la fecha de corte el listado de pago de cada cliente (aviso al cliente y resumen a la tienda).';
