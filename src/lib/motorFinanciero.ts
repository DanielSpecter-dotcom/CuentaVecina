// ─────────────────────────────────────────────────────────────────────────────────────────────
// MOTOR FINANCIERO DE CUENTAVECINA
// ─────────────────────────────────────────────────────────────────────────────────────────────
// Todas las fórmulas financieras del frontend están en este archivo (sin React ni Supabase).
// La base de datos tiene las mismas fórmulas en PL/pgSQL y es la fuente oficial: al registrar una
// venta o un pago, Supabase recalcula y guarda el resultado. Este módulo se usa para:
//   · la simulación inmediata en "Nueva venta" (ticket y cronograma), y
//   · las pruebas unitarias (motorFinanciero.test.ts), con los juegos de datos del informe.
//
// Cada sección indica su función gemela en la base de datos (supabase/migrations/010_motor_financiero.sql;
// cómo se usan al vender y cobrar: 011_venta_y_cobranza.sql; guía: FORMULAS.md):
//   §1 Tasas ..................... tasaEfectivaPeriodo ↔ fn_tep
//   §2 Ciclo de facturación ...... determinarCiclo     ↔ fn_ciclo_compra
//   §3 Compra a fin de mes ....... simularFinDeMes     ↔ fn_interes (en simular_venta)
//   §4 Compra en cuotas .......... cuotaExacta         ↔ fn_cuota_exacta
//                                  cuotaFrancesa       ↔ fn_cuota_francesa
//                                  cronogramaFrances   ↔ fn_cronograma_frances
//                                  simularCuotas       ↔ fn_capitalizar + lo anterior (en simular_venta)
//   §5 Mora ...................... calcularMora        ↔ fn_interes (en estado_cuenta)
//
// Convenciones del Anexo A del enunciado:
//   · Año comercial de 360 días y mes de 30 días.
//   · Tasas con precisión completa al calcular; se muestran con 7 decimales (formato.ts → tasaPct).
//   · Montos redondeados a 2 decimales (r2).
//   · Prelación de pagos: mora → interés compensatorio → capital (estado_cuenta / registrar_pago).
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { diffDias, fechaDelMes, sumarMeses } from './fechas'

// ── §0 Convenciones ───────────────────────────────────────────────────────────────────────────

/** Año comercial (Anexo A). */
export const DIAS_ANIO = 360
/** Mes comercial (Anexo A y método francés "ordinario"). */
export const DIAS_MES = 30

export interface Tasa {
  tipo: 'NOMINAL' | 'EFECTIVA'
  /** Valor en porcentaje, p. ej. 30 para 30 %. */
  valor: number
  /** Días del período de la tasa: 360 = anual, 30 = mensual, etc. */
  periodoDias: number
  /** Solo para tasa NOMINAL: días del período de capitalización (1 = diaria, 30 = mensual). */
  capitalizacionDias?: number | null
}

export interface CondicionesCredito {
  /** Tasa compensatoria pactada con el cliente. */
  tasa: Tasa
  /** Tasa moratoria pactada con el cliente. */
  tasaMora: Tasa
  diaCorte: number
  diaPago: number
  /** Hora límite del día de corte, 'HH:MM:SS' (por defecto fin del día). */
  horaCorte?: string
}

/** Redondeo de montos a 2 decimales, sin errores de coma flotante (1.005 → 1.01, no 1.00). */
export function r2(x: number): number {
  return Number(Math.round(Number(`${x}e2`)) + 'e-2')
}

// ── §1 Tasas ──────────────────────────────────────────────────────────────────────────────────

/**
 * Tasa efectiva para un plazo de `dias` días (TEP).          SQL: fn_tep
 *
 *   Efectiva:  TEP = (1 + TE)^(días / período) − 1
 *   Nominal:   TEP = (1 + TN / m)^n − 1,   m = período / capitalización,   n = días / capitalización
 *
 * Ej.: TEA 30 % a 30 días → TEM = 1.30^(30/360) − 1 = 2.2104451 %.
 */
