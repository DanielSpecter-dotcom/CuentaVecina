-- =====================================================================
-- CuentaVecina — Migración 005
-- 1. Instalación inicial desde la app (primer administrador del sistema).
-- 2. Notificaciones: nueva compra, pago registrado, recordatorios y vencidos.
-- 3. Recordatorios automáticos diarios (pg_cron, 8:00 a. m. de Lima).
-- 4. Notificaciones push (Web Push): suscripciones + envío vía Edge Function.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Instalación inicial
-- ---------------------------------------------------------------------
-- La pantalla /instalacion pregunta esto SIN sesión. Solo devuelve true/false.
create or replace function public.instalacion_pendiente()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select not exists (select 1 from public.perfiles where rol = 'admin_sistema');
$$;
revoke execute on function public.instalacion_pendiente() from public;
grant execute on function public.instalacion_pendiente() to anon, authenticated;

-- Completa la migración 004: funciones de cálculo solo para usuarios con sesión.
revoke execute on function public.fn_tep(boolean, numeric, smallint, smallint, integer) from public, anon;
revoke execute on function public.fn_dias_periodo(smallint) from public, anon;
grant execute on function public.fn_tep(boolean, numeric, smallint, smallint, integer) to authenticated;
grant execute on function public.fn_dias_periodo(smallint) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Notificaciones
-- ---------------------------------------------------------------------
create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  tipo varchar(15) not null check (tipo in ('VENTA', 'PAGO', 'RECORDATORIO', 'VENCIDO', 'RESUMEN', 'SISTEMA')),
  titulo varchar(120) not null,
  cuerpo varchar(400) not null,
  url varchar(200),
  clave varchar(150) unique, -- evita repetir el mismo recordatorio
  leida boolean not null default false,
  push_enviada boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.notificaciones is 'Avisos para cada usuario. Se crean solo desde triggers/funciones de la BD.';
create index if not exists idx_notificaciones_perfil on public.notificaciones (perfil_id, created_at desc);

alter table public.notificaciones enable row level security;
create policy notificaciones_propias_select on public.notificaciones for select to authenticated
  using (perfil_id = (select auth.uid()));
create policy notificaciones_propias_update on public.notificaciones for update to authenticated
  using (perfil_id = (select auth.uid())) with check (perfil_id = (select auth.uid()));
-- El usuario solo puede leerlas y marcarlas como leídas.
revoke all on public.notificaciones from anon, authenticated;
grant select on public.notificaciones to authenticated;
grant update (leida) on public.notificaciones to authenticated;

-- Para que la campana se actualice al instante (Supabase Realtime respeta RLS).
alter publication supabase_realtime add table public.notificaciones;

create or replace function public.fn_monto(p_monto numeric, p_usd boolean)
returns text
language sql immutable
set search_path = ''
as $$
  select case when p_usd then 'US$ ' else 'S/ ' end || trim(to_char(coalesce(p_monto, 0), 'FM999,999,990.00'));
$$;

create or replace function public.fn_notificar(
  p_perfil uuid, p_tipo text, p_titulo text, p_cuerpo text, p_url text default null, p_clave text default null)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.notificaciones (perfil_id, tipo, titulo, cuerpo, url, clave)
  values (p_perfil, p_tipo, left(p_titulo, 120), left(p_cuerpo, 400), p_url, p_clave)
  on conflict (clave) do nothing;
$$;
revoke execute on function public.fn_notificar(uuid, text, text, text, text, text) from public, anon, authenticated;

-- Nueva compra → aviso al cliente (si tiene usuario).
create or replace function public.fn_notificar_venta()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_producto text;
  v_cuerpo text;
  p record;
begin
  select nombre into v_producto from public.productos where id = new.producto_id;
  if new.modalidad_pago then
    v_cuerpo := format('%s × %s por %s en %s cuotas de %s. La primera vence el %s.',
      v_producto, new.cantidad, public.fn_monto(new.monto_capital, new.moneda_pactada), new.num_cuotas,
      public.fn_monto(new.valor_cuota, new.moneda_pactada),
      to_char((new.fecha_pago_pactada + interval '1 month')::date, 'DD/MM/YYYY'));
  else
    v_cuerpo := format('%s × %s. Pagas %s (incluye %s de interés) el %s.',
      v_producto, new.cantidad, public.fn_monto(new.monto_capital + new.interes_compensatorio, new.moneda_pactada),
      public.fn_monto(new.interes_compensatorio, new.moneda_pactada), to_char(new.fecha_pago_pactada, 'DD/MM/YYYY'));
  end if;
  for p in select id from public.perfiles where cliente_id = new.cliente_id and rol = 'cliente' and activo loop
    perform public.fn_notificar(p.id, 'VENTA', 'Nueva compra registrada', v_cuerpo, '/mi-cuenta', 'venta:' || new.id);
  end loop;
  return null;
