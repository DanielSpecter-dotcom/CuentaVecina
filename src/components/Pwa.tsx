// PWA: registra el service worker, avisa cuando hay una versión nueva
// y ofrece "Instalar app" (Android/Chrome/Edge) o explica cómo hacerlo en iPhone.
import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

interface EventoInstalar extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const CLAVE_OCULTO = 'cv-instalar-oculto'

function leerOculto(): boolean {
  try {
    return localStorage.getItem(CLAVE_OCULTO) === '1'
  } catch {
    return false
  }
}

const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
const yaInstalada = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && navigator.standalone === true)

export function Pwa() {
  const {
    needRefresh: [hayVersionNueva, setHayVersionNueva],
    updateServiceWorker,
  } = useRegisterSW()
  const [eventoInstalar, setEventoInstalar] = useState<EventoInstalar | null>(null)
  const [oculto, setOculto] = useState(leerOculto)

  useEffect(() => {
    const guardar = (e: Event) => {
      e.preventDefault()
      setEventoInstalar(e as EventoInstalar)
    }
    window.addEventListener('beforeinstallprompt', guardar)
    return () => window.removeEventListener('beforeinstallprompt', guardar)
  }, [])

  function ocultar() {
    setOculto(true)
    try {
      localStorage.setItem(CLAVE_OCULTO, '1')
    } catch {
      /* sin almacenamiento: se vuelve a mostrar la próxima vez */
    }
  }

  async function instalar() {
    if (!eventoInstalar) return
    await eventoInstalar.prompt()
    await eventoInstalar.userChoice
    setEventoInstalar(null)
  }

  if (hayVersionNueva) {
    return (
      <div role="status" className="no-imprimir fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-stone-900 p-4 text-sm text-white shadow-xl">
        <span className="flex-1">Hay una nueva versión de CuentaVecina.</span>
        <button className="rounded-lg bg-white px-3 py-1.5 font-semibold text-stone-900" onClick={() => updateServiceWorker(true)}>
          Actualizar
        </button>
        <button className="px-2 text-stone-300" aria-label="Más tarde" onClick={() => setHayVersionNueva(false)}>
          ×
        </button>
      </div>
    )
  }

  if (yaInstalada || oculto || (!eventoInstalar && !esIOS)) return null

  return (
    <div className="no-imprimir fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-marca-200 bg-white p-4 text-sm shadow-xl">
      <img src="/icons/icono-192.png" alt="" className="h-10 w-10 rounded-lg" />
      <div className="flex-1">
        <p className="font-semibold">Instala CuentaVecina en tu celular</p>
        {eventoInstalar ? (
          <p className="text-stone-600">Ábrela como una app, sin buscarla en el navegador, y recibe tus recordatorios de pago.</p>
        ) : (
          <p className="text-stone-600">
            En iPhone: toca <strong>Compartir</strong> y luego <strong>Agregar a pantalla de inicio</strong>. Así también recibirás avisos.
          </p>
        )}
        {eventoInstalar && (
          <button className="mt-2 rounded-lg bg-marca-700 px-3 py-1.5 font-semibold text-white" onClick={instalar}>
            Instalar app
          </button>
        )}
      </div>
      <button className="px-1 text-xl text-stone-400" aria-label="Cerrar" onClick={ocultar}>
        ×
      </button>
    </div>
  )
}