export function tasaEfectivaPeriodo(t: Tasa, dias: number): number {
  if (dias <= 0) return 0
  const tasa = t.valor / 100
  if (t.tipo === 'EFECTIVA') {
    return Math.pow(1 + tasa, dias / t.periodoDias) - 1
  }
  const cap = t.capitalizacionDias
  if (!cap || cap <= 0) throw new Error('La tasa nominal requiere un período de capitalización')
  const m = t.periodoDias / cap
  const n = dias / cap
  return Math.pow(1 + tasa / m, n) - 1
}

/** TEA equivalente = TEP a 360 días. Se muestra al pactar la tasa y se compara con el tope del BCRP. */
export function teaEquivalente(t: Tasa): number {
  return tasaEfectivaPeriodo(t, DIAS_ANIO)
}

// ── §2 Ciclo de facturación (enunciado, puntos 4 y 5) ─────────────────────────────────────────

export interface Ciclo {
  fechaCorte: string
  fechaPago: string
  /** true si la compra fue después del corte y pasa al mes siguiente. */
  trasladada: boolean
}

/** true si la fecha de pago cae en el mes siguiente al corte (día de pago ≤ día de corte, p. ej. corte 10 y pago 5). */
export function pagoMesSiguiente(diaCorte: number, diaPago: number): boolean {
  return diaPago <= diaCorte
}

/**
 * Ciclo al que pertenece una compra.                          SQL: fn_ciclo_compra
 *
 *   · Compra hasta el día y hora de corte → corte de ese mes; después → corte del mes siguiente.
 *   · Pago = día de pago del mismo mes del corte; si día de pago ≤ día de corte (corte 10, pago 5),
 *     el del mes siguiente al corte.
 *
 * Ej. del enunciado: compra 15/09, corte 20, pago 26 → corte 20/09, pago 26/09.
 */
export function determinarCiclo(
  fechaCompra: string,
  horaCompra: string,
  diaCorte: number,
  diaPago: number,
  horaCorte = '23:59:59',
): Ciclo {
  const [y, m, d] = fechaCompra.split('-').map(Number)
  const antesDelCorte = d < diaCorte || (d === diaCorte && horaCompra <= horaCorte)
  const mesCorte = antesDelCorte ? m : m + 1
  const mesPago = mesCorte + (pagoMesSiguiente(diaCorte, diaPago) ? 1 : 0)
  return {
    fechaCorte: fechaDelMes(y, mesCorte, diaCorte),
    fechaPago: fechaDelMes(y, mesPago, diaPago),
    trasladada: !antesDelCorte,
  }
}

// ── §3 Compra a fin de mes (enunciado, punto 5) ───────────────────────────────────────────────

export interface ResultadoFinDeMes extends Ciclo {
  modalidad: 'FIN_DE_MES'
  capital: number
  dias: number
  tep: number
  interes: number
  total: number
}

/**
 * Una sola armada en la fecha de pago.                        SQL: simular_venta (FIN_DE_MES)
 *
 *   días    = fecha de pago − fecha de compra
 *   Interés = Capital · TEP(días)
 *   Total   = Capital + Interés
 */
export function simularFinDeMes(capital: number, fechaCompra: string, horaCompra: string, c: CondicionesCredito): ResultadoFinDeMes {
  const ciclo = determinarCiclo(fechaCompra, horaCompra, c.diaCorte, c.diaPago, c.horaCorte)
  const dias = diffDias(fechaCompra, ciclo.fechaPago)
  const tep = tasaEfectivaPeriodo(c.tasa, dias)
  const interes = r2(capital * tep)
  return { modalidad: 'FIN_DE_MES', ...ciclo, capital: r2(capital), dias, tep, interes, total: r2(capital + interes) }
}

