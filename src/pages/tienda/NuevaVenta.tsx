import { History, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode, type SubmitEvent } from 'react'
import { Link } from 'react-router-dom'
import { Buscador, useRecientes } from '../../components/Buscador'
import { BarraAccion, Chips, Condiciones, Paso, Segmentado, SelectorCliente, SelectorNumero, Stepper } from '../../components/cuaderno'
import { Cronograma } from '../../components/Cronograma'
import { Alerta, Boton, Campo, Etiqueta } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { aTasa } from '../../lib/codigos'
import { fechaHoraLima, formatearFecha } from '../../lib/fechas'
import { dinero, tasaPct } from '../../lib/formato'
import { pagoMesSiguiente, r2, simularCuotas, simularFinDeMes, type CondicionesCredito } from '../../lib/motorFinanciero'
import { mensajeError, supabase } from '../../lib/supabase'
import type { Cliente, Producto } from '../../types'

function ahoraLocal(): string {
  const { fecha, hora } = fechaHoraLima()
  return `${fecha}T${hora.slice(0, 5)}`
}

/** Fila etiqueta / valor del ticket de simulación. */
function FilaTicket({ etiqueta, children }: { etiqueta: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-tinta-suave">{etiqueta}</dt>
      <dd className="text-right font-bold tabular-nums">{children}</dd>
    </div>
  )
}

const PRODUCTOS_SUGERIDOS = 6

