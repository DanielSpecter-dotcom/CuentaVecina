import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Logo } from '../components/Layout'
import { Alerta, Boton, Campo } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { mensajeError } from '../lib/supabase'
import { INICIO_POR_ROL } from '../routes/ProtectedRoute'

export default function Login() {
  const { sesion, perfil, cargando, iniciarSesion } = useAuth()
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [verPassword, setVerPassword] = useState(false)

  if (!cargando && sesion && perfil) return <Navigate to={INICIO_POR_ROL[perfil.rol]} replace />

  async function enviar(e: FormEvent) {
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
    <main className="cuaderno flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <div className="flex justify-center [&>span]:text-3xl">
          <Logo />
        </div>
        <p className="mt-2 font-display text-xl font-semibold text-stone-800 sm:text-2xl">El cuaderno de fiados del barrio, ahora digital.</p>
      </div>
      <form onSubmit={enviar} className="w-full max-w-sm space-y-4 rounded-2xl border border-stone-300 bg-white p-6 shadow-md">
        <h1 className="text-2xl font-bold sm:text-3xl">Iniciar sesión</h1>
        {error && <Alerta>{error}</Alerta>}
        <Campo etiqueta="Usuario" ayuda="Clientes: su número de DNI. Administradores: el usuario que les entregó el administrador del sistema.">
          <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" required autoFocus />
        </Campo>
        <Campo etiqueta="Contraseña" ayuda="Mínimo 8 caracteres. Si la olvidaste, pide a tu tienda (o al administrador del sistema) que la restablezca.">
          <input type={verPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Campo>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={verPassword} onChange={(e) => setVerPassword(e.target.checked)} className="min-h-0 h-4 w-4 accent-marca-700" />
          Mostrar contraseña
        </label>
        <Boton type="submit" cargando={enviando} className="w-full">
          Entrar
        </Boton>
      </form>
      <p className="rounded-lg bg-white/90 px-3 py-2 text-center text-sm text-stone-700">
        ¿Tienes un negocio y quieres usar CuentaVecina?{' '}
        <Link to="/registro-negocio" className="font-semibold text-marca-800 underline underline-offset-2 hover:text-marca-900">
          Registra tu negocio
        </Link>
      </p>
    </main>
  )
}
