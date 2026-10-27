// Copiado del proyecto de juegos (Rule) con scripts/export-topcode.mjs: no editar aquí.
// Mesas públicas: cualquiera con sesión entra sin código. Hay siempre una por juego y, si se llena, se abre otra.
export const PUBLIC_SEATS = { blackjack: 7, poker: 6 }
export const GAMES = Object.keys(PUBLIC_SEATS)

export const seated = (room) => room.seats.filter(Boolean).length
const hasSeat = (room) => room.seats.some((seat) => !seat)

// Para jugar: la mesa más llena que aún tenga sitio, así la gente coincide. Para mirar: la más llena.
// Devuelve null si hay que abrir otra mesa.
export function pickTable(tables, play) {
  const candidates = play ? tables.filter(hasSeat) : tables
  let best = null
  for (const room of candidates) if (!best || seated(room) > seated(best)) best = room
  return best
}

// Número libre más bajo: «Mesa 1», «Mesa 2»…
export function nextNumber(tables) {
  const used = new Set(tables.map((room) => room.number))
  let n = 1
  while (used.has(n)) n++
  return n
}

// Resumen de una mesa para el selector de juegos.
export function summary(room) {
  const members = [...room.members.values()]
  return {
    code: room.code,
    game: room.game,
    label: room.label,
    seats: room.seats.length,
    players: seated(room),
    spectators: members.filter((m) => m.seat === null).length,
    people: room.seats.filter(Boolean).map((seat) => ({ name: seat.name, avatar: seat.avatar ?? null })),
    phase: room.phase,
  }
}
