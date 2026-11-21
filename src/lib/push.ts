// Notificaciones push (Web Push) del navegador o del celular.
// Requisitos: la app servida por HTTPS (o localhost) y la llave pública VAPID en VITE_VAPID_PUBLIC_KEY.
// En iPhone solo funcionan si la app se instaló en la pantalla de inicio (iOS 16.4 o superior).
import { supabase } from './supabase'

const LLAVE_PUBLICA = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type EstadoPush = 'no-soportado' | 'no-configurado' | 'bloqueado' | 'activo' | 'inactivo'

export function pushSoportado(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function llaveABytes(base64: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4)
  const binario = atob((base64 + relleno).replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(binario.length))
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}

async function registro(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSoportado()) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!pushSoportado()) return 'no-soportado'
  if (!LLAVE_PUBLICA) return 'no-configurado'
  if (Notification.permission === 'denied') return 'bloqueado'
  const reg = await registro()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'activo' : 'inactivo'
}

/** Pide permiso, suscribe este dispositivo y lo guarda en Supabase a nombre del usuario actual. */
export async function activarPush(): Promise<void> {
  if (!pushSoportado()) throw new Error('Este navegador no admite notificaciones push.')
  if (!LLAVE_PUBLICA) throw new Error('Falta configurar VITE_VAPID_PUBLIC_KEY.')
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('No diste permiso para mostrar notificaciones.')
  const reg = (await registro()) ?? (await navigator.serviceWorker.ready)
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: llaveABytes(LLAVE_PUBLICA) }))
  const json = sub.toJSON()
  const { error } = await supabase.rpc('registrar_suscripcion_push', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_user_agent: navigator.userAgent,
  })
  if (error) throw error
}

/** Deja de recibir push en este dispositivo (se llama también al cerrar sesión). */
export async function desactivarPush(): Promise<void> {
  const reg = await registro()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.rpc('eliminar_suscripcion_push', { p_endpoint: sub.endpoint })
  await sub.unsubscribe()
}
