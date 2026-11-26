-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 010 · MOTOR FINANCIERO: SOLO LAS FÓRMULAS
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Este es el archivo que se muestra en la exposición. Cada función es una fórmula, sin validaciones
-- ni accesos a tablas: recibe números y fechas y devuelve el resultado. Las mismas fórmulas están en
-- el simulador del navegador, src/lib/motorFinanciero.ts (misma numeración §).
-- Cómo se usan al vender y al cobrar: 011_venta_y_cobranza.sql. Guía: FORMULAS.md.
--
-- Anexo A: año de 360 días y mes de 30; tasas sin redondear; montos con round(…, 2).
--
--   §1 fn_tep ................... TEP = (1 + TE)^(días/período) − 1   ó   (1 + TN/m)^n − 1
--   §2 fn_ciclo_compra .......... fecha de corte y fecha de pago de una compra
--   §3 fn_interes ............... I = monto · TEP            (fin de mes y mora)
--   §4 fn_capitalizar ........... C′ = C · (1 + TEP)         (gracia total)
--      fn_cuota_exacta .......... R = C′ · TEM / (1 − (1 + TEM)^−n)
--      fn_cuota_francesa ........ R en céntimos, igual en todas las cuotas
--      fn_cronograma_frances .... Iₖ = SIₖ · TEM,  Aₖ = R − Iₖ,  SIₖ₊₁ = SIₖ − Aₖ
-- ═════════════════════════════════════════════════════════════════════════════════════════════

-- ── §1 Tasa efectiva del período (TEP) ───────────────────────────────────────────────────────
-- Días de cada código de período: 0 diaria · 1 quincenal · 2 mensual · 3 bimestral · 4 trimestral
--                                  5 cuatrimestral · 6 semestral · 7 anual
create or replace function public.fn_dias_periodo(p_codigo smallint)
returns integer
language sql
immutable
set search_path to ''
as $function$
  select (array[1, 15, 30, 60, 90, 120, 180, 360])[p_codigo + 1];
$function$;

-- Efectiva:  TEP = (1 + TE)^(días / período) − 1
-- Nominal:   TEP = (1 + TN / m)^n − 1,   m = período / capitalización,   n = días / capitalización
create or replace function public.fn_tep(
  p_nominal boolean, p_tasa numeric, p_periodo smallint, p_capitalizacion smallint, p_dias integer)
returns numeric
language plpgsql
immutable
set search_path to ''
as $function$
declare
  tasa    numeric := p_tasa / 100;
  periodo integer := public.fn_dias_periodo(p_periodo);
  cap     integer := public.fn_dias_periodo(p_capitalizacion);
begin
  if p_dias is null or p_dias <= 0 then
    return 0;
  end if;
  if not p_nominal then
    return power(1 + tasa, p_dias::numeric / periodo) - 1;
  end if;
  if cap is null then
    raise exception 'La tasa nominal requiere un período de capitalización';
  end if;
  return power(1 + tasa / (periodo::numeric / cap), p_dias::numeric / cap) - 1;
end;
$function$;

-- ── §2 Ciclo de facturación ──────────────────────────────────────────────────────────────────
-- · Compra hasta el día y la hora de corte → corte de ese mes; después → corte del mes siguiente.
-- · Pago = día de pago del mismo mes del corte; si día de pago ≤ día de corte (corte 10, pago 5),
--   el del mes siguiente al corte.
-- Ej. del enunciado: compra 15/09, corte 20, pago 26 → corte 20/09, pago 26/09.
create or replace function public.fn_ciclo_compra(
  p_fecha_hora timestamptz, p_dia_corte integer, p_dia_pago integer, p_hora_corte time default '23:59:59')
returns table (fecha_compra date, hora_compra time, fecha_corte date, fecha_pago date, trasladada boolean)
language plpgsql
stable
set search_path to ''
as $function$
declare
  momento   timestamp := p_fecha_hora at time zone 'America/Lima';   -- hora de Lima
  dia       integer   := extract(day from momento);
  despues   boolean   := dia > p_dia_corte
                         or (dia = p_dia_corte and momento::time > coalesce(p_hora_corte, '23:59:59'));
  mes_corte date      := (date_trunc('month', momento) + case when despues then interval '1 month' else interval '0' end)::date;
  mes_pago  date      := (mes_corte + case when p_dia_pago <= p_dia_corte then interval '1 month' else interval '0' end)::date;
