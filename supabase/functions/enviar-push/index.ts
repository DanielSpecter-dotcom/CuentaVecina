// Edge Function: enviar-push
// La llama la base de datos (trigger trg_notificaciones_push vía pg_net) cada vez que se crea una
// notificación para un usuario que activó las notificaciones push en su celular o navegador.
//
// Body: { notificacion_id }
// Seguridad: no recibe el texto del aviso, solo su id (UUID imposible de adivinar). Carga la notificación
// con la clave secreta y la marca como enviada de forma atómica: llamarla dos veces no repite el aviso.
//
// Secrets necesarios (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  (generar con: npx web-push generate-vapid-keys)
//   VAPID_SUBJECT (opcional, p. ej. mailto:grupo03@cuentavecina.pe)
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import webpush from 'npm:web-push@3.6.7'
import { clave, cors, ErrorHttp, json, responderError } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    if (req.method !== 'POST') throw new ErrorHttp(405, 'Método no permitido')
    const { notificacion_id } = await req.json().catch(() => ({}))
    if (typeof notificacion_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(notificacion_id)) {
      throw new ErrorHttp(400, 'notificacion_id inválido')
    }

    const publica = Deno.env.get('VAPID_PUBLIC_KEY')
    const privada = Deno.env.get('VAPID_PRIVATE_KEY')
    if (!publica || !privada) return json({ ok: false, motivo: 'Push no configurado: faltan VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY' })
    webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:soporte@cuentavecina.pe', publica, privada)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, clave('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Marca como enviada solo si aún no lo estaba (evita duplicados).
    const { data: n } = await admin
      .from('notificaciones')
      .update({ push_enviada: true })
      .eq('id', notificacion_id)
      .eq('push_enviada', false)
      .select('perfil_id, tipo, titulo, cuerpo, url')
      .maybeSingle()
    if (!n) return json({ ok: true, enviados: 0 })

    const { data: suscripciones } = await admin.from('suscripciones_push').select('id, endpoint, p256dh, auth').eq('perfil_id', n.perfil_id)
    const mensaje = JSON.stringify({ titulo: n.titulo, cuerpo: n.cuerpo, url: n.url ?? '/', tag: n.tipo })
    let enviados = 0
    for (const s of suscripciones ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, mensaje, {
          TTL: 60 * 60 * 24, // si el celular está apagado, el aviso espera hasta 1 día
          urgency: n.tipo === 'VENCIDO' ? 'high' : 'normal',
        })
        enviados++
      } catch (e) {
        const estado = (e as { statusCode?: number }).statusCode
        // 404/410: el usuario desinstaló la app o quitó el permiso → se borra la suscripción.
        if (estado === 404 || estado === 410) await admin.from('suscripciones_push').delete().eq('id', s.id)
        else console.error('Error enviando push', estado, e)
      }
    }
    return json({ ok: true, enviados })
  } catch (e) {
    return responderError(e)
  }
})
