import type { Moneda } from './codigos'

const formatos: Record<Moneda, Intl.NumberFormat> = {
  PEN: new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 }),
  USD: new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }),
}

export function dinero(monto: number | string | null | undefined, m: Moneda = 'PEN'): string {
  if (monto == null || monto === '') return '—'
  return formatos[m].format(Number(monto))
}

/** Tasa (fracción) → porcentaje con 7 decimales, como pide el Anexo A. */
export function tasaPct(fraccion: number | null | undefined, decimales = 7): string {
  if (fraccion == null) return '—'
  return `${(Number(fraccion) * 100).toFixed(decimales)} %`
}
