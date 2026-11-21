import { Fragment, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Rol } from '../types'
import { Asistente } from './Asistente'
import { Avatar } from './cuaderno'
import { Notificaciones } from './Notificaciones'
import { Boton, Modal } from './ui'

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

/** Navegación inferior (móvil): accesos directos y lo que va en la hoja "Más". */
const INFERIOR: Record<Rol, { a: string; texto: string }[]> = {
  admin_tienda: [
    { a: '/tienda', texto: 'Inicio' },
    { a: '/tienda/cobranza', texto: 'Cobranza' },
    { a: '/tienda/clientes', texto: 'Clientes' },
  ],
  admin_sistema: [
    { a: '/sistema/tiendas', texto: 'Tiendas' },
    { a: '/sistema/solicitudes', texto: 'Solicitudes' },
    { a: '/sistema/bcrp', texto: 'Tasas BCRP' },
    { a: '/sistema/administradores', texto: 'Admins' },
  ],
  cliente: [{ a: '/mi-cuenta', texto: 'Mi cuenta' }],
}
const MAS: Record<Rol, { a: string; texto: string }[]> = {
  admin_tienda: [
    { a: '/tienda/productos', texto: 'Productos' },
    { a: '/ayuda', texto: 'Ayuda' },
  ],
  admin_sistema: [{ a: '/ayuda', texto: 'Ayuda' }],
  cliente: [],
}

const NOMBRE_ROL: Record<Rol, string> = {
  admin_sistema: 'Administrador del sistema',
  admin_tienda: 'Administrador del negocio',
  cliente: 'Cliente',
}

const abrirAsistente = () => window.dispatchEvent(new CustomEvent('abrir-asistente'))

const claseEnlace = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 shrink-0 items-center rounded-full px-3.5 text-sm whitespace-nowrap ${isActive ? 'bg-resaltador font-bold text-tinta' : 'text-tinta hover:bg-papel-borde/60'}`

const claseInferior = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 items-center justify-center rounded-full px-2.5 text-xs whitespace-nowrap ${isActive ? 'bg-resaltador font-bold text-tinta' : 'text-[#dfe4ef]'}`

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight text-tinta">
      <img src="/favicon.svg" alt="" className="h-8 w-8" />
      CuentaVecina
    </span>
  )
}

