-- 008 · La app trabaja solo en soles.
--
-- El enunciado pide registrar "la moneda del crédito" de cada cliente, pero no menciona dólares, y los precios
-- del catálogo están en soles. Se deja una sola moneda: el cliente sigue teniendo su moneda del crédito
-- (columna clientes.moneda, false = Soles), ahora fija en Soles, y se quitan los topes BCRP en dólares.

-- Moneda del crédito: solo Soles (false = PEN).
alter table public.clientes alter column moneda set default false;
alter table public.clientes drop constraint if exists chk_cliente_moneda_soles;
alter table public.clientes add constraint chk_cliente_moneda_soles check (moneda = false);
comment on column public.clientes.moneda is 'Moneda del crédito: false = Soles (S/). La app trabaja solo en soles.';

alter table public.ventas drop constraint if exists chk_venta_moneda_soles;
alter table public.ventas add constraint chk_venta_moneda_soles check (moneda_pactada = false);
comment on column public.ventas.moneda_pactada is 'Moneda del crédito al momento de la venta: false = Soles (S/).';

-- Validación de tasas contra el tope BCRP vigente (solo soles).
create or replace function public.fn_validar_tasas_bcrp()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  p public.parametros_bcrp;
  v_tea numeric;
  v_tea_mor numeric;
begin
  select * into p from public.parametros_bcrp
   where current_date >= vigente_desde and (vigente_hasta is null or current_date < vigente_hasta)
   order by vigente_desde desc limit 1;
  if not found then
    return new;
  end if;
  v_tea := public.fn_tep(new.tipo_tasa, new.tasa_compensatoria, new.periodo_tasa, new.capitalizacion, 360) * 100;
  v_tea_mor := public.fn_tep(new.tipo_tasa_moratoria, new.tasa_moratoria, new.periodo_tasa_moratoria, new.capitalizacion_moratoria, 360) * 100;
  if v_tea > p.tasa_max_pen then
    raise exception 'La tasa compensatoria pactada equivale a una TEA de % %%, que supera la máxima BCRP vigente (% %%)',
      round(v_tea, 4), round(p.tasa_max_pen, 4);
  end if;
  if v_tea_mor > p.tasa_max_mor_pen then
    raise exception 'La tasa moratoria pactada equivale a una TEA de % %%, que supera la máxima BCRP vigente (% %%)',
      round(v_tea_mor, 4), round(p.tasa_max_mor_pen, 4);
  end if;
  return new;
end;
$function$;

-- Topes BCRP: se quitan las columnas en dólares.
alter table public.parametros_bcrp drop constraint if exists parametros_bcrp_tasas_chk;
alter table public.parametros_bcrp drop column if exists tasa_max_usd;
alter table public.parametros_bcrp drop column if exists tasa_max_mor_usd;
alter table public.parametros_bcrp add constraint parametros_bcrp_tasas_chk
  check (tasa_max_pen > 0 and tasa_max_mor_pen > 0);

-- Montos en los avisos: siempre en soles (el segundo parámetro se conserva por compatibilidad con los triggers).
create or replace function public.fn_monto(p_monto numeric, p_usd boolean)
returns text
language sql
immutable
set search_path to ''
as $$
  select 'S/ ' || trim(to_char(coalesce(p_monto, 0), 'FM999,999,990.00'));
$$;

-- simular_venta y estado_cuenta devuelven siempre 'PEN'.
do $$
declare
  f text;
  d text;
  n text;
begin
  foreach f in array array['public.simular_venta(uuid,uuid,integer,integer,timestamptz)', 'public.estado_cuenta(uuid,date,date)'] loop
    d := pg_get_functiondef(f::regprocedure);
    n := replace(d, $r$case when c.moneda then 'USD' else 'PEN' end$r$, $r$'PEN'$r$);
    if n = d then raise exception '%: no se encontró la moneda', f; end if;
    execute n;
  end loop;
end;
$$;
