import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { PrimerosPasos } from '../../components/PrimerosPasos'
import { Alerta, Boton, Campo, Dato, Etiqueta, Modal, PieModal, Tarjeta, Vacio } from '../../components/ui'
import { formatearFecha } from '../../lib/fechas'
import { adminUsuarios, mensajeError, supabase } from '../../lib/supabase'
import type { Perfil, Tienda } from '../../types'

const tiendaVacia = { nombre_comercial: '', ruc: '', giro: 'Bodega', direccion: '', telefono: '', correo: '', hora_corte: '23:59:59' }

export default function Tiendas() {
  const [tiendas, setTiendas] = useState<Tienda[]>([])
  const [admins, setAdmins] = useState<Perfil[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [edicion, setEdicion] = useState<(typeof tiendaVacia & { id?: string }) | null>(null)
  const [nuevoAdmin, setNuevoAdmin] = useState<{ tienda: Tienda; usuario: string; nombre: string; password: string } | null>(null)
  const [reset, setReset] = useState<{ perfil: Perfil; password: string } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const set = (k: keyof typeof tiendaVacia) => (e: { target: { value: string } }) => setEdicion((x) => x && { ...x, [k]: e.target.value })

  const cargar = useCallback(async () => {
    const [t, a] = await Promise.all([
      supabase.from('tiendas').select('*').order('created_at', { ascending: false }),
      supabase.from('perfiles').select('*').eq('rol', 'admin_tienda'),
    ])
    if (t.error) setError(mensajeError(t.error))
    setTiendas((t.data as Tienda[]) ?? [])
    setAdmins((a.data as Perfil[]) ?? [])
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function guardarTienda(e: SubmitEvent) {
    e.preventDefault()
    if (!edicion) return
    setGuardando(true)
    setError(null)
    const { id, ...datos } = edicion
    const fila = { ...datos, telefono: datos.telefono || null, correo: datos.correo || null }
    const r = id ? await supabase.from('tiendas').update(fila).eq('id', id) : await supabase.from('tiendas').insert(fila)
    setGuardando(false)
    if (r.error) return setError(mensajeError(r.error))
    setEdicion(null)
    setAviso(id ? 'Tienda actualizada' : 'Tienda dada de alta. Ahora crea su administrador.')
    cargar()
  }

  async function cambiarEstado(t: Tienda) {
    const accion = t.estado ? 'dar de baja' : 'reactivar'
    if (!confirm(`¿Seguro que deseas ${accion} "${t.nombre_comercial}"? ${t.estado ? 'Sus usuarios perderán el acceso.' : ''}`)) return
    const { error } = await supabase.from('tiendas').update({ estado: !t.estado }).eq('id', t.id)
    if (error) setError(mensajeError(error))
    else cargar()
  }

  async function crearAdmin(e: SubmitEvent) {
    e.preventDefault()
    if (!nuevoAdmin) return
    setGuardando(true)
    setError(null)
    try {
      await adminUsuarios({
        accion: 'crear_admin_tienda',
        tienda_id: nuevoAdmin.tienda.id,
        usuario: nuevoAdmin.usuario,
        nombre: nuevoAdmin.nombre,
        password: nuevoAdmin.password,
      })
      setAviso(`Usuario "${nuevoAdmin.usuario.toLowerCase()}" creado. Entrégale su contraseña al responsable.`)
      setNuevoAdmin(null)
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  async function restablecer(e: SubmitEvent) {
    e.preventDefault()
    if (!reset) return
    setGuardando(true)
    setError(null)
    try {
      await adminUsuarios({ accion: 'resetear_password', perfil_id: reset.perfil.id, password: reset.password })
      setAviso(`Contraseña de "${reset.perfil.usuario}" restablecida.`)
      setReset(null)
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  const editar = (t: Tienda) =>
    setEdicion({
      id: t.id,
      nombre_comercial: t.nombre_comercial,
      ruc: t.ruc,
      giro: t.giro,
      direccion: t.direccion,
      telefono: t.telefono ?? '',
      correo: t.correo ?? '',
      hora_corte: t.hora_corte,
    })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Tiendas</h1>
        <Boton onClick={() => setEdicion({ ...tiendaVacia })} className="max-sm:w-full">
          + Alta de tienda
        </Boton>
      </div>
      {error && !edicion && !nuevoAdmin && !reset && <Alerta>{error}</Alerta>}
      {aviso && <Alerta tipo="exito">{aviso}</Alerta>}
      <PrimerosPasos key={`${tiendas.length}-${admins.length}`} rol="admin_sistema" />
      {tiendas.length === 0 ? (
        <Vacio>No hay tiendas registradas.</Vacio>
      ) : (
        <>
          {/* Celular y tablet: una ficha por tienda. */}
          <ul className="grid gap-3 md:grid-cols-2 lg:hidden">
            {tiendas.map((t) => {
              const suyos = admins.filter((a) => a.tienda_id === t.id)
              return (
                <li key={t.id} className={`flex flex-col rounded-2xl border border-papel-borde p-4 ${t.estado ? 'bg-white' : 'bg-papel-borde/40'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-lg font-bold">{t.nombre_comercial}</h2>
                      <p className="text-sm text-tinta-suave">{t.direccion}</p>
                    </div>
                    {t.estado ? <Etiqueta color="verde">Activa</Etiqueta> : <Etiqueta color="rojo">De baja</Etiqueta>}
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2.5 text-sm">
                    <Dato etiqueta="RUC" valor={t.ruc} />
                    <Dato etiqueta="Giro" valor={t.giro} />
                    <Dato etiqueta="Alta" valor={formatearFecha(t.created_at)} />
                  </dl>
                  <div className="mt-3 border-t border-dashed border-papel-borde pt-2">
                    <p className="text-xs text-tinta-suave">Administradores</p>
                    <ul>
                      {suyos.map((a) => (
                        <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3">
                          <span className="font-bold">{a.usuario}</span>
                          <button
                            className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
                            aria-label={`Restablecer clave de ${a.usuario}`}
                            onClick={() => setReset({ perfil: a, password: '' })}
                          >
                            Restablecer clave
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      className="inline-flex min-h-11 items-center text-sm font-bold underline underline-offset-4"
                      aria-label={`Crear administrador para ${t.nombre_comercial}`}
                      onClick={() => setNuevoAdmin({ tienda: t, usuario: '', nombre: '', password: '' })}
                    >
                      + Crear administrador
                    </button>
                  </div>
                  <div className="mt-auto grid grid-cols-2 gap-2 pt-2">
                    <Boton
                      variante="fantasma"
                      aria-label={`Editar ${t.nombre_comercial}`}
                      onClick={() => editar(t)}
                    >
                      Editar
                    </Boton>
                    <Boton variante={t.estado ? 'secundario' : 'primario'} aria-label={`${t.estado ? 'Dar de baja' : 'Reactivar'} ${t.nombre_comercial}`} onClick={() => cambiarEstado(t)}>
                      {t.estado ? 'Dar de baja' : 'Reactivar'}
                    </Boton>
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Escritorio: tabla compacta, más fácil de recorrer con muchas tiendas. */}
          <Tarjeta className="hidden lg:block">
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Tienda</th>
                    <th>RUC</th>
                    <th>Giro</th>
                    <th>Alta</th>
                    <th>Administradores</th>
                    <th>Estado</th>
                    <th>
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tiendas.map((t) => {
                    const suyos = admins.filter((a) => a.tienda_id === t.id)
                    return (
                      <tr key={t.id} className={t.estado ? '' : 'bg-papel-borde/40'}>
                        <td>
                          <div className="font-bold">{t.nombre_comercial}</div>
                          <div className="text-xs text-tinta-suave">{t.direccion}</div>
                        </td>
                        <td>{t.ruc}</td>
                        <td>{t.giro}</td>
                        <td>{formatearFecha(t.created_at)}</td>
                        <td>
                          {suyos.map((a) => (
                            <div key={a.id} className="flex items-center gap-3 whitespace-nowrap">
                              <span className="font-bold">{a.usuario}</span>
                              <button
                                className="inline-flex min-h-11 items-center text-xs underline underline-offset-4"
                                aria-label={`Restablecer clave de ${a.usuario}`}
                                onClick={() => setReset({ perfil: a, password: '' })}
                              >
                                Restablecer clave
                              </button>
                            </div>
                          ))}
                          <button
                            className="inline-flex min-h-11 items-center text-xs font-bold whitespace-nowrap underline underline-offset-4"
                            aria-label={`Crear administrador para ${t.nombre_comercial}`}
                            onClick={() => setNuevoAdmin({ tienda: t, usuario: '', nombre: '', password: '' })}
                          >
                            + Crear administrador
                          </button>
                        </td>
                        <td>{t.estado ? <Etiqueta color="verde">Activa</Etiqueta> : <Etiqueta color="rojo">De baja</Etiqueta>}</td>
                        <td className="space-x-1 text-right whitespace-nowrap">
                          <Boton variante="fantasma" className="px-3" aria-label={`Editar ${t.nombre_comercial}`} onClick={() => editar(t)}>
                            Editar
                          </Boton>
                          <Boton
                            variante={t.estado ? 'secundario' : 'primario'}
                            className="px-4"
                            aria-label={`${t.estado ? 'Dar de baja' : 'Reactivar'} ${t.nombre_comercial}`}
                            onClick={() => cambiarEstado(t)}
                          >
                            {t.estado ? 'Dar de baja' : 'Reactivar'}
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

      <Modal titulo={edicion?.id ? 'Editar tienda' : 'Alta de tienda'} abierto={!!edicion} onCerrar={() => setEdicion(null)}>
        {edicion && (
          <form onSubmit={guardarTienda} className="space-y-4">
            {error && <Alerta>{error}</Alerta>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Nombre comercial" ayuda="Nombre del negocio como lo conocen sus clientes.">
                <input value={edicion.nombre_comercial} onChange={set('nombre_comercial')} required maxLength={100} />
              </Campo>
              <Campo etiqueta="RUC" ayuda="11 dígitos. Debe ser único en la plataforma.">
                <input value={edicion.ruc} onChange={set('ruc')} required pattern="[0-9]{11}" inputMode="numeric" maxLength={11} />
              </Campo>
              <Campo etiqueta="Giro" ayuda="Bodega, panadería, peluquería, etc.">
                <input value={edicion.giro} onChange={set('giro')} required maxLength={50} />
              </Campo>
              <Campo etiqueta="Dirección" ayuda="Dirección del local.">
                <input value={edicion.direccion} onChange={set('direccion')} required maxLength={150} />
              </Campo>
              <Campo etiqueta="Teléfono" opcional ayuda="Celular de 9 dígitos que empiece con 9.">
                <input type="tel" inputMode="numeric" value={edicion.telefono} onChange={set('telefono')} pattern="9[0-9]{8}" maxLength={9} />
              </Campo>
              <Campo etiqueta="Correo" opcional ayuda="Correo de contacto.">
                <input type="email" value={edicion.correo} onChange={set('correo')} maxLength={100} />
              </Campo>
              <Campo
                etiqueta="Hora de corte"
                ayuda="Hora límite (hora de Lima) del día de corte. Las compras del día de corte posteriores a esta hora pasan al mes siguiente."
              >
                <input type="time" step={1} value={edicion.hora_corte} onChange={set('hora_corte')} required />
              </Campo>
            </div>
            <PieModal>
              <Boton type="button" variante="secundario" onClick={() => setEdicion(null)}>
                Cancelar
              </Boton>
              <Boton type="submit" cargando={guardando}>
                Guardar
              </Boton>
            </PieModal>
          </form>
        )}
      </Modal>

      <Modal titulo={`Nuevo administrador — ${nuevoAdmin?.tienda.nombre_comercial ?? ''}`} abierto={!!nuevoAdmin} onCerrar={() => setNuevoAdmin(null)} ancho="max-w-md">
        {nuevoAdmin && (
          <form onSubmit={crearAdmin} className="space-y-4">
            {error && <Alerta>{error}</Alerta>}
            <Campo etiqueta="Usuario" ayuda="Con este nombre iniciará sesión (sugerido: su DNI). 3 a 40 caracteres: letras, números, punto o guion.">
              <input value={nuevoAdmin.usuario} onChange={(e) => setNuevoAdmin({ ...nuevoAdmin, usuario: e.target.value })} required pattern="[A-Za-z0-9._\-]{3,40}" />
            </Campo>
            <Campo etiqueta="Nombre completo" ayuda="Nombre del responsable del negocio.">
              <input value={nuevoAdmin.nombre} onChange={(e) => setNuevoAdmin({ ...nuevoAdmin, nombre: e.target.value })} required maxLength={100} />
            </Campo>
            <Campo etiqueta="Contraseña inicial" ayuda="Mínimo 8 caracteres. Entrégasela al responsable; no se envía ningún correo.">
              <input type="text" autoComplete="new-password" value={nuevoAdmin.password} onChange={(e) => setNuevoAdmin({ ...nuevoAdmin, password: e.target.value })} required minLength={8} />
            </Campo>
            <PieModal>
              <Boton type="submit" cargando={guardando} className="w-full">
                Crear administrador
              </Boton>
            </PieModal>
          </form>
        )}
      </Modal>

      <Modal titulo={`Restablecer contraseña — ${reset?.perfil.usuario ?? ''}`} abierto={!!reset} onCerrar={() => setReset(null)} ancho="max-w-md">
        {reset && (
          <form onSubmit={restablecer} className="space-y-4">
            {error && <Alerta>{error}</Alerta>}
            <Campo etiqueta="Nueva contraseña" ayuda="Mínimo 8 caracteres.">
              <input type="text" autoComplete="new-password" value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} required minLength={8} />
            </Campo>
            <PieModal>
              <Boton type="submit" cargando={guardando} className="w-full">
                Restablecer
              </Boton>
            </PieModal>
          </form>
        )}
      </Modal>
    </div>
  )
}
