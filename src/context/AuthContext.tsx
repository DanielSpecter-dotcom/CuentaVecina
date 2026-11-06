import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, usuarioAEmail } from '../lib/supabase'
import type { Perfil, Tienda } from '../types'

interface EstadoAuth {
  cargando: boolean
  sesion: Session | null
  perfil: Perfil | null
  tienda: Tienda | null
  iniciarSesion: (usuario: string, password: string) => Promise<void>
  cerrarSesion: () => Promise<void>
}

const AuthContext = createContext<EstadoAuth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true)
  const [sesion, setSesion] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [tienda, setTienda] = useState<Tienda | null>(null)

  const cargarPerfil = useCallback(async (s: Session | null) => {
    setSesion(s)
    if (!s) {
      setPerfil(null)
      setTienda(null)
      setCargando(false)
      return
    }
    const { data: p } = await supabase
      .from('perfiles')
      .select('id, rol, tienda_id, cliente_id, nombre, usuario, activo')
      .eq('id', s.user.id)
      .maybeSingle()
    setPerfil((p as Perfil | null) ?? null)
    if (p?.tienda_id) {
      const { data: t } = await supabase.from('tiendas').select('*').eq('id', p.tienda_id).maybeSingle()
      setTienda((t as Tienda | null) ?? null)
    } else {
      setTienda(null)
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => cargarPerfil(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      // Solo recargar el perfil cuando cambia el usuario (no en cada refresco de token).
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'USER_UPDATED') {
        setTimeout(() => cargarPerfil(s), 0)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [cargarPerfil])

  const iniciarSesion = async (usuario: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: usuarioAEmail(usuario), password })
    if (error) throw error
  }

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ cargando, sesion, perfil, tienda, iniciarSesion, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): EstadoAuth {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
