// "Primeros pasos": la ruta para poner en marcha (y probar en vivo) la app desde cero.
// Cada paso se marca solo cuando ya existe el dato correspondiente en la base de datos.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Rol } from '../types'

interface Paso {
  texto: string
  detalle: string
  a?: string
  hecho: boolean
}

async function contar(tabla: string, filtro?: [string, string]): Promise<number> {
  let q = supabase.from(tabla).select('id', { count: 'exact', head: true })
  if (filtro) q = q.eq(filtro[0], filtro[1])
  const { count } = await q
  return count ?? 0
}

async function pasosSistema(): Promise<Paso[]> {
  const [tiendas, admins] = await Promise.all([contar('tiendas'), contar('perfiles', ['rol', 'admin_tienda'])])
  return [
    { texto: 'Crear el administrador del sistema', detalle: 'Hecho en la configuración inicial.', hecho: true },
    { texto: 'Dar de alta una tienda', detalle: 'Botón "+ Alta de tienda" (o aprobar una solicitud).', a: '/sistema/tiendas', hecho: tiendas > 0 },
    { texto: 'Crear el administrador de la tienda', detalle: 'En la fila de la tienda: "+ crear administrador".', a: '/sistema/tiendas', hecho: admins > 0 },
    { texto: 'Cerrar sesión y entrar como la tienda', detalle: 'Con el usuario y la contraseña que acabas de crear.', hecho: false },
  ]
}

async function pasosTienda(): Promise<Paso[]> {
  const [productos, clientes, usuarios, ventas, pagos] = await Promise.all([
    contar('productos'),
    contar('clientes'),
    contar('perfiles', ['rol', 'cliente']),
    contar('ventas'),
    contar('pagos'),
  ])
  return [
    { texto: 'Registrar productos', detalle: 'Con precio al contado y precio de crédito.', a: '/tienda/productos', hecho: productos > 0 },
    { texto: 'Registrar un cliente', detalle: 'Con su tasa pactada, límite de crédito y días de corte y pago.', a: '/tienda/clientes', hecho: clientes > 0 },
    { texto: 'Crearle su usuario', detalle: 'En Clientes: "+ crear usuario" (entra con su DNI).', a: '/tienda/clientes', hecho: usuarios > 0 },
    { texto: 'Registrar una venta a crédito', detalle: 'A fin de mes o en cuotas (método francés).', a: '/tienda/venta', hecho: ventas > 0 },
    { texto: 'Cobrar un período', detalle: 'En Cobranza: el cliente recibe el aviso "Pago recibido".', a: '/tienda/cobranza', hecho: pagos > 0 },
  ]
}

export function PrimerosPasos({ rol }: { rol: Extract<Rol, 'admin_sistema' | 'admin_tienda'> }) {
  const [pasos, setPasos] = useState<Paso[] | null>(null)

  useEffect(() => {
    ;(rol === 'admin_sistema' ? pasosSistema() : pasosTienda()).then(setPasos)
  }, [rol])

  if (!pasos) return null
  const hechos = pasos.filter((p) => p.hecho).length
  // En el admin del sistema el último paso no se puede detectar: se oculta cuando ya hay tienda con administrador.
  const completo = rol === 'admin_sistema' ? hechos >= pasos.length - 1 : hechos === pasos.length
  if (completo) return null

  return (
    <section aria-labelledby="primeros-pasos" className="rounded-xl border-[1.5px] border-dashed border-tinta-suave bg-white p-3.5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 id="primeros-pasos" className="text-lg font-bold">
          Primeros pasos
        </h2>
        <span className="text-sm text-tinta-suave">
          {hechos} de {pasos.length}
        </span>
      </div>
      <ol className="divide-y divide-papel-borde">
        {pasos.map((p, i) => {
          const texto = (
            <span className={`min-w-0 ${p.hecho ? 'text-tinta-suave line-through' : ''}`}>
              <span className={`font-bold ${p.a && !p.hecho ? 'underline underline-offset-4' : ''}`}>{p.texto}</span>
              <span className="block text-sm text-tinta-suave no-underline">{p.detalle}</span>
            </span>
          )
          const circulo = (
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                p.hecho ? 'bg-tinta text-resaltador' : 'border-[1.5px] border-tinta bg-white text-tinta'
              }`}
            >
              {p.hecho ? '✓' : i + 1}
            </span>
          )
          return (
            <li key={p.texto}>
              {p.a && !p.hecho ? (
                <Link to={p.a} className="flex min-h-14 items-start gap-3 py-2.5 hover:bg-resaltador-suave/60">
                  {circulo}
                  {texto}
                </Link>
              ) : (
                <div className="flex min-h-14 items-start gap-3 py-2.5">
                  {circulo}
                  {texto}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
