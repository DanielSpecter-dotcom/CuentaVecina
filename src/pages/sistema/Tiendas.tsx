import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Alerta, Boton, Campo, Etiqueta, Modal, Tarjeta, Vacio } from '../../components/ui'
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

  async function guardarTienda(e: FormEvent) {
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

  async function crearAdmin(e: FormEvent) {
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

  async function restablecer(e: FormEvent) {
    e.preventDefault()
    if (!reset) return
    setGuardando(true)
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tiendas</h1>
        <Boton onClick={() => setEdicion({ ...tiendaVacia })}>+ Alta de tienda</Boton>
      </div>
      {error && <Alerta>{error}</Alerta>}
      {aviso && <Alerta tipo="exito">{aviso}</Alerta>}
      <Tarjeta>
        {tiendas.length === 0 ? (
          <Vacio>No hay tiendas registradas.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Tienda</th>
                  <th>RUC</th>
                  <th>Giro</th>
                  <th>Administradores</th>
                  <th>Alta</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tiendas.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div className="font-medium">{t.nombre_comercial}</div>
                      <div className="text-xs text-stone-500">{t.direccion}</div>
                    </td>
                    <td>{t.ruc}</td>
                    <td>{t.giro}</td>
                    <td>
                      {admins
                        .filter((a) => a.tienda_id === t.id)
                        .map((a) => (
                          <div key={a.id} className="flex items-center gap-2">
                            <span>{a.usuario}</span>
                            <button className="text-xs text-marca-700 hover:underline" onClick={() => setReset({ perfil: a, password: '' })}>
                              restablecer clave
                            </button>
                          </div>
                        ))}
                      <button
                        className="text-xs font-medium text-marca-700 hover:underline"
                        onClick={() => setNuevoAdmin({ tienda: t, usuario: '', nombre: '', password: '' })}
                      >
                        + crear administrador
                      </button>
                    </td>
                    <td>{formatearFecha(t.created_at)}</td>
                    <td>{t.estado ? <Etiqueta color="verde">Activa</Etiqueta> : <Etiqueta color="rojo">De baja</Etiqueta>}</td>
                    <td className="space-x-2 text-right whitespace-nowrap">
                      <Boton
                        variante="fantasma"
                        onClick={() =>
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
                        }
                      >
                        Editar
                      </Boton>
                      <Boton variante={t.estado ? 'secundario' : 'primario'} onClick={() => cambiarEstado(t)}>
                        {t.estado ? 'Dar de baja' : 'Reactivar'}
                      </Boton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <Modal titulo={edicion?.id ? 'Editar tienda' : 'Alta de tienda'} abierto={!!edicion} onCerrar={() => setEdicion(null)}>
        {edicion && (
          <form onSubmit={guardarTienda} className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nombre comercial" ayuda="Nombre del negocio como lo conocen sus clientes.">
              <input value={edicion.nombre_comercial} onChange={(e) => setEdicion({ ...edicion, nombre_comercial: e.target.value })} required maxLength={100} />
            </Campo>
            <Campo etiqueta="RUC" ayuda="11 dígitos. Debe ser único en la plataforma.">
              <input value={edicion.ruc} onChange={(e) => setEdicion({ ...edicion, ruc: e.target.value })} required pattern="[0-9]{11}" maxLength={11} />
            </Campo>
            <Campo etiqueta="Giro" ayuda="Bodega, panadería, peluquería, etc.">
              <input value={edicion.giro} onChange={(e) => setEdicion({ ...edicion, giro: e.target.value })} required maxLength={50} />
            </Campo>
            <Campo etiqueta="Dirección" ayuda="Dirección del local.">
              <input value={edicion.direccion} onChange={(e) => setEdicion({ ...edicion, direccion: e.target.value })} required maxLength={150} />
            </Campo>
            <Campo etiqueta="Teléfono" ayuda="Celular de 9 dígitos que empieza con 9 (opcional).">
              <input value={edicion.telefono} onChange={(e) => setEdicion({ ...edicion, telefono: e.target.value })} pattern="9[0-9]{8}" maxLength={9} />
            </Campo>
            <Campo etiqueta="Correo" ayuda="Correo de contacto (opcional).">
              <input type="email" value={edicion.correo} onChange={(e) => setEdicion({ ...edicion, correo: e.target.value })} maxLength={100} />
            </Campo>
            <Campo
              etiqueta="Hora de corte"
              ayuda="Hora límite (hora de Lima) del día de corte. Las compras del día de corte posteriores a esta hora pasan al mes siguiente."
            >
              <input type="time" step={1} value={edicion.hora_corte} onChange={(e) => setEdicion({ ...edicion, hora_corte: e.target.value })} required />
            </Campo>
            <div className="flex items-end justify-end gap-2 sm:col-span-2">
              <Boton type="button" variante="secundario" onClick={() => setEdicion(null)}>
                Cancelar
              </Boton>
              <Boton type="submit" cargando={guardando}>
                Guardar
              </Boton>
            </div>
          </form>
        )}
      </Modal>

      <Modal titulo={`Nuevo administrador — ${nuevoAdmin?.tienda.nombre_comercial ?? ''}`} abierto={!!nuevoAdmin} onCerrar={() => setNuevoAdmin(null)} ancho="max-w-md">
        {nuevoAdmin && (
          <form onSubmit={crearAdmin} className="space-y-4">
            <Campo etiqueta="Usuario" ayuda="Con este nombre iniciará sesión (sugerido: su DNI). 3 a 40 caracteres: letras, números, punto o guion.">
              <input value={nuevoAdmin.usuario} onChange={(e) => setNuevoAdmin({ ...nuevoAdmin, usuario: e.target.value })} required pattern="[A-Za-z0-9._\-]{3,40}" />
            </Campo>
            <Campo etiqueta="Nombre completo" ayuda="Nombre del responsable del negocio.">
              <input value={nuevoAdmin.nombre} onChange={(e) => setNuevoAdmin({ ...nuevoAdmin, nombre: e.target.value })} required maxLength={100} />
            </Campo>
            <Campo etiqueta="Contraseña inicial" ayuda="Mínimo 8 caracteres. Entrégasela al responsable; no se envía ningún correo.">
              <input type="text" value={nuevoAdmin.password} onChange={(e) => setNuevoAdmin({ ...nuevoAdmin, password: e.target.value })} required minLength={8} />
            </Campo>
            <Boton type="submit" cargando={guardando} className="w-full">
              Crear administrador
            </Boton>
          </form>
        )}
      </Modal>

      <Modal titulo={`Restablecer contraseña — ${reset?.perfil.usuario ?? ''}`} abierto={!!reset} onCerrar={() => setReset(null)} ancho="max-w-md">
        {reset && (
          <form onSubmit={restablecer} className="space-y-4">
            <Campo etiqueta="Nueva contraseña" ayuda="Mínimo 8 caracteres.">
              <input type="text" value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} required minLength={8} />
            </Campo>
            <Boton type="submit" cargando={guardando} className="w-full">
              Restablecer
            </Boton>
          </form>
        )}
      </Modal>
    </div>
  )
}
