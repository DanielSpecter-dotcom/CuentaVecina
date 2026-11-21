import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { Alerta, Boton, Campo, Etiqueta, Modal, Tarjeta, Vacio } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { formatearFecha } from '../../lib/fechas'
import { adminUsuarios, mensajeError, supabase } from '../../lib/supabase'
import type { Perfil } from '../../types'

type PerfilConFecha = Perfil & { created_at: string }

export default function Administradores() {
  const { perfil: yo } = useAuth()
  const [lista, setLista] = useState<PerfilConFecha[]>([])
  const [nuevo, setNuevo] = useState<{ nombre: string; usuario: string; password: string } | null>(null)
  const [reset, setReset] = useState<{ perfil: Perfil; password: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('perfiles').select('*').eq('rol', 'admin_sistema').order('created_at')
    if (error) setError(mensajeError(error))
    setLista((data as PerfilConFecha[]) ?? [])
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function crear(e: SubmitEvent) {
    e.preventDefault()
    if (!nuevo) return
    setGuardando(true)
    setError(null)
    try {
      await adminUsuarios({ accion: 'crear_admin_sistema', ...nuevo })
      setAviso(`Administrador "${nuevo.usuario.toLowerCase()}" creado. Entrégale su contraseña en persona.`)
      setNuevo(null)
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

  async function cambiarEstado(p: Perfil) {
    try {
      await adminUsuarios({ accion: 'cambiar_estado_usuario', perfil_id: p.id, activo: !p.activo })
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">Administradores del sistema</h1>
        <Boton onClick={() => setNuevo({ nombre: '', usuario: '', password: '' })}>+ Nuevo administrador</Boton>
      </div>
      <p className="text-sm text-stone-600">
        Personas que administran la plataforma: dan de alta tiendas, aprueban solicitudes y cargan las tasas del BCRP.
      </p>
      {error && <Alerta>{error}</Alerta>}
      {aviso && <Alerta tipo="exito">{aviso}</Alerta>}
      <Tarjeta>
        {lista.length === 0 ? (
          <Vacio>Sin administradores.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Usuario</th>
                  <th>Alta</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">
                      {p.nombre} {p.id === yo?.id && <Etiqueta color="azul">tú</Etiqueta>}
                    </td>
                    <td>{p.usuario}</td>
                    <td>{formatearFecha(p.created_at)}</td>
                    <td>{p.activo ? <Etiqueta color="verde">Activo</Etiqueta> : <Etiqueta color="rojo">Inactivo</Etiqueta>}</td>
                    <td className="space-x-1 text-right whitespace-nowrap">
                      <Boton variante="fantasma" onClick={() => setReset({ perfil: p, password: '' })}>
                        Restablecer clave
                      </Boton>
                      {p.id !== yo?.id && (
                        <Boton variante="secundario" onClick={() => cambiarEstado(p)}>
                          {p.activo ? 'Desactivar' : 'Activar'}
                        </Boton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <Modal titulo="Nuevo administrador del sistema" abierto={!!nuevo} onCerrar={() => setNuevo(null)} ancho="max-w-md">
        {nuevo && (
          <form onSubmit={crear} className="space-y-4">
            <Campo etiqueta="Nombre completo" ayuda="Nombre de la persona.">
              <input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} required maxLength={100} />
            </Campo>
            <Campo etiqueta="Usuario" ayuda="3 a 40 caracteres: letras, números, punto o guion.">
              <input value={nuevo.usuario} onChange={(e) => setNuevo({ ...nuevo, usuario: e.target.value })} required pattern="[A-Za-z0-9._\-]{3,40}" />
            </Campo>
            <Campo etiqueta="Contraseña inicial" ayuda="Mínimo 8 caracteres. No se envía ningún correo.">
              <input type="text" value={nuevo.password} onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })} required minLength={8} />
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
