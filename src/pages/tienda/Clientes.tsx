import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CamposTasa, type ValorTasa } from '../../components/CamposTasa'
import { Alerta, Boton, Campo, Etiqueta, Modal, Tarjeta, Vacio } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { describirTasa } from '../../lib/codigos'
import { dinero } from '../../lib/formato'
import { adminUsuarios, mensajeError, supabase } from '../../lib/supabase'
import type { Cliente, Perfil } from '../../types'

interface Form {
  id?: string
  nombre: string
  documento: string
  telefono: string
  correo: string
  direccion: string
  usd: boolean
  tasa: ValorTasa
  mora: ValorTasa
  limite_credito: string
  plazo_max_meses: string
  dia_corte: string
  dia_pago: string
}

const vacio: Form = {
  nombre: '',
  documento: '',
  telefono: '',
  correo: '',
  direccion: '',
  usd: false,
  tasa: { nominal: false, valor: '', periodo: 7, capitalizacion: null },
  mora: { nominal: false, valor: '', periodo: 7, capitalizacion: null },
  limite_credito: '500',
  plazo_max_meses: '3',
  dia_corte: '20',
  dia_pago: '26',
}

function aForm(c: Cliente): Form {
  return {
    id: c.id,
    nombre: c.nombre,
    documento: c.documento,
    telefono: c.telefono ?? '',
    correo: c.correo ?? '',
    direccion: c.direccion ?? '',
    usd: c.moneda,
    tasa: { nominal: c.tipo_tasa, valor: String(c.tasa_compensatoria), periodo: c.periodo_tasa, capitalizacion: c.capitalizacion },
    mora: { nominal: c.tipo_tasa_moratoria, valor: String(c.tasa_moratoria), periodo: c.periodo_tasa_moratoria, capitalizacion: c.capitalizacion_moratoria },
    limite_credito: String(c.limite_credito),
    plazo_max_meses: String(c.plazo_max_meses),
    dia_corte: String(c.dia_corte),
    dia_pago: String(c.dia_pago),
  }
}

