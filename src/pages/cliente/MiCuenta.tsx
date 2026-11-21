import { useEffect, useState, type KeyboardEvent } from 'react'
import { Condiciones, Hoja, MargenFecha, MontoGrande, Renglon, Sticker } from '../../components/cuaderno'
import { Cronograma } from '../../components/Cronograma'
import { EstadoCuentaVista, HojaEstadoCuenta, Prelacion } from '../../components/EstadoCuentaVista'
import { Alerta, Dato, Etiqueta, Vacio } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { moneda as aMoneda } from '../../lib/codigos'
import { diffDias, formatearFecha, hoyLima } from '../../lib/fechas'
import { dinero } from '../../lib/formato'
import { mensajeError, supabase } from '../../lib/supabase'
import type { Cliente, Cuota, EstadoCuenta, Pago, PeriodoPendiente, Venta } from '../../types'

const diaSemana = (fecha: string) => new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', weekday: 'long' }).format(new Date(`${fecha}T00:00:00Z`))

export default function MiCuenta() {
  const { perfil, tienda } = useAuth()
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [periodos, setPeriodos] = useState<PeriodoPendiente[]>([])
  const [ec, setEc] = useState<EstadoCuenta | null>(null)
  const [ventas, setVentas] = useState<Venta[]>([])
  const [cuotas, setCuotas] = useState<Cuota[]>([])
  const [pagos, setPagos] = useState<Pago[]>([])
  const [deuda, setDeuda] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Solo interfaz: cronograma desplegado y pestaña activa.
  const [cronogramaAbierto, setCronogramaAbierto] = useState<string | null>(null)
  const [pestana, setPestana] = useState<'compras' | 'pagos'>('compras')

  useEffect(() => {
    const id = perfil?.cliente_id
    if (!id) return
    async function cargar(id: string) {
      const [c, p, v, q, h, d] = await Promise.all([
        supabase.from('clientes').select('*').eq('id', id).single(),
        supabase.rpc('periodos_pendientes', { p_cliente_id: id }),
        supabase.from('ventas').select('*, productos(nombre)').eq('cliente_id', id).order('fecha_hora_compra', { ascending: false }),
        supabase.from('cuotas').select('*').order('numero_cuota'),
        supabase.from('pagos').select('*').eq('cliente_id', id).order('fecha_efectiva_pago', { ascending: false }),
        supabase.rpc('fn_deuda_vigente', { p_cliente_id: id }),
      ])
      const err = c.error ?? p.error ?? v.error
      if (err) return setError(mensajeError(err))
      setCliente(c.data as Cliente)
      const lista = (p.data as PeriodoPendiente[]) ?? []
      setPeriodos(lista)
      setVentas((v.data as Venta[]) ?? [])
      setCuotas((q.data as Cuota[]) ?? [])
      setPagos((h.data as Pago[]) ?? [])
      setDeuda(Number(d.data ?? 0))
      const proximo = lista[0]
      if (proximo) {
        // Si ya venció, se muestra con la mora acumulada a hoy.
        const hoy = hoyLima()
        const r = await supabase.rpc('estado_cuenta', {
          p_cliente_id: id,
          p_fecha_pago: proximo.fecha_pago,
          p_fecha_efectiva: hoy > proximo.fecha_pago ? hoy : proximo.fecha_pago,
        })
        if (!r.error) setEc(r.data as unknown as EstadoCuenta)
      }
    }
    cargar(id)
  }, [perfil?.cliente_id])

  if (error) return <Alerta>{error}</Alerta>
  if (!cliente) return <p role="status" className="text-tinta-suave">Cargando…</p>
  const m = aMoneda(cliente.moneda)
  const ventasCuotas = ventas.filter((v) => v.modalidad_pago)
  const faltan = ec ? diffDias(hoyLima(), ec.fechaPago) : 0

  // Pestañas accesibles: flechas izquierda/derecha cambian de pestaña.
  const teclasPestana = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const otra = pestana === 'compras' ? 'pagos' : 'compras'
    setPestana(otra)
    document.getElementById(`pestana-${otra}`)?.focus()
  }

  return (
    <div className="space-y-6">
      <header className="margen -mx-4 py-2 pr-4 pl-15">
        <h1 className="font-display text-3xl font-extrabold">Hola, {cliente.nombre.split(' ')[0]}</h1>
        <p className="text-sm text-tinta-suave">Tu cuenta en {tienda?.nombre_comercial}</p>
      </header>

      {/* Escritorio: el próximo pago y las condiciones lado a lado. */}
      <div className="flex flex-col gap-6 escritorio:grid escritorio:grid-cols-2 escritorio:items-center escritorio:gap-10">
        <section aria-label="Próximo pago" className="flex flex-col gap-2">
          {ec ? (
            <>
              <p className="text-sm text-tinta-suave">Tu próximo pago es</p>
              <MontoGrande>{dinero(ec.total, m)}</MontoGrande>
              <p>
                hasta el{' '}
                <strong>
                  {diaSemana(ec.fechaPago)} {formatearFecha(ec.fechaPago)}
                </strong>
              </p>
              {ec.diasMora > 0 ? (
                <Sticker className="bg-vencido text-white">vencido hace {ec.diasMora} días</Sticker>
              ) : faltan <= 0 ? (
                <Sticker>vence hoy</Sticker>
              ) : (
                <Sticker>{faltan === 1 ? 'falta 1 día' : `faltan ${faltan} días`}</Sticker>
              )}
            </>
          ) : (
            <p className="font-display text-2xl font-extrabold">No tienes pagos pendientes</p>
          )}
        </section>

        <Condiciones cliente={cliente} deuda={deuda} />
      </div>

      {/* Escritorio: el detalle del pago a todo el ancho; debajo, cuotas e historial lado a lado. */}
      <div className="space-y-6">
        {ec && (
          <section className="min-w-0 space-y-3">
            <HojaEstadoCuenta ec={ec} className="sm:hidden" titulo="Lo que entra en este pago" subtitulo={`Corte ${formatearFecha(ec.fechaCorte)}`} />
            <div className="sm:hidden">
              <Prelacion ec={ec} />
            </div>
            <div className="hidden rounded-2xl border border-papel-borde bg-white p-5 sm:block">
              <h2 className="mb-4 font-display text-lg font-bold">Lo que entra en este pago</h2>
              <EstadoCuentaVista ec={ec} tienda={tienda?.nombre_comercial} />
            </div>
            {periodos.length > 1 && (
              <p className="text-xs text-tinta-suave">
                Pagos siguientes: {periodos.slice(1).map((p) => `${formatearFecha(p.fecha_pago)} (${dinero(p.total, m)})`).join(' · ')}
              </p>
            )}
          </section>
        )}
        <div
          className={
            ventasCuotas.length > 0 ? 'flex flex-col gap-6 escritorio:grid escritorio:grid-cols-2 escritorio:items-start escritorio:gap-8' : 'space-y-6'
          }
        >
          {ventasCuotas.length > 0 && (
            <section aria-labelledby="titulo-cuotas" className="min-w-0 space-y-3">
              <h2 id="titulo-cuotas" className="text-xl font-bold">
                Compras en cuotas
              </h2>
              <ul className="space-y-3">
                {ventasCuotas.map((v) => {
                  const deLaVenta = cuotas.filter((q) => q.venta_id === v.id)
                  const pendientes = deLaVenta.filter((q) => q.estado_pago === 'pendiente')
                  const proxima = pendientes[0]
                  const actual = proxima?.numero_cuota
                  const saldo = pendientes.reduce((t, q) => t + Number(q.cuota), 0)
                  const abierto = cronogramaAbierto === v.id
                  return (
                    <li key={v.id} className="rounded-2xl border border-papel-borde bg-white p-4 escritorio:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display text-lg font-bold">{v.productos?.nombre}</h3>
                            <Etiqueta color={v.estado_pago === 'pagado' ? 'verde' : 'ambar'}>{v.estado_pago}</Etiqueta>
                          </div>
                          <p className="text-sm text-tinta-suave">
                            {deLaVenta.length} cuotas · comprada el {formatearFecha(v.fecha_compra)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-tinta-suave">Cuota mensual</p>
                          <p className="font-display text-2xl font-extrabold tabular-nums">{dinero(v.valor_cuota, m)}</p>
                        </div>
                      </div>

                      {/* Línea de cuotas: en escritorio ocupa todo el ancho y muestra el vencimiento de cada una. */}
                      <ol aria-label="Cuotas" className="my-4 flex items-start overflow-x-auto py-1">
                        {deLaVenta.map((q, i) => {
                          const pagada = q.estado_pago === 'pagado'
                          const esActual = q.numero_cuota === actual
                          return (
                            <li key={q.id} className={`flex shrink-0 items-start ${i > 0 ? 'escritorio:flex-1' : ''}`}>
                              {i > 0 && (
                                <span aria-hidden="true" className={`mt-4 h-0.5 w-4 escritorio:min-w-4 escritorio:flex-1 ${pagada || esActual ? 'bg-tinta' : 'bg-linea'}`} />
                              )}
                              <span className="flex flex-col items-center gap-1">
                                <span
                                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold escritorio:h-9 escritorio:w-9 escritorio:text-sm ${
                                    pagada
                                      ? 'bg-tinta text-resaltador'
                                      : esActual
                                        ? 'border-2 border-tinta bg-resaltador text-tinta'
                                        : 'border-[1.5px] border-linea bg-white text-tinta-suave'
                                  }`}
                                >
                                  <span aria-hidden="true">{pagada ? '✓' : q.numero_cuota}</span>
                                  <span className="sr-only">
                                    Cuota {q.numero_cuota}, vence el {formatearFecha(q.fecha_vencimiento)}: {pagada ? 'pagada' : esActual ? 'la que sigue' : 'pendiente'}
                                  </span>
                                </span>
                                <span aria-hidden="true" className={`hidden text-[11px] tabular-nums escritorio:block ${esActual ? 'font-bold' : 'text-tinta-suave'}`}>
                                  {formatearFecha(q.fecha_vencimiento).slice(0, 5)}
                                </span>
                              </span>
                            </li>
                          )
                        })}
                      </ol>

                      <dl className="grid grid-cols-3 gap-3 border-t border-dashed border-papel-borde pt-3 text-sm">
                        <Dato etiqueta="Pagadas" valor={`${deLaVenta.length - pendientes.length} de ${deLaVenta.length}`} />
                        <Dato etiqueta="Próxima cuota" valor={proxima ? formatearFecha(proxima.fecha_vencimiento) : '—'} />
                        <Dato etiqueta="Saldo por pagar" valor={dinero(saldo, m)} />
                      </dl>
                      <button
                        type="button"
                        aria-expanded={abierto}
                        onClick={() => setCronogramaAbierto(abierto ? null : v.id)}
                        className="mt-1 min-h-11 text-sm font-bold underline underline-offset-4"
                      >
                        {abierto ? 'Ocultar cronograma' : 'Ver cronograma ›'}
                      </button>
                      {abierto && (
                        <div className="mt-2">
                          <Cronograma
                            moneda={m}
                            filas={deLaVenta.map((q) => ({
                              numero: q.numero_cuota,
                              fechaVencimiento: q.fecha_vencimiento,
                              saldoInicial: q.saldo_inicial,
                              interes: q.interes,
                              amortizacion: q.amortizacion,
                              cuota: q.cuota,
                              saldoFinal: q.saldo_final,
                              estado: q.estado_pago,
                            }))}
                          />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          <section className="min-w-0">
            <div role="tablist" aria-label="Historial" className="grid grid-cols-2 gap-1 rounded-xl border-[1.5px] border-tinta p-1">
              {(
                [
                  ['compras', 'Mis compras'],
                  ['pagos', 'Mis pagos'],
                ] as const
              ).map(([id, texto]) => (
                <button
                  key={id}
                  id={`pestana-${id}`}
                  role="tab"
                  type="button"
                  aria-selected={pestana === id}
                  aria-controls={`panel-${id}`}
                  tabIndex={pestana === id ? 0 : -1}
                  onClick={() => setPestana(id)}
                  onKeyDown={teclasPestana}
                  className={`min-h-11 rounded-lg font-bold ${pestana === id ? 'bg-tinta text-papel' : 'text-tinta'}`}
                >
                  {texto}
                </button>
              ))}
            </div>

            <div id="panel-compras" role="tabpanel" aria-labelledby="pestana-compras" hidden={pestana !== 'compras'} className="mt-3">
              {ventas.length === 0 ? (
                <Vacio>Aún no tienes compras registradas.</Vacio>
              ) : (
                <Hoja>
                  <ul>
                    {ventas.map((v, i) => (
                      <Renglon
                        key={v.id}
                        margen={<MargenFecha fecha={v.fecha_compra} repetida={i > 0 && ventas[i - 1].fecha_compra === v.fecha_compra} />}
                        titulo={
                          <>
                            {v.productos?.nombre} &times; {v.cantidad}
                          </>
                        }
                        detalle={
                          <>
                            {v.modalidad_pago ? `${v.num_cuotas} cuotas` : `Fin de mes (${formatearFecha(v.fecha_pago_pactada)})`} ·{' '}
                            <span className={v.estado_pago === 'pagado' ? 'text-pagado' : ''}>{v.estado_pago}</span>
                          </>
                        }
                        monto={dinero(v.monto_capital, m)}
                      />
                    ))}
                  </ul>
                </Hoja>
              )}
            </div>

            <div id="panel-pagos" role="tabpanel" aria-labelledby="pestana-pagos" hidden={pestana !== 'pagos'} className="mt-3">
              {pagos.length === 0 ? (
                <Vacio>Aún no tienes pagos.</Vacio>
              ) : (
                <Hoja>
                  <ul>
                    {pagos.map((p) => (
                      <Renglon
                        key={p.id}
                        margen={<MargenFecha fecha={p.fecha_efectiva_pago} />}
                        titulo={`Pago del ${formatearFecha(p.fecha_efectiva_pago)}`}
                        detalle={`mora ${dinero(p.interes_moratorio, m)} · int. ${dinero(p.interes_compensatorio, m)} · cap. ${dinero(p.capital, m)}`}
                        monto={dinero(p.monto_pagado, m)}
                      />
                    ))}
                  </ul>
                </Hoja>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
