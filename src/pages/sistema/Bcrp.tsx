import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { BarraAccion, Hoja, Renglon, Sello } from '../../components/cuaderno'
import { Alerta, Boton, Campo, Etiqueta, Tarjeta, Vacio } from '../../components/ui'
import { formatearFecha, hoyLima } from '../../lib/fechas'
import { mensajeError, supabase } from '../../lib/supabase'

interface Parametro {
  id: string
  tasa_max_pen: number
  tasa_max_usd: number
  tasa_max_mor_pen: number
  tasa_max_mor_usd: number
  vigente_desde: string
  vigente_hasta: string
}

const vacio = { tasa_max_pen: '', tasa_max_usd: '', vigente_desde: '', vigente_hasta: '' }

export default function Bcrp() {
  const [lista, setLista] = useState<Parametro[]>([])
  const [f, setF] = useState(vacio)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const set = (k: keyof typeof vacio) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('parametros_bcrp').select('*').order('vigente_desde', { ascending: false })
    if (error) setError(mensajeError(error))
    setLista((data as Parametro[]) ?? [])
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function guardar(e: SubmitEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    const pen = Number(f.tasa_max_pen)
    const usd = Number(f.tasa_max_usd)
    const { error } = await supabase.from('parametros_bcrp').insert({
      tasa_max_pen: pen,
      tasa_max_usd: usd,
      // Circular BCRP: la tasa máxima moratoria es el 15 % de la compensatoria.
      tasa_max_mor_pen: Number((pen * 0.15).toFixed(7)),
      tasa_max_mor_usd: Number((usd * 0.15).toFixed(7)),
      vigente_desde: f.vigente_desde,
      vigente_hasta: f.vigente_hasta,
    })
    setGuardando(false)
    if (error) return setError(mensajeError(error))
    setF(vacio)
    cargar()
  }

  const pct = (n: number) => `${Number(n).toFixed(4)} %`
  // Vigente: hoy está entre "desde" (incluido) y "hasta" (día en que deja de regir).
  const hoy = hoyLima()
  const esVigente = (p: Parametro) => p.vigente_desde <= hoy && hoy < p.vigente_hasta
  const hayVigente = lista.some(esVigente)

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Tasas máximas BCRP</h1>
      <Sello className="block">
        Las tasas pactadas con cada cliente se validan contra el registro vigente (convertidas a TEA). Si no hay un registro vigente, no se valida.
        Fuente: Banco Central de Reserva del Perú (publicación semestral).
      </Sello>
      {lista.length > 0 && !hayVigente && (
        <Alerta tipo="info">
          <strong>No hay un registro vigente hoy.</strong> Mientras tanto, las tasas pactadas con los clientes no se validan contra los topes del BCRP:
          registra el del semestre actual.
        </Alerta>
      )}
      {error && <Alerta>{error}</Alerta>}

      {/* Escritorio: el formulario angosto a la izquierda y el historial a la derecha. */}
      <div className="space-y-4 escritorio:grid escritorio:grid-cols-[22rem_minmax(0,1fr)] escritorio:items-start escritorio:gap-8 escritorio:space-y-0">
        <form onSubmit={guardar} className="space-y-4 escritorio:rounded-2xl escritorio:border escritorio:border-papel-borde escritorio:bg-white escritorio:p-5">
          <h2 className="text-lg font-bold">Nuevo registro</h2>
          <div className="grid gap-4 sm:grid-cols-2 escritorio:grid-cols-1">
            <Campo etiqueta="TEA máx. soles (%)" ayuda="Tasa efectiva anual máxima en moneda nacional, en porcentaje (p. ej. 99.5).">
              <input type="number" step="0.0000001" min="0" value={f.tasa_max_pen} onChange={set('tasa_max_pen')} required />
            </Campo>
            <Campo etiqueta="TEA máx. dólares (%)" ayuda="Tasa efectiva anual máxima en moneda extranjera, en porcentaje.">
              <input type="number" step="0.0000001" min="0" value={f.tasa_max_usd} onChange={set('tasa_max_usd')} required />
            </Campo>
            <Campo etiqueta="Vigente desde" ayuda="Primer día de vigencia.">
              <input type="date" value={f.vigente_desde} onChange={set('vigente_desde')} required />
            </Campo>
            <Campo etiqueta="Vigente hasta" ayuda="Día en que deja de regir (debe ser posterior a 'desde').">
              <input type="date" value={f.vigente_hasta} onChange={set('vigente_hasta')} required />
            </Campo>
          </div>
          <p className="text-xs text-tinta-suave">La tasa moratoria máxima se calcula como el 15 % de la compensatoria.</p>
          <BarraAccion className="escritorio:static escritorio:mx-0 escritorio:border-0 escritorio:bg-transparent escritorio:px-0">
            <Boton type="submit" cargando={guardando} className="w-full sm:w-auto escritorio:w-full">
              Guardar
            </Boton>
          </BarraAccion>
        </form>

        <section aria-label="Historial" className="min-w-0 space-y-2">
          <h2 className="text-lg font-bold">Historial</h2>
          {lista.length === 0 ? (
            <Vacio>Sin registros.</Vacio>
          ) : (
            <>
              <Hoja className="sm:hidden">
                <ul>
                  {lista.map((p) => (
                    <Renglon
                      key={p.id}
                      margen={p.vigente_desde.slice(0, 4)}
                      titulo={
                        <>
                          {formatearFecha(p.vigente_desde)} – {formatearFecha(p.vigente_hasta)} {esVigente(p) && <Etiqueta color="verde">vigente</Etiqueta>}
                        </>
                      }
                      detalle={
                        <>
                          TEA máx. S/ {pct(p.tasa_max_pen)} · US$ {pct(p.tasa_max_usd)}
                          <br />
                          Moratoria máx. S/ {pct(p.tasa_max_mor_pen)} · US$ {pct(p.tasa_max_mor_usd)}
                        </>
                      }
                    />
                  ))}
                </ul>
              </Hoja>
              <Tarjeta className="hidden sm:block">
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>Vigencia</th>
                        <th className="text-right">TEA máx.</th>
                        <th className="text-right">Moratoria máx.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <span className="whitespace-nowrap">
                              {formatearFecha(p.vigente_desde)} – {formatearFecha(p.vigente_hasta)}
                            </span>{' '}
                            {esVigente(p) && <Etiqueta color="verde">vigente</Etiqueta>}
                          </td>
                          {/* Soles arriba y dólares abajo: cuatro tasas en dos columnas que entran al lado del formulario. */}
                          <td className="text-right whitespace-nowrap">
                            <div className="font-bold">S/ {pct(p.tasa_max_pen)}</div>
                            <div className="text-xs text-tinta-suave">US$ {pct(p.tasa_max_usd)}</div>
                          </td>
                          <td className="text-right whitespace-nowrap">
                            <div className="font-bold">S/ {pct(p.tasa_max_mor_pen)}</div>
                            <div className="text-xs text-tinta-suave">US$ {pct(p.tasa_max_mor_usd)}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Tarjeta>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
