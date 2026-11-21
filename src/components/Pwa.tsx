// PWA: registra el service worker, avisa cuando hay una versión nueva
// y ofrece "Instalar app" (Android/Chrome/Edge) o explica cómo hacerlo en iPhone.
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
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
      <div role="status" className="no-imprimir fixed inset-x-4 bottom-[calc(var(--alto-nav)+1rem)] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-tinta p-4 text-sm text-papel shadow-xl md:bottom-24">
        <span className="flex-1">Hay una nueva versión de CuentaVecina.</span>
        <button className="min-h-11 rounded-xl bg-resaltador px-4 font-bold text-tinta" onClick={() => updateServiceWorker(true)}>
          Actualizar
        </button>
        <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-papel/80 hover:bg-white/10" aria-label="Más tarde" onClick={() => setHayVersionNueva(false)}>
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
    )
  }

  if (yaInstalada || oculto || (!eventoInstalar && !esIOS)) return null

  return (
    <div className="no-imprimir fixed inset-x-4 bottom-[calc(var(--alto-nav)+1rem)] z-40 mx-auto flex max-w-md items-start gap-3 rounded-2xl bg-tinta p-4 text-sm text-papel shadow-xl md:bottom-24">
      <img src="/icons/icono-192.png" alt="" className="h-10 w-10 rounded-lg" />
      <div className="flex-1">
        <p className="font-bold">Instala CuentaVecina en tu celular</p>
        {eventoInstalar ? (
          <p className="text-papel/80">Ábrela como una app, sin buscarla en el navegador, y recibe tus recordatorios de pago.</p>
        ) : (
          <p className="text-papel/80">
            En iPhone: toca <strong>Compartir</strong> y luego <strong>Agregar a pantalla de inicio</strong>. Así también recibirás avisos.
          </p>
        )}
        {eventoInstalar && (
          <button className="mt-2 min-h-11 rounded-xl bg-resaltador px-4 font-bold text-tinta" onClick={instalar}>
            Instalar app
          </button>
        )}
      </div>
      <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-papel/80 hover:bg-white/10" aria-label="Cerrar" onClick={ocultar}>
        <X aria-hidden="true" className="size-5" />
      </button>
    </div>
  )
}
