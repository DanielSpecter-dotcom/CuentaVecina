// Motor financiero de CuentaVecina (modelo de referencia, sin dependencias de React ni Supabase).
// La base de datos tiene la misma lógica en PL/pgSQL (fuente oficial al guardar);
// este módulo sirve para la simulación en pantalla y para las pruebas unitarias.
//
// Convenciones (Anexo A del enunciado):
//   - Año de 360 días, mes comercial de 30 días.
//   - Tasas con precisión completa al calcular (se muestran con 7 decimales).
//   - Montos redondeados a 2 decimales.
//   - Prelación de pagos: mora → interés compensatorio → capital.

import { diffDias, fechaDelMes, sumarMeses } from './fechas'

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
  tasa: Tasa
  tasaMora: Tasa
  diaCorte: number
  diaPago: number
  /** Hora límite del día de corte, 'HH:MM:SS' (por defecto fin del día). */
  horaCorte?: string
}

const DIAS_MES = 30

/** Redondeo a 2 decimales (montos), sin errores de coma flotante del tipo 1.005 → 1.00. */
export function r2(x: number): number {
  return Number(Math.round(Number(`${x}e2`)) + 'e-2')
}

/**
 * Tasa efectiva para un plazo de `dias` días (TEP).
 *  - Efectiva:  TEP = (1 + TE)^(dias / periodo) − 1
 *  - Nominal:   m = periodo / capitalización,  n = dias / capitalización,
 *               TEP = (1 + TN / m)^n − 1
 */
export function tasaEfectivaPeriodo(t: Tasa, dias: number): number {
  const valor = t.valor / 100
  if (dias <= 0) return 0
  if (t.tipo === 'EFECTIVA') {
    return Math.pow(1 + valor, dias / t.periodoDias) - 1
  }
  const cap = t.capitalizacionDias
  if (!cap || cap <= 0) throw new Error('La tasa nominal requiere un período de capitalización')
  const m = t.periodoDias / cap
  const n = dias / cap
  return Math.pow(1 + valor / m, n) - 1
}

/** Tasa efectiva anual equivalente (para comparar contra el tope del BCRP). */
export function teaEquivalente(t: Tasa): number {
  return tasaEfectivaPeriodo(t, 360)
}

export interface Ciclo {
  fechaCorte: string
  fechaPago: string
  /** true si la compra fue después del corte y pasa al mes siguiente. */
  trasladada: boolean
}

/**
 * Determina a qué ciclo de facturación pertenece una compra.
 * Si la compra es antes (o en) la fecha y hora de corte del mes, se paga en la fecha de pago de ese mes;
 * si es posterior, su obligación pasa al mes inmediatamente siguiente.
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
  const mes = antesDelCorte ? m : m + 1
  return {
    fechaCorte: fechaDelMes(y, mes, diaCorte),
    fechaPago: fechaDelMes(y, mes, diaPago),
    trasladada: !antesDelCorte,
  }
}

export interface ResultadoFinDeMes extends Ciclo {
  modalidad: 'FIN_DE_MES'
  capital: number
  dias: number
  tep: number
  interes: number
  total: number
}

/** Compra para pagar en una sola armada en la fecha de pago (interés por días compra → pago). */
export function simularFinDeMes(
  capital: number,
  fechaCompra: string,
  horaCompra: string,
  c: CondicionesCredito,
): ResultadoFinDeMes {
  const ciclo = determinarCiclo(fechaCompra, horaCompra, c.diaCorte, c.diaPago, c.horaCorte)
  const dias = diffDias(fechaCompra, ciclo.fechaPago)
  const tep = tasaEfectivaPeriodo(c.tasa, dias)
  const interes = r2(capital * tep)
  return { modalidad: 'FIN_DE_MES', ...ciclo, capital: r2(capital), dias, tep, interes, total: r2(capital + interes) }
}

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

/**
 * Cuota francesa en céntimos, igual para todas las cuotas.
 * R exacta = C' · TEM / (1 − (1 + TEM)^(−n)) casi nunca es un monto en céntimos: al redondearla, los
 * medios céntimos se acumulan y el saldo no cierra. Se prueban R redondeada y sus vecinas (±1, ±2… céntimos)
 * y se elige la que deja el menor ajuste en el interés de la última cuota (Iₙ = R − SIₙ frente a TEM·SIₙ),
 * sin que ese interés ni ninguna amortización quede negativo. Ante empate gana la más cercana a R redondeada.
 */
export function cuotaFrancesa(capitalCapitalizado: number, tem: number, numeroCuotas: number): number | null {
  const exacta = tem === 0 ? capitalCapitalizado / numeroCuotas : (capitalCapitalizado * tem) / (1 - Math.pow(1 + tem, -numeroCuotas))
  const base = r2(exacta)
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
  // null: la cuota es tan pequeña que ningún monto en céntimos reparte la deuda en partes iguales.
  return mejor
}

/**
 * Venta en cuotas — método francés vencido simple ordinario (meses de 30 días).
 * 1) Gracia total: el capital se capitaliza desde la compra hasta la fecha de pago del ciclo.
 * 2) Cuota constante en céntimos, igual en todas las cuotas (ver cuotaFrancesa).
 * 3) Las cuotas vencen en la fecha de pago de los n meses siguientes.
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
  const capitalCapitalizado = r2(capital * (1 + tepGracia))
  const tem = tasaEfectivaPeriodo(c.tasa, DIAS_MES)
  const cuota0 = cuotaFrancesa(capitalCapitalizado, tem, numeroCuotas)
  if (cuota0 === null) {
    throw new Error(`Con ${numeroCuotas} cuotas el monto es muy pequeño para repartirse en cuotas iguales. Elige menos cuotas.`)
  }
  const valorCuota = cuota0

  const cronograma: FilaCronograma[] = []
  let saldo = capitalCapitalizado
  for (let k = 1; k <= numeroCuotas; k++) {
    const ultima = k === numeroCuotas
    // Todas las cuotas valen R. La última amortiza el saldo exacto y su interés (R − saldo) absorbe el redondeo.
    const interes = ultima ? r2(valorCuota - saldo) : r2(saldo * tem)
    const amortizacion = ultima ? saldo : r2(valorCuota - interes)
    const cuota = valorCuota
    const saldoFinal = r2(saldo - amortizacion)
    cronograma.push({
      numero: k,
      fechaVencimiento: sumarMeses(ciclo.fechaPago, k),
      saldoInicial: saldo,
      interes,
      amortizacion,
      cuota,
      saldoFinal,
    })
    saldo = saldoFinal
  }
  const totalPagar = r2(cronograma.reduce((s, f) => s + f.cuota, 0))
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

export interface ResultadoMora {
  dias: number
  tep: number
  interes: number
}

/** Interés moratorio sobre el total que debió pagarse, por los días de atraso. */
export function calcularMora(
  montoDebido: number,
  fechaVencimiento: string,
  fechaPagoReal: string,
  tasaMora: Tasa,
): ResultadoMora {
  const dias = Math.max(0, diffDias(fechaVencimiento, fechaPagoReal))
  const tep = tasaEfectivaPeriodo(tasaMora, dias)
  return { dias, tep, interes: r2(montoDebido * tep) }
}
