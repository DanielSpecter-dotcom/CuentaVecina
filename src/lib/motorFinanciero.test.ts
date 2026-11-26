// Juegos de datos de prueba del motor financiero.
// Los valores esperados se calcularon de forma independiente (Python, Decimal de 40 dígitos).
import { describe, expect, it } from 'vitest'
import {
  calcularMora,
  determinarCiclo,
  r2,
  cuotaFrancesa,
  simularCuotas,
  simularFinDeMes,
  tasaEfectivaPeriodo,
  textoCortePago,
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

describe('cuota francesa igual en todas las cuotas', () => {
  const tns5: CondicionesCredito = {
    tasa: { tipo: 'NOMINAL', valor: 5, periodoDias: 180, capitalizacionDias: 30 },
    tasaMora: { tipo: 'EFECTIVA', valor: 50, periodoDias: 360 },
    diaCorte: 20,
    diaPago: 22,
  }

  it('venta real de 6 cuotas (C′ = 70.17, TNS 5 % cap. mensual): 6 × 12.04', () => {
    expect(cuotaFrancesa(70.17, tasaEfectivaPeriodo(tns5.tasa, 30), 6)).toBe(12.04)
  })

  it('el cronograma cierra con todas las cuotas iguales y el ajuste mínimo en el interés de la última', () => {
    const r = simularCuotas(70, 6, '2026-11-13', '10:00:00', tns5)
    const cuotas = r.cronograma.map((f) => f.cuota)
    expect(new Set(cuotas).size).toBe(1)
    expect(r.cronograma.at(-1)!.saldoFinal).toBe(0)
  })

  // Propiedades para muchos casos: montos, tasas y plazos variados.
  const tasas: CondicionesCredito['tasa'][] = [
    { tipo: 'EFECTIVA', valor: 30, periodoDias: 360 },
    { tipo: 'EFECTIVA', valor: 80, periodoDias: 360 },
    { tipo: 'NOMINAL', valor: 24, periodoDias: 360, capitalizacionDias: 1 },
    { tipo: 'NOMINAL', valor: 5, periodoDias: 180, capitalizacionDias: 30 },
    { tipo: 'EFECTIVA', valor: 5, periodoDias: 30 },
  ]
  const montos = [2.6, 7, 12.38, 49.9, 100, 333.33, 999.99, 1000, 4850.5]
  for (const tasa of tasas) {
    for (const monto of montos) {
      it(`${tasa.tipo} ${tasa.valor} % — S/ ${monto} en 1 a 24 cuotas`, () => {
        const c = { ...tns5, tasa }
        for (let n = 1; n <= 24; n++) {
          let r
          try {
            r = simularCuotas(monto, n, '2026-11-25', '10:00:00', c)
          } catch (e) {
            // Solo se rechaza cuando la cuota sería de céntimos (no hay forma de repartir en partes iguales).
            expect((e as Error).message).toContain('cuotas iguales')
            expect(monto / n).toBeLessThan(0.5)
            continue
          }
          const filas = r.cronograma
          // Todas las cuotas iguales a R.
          expect(filas.every((f) => f.cuota === r.valorCuota)).toBe(true)
          // Saldo final 0 y amortizaciones que suman el capital capitalizado.
          expect(filas.at(-1)!.saldoFinal).toBe(0)
          expect(Math.round(filas.reduce((s, f) => s + f.amortizacion, 0) * 100)).toBe(Math.round(r.capitalCapitalizado * 100))
          // Cada fila cuadra: interés + amortización = cuota; nada negativo.
          for (const f of filas) {
            expect(Math.round((f.interes + f.amortizacion) * 100)).toBe(Math.round(f.cuota * 100))
            expect(f.interes).toBeGreaterThanOrEqual(0)
            expect(f.amortizacion).toBeGreaterThan(0)
          }
          // El ajuste en el interés de la última cuota no supera lo que mueve 1 céntimo de R al final del plazo
          // (ese céntimo se arrastra con intereses en cada período): 0.01 · Σ (1 + TEM)^k.
          const ultima = filas.at(-1)!
          const ajuste = Math.abs(ultima.interes - Math.round(ultima.saldoInicial * r.tem * 100) / 100)
          let cota = 0
          for (let k = 0; k < n; k++) cota += 0.01 * Math.pow(1 + r.tem, k)
          if (r.valorCuota >= 5) expect(ajuste).toBeLessThanOrEqual(cota + 1e-9)
          // Total = n × R.
          expect(r.totalPagar).toBe(Math.round(r.valorCuota * n * 100) / 100)
        }
      })
    }
  }
})

describe('pago al mes siguiente del corte (corte 10, pago 5)', () => {
  it('compra antes del corte: corte 10/11, pago 05/12', () => {
    expect(determinarCiclo('2026-11-03', '10:00:00', 10, 5)).toEqual({ fechaCorte: '2026-11-10', fechaPago: '2026-12-05', trasladada: false })
  })
  it('compra después del corte: corte 10/12, pago 05/01 del año siguiente', () => {
    expect(determinarCiclo('2026-11-25', '10:00:00', 10, 5)).toEqual({ fechaCorte: '2026-12-10', fechaPago: '2027-01-05', trasladada: true })
  })
  it('compra en diciembre después del corte: corte 10/01, pago 05/02', () => {
    expect(determinarCiclo('2026-12-15', '10:00:00', 10, 5)).toEqual({ fechaCorte: '2027-01-10', fechaPago: '2027-02-05', trasladada: true })
  })
  it('día de pago igual al de corte: un mes después', () => {
    expect(determinarCiclo('2026-11-03', '10:00:00', 10, 10).fechaPago).toBe('2026-12-10')
  })
  it('fin de mes: intereses por los días de la compra al pago (03/11 → 05/12 = 32 días)', () => {
    const c: CondicionesCredito = { ...tea30, diaCorte: 10, diaPago: 5 }
    const r = simularFinDeMes(100, '2026-11-03', '10:00:00', c)
    expect(r.dias).toBe(32)
    expect(r.fechaPago).toBe('2026-12-05')
  })
  it('cuotas: gracia hasta el pago y cuotas el 5 de cada mes siguiente', () => {
    const c: CondicionesCredito = { ...tea30, diaCorte: 10, diaPago: 5 }
    const r = simularCuotas(300, 3, '2026-11-03', '10:00:00', c)
    expect(r.diasGracia).toBe(32)
    expect(r.cronograma.map((f) => f.fechaVencimiento)).toEqual(['2027-01-05', '2027-02-05', '2027-03-05'])
  })
  it('texto de las condiciones', () => {
    expect(textoCortePago(20, 26)).toBe('día 20 / día 26')
    expect(textoCortePago(10, 5)).toBe('día 10 / día 5 del mes siguiente')
  })
})
