// Componentes de interfaz reutilizables.
// <Campo ayuda="..."> muestra un botón "?" que despliega la explicación de cada campo
// (requisito del enunciado: ayuda en cada campo de las ventanas de diálogo).
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from 'react'
import { cloneElement, isValidElement } from 'react'

export function Campo({
  etiqueta,
  ayuda,
  error,
  opcional,
  children,
  className = '',
}: {
  etiqueta: string
  ayuda?: string
  error?: string | null
  /** Agrega "(opcional)" a la etiqueta para que se distinga de un vistazo. */
  opcional?: boolean
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>
  className?: string
}) {
  const id = useId()
  const [verAyuda, setVerAyuda] = useState(false)
  // La ayuda siempre describe al control (lectores de pantalla); visualmente se despliega con "?".
  const describedBy = [ayuda && `${id}-ayuda`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  const control = isValidElement(children)
    ? cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })
    : children
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <div className="flex items-center gap-1">
        <label htmlFor={id} className="text-sm font-medium text-stone-700">
          {etiqueta}
          {opcional && <span className="font-normal text-stone-600"> (opcional)</span>}
        </label>
        {ayuda && (
          <button
            type="button"
            aria-label={`Ayuda sobre ${etiqueta}`}
            aria-expanded={verAyuda}
            aria-controls={`${id}-ayuda`}
            className={`no-imprimir inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
              verAyuda ? 'bg-marca-700 text-white' : 'bg-stone-200 text-stone-700 hover:bg-marca-100 hover:text-marca-900'
            }`}
            onClick={() => setVerAyuda((v) => !v)}
          >
            ?
          </button>
        )}
      </div>
      {ayuda && (
        <p id={`${id}-ayuda`} hidden={!verAyuda} className="rounded-md bg-marca-50 px-2.5 py-1.5 text-xs leading-relaxed text-marca-900">
          {ayuda}
        </p>
      )}
      {control}
      {error && (
        <span id={`${id}-error`} className="text-xs font-medium text-red-700">
          {error}
        </span>
      )}
    </div>
  )
}

type Variante = 'primario' | 'secundario' | 'peligro' | 'fantasma'
const estilos: Record<Variante, string> = {
  primario: 'bg-marca-700 text-white hover:bg-marca-800 disabled:bg-stone-200 disabled:text-stone-600',
  secundario: 'border border-stone-400 bg-white text-stone-800 hover:bg-stone-100 disabled:text-stone-600',
  peligro: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-stone-200 disabled:text-stone-600',
  fantasma: 'text-marca-800 hover:bg-marca-50 disabled:text-stone-600',
}

export function Boton({
  variante = 'primario',
  cargando,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; cargando?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || cargando}
      aria-busy={cargando || undefined}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${estilos[variante]} ${className}`}
    >
      {cargando ? 'Procesando…' : children}
    </button>
  )
}

export function Tarjeta({ titulo, acciones, children, className = '' }: {
  titulo?: ReactNode
  acciones?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`min-w-0 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {(titulo || acciones) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {titulo && <h2 className="text-lg font-semibold">{titulo}</h2>}
          {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Alerta({ tipo = 'error', children }: { tipo?: 'error' | 'exito' | 'info'; children: ReactNode }) {
  const c = {
    error: 'border-red-300 bg-red-50 text-red-900',
    exito: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    info: 'border-sky-300 bg-sky-50 text-sky-900',
  }[tipo]
  // Los errores se anuncian de inmediato; los avisos, sin interrumpir.
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${c}`}>
      {children}
    </div>
  )
}

/** Diálogo nativo: el navegador da foco atrapado, cierre con Escape y fondo inerte. */
export function Modal({ titulo, abierto, onCerrar, children, ancho = 'max-w-2xl' }: {
  titulo: string
  abierto: boolean
  onCerrar: () => void
  children: ReactNode
  ancho?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const idTitulo = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (abierto && !d.open) d.showModal()
    if (!abierto && d.open) d.close()
  }, [abierto])
  return (
    <dialog
      ref={ref}
      onClose={() => abierto && onCerrar()}
      aria-labelledby={idTitulo}
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] ${ancho} overflow-y-auto rounded-2xl bg-white p-0 text-stone-800 shadow-xl backdrop:bg-stone-900/50`}
    >
      {abierto && (
        <>
          <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-5 py-4">
            <h3 id={idTitulo} className="text-lg font-semibold">
              {titulo}
            </h3>
            <button
              type="button"
              onClick={onCerrar}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-2xl text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              aria-label="Cerrar"
            >
              ×
            </button>
          </header>
          <div className="p-5">{children}</div>
        </>
      )}
    </dialog>
  )
}

export function Etiqueta({ color = 'gris', children }: { color?: 'gris' | 'verde' | 'rojo' | 'ambar' | 'azul'; children: ReactNode }) {
  const c = {
    gris: 'bg-stone-100 text-stone-800',
    verde: 'bg-emerald-100 text-emerald-900',
    rojo: 'bg-red-100 text-red-900',
    ambar: 'bg-amber-100 text-amber-900',
    azul: 'bg-sky-100 text-sky-900',
  }[color]
  // Los estados llegan de la BD en minúsculas ("pendiente") o mayúsculas ("PENDIENTE"): se muestran siempre como "Pendiente".
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap lowercase first-letter:uppercase ${c}`}>{children}</span>
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-stone-600">{children}</p>
}

export function Dato({ etiqueta, valor, destacado }: { etiqueta: string; valor: ReactNode; destacado?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-stone-600">{etiqueta}</dt>
      <dd className={`tabular-nums ${destacado ? 'text-lg font-semibold text-marca-800' : 'font-medium'}`}>{valor}</dd>
    </div>
  )
}