export default function Clientes() {
  const { tienda } = useAuth()
  const [lista, setLista] = useState<Cliente[]>([])
  const [usuarios, setUsuarios] = useState<Perfil[]>([])
  const [form, setForm] = useState<Form | null>(null)
  const [cuenta, setCuenta] = useState<{ cliente: Cliente; perfil?: Perfil; password: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [filtro, setFiltro] = useState('')

  const cargar = useCallback(async () => {
    const [c, u] = await Promise.all([
      supabase.from('clientes').select('*').order('nombre'),
      supabase.from('perfiles').select('*').eq('rol', 'cliente'),
    ])
    if (c.error) setError(mensajeError(c.error))
    setLista((c.data as Cliente[]) ?? [])
    setUsuarios((u.data as Perfil[]) ?? [])
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!form || !tienda) return
    setError(null)
    if (Number(form.dia_pago) <= Number(form.dia_corte)) return setError('El día de pago debe ser posterior al día de corte.')
    setGuardando(true)
    const fila = {
      tienda_id: tienda.id,
      nombre: form.nombre,
      documento: form.documento,
      telefono: form.telefono || null,
      correo: form.correo || null,
      direccion: form.direccion || null,
      moneda: form.usd,
      tipo_tasa: form.tasa.nominal,
      tasa_compensatoria: Number(form.tasa.valor),
      periodo_tasa: form.tasa.periodo,
      capitalizacion: form.tasa.nominal ? form.tasa.capitalizacion : null,
      tipo_tasa_moratoria: form.mora.nominal,
      tasa_moratoria: Number(form.mora.valor),
      periodo_tasa_moratoria: form.mora.periodo,
      capitalizacion_moratoria: form.mora.nominal ? form.mora.capitalizacion : null,
      limite_credito: Number(form.limite_credito),
      plazo_max_meses: Number(form.plazo_max_meses),
      dia_corte: Number(form.dia_corte),
      dia_pago: Number(form.dia_pago),
    }
    const r = form.id ? await supabase.from('clientes').update(fila).eq('id', form.id) : await supabase.from('clientes').insert(fila)
    setGuardando(false)
    if (r.error) return setError(mensajeError(r.error))
    setForm(null)
    setAviso(form.id ? 'Cliente actualizado.' : 'Cliente registrado. Puedes crearle un usuario para que consulte su cuenta.')
    cargar()
  }

  async function cambiarEstado(c: Cliente) {
    if (!confirm(`¿${c.estado ? 'Dar de baja' : 'Reactivar'} a ${c.nombre}?`)) return
    const { error } = await supabase.from('clientes').update({ estado: !c.estado }).eq('id', c.id)
    if (error) setError(mensajeError(error))
    else cargar()
  }

  async function gestionarCuenta(e: FormEvent) {
    e.preventDefault()
    if (!cuenta) return
    setGuardando(true)
    setError(null)
    try {
      if (cuenta.perfil) {
        await adminUsuarios({ accion: 'resetear_password', perfil_id: cuenta.perfil.id, password: cuenta.password })
        setAviso(`Contraseña de ${cuenta.cliente.nombre} restablecida.`)
      } else {
        const r = await adminUsuarios<{ usuario: string }>({ accion: 'crear_usuario_cliente', cliente_id: cuenta.cliente.id, password: cuenta.password })
        setAviso(`Usuario creado para ${cuenta.cliente.nombre}. Inicia sesión con el usuario "${r.usuario}" y la contraseña indicada.`)
      }
      setCuenta(null)
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  async function activarUsuario(p: Perfil) {
    try {
      await adminUsuarios({ accion: 'cambiar_estado_usuario', perfil_id: p.id, activo: !p.activo })
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  const visibles = lista.filter((c) => `${c.nombre} ${c.documento}`.toLowerCase().includes(filtro.toLowerCase()))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Clientes</h1>
        <div className="flex gap-2">
          <input placeholder="Buscar por nombre o DNI…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          <Boton onClick={() => setForm({ ...vacio })}>+ Nuevo cliente</Boton>
        </div>
      </div>
      {error && !form && <Alerta>{error}</Alerta>}
      {aviso && <Alerta tipo="exito">{aviso}</Alerta>}
      <Tarjeta>
        {visibles.length === 0 ? (
          <Vacio>Aún no hay clientes.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Tasa pactada</th>
                  <th>Moratoria</th>
                  <th className="text-right">Límite</th>
                  <th>Corte / pago</th>
                  <th>Usuario</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibles.map((c) => {
                  const perfil = usuarios.find((u) => u.cliente_id === c.id)
                  const m = c.moneda ? 'USD' : 'PEN'
                  return (
                    <tr key={c.id} className={c.estado ? '' : 'opacity-60'}>
                      <td>
                        <Link to={`/tienda/cobranza?cliente=${c.id}`} className="font-medium text-marca-800 hover:underline">
                          {c.nombre}
                        </Link>
                        <div className="text-xs text-stone-500">
                          DNI {c.documento} {c.telefono && `· ${c.telefono}`}
                        </div>
                      </td>
                      <td className="text-xs">{describirTasa(c.tipo_tasa, c.tasa_compensatoria, c.periodo_tasa, c.capitalizacion)}</td>
                      <td className="text-xs">{describirTasa(c.tipo_tasa_moratoria, c.tasa_moratoria, c.periodo_tasa_moratoria, c.capitalizacion_moratoria)}</td>
                      <td className="text-right">
                        {dinero(c.limite_credito, m)}
                        <div className="text-xs text-stone-500">hasta {c.plazo_max_meses} cuotas</div>
                      </td>
                      <td className="text-xs">
                        Corte {c.dia_corte} · Pago {c.dia_pago}
                      </td>
                      <td className="text-xs">
                        {perfil ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              {perfil.usuario} {!perfil.activo && <Etiqueta color="rojo">inactivo</Etiqueta>}
                            </div>
                            <div className="space-x-2">
                              <button className="text-marca-700 hover:underline" onClick={() => setCuenta({ cliente: c, perfil, password: '' })}>
                                restablecer clave
                              </button>
                              <button className="text-stone-500 hover:underline" onClick={() => activarUsuario(perfil)}>
                                {perfil.activo ? 'desactivar' : 'activar'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button className="font-medium text-marca-700 hover:underline" onClick={() => setCuenta({ cliente: c, password: '' })}>
                            + crear usuario
                          </button>
                        )}
                      </td>
                      <td>{c.estado ? <Etiqueta color="verde">Activo</Etiqueta> : <Etiqueta color="rojo">De baja</Etiqueta>}</td>
                      <td className="space-x-1 text-right whitespace-nowrap">
                        <Boton variante="fantasma" onClick={() => setForm(aForm(c))}>
                          Editar
                        </Boton>
                        <Boton variante="secundario" onClick={() => cambiarEstado(c)}>
                          {c.estado ? 'Dar de baja' : 'Activar'}
                        </Boton>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <Modal titulo={form?.id ? 'Editar cliente' : 'Nuevo cliente'} abierto={!!form} onCerrar={() => setForm(null)} ancho="max-w-3xl">
        {form && (
          <form onSubmit={guardar} className="space-y-4">
            {error && <Alerta>{error}</Alerta>}
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo etiqueta="Nombre completo" ayuda="Nombres y apellidos del vecino." className="sm:col-span-2">
                <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required maxLength={100} />
              </Campo>
              <Campo etiqueta="DNI" ayuda="8 dígitos. Será también su usuario para consultar su cuenta.">
                <input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} required pattern="[0-9]{8}" maxLength={8} inputMode="numeric" />
              </Campo>
              <Campo etiqueta="Teléfono" ayuda="Opcional. 9 dígitos.">
                <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} pattern="9[0-9]{8}" maxLength={9} inputMode="numeric" />
              </Campo>
              <Campo etiqueta="Correo" ayuda="Opcional, solo de contacto.">
                <input type="email" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} maxLength={100} />
              </Campo>
              <Campo etiqueta="Dirección" ayuda="Opcional. Ayuda a ubicar al vecino en la zona.">
                <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} maxLength={150} />
              </Campo>
            </div>

            <CamposTasa
              titulo="Tasa de interés compensatoria pactada"
              valor={form.tasa}
              onChange={(tasa) => setForm({ ...form, tasa })}
              ayudaValor="Tasa que pagará el cliente por el crédito, en porcentaje. No puede superar la tasa máxima del BCRP vigente."
            />
            <CamposTasa
              titulo="Tasa de interés moratoria pactada"
              valor={form.mora}
              onChange={(mora) => setForm({ ...form, mora })}
              ayudaValor="Tasa adicional que se cobra por los días de atraso sobre el total que debió pagarse."
            />

            <div className="grid gap-4 sm:grid-cols-5">
              <Campo etiqueta="Moneda" ayuda="Moneda en la que se lleva el crédito del cliente.">
                <select value={form.usd ? 'USD' : 'PEN'} onChange={(e) => setForm({ ...form, usd: e.target.value === 'USD' })}>
                  <option value="PEN">Soles (S/)</option>
                  <option value="USD">Dólares (US$)</option>
                </select>
              </Campo>
              <Campo etiqueta="Límite de crédito" ayuda="Deuda máxima permitida. No se aceptan compras que la superen.">
                <input type="number" step="0.01" min="0.01" value={form.limite_credito} onChange={(e) => setForm({ ...form, limite_credito: e.target.value })} required />
              </Campo>
              <Campo etiqueta="Máx. de cuotas" ayuda="Número máximo de meses en que se le puede dar crédito (1 a 36).">
                <input type="number" min={1} max={36} value={form.plazo_max_meses} onChange={(e) => setForm({ ...form, plazo_max_meses: e.target.value })} required />
              </Campo>
              <Campo etiqueta="Día de corte" ayuda="Día del mes (1 a 28) en que se cierra el ciclo. Compras posteriores pasan al mes siguiente.">
                <input type="number" min={1} max={28} value={form.dia_corte} onChange={(e) => setForm({ ...form, dia_corte: e.target.value })} required />
              </Campo>
              <Campo etiqueta="Día de pago" ayuda="Día del mes (1 a 28, mayor que el día de corte) en que el cliente se compromete a pagar.">
                <input type="number" min={2} max={28} value={form.dia_pago} onChange={(e) => setForm({ ...form, dia_pago: e.target.value })} required />
              </Campo>
            </div>
            <div className="flex justify-end gap-2">
              <Boton type="button" variante="secundario" onClick={() => setForm(null)}>
                Cancelar
              </Boton>
              <Boton type="submit" cargando={guardando}>
                Guardar
              </Boton>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        titulo={cuenta?.perfil ? `Restablecer contraseña — ${cuenta.cliente.nombre}` : `Crear usuario — ${cuenta?.cliente.nombre ?? ''}`}
        abierto={!!cuenta}
        onCerrar={() => setCuenta(null)}
        ancho="max-w-md"
      >
        {cuenta && (
          <form onSubmit={gestionarCuenta} className="space-y-4">
            {error && <Alerta>{error}</Alerta>}
            {!cuenta.perfil && (
              <p className="text-sm text-stone-600">
                Su usuario será su DNI (<strong>{cuenta.cliente.documento}</strong>). Con él podrá ver sus compras, cuotas y pagos.
              </p>
            )}
            <Campo etiqueta="Contraseña" ayuda="Mínimo 8 caracteres. Entrégasela al cliente; no se envía ningún correo.">
              <input type="text" value={cuenta.password} onChange={(e) => setCuenta({ ...cuenta, password: e.target.value })} required minLength={8} />
            </Campo>
            <Boton type="submit" cargando={guardando} className="w-full">
              {cuenta.perfil ? 'Restablecer' : 'Crear usuario'}
            </Boton>
          </form>
        )}
      </Modal>
    </div>
  )
}
