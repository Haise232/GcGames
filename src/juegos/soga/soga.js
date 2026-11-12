// Tira y Afloja: reglas compartidas por la pantalla y el servidor (api/_juegos/soga.mjs).
// Una ronda para todo el casino cada ROUND_MS: primero se elige equipo (rojo o azul) pagando la entrada, luego se tira
// de la cuerda pulsando todo lo rápido que se pueda durante PULL_MS. Gana el equipo que más tira de media (así da igual
// que un equipo tenga más gente) y sus miembros se reparten todas las entradas. Si un equipo se queda vacío, o empatan,
// se devuelve la entrada: aquí el dinero solo cambia de manos entre jugadores.

export const VERSION = 1
export const ROUND_MS = 45000
export const JOIN_MS = 24000 // elegir equipo
export const READY_MS = 3000 // «preparados…»
export const PULL_MS = 12000
export const ENTRY = 200
export const TAP_RATE = 12 // tirones por segundo que se cuentan como mucho
export const MAX_TAPS = (PULL_MS / 1000) * TAP_RATE
export const TEAMS = ['r', 'b']
export const TEAM_NAME = { r: 'Rojo', b: 'Azul' }

export const roundOf = (t) => Math.floor(t / ROUND_MS)
export const pullStart = (round) => round * ROUND_MS + JOIN_MS + READY_MS
export const pullEnd = (round) => pullStart(round) + PULL_MS

// Fase a la hora t: join (elegir equipo), ready (cuenta atrás), pull (tirando) o result.
export function phaseAt(t) {
  const round = roundOf(t)
  const t0 = round * ROUND_MS
  const start = pullStart(round)
  const end = pullEnd(round)
  const phase = t < t0 + JOIN_MS ? 'join' : t < start ? 'ready' : t < end ? 'pull' : 'result'
  return { round, phase, joinEnd: t0 + JOIN_MS, start, end, next: t0 + ROUND_MS }
}

// Lo máximo que se puede haber tirado ms después de empezar.
export const capAt = (ms) => Math.max(0, Math.min(MAX_TAPS, Math.ceil((ms / 1000) * TAP_RATE)))

// Resultado de una ronda. members: [{ team, taps }]. Devuelve la media de cada equipo, quién gana (null: se devuelve) y
// lo que cobra cada miembro del equipo ganador.
export function outcome(members) {
  const of = (team) => members.filter((m) => m.team === team)
  const avg = (team) => {
    const list = of(team)
    return list.length ? list.reduce((sum, m) => sum + (m.taps ?? 0), 0) / list.length : 0
  }
  const count = { r: of('r').length, b: of('b').length }
  const mean = { r: avg('r'), b: avg('b') }
  const refund = count.r === 0 || count.b === 0 || mean.r === mean.b
  const winner = refund ? null : mean.r > mean.b ? 'r' : 'b'
  const pot = members.length * ENTRY
  const share = winner ? Math.floor(pot / count[winner]) : ENTRY
  return { count, mean, refund, winner, pot, share }
}

// Dónde está el pañuelo de la cuerda, de -1 (gana el rojo) a 1 (gana el azul), según lo que lleva tirado cada equipo.
export function ropeAt(meanR, meanB) {
  const diff = meanB - meanR
  return Math.max(-1, Math.min(1, diff / 14))
}
