import { Navigate, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Rol } from '../types'
import { Asistente } from './Asistente'
import { Notificaciones } from './Notificaciones'
import { Boton } from './ui'

const MENU: Record<Rol, { a: string; texto: string }[]> = {
  admin_sistema: [
    { a: '/sistema/tiendas', texto: 'Tiendas' },
    { a: '/sistema/solicitudes', texto: 'Solicitudes' },
    { a: '/sistema/bcrp', texto: 'Tasas BCRP' },
    { a: '/sistema/administradores', texto: 'Administradores' },
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

const claseEnlace = ({ isActive }: { isActive: boolean }) =>
  `shrink-0 rounded-lg px-3 py-2 text-sm whitespace-nowrap ${isActive ? 'bg-marca-50 font-semibold text-marca-900 ring-1 ring-marca-200' : 'text-stone-700 hover:bg-stone-100 hover:text-stone-900'}`

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-marca-800">
      <img src="/favicon.svg" alt="" className="h-7 w-7" />
      CuentaVecina
    </span>
  )
}

export function Layout() {
  const { cargando, perfil, tienda, cerrarSesion } = useAuth()
  if (cargando) return <p className="p-6 text-sm text-stone-600" role="status">Cargando…</p>
  if (!perfil) return <Navigate to="/login" replace />
  return (
    <div className="min-h-screen">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-marca-800 focus:px-4 focus:py-2 focus:text-white"
      >
        Saltar al contenido
      </a>
      <header className="no-imprimir sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 md:gap-x-6 px-4 py-2 md:flex-nowrap">
          <Logo />
          {/* En móvil el menú pasa a una segunda fila que se desliza horizontalmente. */}
          <nav aria-label="Principal" className="order-last -mx-4 flex w-[calc(100%+2rem)] gap-1 overflow-x-auto px-4 pb-1 md:order-none md:mx-0 md:w-auto md:flex-1 md:pb-0">
            {MENU[perfil.rol].map((m) => (
              <NavLink key={m.a} to={m.a} end={m.a === '/tienda'} className={claseEnlace}>
                {m.texto}
              </NavLink>
            ))}
            <NavLink to="/ayuda" className={claseEnlace}>
              Ayuda
            </NavLink>
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-3 text-right">
            <Notificaciones />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-medium">{perfil.nombre ?? perfil.usuario}</div>
              <div className="truncate text-xs text-stone-600">{tienda ? tienda.nombre_comercial : NOMBRE_ROL[perfil.rol]}</div>
            </div>
            <Boton variante="secundario" onClick={cerrarSesion} className="shrink-0 px-3">
              Cerrar sesión
            </Boton>
          </div>
        </div>
      </header>
      {/* pb-24: deja libre la zona del botón flotante del asistente. */}
      <main id="contenido" tabIndex={-1} className="mx-auto max-w-6xl px-4 pt-6 pb-24 focus:outline-none">
        <Outlet />
      </main>
      <Asistente />
    </div>
  )
}
