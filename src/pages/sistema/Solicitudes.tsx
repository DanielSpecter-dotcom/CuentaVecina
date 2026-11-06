import { useCallback, useEffect, useState, type FormEvent } from 'react'
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
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('solicitudes_tienda').select('*').order('created_at', { ascending: false })
    if (error) setError(mensajeError(error))
    setLista((data as Solicitud[]) ?? [])
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function confirmarAprobacion(e: FormEvent) {
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

  async function rechazar(s: Solicitud) {
    const motivo = prompt('Motivo del rechazo (opcional):') ?? ''
    const { error } = await supabase
      .from('solicitudes_tienda')
      .update({ estado: 'RECHAZADA', observacion: motivo.slice(0, 250) || null, revisado_at: new Date().toISOString() })
      .eq('id', s.id)
    if (error) setError(mensajeError(error))
    else cargar()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Solicitudes de alta de negocio</h1>
      {error && <Alerta>{error}</Alerta>}
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((s) => (
                  <tr key={s.id}>
                    <td>{formatearFecha(s.created_at)}</td>
                    <td>
                      <div className="font-medium">{s.nombre_comercial}</div>
                      <div className="text-xs text-stone-500">
                        {s.giro} · {s.direccion}
                      </div>
                    </td>
                    <td>{s.ruc}</td>
                    <td>
                      {s.contacto_nombre}
                      <div className="text-xs text-stone-500">DNI {s.contacto_dni}</div>
                    </td>
                    <td className="text-xs">
                      {s.telefono}
                      <br />
                      {s.correo}
                    </td>
                    <td>
                      <Etiqueta color={s.estado === 'PENDIENTE' ? 'ambar' : s.estado === 'APROBADA' ? 'verde' : 'rojo'}>{s.estado}</Etiqueta>
                    </td>
                    <td className="space-x-2 text-right whitespace-nowrap">
                      {s.estado === 'PENDIENTE' && (
                        <>
                          <Boton onClick={() => setAprobar({ s, usuario: s.contacto_dni, password: '' })}>Aprobar</Boton>
                          <Boton variante="secundario" onClick={() => rechazar(s)}>
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
            <p className="text-sm text-stone-600">Se creará la tienda y la cuenta del responsable. No se envía ningún correo: entrega la contraseña en persona.</p>
            <Campo etiqueta="Usuario del responsable" ayuda="Por defecto su DNI.">
              <input value={aprobar.usuario} onChange={(e) => setAprobar({ ...aprobar, usuario: e.target.value })} required pattern="[A-Za-z0-9._\-]{3,40}" />
            </Campo>
            <Campo etiqueta="Contraseña inicial" ayuda="Mínimo 8 caracteres.">
              <input type="text" value={aprobar.password} onChange={(e) => setAprobar({ ...aprobar, password: e.target.value })} required minLength={8} />
            </Campo>
            <Boton type="submit" cargando={guardando} className="w-full">
              Aprobar y crear tienda
            </Boton>
          </form>
        )}
      </Modal>
    </div>
  )
}
