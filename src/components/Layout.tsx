import { Navigate, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Rol } from '../types'

const MENU: Record<Rol, { a: string; texto: string }[]> = {
  admin_sistema: [
    { a: '/sistema/tiendas', texto: 'Tiendas' },
    { a: '/sistema/solicitudes', texto: 'Solicitudes' },
    { a: '/sistema/bcrp', texto: 'Tasas BCRP' },
  ],
  admin_tienda: [
    { a: '/tienda', texto: 'Inicio' },
    { a: '/tienda/venta', texto: 'Nueva venta' },
    { a: '/tienda/cobranza', texto: 'Cobranza' },
    { a: '/tienda/clientes', texto: 'Clientes' },
    { a: '/tienda/productos', texto: 'Productos' },
  ],
  cliente: [{ a: '/mi-cuenta', texto: 'Mi cuenta' }],
}

const NOMBRE_ROL: Record<Rol, string> = {
  admin_sistema: 'Administrador del sistema',
  admin_tienda: 'Administrador del negocio',
  cliente: 'Cliente',
}

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold text-marca-800">
      <img src="/favicon.svg" alt="" className="h-7 w-7" />
      CuentaVecina
    </span>
  )
}

export function Layout() {
  const { cargando, perfil, tienda, cerrarSesion } = useAuth()
  if (cargando) return null
  if (!perfil) return <Navigate to="/login" replace />
  return (
    <div className="min-h-screen">
      <header className="no-imprimir sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Logo />
          <nav className="flex flex-1 flex-wrap gap-1">
            {MENU[perfil.rol].map((m) => (
              <NavLink
                key={m.a}
                to={m.a}
                end={m.a === '/tienda'}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-marca-50 font-medium text-marca-800' : 'text-stone-600 hover:bg-stone-100'}`
                }
              >
                {m.texto}
              </NavLink>
            ))}
            <NavLink
              to="/ayuda"
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-marca-50 font-medium text-marca-800' : 'text-stone-600 hover:bg-stone-100'}`
              }
            >
              Ayuda
            </NavLink>
          </nav>
          <div className="flex items-center gap-3 text-right">
            <div className="leading-tight">
              <div className="text-sm font-medium">{perfil.nombre ?? perfil.usuario}</div>
              <div className="text-xs text-stone-500">{tienda ? tienda.nombre_comercial : NOMBRE_ROL[perfil.rol]}</div>
            </div>
            <button onClick={cerrarSesion} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50">
              Salir
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
