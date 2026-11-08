// Utilidades comunes de las Edge Functions (Supabase no despliega carpetas que empiezan con "_").
export const cors = {
  // En producción, definir el secret ORIGEN_PERMITIDO (p. ej. https://cuentavecina.vercel.app).
  'Access-Control-Allow-Origin': Deno.env.get('ORIGEN_PERMITIDO') ?? '*',
  Vary: 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export class ErrorHttp extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

/** Lee la clave nueva (JSON { default }) y si no existe usa la legacy. */
export function clave(nuevas: string, legacy: string): string {
  const k = Deno.env.get(nuevas)
  if (k) {
    try {
      const v = JSON.parse(k)
      if (v.default) return v.default
    } catch { /* usa la clave legacy */ }
  }
  const l = Deno.env.get(legacy)
  if (!l) throw new ErrorHttp(500, `Falta la clave ${legacy} del proyecto`)
  return l
}

/** Errores esperados (ErrorHttp) se devuelven tal cual; los inesperados se registran y no exponen detalles internos. */
export function responderError(e: unknown) {
  if (e instanceof ErrorHttp) return json({ error: e.message }, e.status)
  console.error(e)
  return json({ error: 'Error inesperado en el servidor' }, 500)
}
