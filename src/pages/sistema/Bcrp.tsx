import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Alerta, Boton, Campo, Tarjeta, Vacio } from '../../components/ui'
import { formatearFecha } from '../../lib/fechas'
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

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('parametros_bcrp').select('*').order('vigente_desde', { ascending: false })
    if (error) setError(mensajeError(error))
    setLista((data as Parametro[]) ?? [])
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function guardar(e: FormEvent) {
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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Tasas máximas BCRP</h1>
      <Alerta tipo="info">
        Las tasas pactadas con cada cliente se validan contra el registro vigente (convertidas a TEA). Si no hay un registro vigente, no se
        valida. Fuente: Banco Central de Reserva del Perú (publicación semestral).
      </Alerta>
      {error && <Alerta>{error}</Alerta>}
      <Tarjeta titulo="Nuevo registro">
        <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-5">
          <Campo etiqueta="TEA máx. soles (%)" ayuda="Tasa efectiva anual máxima en moneda nacional, en porcentaje (p. ej. 99.5).">
            <input type="number" step="0.0000001" min="0" value={f.tasa_max_pen} onChange={(e) => setF({ ...f, tasa_max_pen: e.target.value })} required />
          </Campo>
          <Campo etiqueta="TEA máx. dólares (%)" ayuda="Tasa efectiva anual máxima en moneda extranjera, en porcentaje.">
            <input type="number" step="0.0000001" min="0" value={f.tasa_max_usd} onChange={(e) => setF({ ...f, tasa_max_usd: e.target.value })} required />
          </Campo>
          <Campo etiqueta="Vigente desde" ayuda="Primer día de vigencia.">
            <input type="date" value={f.vigente_desde} onChange={(e) => setF({ ...f, vigente_desde: e.target.value })} required />
          </Campo>
          <Campo etiqueta="Vigente hasta" ayuda="Día en que deja de regir (debe ser posterior a 'desde').">
            <input type="date" value={f.vigente_hasta} onChange={(e) => setF({ ...f, vigente_hasta: e.target.value })} required />
          </Campo>
          <div className="flex items-end">
            <Boton type="submit" cargando={guardando} className="w-full">
              Guardar
            </Boton>
          </div>
        </form>
        <p className="mt-2 text-xs text-stone-500">La tasa moratoria máxima se calcula como el 15 % de la compensatoria.</p>
      </Tarjeta>
      <Tarjeta titulo="Historial">
        {lista.length === 0 ? (
          <Vacio>Sin registros.</Vacio>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Vigencia</th>
                <th>TEA máx. S/</th>
                <th>TEA máx. US$</th>
                <th>Moratoria máx. S/</th>
                <th>Moratoria máx. US$</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td>
                    {formatearFecha(p.vigente_desde)} – {formatearFecha(p.vigente_hasta)}
                  </td>
                  <td>{Number(p.tasa_max_pen).toFixed(4)} %</td>
                  <td>{Number(p.tasa_max_usd).toFixed(4)} %</td>
                  <td>{Number(p.tasa_max_mor_pen).toFixed(4)} %</td>
                  <td>{Number(p.tasa_max_mor_usd).toFixed(4)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Tarjeta>
    </div>
  )
}
