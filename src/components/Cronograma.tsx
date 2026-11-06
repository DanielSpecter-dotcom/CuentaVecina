import type { Moneda } from '../lib/codigos'
import { formatearFecha } from '../lib/fechas'
import { dinero } from '../lib/formato'
import { Etiqueta } from './ui'

export interface FilaCrono {
  numero: number
  fechaVencimiento: string
  saldoInicial: number
  interes: number
  amortizacion: number
  cuota: number
  saldoFinal: number
  estado?: 'pendiente' | 'pagado'
}

export function Cronograma({ filas, moneda = 'PEN' }: { filas: FilaCrono[]; moneda?: Moneda }) {
  const total = (k: 'interes' | 'amortizacion' | 'cuota') => filas.reduce((s, f) => s + Number(f[k]), 0)
  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>N.º</th>
            <th>Vencimiento</th>
            <th className="text-right">Saldo inicial</th>
            <th className="text-right">Interés</th>
            <th className="text-right">Amortización</th>
            <th className="text-right">Cuota</th>
            <th className="text-right">Saldo final</th>
            {filas.some((f) => f.estado) && <th>Estado</th>}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.numero}>
              <td>{f.numero}</td>
              <td>{formatearFecha(f.fechaVencimiento)}</td>
              <td className="text-right">{dinero(f.saldoInicial, moneda)}</td>
              <td className="text-right">{dinero(f.interes, moneda)}</td>
              <td className="text-right">{dinero(f.amortizacion, moneda)}</td>
              <td className="text-right font-medium">{dinero(f.cuota, moneda)}</td>
              <td className="text-right">{dinero(f.saldoFinal, moneda)}</td>
              {f.estado && (
                <td>
                  <Etiqueta color={f.estado === 'pagado' ? 'verde' : 'ambar'}>{f.estado}</Etiqueta>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td colSpan={3} className="text-right">
              Totales
            </td>
            <td className="text-right">{dinero(total('interes'), moneda)}</td>
            <td className="text-right">{dinero(total('amortizacion'), moneda)}</td>
            <td className="text-right">{dinero(total('cuota'), moneda)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
