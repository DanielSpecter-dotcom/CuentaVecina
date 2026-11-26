import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CamposTasa, type ValorTasa } from '../../components/CamposTasa'
import { Avatar, Paso, Segmentado } from '../../components/cuaderno'
import { Alerta, Boton, Campo, Dato, Etiqueta, Modal, PieModal, Tarjeta, Vacio } from '../../components/ui'
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

const accion = 'inline-flex min-h-11 min-w-11 items-center underline-offset-4 hover:underline'

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
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((x) => x && { ...x, [k]: e.target.value })

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

  async function guardar(e: SubmitEvent) {
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

  async function gestionarCuenta(e: SubmitEvent) {
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

  /** Usuario del cliente y sus acciones (igual en la ficha y en la tabla). */
  const usuarioDe = (c: Cliente, perfil?: Perfil, tabla = false) =>
    perfil ? (
      <div className={tabla ? 'whitespace-nowrap [&>button]:mr-3' : 'flex flex-wrap items-center gap-x-3'}>
        <span className={tabla ? 'block' : ''}>
          {perfil.usuario} {!perfil.activo && <Etiqueta color="rojo">inactivo</Etiqueta>}
        </span>
        <button className={`${accion} font-bold`} aria-label={`Restablecer clave de ${c.nombre}`} onClick={() => setCuenta({ cliente: c, perfil, password: '' })}>
          Restablecer clave
        </button>
        <button className={`${accion} text-tinta-suave`} aria-label={`${perfil.activo ? 'Desactivar' : 'Activar'} usuario de ${c.nombre}`} onClick={() => activarUsuario(perfil)}>
          {perfil.activo ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    ) : (
      <button className={`${accion} font-bold underline`} aria-label={`Crear usuario para ${c.nombre}`} onClick={() => setCuenta({ cliente: c, password: '' })}>
        <Plus aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.5} />
        Crear usuario
      </button>
    )

  const estadoDe = (c: Cliente) => (c.estado ? <Etiqueta color="verde">Activo</Etiqueta> : <Etiqueta color="rojo">De baja</Etiqueta>)

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Clientes</h1>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          aria-label="Buscar cliente por nombre o DNI"
          placeholder="Buscar por nombre o DNI…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="w-full min-w-0 sm:flex-1"
        />
        <Boton onClick={() => setForm({ ...vacio })} className="w-full sm:w-auto">
          <Plus aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.5} />
          Nuevo cliente
        </Boton>
      </div>
      {error && !form && <Alerta>{error}</Alerta>}
      {aviso && <Alerta tipo="exito">{aviso}</Alerta>}

      {visibles.length === 0 ? (
        <Vacio>{lista.length ? `Ningún cliente coincide con "${filtro}".` : 'Aún no hay clientes. Registra el primero con "+ Nuevo cliente".'}</Vacio>
      ) : (
        <>
          {/* Celular y pantallas medianas: fichas (en 2 columnas desde 640 px); la tabla solo cuando entra completa. */}
          <ul className="grid gap-3 sm:grid-cols-2 min-[75rem]:hidden">
            {visibles.map((c) => {
              const perfil = usuarios.find((u) => u.cliente_id === c.id)
              const m = c.moneda ? 'USD' : 'PEN'
              return (
                <li key={c.id} className={`rounded-2xl border border-papel-borde p-4 ${c.estado ? 'bg-white' : 'bg-papel-borde/40'}`}>
                  <div className="flex items-center gap-3">
                    <Avatar nombre={c.nombre} activo={c.estado} />
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/tienda/cobranza?cliente=${c.id}`}
                        // El área de toque se amplía a 44 px sin mover el texto.
                        className="relative block font-bold underline-offset-4 after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-[''] hover:underline"
                      >
                        <span className="block truncate">{c.nombre}</span>
                      </Link>
                      <p className="truncate text-xs text-tinta-suave">
                        DNI {c.documento} {c.telefono && `· ${c.telefono}`}
                      </p>
                    </div>
                    {estadoDe(c)}
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2.5 text-sm">
                    <Dato etiqueta="Tasa pactada" valor={describirTasa(c.tipo_tasa, c.tasa_compensatoria, c.periodo_tasa, c.capitalizacion)} />
                    <Dato etiqueta="Moratoria" valor={describirTasa(c.tipo_tasa_moratoria, c.tasa_moratoria, c.periodo_tasa_moratoria, c.capitalizacion_moratoria)} />
                    <Dato
                      etiqueta="Límite"
                      valor={
                        <>
                          {dinero(c.limite_credito, m)}
                          <span className="block text-xs font-normal text-tinta-suave">hasta {c.plazo_max_meses} cuotas</span>
                        </>
                      }
                    />
                    <Dato etiqueta="Corte / pago" valor={`día ${c.dia_corte} / día ${c.dia_pago}`} />
                  </dl>
                  <div className="mt-3 border-t border-dashed border-papel-borde pt-1 text-sm">{usuarioDe(c, perfil)}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Boton variante="fantasma" aria-label={`Editar a ${c.nombre}`} onClick={() => setForm(aForm(c))}>
                      Editar
                    </Boton>
                    <Boton variante="secundario" aria-label={`${c.estado ? 'Dar de baja' : 'Activar'} a ${c.nombre}`} onClick={() => cambiarEstado(c)}>
                      {c.estado ? 'Dar de baja' : 'Activar'}
                    </Boton>
                  </div>
                </li>
              )
            })}
          </ul>

          <Tarjeta className="hidden min-[75rem]:block">
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Tasas</th>
                    <th>Crédito</th>
                    <th>Usuario</th>
                    <th>Estado</th>
                    <th>
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((c) => {
                    const perfil = usuarios.find((u) => u.cliente_id === c.id)
                    const m = c.moneda ? 'USD' : 'PEN'
                    return (
                      <tr key={c.id} className={c.estado ? '' : 'bg-papel-borde/40'}>
                        <td className="min-w-44">
                          <Link to={`/tienda/cobranza?cliente=${c.id}`} className="font-bold underline-offset-4 hover:underline">
                            {c.nombre}
                          </Link>
                          <div className="text-xs whitespace-nowrap text-tinta-suave">
                            DNI {c.documento} {c.telefono && `· ${c.telefono}`}
                          </div>
                        </td>
                        <td className="whitespace-nowrap">
                          <div className="font-bold">{describirTasa(c.tipo_tasa, c.tasa_compensatoria, c.periodo_tasa, c.capitalizacion)}</div>
                          <div className="text-xs text-tinta-suave">
                            Mora {describirTasa(c.tipo_tasa_moratoria, c.tasa_moratoria, c.periodo_tasa_moratoria, c.capitalizacion_moratoria)}
                          </div>
                        </td>
                        <td className="whitespace-nowrap">
                          <div className="font-bold">{dinero(c.limite_credito, m)}</div>
                          <div className="text-xs text-tinta-suave">hasta {c.plazo_max_meses} cuotas</div>
                          <div className="text-xs text-tinta-suave">
                            corte día {c.dia_corte} · pago día {c.dia_pago}
                          </div>
                        </td>
                        <td className="text-xs">{usuarioDe(c, perfil, true)}</td>
                        <td>{estadoDe(c)}</td>
                        <td className="space-x-1 text-right whitespace-nowrap">
                          <Boton variante="fantasma" className="px-3" aria-label={`Editar a ${c.nombre}`} onClick={() => setForm(aForm(c))}>
                            Editar
                          </Boton>
                          <Boton variante="secundario" className="px-4" aria-label={`${c.estado ? 'Dar de baja' : 'Activar'} a ${c.nombre}`} onClick={() => cambiarEstado(c)}>
                            {c.estado ? 'Dar de baja' : 'Activar'}
                          </Boton>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        </>
      )}

      <Modal titulo={form?.id ? 'Editar cliente' : 'Nuevo cliente'} abierto={!!form} onCerrar={() => setForm(null)} ancho="max-w-3xl">
        {form && (
          <form onSubmit={guardar} className="space-y-6">
            {error && <Alerta>{error}</Alerta>}
            <section className="space-y-3">
              <Paso n={1}>Datos</Paso>
              <div className="grid gap-4 sm:grid-cols-3">
                <Campo etiqueta="Nombre completo" ayuda="Nombres y apellidos del vecino." className="sm:col-span-2">
                  <input value={form.nombre} onChange={set('nombre')} required maxLength={100} />
                </Campo>
                <Campo etiqueta="DNI" ayuda="8 dígitos. Será también su usuario para consultar su cuenta.">
                  <input value={form.documento} onChange={set('documento')} required pattern="[0-9]{8}" maxLength={8} inputMode="numeric" />
                </Campo>
                <Campo etiqueta="Teléfono" opcional ayuda="Celular de 9 dígitos que empiece con 9.">
                  <input type="tel" value={form.telefono} onChange={set('telefono')} pattern="9[0-9]{8}" maxLength={9} inputMode="numeric" />
                </Campo>
                <Campo etiqueta="Correo" opcional ayuda="Solo de contacto.">
                  <input type="email" value={form.correo} onChange={set('correo')} maxLength={100} />
                </Campo>
                <Campo etiqueta="Dirección" opcional ayuda="Ayuda a ubicar al vecino en la zona.">
                  <input value={form.direccion} onChange={set('direccion')} maxLength={150} />
                </Campo>
              </div>
            </section>

            <section className="space-y-3">
              <Paso n={2}>Tasa pactada</Paso>
              <CamposTasa
                titulo="Tasa de interés compensatoria pactada"
                valor={form.tasa}
                onChange={(tasa) => setForm({ ...form, tasa })}
                ayudaValor="Tasa que pagará el cliente por el crédito, en porcentaje. No puede superar la tasa máxima del BCRP vigente."
              />
            </section>

            <section className="space-y-3">
              <Paso n={3}>Tasa moratoria</Paso>
              <CamposTasa
                titulo="Tasa de interés moratoria pactada"
                valor={form.mora}
                onChange={(mora) => setForm({ ...form, mora })}
                ayudaValor="Tasa adicional que se cobra por los días de atraso sobre el total que debió pagarse."
              />
            </section>

            <section className="space-y-3">
              <Paso n={4}>Crédito</Paso>
              <Campo etiqueta="Moneda" ayuda="Moneda en la que se lleva el crédito del cliente.">
                <Segmentado
                  etiqueta="Moneda"
                  valor={form.usd ? 'USD' : 'PEN'}
                  onChange={(v) => setForm({ ...form, usd: v === 'USD' })}
                  opciones={[
                    { valor: 'PEN', titulo: 'Soles', detalle: 'S/' },
                    { valor: 'USD', titulo: 'Dólares', detalle: 'US$' },
                  ]}
                />
              </Campo>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Campo etiqueta="Límite de crédito" ayuda="Deuda máxima permitida. No se aceptan compras que la superen.">
                  <input type="number" step="0.01" min="0.01" value={form.limite_credito} onChange={set('limite_credito')} required />
                </Campo>
                <Campo etiqueta="Máx. de cuotas" ayuda="Número máximo de meses en que se le puede dar crédito (1 a 36).">
                  <input type="number" min={1} max={36} value={form.plazo_max_meses} onChange={set('plazo_max_meses')} required />
                </Campo>
                <Campo etiqueta="Día de corte" ayuda="Día del mes (1 a 28) en que se cierra el ciclo. Compras posteriores pasan al mes siguiente.">
                  <input type="number" min={1} max={28} value={form.dia_corte} onChange={set('dia_corte')} required />
                </Campo>
                <Campo etiqueta="Día de pago" ayuda="Día del mes (1 a 28, mayor que el día de corte) en que el cliente se compromete a pagar.">
                  <input type="number" min={2} max={28} value={form.dia_pago} onChange={set('dia_pago')} required />
                </Campo>
              </div>
            </section>
            <PieModal>
              <Boton type="button" variante="secundario" onClick={() => setForm(null)}>
                Cancelar
              </Boton>
              <Boton type="submit" cargando={guardando}>
                Guardar
              </Boton>
            </PieModal>
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
              <p className="text-sm text-tinta-suave">
                Su usuario será su DNI (<strong className="text-tinta">{cuenta.cliente.documento}</strong>). Con él podrá ver sus compras, cuotas y pagos.
              </p>
            )}
            <Campo etiqueta="Contraseña" ayuda="Mínimo 8 caracteres. Entrégasela al cliente en mano.">
              <input type="text" autoComplete="new-password" value={cuenta.password} onChange={(e) => setCuenta({ ...cuenta, password: e.target.value })} required minLength={8} />
            </Campo>
            <PieModal>
              <Boton type="submit" cargando={guardando} className="w-full">
                {cuenta.perfil ? 'Restablecer' : 'Crear usuario'}
              </Boton>
            </PieModal>
          </form>
        )}
      </Modal>
    </div>
  )
}