end;
$$;
revoke execute on function public.fn_notificar_venta() from public, anon, authenticated;
drop trigger if exists trg_ventas_notificar on public.ventas;
create trigger trg_ventas_notificar after insert on public.ventas
  for each row execute function public.fn_notificar_venta();

-- Pago registrado → confirmación al cliente.
create or replace function public.fn_notificar_pago()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_usd boolean;
  v_cuerpo text;
  p record;
begin
  select moneda into v_usd from public.clientes where id = new.cliente_id;
  v_cuerpo := format('Registramos tu pago de %s del %s (período con vencimiento %s).',
    public.fn_monto(new.monto_pagado, v_usd), to_char(new.fecha_efectiva_pago, 'DD/MM/YYYY'),
    to_char(coalesce(new.fecha_vencimiento, new.fecha_corte_periodo), 'DD/MM/YYYY'));
  if new.dias_mora > 0 then
    v_cuerpo := v_cuerpo || format(' Incluye %s de intereses por %s días de mora.', public.fn_monto(new.interes_moratorio, v_usd), new.dias_mora);
  else
    v_cuerpo := v_cuerpo || ' ¡Gracias por pagar a tiempo!';
  end if;
  for p in select id from public.perfiles where cliente_id = new.cliente_id and rol = 'cliente' and activo loop
    perform public.fn_notificar(p.id, 'PAGO', 'Pago recibido', v_cuerpo, '/mi-cuenta', 'pago:' || new.id);
  end loop;
  return null;
end;
$$;
revoke execute on function public.fn_notificar_pago() from public, anon, authenticated;
drop trigger if exists trg_pagos_notificar on public.pagos;
create trigger trg_pagos_notificar after insert on public.pagos
  for each row execute function public.fn_notificar_pago();

-- Recordatorios: 3 días antes, 1 día antes y el mismo día; vencidos a 1, 3, 7, 15 y 30 días.
-- Al administrador de cada tienda: resumen de lo que vence hoy y lo vencido.
-- Cada aviso tiene una clave única, así que ejecutarla varias veces el mismo día no duplica nada.
create or replace function public.fn_generar_recordatorios(p_hoy date default null)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_hoy date := coalesce(p_hoy, (now() at time zone 'America/Lima')::date);
  v_antes integer;
  r record;
  v_dias integer;
begin
  select count(*) into v_antes from public.notificaciones;

  for r in
    with pendientes as (
      select v.cliente_id, v.fecha_pago_pactada as fecha, v.monto_capital + v.interes_compensatorio as total
        from public.ventas v where v.modalidad_pago = false and v.estado_pago = 'pendiente'
      union all
      select v.cliente_id, q.fecha_vencimiento, q.cuota
        from public.cuotas q join public.ventas v on v.id = q.venta_id where q.estado_pago = 'pendiente'
    )
    select c.id as cliente_id, c.moneda, c.tienda_id, t.nombre_comercial, p.fecha, sum(p.total) as total
      from pendientes p
      join public.clientes c on c.id = p.cliente_id and c.estado
      join public.tiendas t on t.id = c.tienda_id and t.estado
     group by 1, 2, 3, 4, 5
  loop
    v_dias := r.fecha - v_hoy;
    if v_dias in (3, 1, 0) then
      perform public.fn_notificar(pf.id, 'RECORDATORIO',
        case v_dias when 0 then 'Hoy vence tu pago' when 1 then 'Tu pago vence mañana' else 'Tu pago vence en 3 días' end,
        format('Debes pagar %s en %s el %s. Si pagas después, se cobrarán intereses moratorios.',
          public.fn_monto(r.total, r.moneda), r.nombre_comercial, to_char(r.fecha, 'DD/MM/YYYY')),
        '/mi-cuenta', format('rec:%s:%s:%s', r.cliente_id, r.fecha, v_dias))
      from public.perfiles pf where pf.cliente_id = r.cliente_id and pf.rol = 'cliente' and pf.activo;
    elsif -v_dias in (1, 3, 7, 15, 30) then
      perform public.fn_notificar(pf.id, 'VENCIDO', format('Pago vencido hace %s día%s', -v_dias, case when v_dias = -1 then '' else 's' end),
        format('Tu pago de %s en %s venció el %s y ya genera intereses moratorios. Acércate a pagar.',
          public.fn_monto(r.total, r.moneda), r.nombre_comercial, to_char(r.fecha, 'DD/MM/YYYY')),
        '/mi-cuenta', format('ven:%s:%s:%s', r.cliente_id, r.fecha, -v_dias))
      from public.perfiles pf where pf.cliente_id = r.cliente_id and pf.rol = 'cliente' and pf.activo;
    end if;
  end loop;

  -- Resumen diario para el administrador de cada tienda.
  for r in
    with pendientes as (
      select v.cliente_id, v.fecha_pago_pactada as fecha from public.ventas v
       where v.modalidad_pago = false and v.estado_pago = 'pendiente'
      union all
      select v.cliente_id, q.fecha_vencimiento from public.cuotas q join public.ventas v on v.id = q.venta_id
       where q.estado_pago = 'pendiente'
    )
    select c.tienda_id,
           count(distinct c.id) filter (where p.fecha = v_hoy) as hoy,
           count(distinct c.id) filter (where p.fecha < v_hoy) as vencidos
      from pendientes p join public.clientes c on c.id = p.cliente_id and c.estado
     group by c.tienda_id
    having count(*) filter (where p.fecha <= v_hoy) > 0
  loop
    perform public.fn_notificar(pf.id, 'RESUMEN', 'Cobranza del día',
      format('Hoy vence el pago de %s cliente(s) y hay %s cliente(s) con pagos vencidos. Revisa el listado de pagos.', r.hoy, r.vencidos),
      '/tienda', format('res:%s:%s', r.tienda_id, v_hoy))
    from public.perfiles pf where pf.tienda_id = r.tienda_id and pf.rol = 'admin_tienda' and pf.activo;
  end loop;

  return (select count(*) from public.notificaciones) - v_antes;
