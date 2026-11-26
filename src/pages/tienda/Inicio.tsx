import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Hoja, MargenFecha, MontoGrande, Renglon, RenglonTitulo, RenglonTotal, SelloVencido } from '../../components/cuaderno'
import { PrimerosPasos } from '../../components/PrimerosPasos'
import { Alerta, Etiqueta, Tarjeta, Vacio } from '../../components/ui'
import { formatearFecha, hoyLima } from '../../lib/fechas'
import { dinero } from '../../lib/formato'
import { r2 } from '../../lib/motorFinanciero'
import { mensajeError, supabase } from '../../lib/supabase'

interface ClienteMin {
  id: string
  nombre: string
  documento: string
}

interface Fila {
  fechaPago: string
  cliente: ClienteMin
  items: number
  capital: number
  interes: number
}

export default function Inicio() {
  const [filas, setFilas] = useState<Fila[]>([])
  const [numClientes, setNumClientes] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const hoy = hoyLima()

  useEffect(() => {
    async function cargar() {
      const [c, v, q] = await Promise.all([
        supabase.from('clientes').select('id, nombre, documento').eq('estado', true),
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

  const porFecha = [...Map.groupBy(filas, (f) => f.fechaPago)]

  const sumar = (lista: Fila[]) => r2(lista.reduce((s, f) => s + f.capital + f.interes, 0))
  const vencidas = filas.filter((f) => f.fechaPago < hoy)
  const deHoy = filas.filter((f) => f.fechaPago === hoy)
  const total = sumar(filas)
  const vencido = sumar(vencidas)
  const totalHoy = sumar(deHoy)
  const proxima = filas.find((f) => f.fechaPago >= hoy)?.fechaPago
  const masAntigua = vencidas[0]
  const clientesVencidos = new Set(vencidas.map((f) => f.cliente.id)).size
  const comprasHoy = deHoy.reduce((s, f) => s + f.items, 0)

  // "Viernes, noviembre 2026" (la fecha ya está en hora de Lima; se formatea en UTC para no correrla un día).
  const fechaHoy = new Date(`${hoy}T00:00:00Z`)
  const parte = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', ...o }).format(fechaHoy)
  const semana = parte({ weekday: 'long' })
  const etiquetaHoy = `${semana[0].toUpperCase()}${semana.slice(1)}, ${parte({ month: 'long' })} ${hoy.slice(0, 4)}`
  // En escritorio cada indicador va en su ficha.
  const ficha = 'escritorio:rounded-2xl escritorio:border escritorio:border-papel-borde escritorio:bg-white escritorio:p-5'

  return (
    <div className="space-y-5">
      <header className="margen relative -mx-4 py-2 pr-4 pl-15">
        <span aria-hidden="true" className="absolute top-2 left-0 w-11 text-center font-display text-[22px] font-extrabold text-vencido">
          {Number(hoy.slice(8, 10))}
        </span>
        <p className="text-sm text-tinta-suave">{etiquetaHoy}</p>
        <h1 className="font-display text-2xl font-bold">Hoy toca cobrar</h1>
      </header>

      {/* Celular: uno debajo del otro. Escritorio: tres fichas en fila (hoy, vencido, totales). */}
      <div className="flex flex-col gap-5 escritorio:grid escritorio:grid-cols-3 escritorio:items-stretch">
        <section aria-label="Cobros de hoy" className={`flex flex-col gap-2 ${ficha}`}>
          {deHoy.length > 0 ? (
            <>
              <MontoGrande>{dinero(totalHoy)}</MontoGrande>
              <p className="text-sm text-tinta-suave">
                {deHoy.length === 1 ? deHoy[0].cliente.nombre : `${deHoy.length} clientes`} · {comprasHoy} {comprasHoy === 1 ? 'compra' : 'compras'}
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-2xl font-extrabold">Nada que cobrar hoy</p>
              {proxima && <p className="text-sm text-tinta-suave">Próxima fecha de pago: {formatearFecha(proxima)}</p>}
            </>
          )}
        </section>

        {masAntigua ? (
          <SelloVencido>
            <p className="mt-1 font-display text-2xl font-extrabold text-vencido tabular-nums">
              {dinero(vencido)}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                {clientesVencidos === 1 ? masAntigua.cliente.nombre : `${clientesVencidos} clientes`} · desde el {formatearFecha(masAntigua.fechaPago).slice(0, 5)}
              </p>
              <Link
                to={`/tienda/cobranza?cliente=${masAntigua.cliente.id}&fecha=${masAntigua.fechaPago}`}
                className="inline-flex min-h-11 items-center gap-0.5 font-bold text-vencido underline underline-offset-4"
              >
                Cobrar <ChevronRight aria-hidden="true" className="size-4" strokeWidth={2.5} />
              </Link>
            </div>
          </SelloVencido>
        ) : (
          <div className={`hidden escritorio:flex escritorio:flex-col escritorio:justify-center ${ficha}`}>
            <p className="text-xs font-bold tracking-[0.12em] text-pagado">AL DÍA</p>
            <p className="mt-1 font-display text-2xl font-extrabold">Sin pagos vencidos</p>
          </div>
        )}

        <dl className={`flex flex-wrap gap-x-8 gap-y-2 escritorio:content-center ${ficha}`}>
          <div>
            <dt className="text-xs text-tinta-suave">Por cobrar</dt>
            <dd className="text-lg font-bold tabular-nums escritorio:font-display escritorio:text-2xl escritorio:font-extrabold">
              {dinero(total)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-tinta-suave">Vecinos con cuenta</dt>
            <dd className="text-lg font-bold tabular-nums escritorio:font-display escritorio:text-2xl escritorio:font-extrabold">{numClientes}</dd>
          </div>
        </dl>
      </div>

      <PrimerosPasos rol="admin_tienda" />
      {error && <Alerta>{error}</Alerta>}

      {filas.length === 0 ? (
        <Vacio>
          No hay deudas pendientes.{' '}
          <Link to="/tienda/venta" className="font-bold underline underline-offset-4">
            Registra una venta
          </Link>
          .
        </Vacio>
      ) : (
        <>
          {/* Celular: el cuaderno, un renglón por cliente y fecha de pago. */}
          <Hoja className="sm:hidden">
            <RenglonTitulo titulo="El cuaderno" />
            <ul>
              {filas.map((f, i) => {
                const venc = f.fechaPago < hoy
                const repetida = i > 0 && filas[i - 1].fechaPago === f.fechaPago
                const chipHoy = f.fechaPago === hoy && !repetida
                return (
                  <Renglon
                    key={`${f.fechaPago}|${f.cliente.id}`}
                    href={`/tienda/cobranza?cliente=${f.cliente.id}&fecha=${f.fechaPago}`}
                    margen={
                      chipHoy ? (
                        <>
                          <span aria-hidden="true">hoy</span>
                          <span className="sr-only">{formatearFecha(f.fechaPago)}</span>
                        </>
                      ) : (
                        <MargenFecha fecha={f.fechaPago} repetida={repetida} />
                      )
                    }
                    tonoMargen={chipHoy ? 'hoy' : venc ? 'vencido' : 'normal'}
                    titulo={f.cliente.nombre}
                    detalle={`${f.items} ${f.items === 1 ? 'ítem' : 'ítems'} · cap. ${dinero(f.capital)} · int. ${dinero(f.interes)}`}
                    monto={dinero(f.capital + f.interes)}
                    tonoMonto={venc ? 'vencido' : 'normal'}
                  />
                )
              })}
            </ul>
            <RenglonTotal etiqueta="Total">{dinero(total)}</RenglonTotal>
          </Hoja>

          <Tarjeta titulo="Listado de pagos por fecha de pago" className="hidden sm:block">
            {/* Una sola tabla: cada fecha de pago es un grupo con su fila de título; el encabezado no se repite. */}
            <div className="overflow-x-auto">
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
                {porFecha.map(([fecha, lista]) => (
                  <tbody key={fecha}>
                    <tr>
                      <th colSpan={5} scope="rowgroup" className="bg-papel pt-4 text-sm tracking-normal text-tinta normal-case">
                        <span className="flex items-center gap-2">
                          Pago del {formatearFecha(fecha)}
                          {fecha < hoy ? <Etiqueta color="rojo">vencido</Etiqueta> : fecha === hoy ? <Etiqueta color="ambar">hoy</Etiqueta> : null}
                        </span>
                      </th>
                    </tr>
                    {lista.map((f) => {
                      return (
                        <tr key={f.cliente.id}>
                          <td>
                            <Link to={`/tienda/cobranza?cliente=${f.cliente.id}&fecha=${fecha}`} className="font-bold underline-offset-4 hover:underline">
                              {f.cliente.nombre}
                            </Link>
                            <span className="ml-2 text-xs text-tinta-suave">DNI {f.cliente.documento}</span>
                          </td>
                          <td className="text-right">{f.items}</td>
                          <td className="text-right">{dinero(f.capital)}</td>
                          <td className="text-right">{dinero(f.interes)}</td>
                          <td className={`text-right font-bold ${fecha < hoy ? 'text-vencido' : ''}`}>{dinero(f.capital + f.interes)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                ))}
                <tfoot>
                  <tr className="font-bold">
                    <td colSpan={4} className="text-right">
                      Total
                    </td>
                    <td className="text-right text-base">
                      <span className="border-b-[3px] border-double border-tinta">{dinero(total)}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Tarjeta>
        </>
      )}
    </div>
  )
}
