import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { Alerta, Boton, Campo, Etiqueta, Modal, Tarjeta, Vacio } from '../../components/ui'
import { formatearFecha } from '../../lib/fechas'
import { adminUsuarios, mensajeError, supabase } from '../../lib/supabase'

interface Solicitud {
  id: string
  nombre_comercial: string
  ruc: string
  giro: string
  direccion: string
  telefono: string | null
  correo: string | null
  contacto_nombre: string
  contacto_dni: string
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'
  created_at: string
}

export default function Solicitudes() {
  const [lista, setLista] = useState<Solicitud[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [aprobar, setAprobar] = useState<{ s: Solicitud; usuario: string; password: string } | null>(null)
  const [rechazo, setRechazo] = useState<{ s: Solicitud; motivo: string } | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('solicitudes_tienda').select('*').order('created_at', { ascending: false })
    if (error) setError(mensajeError(error))
    setLista((data as Solicitud[]) ?? [])
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function confirmarAprobacion(e: SubmitEvent) {
    e.preventDefault()
    if (!aprobar) return
    setGuardando(true)
    setError(null)
    try {
      await adminUsuarios({ accion: 'aprobar_solicitud', solicitud_id: aprobar.s.id, usuario: aprobar.usuario, password: aprobar.password })
      setAviso(`Tienda "${aprobar.s.nombre_comercial}" creada. Usuario: ${aprobar.usuario || aprobar.s.contacto_dni}`)
      setAprobar(null)
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  async function confirmarRechazo(e: SubmitEvent) {
    e.preventDefault()
    if (!rechazo) return
    setGuardando(true)
    setError(null)
    const { error } = await supabase
      .from('solicitudes_tienda')
      .update({ estado: 'RECHAZADA', observacion: rechazo.motivo.trim() || null, revisado_at: new Date().toISOString() })
      .eq('id', rechazo.s.id)
    setGuardando(false)
    if (error) return setError(mensajeError(error))
    setAviso(`Solicitud de "${rechazo.s.nombre_comercial}" rechazada.`)
    setRechazo(null)
    cargar()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold sm:text-3xl">Solicitudes de alta de negocio</h1>
      {error && !aprobar && !rechazo && <Alerta>{error}</Alerta>}
      {aviso && <Alerta tipo="exito">{aviso}</Alerta>}
      <Tarjeta>
        {lista.length === 0 ? (
          <Vacio>No hay solicitudes.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Negocio</th>
                  <th>RUC</th>
                  <th>Responsable</th>
                  <th>Contacto</th>
                  <th>Estado</th>
                  <th><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((s) => (
                  <tr key={s.id}>
                    <td>{formatearFecha(s.created_at)}</td>
                    <td>
                      <div className="font-medium">{s.nombre_comercial}</div>
                      <div className="text-xs text-stone-600">
                        {s.giro} · {s.direccion}
                      </div>
                    </td>
                    <td>{s.ruc}</td>
                    <td>
                      {s.contacto_nombre}
                      <div className="text-xs text-stone-600">DNI {s.contacto_dni}</div>
                    </td>
                    <td className="text-xs">
                      <div>{s.telefono ?? '—'}</div>
                      {s.correo && <div className="break-all">{s.correo}</div>}
                    </td>
                    <td>
                      <Etiqueta color={s.estado === 'PENDIENTE' ? 'ambar' : s.estado === 'APROBADA' ? 'verde' : 'rojo'}>{s.estado}</Etiqueta>
                    </td>
                    <td className="space-x-2 text-right whitespace-nowrap">
                      {s.estado === 'PENDIENTE' && (
                        <>
                          <Boton aria-label={`Aprobar ${s.nombre_comercial}`} onClick={() => setAprobar({ s, usuario: s.contacto_dni, password: '' })}>
                            Aprobar
                          </Boton>
                          <Boton variante="secundario" aria-label={`Rechazar ${s.nombre_comercial}`} onClick={() => setRechazo({ s, motivo: '' })}>
                            Rechazar
                          </Boton>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <Modal titulo={`Aprobar — ${aprobar?.s.nombre_comercial ?? ''}`} abierto={!!aprobar} onCerrar={() => setAprobar(null)} ancho="max-w-md">
        {aprobar && (
          <form onSubmit={confirmarAprobacion} className="space-y-4">
            {error && <Alerta>{error}</Alerta>}
            <p className="text-sm text-stone-600">Se creará la tienda y la cuenta del responsable. No se envía ningún correo: entrega la contraseña en persona.</p>
            <Campo etiqueta="Usuario del responsable" ayuda="Por defecto su DNI.">
              <input value={aprobar.usuario} onChange={(e) => setAprobar({ ...aprobar, usuario: e.target.value })} required pattern="[A-Za-z0-9._\-]{3,40}" />
            </Campo>
            <Campo etiqueta="Contraseña inicial" ayuda="Mínimo 8 caracteres.">
              <input type="text" autoComplete="new-password" value={aprobar.password} onChange={(e) => setAprobar({ ...aprobar, password: e.target.value })} required minLength={8} />
            </Campo>
            <Boton type="submit" cargando={guardando} className="w-full">
              Aprobar y crear tienda
            </Boton>
          </form>
        )}
      </Modal>

      <Modal titulo={`Rechazar — ${rechazo?.s.nombre_comercial ?? ''}`} abierto={!!rechazo} onCerrar={() => setRechazo(null)} ancho="max-w-md">
        {rechazo && (
          <form onSubmit={confirmarRechazo} className="space-y-4">
            {error && <Alerta>{error}</Alerta>}
            <Campo etiqueta="Motivo del rechazo" opcional ayuda="Queda registrado en la solicitud. Ayuda a explicarle al negocio qué corregir.">
              <textarea rows={3} maxLength={250} value={rechazo.motivo} onChange={(e) => setRechazo({ ...rechazo, motivo: e.target.value })} />
            </Campo>
            <div className="flex justify-end gap-2">
              <Boton type="button" variante="secundario" onClick={() => setRechazo(null)}>
                Cancelar
              </Boton>
              <Boton type="submit" variante="peligro" cargando={guardando}>
                Rechazar solicitud
              </Boton>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
