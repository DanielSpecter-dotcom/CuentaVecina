/// <reference lib="webworker" />
// Service worker de CuentaVecina (lo compila vite-plugin-pwa con la estrategia injectManifest).
//  1. Guarda en caché la app (HTML, JS, CSS, íconos) para que abra rápido e incluso sin internet.
//  2. NO guarda datos de Supabase: los montos y deudas siempre se piden al servidor.
//  3. Recibe notificaciones push (recordatorios de pago, pago registrado, nueva compra).
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Es una SPA: cualquier ruta (/tienda, /mi-cuenta…) se sirve con index.html desde la caché.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

// La app pide permiso al usuario antes de actualizarse (ver components/Pwa.tsx).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
clientsClaim()

interface DatosPush {
  titulo?: string
  cuerpo?: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  let datos: DatosPush = {}
  try {
    datos = event.data?.json() ?? {}
  } catch {
    datos = { cuerpo: event.data?.text() }
  }
  event.waitUntil(
    self.registration.showNotification(datos.titulo ?? 'CuentaVecina', {
      body: datos.cuerpo ?? '',
      icon: '/icons/icono-192.png',
      badge: '/icons/insignia-96.png',
      tag: datos.tag,
      data: { url: datos.url ?? '/' },
      lang: 'es-PE',
    }),
  )
})

// Al tocar la notificación: enfoca la app si ya está abierta, o la abre en la pantalla indicada.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destino = new URL((event.notification.data as { url?: string })?.url ?? '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const v of ventanas) {
        if ('focus' in v) {
          await v.focus()
          if ('navigate' in v) await (v as WindowClient).navigate(destino)
          return
        }
      }
      await self.clients.openWindow(destino)
    })(),
  )
})
