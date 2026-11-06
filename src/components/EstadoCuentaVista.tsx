import { formatearFecha } from '../lib/fechas'
import { dinero } from '../lib/formato'
import type { EstadoCuenta } from '../types'
import { Dato, Etiqueta } from './ui'

/** Listado de pago de un período: compras ordenadas por fecha, intereses y mora. */
export function EstadoCuentaVista({ ec, tienda }: { ec: EstadoCuenta; tienda?: string }) {
  const m = ec.moneda
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {tienda && <div className="text-xs tracking-wide text-stone-500 uppercase">{tienda}</div>}
          <div className="text-lg font-semibold">{ec.cliente}</div>
          <div className="text-sm text-stone-500">DNI {ec.documento}</div>
        </div>
        <dl className="grid grid-cols-3 gap-4 text-sm">
          <Dato etiqueta="Fecha de corte" valor={formatearFecha(ec.fechaCorte)} />
          <Dato etiqueta="Fecha de pago" valor={formatearFecha(ec.fechaPago)} />
          <Dato
            etiqueta="Pago efectivo"
            valor={
              <span className="flex items-center gap-1">
                {formatearFecha(ec.fechaEfectiva)}
                {ec.diasMora > 0 && <Etiqueta color="rojo">{ec.diasMora} d. mora</Etiqueta>}
              </span>
            }
          />
        </dl>
      </div>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Fecha compra</th>
              <th>Detalle</th>
              <th className="text-right">Días</th>
              <th className="text-right">Capital</th>
              <th className="text-right">Interés</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {ec.items.map((it) => (
              <tr key={(it.cuota_id ?? it.venta_id) + it.tipo}>
                <td>{formatearFecha(it.fecha_compra)}</td>
                <td>
                  {it.descripcion} {it.tipo === 'CUOTA' && <Etiqueta color="azul">cuota</Etiqueta>}
                </td>
                <td className="text-right">{it.dias ?? '—'}</td>
                <td className="text-right">{dinero(it.capital, m)}</td>
                <td className="text-right">{dinero(it.interes, m)}</td>
                <td className="text-right font-medium">{dinero(it.total, m)}</td>
              </tr>
            ))}
            {ec.interesMoratorio > 0 && (
              <tr className="bg-red-50">
                <td>{formatearFecha(ec.fechaEfectiva)}</td>
                <td className="font-medium text-red-800">Intereses por mora</td>
                <td className="text-right">{ec.diasMora}</td>
                <td />
                <td className="text-right">{dinero(ec.interesMoratorio, m)}</td>
                <td className="text-right font-medium">{dinero(ec.interesMoratorio, m)}</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td colSpan={3} className="text-right">
                Totales
              </td>
              <td className="text-right">{dinero(ec.capital, m)}</td>
              <td className="text-right">{dinero(Number(ec.interesCompensatorio) + Number(ec.interesMoratorio), m)}</td>
              <td className="text-right text-base text-marca-800">{dinero(ec.total, m)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-stone-500">
        Imputación del pago (prelación): mora {dinero(ec.interesMoratorio, m)} → interés compensatorio {dinero(ec.interesCompensatorio, m)} →
        capital {dinero(ec.capital, m)}.
      </p>
    </div>
  )
}
