import type { Venta } from '../types'
import { pagoMesSiguiente } from './motorFinanciero'

/** Todos los montos de la app están en soles (S/). */
const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 })

export function dinero(monto: number | string | null | undefined): string {
  if (monto == null || monto === '') return '—'
  return soles.format(Number(monto))
}

/** Tasa (fracción) → porcentaje con 7 decimales, como pide el Anexo A. */
export function tasaPct(fraccion: number | null | undefined, decimales = 7): string {
  if (fraccion == null) return '—'
  return `${(Number(fraccion) * 100).toFixed(decimales)} %`
}

/** Condiciones de corte y pago: "día 20 / día 26" o "día 10 / día 5 del mes siguiente". */
export function textoCortePago(diaCorte: number, diaPago: number): string {
  return `día ${diaCorte} / día ${diaPago}${pagoMesSiguiente(diaCorte, diaPago) ? ' del mes siguiente' : ''}`
}

/** "Arroz × 2, Aceite × 1": las líneas de la boleta. */
export const detalleVenta = (v: Pick<Venta, 'venta_items'>) => (v.venta_items ?? []).map((i) => `${i.productos?.nombre ?? '—'} × ${i.cantidad}`).join(', ')