begin
  return query select momento::date, momento::time, mes_corte + (p_dia_corte - 1), mes_pago + (p_dia_pago - 1), despues;
end;
$function$;

-- Inversa: fecha de corte del período cuya fecha de pago es p_fecha_pago.
create or replace function public.fn_fecha_corte(p_fecha_pago date, p_dia_corte integer, p_dia_pago integer)
returns date
language sql
immutable
set search_path to ''
as $function$
  select (date_trunc('month', p_fecha_pago)
          - case when p_dia_pago <= p_dia_corte then interval '1 month' else interval '0' end)::date
         + (p_dia_corte - 1);
$function$;

-- ── §3 Interés (compra a fin de mes y mora) ──────────────────────────────────────────────────
-- I = monto · TEP, redondeado a céntimos.
--   Fin de mes:  I = Capital · TEP(días de la compra al pago)
--   Mora:        I = Total vencido · TEP_mora(días de atraso)
create or replace function public.fn_interes(p_monto numeric, p_tep numeric)
returns numeric
language sql
immutable
set search_path to ''
as $function$
  select round(p_monto * p_tep, 2);
$function$;

-- ── §4 Compra en cuotas: método francés vencido simple ordinario ─────────────────────────────
-- Gracia total: el capital se capitaliza desde la compra hasta la fecha de pago.   C′ = C · (1 + TEP)
create or replace function public.fn_capitalizar(p_capital numeric, p_tep numeric)
returns numeric
language sql
immutable
set search_path to ''
as $function$
  select round(p_capital * (1 + p_tep), 2);
$function$;

-- Cuota exacta del método francés:   R = C′ · TEM / (1 − (1 + TEM)^(−n))
create or replace function public.fn_cuota_exacta(p_cc numeric, p_tem numeric, p_n integer)
returns numeric
language sql
immutable
set search_path to ''
as $function$
  select case when p_tem = 0 then p_cc / p_n
              else p_cc * p_tem / (1 - power(1 + p_tem, -p_n)) end;
$function$;

-- Prueba una cuota R en céntimos: recorre las cuotas 1 … n−1 y devuelve cuánto se aparta el interés
-- de la última cuota (R − saldo) del interés normal (saldo · TEM). Devuelve null si con esa R alguna
-- amortización no es positiva o la última cuota no cuadra.
create or replace function public.fn_ajuste_ultima_cuota(p_cc numeric, p_tem numeric, p_n integer, p_r numeric)
returns numeric
language plpgsql
immutable
set search_path to ''
as $function$
declare
  saldo numeric := p_cc;
  amortizacion numeric;
begin
  if p_r <= 0 then return null; end if;
  for k in 1 .. p_n - 1 loop
    amortizacion := p_r - round(saldo * p_tem, 2);
    if amortizacion <= 0 then return null; end if;
    saldo := saldo - amortizacion;
  end loop;
  if saldo <= 0 or p_r - saldo < 0 then return null; end if;
  return abs((p_r - saldo) - round(saldo * p_tem, 2));
end;
$function$;

-- Cuota R en céntimos, igual en todas las cuotas.
-- La R exacta casi nunca es un monto en céntimos: si solo se redondea, el saldo no cierra en 0.
-- Se prueban R redondeada y sus vecinas (−1, +1, −2, +2… céntimos) y se queda la de menor ajuste.
create or replace function public.fn_cuota_francesa(p_cc numeric, p_tem numeric, p_n integer)
returns numeric
language plpgsql
immutable
set search_path to ''
as $function$
declare
  base   numeric;
  mejor  numeric;
  menor  numeric;
  r      numeric;
  ajuste numeric;
begin
  if p_n is null or p_n < 1 then raise exception 'Número de cuotas inválido'; end if;
  base := round(public.fn_cuota_exacta(p_cc, p_tem, p_n), 2);
  for d in 0 .. p_n loop
    foreach r in array array[base - d * 0.01, base + d * 0.01] loop
      ajuste := public.fn_ajuste_ultima_cuota(p_cc, p_tem, p_n, r);
      if ajuste is not null and (mejor is null or ajuste < menor) then
        mejor := r;
        menor := ajuste;
      end if;
    end loop;
    exit when d >= 1 and mejor is not null;  -- siempre se compara con ±1 céntimo
  end loop;
  if mejor is null then
    raise exception 'Con % cuotas el monto es muy pequeño para repartirse en cuotas iguales. Elige menos cuotas.', p_n;
  end if;
  return mejor;
