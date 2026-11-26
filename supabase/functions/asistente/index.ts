// Edge Function: asistente
// Chatbot con un modelo gratuito de NVIDIA (build.nvidia.com, API compatible con OpenAI).
// - Ayuda general sobre CuentaVecina para cualquier usuario con sesión.
// - Si el usuario es cliente, se le agregan sus datos de cuenta, leídos con SU token
//   (mismo RLS que el frontend): el modelo nunca ve datos de otros clientes.
// La clave NVIDIA_API_KEY es un secret de Supabase; nunca llega al navegador.
//
// Body JSON: { mensajes: { role: 'user' | 'assistant', content: string }[] }  →  { respuesta }
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { clave, cors, ErrorHttp, json, responderError } from '../_shared/http.ts'

const MODELO = 'nvidia/nemotron-3.5-lightning-30b-a3b'
const MAX_MENSAJES = 12
const MAX_CARACTERES = 2000

function hoyLima(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
}

// Mismo contenido que src/pages/Ayuda.tsx: si cambia uno, actualizar el otro.
const AYUDA = `
- Mes de pago: cada cliente tiene un día de corte y un día de pago. Las compras hechas hasta la fecha y hora de corte entran a ese corte; las posteriores pasan al corte del mes siguiente. El pago vence el día de pago del mismo mes del corte o, si el día de pago es menor o igual al de corte (p. ej. corte 10 y pago 5), en el mes siguiente. Al cerrarse el corte, el sistema genera el listado de pago de cada cliente y se lo avisa (también a la tienda).
- Intereses de una compra a fin de mes: tasa pactada (nominal o efectiva) por los días entre la compra y la fecha de pago. Interés = Capital × TEP, TEP = tasa efectiva para esos días. Año comercial de 360 días.
- Compras en cuotas: método francés vencido simple ordinario (meses de 30 días). Desde la compra hasta la fecha de pago del ciclo hay período de gracia total: esos intereses se capitalizan y luego se calcula la cuota constante. Las cuotas vencen en la fecha de pago de los meses siguientes.
- Pago tarde: se agrega "Intereses por mora": la tasa moratoria pactada sobre el total que debió pagarse, por los días de atraso. Orden de imputación del pago: mora → interés compensatorio → capital.
- Pagos parciales: no se aceptan. Solo el total del período, y los períodos se pagan en orden (primero el más antiguo).
- Venta rechazada: la deuda vigente más la nueva compra supera el límite de crédito, o las cuotas exceden el plazo máximo, o el producto no admite esa modalidad.
- Olvidé mi contraseña: los clientes le piden a su tienda que la restablezca (Clientes → Restablecer contraseña). Los administradores de negocio, al administrador del sistema.
- Errores técnicos: anotar qué se hacía y la hora, y escribir al administrador del sistema (todo queda en auditoría).
- Moneda: todos los créditos y precios están en soles (S/).`

const ROLES: Record<string, string> = {
  admin_sistema: 'administrador del sistema (gestiona tiendas, solicitudes y tasas BCRP)',
  admin_tienda: 'administrador de un negocio (registra ventas, cobranza, clientes y productos)',
  cliente: 'cliente de una tienda (consulta su cuenta, compras, cuotas y pagos)',
}

// deno-lint-ignore no-explicit-any
async function datosCliente(db: any, clienteId: string) {
  const [c, deuda, periodos, ventas, pagos] = await Promise.all([
    db
      .from('clientes')
      .select('nombre, moneda, tipo_tasa, tasa_compensatoria, periodo_tasa, capitalizacion, tipo_tasa_moratoria, tasa_moratoria, periodo_tasa_moratoria, capitalizacion_moratoria, limite_credito, plazo_max_meses, dia_corte, dia_pago')
      .eq('id', clienteId)
      .single(),
    db.rpc('fn_deuda_vigente', { p_cliente_id: clienteId }),
    db.rpc('periodos_pendientes', { p_cliente_id: clienteId }),
    db
      .from('ventas')
      .select('fecha_compra, cantidad, monto_capital, modalidad_pago, num_cuotas, valor_cuota, fecha_pago_pactada, estado_pago, productos(nombre)')
      .eq('cliente_id', clienteId)
      .order('fecha_hora_compra', { ascending: false })
      .limit(30),
    db
      .from('pagos')
      .select('fecha_efectiva_pago, monto_pagado, interes_moratorio, interes_compensatorio, capital, dias_mora')
      .eq('cliente_id', clienteId)
      .order('fecha_efectiva_pago', { ascending: false })
      .limit(10),
  ])
  if (c.error) throw new ErrorHttp(400, c.error.message)

  // Próximo pago con la mora acumulada a hoy, igual que en Mi cuenta.
  let proximoPago = null
  const proximo = periodos.data?.[0]
  if (proximo) {
    const hoy = hoyLima()
    const r = await db.rpc('estado_cuenta', {
      p_cliente_id: clienteId,
      p_fecha_pago: proximo.fecha_pago,
      p_fecha_efectiva: hoy > proximo.fecha_pago ? hoy : proximo.fecha_pago,
    })
    if (!r.error && r.data) {
      // Sin DNI: el modelo no lo necesita.
      const { documento: _d, clienteId: _c, ...resto } = r.data
      proximoPago = resto
    }
  }

  return {
    cliente: { ...c.data, moneda: 'soles (S/)', tipo_tasa: c.data.tipo_tasa ? 'nominal' : 'efectiva', tipo_tasa_moratoria: c.data.tipo_tasa_moratoria ? 'nominal' : 'efectiva' },
    deuda_vigente_capital: Number(deuda.data ?? 0),
    periodos_pendientes: periodos.data ?? [],
    proximo_pago: proximoPago,
    ventas: ventas.data ?? [],
    ultimos_pagos: pagos.data ?? [],
  }
}

