import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { invocar, mensajeError } from '../lib/supabase'
import { Boton } from './ui'

interface Mensaje {
  role: 'user' | 'assistant'
  content: string
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

  async function enviar(e: SubmitEvent) {
    e.preventDefault()
    const pregunta = texto.trim()
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

  return (
    <div className="no-imprimir fixed right-4 bottom-4 z-40 flex flex-col items-end gap-3 max-md:inset-x-0 max-md:bottom-0">
      {abierto && (
        <section
          aria-label="Asistente de CuentaVecina"
          className="flex h-128 max-h-[calc(100dvh-6rem)] w-88 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-papel-borde bg-papel shadow-xl max-md:h-[92dvh] max-md:max-h-none max-md:w-full max-md:max-w-none max-md:rounded-b-none max-md:rounded-t-3xl"
        >
          <header className="flex items-center justify-between bg-tinta px-4 py-2 text-papel">
            <h2 className="text-lg font-bold text-papel">Asistente</h2>
            <button onClick={() => setAbierto(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-2xl text-papel hover:bg-white/10" aria-label="Cerrar asistente">
              &times;
            </button>
          </header>
          <div ref={caja} className="flex-1 space-y-3 overflow-y-auto p-4 text-sm" aria-live="polite">
            {mensajes.length === 0 && (
              <p className="text-tinta-suave">Pregúntame sobre CuentaVecina o tu cuenta: cuánto debes, cuándo pagas, cómo se calculan los intereses…</p>
            )}
            {mensajes.map((m, i) => (
              <p
                key={i}
                className={`max-w-[85%] rounded-2xl px-3 py-2 whitespace-pre-wrap ${
                  m.role === 'user' ? 'ml-auto bg-tinta text-papel' : 'border border-papel-borde bg-white text-tinta'
                }`}
              >
                {m.content}
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
      )}
    </div>
  )
}
