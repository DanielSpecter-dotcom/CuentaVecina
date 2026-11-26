import { formatearFecha } from '../lib/fechas'
import { dinero } from '../lib/formato'
import type { FilaCronograma } from '../lib/motorFinanciero'
import { Hoja, MargenFecha, Renglon, RenglonTotal } from './cuaderno'
import { Etiqueta } from './ui'

type FilaCrono = FilaCronograma & { estado?: 'pendiente' | 'pagado' }

export function Cronograma({ filas }: { filas: FilaCrono[] }) {
  const total = (k: 'interes' | 'amortizacion' | 'cuota') => filas.reduce((s, f) => s + Number(f[k]), 0)
  const etiqueta = (f: FilaCrono) => f.estado && <Etiqueta color={f.estado === 'pagado' ? 'verde' : 'ambar'}>{f.estado}</Etiqueta>
  return (
    <>
      {/* Celular: un renglón por cuota. */}
      <Hoja className="sm:hidden print:hidden">
        <ul>
          {filas.map((f) => (
            <Renglon
              key={f.numero}
              margen={<MargenFecha fecha={f.fechaVencimiento} />}
              titulo={
                <>
                  Cuota {f.numero} {etiqueta(f)}
                </>
              }
              detalle={`int. ${dinero(f.interes)} · amort. ${dinero(f.amortizacion)} · saldo ${dinero(f.saldoFinal)}`}
              monto={dinero(f.cuota)}
            />
          ))}
        </ul>
        <RenglonTotal etiqueta="Totales">{dinero(total('cuota'))}</RenglonTotal>
      </Hoja>
      <div className="hidden overflow-x-auto sm:block print:block">
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
                <td className="text-right">{dinero(f.saldoInicial)}</td>
                <td className="text-right">{dinero(f.interes)}</td>
                <td className="text-right">{dinero(f.amortizacion)}</td>
                <td className="text-right font-bold">{dinero(f.cuota)}</td>
                <td className="text-right">{dinero(f.saldoFinal)}</td>
                {f.estado && <td>{etiqueta(f)}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td colSpan={3} className="text-right">
                Totales
              </td>
              <td className="text-right">{dinero(total('interes'))}</td>
              <td className="text-right">{dinero(total('amortizacion'))}</td>
              <td className="text-right">{dinero(total('cuota'))}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  )
}