end;
$$;
revoke execute on function public.fn_generar_recordatorios(date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Recordatorios automáticos: todos los días a las 13:00 UTC = 8:00 a. m. de Lima
-- ---------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('cuentavecina-recordatorios', '0 13 * * *', $$select public.fn_generar_recordatorios()$$);

-- ---------------------------------------------------------------------
-- 4. Notificaciones push (Web Push)
-- ---------------------------------------------------------------------
create table if not exists public.suscripciones_push (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent varchar(300),
  created_at timestamptz not null default now()
);
create index if not exists idx_suscripciones_perfil on public.suscripciones_push (perfil_id);
alter table public.suscripciones_push enable row level security;
create policy suscripciones_propias_select on public.suscripciones_push for select to authenticated
  using (perfil_id = (select auth.uid()));
revoke all on public.suscripciones_push from anon, authenticated;
grant select on public.suscripciones_push to authenticated;

-- Un mismo celular/navegador tiene un solo endpoint: si otro usuario inicia sesión
-- en ese dispositivo, la suscripción pasa a él (y el anterior deja de recibir avisos ahí).
create or replace function public.registrar_suscripcion_push(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.fn_rol_actual() is null then
    raise exception 'No autenticado';
  end if;
  if p_endpoint !~ '^https://' then
    raise exception 'Suscripción inválida';
  end if;
  insert into public.suscripciones_push (perfil_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set perfil_id = excluded.perfil_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end;
$$;

create or replace function public.eliminar_suscripcion_push(p_endpoint text)
returns void
language sql security definer
set search_path = ''
as $$
  delete from public.suscripciones_push where endpoint = p_endpoint and perfil_id = auth.uid();
$$;
revoke execute on function public.registrar_suscripcion_push(text, text, text, text) from public, anon;
revoke execute on function public.eliminar_suscripcion_push(text) from public, anon;
grant execute on function public.registrar_suscripcion_push(text, text, text, text) to authenticated;
grant execute on function public.eliminar_suscripcion_push(text) to authenticated;

-- Cada notificación nueva de un usuario con push activado se envía por la Edge Function
-- "enviar-push" (pg_net hace la llamada HTTP después de confirmar la transacción).
-- La función solo recibe el id: carga la notificación con la clave secreta y la marca como enviada.
create extension if not exists pg_net with schema extensions;

create or replace function public.fn_enviar_push()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.suscripciones_push where perfil_id = new.perfil_id) then
    perform net.http_post(
      url := 'https://objlizkkkqmuuprejplu.supabase.co/functions/v1/enviar-push',
      body := jsonb_build_object('notificacion_id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 10000);
  end if;
  return null;
end;
$$;
revoke execute on function public.fn_enviar_push() from public, anon, authenticated;
drop trigger if exists trg_notificaciones_push on public.notificaciones;
create trigger trg_notificaciones_push after insert on public.notificaciones
  for each row execute function public.fn_enviar_push();
