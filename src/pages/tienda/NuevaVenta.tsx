import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Cronograma } from '../../components/Cronograma'
import { Alerta, Boton, Campo, Dato, Etiqueta, Tarjeta } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { aTasa, describirTasa, moneda as aMoneda } from '../../lib/codigos'
import { fechaHoraLima, formatearFecha } from '../../lib/fechas'
import { dinero, tasaPct } from '../../lib/formato'
import { r2, simularCuotas, simularFinDeMes, type CondicionesCredito } from '../../lib/motorFinanciero'
import { mensajeError, supabase } from '../../lib/supabase'
import type { Cliente, Producto } from '../../types'

function ahoraLocal(): string {
  const { fecha, hora } = fechaHoraLima()
  return `${fecha}T${hora.slice(0, 5)}`
}

export default function NuevaVenta() {
  const { tienda } = useAuth()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [clienteId, setClienteId] = useState('')
  const [productoId, setProductoId] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [enCuotasElegido, setEnCuotas] = useState(false)
  const [numCuotas, setNumCuotas] = useState('3')
  const [fechaHora, setFechaHora] = useState(ahoraLocal())
  const [deuda, setDeuda] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [registrada, setRegistrada] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    supabase.from('clientes').select('*').eq('estado', true).order('nombre').then(({ data }) => setClientes((data as Cliente[]) ?? []))
    supabase.from('productos').select('*').eq('estado', true).order('nombre').then(({ data }) => setProductos((data as Producto[]) ?? []))
  }, [])

  const cliente = clientes.find((c) => c.id === clienteId)
  const producto = productos.find((p) => p.id === productoId)
  const m = aMoneda(cliente?.moneda ?? false)

  useEffect(() => {
    setDeuda(null)
    if (!clienteId) return
    supabase.rpc('fn_deuda_vigente', { p_cliente_id: clienteId }).then(({ data }) => setDeuda(Number(data ?? 0)))
  }, [clienteId, registrada])

  // La modalidad se ajusta a lo que permite el producto (0 fin de mes, 1 cuotas, 2 ambas).
  const enCuotas = producto?.modalidad_venta === 0 ? false : producto?.modalidad_venta === 1 ? true : enCuotasElegido

  // Simulación inmediata con el motor en TypeScript (la BD recalcula al guardar).
  const simulacion = useMemo(() => {
    if (!cliente || !producto || !tienda || !fechaHora) return null
    const cant = Number(cantidad)
    if (!(cant >= 1)) return null
    const cond: CondicionesCredito = {
      tasa: aTasa(cliente.tipo_tasa, cliente.tasa_compensatoria, cliente.periodo_tasa, cliente.capitalizacion),
      tasaMora: aTasa(cliente.tipo_tasa_moratoria, cliente.tasa_moratoria, cliente.periodo_tasa_moratoria, cliente.capitalizacion_moratoria),
      diaCorte: cliente.dia_corte,
      diaPago: cliente.dia_pago,
      horaCorte: tienda.hora_corte,
    }
    const [fecha, hora] = fechaHora.split('T')
    const capital = r2(Number(producto.precio_lista) * cant)
    try {
      return enCuotas
        ? simularCuotas(capital, Number(numCuotas), fecha, `${hora}:00`, cond)
        : simularFinDeMes(capital, fecha, `${hora}:00`, cond)
    } catch {
      return null
    }
  }, [cliente, producto, tienda, cantidad, enCuotas, numCuotas, fechaHora])

  const disponible = cliente && deuda != null ? r2(Number(cliente.limite_credito) - deuda) : null
  const excede = simulacion && disponible != null && simulacion.capital > disponible
  const cuotasInvalidas = enCuotas && cliente && (Number(numCuotas) < 1 || Number(numCuotas) > cliente.plazo_max_meses)

  async function registrar(e: FormEvent) {
    e.preventDefault()
    if (!cliente || !producto) return
    setError(null)
    setGuardando(true)
    const { data, error } = await supabase.rpc('registrar_venta', {
      p_cliente_id: cliente.id,
      p_producto_id: producto.id,
      p_cantidad: Number(cantidad),
      p_num_cuotas: enCuotas ? Number(numCuotas) : undefined,
      // datetime-local está en hora de Lima (Perú no tiene horario de verano: UTC−5).
      p_fecha_hora: `${fechaHora}:00-05:00`,
    })
    setGuardando(false)
    if (error) return setError(mensajeError(error))
    setRegistrada(data as string)
    setProductoId('')
    setCantidad('1')
    setFechaHora(ahoraLocal())
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Nueva venta a crédito</h1>
      {registrada && (
        <Alerta tipo="exito">
          Venta registrada.{' '}
          <Link className="font-medium underline" to={`/tienda/cobranza?cliente=${clienteId}`}>
            Ver estado de cuenta del cliente
          </Link>
        </Alerta>
      )}
      {error && <Alerta>{error}</Alerta>}
      <div className="grid gap-4 lg:grid-cols-5">
        <Tarjeta titulo="Datos de la venta" className="lg:col-span-2">
          <form onSubmit={registrar} className="space-y-4">
            <Campo etiqueta="Cliente" ayuda="Solo aparecen clientes activos. Sus condiciones de crédito (tasa, corte y pago) se copian a la venta.">
              <select value={clienteId} onChange={(e) => { setClienteId(e.target.value); setRegistrada(null) }} required>
                <option value="">Selecciona…</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} — DNI {c.documento}
                  </option>
                ))}
              </select>
            </Campo>
            {cliente && (
              <dl className="grid grid-cols-2 gap-3 rounded-xl bg-stone-50 p-3 text-sm">
                <Dato etiqueta="Tasa" valor={describirTasa(cliente.tipo_tasa, cliente.tasa_compensatoria, cliente.periodo_tasa, cliente.capitalizacion)} />
                <Dato etiqueta="Corte / pago" valor={`día ${cliente.dia_corte} / día ${cliente.dia_pago}`} />
                <Dato etiqueta="Límite" valor={dinero(cliente.limite_credito, m)} />
                <Dato etiqueta="Disponible" valor={disponible == null ? '…' : dinero(disponible, m)} destacado />
              </dl>
            )}
            <Campo etiqueta="Producto o servicio" ayuda="Se cobra al precio de lista (crédito).">
              <select value={productoId} onChange={(e) => setProductoId(e.target.value)} required>
                <option value="">Selecciona…</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} — {dinero(p.precio_lista)}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Cantidad" ayuda="Número de unidades.">
                <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} required />
              </Campo>
              <Campo etiqueta="Fecha y hora de compra" ayuda="Hora de Lima. Puedes registrar compras pasadas (al pasar el cuaderno), nunca futuras.">
                <input type="datetime-local" value={fechaHora} max={ahoraLocal()} onChange={(e) => setFechaHora(e.target.value)} required />
              </Campo>
            </div>
            <Campo etiqueta="Forma de pago" ayuda="Fin de mes: una sola armada en la fecha de pago. En cuotas: método francés, la primera cuota vence el mes siguiente a la fecha de pago del ciclo.">
              <select value={enCuotas ? 'C' : 'F'} onChange={(e) => setEnCuotas(e.target.value === 'C')} disabled={producto ? producto.modalidad_venta !== 2 : false}>
                <option value="F">Pago único a fin de mes</option>
                <option value="C">En cuotas mensuales</option>
              </select>
            </Campo>
            {enCuotas && (
              <Campo etiqueta="Número de cuotas" ayuda={`Entre 1 y el máximo pactado con el cliente${cliente ? ` (${cliente.plazo_max_meses})` : ''}.`}>
                <input type="number" min={1} max={cliente?.plazo_max_meses ?? 36} value={numCuotas} onChange={(e) => setNumCuotas(e.target.value)} required />
              </Campo>
            )}
            {excede && <Alerta>La compra excede el crédito disponible del cliente.</Alerta>}
            <Boton type="submit" cargando={guardando} disabled={!simulacion || !!excede || !!cuotasInvalidas} className="w-full">
              Registrar venta
            </Boton>
          </form>
        </Tarjeta>

        <Tarjeta titulo="Simulación" className="lg:col-span-3">
          {!simulacion ? (
            <p className="text-sm text-stone-500">Elige cliente y producto para ver el cálculo.</p>
          ) : (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <Dato etiqueta="Capital" valor={dinero(simulacion.capital, m)} />
                <Dato etiqueta="Fecha de corte" valor={formatearFecha(simulacion.fechaCorte)} />
                <Dato etiqueta="Fecha de pago" valor={formatearFecha(simulacion.fechaPago)} />
                <Dato
                  etiqueta="Ciclo"
                  valor={simulacion.trasladada ? <Etiqueta color="ambar">Pasa al mes siguiente</Etiqueta> : <Etiqueta color="verde">Este mes</Etiqueta>}
                />
              </dl>
              {simulacion.modalidad === 'FIN_DE_MES' ? (
                <dl className="grid grid-cols-2 gap-4 rounded-xl bg-marca-50 p-4 text-sm sm:grid-cols-4">
                  <Dato etiqueta="Días de interés" valor={simulacion.dias} />
                  <Dato etiqueta={`TEP (${simulacion.dias} días)`} valor={tasaPct(simulacion.tep)} />
                  <Dato etiqueta="Interés" valor={dinero(simulacion.interes, m)} />
                  <Dato etiqueta="Total a pagar" valor={dinero(simulacion.total, m)} destacado />
                </dl>
              ) : (
                <>
                  <dl className="grid grid-cols-2 gap-4 rounded-xl bg-marca-50 p-4 text-sm sm:grid-cols-3">
                    <Dato etiqueta="Gracia total" valor={`${simulacion.diasGracia} días`} />
                    <Dato etiqueta="TEP de gracia" valor={tasaPct(simulacion.tepGracia)} />
                    <Dato etiqueta="Capital capitalizado" valor={dinero(simulacion.capitalCapitalizado, m)} />
                    <Dato etiqueta="TEM (30 días)" valor={tasaPct(simulacion.tem)} />
                    <Dato etiqueta="Cuota mensual" valor={dinero(simulacion.valorCuota, m)} destacado />
                    <Dato etiqueta="Total a pagar" valor={dinero(simulacion.totalPagar, m)} />
                  </dl>
                  <Cronograma filas={simulacion.cronograma} moneda={m} />
                </>
              )}
              <p className="text-xs text-stone-500">
                Simulación en el navegador. Al registrar, la base de datos recalcula con las mismas fórmulas y guarda el resultado oficial.
              </p>
            </div>
          )}
        </Tarjeta>
      </div>
    </div>
  )
}