export default function NuevaVenta() {
  const { tienda } = useAuth()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [clienteId, setClienteId] = useState('')
  // La boleta: una línea por producto (la cantidad es texto, como en el Stepper).
  const [items, setItems] = useState<{ productoId: string; cantidad: string }[]>([])
  const [enCuotas, setEnCuotas] = useState(false)
  const [numCuotas, setNumCuotas] = useState('3')
  // Parte de la boleta que el cliente paga en efectivo al momento (el resto va a crédito).
  const [pagoInicial, setPagoInicial] = useState('')
  const [fechaHora, setFechaHora] = useState(ahoraLocal())
  const [deudaDe, setDeudaDe] = useState<{ clave: string; valor: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [registrada, setRegistrada] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  // Solo interfaz: despliegue del cronograma y productos recientes de este dispositivo.
  const [verCronograma, setVerCronograma] = useState(false)
  const { ids: idsProductos, registrar: registrarProducto } = useRecientes(`cv-recientes-productos-${tienda?.id ?? ''}`)

  useEffect(() => {
    supabase.from('clientes').select('*').eq('estado', true).order('nombre').then(({ data }) => setClientes((data as Cliente[]) ?? []))
    supabase.from('productos').select('*').eq('estado', true).order('nombre').then(({ data }) => setProductos((data as Producto[]) ?? []))
  }, [])

  const cliente = clientes.find((c) => c.id === clienteId)
  const lineas = items.flatMap((i) => {
    const producto = productos.find((p) => p.id === i.productoId)
    return producto ? [{ ...i, producto, subtotal: r2(Number(producto.precio_lista) * Number(i.cantidad)) }] : []
  })
  const cantidadesValidas = lineas.every((l) => Number.isInteger(Number(l.cantidad)) && Number(l.cantidad) >= 1)
  const totalBoleta = r2(lineas.reduce((t, l) => t + l.subtotal, 0))
  const inicial = r2(Number(pagoInicial) || 0)

  // La deuda se guarda con la consulta a la que pertenece (cliente + última venta): sin vaciarla en el efecto.
  const claveDeuda = `${clienteId}|${registrada ?? ''}`
  const deuda = deudaDe?.clave === claveDeuda ? deudaDe.valor : null
  useEffect(() => {
    if (!clienteId) return
    supabase.rpc('fn_deuda_vigente', { p_cliente_id: clienteId }).then(({ data }) => setDeudaDe({ clave: claveDeuda, valor: Number(data ?? 0) }))
  }, [clienteId, claveDeuda])

  // Simulación inmediata con el motor en TypeScript (la BD recalcula al guardar).
  const resultadoSimulacion = useMemo(() => {
    if (!cliente || lineas.length === 0 || !cantidadesValidas || !tienda || !fechaHora) return null
    const cond: CondicionesCredito = {
      tasa: aTasa(cliente.tipo_tasa, cliente.tasa_compensatoria, cliente.periodo_tasa, cliente.capitalizacion),
      tasaMora: aTasa(cliente.tipo_tasa_moratoria, cliente.tasa_moratoria, cliente.periodo_tasa_moratoria, cliente.capitalizacion_moratoria),
      diaCorte: cliente.dia_corte,
      diaPago: cliente.dia_pago,
      horaCorte: tienda.hora_corte,
    }
    const [fecha, hora] = fechaHora.split('T')
    // Capital a crédito = total de la boleta (líneas a precio de lista) − cuota inicial.
    if (inicial < 0 || inicial >= totalBoleta) return { error: 'La cuota inicial debe ser menor que el total de la boleta.' }
    const capital = r2(totalBoleta - inicial)
    try {
      return enCuotas
        ? simularCuotas(capital, Number(numCuotas), fecha, `${hora}:00`, cond)
        : simularFinDeMes(capital, fecha, `${hora}:00`, cond)
    } catch (e) {
      // Motivo visible (p. ej. una cuota demasiado pequeña para repartirse en partes iguales).
      return { error: e instanceof Error ? e.message : 'No se pudo calcular la simulación.' }
    }
  }, [cliente, lineas.length, cantidadesValidas, totalBoleta, inicial, tienda, enCuotas, numCuotas, fechaHora])
  const simulacion = resultadoSimulacion && !('error' in resultadoSimulacion) ? resultadoSimulacion : null
  const errorSimulacion = resultadoSimulacion && 'error' in resultadoSimulacion ? resultadoSimulacion.error : null

  const disponible = cliente && deuda != null ? r2(Number(cliente.limite_credito) - deuda) : null
  const excede = simulacion && disponible != null && simulacion.capital > disponible
  const cuotasInvalidas = enCuotas && cliente && (Number(numCuotas) < 1 || Number(numCuotas) > cliente.plazo_max_meses)

  async function registrar(e: SubmitEvent) {
    e.preventDefault()
    if (!cliente || lineas.length === 0) return
    setError(null)
    setGuardando(true)
    const { data, error } = await supabase.rpc('registrar_venta', {
      p_cliente_id: cliente.id,
      p_items: lineas.map((l) => ({ productoId: l.productoId, cantidad: Number(l.cantidad) })),
      p_num_cuotas: enCuotas ? Number(numCuotas) : undefined,
      // datetime-local está en hora de Lima (Perú no tiene horario de verano: UTC−5).
      p_fecha_hora: `${fechaHora}:00-05:00`,
      p_pago_inicial: inicial > 0 ? inicial : undefined,
    })
    setGuardando(false)
    if (error) return setError(mensajeError(error))
    setRegistrada(data as string)
    setItems([])
    setPagoInicial('')
    setFechaHora(ahoraLocal())
  }

  // Debajo del buscador: los productos recientes (o los primeros, si aún no hay historial).
  const productosRecientes = idsProductos.map((id) => productos.find((p) => p.id === id)).filter((p): p is Producto => !!p)
  const filaProductos = productosRecientes.length > 0 ? productosRecientes : productos.slice(0, PRODUCTOS_SUGERIDOS)
  // Elegir un producto lo agrega a la boleta (o suma una unidad si ya está).
  function agregarProducto(id: string) {
    registrarProducto(id)
    setRegistrada(null)
    setItems((xs) =>
      xs.some((x) => x.productoId === id)
        ? xs.map((x) => (x.productoId === id ? { ...x, cantidad: String(Number(x.cantidad) + 1) } : x))
        : [...xs, { productoId: id, cantidad: '1' }],
    )
  }
  const cambiarCantidad = (id: string, cantidad: string) => setItems((xs) => xs.map((x) => (x.productoId === id ? { ...x, cantidad } : x)))
  const quitarProducto = (id: string) => setItems((xs) => xs.filter((x) => x.productoId !== id))

  const totalSimulado = simulacion ? (simulacion.modalidad === 'FIN_DE_MES' ? simulacion.total : simulacion.totalPagar) : null

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-extrabold sm:text-3xl">
        <span className="sm:hidden">Apuntar venta</span>
        <span className="hidden sm:inline">Nueva venta a crédito</span>
      </h1>
      {registrada && (
        <Alerta tipo="exito">
          Venta registrada.{' '}
          <Link className="font-bold underline" to={`/tienda/cobranza?cliente=${clienteId}`}>
            Ver estado de cuenta del cliente
          </Link>
        </Alerta>
      )}
      {error && <Alerta>{error}</Alerta>}

      <form onSubmit={registrar}>
        {/* Escritorio: formulario a la izquierda y el ticket fijo a la derecha, con el total y el botón juntos. */}
        <div className="grid grid-cols-1 gap-6 escritorio:grid-cols-[minmax(0,1fr)_25rem] escritorio:gap-10 xl:grid-cols-[minmax(0,1fr)_28rem]">
          <div className="min-w-0 space-y-6">
            <section className="space-y-3">
              <Paso n={1}>Quién</Paso>
              <SelectorCliente
                clientes={clientes}
                valor={clienteId}
                onChange={(id) => {
                  setClienteId(id)
                  setRegistrada(null)
                }}
                ayuda="Solo aparecen clientes activos. Sus condiciones de crédito (tasa, corte y pago) se copian a la venta."
                recientes={`cv-recientes-clientes-${tienda?.id ?? ''}`}
              />
              {cliente && <Condiciones cliente={cliente} disponible={disponible} />}
            </section>

            <section className="space-y-3">
              <Paso n={2}>Qué</Paso>
              <Campo etiqueta="Agregar producto o servicio" ayuda="Cada producto elegido se suma a la boleta al precio de lista (crédito). Escribe para buscar por nombre o marca.">
                <Buscador
                  placeholder="Buscar producto o marca…"
                  vacio="Ningún producto coincide."
                  valor=""
                  onChange={agregarProducto}
                  opciones={productos.map((p) => ({
                    id: p.id,
                    titulo: p.nombre,
                    detalle: `${dinero(p.precio_lista)} a crédito${p.marca ? ` · ${p.marca}` : ''}`,
                    busqueda: `${p.nombre} ${p.marca ?? ''}`,
                  }))}
                />
              </Campo>
              {filaProductos.length > 0 && (
                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-tinta-suave">
                    <History aria-hidden="true" className="size-3.5" />
                    {productosRecientes.length > 0 ? 'Recientes' : 'Sugeridos'}
                  </p>
                  <Chips
                    etiqueta={productosRecientes.length > 0 ? 'Productos recientes' : 'Productos sugeridos'}
                    opciones={filaProductos.map((p) => ({
                      valor: p.id,
                      texto: (
                        <>
                          {p.nombre} · <span className="tabular-nums">{dinero(p.precio_lista)}</span>
                        </>
                      ),
                    }))}
                    valor=""
                    onChange={agregarProducto}
                  />
                </div>
              )}
              <div>
                <p className="mb-1 text-sm font-bold">Boleta</p>
                {lineas.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-linea p-3 text-sm text-tinta-suave">Aún no hay productos. Elige uno arriba para agregarlo.</p>
                ) : (
                  <ul className="border-t border-dashed border-linea">
                    {lineas.map((l) => (
                      <li key={l.productoId} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-dashed border-linea py-2">
                        <div className="min-w-0 flex-1 basis-40">
                          <p className="font-bold">{l.producto.nombre}</p>
                          <p className="text-xs text-tinta-suave tabular-nums">{dinero(l.producto.precio_lista)} c/u</p>
                        </div>
                        <Stepper etiqueta={`Cantidad de ${l.producto.nombre}`} valor={l.cantidad} onChange={(v) => cambiarCantidad(l.productoId, v)} />
                        <span className="ml-auto w-24 text-right font-bold tabular-nums">{dinero(l.subtotal)}</span>
                        <button
                          type="button"
                          aria-label={`Quitar ${l.producto.nombre} de la boleta`}
                          onClick={() => quitarProducto(l.productoId)}
                          className="flex size-11 items-center justify-center rounded-lg text-tinta-suave hover:bg-papel-borde/60"
                        >
                          <Trash2 aria-hidden="true" className="size-5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Campo etiqueta="Fecha y hora de compra" ayuda="Hora de Lima. Puedes registrar compras pasadas (al pasar el cuaderno), nunca futuras.">
                <input type="datetime-local" value={fechaHora} max={ahoraLocal()} onChange={(e) => setFechaHora(e.target.value)} required />
              </Campo>
            </section>

            <section className="space-y-3">
              <Paso n={3}>Cómo paga</Paso>
              <Campo
                etiqueta="Cuota inicial (S/)"
                opcional
                ayuda={`Lo que el cliente paga hoy. El resto${totalBoleta > 0 ? ` (${dinero(r2(totalBoleta - inicial))})` : ''} queda a crédito, a fin de mes o en cuotas. Debe ser menor que el total de la boleta.`}
              >
                <input type="number" inputMode="decimal" step="0.01" min="0" max={totalBoleta > 0 ? r2(totalBoleta - 0.01) : undefined} value={pagoInicial} onChange={(e) => setPagoInicial(e.target.value)} placeholder="0.00" />
              </Campo>
              <Campo
                etiqueta="Forma de pago del saldo"
                ayuda="Se elige para todo el saldo a crédito. Fin de mes: una sola armada en la fecha de pago. En cuotas: método francés, la primera cuota vence el mes siguiente a la fecha de pago del ciclo."
              >
                <Segmentado
                  etiqueta="Forma de pago"
                  valor={enCuotas ? 'C' : 'F'}
                  onChange={(v) => setEnCuotas(v === 'C')}
                  opciones={[
                    {
                      valor: 'F',
                      titulo: 'Fin de mes',
                      detalle: simulacion ? `Un pago el ${formatearFecha(simulacion.fechaPago)}` : cliente ? `Un pago el día ${cliente.dia_pago}${pagoMesSiguiente(cliente.dia_corte, cliente.dia_pago) ? ' del mes siguiente' : ''}` : 'Un solo pago',
                    },
                    {
                      valor: 'C',
                      titulo: 'En cuotas',
                      detalle: `Hasta ${cliente?.plazo_max_meses ?? '—'} meses`,
                    },
                  ]}
                />
              </Campo>
              {enCuotas && cliente && (
                <Campo etiqueta="Número de cuotas" ayuda={`Entre 1 y el máximo pactado con el cliente (${cliente.plazo_max_meses}).`}>
                  <SelectorNumero etiqueta="Número de cuotas" max={cliente.plazo_max_meses} valor={Number(numCuotas)} onChange={(n) => setNumCuotas(String(n))} />
                </Campo>
              )}
            </section>
          </div>

          {/* Simulación como ticket de caja. */}
          <section
            aria-labelledby="titulo-simulacion"
            className="min-w-0 self-start rounded-sm border-y-[3px] border-dotted border-linea bg-white p-4 shadow escritorio:sticky escritorio:top-22 escritorio:max-h-[calc(100dvh-7rem)] escritorio:overflow-y-auto escritorio:p-5"
          >
            <h2 id="titulo-simulacion" className="font-sans text-xs font-bold tracking-[0.12em] text-tinta-suave uppercase">
              Simulación{cliente && ` · ${cliente.nombre}`}
            </h2>
            {!simulacion ? (
              errorSimulacion ? (
                <p className="mt-2 text-sm font-bold text-vencido">{errorSimulacion}</p>
              ) : (
                <p className="mt-2 text-sm text-tinta-suave">Elige cliente y agrega productos para ver el cálculo.</p>
              )
            ) : (
              <div className="mt-2 space-y-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="font-display text-4xl font-extrabold tracking-tight tabular-nums">
                    {simulacion.modalidad === 'FIN_DE_MES' ? dinero(simulacion.total) : `${simulacion.cronograma.length} × ${dinero(simulacion.valorCuota)}`}
                  </p>
                  <Etiqueta color={simulacion.trasladada ? 'ambar' : 'verde'}>{simulacion.trasladada ? 'pasa al mes siguiente' : 'entra en este ciclo'}</Etiqueta>
                </div>
                <dl className="divide-y divide-dashed divide-linea border-y border-dashed border-linea text-sm">
                  {lineas.map((l) => (
                    <FilaTicket key={l.productoId} etiqueta={`${l.producto.nombre} × ${l.cantidad}`}>
                      {dinero(l.subtotal)}
                    </FilaTicket>
                  ))}
                  {inicial > 0 ? (
                    <>
                      <FilaTicket etiqueta="Total boleta">{dinero(totalBoleta)}</FilaTicket>
                      <FilaTicket etiqueta="Cuota inicial">− {dinero(inicial)}</FilaTicket>
                      <FilaTicket etiqueta="Capital a crédito">{dinero(simulacion.capital)}</FilaTicket>
                    </>
                  ) : (
                    <FilaTicket etiqueta="Capital (total boleta)">{dinero(simulacion.capital)}</FilaTicket>
                  )}
                  {simulacion.modalidad === 'FIN_DE_MES' ? (
                    <>
                      <FilaTicket etiqueta="Días de interés">{simulacion.dias}</FilaTicket>
                      <FilaTicket etiqueta={`TEP (${simulacion.dias} días)`}>{tasaPct(simulacion.tep)}</FilaTicket>
                      <FilaTicket etiqueta="Interés">{dinero(simulacion.interes)}</FilaTicket>
                    </>
                  ) : (
                    <>
                      <FilaTicket etiqueta="Gracia total">{simulacion.diasGracia} días</FilaTicket>
                      <FilaTicket etiqueta="TEP de gracia">{tasaPct(simulacion.tepGracia)}</FilaTicket>
                      <FilaTicket etiqueta="Capital capitalizado">{dinero(simulacion.capitalCapitalizado)}</FilaTicket>
                      <FilaTicket etiqueta="TEM (30 días)">{tasaPct(simulacion.tem)}</FilaTicket>
                      <FilaTicket etiqueta="Cuota mensual">{dinero(simulacion.valorCuota)}</FilaTicket>
                    </>
                  )}
                  <FilaTicket etiqueta="Corte / pago">
                    {formatearFecha(simulacion.fechaCorte)} / {formatearFecha(simulacion.fechaPago)}
                  </FilaTicket>
                </dl>

                {simulacion.modalidad === 'CUOTAS' &&
                  (verCronograma ? (
                    <Cronograma filas={simulacion.cronograma} />
                  ) : (
                    <div>
                      <ol className="text-sm tabular-nums">
                        {simulacion.cronograma.map((f) => (
                          <li key={f.numero} className="grid grid-cols-[1.75rem_1fr_auto_auto] items-baseline gap-2 border-b border-dashed border-linea py-1.5">
                            <span className="text-tinta-suave">{f.numero}</span>
                            <span>{formatearFecha(f.fechaVencimiento)}</span>
                            <span className="text-xs text-tinta-suave">int. {dinero(f.interes)}</span>
                            <span className="font-bold">{dinero(f.cuota)}</span>
                          </li>
                        ))}
                      </ol>
                      <button type="button" onClick={() => setVerCronograma(true)} className="mt-1 min-h-11 text-sm font-bold underline underline-offset-4">
                        Ver cronograma completo
                      </button>
                    </div>
                  ))}

                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="font-bold">{inicial > 0 ? 'Total a pagar a crédito' : 'Total a pagar'}</span>
                  <span className="border-b-[3px] border-double border-tinta font-display text-xl font-extrabold tabular-nums">{dinero(totalSimulado)}</span>
                </div>
                <p className="text-xs text-tinta-suave">
                  Simulación en el navegador. Al registrar, la base de datos recalcula con las mismas fórmulas y guarda el resultado oficial.
                </p>
              </div>
            )}
            {/* Escritorio: la acción va junto al total que confirma (en celular está en la barra inferior). */}
            <div className="mt-4 hidden space-y-3 border-t border-papel-borde pt-4 escritorio:block">
              {excede && <Alerta>La compra excede el crédito disponible del cliente.</Alerta>}
              <Boton type="submit" cargando={guardando} disabled={!simulacion || !!excede || !!cuotasInvalidas} className="w-full">
                Registrar venta{totalSimulado != null && ` · ${dinero(totalSimulado)}`}
              </Boton>
            </div>
          </section>
        </div>

        {/* La barra fija debe ser hija directa del form (alto) para que el sticky funcione. */}
        <div className="pt-6 pb-3 escritorio:hidden">{excede && <Alerta>La compra excede el crédito disponible del cliente.</Alerta>}</div>
        <BarraAccion className="escritorio:hidden">
          <Boton type="submit" cargando={guardando} disabled={!simulacion || !!excede || !!cuotasInvalidas} className="w-full">
            Registrar venta{totalSimulado != null && ` · ${dinero(totalSimulado)}`}
          </Boton>
        </BarraAccion>
      </form>
    </div>
  )
}
