// Campana de notificaciones: muestra los avisos del usuario (nueva compra, pago recibido,
// recordatorios, vencidos, resumen de cobranza) y se actualiza al instante con Supabase Realtime.
// Desde aquí también se activan las notificaciones push del celular.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { activarPush, desactivarPush, estadoPush, type EstadoPush } from '../lib/push'
import { mensajeError, supabase } from '../lib/supabase'
import type { Notificacion } from '../types'

const ICONO: Record<Notificacion['tipo'], string> = {
  VENTA: '🛒',
  PAGO: '✅',
  RECORDATORIO: '⏰',
  VENCIDO: '⚠️',
  RESUMEN: '📋',
  SISTEMA: 'ℹ️',
}

function hace(fecha: string): string {
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
}

export function Notificaciones() {
  const { perfil } = useAuth()
  const navegar = useNavigate()
  const [lista, setLista] = useState<Notificacion[]>([])
  const [abierta, setAbierta] = useState(false)
  const [push, setPush] = useState<EstadoPush>('no-soportado')
  const [error, setError] = useState<string | null>(null)
  const [nueva, setNueva] = useState<Notificacion | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('notificaciones').select('*').order('created_at', { ascending: false }).limit(30)
    setLista((data as Notificacion[]) ?? [])
  }, [])

  useEffect(() => {
    if (!perfil) return
    cargar()
    estadoPush().then(setPush)
    // Aviso en vivo: Realtime respeta RLS, así que solo llegan las notificaciones propias.
    const canal = supabase
      .channel(`notificaciones:${perfil.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `perfil_id=eq.${perfil.id}` },
        (cambio) => {
          const n = cambio.new as Notificacion
          setLista((l) => [n, ...l].slice(0, 30))
          setNueva(n)
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [perfil, cargar])

  // El aviso flotante desaparece solo.
  useEffect(() => {
    if (!nueva) return
    const t = setTimeout(() => setNueva(null), 6000)
    return () => clearTimeout(t)
  }, [nueva])

  // Cerrar el panel al hacer clic fuera.
  useEffect(() => {
    if (!abierta) return
    const cerrar = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setAbierta(false)
    }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierta])

  const sinLeer = lista.filter((n) => !n.leida).length

  async function abrir(n: Notificacion) {
    if (!n.leida) {
      setLista((l) => l.map((x) => (x.id === n.id ? { ...x, leida: true } : x)))
      await supabase.from('notificaciones').update({ leida: true }).eq('id', n.id)
    }
    setAbierta(false)
    setNueva(null)
    if (n.url) navegar(n.url)
  }

  async function marcarTodas() {
    setLista((l) => l.map((x) => ({ ...x, leida: true })))
    await supabase.from('notificaciones').update({ leida: true }).eq('leida', false)
  }

  async function cambiarPush() {
    setError(null)
    try {
      if (push === 'activo') await desactivarPush()
      else await activarPush()
    } catch (e) {
      setError(mensajeError(e))
    }
    setPush(await estadoPush())
  }

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-label={sinLeer ? `Notificaciones: ${sinLeer} sin leer` : 'Notificaciones'}
        aria-expanded={abierta}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-xl hover:bg-stone-100"
      >
        <span aria-hidden="true">🔔</span>
        {sinLeer > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-xs leading-5 font-bold text-white">
            {sinLeer > 9 ? '9+' : sinLeer}
          </span>
        )}
      </button>

      {abierta && (
        <div className="fixed inset-x-3 top-16 z-40 rounded-2xl border border-stone-200 bg-white text-left shadow-xl sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-[22rem]">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <h2 className="text-base font-semibold">Notificaciones</h2>
            {sinLeer > 0 && (
              <button className="text-xs font-medium text-marca-800 hover:underline" onClick={marcarTodas}>
                Marcar todas como leídas
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {lista.length === 0 && <li className="px-4 py-8 text-center text-sm text-stone-500">No tienes notificaciones.</li>}
            {lista.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => abrir(n)}
                  className={`flex w-full gap-3 border-b border-stone-100 px-4 py-3 text-left hover:bg-stone-50 ${n.leida ? '' : 'bg-marca-50/60'}`}
                >
                  <span aria-hidden="true" className="text-lg">
                    {ICONO[n.tipo]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={`text-sm ${n.leida ? 'font-medium' : 'font-bold'}`}>{n.titulo}</span>
                      <span className="shrink-0 text-xs text-stone-500">{hace(n.created_at)}</span>
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-stone-600">{n.cuerpo}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="space-y-2 px-4 py-3 text-xs text-stone-600">
            {push === 'no-soportado' && <p>Este navegador no admite avisos en el celular.</p>}
            {push === 'no-configurado' && <p>Los avisos en el celular aún no están configurados (falta la llave VAPID).</p>}
            {push === 'bloqueado' && <p>Bloqueaste las notificaciones de esta página. Actívalas en la configuración del navegador.</p>}
            {(push === 'activo' || push === 'inactivo') && (
              <button
                onClick={cambiarPush}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 font-medium text-stone-800 hover:bg-stone-50"
              >
                {push === 'activo' ? '🔕 Dejar de recibir avisos en este dispositivo' : '📲 Recibir avisos en este dispositivo'}
              </button>
            )}
            {error && <p className="text-red-700">{error}</p>}
          </div>
        </div>
      )}

      {nueva && !abierta && (
        <button
          onClick={() => abrir(nueva)}
          role="status"
          className="fixed top-20 right-4 z-50 flex max-w-sm gap-3 rounded-2xl border border-marca-200 bg-white p-4 text-left shadow-xl"
        >
          <span aria-hidden="true" className="text-xl">
            {ICONO[nueva.tipo]}
          </span>
          <span>
            <span className="block text-sm font-bold">{nueva.titulo}</span>
            <span className="block text-xs text-stone-600">{nueva.cuerpo}</span>
          </span>
        </button>
      )}
    </div>
  )
}
