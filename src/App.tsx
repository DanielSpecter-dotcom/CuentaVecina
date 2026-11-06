import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AuthProvider, useAuth } from './context/AuthContext'
import Ayuda from './pages/Ayuda'
import MiCuenta from './pages/cliente/MiCuenta'
import Login from './pages/Login'
import RegistroNegocio from './pages/RegistroNegocio'
import Bcrp from './pages/sistema/Bcrp'
import Solicitudes from './pages/sistema/Solicitudes'
import Tiendas from './pages/sistema/Tiendas'
import Clientes from './pages/tienda/Clientes'
import Cobranza from './pages/tienda/Cobranza'
import Inicio from './pages/tienda/Inicio'
import NuevaVenta from './pages/tienda/NuevaVenta'
import Productos from './pages/tienda/Productos'
import { INICIO_POR_ROL, ProtectedRoute } from './routes/ProtectedRoute'

function Raiz() {
  const { cargando, perfil } = useAuth()
  if (cargando) return null
  return <Navigate to={perfil ? INICIO_POR_ROL[perfil.rol] : '/login'} replace />
}

function SinAcceso() {
  const { cerrarSesion } = useAuth()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">Tu cuenta no tiene acceso</h1>
      <p className="max-w-md text-sm text-stone-600">
        El usuario está desactivado, la tienda fue dada de baja o la cuenta aún no tiene un perfil asignado. Comunícate con tu tienda o con el
        administrador del sistema.
      </p>
      <button
        className="text-marca-700 underline"
        onClick={async () => {
          await cerrarSesion()
          window.location.assign('/login')
        }}
      >
        Volver al inicio de sesión
      </button>
    </div>
  )
}

const r = (rol: Parameters<typeof ProtectedRoute>[0]['rol'], el: ReactNode) => <ProtectedRoute rol={rol}>{el}</ProtectedRoute>

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Raiz />} />
          <Route path="/login" element={<Login />} />
          <Route path="/registro-negocio" element={<RegistroNegocio />} />
          <Route path="/sin-acceso" element={<SinAcceso />} />
          <Route element={<Layout />}>
            <Route path="/sistema/tiendas" element={r('admin_sistema', <Tiendas />)} />
            <Route path="/sistema/solicitudes" element={r('admin_sistema', <Solicitudes />)} />
            <Route path="/sistema/bcrp" element={r('admin_sistema', <Bcrp />)} />
            <Route path="/tienda" element={r('admin_tienda', <Inicio />)} />
            <Route path="/tienda/venta" element={r('admin_tienda', <NuevaVenta />)} />
            <Route path="/tienda/cobranza" element={r('admin_tienda', <Cobranza />)} />
            <Route path="/tienda/clientes" element={r('admin_tienda', <Clientes />)} />
            <Route path="/tienda/productos" element={r('admin_tienda', <Productos />)} />
            <Route path="/mi-cuenta" element={r('cliente', <MiCuenta />)} />
            <Route path="/ayuda" element={<Ayuda />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
