// Piezas del rediseño "Cuaderno": hoja con renglones de 56 px, sellos, controles táctiles grandes.
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { describirTasa, moneda } from '../lib/codigos'
import { formatearFecha } from '../lib/fechas'
import { dinero } from '../lib/formato'
import type { Cliente } from '../types'
import { Campo, Dato } from './ui'

/** Props que Campo inyecta a su control (id, ayuda y error). */
type Control = { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']

/** Fecha para la columna de margen: "05 / nov". Con `repetida`, "〃" (misma fecha que el renglón anterior). */
export function MargenFecha({ fecha, repetida }: { fecha: string; repetida?: boolean }) {
  const [, m, d] = fecha.slice(0, 10).split('-')
  return (
    <>
      <span aria-hidden="true">
        {repetida ? (
          '〃'
        ) : (
          <>
            {d}
            <br />
            {MESES[Number(m) - 1]}
          </>
        )}
      </span>
      <span className="sr-only">{formatearFecha(fecha)}</span>
    </>
  )
}

/** Contenedor de listas tipo cuaderno: margen rojo y renglones de 56 px. Los renglones van dentro de un <ul>. */
export function Hoja({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`renglones border-t border-renglon max-sm:-mx-4 ${className}`}>{children}</div>
}

export function Renglon({
  margen,
  tonoMargen = 'normal',
  titulo,
  detalle,
  monto,
  tonoMonto = 'normal',
  href,
  onClick,
  className = '',
}: {
  margen?: ReactNode
  tonoMargen?: 'normal' | 'vencido' | 'hoy'
  titulo: ReactNode
  detalle?: ReactNode
  monto?: ReactNode
  tonoMonto?: 'normal' | 'vencido'
  href?: string
  onClick?: () => void
  className?: string
}) {
  const contenido = (
    <>
      <span className={`flex w-11 shrink-0 justify-center text-center text-xs leading-tight font-bold ${tonoMargen === 'vencido' ? 'text-vencido' : ''}`}>
        {tonoMargen === 'hoy' ? <span className="rounded-full bg-resaltador px-1.5 py-0.5 text-tinta">{margen}</span> : margen}
      </span>
      <span className="min-w-0 flex-1 pl-4">
        <span className="block truncate font-bold">{titulo}</span>
        {detalle && <span className="block truncate text-xs text-tinta-suave">{detalle}</span>}
      </span>
      {monto != null && (
        <span className={`shrink-0 pr-4 pl-2 text-right font-bold tabular-nums ${tonoMonto === 'vencido' ? 'text-vencido' : ''}`}>{monto}</span>
      )}
    </>
  )
  const base = 'flex h-14 w-full items-center text-left'
  return (
    <li className={className}>
      {href ? (
        <Link to={href} className={`${base} hover:bg-resaltador-suave/70`}>
          {contenido}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={`${base} hover:bg-resaltador-suave/70`}>
          {contenido}
        </button>
      ) : (
        <div className={base}>{contenido}</div>
      )}
    </li>
  )
}

export function RenglonTitulo({ titulo, subtitulo }: { titulo: ReactNode; subtitulo?: ReactNode }) {
  return (
    <div className="flex h-14 flex-col justify-center pr-4 pl-15">
      <h2 className="truncate font-display text-xl leading-tight font-bold">{titulo}</h2>
      {subtitulo && <p className="truncate text-xs text-tinta-suave">{subtitulo}</p>}
    </div>
  )
}

export function RenglonTotal({ children, etiqueta = 'Total' }: { children: ReactNode; etiqueta?: ReactNode }) {
  return (
    <div className="flex h-14 items-center justify-between gap-3 pr-4 pl-15">
      <span className="font-bold">{etiqueta}</span>
      <span className="border-b-[3px] border-double border-tinta font-bold tabular-nums">{children}</span>
    </div>
  )
}

export function MontoGrande({ children }: { children: ReactNode }) {
  return (
    <p className="resaltado w-fit max-w-full self-start font-display text-[54px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
      {children}
    </p>
  )
}

/** Recuadro con borde punteado, como un sello en la hoja. Por defecto en dos columnas. */
export function Sello({ children, className = 'grid grid-cols-2 gap-2.5' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border-[1.5px] border-dashed border-tinta-suave bg-white p-3.5 text-sm ${className}`}>{children}</div>
}

/** Condiciones del crédito del cliente. Las tasas se muestran siempre. */
export function Condiciones({ cliente, disponible, deuda }: { cliente: Cliente; disponible?: number | null; deuda?: number | null }) {
  const m = moneda(cliente.moneda)
  const limite = Number(cliente.limite_credito)
  const usado = deuda != null ? deuda : disponible != null ? limite - disponible : null
  const pct = usado == null || limite <= 0 ? 0 : Math.min(100, Math.max(0, (usado / limite) * 100))
  return (
    <Sello className="block">
      <dl className="grid grid-cols-2 gap-2.5">
        <Dato etiqueta="Tasa pactada" valor={describirTasa(cliente.tipo_tasa, cliente.tasa_compensatoria, cliente.periodo_tasa, cliente.capitalizacion)} />
        <Dato
          etiqueta="Tasa moratoria"
          valor={describirTasa(cliente.tipo_tasa_moratoria, cliente.tasa_moratoria, cliente.periodo_tasa_moratoria, cliente.capitalizacion_moratoria)}
        />
        <Dato etiqueta="Corte / pago" valor={`día ${cliente.dia_corte} / día ${cliente.dia_pago}`} />
        {disponible !== undefined && <Dato etiqueta="Disponible" valor={disponible == null ? '…' : dinero(disponible, m)} />}
        {deuda !== undefined && <Dato etiqueta="Deuda vigente (capital)" valor={deuda == null ? '…' : dinero(deuda, m)} />}
      </dl>
      <div className="mt-3">
        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded bg-papel-borde">
          <div className="h-full rounded bg-tinta" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-tinta-suave">Límite de crédito {dinero(limite, m)}</p>
      </div>
    </Sello>
  )
}

/** Rótulo de sección numerado: "1 · QUIÉN". */
export function Paso({ n, children }: { n: number; children: ReactNode }) {
  return (
    <h2 className="font-sans text-xs font-bold tracking-[0.12em] text-vencido uppercase">
      {n} · {children}
    </h2>
  )
}

/** Opciones grandes excluyentes (botones con aria-pressed). */
export function Segmentado<T extends string | number>({
  etiqueta,
  opciones,
  valor,
  onChange,
  ...control
}: {
  etiqueta: string
  opciones: { valor: T; titulo: ReactNode; detalle?: ReactNode; deshabilitado?: boolean }[]
  valor: T
  onChange: (v: T) => void
} & Control) {
  return (
    <div role="group" aria-label={etiqueta} {...control} className={`grid gap-2.5 ${opciones.length > 2 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`}>
      {opciones.map((o) => {
        const sel = o.valor === valor
        return (
          <button
            key={String(o.valor)}
            type="button"
            aria-pressed={sel}
            disabled={o.deshabilitado}
            onClick={() => onChange(o.valor)}
            className={`min-h-14 rounded-xl bg-white px-3.5 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
              sel ? 'border-2 border-tinta shadow-[3px_3px_0_var(--color-tinta)]' : 'border-[1.5px] border-linea'
            }`}
          >
            <span className="block font-bold">{o.titulo}</span>
            {o.detalle && <span className="block text-xs text-tinta-suave">{o.detalle}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Pastillas seleccionables; `children` se agrega al final (p. ej. "Ver todos…"). */
export function Chips<T extends string>({
  etiqueta,
  opciones,
  valor,
  onChange,
  children,
  ...control
}: {
  etiqueta: string
  opciones: { valor: T; texto: ReactNode }[]
  valor: T
  onChange: (v: T) => void
  children?: ReactNode
} & Control) {
  return (
    <div role="group" aria-label={etiqueta} {...control} className="flex flex-wrap gap-2">
      {opciones.map((o) => {
        const sel = o.valor === valor
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={sel}
            onClick={() => onChange(o.valor)}
            className={`min-h-11 rounded-full px-3.5 text-sm ${sel ? 'bg-tinta font-bold text-papel' : 'border-[1.5px] border-tinta bg-white'}`}
          >
            {o.texto}
          </button>
        )
      })}
      {children}
    </div>
  )
}

/** Cuadrícula de números de 1 a `max` (número de cuotas). */
export function SelectorNumero({ etiqueta, max, valor, onChange, ...control }: { etiqueta: string; max: number; valor: number; onChange: (n: number) => void } & Control) {
  return (
    <div role="group" aria-label={etiqueta} {...control} className="grid grid-cols-6 gap-2">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={n === valor}
          onClick={() => onChange(n)}
          className={`h-11 rounded-xl tabular-nums ${n === valor ? 'border-2 border-tinta bg-resaltador font-extrabold' : 'border-[1.5px] border-linea bg-white'}`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

/** − n +: cantidad con botones de 44 px. El valor sigue siendo un texto (como el input original). */
export function Stepper({ etiqueta, valor, onChange, min = 1, ...control }: { etiqueta: string; valor: string; onChange: (v: string) => void; min?: number } & Control) {
  const n = Number(valor) || 0
  const boton = 'h-11 w-11 shrink-0 rounded-lg text-xl font-bold hover:bg-papel-borde/60 disabled:opacity-40'
  return (
    <div className="flex h-12 w-fit items-center rounded-xl border-[1.5px] border-tinta bg-white focus-within:ring-2 focus-within:ring-resaltador">
      <button type="button" className={boton} aria-label={`Restar ${etiqueta.toLowerCase()}`} disabled={n <= min} onClick={() => onChange(String(Math.max(min, n - 1)))}>
        −
      </button>
      <input
        type="number"
        min={min}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        required
        {...control}
        className="h-11 min-h-0 w-14 rounded-none border-0 px-0 text-center font-bold focus:ring-0"
      />
      <button type="button" className={boton} aria-label={`Sumar ${etiqueta.toLowerCase()}`} onClick={() => onChange(String(n + 1))}>
        +
      </button>
    </div>
  )
}

/** Barra inferior fija con la acción principal; en móvil queda encima de la navegación inferior.
 *  `className` permite ocultarla en escritorio (p. ej. "lg:hidden"). */
export function BarraAccion({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`no-imprimir sticky bottom-(--alto-nav) z-10 -mx-4 border-t border-papel-borde bg-papel px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] [:root:has(.nav-inferior)_&]:pb-3 ${className}`}
    >
      {children}
    </div>
  )
}

export function Sticker({ children, className = 'bg-tinta text-resaltador' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-block w-fit -rotate-[1.5deg] self-start rounded-full px-3 py-1.5 text-[13px] font-bold ${className}`}>{children}</span>
}

