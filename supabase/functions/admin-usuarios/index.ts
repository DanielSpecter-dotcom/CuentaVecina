// Edge Function: admin-usuarios
// Crea y administra cuentas SIN enviar correos (email_confirm: true), para no
// depender del límite de 2 correos/hora del SMTP incluido en Supabase.
// La clave secreta solo existe aquí (servidor), nunca en el frontend.
//
// Acciones (body JSON { accion, ... }):
//   crear_admin_tienda     (admin_sistema)  { tienda_id, usuario, password, nombre }
//   aprobar_solicitud      (admin_sistema)  { solicitud_id, usuario?, password }
//   crear_usuario_cliente  (admin_tienda)   { cliente_id, password, usuario? }
//   resetear_password      (admin_sistema | admin_tienda→sus clientes) { perfil_id, password }
//   cambiar_estado_usuario (admin_sistema | admin_tienda→sus clientes) { perfil_id, activo }
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'

const DOMINIO_USUARIOS = 'usuarios.cuentavecina.pe'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

class ErrorHttp extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

function claveSecreta(): string {
  const nuevas = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (nuevas) {
    try {
      const k = JSON.parse(nuevas)
      if (k.default) return k.default
    } catch { /* usa la clave legacy */ }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!legacy) throw new ErrorHttp(500, 'Falta la clave secreta del proyecto')
  return legacy
}

function normalizarUsuario(u: unknown): string {
  const usuario = String(u ?? '').trim().toLowerCase()
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) {
    throw new ErrorHttp(400, 'Usuario inválido: 3 a 40 caracteres (letras, números, punto, guion)')
  }
  return usuario
}

function validarPassword(p: unknown): string {
  const password = String(p ?? '')
  if (password.length < 8) throw new ErrorHttp(400, 'La contraseña debe tener al menos 8 caracteres')
  return password
}

async function crearCuenta(
  admin: SupabaseClient,
  usuario: string,
  password: string,
  perfil: { rol: string; tienda_id: string; cliente_id?: string; nombre: string },
) {
  const { data: existe } = await admin.from('perfiles').select('id').eq('usuario', usuario).maybeSingle()
  if (existe) throw new ErrorHttp(409, `El usuario "${usuario}" ya existe`)

  const { data, error } = await admin.auth.admin.createUser({
    email: `${usuario}@${DOMINIO_USUARIOS}`,
    password,
    email_confirm: true, // no se envía correo de confirmación
    user_metadata: { nombre: perfil.nombre },
  })
  if (error || !data.user) throw new ErrorHttp(400, error?.message ?? 'No se pudo crear el usuario')

  const { error: e2 } = await admin.from('perfiles').insert({ id: data.user.id, usuario, ...perfil })
  if (e2) {
    await admin.auth.admin.deleteUser(data.user.id) // deshacer
    throw new ErrorHttp(400, e2.message)
  }
  return { id: data.user.id, usuario }
}

