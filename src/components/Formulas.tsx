import type { ReactNode } from 'react'

// Fórmulas del sistema, escritas con fracciones y exponentes reales. Se muestran en Ayuda.
// Cada una indica dónde está en el código (función TS · función SQL de 010_motor_financiero.sql) y en qué pantalla se ve.
// Mapa completo con ejemplos: FORMULAS.md.

/** Fracción apilada (numerador sobre denominador). */
function Fr({ n, d }: { n: ReactNode; d: ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex flex-col items-center align-middle text-[0.9em] leading-tight">
      <span className="border-b border-current px-1">{n}</span>
      <span className="px-1">{d}</span>
    </span>
  )
}

interface Formula {
  titulo: string
  /** Versión lineal para lectores de pantalla. */
  texto: string
  /** Partes de la fórmula: en pantallas angostas cada parte baja a su propia línea. */
  visual: ReactNode[]
  nota: ReactNode
  codigo: string
  pantalla: string
}

const FORMULAS: Formula[] = [
  {
    titulo: 'Tasa efectiva del período (TEP) — tasa efectiva',
    texto: 'TEP = (1 + TE) elevado a (días / período) − 1',
    visual: [
      <>
        TEP = (1 + TE)
        <sup>
          <Fr n="días" d="período" />
        </sup>{' '}
        − 1
      </>,
    ],
    nota: 'TE: tasa efectiva pactada; período: días de la tasa (360 si es anual). Año de 360 días.',
    codigo: 'tasaEfectivaPeriodo · fn_tep',
    pantalla: 'TEA equivalente al pactar la tasa; TEP y TEM en el ticket de Nueva venta.',
  },
  {
    titulo: 'Tasa efectiva del período (TEP) — tasa nominal',
    texto: 'TEP = (1 + TN / m) elevado a n − 1, con m = período / capitalización y n = días / capitalización',
    visual: [
      <>
        TEP = (1 + <Fr n="TN" d="m" />)<sup>n</sup> − 1
      </>,
      <>
        m = <Fr n="período" d="capitalización" />
      </>,
      <>
        n = <Fr n="días" d="capitalización" />
      </>,
    ],
    nota: 'TN: tasa nominal pactada; m: capitalizaciones por período de la tasa; n: capitalizaciones en el plazo.',
    codigo: 'tasaEfectivaPeriodo · fn_tep',
    pantalla: 'Igual que la anterior, cuando el cliente tiene tasa nominal.',
  },
  {
    titulo: 'Compra a fin de mes',
    texto: 'Interés = Capital × TEP(días), días = fecha de pago − fecha de compra; Total = Capital + Interés',
    visual: [<>I = C × TEP(d)</>, <>d = fecha de pago − fecha de compra</>, <>Total = C + I</>],
    nota: 'Las compras después del día y hora de corte pasan al corte del mes siguiente.',
    codigo: 'determinarCiclo + simularFinDeMes · fn_ciclo_compra + fn_interes',
    pantalla: 'Ticket de Nueva venta y listado de pago (Cobranza, Mi cuenta).',
  },
  {
    titulo: 'Compra en cuotas — gracia total y cuota (método francés)',
    texto: 'C′ = C × (1 + TEP(días de gracia)); TEM = TEP(30); R = C′ × TEM / (1 − (1 + TEM) elevado a −n)',
    visual: [
      <>
        C′ = C × (1 + TEP(d<sub>g</sub>))
      </>,
      <>TEM = TEP(30)</>,
      <>
        R ={' '}
        <Fr
          n="C′ × TEM"
          d={
            <>
              1 − (1 + TEM)<sup>−n</sup>
            </>
          }
        />
      </>,
    ],
    nota: (
      <>
        d<sub>g</sub>: días de gracia, desde la compra hasta la fecha de pago del ciclo (gracia total, se capitalizan). R se ajusta a
        céntimos y es igual en todas las cuotas.
      </>
    ),
    codigo: 'cuotaExacta + cuotaFrancesa · fn_capitalizar + fn_cuota_exacta + fn_cuota_francesa',
    pantalla: 'Ticket y cronograma de Nueva venta; cuotas en Cobranza y Mi cuenta.',
  },
  {
    titulo: 'Compra en cuotas — cronograma',
    texto: 'Interés k = Saldo k × TEM; Amortización k = R − Interés k; Saldo siguiente = Saldo k − Amortización k. Última cuota: amortiza el saldo y su interés es R − saldo.',
    visual: [
      <>
        I<sub>k</sub> = SI<sub>k</sub> × TEM
      </>,
      <>
        A<sub>k</sub> = R − I<sub>k</sub>
      </>,
      <>
        SI<sub>k+1</sub> = SI<sub>k</sub> − A<sub>k</sub>
      </>,
    ],
    nota: 'Última cuota: Aₙ = SIₙ e Iₙ = R − SIₙ (absorbe el redondeo). Vencen el día de pago de los n meses siguientes.',
    codigo: 'cronogramaFrances · fn_cronograma_frances',
    pantalla: 'Cronograma de Nueva venta.',
  },
  {
    titulo: 'Intereses por mora',
    texto: 'Mora = Total que debió pagarse × TEP moratoria(días de mora), días de mora = fecha efectiva − fecha de pago',
    visual: [
      <>
        Mora = Total × TEP<sub>mora</sub>(d<sub>m</sub>)
      </>,
      <>
        d<sub>m</sub> = fecha efectiva − fecha de pago
      </>,
    ],
    nota: 'Se aplica la tasa moratoria pactada (nominal o efectiva) y aparece como un ítem aparte del listado.',
    codigo: 'calcularMora · fn_interes (en estado_cuenta)',
    pantalla: 'Listado de pago en Cobranza y Mi cuenta (renglón "Intereses por mora").',
  },
  {
    titulo: 'Prelación del pago',
    texto: 'Mora, luego interés compensatorio, luego capital',
    visual: [<>Pago → mora</>, <>→ interés compensatorio</>, <>→ capital</>],
    nota: 'Sin pagos parciales: se paga el total del período, empezando por el más antiguo.',
    codigo: 'estado_cuenta + registrar_pago',
    pantalla: 'Línea "Imputación del pago" debajo del listado.',
  },
]

export function Formulas() {
  return (
    <ul className="space-y-3">
      {FORMULAS.map((f) => (
        <li key={f.titulo} className="rounded-2xl border border-papel-borde bg-white p-4">
          <h3 className="text-sm font-bold">{f.titulo}</h3>
          <p className="my-3 py-1 font-display text-lg leading-loose">
            <span className="sr-only">{f.texto}</span>
            <span aria-hidden="true" className="flex flex-wrap items-center gap-x-6 gap-y-1">
              {f.visual.map((parte, i) => (
                <span key={i} className="whitespace-nowrap">
                  {parte}
                </span>
              ))}
            </span>
          </p>
          <p className="text-sm text-tinta-suave">{f.nota}</p>
          <dl className="mt-2 grid gap-1 text-xs text-tinta-suave sm:grid-cols-2">
            <div>
              <dt className="inline font-bold text-tinta">Código: </dt>
              <dd className="inline font-mono">{f.codigo}</dd>
            </div>
            <div>
              <dt className="inline font-bold text-tinta">Se ve en: </dt>
              <dd className="inline">{f.pantalla}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  )
}
