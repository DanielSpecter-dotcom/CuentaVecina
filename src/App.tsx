import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Pwa } from './components/Pwa'
import { Boton, Cargando } from './components/ui'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'

// División de código: cada rol descarga solo sus pantallas (todas quedan en el precache de la PWA).
const Ayuda = lazy(() => import('./pages/Ayuda'))
const Instalacion = lazy(() => import('./pages/Instalacion'))
const RegistroNegocio = lazy(() => import('./pages/RegistroNegocio'))
const MiCuenta = lazy(() => import('./pages/cliente/MiCuenta'))
const Administradores = lazy(() => import('./pages/sistema/Administradores'))
const Bcrp = lazy(() => import('./pages/sistema/Bcrp'))
const Solicitudes = lazy(() => import('./pages/sistema/Solicitudes'))
const Tiendas = lazy(() => import('./pages/sistema/Tiendas'))
const Clientes = lazy(() => import('./pages/tienda/Clientes'))
const Cobranza = lazy(() => import('./pages/tienda/Cobranza'))
const Inicio = lazy(() => import('./pages/tienda/Inicio'))
const NuevaVenta = lazy(() => import('./pages/tienda/NuevaVenta'))
const Productos = lazy(() => import('./pages/tienda/Productos'))
import { INICIO_POR_ROL, ProtectedRoute } from './routes/ProtectedRoute'

function Raiz() {
  const { cargando, perfil } = useAuth()
  if (cargando) return null
  return <Navigate to={perfil ? INICIO_POR_ROL[perfil.rol] : '/login'} replace />
}

function SinAcceso() {
  const { cerrarSesion } = useAuth()
  return (
    <main className="cuaderno flex min-h-screen flex-col items-center justify-center gap-4 py-10 pr-4 pl-15 text-center">
      <p aria-hidden="true" className="-rotate-[4deg] rounded-xl border-2 border-vencido bg-white px-4 py-2 font-display text-2xl font-extrabold tracking-[0.12em] text-vencido">
        SIN ACCESO
      </p>
      <h1 className="text-2xl font-extrabold">Tu cuenta no tiene acceso</h1>
      <p className="max-w-md rounded-xl bg-white/90 px-3 py-2 text-sm text-tinta-suave">
        El usuario está desactivado, la tienda fue dada de baja o la cuenta aún no tiene un perfil asignado. Comunícate con tu tienda o con el
        administrador del sistema.
      </p>
      <Boton
        variante="secundario"
        onClick={async () => {
          await cerrarSesion()
          window.location.assign('/login')
        }}
      >
        Volver al inicio de sesión
      </Boton>
    </main>
  )
}

const r = (rol: Parameters<typeof ProtectedRoute>[0]['rol'], el: ReactNode) => <ProtectedRoute rol={rol}>{el}</ProtectedRoute>

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<Cargando />}>
        <Routes>
          <Route path="/" element={<Raiz />} />
          <Route path="/login" element={<Login />} />
          <Route path="/instalacion" element={<Instalacion />} />
          <Route path="/registro-negocio" element={<RegistroNegocio />} />
          <Route path="/sin-acceso" element={<SinAcceso />} />
          <Route element={<Layout />}>
            <Route path="/sistema/tiendas" element={r('admin_sistema', <Tiendas />)} />
            <Route path="/sistema/solicitudes" element={r('admin_sistema', <Solicitudes />)} />
            <Route path="/sistema/bcrp" element={r('admin_sistema', <Bcrp />)} />
            <Route path="/sistema/administradores" element={r('admin_sistema', <Administradores />)} />
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
        </Suspense>
        <Pwa />
      </BrowserRouter>
    </AuthProvider>
  )
}
