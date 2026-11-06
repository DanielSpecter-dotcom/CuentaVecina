// Juegos de datos de prueba del motor financiero.
// Los valores esperados se calcularon de forma independiente (Python, Decimal de 40 dígitos).
import { describe, expect, it } from 'vitest'
import {
  calcularMora,
  determinarCiclo,
  r2,
  simularCuotas,
  simularFinDeMes,
  tasaEfectivaPeriodo,
  type CondicionesCredito,
} from './motorFinanciero'

const tea30: CondicionesCredito = {
  tasa: { tipo: 'EFECTIVA', valor: 30, periodoDias: 360 },
  tasaMora: { tipo: 'NOMINAL', valor: 12, periodoDias: 360, capitalizacionDias: 1 },
  diaCorte: 20,
  diaPago: 26,
}

const tna24: CondicionesCredito = {
  tasa: { tipo: 'NOMINAL', valor: 24, periodoDias: 360, capitalizacionDias: 1 },
  tasaMora: { tipo: 'NOMINAL', valor: 12, periodoDias: 360, capitalizacionDias: 1 },
  diaCorte: 20,
  diaPago: 26,
}

describe('redondeo', () => {
  it('redondea 1.005 a 1.01 (sin error de coma flotante)', () => {
    expect(r2(1.005)).toBe(1.01)
  })
})

describe('conversión de tasas', () => {
  it('TEA 30 % → TEM (30 días)', () => {
    expect(tasaEfectivaPeriodo(tea30.tasa, 30)).toBeCloseTo(0.0221044506, 9)
  })
  it('TNA 24 % cap. diaria → TEP 21 días', () => {
    expect(tasaEfectivaPeriodo(tna24.tasa, 21)).toBeCloseTo(0.0140937286, 9)
  })
})

describe('ciclo de facturación', () => {
  it('compra antes del corte se paga el mismo mes', () => {
    expect(determinarCiclo('2026-09-15', '10:00:00', 20, 26)).toEqual({
      fechaCorte: '2026-09-20',
      fechaPago: '2026-09-26',
      trasladada: false,
    })
  })
  it('compra el día de corte antes de la hora límite entra al ciclo', () => {
    expect(determinarCiclo('2026-09-20', '18:00:00', 20, 26, '20:00:00').trasladada).toBe(false)
  })
  it('compra el día de corte después de la hora límite pasa al mes siguiente', () => {
    expect(determinarCiclo('2026-09-20', '21:00:00', 20, 26, '20:00:00').fechaPago).toBe('2026-10-26')
  })
  it('compra después del corte pasa al mes siguiente (cruce de año)', () => {
    expect(determinarCiclo('2026-12-22', '09:00:00', 20, 26)).toEqual({
      fechaCorte: '2027-01-20',
      fechaPago: '2027-01-26',
      trasladada: true,
    })
  })
})

describe('Juego de datos 1 — cuotas, ejemplo del enunciado', () => {
  // Compra 15/09 (antes del corte 20/09), pago los 26, 3 cuotas, TEA 30 %.
  const r = simularCuotas(1000, 3, '2026-09-15', '10:00:00', tea30)

  it('11 días de gracia total capitalizados', () => {
    expect(r.diasGracia).toBe(11)
    expect(r.tepGracia).toBeCloseTo(0.0080489055, 9)
    expect(r.capitalCapitalizado).toBe(1008.05)
  })
  it('cuota constante y fechas 26/10, 26/11, 26/12', () => {
    expect(r.valorCuota).toBe(350.98)
    expect(r.cronograma.map((f) => f.fechaVencimiento)).toEqual(['2026-10-26', '2026-11-26', '2026-12-26'])
  })
  it('cronograma francés', () => {
    expect(r.cronograma.map((f) => [f.interes, f.amortizacion, f.saldoFinal])).toEqual([
      [22.28, 328.7, 679.35],
      [15.02, 335.96, 343.39],
      [7.59, 343.39, 0],
    ])
    expect(r.totalPagar).toBe(1052.94)
  })
})

describe('Juego de datos 2 — fin de mes con tasa nominal', () => {
  it('compra antes del corte: 21 días de interés', () => {
    const r = simularFinDeMes(350.5, '2026-09-05', '12:00:00', tna24)
    expect(r.dias).toBe(21)
    expect(r.interes).toBe(4.94)
    expect(r.total).toBe(355.44)
  })
  it('compra después del corte: se traslada y genera 34 días de interés', () => {
    const r = simularFinDeMes(120, '2026-09-22', '12:00:00', tna24)
    expect(r.trasladada).toBe(true)
    expect(r.fechaPago).toBe('2026-10-26')
    expect(r.dias).toBe(34)
    expect(r.interes).toBe(2.75)
  })
})

describe('mora', () => {
  it('10 días de atraso con TNA moratoria 12 % cap. diaria', () => {
    const m = calcularMora(1000, '2026-09-26', '2026-10-06', tna24.tasaMora)
    expect(m.dias).toBe(10)
    expect(m.interes).toBe(3.34)
  })
  it('pago puntual no genera mora', () => {
    expect(calcularMora(1000, '2026-09-26', '2026-09-26', tna24.tasaMora).interes).toBe(0)
  })
})
