import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Chips, Hoja, MargenFecha, MontoGrande, Renglon, RenglonTitulo, RenglonTotal, SelloVencido } from '../../components/cuaderno'
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

type Estado = 'vencido' | 'hoy' | 'al día'
const ORDEN_ESTADO: Record<Estado, number> = { vencido: 0, hoy: 1, 'al día': 2 }
const COLOR_ESTADO = { vencido: 'rojo', hoy: 'ambar', 'al día': 'gris' } as const
const sinTildes = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export default function Inicio() {
  const [filas, setFilas] = useState<Fila[]>([])
  const [numClientes, setNumClientes] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState<'cliente' | 'fecha'>('cliente')
  const [busqueda, setBusqueda] = useState('')
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

  const sumar = (lista: Fila[]) => r2(lista.reduce((s, f) => s + f.capital + f.interes, 0))

  // Listado: buscador (nombre o DNI, sin importar tildes) y vista por cliente o por fecha.
  const t = sinTildes(busqueda.trim())
  const visibles = t ? filas.filter((f) => sinTildes(`${f.cliente.nombre} ${f.cliente.documento}`).includes(t)) : filas
  const porFecha = [...Map.groupBy(visibles, (f) => f.fechaPago)]
  const estadoDe = (fecha: string): Estado => (fecha < hoy ? 'vencido' : fecha === hoy ? 'hoy' : 'al día')
  // Por cliente: primero los vencidos, luego los de hoy y después por fecha más próxima.
  const porCliente = [...Map.groupBy(visibles, (f) => f.cliente.id).values()]
    .map((lista) => ({ cliente: lista[0].cliente, lista, total: sumar(lista), estado: estadoDe(lista[0].fechaPago) }))
    .sort((a, b) => ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] || a.lista[0].fechaPago.localeCompare(b.lista[0].fechaPago) || a.cliente.nombre.localeCompare(b.cliente.nombre))
  const totalVisible = sumar(visibles)
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
        <section aria-labelledby="titulo-listado" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="titulo-listado" className="font-display text-xl font-bold">
              Listado de pagos
            </h2>
            <Chips
              etiqueta="Agrupar el listado"
              opciones={[
                { valor: 'cliente', texto: 'Por cliente' },
                { valor: 'fecha', texto: 'Por fecha' },
              ]}
              valor={vista}
              onChange={setVista}
            />
          </div>
          <input
            type="search"
            aria-label="Buscar vecino por nombre o DNI"
            placeholder="Buscar por nombre o DNI…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full"
          />

          {visibles.length === 0 ? (
            <Vacio>Ningún vecino coincide con "{busqueda}".</Vacio>
          ) : vista === 'cliente' ? (
            <>
              {/* Una tarjeta por cliente: resumen arriba y sus fechas de pago al desplegar (abiertas si hay algo vencido o de hoy). */}
              <ul className="space-y-3">
                {porCliente.map(({ cliente, lista, total: totalCliente, estado }) => {
                  const proxima = lista[0].fechaPago
                  return (
                    <li key={cliente.id} className={`overflow-hidden rounded-2xl border bg-white ${estado === 'vencido' ? 'border-vencido/40' : 'border-papel-borde'}`}>
                      <details open={estado !== 'al día'} className="group">
                        <summary className="flex cursor-pointer list-none items-center gap-3 p-4 hover:bg-papel/60 [&::-webkit-details-marker]:hidden">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold">{cliente.nombre}</p>
                            <p className="text-sm text-tinta-suave">
                              DNI {cliente.documento} · {lista.length} {lista.length === 1 ? 'pago' : 'pagos'} ·{' '}
                              {estado === 'vencido' ? `vencido desde ${formatearFecha(proxima)}` : `${estado === 'hoy' ? 'vence hoy' : `próximo ${formatearFecha(proxima)}`}`}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className={`font-display text-xl font-extrabold tabular-nums ${estado === 'vencido' ? 'text-vencido' : ''}`}>{dinero(totalCliente)}</p>
                            <Etiqueta color={COLOR_ESTADO[estado]}>{estado}</Etiqueta>
                          </div>
                          <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-tinta-suave transition-transform group-open:rotate-180" />
                        </summary>

                        <div className="border-t border-papel-borde">
                          {/* Celular: un renglón por fecha (fecha y total; capital e interés debajo). */}
                          <ul className="sm:hidden">
                            {lista.map((f) => (
                              <li
                                key={f.fechaPago}
                                className={`flex items-baseline justify-between gap-3 border-b border-dashed border-linea px-4 py-2.5 last:border-b-0 ${f.fechaPago <= hoy ? 'bg-resaltador-suave' : ''}`}
                              >
                                <div>
                                  <p className="font-bold">{formatearFecha(f.fechaPago)}</p>
                                  <p className="text-xs text-tinta-suave tabular-nums">
                                    {f.items} {f.items === 1 ? 'ítem' : 'ítems'} · cap. {dinero(f.capital)} · int. {dinero(f.interes)}
                                  </p>
                                </div>
                                <span className={`font-bold tabular-nums ${f.fechaPago < hoy ? 'text-vencido' : ''}`}>{dinero(f.capital + f.interes)}</span>
                              </li>
                            ))}
                          </ul>
                          {/* Tablet y escritorio: tabla de sus fechas de pago. */}
                          <div className="hidden overflow-x-auto sm:block">
                            <table>
                              <thead>
                                <tr>
                                  <th>Fecha de pago</th>
                                  <th className="text-right">Ítems</th>
                                  <th className="text-right">Capital</th>
                                  <th className="text-right">Interés</th>
                                  <th className="text-right">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lista.map((f) => (
                                  <tr key={f.fechaPago} className={f.fechaPago <= hoy ? 'bg-resaltador-suave' : ''}>
                                    <td className="font-bold">{formatearFecha(f.fechaPago)}</td>
                                    <td className="text-right">{f.items}</td>
                                    <td className="text-right">{dinero(f.capital)}</td>
                                    <td className="text-right">{dinero(f.interes)}</td>
                                    <td className={`text-right font-bold ${f.fechaPago < hoy ? 'text-vencido' : ''}`}>{dinero(f.capital + f.interes)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="flex justify-end border-t border-papel-borde px-4 py-1">
                            <Link
                              to={`/tienda/cobranza?cliente=${cliente.id}&fecha=${proxima}`}
                              className={`inline-flex min-h-11 items-center gap-0.5 font-bold underline underline-offset-4 ${estado === 'vencido' ? 'text-vencido' : ''}`}
                            >
                              Cobrar pago del {formatearFecha(proxima).slice(0, 5)}
                              <ChevronRight aria-hidden="true" className="size-4" strokeWidth={2.5} />
                            </Link>
                          </div>
                        </div>
                      </details>
                    </li>
                  )
                })}
              </ul>
              <p className="flex items-baseline justify-between gap-3 px-1 font-bold">
                <span>Total{t ? ' (búsqueda)' : ' por cobrar'}</span>
                <span className="border-b-[3px] border-double border-tinta font-display text-xl font-extrabold tabular-nums">{dinero(totalVisible)}</span>
              </p>
            </>
          ) : (
            <>
              {/* Celular: el cuaderno, un renglón por cliente y fecha de pago. */}
              <Hoja className="sm:hidden">
                <RenglonTitulo titulo="El cuaderno" />
                <ul>
                  {visibles.map((f, i) => {
                    const venc = f.fechaPago < hoy
                    const repetida = i > 0 && visibles[i - 1].fechaPago === f.fechaPago
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
                <RenglonTotal etiqueta="Total">{dinero(totalVisible)}</RenglonTotal>
              </Hoja>

              <Tarjeta titulo="Por fecha de pago" className="hidden sm:block">
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
                          <span className="border-b-[3px] border-double border-tinta">{dinero(totalVisible)}</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Tarjeta>
            </>
          )}
        </section>
      )}
    </div>
  )
}
