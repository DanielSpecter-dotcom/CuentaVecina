import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { X } from 'lucide-react'
import { invocar, mensajeError } from '../lib/supabase'
import { Boton } from './ui'

interface Mensaje {
  role: 'user' | 'assistant'
  content: string
}

const SUGERENCIAS = ['¿Cuánto debo y cuándo pago?', '¿Cómo se calculan los intereses?', '¿Qué pasa si pago tarde?']

/** El modelo a veces responde con **negritas** o *cursivas* de Markdown: negrita real y sin asteriscos sueltos. */
function conNegritas(texto: string) {
  return texto.split(/\*\*(.+?)\*\*/g).map((parte, i) => (i % 2 ? <strong key={i}>{parte}</strong> : parte.replace(/(^|\s)\*(\S[^*\n]*?)\*/g, '$1$2')))
}

/** Chat flotante con el asistente (Edge Function "asistente"). El historial vive solo en memoria. */
export function Asistente() {
  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const caja = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLInputElement>(null)

  // Se abre desde la cabecera (escritorio) o la navegación inferior (móvil): Layout dispara el evento.
  useEffect(() => {
    const abrir = () => setAbierto(true)
    window.addEventListener('abrir-asistente', abrir)
    return () => window.removeEventListener('abrir-asistente', abrir)
  }, [])

  // Al abrir, el foco va a la pregunta; Escape cierra el panel.
  useEffect(() => {
    if (!abierto) return
    // Al cerrar, el foco vuelve al botón que abrió el panel.
    const anterior = document.activeElement as HTMLElement | null
    campo.current?.focus()
    const cerrar = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    window.addEventListener('keydown', cerrar)
    return () => {
      window.removeEventListener('keydown', cerrar)
      anterior?.focus()
    }
  }, [abierto])

  // scrollTop y no scrollIntoView: este también desplaza ventanas/iframes padres y deja la vista en blanco.
  useEffect(() => {
    const el = caja.current
    if (el) el.scrollTop = el.scrollHeight
  }, [mensajes, cargando, error])

  function enviar(e: SubmitEvent) {
    e.preventDefault()
    preguntar(texto.trim())
  }

  async function preguntar(pregunta: string) {
    if (!pregunta || cargando) return
    const lista: Mensaje[] = [...mensajes, { role: 'user', content: pregunta }]
    setMensajes(lista)
    setTexto('')
    setError(null)
    setCargando(true)
    try {
      const { respuesta } = await invocar<{ respuesta: string }>('asistente', { mensajes: lista })
      setMensajes([...lista, { role: 'assistant', content: respuesta }])
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setCargando(false)
    }
  }

  if (!abierto) return null
  return (
    <div className="no-imprimir">
      {/* Celular: fondo oscuro detrás de la hoja; tocarlo cierra el asistente. */}
      <button type="button" aria-label="Cerrar asistente" tabIndex={-1} onClick={() => setAbierto(false)} className="fixed inset-0 z-50 bg-tinta/40 md:hidden" />
      {/* Escritorio: panel flotante amplio abajo a la derecha. Celular: hoja inferior de ~3/4 de pantalla. */}
      <section
        aria-label="Asistente de CuentaVecina"
        className="fixed right-6 bottom-6 z-50 flex h-[min(42rem,calc(100dvh-7rem))] w-[min(28rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-2xl border border-papel-borde bg-papel shadow-2xl lg:w-120 max-md:inset-x-0 max-md:right-auto max-md:bottom-0 max-md:h-[min(75dvh,38rem)] max-md:w-full max-md:rounded-b-none max-md:rounded-t-3xl"
      >
        <header className="flex items-center justify-between gap-3 bg-tinta py-2 pr-2 pl-4 text-papel">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-papel">Asistente</h2>
            <p className="text-xs text-papel-tenue">Solo responde sobre CuentaVecina y tu cuenta</p>
          </div>
          <button onClick={() => setAbierto(false)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-papel hover:bg-white/10" aria-label="Cerrar asistente">
            <X aria-hidden="true" className="size-6" />
          </button>
        </header>
        <div ref={caja} className="flex-1 space-y-3 overflow-y-auto p-4 text-sm md:text-[15px]" aria-live="polite">
          {mensajes.length === 0 && (
            <div className="space-y-3">
              <p className="text-tinta-suave">Pregúntame sobre CuentaVecina o tu cuenta: cuánto debes, cuándo pagas, cómo se calculan los intereses…</p>
              <div className="flex flex-wrap gap-2">
                {SUGERENCIAS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => preguntar(s)}
                    className="min-h-11 rounded-full border-[1.5px] border-linea bg-white px-3.5 text-left text-sm font-bold hover:border-tinta"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {mensajes.map((m, i) => (
            <p
              key={i}
              className={`max-w-[85%] rounded-2xl px-3 py-2 whitespace-pre-wrap ${
                m.role === 'user' ? 'ml-auto bg-tinta text-papel' : 'border border-papel-borde bg-white text-tinta'
              }`}
            >
              {m.role === 'assistant' ? conNegritas(m.content) : m.content}
            </p>
          ))}
          {cargando && <p className="text-tinta-suave" role="status">Escribiendo…</p>}
          {error && <p className="font-bold text-vencido" role="alert">{error}</p>}
        </div>
        <form onSubmit={enviar} className="flex gap-2 border-t border-papel-borde p-3 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <input
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribe tu pregunta"
            aria-label="Pregunta"
            maxLength={2000}
            className="min-w-0 flex-1"
          />
          <Boton type="submit" disabled={cargando || !texto.trim()} className="px-3">
            Enviar
          </Boton>
        </form>
      </section>
    </div>
  )
}
