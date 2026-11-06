import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alerta, Etiqueta, Tarjeta, Vacio } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { formatearFecha, hoyLima } from '../../lib/fechas'
import { dinero } from '../../lib/formato'
import { r2 } from '../../lib/motorFinanciero'
import { mensajeError, supabase } from '../../lib/supabase'

interface ClienteMin {
  id: string
  nombre: string
  documento: string
  moneda: boolean
}

interface Fila {
  fechaPago: string
  cliente: ClienteMin
  items: number
  capital: number
  interes: number
}

export default function Inicio() {
  const { tienda } = useAuth()
  const [filas, setFilas] = useState<Fila[]>([])
  const [numClientes, setNumClientes] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const hoy = hoyLima()

  useEffect(() => {
    async function cargar() {
      const [c, v, q] = await Promise.all([
        supabase.from('clientes').select('id, nombre, documento, moneda').eq('estado', true),
        supabase
          .from('ventas')
          .select('cliente_id, fecha_pago_pactada, monto_capital, interes_compensatorio')
          .eq('modalidad_pago', false)
          .eq('estado_pago', 'pendiente'),
        supabase.from('cuotas').select('fecha_vencimiento, amortizacion, interes, ventas!inner(cliente_id)').eq('estado_pago', 'pendiente'),
      ])
      const err = c.error ?? v.error ?? q.error
      if (err) return setError(mensajeError(err))
      const clientes = new Map((c.data as ClienteMin[]).map((x) => [x.id, x]))
      setNumClientes(clientes.size)
      const acc = new Map<string, Fila>()
      const sumar = (clienteId: string, fechaPago: string, capital: number, interes: number) => {
        const cliente = clientes.get(clienteId)
        if (!cliente) return
        const k = `${fechaPago}|${clienteId}`
        const f = acc.get(k) ?? { fechaPago, cliente, items: 0, capital: 0, interes: 0 }
        f.items += 1
        f.capital += Number(capital)
        f.interes += Number(interes)
        acc.set(k, f)
      }
      for (const x of v.data ?? []) sumar(x.cliente_id, x.fecha_pago_pactada, x.monto_capital, x.interes_compensatorio)
      for (const x of (q.data ?? []) as unknown as { fecha_vencimiento: string; amortizacion: number; interes: number; ventas: { cliente_id: string } }[]) {
        sumar(x.ventas.cliente_id, x.fecha_vencimiento, x.amortizacion, x.interes)
      }
      setFilas([...acc.values()].sort((a, b) => a.fechaPago.localeCompare(b.fechaPago) || a.cliente.nombre.localeCompare(b.cliente.nombre)))
    }
    cargar()
  }, [])

  const porFecha = useMemo(() => {
    const g = new Map<string, Fila[]>()
    for (const f of filas) g.set(f.fechaPago, [...(g.get(f.fechaPago) ?? []), f])
    return [...g.entries()]
  }, [filas])

  const total = r2(filas.reduce((s, f) => s + f.capital + f.interes, 0))
  const vencido = r2(filas.filter((f) => f.fechaPago < hoy).reduce((s, f) => s + f.capital + f.interes, 0))
  const proxima = filas.find((f) => f.fechaPago >= hoy)?.fechaPago

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{tienda?.nombre_comercial}</h1>
        <p className="text-sm text-stone-500">
          {tienda?.giro} · RUC {tienda?.ruc}
        </p>
      </div>
      {error && <Alerta>{error}</Alerta>}
      <div className="grid gap-4 sm:grid-cols-4">
        <Tarjeta>
          <div className="text-xs text-stone-500">Clientes activos</div>
          <div className="text-2xl font-semibold">{numClientes}</div>
        </Tarjeta>
        <Tarjeta>
          <div className="text-xs text-stone-500">Por cobrar (sin mora)</div>
          <div className="text-2xl font-semibold text-marca-800">{dinero(total)}</div>
        </Tarjeta>
        <Tarjeta>
          <div className="text-xs text-stone-500">Vencido</div>
          <div className={`text-2xl font-semibold ${vencido > 0 ? 'text-red-700' : ''}`}>{dinero(vencido)}</div>
        </Tarjeta>
        <Tarjeta>
          <div className="text-xs text-stone-500">Próxima fecha de pago</div>
          <div className="text-2xl font-semibold">{proxima ? formatearFecha(proxima) : '—'}</div>
        </Tarjeta>
      </div>

      <Tarjeta titulo="Listado de pagos por fecha de pago">
        {porFecha.length === 0 ? (
          <Vacio>
            No hay deudas pendientes. <Link to="/tienda/venta" className="text-marca-700 underline">Registra una venta</Link>.
          </Vacio>
        ) : (
          <div className="space-y-5">
            {porFecha.map(([fecha, lista]) => (
              <div key={fecha}>
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                  Pago del {formatearFecha(fecha)}
                  {fecha < hoy ? <Etiqueta color="rojo">vencido</Etiqueta> : fecha === hoy ? <Etiqueta color="ambar">hoy</Etiqueta> : null}
                </h3>
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th className="text-right">Ítems</th>
                      <th className="text-right">Capital</th>
                      <th className="text-right">Interés</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((f) => {
                      const m = f.cliente.moneda ? 'USD' : 'PEN'
                      return (
                        <tr key={f.cliente.id}>
                          <td>
                            <Link to={`/tienda/cobranza?cliente=${f.cliente.id}&fecha=${fecha}`} className="text-marca-800 hover:underline">
                              {f.cliente.nombre}
                            </Link>
                            <span className="ml-2 text-xs text-stone-500">DNI {f.cliente.documento}</span>
                          </td>
                          <td className="text-right">{f.items}</td>
                          <td className="text-right">{dinero(f.capital, m)}</td>
                          <td className="text-right">{dinero(f.interes, m)}</td>
                          <td className="text-right font-medium">{dinero(f.capital + f.interes, m)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </Tarjeta>
    </div>
  )
}