// ── §4 Compra en cuotas: método francés vencido simple ordinario (enunciado, punto 4) ─────────

export interface FilaCronograma {
  numero: number
  fechaVencimiento: string
  saldoInicial: number
  interes: number
  amortizacion: number
  cuota: number
  saldoFinal: number
}

export interface ResultadoCuotas extends Ciclo {
  modalidad: 'CUOTAS'
  capital: number
  numeroCuotas: number
  /** Días de gracia total: desde la compra hasta la fecha de pago del ciclo (se capitalizan). */
  diasGracia: number
  tepGracia: number
  capitalCapitalizado: number
  /** Tasa efectiva mensual (30 días). */
  tem: number
  valorCuota: number
  totalIntereses: number
  totalPagar: number
  cronograma: FilaCronograma[]
}

/** Cuota exacta del método francés:  R = C′ · TEM / (1 − (1 + TEM)^(−n)).      SQL: fn_cuota_exacta */
export function cuotaExacta(capitalCapitalizado: number, tem: number, numeroCuotas: number): number {
  return tem === 0 ? capitalCapitalizado / numeroCuotas : (capitalCapitalizado * tem) / (1 - Math.pow(1 + tem, -numeroCuotas))
}

/**
 * Cuota francesa R en céntimos, igual en todas las cuotas.    SQL: fn_cuota_francesa
 *
 * La R exacta casi nunca es un monto en céntimos y, al redondearla, el saldo no cierra en 0. Se prueban
 * la R redondeada y sus vecinas (±1, ±2… céntimos) y se elige la que deja el menor ajuste en el interés
 * de la última cuota (Iₙ = R − SIₙ frente a TEM · SIₙ), sin amortizaciones ni intereses negativos.
 * Devuelve null si el monto es tan pequeño que ninguna R en céntimos reparte la deuda en partes iguales.
 */
export function cuotaFrancesa(capitalCapitalizado: number, tem: number, numeroCuotas: number): number | null {
  const base = r2(cuotaExacta(capitalCapitalizado, tem, numeroCuotas))
  let mejor: number | null = null
  let mejorAjuste = Infinity
  for (let d = 0; d <= numeroCuotas; d++) {
    for (const signo of d === 0 ? [1] : [-1, 1]) {
      const r = r2(base + (signo * d) / 100)
      if (r <= 0) continue
      let saldo = capitalCapitalizado
      let valida = true
      for (let k = 1; k < numeroCuotas; k++) {
        const amortizacion = r2(r - r2(saldo * tem))
        if (amortizacion <= 0) valida = false
        saldo = r2(saldo - amortizacion)
      }
      const interesUltima = r2(r - saldo)
      // La última cuota debe amortizar algo (saldo > 0) y su interés no puede ser negativo.
      if (!valida || saldo <= 0 || interesUltima < 0) continue
      const ajuste = Math.abs(r2(interesUltima - r2(saldo * tem)))
      if (ajuste < mejorAjuste) {
        mejor = r
        mejorAjuste = ajuste
      }
    }
    // Siempre se comparan R y sus vecinas a ±1 céntimo; solo se amplía la búsqueda si ninguna es válida.
    if (d >= 1 && mejor !== null) break
  }
  return mejor
}

/**
 * Cronograma francés: una fila por cuota.                     SQL: fn_cronograma_frances
 *
 *   k < n:  Iₖ = SIₖ · TEM,   Aₖ = R − Iₖ
 *   k = n:  Aₙ = SIₙ,         Iₙ = R − SIₙ   (la última absorbe el redondeo)
 *   SIₖ₊₁ = SIₖ − Aₖ;   vence en la fecha de pago + k meses
 */
