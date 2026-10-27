// Copiado del proyecto de juegos (Rule) con scripts/export-topcode.mjs: no editar aquí.
// La semana de juegos: empieza el lunes y se reinicia el domingo a las 23:59 (hora del instituto).
// Todo se calcula en la zona horaria WEEK_TZ (por defecto Atlantic/Canary) aunque el servidor esté en otra.
export const WEEK_TZ = process.env.WEEK_TZ || 'Atlantic/Canary'
const MINUTE = 60000
const DAY = 24 * 60 * MINUTE
// El reinicio es a las 23:59: desplazando el reloj un minuto, la semana empieza a las 00:00 del lunes.
const SHIFT = MINUTE

const formatters = new Map()
function wall(t, tz) {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatters.set(tz, f)
  }
  const parts = Object.fromEntries(f.formatToParts(t).map((p) => [p.type, Number(p.value)]))
  // Hora local leída como si fuera UTC: sirve para contar días sin pelearse con el horario de verano.
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
}

// Instante real (UTC) de una hora local de la zona.
function fromWall(local, tz) {
  let t = local
  for (let i = 0; i < 3; i++) t += local - wall(t, tz)
  return t
}

const isoDay = (local) => new Date(local).toISOString().slice(0, 10)

// Datos de la semana que contiene el instante t.
export function weekOf(t = Date.now(), tz = WEEK_TZ) {
  const local = wall(t, tz) + SHIFT
  const day = (new Date(local).getUTCDay() + 6) % 7 // lunes = 0 … domingo = 6
  const monday = local - (local % DAY) - day * DAY
  return {
    key: isoDay(monday), // fecha del lunes: «2026-10-12»
    day,
    start: fromWall(monday - SHIFT, tz), // domingo anterior a las 23:59
    resetAt: fromWall(monday + 7 * DAY - SHIFT, tz), // este domingo a las 23:59
  }
}
