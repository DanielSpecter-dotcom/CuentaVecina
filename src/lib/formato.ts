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
