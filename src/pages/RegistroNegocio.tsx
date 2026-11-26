import { useState, type SubmitEvent } from 'react'
import { Link } from 'react-router-dom'
import { BarraAccion, Chips, Paso } from '../components/cuaderno'
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
  const [verMasGiros, setVerMasGiros] = useState(false)
  const set = (k: keyof typeof vacio) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  async function enviar(e: SubmitEvent) {
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

  // Giros: los 4 primeros y "+N más"; el elegido siempre a la vista.
  const girosVisibles = verMasGiros ? GIROS : GIROS.slice(0, 4).concat(GIROS.slice(0, 4).includes(f.giro) ? [] : [f.giro])
  const girosOcultos = GIROS.length - girosVisibles.length

  return (
    <main className="cuaderno min-h-screen px-4 pt-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link to="/login" className="inline-block rounded-lg" aria-label="CuentaVecina — volver a iniciar sesión">
          <Logo />
        </Link>
        <div className="rounded-2xl border-2 border-tinta bg-white px-4 pt-5 shadow-[4px_4px_0_var(--color-tinta)]">
          <h1 className="text-2xl font-extrabold">Registra tu negocio</h1>
          <p className="mb-5 text-sm text-tinta-suave">El administrador del sistema revisará tu solicitud y te entregará tu usuario y contraseña.</p>
          {enviado ? (
            <div className="pb-5">
              <Alerta tipo="exito">
                Solicitud enviada. Cuando el administrador del sistema la apruebe, te entregará tu usuario y contraseña para entrar.{' '}
                <Link to="/login" className="font-bold underline">
                  Volver a iniciar sesión
                </Link>
              </Alerta>
            </div>
          ) : (
            <form onSubmit={enviar} className="space-y-6">
              {error && <Alerta>{error}</Alerta>}
              <section className="space-y-4">
                <Paso n={1}>Tu negocio</Paso>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo etiqueta="Nombre comercial" ayuda="Nombre con el que tus vecinos conocen tu negocio.">
                    <input value={f.nombre_comercial} onChange={set('nombre_comercial')} required maxLength={100} />
                  </Campo>
                  <Campo etiqueta="RUC" ayuda="11 dígitos, sin espacios ni guiones.">
                    <input value={f.ruc} onChange={set('ruc')} required pattern="[0-9]{11}" inputMode="numeric" maxLength={11} />
                  </Campo>
                  <Campo etiqueta="Giro del negocio" ayuda="Tipo de negocio. El sistema funciona igual para cualquier giro." className="sm:col-span-2">
                    <Chips etiqueta="Giro del negocio" opciones={girosVisibles.map((g) => ({ valor: g, texto: g }))} valor={f.giro} onChange={(g) => setF({ ...f, giro: g })}>
                      {girosOcultos > 0 && (
                        <button type="button" onClick={() => setVerMasGiros(true)} className="min-h-11 rounded-full px-3.5 text-sm font-bold underline underline-offset-4">
                          +{girosOcultos} más
                        </button>
                      )}
                    </Chips>
                  </Campo>
                  <Campo etiqueta="Dirección" ayuda="Dirección del local." className="sm:col-span-2">
                    <input value={f.direccion} onChange={set('direccion')} required maxLength={150} />
                  </Campo>
                  <Campo etiqueta="Teléfono" opcional ayuda="Celular de 9 dígitos que empiece con 9.">
                    <input type="tel" autoComplete="tel" value={f.telefono} onChange={set('telefono')} pattern="9[0-9]{8}" inputMode="numeric" maxLength={9} />
                  </Campo>
                  <Campo etiqueta="Correo" opcional ayuda="Solo para contactarte; no se usa para iniciar sesión.">
                    <input type="email" autoComplete="email" value={f.correo} onChange={set('correo')} maxLength={100} />
                  </Campo>
                </div>
              </section>
              <section className="space-y-4">
                <Paso n={2}>Responsable</Paso>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo etiqueta="Nombre del responsable" ayuda="Persona que administrará el negocio en la app.">
                    <input value={f.contacto_nombre} onChange={set('contacto_nombre')} required maxLength={100} />
                  </Campo>
                  <Campo etiqueta="DNI del responsable" ayuda="8 dígitos. Será su usuario para iniciar sesión.">
                    <input value={f.contacto_dni} onChange={set('contacto_dni')} required pattern="[0-9]{8}" inputMode="numeric" maxLength={8} />
                  </Campo>
                </div>
              </section>
              <BarraAccion>
                <Boton type="submit" cargando={enviando} className="w-full">
                  Enviar solicitud
                </Boton>
              </BarraAccion>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
