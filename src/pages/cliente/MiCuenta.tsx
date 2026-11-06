import { useEffect, useState } from 'react'
import { Cronograma } from '../../components/Cronograma'
import { EstadoCuentaVista } from '../../components/EstadoCuentaVista'
import { Alerta, Dato, Etiqueta, Tarjeta, Vacio } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { describirTasa, moneda as aMoneda } from '../../lib/codigos'
import { formatearFecha, hoyLima } from '../../lib/fechas'
import { dinero } from '../../lib/formato'
import { mensajeError, supabase } from '../../lib/supabase'
import type { Cliente, Cuota, EstadoCuenta, Pago, PeriodoPendiente, Venta } from '../../types'

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
  if (!cliente) return <p className="text-stone-500">Cargando…</p>
  const m = aMoneda(cliente.moneda)
  const ventasCuotas = ventas.filter((v) => v.modalidad_pago)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Hola, {cliente.nombre.split(' ')[0]}</h1>
        <p className="text-sm text-stone-500">Tu cuenta en {tienda?.nombre_comercial}</p>
      </div>

      <Tarjeta>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
          <Dato etiqueta="Deuda vigente (capital)" valor={dinero(deuda, m)} destacado />
          <Dato etiqueta="Límite de crédito" valor={dinero(cliente.limite_credito, m)} />
          <Dato etiqueta="Tasa pactada" valor={describirTasa(cliente.tipo_tasa, cliente.tasa_compensatoria, cliente.periodo_tasa, cliente.capitalizacion)} />
          <Dato
            etiqueta="Tasa moratoria"
            valor={describirTasa(cliente.tipo_tasa_moratoria, cliente.tasa_moratoria, cliente.periodo_tasa_moratoria, cliente.capitalizacion_moratoria)}
          />
          <Dato etiqueta="Corte / pago" valor={`día ${cliente.dia_corte} / día ${cliente.dia_pago}`} />
        </dl>
      </Tarjeta>

      <Tarjeta titulo="Próximo pago">
        {ec ? <EstadoCuentaVista ec={ec} tienda={tienda?.nombre_comercial} /> : <Vacio>No tienes pagos pendientes.</Vacio>}
        {periodos.length > 1 && (
          <p className="mt-3 text-xs text-stone-500">
            Pagos siguientes: {periodos.slice(1).map((p) => `${formatearFecha(p.fecha_pago)} (${dinero(p.total, m)})`).join(' · ')}
          </p>
        )}
      </Tarjeta>

      {ventasCuotas.length > 0 && (
        <Tarjeta titulo="Compras en cuotas">
          <div className="space-y-6">
            {ventasCuotas.map((v) => (
              <div key={v.id}>
                <div className="mb-2 flex items-center gap-2 text-sm">
                  <span className="font-medium">{v.productos?.nombre}</span>
                  <span className="text-stone-500">
                    comprado el {formatearFecha(v.fecha_compra)} · {v.num_cuotas} cuotas de {dinero(v.valor_cuota, m)}
                  </span>
                  <Etiqueta color={v.estado_pago === 'pagado' ? 'verde' : 'ambar'}>{v.estado_pago}</Etiqueta>
                </div>
                <Cronograma
                  moneda={m}
                  filas={cuotas
                    .filter((q) => q.venta_id === v.id)
                    .map((q) => ({
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
            ))}
          </div>
        </Tarjeta>
      )}

      <Tarjeta titulo="Mis compras">
        {ventas.length === 0 ? (
          <Vacio>Aún no tienes compras registradas.</Vacio>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Producto</th>
                <th>Forma de pago</th>
                <th className="text-right">Capital</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map((v) => (
                <tr key={v.id}>
                  <td>{formatearFecha(v.fecha_compra)}</td>
                  <td>
                    {v.productos?.nombre} × {v.cantidad}
                  </td>
                  <td>{v.modalidad_pago ? `${v.num_cuotas} cuotas` : `Fin de mes (${formatearFecha(v.fecha_pago_pactada)})`}</td>
                  <td className="text-right">{dinero(v.monto_capital, m)}</td>
                  <td>
                    <Etiqueta color={v.estado_pago === 'pagado' ? 'verde' : 'ambar'}>{v.estado_pago}</Etiqueta>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Tarjeta>

      <Tarjeta titulo="Mis pagos">
        {pagos.length === 0 ? (
          <Vacio>Aún no tienes pagos.</Vacio>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th className="text-right">Mora</th>
                <th className="text-right">Interés</th>
                <th className="text-right">Capital</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((p) => (
                <tr key={p.id}>
                  <td>{formatearFecha(p.fecha_efectiva_pago)}</td>
                  <td className="text-right">{dinero(p.interes_moratorio, m)}</td>
                  <td className="text-right">{dinero(p.interes_compensatorio, m)}</td>
                  <td className="text-right">{dinero(p.capital, m)}</td>
                  <td className="text-right font-medium">{dinero(p.monto_pagado, m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Tarjeta>
    </div>
  )
}
