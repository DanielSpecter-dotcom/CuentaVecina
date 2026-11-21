import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Avatar, BarraAccion, Hoja, MargenFecha, Renglon, RenglonTitulo, SelectorCliente } from '../../components/cuaderno'
import { EstadoCuentaVista } from '../../components/EstadoCuentaVista'
import { Alerta, Boton, Campo, Etiqueta, Tarjeta, Vacio } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { describirTasa, moneda as aMoneda } from '../../lib/codigos'
import { formatearFecha, hoyLima } from '../../lib/fechas'
import { dinero } from '../../lib/formato'
import { mensajeError, supabase } from '../../lib/supabase'
import type { Cliente, EstadoCuenta, Pago, PeriodoPendiente } from '../../types'

export default function Cobranza() {
  const { tienda } = useAuth()
  const [params, setParams] = useSearchParams()
  const clienteId = params.get('cliente') ?? ''
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [periodos, setPeriodos] = useState<PeriodoPendiente[]>([])
  const [pagos, setPagos] = useState<Pago[]>([])
  const [fechaPago, setFechaPago] = useState<string>(params.get('fecha') ?? '')
  const [fechaEfectiva, setFechaEfectiva] = useState(hoyLima())
  const [ec, setEc] = useState<EstadoCuenta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    supabase.from('clientes').select('*').order('nombre').then(({ data }) => setClientes((data as Cliente[]) ?? []))
  }, [])

  const cliente = clientes.find((c) => c.id === clienteId)
  const m = aMoneda(cliente?.moneda ?? false)

  const cargarCliente = useCallback(async () => {
    setPeriodos([])
    setPagos([])
    setEc(null)
    if (!clienteId) return
    const [p, h] = await Promise.all([
      supabase.rpc('periodos_pendientes', { p_cliente_id: clienteId }),
      supabase.from('pagos').select('*').eq('cliente_id', clienteId).order('fecha_efectiva_pago', { ascending: false }),
    ])
    if (p.error) setError(mensajeError(p.error))
    const lista = (p.data as PeriodoPendiente[]) ?? []
    setPeriodos(lista)
    setPagos((h.data as Pago[]) ?? [])
    setFechaPago((actual) => (lista.some((x) => x.fecha_pago === actual) ? actual : (lista[0]?.fecha_pago ?? '')))
  }, [clienteId])

  useEffect(() => {
    cargarCliente()
  }, [cargarCliente])

  useEffect(() => {
    setEc(null)
    if (!clienteId || !fechaPago) return
    supabase
      .rpc('estado_cuenta', { p_cliente_id: clienteId, p_fecha_pago: fechaPago, p_fecha_efectiva: fechaEfectiva || undefined })
      .then(({ data, error }) => {
        if (error) setError(mensajeError(error))
        else setEc(data as unknown as EstadoCuenta)
      })
  }, [clienteId, fechaPago, fechaEfectiva])

  async function registrarPago() {
    if (!ec) return
    if (!confirm(`¿Registrar el pago total de ${dinero(ec.total, m)} de ${ec.cliente} con fecha ${formatearFecha(fechaEfectiva)}?`)) return
    setGuardando(true)
    setError(null)
    const { error } = await supabase.rpc('registrar_pago', {
      p_cliente_id: clienteId,
      p_fecha_pago: fechaPago,
      p_fecha_efectiva: fechaEfectiva,
      p_monto: ec.total,
    })
    setGuardando(false)
    if (error) return setError(mensajeError(error))
    setAviso(`Pago de ${dinero(ec.total, m)} registrado.`)
    cargarCliente()
  }

  function elegirCliente(id: string) {
    setAviso(null)
    setError(null)
    setParams(id ? { cliente: id } : {})
  }

  const esMasAntiguo = periodos[0]?.fecha_pago === fechaPago
  const hayListado = ec && ec.items.length > 0

  return (
    <div className="space-y-5">
      <div className="no-imprimir flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Cobranza</h1>
        {hayListado && (
          <Boton variante="secundario" onClick={() => window.print()}>
            Imprimir
          </Boton>
        )}
      </div>
      {error && <Alerta>{error}</Alerta>}
      {aviso && <Alerta tipo="exito">{aviso}</Alerta>}

      <div className="no-imprimir">
        {cliente ? (
          <div className="flex items-center gap-3 rounded-2xl border border-papel-borde bg-white p-3">
            <Avatar nombre={cliente.nombre} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{cliente.nombre}</p>
              <p className="text-xs text-tinta-suave">DNI {cliente.documento}</p>
              <p className="text-xs font-bold">
                {describirTasa(cliente.tipo_tasa, cliente.tasa_compensatoria, cliente.periodo_tasa, cliente.capitalizacion)} · Mora{' '}
                {describirTasa(cliente.tipo_tasa_moratoria, cliente.tasa_moratoria, cliente.periodo_tasa_moratoria, cliente.capitalizacion_moratoria)}
              </p>
            </div>
            <button type="button" onClick={() => elegirCliente('')} className="min-h-11 shrink-0 px-2 font-bold underline underline-offset-4">
              Cambiar
            </button>
          </div>
        ) : (
          <SelectorCliente clientes={clientes} valor={clienteId} onChange={elegirCliente} ayuda="Elige al cliente para ver sus períodos con deuda." />
        )}
      </div>

      {clienteId && (
        <section aria-labelledby="titulo-periodos" className="no-imprimir space-y-2">
          <h2 id="titulo-periodos" className="text-lg font-bold">
            Períodos pendientes
          </h2>
          {periodos.length === 0 ? (
            <Vacio>Sin deuda pendiente. 🎉</Vacio>
          ) : (
            <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pt-1 pb-2">
              {periodos.map((p) => {
                const vencido = p.fecha_pago < hoyLima()
                const sel = p.fecha_pago === fechaPago
                return (
                  <li key={p.fecha_pago} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setFechaPago(p.fecha_pago)}
                      aria-pressed={sel}
                      className={`flex w-44 flex-col items-start gap-1 rounded-xl bg-white p-3 text-left ${
                        sel
                          ? vencido
                            ? 'border-2 border-vencido shadow-[3px_3px_0_var(--color-vencido)]'
                            : 'border-2 border-tinta shadow-[3px_3px_0_var(--color-tinta)]'
                          : 'border-[1.5px] border-linea'
                      }`}
                    >
                      <span className="text-sm font-bold">Pago {formatearFecha(p.fecha_pago)}</span>
                      {vencido ? <Etiqueta color="rojo">vencido</Etiqueta> : <Etiqueta>pendiente</Etiqueta>}
                      <span className="text-xs text-tinta-suave">
                        {p.items} {p.items === 1 ? 'ítem' : 'ítems'}
                      </span>
                      <span className={`font-display text-lg font-extrabold tabular-nums ${vencido ? 'text-vencido' : ''}`}>{dinero(p.total, m)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {hayListado && (
        <>
          <section aria-label="Listado de pago" className="sm:rounded-2xl sm:border sm:border-papel-borde sm:bg-white sm:p-5 print:border-0 print:p-0">
            <h2 className="mb-4 hidden font-display text-lg font-bold sm:block print:block">Listado de pago</h2>
            <EstadoCuentaVista ec={ec} tienda={tienda?.nombre_comercial} />
          </section>
          <div className="no-imprimir">
            <Campo
              etiqueta="Fecha en que paga"
              ayuda="Si es posterior a la fecha de pago, se calculan intereses por mora con la tasa moratoria pactada. No puede ser futura."
            >
              <input type="date" value={fechaEfectiva} max={hoyLima()} onChange={(e) => setFechaEfectiva(e.target.value)} />
            </Campo>
          </div>
          <BarraAccion>
            <Boton onClick={registrarPago} cargando={guardando} disabled={!esMasAntiguo} className="w-full">
              Registrar pago total de {dinero(ec.total, m)}
            </Boton>
            {!esMasAntiguo && (
              <p className="mt-2 text-center">
                <Etiqueta color="ambar">Primero debe pagarse el período más antiguo</Etiqueta>
              </p>
            )}
          </BarraAccion>
        </>
      )}

      {clienteId && (
        <section aria-label="Historial de pagos" className="no-imprimir">
          <Hoja className="sm:hidden">
            <RenglonTitulo titulo="Historial de pagos" />
            {pagos.length === 0 ? (
              <p className="flex h-14 items-center pl-15 text-sm text-tinta-suave">Aún no hay pagos.</p>
            ) : (
              <ul>
                {pagos.map((p) => (
                  <Renglon
                    key={p.id}
                    margen={<MargenFecha fecha={p.fecha_efectiva_pago} />}
                    titulo={
                      <>
                        Período {formatearFecha(p.fecha_vencimiento)} {p.dias_mora > 0 && <Etiqueta color="rojo">{p.dias_mora} d. mora</Etiqueta>}
                      </>
                    }
                    detalle={`mora ${dinero(p.interes_moratorio, m)} · int. ${dinero(p.interes_compensatorio, m)} · cap. ${dinero(p.capital, m)}`}
                    monto={dinero(p.monto_pagado, m)}
                  />
                ))}
              </ul>
            )}
          </Hoja>
          <Tarjeta titulo="Historial de pagos" className="hidden sm:block">
            {pagos.length === 0 ? (
              <Vacio>Aún no hay pagos.</Vacio>
            ) : (
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Pagó el</th>
                      <th>Período (pago)</th>
                      <th className="text-right">Mora</th>
                      <th className="text-right">Interés</th>
                      <th className="text-right">Capital</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagos.map((p) => (
                      <tr key={p.id}>
                        <td>
                          {formatearFecha(p.fecha_efectiva_pago)} {p.dias_mora > 0 && <Etiqueta color="rojo">{p.dias_mora} d. mora</Etiqueta>}
                        </td>
                        <td>{formatearFecha(p.fecha_vencimiento)}</td>
                        <td className="text-right">{dinero(p.interes_moratorio, m)}</td>
                        <td className="text-right">{dinero(p.interes_compensatorio, m)}</td>
                        <td className="text-right">{dinero(p.capital, m)}</td>
                        <td className="text-right font-bold">{dinero(p.monto_pagado, m)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>
        </section>
      )}
    </div>
  )
}
