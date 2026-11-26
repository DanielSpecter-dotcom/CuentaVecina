-- 006 · Cuota francesa igual en todas las cuotas.
--
-- R exacta = C' · TEM / (1 − (1 + TEM)^(−n)) casi nunca es un monto en céntimos. Antes se redondeaba R y la
-- última cuota absorbía la diferencia (p. ej. 2.69 ×4 + 2.72). Ahora:
--   · Todas las cuotas valen R (en céntimos).
--   · Cuotas 1..n−1: Iₖ = redondeo(TEM · SIₖ), Aₖ = R − Iₖ (Unidad 3 – Planes de Pago).
--   · Cuota n: amortiza el saldo exacto (Aₙ = SIₙ) y su interés Iₙ = R − SIₙ absorbe el redondeo.
--   · R se elige entre la redondeada y sus vecinas (±1 céntimo; se amplía solo si ninguna es válida):
--     la que deja el menor ajuste |Iₙ − redondeo(TEM · SIₙ)|, sin intereses ni amortizaciones negativas.
--     Ante empate gana la más cercana a R redondeada.
-- Misma regla que cuotaFrancesa() en src/lib/motorFinanciero.ts (la simulación del navegador coincide al céntimo).
-- Las ventas ya registradas no cambian: su cronograma se guardó en la tabla cuotas.

create or replace function public.fn_cuota_francesa(p_cc numeric, p_tem numeric, p_n integer)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
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
$$;
revoke execute on function public.fn_cuota_francesa(numeric, numeric, integer) from public, anon;
grant execute on function public.fn_cuota_francesa(numeric, numeric, integer) to authenticated;

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