function limpiarMensajes(m: unknown) {
  if (!Array.isArray(m) || m.length === 0) throw new ErrorHttp(400, 'Faltan mensajes')
  return m.slice(-MAX_MENSAJES).map((x) => {
    const role = x?.role === 'assistant' ? 'assistant' : 'user' // nunca 'system' desde el navegador
    return { role, content: String(x?.content ?? '').slice(0, MAX_CARACTERES) }
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    if (req.method !== 'POST') throw new ErrorHttp(405, 'Método no permitido')
    const nvidia = Deno.env.get('NVIDIA_API_KEY')
    if (!nvidia) throw new ErrorHttp(500, 'El asistente no está configurado (falta NVIDIA_API_KEY)')

    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) throw new ErrorHttp(401, 'No autenticado')
    // Cliente con el token del usuario: todas las lecturas pasan por RLS.
    const db = createClient(Deno.env.get('SUPABASE_URL')!, clave('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: auth, error: eAuth } = await db.auth.getUser(token)
    if (eAuth || !auth.user) throw new ErrorHttp(401, 'Sesión inválida')

    const { data: perfil } = await db
      .from('perfiles')
      .select('rol, cliente_id, nombre, activo, tiendas(nombre_comercial)')
      .eq('id', auth.user.id)
      .maybeSingle()
    if (!perfil?.activo) throw new ErrorHttp(403, 'Usuario inactivo')

    const mensajes = limpiarMensajes((await req.json()).mensajes)
    // deno-lint-ignore no-explicit-any
    const tienda = (perfil as any).tiendas?.nombre_comercial
    const datos = perfil.rol === 'cliente' && perfil.cliente_id ? await datosCliente(db, perfil.cliente_id) : null

    const sistema = `Eres el asistente de CuentaVecina, un sistema web peruano de crédito para bodegas y tiendas de barrio (fiado con intereses, compras a fin de mes y en cuotas).
Responde siempre en español, breve, claro y amable, en texto plano (sin Markdown). Hoy es ${hoyLima()} (hora de Lima).
Usuario: ${perfil.nombre ?? 'sin nombre'}, ${ROLES[perfil.rol] ?? perfil.rol}${tienda ? `, tienda "${tienda}"` : ''}.

Reglas del sistema (úsalas en vez de suposiciones generales):${AYUDA}

${datos ? `Datos de la cuenta del usuario (JSON, montos en ${datos.cliente.moneda}; fechas YYYY-MM-DD, muéstralas como DD/MM/AAAA):
${JSON.stringify(datos)}

Responde sobre su cuenta solo con estos datos; no inventes montos ni fechas. Si algo no está aquí, dile que lo consulte con su tienda.` : 'No tienes acceso a datos de cuentas; para montos concretos indícale dónde verlos en el sistema.'}
No puedes registrar pagos, ventas ni cambios: solo informar. Si preguntan algo ajeno a CuentaVecina o a sus finanzas, redirige amablemente.`

    const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${nvidia}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELO,
        messages: [{ role: 'system', content: sistema }, ...mensajes],
        max_tokens: 700,
        temperature: 0.3,
        chat_template_kwargs: { enable_thinking: false }, // sin razonamiento: respuesta directa y rápida
      }),
    })
    if (!r.ok) {
      console.error('NVIDIA', r.status, await r.text())
      throw new ErrorHttp(502, r.status === 429 ? 'El asistente está saturado, intenta en un minuto' : 'El asistente no está disponible')
    }
    const salida = await r.json()
    return json({ respuesta: salida.choices?.[0]?.message?.content ?? 'No tengo respuesta.' })
  } catch (e) {
    return responderError(e)
  }
})
