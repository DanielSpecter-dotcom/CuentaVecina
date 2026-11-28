// Instalación inicial: crea el PRIMER administrador del sistema desde la app.
// Solo está disponible mientras no exista ninguno (lo valida la Edge Function admin-usuarios).
import { useEffect, useState, type SubmitEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Layout'
import { Alerta, Boton, Campo } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { adminUsuarios, mensajeError, supabase } from '../lib/supabase'

export default function Instalacion() {
  const { iniciarSesion } = useAuth()
  const navegar = useNavigate()
  const [pendiente, setPendiente] = useState<boolean | null>(null)
  const [f, setF] = useState({ nombre: '', usuario: 'admin', password: '', confirmar: '', codigo: '' })
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    supabase.rpc('instalacion_pendiente').then(({ data, error }) => setPendiente(error ? false : Boolean(data)))
  }, [])

  async function enviar(e: SubmitEvent) {
    e.preventDefault()
    setError(null)
    if (f.password !== f.confirmar) return setError('Las contraseñas no coinciden.')
    setEnviando(true)
    try {
      await adminUsuarios({ accion: 'instalar', nombre: f.nombre, usuario: f.usuario, password: f.password, codigo: f.codigo || undefined })
      await iniciarSesion(f.usuario, f.password)
      navegar('/sistema/tiendas', { replace: true })
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="cuaderno min-h-screen py-10 pr-4 pl-15">
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <Logo className="h-10 sm:h-12" />
        <div className="space-y-4 rounded-2xl border-2 border-tinta bg-white p-5 shadow-[4px_4px_0_var(--color-tinta)]">
          <p className="text-xs font-bold tracking-[0.12em] text-vencido uppercase">Paso 1 de la puesta en marcha</p>
          <h1 className="text-2xl font-extrabold">Configuración inicial</h1>
          {pendiente === null && <p className="text-sm text-tinta-suave">Revisando…</p>}
          {pendiente === false && (
            <>
              <Alerta tipo="info">CuentaVecina ya está configurado: el administrador del sistema ya existe.</Alerta>
              <Link to="/login" className="inline-flex min-h-11 items-center font-bold underline underline-offset-4">
                Ir a iniciar sesión
              </Link>
            </>
          )}
          {pendiente && (
            <form onSubmit={enviar} className="space-y-4">
              <p className="text-sm text-tinta-suave">
                Crea la cuenta del <strong className="text-tinta">administrador del sistema</strong>. Con ella darás de alta las tiendas y a sus
                administradores. Esta pantalla desaparece en cuanto se crea la cuenta.
              </p>
              {error && <Alerta>{error}</Alerta>}
              <Campo etiqueta="Nombre completo" ayuda="Nombre de la persona que administrará la plataforma.">
                <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required maxLength={100} autoFocus />
              </Campo>
              <Campo etiqueta="Usuario" ayuda="Con este nombre iniciarás sesión. 3 a 40 caracteres: letras, números, punto o guion.">
                <input value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })} required pattern="[A-Za-z0-9._\-]{3,40}" autoComplete="username" />
              </Campo>
              <Campo etiqueta="Contraseña" ayuda="Mínimo 8 caracteres. Guárdala bien: es la única forma de entrar.">
                <input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={8} autoComplete="new-password" />
              </Campo>
              <Campo etiqueta="Repite la contraseña" ayuda="Para evitar errores de tipeo.">
                <input type="password" value={f.confirmar} onChange={(e) => setF({ ...f, confirmar: e.target.value })} required minLength={8} autoComplete="new-password" />
              </Campo>
              <Campo
                etiqueta="Código de instalación (si te lo dieron)"
                ayuda="Solo si el equipo configuró el secret CODIGO_INSTALACION en Supabase. Si no, déjalo vacío."
              >
                <input value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} autoComplete="off" />
              </Campo>
              <Boton type="submit" cargando={enviando} className="w-full">
                Crear administrador y entrar
              </Boton>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