export function SelloVencido({ children }: { children: ReactNode }) {
  return (
    <div className="-rotate-[0.6deg] rounded-xl border-2 border-vencido bg-white p-3.5">
      <p className="text-xs font-bold tracking-[0.12em] text-vencido">VENCIDO</p>
      {children}
    </div>
  )
}

function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[1][0] : '')).toUpperCase()
}

export function Avatar({ nombre, activo = true }: { nombre: string; activo?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-bold ${activo ? 'bg-tinta text-resaltador' : 'bg-papel-borde text-tinta'}`}
    >
      {iniciales(nombre)}
    </span>
  )
}

/** Buscador + fila deslizable de avatares para elegir cliente (Nueva venta y Cobranza). */
export function SelectorCliente({ clientes, valor, onChange, ayuda }: { clientes: Cliente[]; valor: string; onChange: (id: string) => void; ayuda: string }) {
  const [busqueda, setBusqueda] = useState('')
  const t = busqueda.trim().toLowerCase()
  const elegido = clientes.find((c) => c.id === valor)
  let lista = t ? clientes.filter((c) => `${c.nombre} ${c.documento}`.toLowerCase().includes(t)) : clientes.slice(0, 8)
  if (elegido && !lista.includes(elegido)) lista = [elegido, ...lista]
  return (
    <div className="space-y-2">
      <Campo etiqueta="Cliente" ayuda={ayuda}>
        <input type="search" placeholder="Buscar por nombre o DNI…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </Campo>
      <ul aria-label="Clientes" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {lista.map((c) => (
          <li key={c.id} className="shrink-0">
            <button
              type="button"
              aria-pressed={c.id === valor}
              onClick={() => onChange(c.id)}
              className={`flex w-18 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-xs ${c.id === valor ? 'bg-resaltador-suave font-bold' : ''}`}
            >
              <Avatar nombre={c.nombre} activo={c.id === valor} />
              {/* Nombre accesible = nombre visible + resto (WCAG 2.5.3: la etiqueta visible va dentro del nombre). */}
              <span className="w-full truncate text-center">
                {c.nombre.split(' ')[0]}
                <span className="sr-only">
                  {' '}
                  {c.nombre.split(' ').slice(1).join(' ')} — DNI {c.documento}
                </span>
              </span>
            </button>
          </li>
        ))}
        {lista.length === 0 && <li className="py-3 text-sm text-tinta-suave">Ningún cliente coincide con "{busqueda}".</li>}
      </ul>
    </div>
  )
}
