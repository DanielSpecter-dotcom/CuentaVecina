import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EstadoCuentaVista } from '../../components/EstadoCuentaVista'
import { Alerta, Boton, Campo, Etiqueta, Tarjeta, Vacio } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { moneda as aMoneda } from '../../lib/codigos'
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

  const esMasAntiguo = periodos[0]?.fecha_pago === fechaPago

  return (
    <div className="space-y-4">
      <h1 className="no-imprimir text-xl font-semibold">Cobranza y estado de cuenta</h1>
      {error && <Alerta>{error}</Alerta>}
      {aviso && <Alerta tipo="exito">{aviso}</Alerta>}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="no-imprimir space-y-4">
          <Tarjeta>
            <Campo etiqueta="Cliente" ayuda="Elige al cliente para ver sus períodos con deuda.">
              <select
                value={clienteId}
                onChange={(e) => {
                  setAviso(null)
                  setError(null)
                  setParams(e.target.value ? { cliente: e.target.value } : {})
                }}
              >
                <option value="">Selecciona…</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} — DNI {c.documento}
                  </option>
                ))}
              </select>
            </Campo>
          </Tarjeta>
          {clienteId && (
            <Tarjeta titulo="Períodos pendientes">
              {periodos.length === 0 ? (
                <Vacio>Sin deuda pendiente. 🎉</Vacio>
              ) : (
                <ul className="space-y-2">
                  {periodos.map((p) => {
                    const vencido = p.fecha_pago < hoyLima()
                    return (
                      <li key={p.fecha_pago}>
                        <button
                          onClick={() => setFechaPago(p.fecha_pago)}
                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm ${
                            p.fecha_pago === fechaPago ? 'border-marca-600 bg-marca-50' : 'border-stone-200 hover:bg-stone-50'
                          }`}
                        >
                          <span>
                            Pago {formatearFecha(p.fecha_pago)}
                            <span className="block text-xs text-stone-500">{p.items} ítem(s)</span>
                          </span>
                          <span className="text-right">
                            <span className="block font-medium">{dinero(p.total, m)}</span>
                            {vencido && <Etiqueta color="rojo">vencido</Etiqueta>}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Tarjeta>
          )}
        </div>

        <div className="space-y-4 lg:col-span-2">
          {ec && ec.items.length > 0 && (
            <Tarjeta
              titulo="Listado de pago"
              acciones={
                <span className="no-imprimir">
                  <Boton variante="secundario" onClick={() => window.print()}>
                    Imprimir
                  </Boton>
                </span>
              }
            >
              <EstadoCuentaVista ec={ec} tienda={tienda?.nombre_comercial} />
              <div className="no-imprimir mt-5 flex flex-wrap items-end gap-3 border-t border-stone-100 pt-4">
                <Campo
                  etiqueta="Fecha en que paga"
                  ayuda="Si es posterior a la fecha de pago, se calculan intereses por mora con la tasa moratoria pactada. No puede ser futura."
                >
                  <input type="date" value={fechaEfectiva} max={hoyLima()} onChange={(e) => setFechaEfectiva(e.target.value)} />
                </Campo>
                <Boton onClick={registrarPago} cargando={guardando} disabled={!esMasAntiguo}>
                  Registrar pago total de {dinero(ec.total, m)}
                </Boton>
                {!esMasAntiguo && <span className="text-xs text-amber-700">Primero debe pagarse el período más antiguo.</span>}
              </div>
            </Tarjeta>
          )}
          {clienteId && (
            <Tarjeta titulo="Historial de pagos" className="no-imprimir">
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
                          <td className="text-right font-medium">{dinero(p.monto_pagado, m)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Tarjeta>
          )}
        </div>
      </div>
    </div>
  )
}
