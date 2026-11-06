// Componentes de interfaz reutilizables.
// <Campo ayuda="..."> muestra un ícono "?" con la explicación de cada campo
// (requisito del enunciado: ayuda en cada campo de las ventanas de diálogo).
import { useId, useState, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from 'react'
import { cloneElement, isValidElement } from 'react'

export function Ayuda({ texto }: { texto: string }) {
  const [abierta, setAbierta] = useState(false)
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`Ayuda: ${texto}`}
        className="no-imprimir ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-stone-200 text-[10px] font-bold text-stone-600 hover:bg-marca-100 hover:text-marca-800"
        onClick={() => setAbierta((v) => !v)}
        onMouseEnter={() => setAbierta(true)}
        onMouseLeave={() => setAbierta(false)}
        onBlur={() => setAbierta(false)}
      >
        ?
      </button>
      {abierta && (
        <span
          role="tooltip"
          className="absolute top-6 left-1/2 z-30 w-64 -translate-x-1/2 rounded-lg bg-stone-900 px-3 py-2 text-xs leading-relaxed font-normal text-white shadow-lg"
        >
          {texto}
        </span>
      )}
    </span>
  )
}

export function Campo({
  etiqueta,
  ayuda,
  error,
  children,
  className = '',
}: {
  etiqueta: string
  ayuda?: string
  error?: string | null
  children: ReactElement<{ id?: string }>
  className?: string
}) {
  const id = useId()
  const control = isValidElement(children) ? cloneElement(children, { id }) : children
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="flex items-center text-xs font-medium text-stone-600">
        {etiqueta}
        {ayuda && <Ayuda texto={ayuda} />}
      </label>
      {control}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}

type Variante = 'primario' | 'secundario' | 'peligro' | 'fantasma'
const estilos: Record<Variante, string> = {
  primario: 'bg-marca-700 text-white hover:bg-marca-800 disabled:bg-stone-300',
  secundario: 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50',
  peligro: 'bg-red-600 text-white hover:bg-red-700',
  fantasma: 'text-marca-700 hover:bg-marca-50',
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
      {...props}
      disabled={props.disabled || cargando}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${estilos[variante]} ${className}`}
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
    <section className={`rounded-2xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>
      {(titulo || acciones) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {titulo && <h2 className="text-base font-semibold text-stone-800">{titulo}</h2>}
          {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Alerta({ tipo = 'error', children }: { tipo?: 'error' | 'exito' | 'info'; children: ReactNode }) {
  const c = {
    error: 'border-red-200 bg-red-50 text-red-800',
    exito: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    info: 'border-sky-200 bg-sky-50 text-sky-800',
  }[tipo]
  return <div className={`rounded-lg border px-4 py-3 text-sm ${c}`}>{children}</div>
}

export function Modal({ titulo, abierto, onCerrar, children, ancho = 'max-w-2xl' }: {
  titulo: string
  abierto: boolean
  onCerrar: () => void
  children: ReactNode
  ancho?: string
}) {
  if (!abierto) return null
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-stone-900/40 p-4 sm:p-10">
      <div className={`w-full ${ancho} rounded-2xl bg-white shadow-xl`} role="dialog" aria-modal="true" aria-label={titulo}>
        <header className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <h3 className="font-semibold">{titulo}</h3>
          <button onClick={onCerrar} className="rounded-lg px-2 text-xl text-stone-400 hover:bg-stone-100" aria-label="Cerrar">
            ×
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Etiqueta({ color = 'gris', children }: { color?: 'gris' | 'verde' | 'rojo' | 'ambar' | 'azul'; children: ReactNode }) {
  const c = {
    gris: 'bg-stone-100 text-stone-700',
    verde: 'bg-emerald-100 text-emerald-800',
    rojo: 'bg-red-100 text-red-800',
    ambar: 'bg-amber-100 text-amber-800',
    azul: 'bg-sky-100 text-sky-800',
  }[color]
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{children}</span>
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-stone-400">{children}</p>
}

export function Dato({ etiqueta, valor, destacado }: { etiqueta: string; valor: ReactNode; destacado?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-stone-500">{etiqueta}</dt>
      <dd className={destacado ? 'text-lg font-semibold text-marca-800' : 'font-medium'}>{valor}</dd>
    </div>
  )
}
