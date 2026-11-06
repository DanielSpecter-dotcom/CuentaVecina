-- CuentaVecina — Migración 003
-- fn_deuda_vigente solo responde a quien puede ver al cliente, y el trigger de
-- límite de crédito rechaza la venta si la deuda no se puede calcular.

create or replace function public.fn_deuda_vigente(p_cliente_id uuid)
returns numeric
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select sum(v.monto_capital) from public.ventas v
                    where v.cliente_id = p_cliente_id and v.modalidad_pago = false and v.estado_pago = 'pendiente'), 0)
       + coalesce((select sum(q.amortizacion) from public.cuotas q join public.ventas v on v.id = q.venta_id
                    where v.cliente_id = p_cliente_id and q.estado_pago = 'pendiente'), 0)
   where auth.uid() is null  -- triggers/SQL Editor
      or public.fn_rol_actual() = 'admin_sistema'
      or p_cliente_id = public.fn_cliente_actual()
      or exists (select 1 from public.clientes c where c.id = p_cliente_id and c.tienda_id = public.fn_tienda_actual()
                 and public.fn_rol_actual() = 'admin_tienda');
$$;

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
  if v_deuda is null then
    raise exception 'Venta rechazada: no autorizado';
  end if;
  if v_deuda + new.monto_capital > v_limite then
    raise exception 'Venta rechazada: excede el límite de crédito (deuda vigente % + compra % > límite %)',
      v_deuda, new.monto_capital, v_limite;
  end if;
  return new;
end;
$$;
