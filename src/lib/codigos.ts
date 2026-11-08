// Códigos del esquema de BD (confirmados por el grupo). Único lugar del frontend
// donde se traducen; la BD usa la función fn_dias_periodo con la misma tabla.
import type { Tasa } from './motorFinanciero'

export const PERIODOS = [
  { codigo: 0, nombre: 'Diaria', dias: 1 },
  { codigo: 1, nombre: 'Quincenal', dias: 15 },
  { codigo: 2, nombre: 'Mensual', dias: 30 },
  { codigo: 3, nombre: 'Bimestral', dias: 60 },
  { codigo: 4, nombre: 'Trimestral', dias: 90 },
  { codigo: 5, nombre: 'Cuatrimestral', dias: 120 },
  { codigo: 6, nombre: 'Semestral', dias: 180 },
  { codigo: 7, nombre: 'Anual', dias: 360 },
] as const

export function diasPeriodo(codigo: number): number {
  return PERIODOS[codigo]?.dias ?? 360
}

/** Ej.: "TEA 30 %" o "TNA 24 % cap. diaria". */
export function describirTasa(nominal: boolean, valor: number, periodo: number, cap: number | null): string {
  // La inicial del período forma la sigla: TEA, TNM, TEQ…
  const sigla = `T${nominal ? 'N' : 'E'}${PERIODOS[periodo]?.nombre[0] ?? '?'}`
  return nominal ? `${sigla} ${valor} % cap. ${cap == null ? '—' : (PERIODOS[cap]?.nombre.toLowerCase() ?? '—')}` : `${sigla} ${valor} %`
}

/** moneda: false = Soles, true = Dólares */
export type Moneda = 'PEN' | 'USD'
export function moneda(usd: boolean): Moneda {
  return usd ? 'USD' : 'PEN'
}

/** productos.modalidad_venta */
export const MODALIDADES_PRODUCTO = [
  { codigo: 0, nombre: 'Solo pago a fin de mes' },
  { codigo: 1, nombre: 'Solo en cuotas' },
  { codigo: 2, nombre: 'Fin de mes o cuotas' },
] as const

export function aTasa(nominal: boolean, valor: number, periodo: number, cap: number | null): Tasa {
  return {
    tipo: nominal ? 'NOMINAL' : 'EFECTIVA',
    valor: Number(valor),
    periodoDias: diasPeriodo(periodo),
    capitalizacionDias: nominal && cap != null ? diasPeriodo(cap) : null,
  }
}
