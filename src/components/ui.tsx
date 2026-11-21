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
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-sm font-bold text-tinta">
          {etiqueta}
          {opcional && <span className="font-normal text-tinta-suave"> (opcional)</span>}
        </label>
        {ayuda && (
          <button
            type="button"
            aria-label={`Ayuda sobre ${etiqueta}`}
            aria-expanded={verAyuda}
            aria-controls={`${id}-ayuda`}
            // El círculo mide 28 px; el pseudo-elemento amplía el área de toque a 44 px.
            className={`no-imprimir relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold transition after:absolute after:-inset-2 after:content-[''] ${
              verAyuda ? 'bg-tinta text-resaltador' : 'bg-papel-borde text-tinta hover:bg-linea'
            }`}
            onClick={() => setVerAyuda((v) => !v)}
          >
            ?
          </button>
        )}
      </div>
      {ayuda && (
        <p id={`${id}-ayuda`} hidden={!verAyuda} className="rounded-r-lg border-l-[3px] border-resaltador bg-resaltador-suave px-3 py-2 text-[13px] leading-relaxed text-tinta">
          {ayuda}
        </p>
      )}
      {control}
      {error && (
        <span id={`${id}-error`} className="text-sm font-bold text-vencido">
          {error}
        </span>
      )}
    </div>
  )
}

type Variante = 'primario' | 'secundario' | 'peligro' | 'fantasma'
const estilos: Record<Variante, string> = {
  primario: 'bg-tinta text-papel hover:bg-tinta/90 disabled:bg-papel-borde disabled:text-tinta-suave',
  secundario: 'border-[1.5px] border-tinta bg-white text-tinta hover:bg-papel-borde/40 disabled:border-linea disabled:bg-papel-borde disabled:text-tinta-suave',
  peligro: 'bg-vencido text-white hover:bg-vencido/90 disabled:bg-papel-borde disabled:text-tinta-suave',
  fantasma: 'text-tinta underline underline-offset-4 hover:bg-papel-borde/40 disabled:text-tinta-suave',
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
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-2 text-[15px] font-bold transition disabled:cursor-not-allowed ${estilos[variante]} ${className}`}
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
    <section className={`min-w-0 rounded-2xl border border-papel-borde bg-white p-4 sm:p-5 ${className}`}>
      {(titulo || acciones) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {titulo && <h2 className="font-display text-lg font-bold">{titulo}</h2>}
          {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Alerta({ tipo = 'error', children }: { tipo?: 'error' | 'exito' | 'info'; children: ReactNode }) {
  const c = {
    error: 'border-[1.5px] border-vencido bg-vencido-suave text-vencido',
    exito: 'border-[1.5px] border-pagado bg-pagado-suave text-pagado',
    info: 'border-[1.5px] border-dashed border-tinta-suave bg-white text-tinta',
  }[tipo]
  // Los errores se anuncian de inmediato; los avisos, sin interrumpir.
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-sm ${c}`}>
      {children}
    </div>
  )
}

/** Diálogo nativo: el navegador da foco atrapado, cierre con Escape y fondo inerte. En celular se ve como hoja inferior. */
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
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] ${ancho} overflow-y-auto rounded-2xl bg-papel p-0 text-tinta shadow-xl backdrop:bg-tinta/60 max-sm:mt-auto max-sm:mb-0 max-sm:max-h-[92dvh] max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-3xl`}
    >
      {abierto && (
        <>
          <header className="sticky top-0 z-10 border-b border-papel-borde bg-papel px-5 pt-2 pb-3 sm:pt-4">
            <div aria-hidden="true" className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-papel-borde sm:hidden" />
            <div className="flex items-center justify-between gap-3">
              <h3 id={idTitulo} className="font-display text-xl font-extrabold">
                {titulo}
              </h3>
              <button
                type="button"
                onClick={onCerrar}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl text-tinta hover:bg-papel-borde/60"
                aria-label="Cerrar"
              >
                &times;
              </button>
            </div>
          </header>
          <div className="p-5">{children}</div>
        </>
      )}
    </dialog>
  )
}

/** Pie fijo de un formulario dentro de Modal: los botones quedan siempre a la vista. Va como último hijo del form. */
export function PieModal({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-wrap justify-end gap-2 border-t border-papel-borde bg-papel px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] [&>*]:flex-1 sm:[&>*]:flex-none">
      {children}
    </div>
  )
}

export function Etiqueta({ color = 'gris', children }: { color?: 'gris' | 'verde' | 'rojo' | 'ambar' | 'azul'; children: ReactNode }) {
  const c = {
    gris: 'bg-papel-borde text-tinta',
    verde: 'bg-pagado-suave text-pagado',
    rojo: 'bg-vencido-suave text-vencido',
    ambar: 'bg-resaltador text-tinta',
    azul: 'bg-cuota-suave text-tinta',
  }[color]
  // Los estados llegan de la BD en minúsculas ("pendiente") o mayúsculas ("PENDIENTE"): se muestran siempre como "Pendiente".
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap lowercase first-letter:uppercase ${c}`}>{children}</span>
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-tinta-suave">{children}</p>
}

export function Dato({ etiqueta, valor, destacado }: { etiqueta: string; valor: ReactNode; destacado?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-tinta-suave">{etiqueta}</dt>
      <dd className={`tabular-nums ${destacado ? 'font-display text-xl font-extrabold' : 'font-bold'}`}>
        {destacado ? <span className="resaltado">{valor}</span> : valor}
      </dd>
    </div>
  )
}

/** Indicador de carga de pantalla (código de la ruta o datos). */
export function Cargando() {
  return (
    <p role="status" className="p-6 text-sm text-tinta-suave">
      Cargando…
    </p>
  )
}
