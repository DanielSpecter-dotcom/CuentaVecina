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
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-br from-marca-50 to-stone-100 px-4">
      <div className="text-center">
        <div className="flex justify-center text-2xl">
          <Logo />
        </div>
        <p className="mt-2 text-sm text-stone-600">El cuaderno de fiados del barrio, ahora digital.</p>
      </div>
      <form onSubmit={enviar} className="w-full max-w-sm space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Iniciar sesión</h1>
        {error && <Alerta>{error}</Alerta>}
        <Campo etiqueta="Usuario" ayuda="Clientes: su número de DNI. Administradores: el usuario que les entregó el administrador del sistema.">
          <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" required autoFocus />
        </Campo>
        <Campo etiqueta="Contraseña" ayuda="Mínimo 8 caracteres. Si la olvidaste, pide a tu tienda (o al administrador del sistema) que la restablezca.">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Campo>
        <Boton type="submit" cargando={enviando} className="w-full">
          Entrar
        </Boton>
      </form>
      <p className="text-sm text-stone-600">
        ¿Tienes un negocio y quieres usar CuentaVecina?{' '}
        <Link to="/registro-negocio" className="font-medium text-marca-700 hover:underline">
          Registra tu negocio
        </Link>
      </p>
    </div>
  )
}
