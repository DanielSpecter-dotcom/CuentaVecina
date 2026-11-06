import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Rol } from '../types'

export const INICIO_POR_ROL: Record<Rol, string> = {
  admin_sistema: '/sistema/tiendas',
  admin_tienda: '/tienda',
  cliente: '/mi-cuenta',
}

export function ProtectedRoute({ rol, children }: { rol: Rol; children: ReactNode }) {
  const { cargando, sesion, perfil } = useAuth()
  if (cargando) return <div className="p-10 text-center text-stone-500">Cargando…</div>
  if (!sesion) return <Navigate to="/login" replace />
  if (!perfil || !perfil.activo) return <Navigate to="/sin-acceso" replace />
  if (perfil.rol !== rol) return <Navigate to={INICIO_POR_ROL[perfil.rol]} replace />
  return <>{children}</>
}
