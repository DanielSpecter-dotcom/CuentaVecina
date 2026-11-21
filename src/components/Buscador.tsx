// Buscador desplegable (combobox accesible) y memoria de "recientes" por tienda.
// Patrón ARIA 1.2: el foco queda en el campo y las flechas mueven la opción activa (aria-activedescendant).
import { ChevronDown, X } from 'lucide-react'
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'

export interface OpcionBuscador {
  id: string
  titulo: string
  detalle?: ReactNode
  /** Texto en el que se busca (por defecto, el título). */
  busqueda?: string
  /** Elemento a la izquierda de la opción (avatar, ícono). */
  inicio?: ReactNode
}

/** Props que Campo inyecta a su control (id, ayuda y error). */
type Control = { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }

const MAX_OPCIONES = 50

export function Buscador({
  opciones,
  valor,
  onChange,
  placeholder,
  vacio = 'Sin resultados',
  ...control
}: {
  opciones: OpcionBuscador[]
  valor: string
  onChange: (id: string) => void
  placeholder?: string
  vacio?: string
} & Control) {
  const idLista = useId()
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)
  const elegido = opciones.find((o) => o.id === valor)

  const t = texto.trim().toLowerCase()
  const coinciden = t ? opciones.filter((o) => (o.busqueda ?? o.titulo).toLowerCase().includes(t)) : opciones
  const lista = coinciden.slice(0, MAX_OPCIONES)
  const idOpcion = (i: number) => `${idLista}-${i}`

  function abrir() {
    setAbierto(true)
    setActivo(Math.max(0, lista.findIndex((o) => o.id === valor)))
  }
  function cerrar() {
    setAbierto(false)
    setTexto('')
  }
  function elegir(o: OpcionBuscador) {
    onChange(o.id)
    cerrar()
  }

  function teclas(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!abierto) return abrir()
      const paso = e.key === 'ArrowDown' ? 1 : -1
      setActivo((a) => (lista.length ? (a + paso + lista.length) % lista.length : 0))
    } else if (e.key === 'Enter' && abierto) {
      e.preventDefault()
      if (lista[activo]) elegir(lista[activo])
    } else if (e.key === 'Escape' && abierto) {
      // Solo cierra la lista (no un diálogo que la contenga).
      e.preventDefault()
      e.stopPropagation()
      cerrar()
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={abierto && lista[activo] ? idOpcion(activo) : undefined}
        autoComplete="off"
        placeholder={elegido ? undefined : placeholder}
        // Cerrado muestra lo elegido; abierto, lo que se escribe para filtrar.
        value={abierto ? texto : (elegido?.titulo ?? '')}
        onChange={(e) => {
          setTexto(e.target.value)
          setActivo(0)
          if (!abierto) setAbierto(true)
        }}
        onFocus={abrir}
        onClick={() => !abierto && abrir()}
        onBlur={cerrar}
        onKeyDown={teclas}
        {...control}
        className="w-full pr-20"
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-tinta-suave">
        <ChevronDown aria-hidden="true" className={`size-5 transition ${abierto ? 'rotate-180' : ''}`} />
      </span>
      {elegido && !abierto && (
        <button
          type="button"
          aria-label={`Quitar ${elegido.titulo}`}
          onClick={() => onChange('')}
          className="absolute inset-y-0 right-9 my-auto flex h-11 w-11 items-center justify-center rounded-lg text-tinta-suave hover:bg-papel-borde/60 hover:text-tinta"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
      <ul
        id={idLista}
        role="listbox"
        hidden={!abierto}
        className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border-[1.5px] border-tinta bg-white py-1 shadow-[3px_3px_0_var(--color-tinta)]"
      >
        {lista.map((o, i) => (
          <li
            key={o.id}
            id={idOpcion(i)}
            role="option"
            aria-selected={o.id === valor}
            // mousedown sin perder el foco del campo (si no, el blur cierra la lista antes del clic).
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActivo(i)}
            onClick={() => elegir(o)}
            className={`flex min-h-12 cursor-pointer items-center gap-3 px-3 py-1.5 ${i === activo ? 'bg-resaltador-suave' : ''} ${o.id === valor ? 'font-bold' : ''}`}
          >
            {o.inicio}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{o.titulo}</span>
              {o.detalle && <span className="block truncate text-xs font-normal text-tinta-suave">{o.detalle}</span>}
            </span>
          </li>
        ))}
        {lista.length === 0 && <li className="px-3 py-3 text-sm text-tinta-suave">{vacio}</li>}
        {coinciden.length > MAX_OPCIONES && (
          <li className="px-3 py-2 text-xs text-tinta-suave">Escribe para ver más ({coinciden.length - MAX_OPCIONES} más)</li>
        )}
      </ul>
    </div>
  )
}

type Registro = { id: string; usos: number; ultimo: number }

function leer(clave: string): Registro[] {
  try {
    const v = JSON.parse(localStorage.getItem(clave) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/**
 * Recientes y más usados de este dispositivo (localStorage, por tienda).
 * Orden: el más reciente primero; a igualdad, el más usado.
 */
export function useRecientes(clave: string, max = 6) {
  const [registros, setRegistros] = useState<Registro[]>(() => leer(clave))
  const [claveLeida, setClaveLeida] = useState(clave)
  // La clave incluye la tienda, que llega después del primer render: se relee al cambiar.
  if (claveLeida !== clave) {
    setClaveLeida(clave)
    setRegistros(leer(clave))
  }

  function registrar(id: string) {
    if (!id) return
    setRegistros((rs) => {
      const previo = rs.find((r) => r.id === id)
      const nuevos = [{ id, usos: (previo?.usos ?? 0) + 1, ultimo: Date.now() }, ...rs.filter((r) => r.id !== id)].slice(0, 30)
      try {
        localStorage.setItem(clave, JSON.stringify(nuevos))
      } catch {
        // Sin almacenamiento (modo privado): los recientes viven solo en esta sesión.
      }
      return nuevos
    })
  }

  const ids = [...registros]
    .sort((a, b) => b.ultimo - a.ultimo || b.usos - a.usos)
    .slice(0, max)
    .map((r) => r.id)
  return { ids, registrar }
}
