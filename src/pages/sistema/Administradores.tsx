import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { Avatar } from '../../components/cuaderno'
import { Alerta, Boton, Campo, Etiqueta, Modal, PieModal, Vacio } from '../../components/ui'
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
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Administradores del sistema</h1>
        <Boton onClick={() => setNuevo({ nombre: '', usuario: '', password: '' })} className="max-sm:w-full">
          + Nuevo administrador
        </Boton>
      </div>
      <p className="text-sm text-tinta-suave">Personas que administran la plataforma: dan de alta tiendas, aprueban solicitudes y cargan las tasas del BCRP.</p>
      {error && <Alerta>{error}</Alerta>}
      {aviso && <Alerta tipo="exito">{aviso}</Alerta>}
      {lista.length === 0 ? (
        <Vacio>Sin administradores.</Vacio>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {lista.map((p) => (
            <li key={p.id} className={`rounded-2xl border border-papel-borde p-4 ${p.activo ? 'bg-white' : 'bg-papel-borde/40'}`}>
              <div className="flex items-center gap-3">
                <Avatar nombre={p.nombre ?? p.usuario ?? ''} activo={p.activo} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    {p.nombre} {p.id === yo?.id && <Etiqueta color="azul">tú</Etiqueta>}
                  </p>
                  <p className="truncate text-sm text-tinta-suave">
                    {p.usuario} · alta {formatearFecha(p.created_at)}
                  </p>
                </div>
                {p.activo ? <Etiqueta color="verde">Activo</Etiqueta> : <Etiqueta color="rojo">Inactivo</Etiqueta>}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Boton variante="fantasma" aria-label={`Restablecer contraseña de ${p.usuario}`} onClick={() => setReset({ perfil: p, password: '' })}>
                  Restablecer clave
                </Boton>
                {p.id !== yo?.id && (
                  <Boton variante="secundario" aria-label={`${p.activo ? 'Desactivar' : 'Activar'} a ${p.usuario}`} onClick={() => cambiarEstado(p)}>
                    {p.activo ? 'Desactivar' : 'Activar'}
                  </Boton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

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
            <Campo etiqueta="Nueva contraseña" ayuda="Mínimo 8 caracteres.">
              <input type="text" value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} required minLength={8} />
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
