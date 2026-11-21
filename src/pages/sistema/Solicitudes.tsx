import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { Alerta, Boton, Campo, Dato, Etiqueta, Modal, PieModal, Vacio } from '../../components/ui'
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

  // Pendientes primero; dentro de cada grupo se mantiene el orden por fecha.
  const ordenadas = [...lista].sort((a, b) => Number(b.estado === 'PENDIENTE') - Number(a.estado === 'PENDIENTE'))

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Solicitudes de alta de negocio</h1>
      {error && !aprobar && !rechazo && <Alerta>{error}</Alerta>}
      {aviso && <Alerta tipo="exito">{aviso}</Alerta>}
      {lista.length === 0 ? (
        <Vacio>No hay solicitudes.</Vacio>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {ordenadas.map((s) => {
            const pendiente = s.estado === 'PENDIENTE'
            return (
              <li
                key={s.id}
                className={`flex flex-col rounded-2xl p-4 ${
                  pendiente ? 'border-2 border-tinta bg-white shadow-[3px_3px_0_var(--color-tinta)]' : 'border-[1.5px] border-dashed border-linea bg-papel'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold">{s.nombre_comercial}</h2>
                    <p className="text-sm text-tinta-suave">
                      {s.giro} · {s.direccion}
                    </p>
                  </div>
                  <Etiqueta color={pendiente ? 'ambar' : s.estado === 'APROBADA' ? 'verde' : 'rojo'}>{s.estado}</Etiqueta>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2.5 text-sm">
                  <Dato etiqueta="RUC" valor={s.ruc} />
                  <Dato etiqueta="Fecha" valor={formatearFecha(s.created_at)} />
                  <Dato
                    etiqueta="Responsable"
                    valor={
                      <>
                        {s.contacto_nombre}
                        <span className="block text-xs font-normal text-tinta-suave">DNI {s.contacto_dni}</span>
                      </>
                    }
                  />
                  <Dato
                    etiqueta="Contacto"
                    valor={
                      <>
                        {s.telefono ?? '—'}
                        {s.correo && <span className="block text-xs font-normal break-all">{s.correo}</span>}
                      </>
                    }
                  />
                </dl>
                {pendiente && (
                  <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
                    <Boton aria-label={`Aprobar ${s.nombre_comercial}`} onClick={() => setAprobar({ s, usuario: s.contacto_dni, password: '' })}>
                      Aprobar
                    </Boton>
                    <Boton variante="secundario" aria-label={`Rechazar ${s.nombre_comercial}`} onClick={() => setRechazo({ s, motivo: '' })}>
                      Rechazar
                    </Boton>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Modal titulo={`Aprobar — ${aprobar?.s.nombre_comercial ?? ''}`} abierto={!!aprobar} onCerrar={() => setAprobar(null)} ancho="max-w-md">
        {aprobar && (
          <form onSubmit={confirmarAprobacion} className="space-y-4">
            {error && <Alerta>{error}</Alerta>}
            <p className="text-sm text-tinta-suave">Se creará la tienda y la cuenta del responsable. No se envía ningún correo: entrega la contraseña en persona.</p>
            <Campo etiqueta="Usuario del responsable" ayuda="Por defecto su DNI.">
              <input value={aprobar.usuario} onChange={(e) => setAprobar({ ...aprobar, usuario: e.target.value })} required pattern="[A-Za-z0-9._\-]{3,40}" />
            </Campo>
            <Campo etiqueta="Contraseña inicial" ayuda="Mínimo 8 caracteres.">
              <input type="text" autoComplete="new-password" value={aprobar.password} onChange={(e) => setAprobar({ ...aprobar, password: e.target.value })} required minLength={8} />
            </Campo>
            <PieModal>
              <Boton type="submit" cargando={guardando} className="w-full">
                Aprobar y crear tienda
              </Boton>
            </PieModal>
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
            <PieModal>
              <Boton type="button" variante="secundario" onClick={() => setRechazo(null)}>
                Cancelar
              </Boton>
              <Boton type="submit" variante="peligro" cargando={guardando}>
                Rechazar solicitud
              </Boton>
            </PieModal>
          </form>
        )}
      </Modal>
    </div>
  )
}
