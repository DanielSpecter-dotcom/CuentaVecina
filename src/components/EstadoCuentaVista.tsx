import type { ReactNode } from 'react'
import { formatearFecha } from '../lib/fechas'
import { dinero } from '../lib/formato'
import type { EstadoCuenta } from '../types'
import { Hoja, MargenFecha, Renglon, RenglonTitulo, RenglonTotal } from './cuaderno'
import { Dato, Etiqueta } from './ui'

/** Ítems del período en renglones de cuaderno (incluye el renglón de mora). La usan Cobranza y Mi cuenta en el celular. */
export function HojaEstadoCuenta({ ec, titulo, subtitulo, className = '' }: { ec: EstadoCuenta; titulo: ReactNode; subtitulo?: ReactNode; className?: string }) {
  const m = ec.moneda
  return (
    <Hoja className={className}>
      <RenglonTitulo titulo={titulo} subtitulo={subtitulo} />
      <ul>
        {ec.items.map((it, i) => (
          <Renglon
            key={(it.cuota_id ?? it.venta_id) + it.tipo}
            margen={<MargenFecha fecha={it.fecha_compra} repetida={i > 0 && ec.items[i - 1].fecha_compra === it.fecha_compra} />}
            titulo={
              <>
                {it.descripcion} {it.tipo === 'CUOTA' && <Etiqueta color="azul">cuota</Etiqueta>}
              </>
            }
            detalle={`${it.dias ?? '—'} días · cap. ${dinero(it.capital, m)} · int. ${dinero(it.interes, m)}`}
            monto={dinero(it.total, m)}
          />
        ))}
        {ec.interesMoratorio > 0 && (
          <Renglon
            className="bg-vencido-suave/60 text-vencido"
            margen={<MargenFecha fecha={ec.fechaEfectiva} />}
            titulo="Intereses por mora"
            detalle={`${ec.diasMora} días de atraso`}
            monto={dinero(ec.interesMoratorio, m)}
            tonoMonto="vencido"
          />
        )}
      </ul>
      <RenglonTotal>{dinero(ec.total, m)}</RenglonTotal>
    </Hoja>
  )
}

/** Listado de pago de un período: compras ordenadas por fecha, intereses y mora. */
export function EstadoCuentaVista({ ec, tienda }: { ec: EstadoCuenta; tienda?: string }) {
  const m = ec.moneda
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* En el celular el cliente ya está en la ficha de arriba; al imprimir sí sale. */}
        <div className="hidden sm:block print:block">
          {tienda && <div className="text-xs tracking-wide text-tinta-suave uppercase">{tienda}</div>}
          <div className="font-display text-lg font-bold">{ec.cliente}</div>
          <div className="text-sm text-tinta-suave">DNI {ec.documento}</div>
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
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
      <HojaEstadoCuenta
        ec={ec}
        className="sm:hidden print:hidden"
        titulo="Listado de pago"
        subtitulo={`Corte ${formatearFecha(ec.fechaCorte)} · Pago ${formatearFecha(ec.fechaPago)}`}
      />
      <div className="hidden overflow-x-auto sm:block print:block">
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
                <td className="text-right font-bold">{dinero(it.total, m)}</td>
              </tr>
            ))}
            {ec.interesMoratorio > 0 && (
              <tr className="bg-vencido-suave">
                <td>{formatearFecha(ec.fechaEfectiva)}</td>
                <td className="font-bold text-vencido">Intereses por mora</td>
                <td className="text-right">{ec.diasMora}</td>
                <td />
                <td className="text-right">{dinero(ec.interesMoratorio, m)}</td>
                <td className="text-right font-bold">{dinero(ec.interesMoratorio, m)}</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td colSpan={3} className="text-right">
                Totales
              </td>
              <td className="text-right">{dinero(ec.capital, m)}</td>
              <td className="text-right">{dinero(Number(ec.interesCompensatorio) + Number(ec.interesMoratorio), m)}</td>
              <td className="text-right text-base">
                <span className="border-b-[3px] border-double border-tinta">{dinero(ec.total, m)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-tinta-suave">
        Imputación del pago (prelación): mora {dinero(ec.interesMoratorio, m)} → interés compensatorio {dinero(ec.interesCompensatorio, m)} →
        capital {dinero(ec.capital, m)}.
      </p>
    </div>
  )
}
