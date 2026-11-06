import { aTasa, PERIODOS } from '../lib/codigos'
import { tasaPct } from '../lib/formato'
import { teaEquivalente } from '../lib/motorFinanciero'
import { Campo } from './ui'

export interface ValorTasa {
  nominal: boolean
  valor: string
  periodo: number
  capitalizacion: number | null
}

/** Grupo de campos para una tasa (tipo, valor, período y capitalización) con su TEA equivalente. */
export function CamposTasa({ titulo, valor, onChange, ayudaValor }: {
  titulo: string
  valor: ValorTasa
  onChange: (v: ValorTasa) => void
  ayudaValor: string
}) {
  const numero = Number(valor.valor)
  let tea: string | null = null
  if (numero > 0) {
    try {
      tea = tasaPct(teaEquivalente(aTasa(valor.nominal, numero, valor.periodo, valor.capitalizacion)), 4)
    } catch {
      tea = null
    }
  }
  return (
    <fieldset className="rounded-xl border border-stone-200 p-4">
      <legend className="px-1 text-sm font-medium">{titulo}</legend>
      <div className="grid gap-3 sm:grid-cols-4">
        <Campo etiqueta="Tipo" ayuda="Efectiva: ya incluye la capitalización. Nominal: se capitaliza según el período de capitalización que indiques.">
          <select
            value={valor.nominal ? 'N' : 'E'}
            onChange={(e) => {
              const nominal = e.target.value === 'N'
              onChange({ ...valor, nominal, capitalizacion: nominal ? (valor.capitalizacion ?? 0) : null })
            }}
          >
            <option value="E">Efectiva</option>
            <option value="N">Nominal</option>
          </select>
        </Campo>
        <Campo etiqueta="Tasa (%)" ayuda={ayudaValor}>
          <input type="number" step="0.0000001" min="0.0000001" value={valor.valor} onChange={(e) => onChange({ ...valor, valor: e.target.value })} required />
        </Campo>
        <Campo etiqueta="Período de la tasa" ayuda="Plazo al que se refiere la tasa (p. ej. anual para una TEA o TNA). Año de 360 días.">
          <select value={valor.periodo} onChange={(e) => onChange({ ...valor, periodo: Number(e.target.value) })}>
            {PERIODOS.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.nombre} ({p.dias} d)
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Capitalización" ayuda="Solo para tasa nominal. Si el contrato no la indica, se asume diaria.">
          <select
            value={valor.capitalizacion ?? ''}
            disabled={!valor.nominal}
            onChange={(e) => onChange({ ...valor, capitalizacion: Number(e.target.value) })}
          >
            {!valor.nominal && <option value="">No aplica</option>}
            {PERIODOS.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.nombre}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      {tea && <p className="mt-2 text-xs text-stone-500">Equivale a una TEA de {tea}</p>}
    </fieldset>
  )
}
