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
    <div className="no-imprimir fixed right-4 bottom-4 z-30 flex flex-col items-end gap-3">
      {abierto && (
        <section
          aria-label="Asistente de CuentaVecina"
          className="flex h-128 max-h-[calc(100dvh-6rem)] w-88 max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-stone-200 bg-white shadow-xl"
        >
          <header className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <h2 className="text-lg font-semibold text-marca-800">Asistente</h2>
            <button onClick={() => setAbierto(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-2xl text-stone-600 hover:bg-stone-100" aria-label="Cerrar asistente">
              &times;
            </button>
          </header>
          <div ref={caja} className="flex-1 space-y-3 overflow-y-auto p-4 text-sm" aria-live="polite">
            {mensajes.length === 0 && (
              <p className="text-stone-600">Pregúntame sobre CuentaVecina o tu cuenta: cuánto debes, cuándo pagas, cómo se calculan los intereses…</p>
            )}
            {mensajes.map((m, i) => (
              <p
                key={i}
                className={`max-w-[85%] rounded-2xl px-3 py-2 whitespace-pre-wrap ${
                  m.role === 'user' ? 'ml-auto bg-marca-700 text-white' : 'bg-stone-100 text-stone-800'
                }`}
              >
                {m.content}
              </p>
            ))}
            {cargando && <p className="text-stone-600" role="status">Escribiendo…</p>}
            {error && <p className="text-red-700" role="alert">{error}</p>}
          </div>
          <form onSubmit={enviar} className="flex gap-2 border-t border-stone-100 p-3">
            <input
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
      <button
        onClick={() => setAbierto((v) => !v)}
        className="min-h-12 rounded-full bg-marca-800 px-4 py-3 text-sm font-medium text-white shadow-lg ring-2 ring-white hover:bg-marca-900"
        aria-expanded={abierto}
      >
        <span aria-hidden="true">💬</span> {abierto ? 'Ocultar asistente' : 'Asistente'}
      </button>
    </div>
  )
}
