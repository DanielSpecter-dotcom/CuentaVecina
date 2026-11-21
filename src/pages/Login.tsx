import { useEffect, useState, type SubmitEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Sello } from '../components/cuaderno'
import { Alerta, Boton, Campo } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { mensajeError, supabase } from '../lib/supabase'
import { INICIO_POR_ROL } from '../routes/ProtectedRoute'

export default function Login() {
  const { sesion, perfil, cargando, iniciarSesion } = useAuth()
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [verPassword, setVerPassword] = useState(false)
  const [instalacionPendiente, setInstalacionPendiente] = useState(false)

  // Base de datos recién creada (sin administrador del sistema): ofrecer la configuración inicial.
  useEffect(() => {
    supabase.rpc('instalacion_pendiente').then(({ data }) => setInstalacionPendiente(data === true))
  }, [])

  if (!cargando && sesion && perfil) return <Navigate to={INICIO_POR_ROL[perfil.rol]} replace />

  async function enviar(e: SubmitEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await iniciarSesion(usuario, password)
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="cuaderno min-h-screen py-10 pr-4 pl-15 lg:flex lg:items-center">
      {/* Celular: una columna. Escritorio: la propuesta de valor a la izquierda y el acceso a la derecha. */}
      <div className="mx-auto grid w-full max-w-sm gap-6 lg:max-w-5xl lg:grid-cols-[1fr_24rem] lg:items-center lg:gap-x-20">
        <div>
          <img src="/favicon.svg" alt="" className="h-14 w-14" />
          <p className="mt-2 font-display text-4xl font-extrabold tracking-tight">CuentaVecina</p>
          <p className="mt-1 font-display text-xl font-bold">
            <span className="resaltado">El cuaderno de fiados</span> del barrio, ahora digital.
          </p>
          <ul className="mt-8 hidden max-w-md space-y-4 text-lg lg:block">
            <li className="flex gap-3">
              <span aria-hidden="true" className="font-display font-extrabold text-vencido">1</span>
              Apunta fiados a fin de mes y ventas en cuotas con la tasa pactada con cada vecino.
            </li>
            <li className="flex gap-3">
              <span aria-hidden="true" className="font-display font-extrabold text-vencido">2</span>
              Calcula intereses, mora y cuotas con el método francés, dentro de los topes del BCRP.
            </li>
            <li className="flex gap-3">
              <span aria-hidden="true" className="font-display font-extrabold text-vencido">3</span>
              Tus clientes ven su cuenta y reciben recordatorios de pago en el celular.
            </li>
          </ul>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
        {instalacionPendiente && (
          <Sello className="block p-5">
            <p className="font-display text-lg font-bold">Primera vez aquí</p>
            <p className="mt-1 text-tinta-suave">Aún no existe el administrador del sistema. Créalo para empezar a usar CuentaVecina.</p>
            <Link to="/instalacion" className="mt-3 inline-flex min-h-12 items-center rounded-xl bg-tinta px-5 font-bold text-papel hover:bg-tinta/90">
              Configurar CuentaVecina
            </Link>
          </Sello>
        )}
        <form onSubmit={enviar} className="space-y-4 rounded-2xl border-2 border-tinta bg-white p-5 shadow-[4px_4px_0_var(--color-tinta)]">
          <h1 className="text-2xl font-extrabold sm:text-3xl">Iniciar sesión</h1>
          {error && <Alerta>{error}</Alerta>}
          <Campo etiqueta="Usuario" ayuda="Clientes: su número de DNI. Administradores: el usuario que les entregó el administrador del sistema.">
            <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" required autoFocus />
          </Campo>
          {/* El botón "Mostrar" va dentro del campo, anclado abajo a la derecha del input. */}
          <div className="relative">
            <Campo etiqueta="Contraseña" ayuda="Mínimo 8 caracteres. Si la olvidaste, pide a tu tienda (o al administrador del sistema) que la restablezca.">
              <input
                type={verPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="pr-28"
              />
            </Campo>
            <button
              type="button"
              aria-pressed={verPassword}
              onClick={() => setVerPassword((v) => !v)}
              className="absolute right-0.5 bottom-0.5 h-11 rounded-lg px-3 text-sm font-bold underline underline-offset-4 hover:bg-papel-borde/60"
            >
              Mostrar<span className="sr-only"> contraseña</span>
            </button>
          </div>
          <Boton type="submit" cargando={enviando} className="w-full">
            Entrar
          </Boton>
        </form>
        <p className="rounded-xl bg-white/90 px-3 py-2 text-sm">
          ¿Tienes un negocio y quieres usar CuentaVecina?{' '}
          <Link to="/registro-negocio" className="inline-flex min-h-11 items-center font-bold underline underline-offset-4">
            Registra tu negocio
          </Link>
        </p>
        </div>
      </div>
    </main>
  )
}