/** Verifica que quien llama pueda administrar el perfil indicado. */
async function perfilAdministrable(
  admin: SupabaseClient,
  llamante: { rol: string; tienda_id: string | null },
  perfilId: string,
) {
  const { data: p } = await admin.from('perfiles').select('id, rol, tienda_id').eq('id', perfilId).maybeSingle()
  if (!p) throw new ErrorHttp(404, 'Usuario no encontrado')
  if (llamante.rol === 'admin_sistema') return p
  if (llamante.rol === 'admin_tienda' && p.rol === 'cliente' && p.tienda_id === llamante.tienda_id) return p
  throw new ErrorHttp(403, 'No autorizado')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    if (req.method !== 'POST') throw new ErrorHttp(405, 'Método no permitido')

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, claveSecreta(), {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // 1. Autenticar a quien llama (token de sesión del usuario).
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) throw new ErrorHttp(401, 'No autenticado')
    const { data: auth, error: eAuth } = await admin.auth.getUser(token)
    if (eAuth || !auth.user) throw new ErrorHttp(401, 'Sesión inválida')

    const { data: llamante } = await admin
      .from('perfiles')
      .select('rol, tienda_id, activo, tiendas(estado)')
      .eq('id', auth.user.id)
      .maybeSingle()
    // deno-lint-ignore no-explicit-any
    const tiendaActiva = (llamante as any)?.tiendas?.estado !== false
    if (!llamante?.activo || (llamante.rol !== 'admin_sistema' && !tiendaActiva)) throw new ErrorHttp(403, 'Usuario inactivo')

    const body = await req.json()

    switch (body.accion) {
      case 'crear_admin_tienda': {
        if (llamante.rol !== 'admin_sistema') throw new ErrorHttp(403, 'Solo el administrador del sistema')
        const { data: t } = await admin.from('tiendas').select('id').eq('id', body.tienda_id).maybeSingle()
        if (!t) throw new ErrorHttp(404, 'Tienda no encontrada')
        const r = await crearCuenta(admin, normalizarUsuario(body.usuario), validarPassword(body.password), {
          rol: 'admin_tienda',
          tienda_id: t.id,
          nombre: String(body.nombre ?? '').slice(0, 100),
        })
        return json(r, 201)
      }

      case 'aprobar_solicitud': {
        if (llamante.rol !== 'admin_sistema') throw new ErrorHttp(403, 'Solo el administrador del sistema')
        const { data: s } = await admin.from('solicitudes_tienda').select('*').eq('id', body.solicitud_id).maybeSingle()
        if (!s || s.estado !== 'PENDIENTE') throw new ErrorHttp(400, 'La solicitud no está pendiente')
        const password = validarPassword(body.password)
        const usuario = normalizarUsuario(body.usuario || s.contacto_dni)
        const { data: t, error: eT } = await admin
          .from('tiendas')
          .insert({
            nombre_comercial: s.nombre_comercial,
            ruc: s.ruc,
            giro: s.giro,
            direccion: s.direccion,
            telefono: s.telefono,
            correo: s.correo,
          })
          .select('id')
          .single()
        if (eT) throw new ErrorHttp(400, eT.message)
        try {
          const r = await crearCuenta(admin, usuario, password, {
            rol: 'admin_tienda',
            tienda_id: t.id,
            nombre: s.contacto_nombre,
          })
          await admin
            .from('solicitudes_tienda')
            .update({ estado: 'APROBADA', tienda_id: t.id, revisado_at: new Date().toISOString() })
            .eq('id', s.id)
          return json({ ...r, tienda_id: t.id }, 201)
        } catch (e) {
          await admin.from('tiendas').delete().eq('id', t.id) // deshacer
          throw e
        }
      }

      case 'crear_usuario_cliente': {
        if (llamante.rol !== 'admin_tienda') throw new ErrorHttp(403, 'Solo el administrador del negocio')
        const { data: c } = await admin
          .from('clientes')
          .select('id, tienda_id, nombre, documento')
          .eq('id', body.cliente_id)
          .maybeSingle()
        if (!c || c.tienda_id !== llamante.tienda_id) throw new ErrorHttp(404, 'Cliente no encontrado')
        const { data: ya } = await admin.from('perfiles').select('id').eq('cliente_id', c.id).maybeSingle()
        if (ya) throw new ErrorHttp(409, 'El cliente ya tiene usuario')
        const r = await crearCuenta(admin, normalizarUsuario(body.usuario || c.documento), validarPassword(body.password), {
          rol: 'cliente',
          tienda_id: c.tienda_id,
          cliente_id: c.id,
          nombre: c.nombre,
        })
        return json(r, 201)
      }

      case 'resetear_password': {
        const p = await perfilAdministrable(admin, llamante, body.perfil_id)
        const { error } = await admin.auth.admin.updateUserById(p.id, { password: validarPassword(body.password) })
        if (error) throw new ErrorHttp(400, error.message)
        return json({ ok: true })
      }

      case 'cambiar_estado_usuario': {
        const p = await perfilAdministrable(admin, llamante, body.perfil_id)
        if (p.id === auth.user.id) throw new ErrorHttp(400, 'No puedes desactivar tu propia cuenta')
        const { error } = await admin.from('perfiles').update({ activo: Boolean(body.activo) }).eq('id', p.id)
        if (error) throw new ErrorHttp(400, error.message)
        return json({ ok: true })
      }

      default:
        throw new ErrorHttp(400, 'Acción no reconocida')
    }
  } catch (e) {
    const status = e instanceof ErrorHttp ? e.status : 500
    const mensaje = e instanceof Error ? e.message : 'Error inesperado'
    return json({ error: mensaje }, status)
  }
})
