import { createClient, FunctionsHttpError } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const clave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

if (!url || !clave) {
  throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en .env.local')
}

// Solo la clave publicable: todo el acceso a datos está protegido por RLS.
export const supabase = createClient(url, clave)

/** Dominio interno para los correos de login (no se envían correos a estas direcciones). */
export const DOMINIO_USUARIOS = 'usuarios.cuentavecina.pe'

/** El login es por usuario (DNI para clientes). Si escriben un correo, se usa tal cual. */
export function usuarioAEmail(usuario: string): string {
  const u = usuario.trim().toLowerCase()
  return u.includes('@') ? u : `${u}@${DOMINIO_USUARIOS}`
}

/** Traduce errores de Supabase/Postgres a mensajes legibles. */
export function mensajeError(e: unknown): string {
  if (!e) return 'Error desconocido'
  const m = typeof e === 'string' ? e : ((e as { message?: string }).message ?? String(e))
  if (m.includes('Invalid login credentials')) return 'Usuario o contraseña incorrectos'
  if (m.includes('duplicate key') && m.includes('ruc')) return 'Ya existe una tienda con ese RUC'
  if (m.includes('uq_cliente_doc_por_tienda')) return 'Ya existe un cliente con ese DNI en tu tienda'
  if (m.includes('chk_cliente_dias')) return 'El día de pago debe ser mayor que el día de corte (ambos entre 1 y 28)'
  if (m.includes('chk_producto_precio_lista')) return 'El precio de lista (crédito) no puede ser menor que el precio al contado'
  if (m.includes('row-level security')) return 'No tienes permiso para esta operación'
  if (m.includes('Failed to fetch')) return 'Sin conexión con el servidor. Revisa tu internet.'
  return m
}

/** Llama a la Edge Function admin-usuarios y devuelve su JSON (o lanza el mensaje de error). */
export async function adminUsuarios<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-usuarios', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const detalle = await error.context.json().catch(() => null)
      throw new Error(detalle?.error ?? 'Error en el servidor')
    }
    throw error
  }
  return data as T
}
