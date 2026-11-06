import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/Layout'
import { Alerta, Boton, Campo } from '../components/ui'
import { mensajeError, supabase } from '../lib/supabase'

const GIROS = ['Bodega', 'Minimarket', 'Panadería', 'Carnicería', 'Pollería', 'Pescadería', 'Frutería', 'Bazar', 'Licorería', 'Botica', 'Peluquería', 'Spa', 'Otro']

const vacio = {
  nombre_comercial: '',
  ruc: '',
  giro: 'Bodega',
  direccion: '',
  telefono: '',
  correo: '',
  contacto_nombre: '',
  contacto_dni: '',
}

export default function RegistroNegocio() {
  const [f, setF] = useState(vacio)
  const [error, setError] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const set = (k: keyof typeof vacio) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    const { error } = await supabase.from('solicitudes_tienda').insert({
      ...f,
      telefono: f.telefono || null,
      correo: f.correo || null,
    })
    setEnviando(false)
    if (error) setError(mensajeError(error))
    else setEnviado(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-marca-50 to-stone-100 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link to="/login">
          <Logo />
        </Link>
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Registra tu negocio</h1>
          <p className="mb-4 text-sm text-stone-600">
            El administrador del sistema revisará tu solicitud y te entregará tu usuario y contraseña.
          </p>
          {enviado ? (
            <Alerta tipo="exito">
              ¡Solicitud enviada! Te contactaremos al teléfono o correo indicado cuando tu tienda esté activa.
            </Alerta>
          ) : (
            <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
              {error && <div className="sm:col-span-2"><Alerta>{error}</Alerta></div>}
              <Campo etiqueta="Nombre comercial" ayuda="Nombre con el que tus vecinos conocen tu negocio.">
                <input value={f.nombre_comercial} onChange={set('nombre_comercial')} required maxLength={100} />
              </Campo>
              <Campo etiqueta="RUC" ayuda="11 dígitos, sin espacios ni guiones.">
                <input value={f.ruc} onChange={set('ruc')} required pattern="[0-9]{11}" inputMode="numeric" maxLength={11} />
              </Campo>
              <Campo etiqueta="Giro del negocio" ayuda="Tipo de negocio. El sistema funciona igual para cualquier giro.">
                <select value={f.giro} onChange={set('giro')}>
                  {GIROS.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="Dirección" ayuda="Dirección del local.">
                <input value={f.direccion} onChange={set('direccion')} required maxLength={150} />
              </Campo>
              <Campo etiqueta="Teléfono (opcional)" ayuda="Celular de 9 dígitos que empiece con 9.">
                <input value={f.telefono} onChange={set('telefono')} pattern="9[0-9]{8}" inputMode="numeric" maxLength={9} />
              </Campo>
              <Campo etiqueta="Correo (opcional)" ayuda="Solo para contactarte; no se usa para iniciar sesión.">
                <input type="email" value={f.correo} onChange={set('correo')} maxLength={100} />
              </Campo>
              <Campo etiqueta="Nombre del responsable" ayuda="Persona que administrará el negocio en la app.">
                <input value={f.contacto_nombre} onChange={set('contacto_nombre')} required maxLength={100} />
              </Campo>
              <Campo etiqueta="DNI del responsable" ayuda="8 dígitos. Será su usuario para iniciar sesión.">
                <input value={f.contacto_dni} onChange={set('contacto_dni')} required pattern="[0-9]{8}" inputMode="numeric" maxLength={8} />
              </Campo>
              <div className="sm:col-span-2">
                <Boton type="submit" cargando={enviando}>
                  Enviar solicitud
                </Boton>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