export function cronogramaFrances(
  capitalCapitalizado: number,
  tem: number,
  cuota: number,
  numeroCuotas: number,
  fechaPago: string,
): FilaCronograma[] {
  const filas: FilaCronograma[] = []
  let saldo = capitalCapitalizado
  for (let k = 1; k <= numeroCuotas; k++) {
    const interes = k < numeroCuotas ? r2(saldo * tem) : r2(cuota - saldo)
    const amortizacion = r2(cuota - interes)
    const saldoFinal = r2(saldo - amortizacion)
    filas.push({ numero: k, fechaVencimiento: sumarMeses(fechaPago, k), saldoInicial: saldo, interes, amortizacion, cuota, saldoFinal })
    saldo = saldoFinal
  }
  return filas
}

/**
 * Venta en n cuotas.                                          SQL: simular_venta (CUOTAS)
 *
 *   1) Gracia total (compra → fecha de pago del ciclo):  C′ = Capital · (1 + TEP(días de gracia))
 *   2) TEM = TEP(30 días);  R = cuotaFrancesa(C′, TEM, n)
 *   3) Cuota k (1 … n−1):   Iₖ = SIₖ · TEM,   Aₖ = R − Iₖ,   SIₖ₊₁ = SIₖ − Aₖ
 *      Última cuota:        Aₙ = SIₙ,         Iₙ = R − SIₙ   (absorbe el redondeo)
 *   4) Vencimientos: fecha de pago del ciclo + k meses (k = 1 … n).
 *
 * Ej. del enunciado: compra 15/09, pago 26/09 → 11 días de gracia; cuotas el 26/10, 26/11 y 26/12.
 */
export function simularCuotas(
  capital: number,
  numeroCuotas: number,
  fechaCompra: string,
  horaCompra: string,
  c: CondicionesCredito,
): ResultadoCuotas {
  if (!Number.isInteger(numeroCuotas) || numeroCuotas < 1) throw new Error('Número de cuotas inválido')
  const ciclo = determinarCiclo(fechaCompra, horaCompra, c.diaCorte, c.diaPago, c.horaCorte)
  const diasGracia = diffDias(fechaCompra, ciclo.fechaPago)
  const tepGracia = tasaEfectivaPeriodo(c.tasa, diasGracia)
  const capitalCapitalizado = r2(capital * (1 + tepGracia)) // C′ = C · (1 + TEP)
  const tem = tasaEfectivaPeriodo(c.tasa, DIAS_MES)
  const valorCuota = cuotaFrancesa(capitalCapitalizado, tem, numeroCuotas)
  if (valorCuota === null) {
    throw new Error(`Con ${numeroCuotas} cuotas el monto es muy pequeño para repartirse en cuotas iguales. Elige menos cuotas.`)
  }
  const cronograma = cronogramaFrances(capitalCapitalizado, tem, valorCuota, numeroCuotas, ciclo.fechaPago)
  const totalPagar = r2(valorCuota * numeroCuotas)
  return {
    modalidad: 'CUOTAS',
    ...ciclo,
    capital: r2(capital),
    numeroCuotas,
    diasGracia,
    tepGracia,
    capitalCapitalizado,
    tem,
    valorCuota,
    totalIntereses: r2(totalPagar - capital),
    totalPagar,
    cronograma,
  }
}

// ── §5 Mora (enunciado, puntos 5 y 6) ─────────────────────────────────────────────────────────

export interface ResultadoMora {
  dias: number
  tep: number
  interes: number
}

/**
 * Interés moratorio.                                          SQL: estado_cuenta (ítem "Intereses por mora")
 *
 *   días de mora = fecha efectiva de pago − fecha de pago pactada   (0 si paga a tiempo)
 *   Mora         = Total que debió pagarse · TEP_mora(días de mora)
 */
export function calcularMora(montoDebido: number, fechaVencimiento: string, fechaPagoReal: string, tasaMora: Tasa): ResultadoMora {
  const dias = Math.max(0, diffDias(fechaVencimiento, fechaPagoReal))
  const tep = tasaEfectivaPeriodo(tasaMora, dias)
  return { dias, tep, interes: r2(montoDebido * tep) }
}
