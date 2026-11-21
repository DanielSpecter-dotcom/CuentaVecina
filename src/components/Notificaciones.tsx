// Campana de notificaciones: muestra los avisos del usuario (nueva compra, pago recibido,
// recordatorios, vencidos, resumen de cobranza) y se actualiza al instante con Supabase Realtime.
// Desde aquí también se activan las notificaciones push del celular.
import { AlarmClock, Bell, BellOff, BellRing, CircleAlert, CircleCheck, ClipboardList, Info, ShoppingBag, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { activarPush, desactivarPush, estadoPush, type EstadoPush } from '../lib/push'
import { mensajeError, supabase } from '../lib/supabase'
import type { Notificacion } from '../types'

// Ícono y color por tipo de aviso (Lucide).
const ICONO: Record<Notificacion['tipo'], { icono: LucideIcon; color: string }> = {
  VENTA: { icono: ShoppingBag, color: 'bg-cuota-suave text-tinta' },
  PAGO: { icono: CircleCheck, color: 'bg-pagado-suave text-pagado' },
  RECORDATORIO: { icono: AlarmClock, color: 'bg-resaltador-suave text-tinta' },
  VENCIDO: { icono: CircleAlert, color: 'bg-vencido-suave text-vencido' },
  RESUMEN: { icono: ClipboardList, color: 'bg-papel-borde text-tinta' },
  SISTEMA: { icono: Info, color: 'bg-papel-borde text-tinta' },
}

function IconoAviso({ tipo }: { tipo: Notificacion['tipo'] }) {
  const { icono: Icono, color } = ICONO[tipo] ?? ICONO.SISTEMA
  return (
    <span aria-hidden="true" className={`flex size-9 shrink-0 items-center justify-center rounded-full ${color}`}>
      <Icono className="size-5" />
    </span>
  )
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

  // Cerrar el panel al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!abierta) return
    const cerrar = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setAbierta(false)
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setAbierta(false)
    document.addEventListener('mousedown', cerrar)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', cerrar)
      document.removeEventListener('keydown', escape)
    }
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
        className="relative flex h-11 w-11 items-center justify-center rounded-xl text-tinta hover:bg-papel-borde/60"
      >
        <Bell aria-hidden="true" className="size-6" strokeWidth={2.25} />
        {sinLeer > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-5 rounded-full bg-vencido px-1 text-center text-xs leading-5 font-bold text-white">
            {sinLeer > 9 ? '9+' : sinLeer}
          </span>
        )}
      </button>

      {abierta && (
        <>
          {/* Celular: hoja inferior con fondo oscurecido. */}
          <div aria-hidden="true" className="fixed inset-0 z-40 bg-tinta/60 sm:hidden" onClick={() => setAbierta(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-3xl border border-papel-borde bg-papel pb-[env(safe-area-inset-bottom)] text-left shadow-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:mt-2 sm:max-h-none sm:w-[22rem] sm:rounded-2xl sm:pb-0">
          <div aria-hidden="true" className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-papel-borde sm:hidden" />
          <div className="flex items-center justify-between gap-2 border-b border-papel-borde px-4 py-2">
            <h2 className="text-lg font-bold">Notificaciones</h2>
            {sinLeer > 0 && (
              <button className="min-h-11 text-sm font-bold underline underline-offset-4" onClick={marcarTodas}>
                Marcar todas como leídas
              </button>
            )}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto sm:max-h-96">
            {lista.length === 0 && <li className="px-4 py-8 text-center text-sm text-tinta-suave">No tienes notificaciones.</li>}
            {lista.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => abrir(n)}
                  className={`flex min-h-14 w-full gap-3 border-b border-papel-borde px-4 py-3 text-left hover:bg-papel-borde/40 ${n.leida ? '' : 'bg-resaltador-suave'}`}
                >
                  <IconoAviso tipo={n.tipo} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={`text-sm ${n.leida ? 'font-medium' : 'font-bold'}`}>{n.titulo}</span>
                      <span className="shrink-0 text-xs text-tinta-suave">{hace(n.created_at)}</span>
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-tinta-suave">{n.cuerpo}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="space-y-2 px-4 py-3 text-xs text-tinta-suave">
            {push === 'no-soportado' && <p>Este navegador no admite avisos en el celular.</p>}
            {push === 'no-configurado' && <p>Los avisos en el celular aún no están disponibles.</p>}
            {push === 'bloqueado' && <p>Bloqueaste las notificaciones de esta página. Actívalas en la configuración del navegador.</p>}
            {(push === 'activo' || push === 'inactivo') && (
              <button
                onClick={cambiarPush}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-tinta bg-white px-3 py-2 text-sm font-bold text-tinta hover:bg-papel-borde/40"
              >
                {push === 'activo' ? <BellOff aria-hidden="true" className="size-4 shrink-0" /> : <BellRing aria-hidden="true" className="size-4 shrink-0" />}
                {push === 'activo' ? 'Dejar de recibir avisos en este dispositivo' : 'Recibir avisos en este dispositivo'}
              </button>
            )}
            {error && <p className="font-bold text-vencido">{error}</p>}
          </div>
          </div>
        </>
      )}

      {nueva && !abierta && (
        <button
          onClick={() => abrir(nueva)}
          role="status"
          className="fixed top-20 right-4 z-50 flex max-w-sm gap-3 rounded-2xl border border-papel-borde bg-white p-4 text-left shadow-xl max-sm:left-4"
        >
          <IconoAviso tipo={nueva.tipo} />
          <span>
            <span className="block text-sm font-bold">{nueva.titulo}</span>
            <span className="block text-xs text-tinta-suave">{nueva.cuerpo}</span>
          </span>
        </button>
      )}
    </div>
  )
}
