// Utilidades de fechas. Todas las fechas de negocio se manejan como 'YYYY-MM-DD'
// en hora de Lima (America/Lima), porque la fecha de corte depende del día local.

export const ZONA_HORARIA = 'America/Lima'

const MS_DIA = 86_400_000

function aUTC(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function aISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Días calendario transcurridos entre dos fechas (b − a). */
export function diffDias(a: string, b: string): number {
  return Math.round((aUTC(b) - aUTC(a)) / MS_DIA)
}

/** Construye una fecha con el día indicado en el mes (y, m) — m de 1 a 12, admite desbordes. */
export function fechaDelMes(y: number, m: number, dia: number): string {
  return aISO(Date.UTC(y, m - 1, dia))
}

/** Suma n meses manteniendo el mismo día del mes (los días de corte/pago van de 1 a 28). */
export function sumarMeses(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return fechaDelMes(y, m + n, d)
}

/** Fecha y hora local de Lima para un instante dado. */
export function fechaHoraLima(instante: Date = new Date()): { fecha: string; hora: string } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instante)
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]))
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}:${p.second}` }
}

export function hoyLima(): string {
  return fechaHoraLima().fecha
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' para mostrar. */
export function formatearFecha(fecha: string | null | undefined): string {
  if (!fecha) return '—'
  const [y, m, d] = fecha.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