export function Layout() {
  const { cargando, perfil, tienda, cerrarSesion } = useAuth()
  const { pathname } = useLocation()
  const [mas, setMas] = useState(false)
  if (cargando) return <p className="p-6 text-sm text-tinta-suave" role="status">Cargando…</p>
  if (!perfil) return <Navigate to="/login" replace />
  const nombre = perfil.nombre ?? perfil.usuario ?? ''
  const rol = perfil.rol
  const enMas = MAS[rol].some((m) => pathname.startsWith(m.a))

  return (
    <div className="min-h-screen">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-xl focus:bg-tinta focus:px-4 focus:py-2 focus:text-papel"
      >
        Saltar al contenido
      </a>
      <header className="no-imprimir sticky top-0 z-40 bg-papel md:border-b md:border-papel-borde">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 md:gap-6">
          <span className="flex min-w-0 items-center gap-2 md:hidden">
            <img src="/favicon.svg" alt="" className="h-8 w-8 shrink-0" />
            <span className="truncate font-display text-lg font-extrabold">{tienda?.nombre_comercial ?? 'CuentaVecina'}</span>
          </span>
          <span className="hidden md:block">
            <Logo />
          </span>
          <nav aria-label="Principal" className="hidden min-w-0 flex-1 gap-1 overflow-x-auto md:flex">
            {MENU[rol].map((m) => (
              <NavLink key={m.a} to={m.a} end={m.a === '/tienda'} className={claseEnlace}>
                {m.texto}
              </NavLink>
            ))}
            <NavLink to="/ayuda" className={claseEnlace}>
              Ayuda
            </NavLink>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-3">
            <Notificaciones />
            <div className="hidden min-w-0 text-right leading-tight lg:block">
              <div className="truncate text-sm font-bold">{nombre}</div>
              <div className="truncate text-xs text-tinta-suave">{tienda ? tienda.nombre_comercial : NOMBRE_ROL[rol]}</div>
            </div>
            <Boton variante="secundario" onClick={cerrarSesion} className="hidden shrink-0 px-4 md:inline-flex">
              Cerrar sesión
            </Boton>
            {/* Móvil: el avatar abre un menú (popover nativo: se cierra con Escape o tocando fuera). */}
            <button type="button" popoverTarget="menu-usuario" aria-label={`Menú de ${nombre}`} className="rounded-full md:hidden">
              <Avatar nombre={nombre} />
            </button>
            <div
              id="menu-usuario"
              popover="auto"
              className="fixed inset-auto top-16 right-3 m-0 w-64 rounded-2xl border border-papel-borde bg-white p-4 text-tinta shadow-xl"
            >
              <p className="truncate font-bold">{nombre}</p>
              <p className="text-sm text-tinta-suave">{NOMBRE_ROL[rol]}</p>
              {tienda && <p className="truncate text-sm text-tinta-suave">{tienda.nombre_comercial}</p>}
              <Boton variante="secundario" onClick={cerrarSesion} className="mt-3 w-full">
                Cerrar sesión
              </Boton>
            </div>
          </div>
        </div>
      </header>

      <main
        id="contenido"
        tabIndex={-1}
        className="mx-auto max-w-6xl px-4 pt-2 pb-[calc(var(--alto-nav)+1.5rem)] focus:outline-none md:pt-6 md:pb-20"
      >
        <Outlet />
      </main>

      <nav aria-label="Principal" className="nav-inferior no-imprimir fixed inset-x-0 bottom-0 z-30 bg-tinta pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="mx-auto flex h-16 max-w-md items-center justify-evenly px-1">
          {INFERIOR[rol].map((m, i) => (
            <Fragment key={m.a}>
              {/* "+ Venta" va al centro de la barra del negocio. */}
              {rol === 'admin_tienda' && i === 2 && (
                <li>
                  <NavLink
                    to="/tienda/venta"
                    className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full border-4 border-tinta bg-resaltador font-display text-3xl font-extrabold text-tinta"
                  >
                    <span aria-hidden="true">+</span>
                    <span className="sr-only">Nueva venta</span>
                  </NavLink>
                </li>
              )}
              <li>
                <NavLink to={m.a} end={m.a === '/tienda'} className={claseInferior}>
                  {m.texto}
                </NavLink>
              </li>
            </Fragment>
          ))}
          {rol === 'cliente' ? (
            <>
              <li>
                <button type="button" onClick={abrirAsistente} className={claseInferior({ isActive: false })}>
                  Asistente
                </button>
              </li>
              <li>
                <NavLink to="/ayuda" className={claseInferior}>
                  Ayuda
                </NavLink>
              </li>
            </>
          ) : (
            <li>
              <button type="button" onClick={() => setMas(true)} aria-haspopup="dialog" className={claseInferior({ isActive: enMas })}>
                Más
              </button>
            </li>
          )}
        </ul>
      </nav>

      <Modal titulo="Más" abierto={mas} onCerrar={() => setMas(false)} ancho="max-w-md">
        <ul className="-my-2 divide-y divide-papel-borde">
          {MAS[rol].map((m) => (
            <li key={m.a}>
              <NavLink to={m.a} onClick={() => setMas(false)} className="flex min-h-14 items-center text-lg font-bold aria-[current=page]:text-tinta aria-[current=page]:underline">
                {m.texto}
              </NavLink>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => {
                setMas(false)
                abrirAsistente()
              }}
              className="flex min-h-14 w-full items-center text-lg font-bold"
            >
              Asistente
            </button>
          </li>
          <li>
            <button type="button" onClick={cerrarSesion} className="flex min-h-14 w-full items-center text-lg font-bold text-vencido">
              Cerrar sesión
            </button>
          </li>
        </ul>
      </Modal>

      <Asistente />
    </div>
  )
}