end;
$function$;

-- Cronograma: una fila por cuota.
--   k < n:  Iₖ = SIₖ · TEM,   Aₖ = R − Iₖ
--   k = n:  Aₙ = SIₙ,         Iₙ = R − SIₙ   (la última absorbe el redondeo)
--   SIₖ₊₁ = SIₖ − Aₖ;   vence en la fecha de pago + k meses
create or replace function public.fn_cronograma_frances(
  p_cc numeric, p_tem numeric, p_r numeric, p_n integer, p_fecha_pago date)
returns table (numero integer, fecha_vencimiento date, saldo_inicial numeric, interes numeric,
               amortizacion numeric, cuota numeric, saldo_final numeric)
language plpgsql
immutable
set search_path to ''
as $function$
declare
  saldo numeric := p_cc;
begin
  for k in 1 .. p_n loop
    numero            := k;
    fecha_vencimiento := (p_fecha_pago + make_interval(months => k))::date;
    saldo_inicial     := saldo;
    interes           := case when k < p_n then round(saldo * p_tem, 2) else p_r - saldo end;
    amortizacion      := p_r - interes;
    cuota             := p_r;
    saldo_final       := saldo - amortizacion;
    return next;
    saldo := saldo_final;
  end loop;
end;
$function$;

-- ── Permisos y descripción (Supabase → Database → Functions) ─────────────────────────────────
revoke execute on function public.fn_interes(numeric, numeric) from public, anon;
revoke execute on function public.fn_capitalizar(numeric, numeric) from public, anon;
revoke execute on function public.fn_cuota_exacta(numeric, numeric, integer) from public, anon;
revoke execute on function public.fn_ajuste_ultima_cuota(numeric, numeric, integer, numeric) from public, anon;
revoke execute on function public.fn_cronograma_frances(numeric, numeric, numeric, integer, date) from public, anon;
grant execute on function public.fn_interes(numeric, numeric) to authenticated;
grant execute on function public.fn_capitalizar(numeric, numeric) to authenticated;
grant execute on function public.fn_cuota_exacta(numeric, numeric, integer) to authenticated;
grant execute on function public.fn_ajuste_ultima_cuota(numeric, numeric, integer, numeric) to authenticated;
grant execute on function public.fn_cronograma_frances(numeric, numeric, numeric, integer, date) to authenticated;

comment on function public.fn_dias_periodo(smallint) is '§1 Días de cada código de período (0 diaria … 7 anual).';
comment on function public.fn_tep(boolean, numeric, smallint, smallint, integer) is '§1 TEP. Efectiva: (1+TE)^(días/período)−1. Nominal: (1+TN/m)^n−1. TS: tasaEfectivaPeriodo.';
comment on function public.fn_ciclo_compra(timestamptz, integer, integer, time) is '§2 Fecha de corte y fecha de pago de una compra. TS: determinarCiclo.';
comment on function public.fn_fecha_corte(date, integer, integer) is '§2 Fecha de corte del período cuya fecha de pago es p_fecha_pago.';
comment on function public.fn_interes(numeric, numeric) is '§3 I = monto · TEP (fin de mes y mora). TS: simularFinDeMes / calcularMora.';
comment on function public.fn_capitalizar(numeric, numeric) is '§4 Gracia total: C′ = C · (1 + TEP). TS: simularCuotas.';
comment on function public.fn_cuota_exacta(numeric, numeric, integer) is '§4 R = C′ · TEM / (1 − (1 + TEM)^−n). TS: cuotaExacta.';
comment on function public.fn_ajuste_ultima_cuota(numeric, numeric, integer, numeric) is '§4 Ajuste en el interés de la última cuota para una R en céntimos (null si no sirve).';
comment on function public.fn_cuota_francesa(numeric, numeric, integer) is '§4 R en céntimos igual en todas las cuotas (la vecina de la exacta con menor ajuste). TS: cuotaFrancesa.';
comment on function public.fn_cronograma_frances(numeric, numeric, numeric, integer, date) is '§4 Cronograma francés: Iₖ = SIₖ·TEM, Aₖ = R − Iₖ; la última amortiza el saldo. TS: cronogramaFrances.';
