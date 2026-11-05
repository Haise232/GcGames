// Reglas puras del Atraco: las usan la pantalla y el servidor (api/_juegos/solo.mjs). Apuestas y bajas planta a planta
// por la cámara acorazada; en cada planta eliges la ruta: sigilo (casi seguro, paga poco), normal o a lo loco (arriesgado,
// paga mucho). Si te pillan pierdes la apuesta; si no, el botín se multiplica. Te retiras cuando quieras.
// La banda: hasta 3 cartas tuyas del gacha. No cambian las probabilidades (el retorno es el mismo con o sin banda), pero
// cada una desbloquea plantas más profundas, que es donde están los multiplicadores enormes.
export const MIN_BET = 10
export const MAX_BET = 2000
export const STEP = 10
export const HOUSE = 0.96 // retorno esperado, elijas las rutas que elijas y te retires donde te retires
export const MAX_MULT = 250 // botín máximo: al llegar, la banda sale sola con él
export const BASE_FLOORS = 4 // plantas sin banda
export const MAX_FLOORS = 12
export const CREW_MAX = 3

// Rutas: probabilidad de pasar (num/den) y lo que multiplica el botín (den/num: así cada planta no cambia el retorno).
export const ROUTES = {
  sigilo: { name: 'Sigilo', num: 4, den: 5, icon: '🤫', text: 'Por los conductos del aire' },
  normal: { name: 'Normal', num: 2, den: 3, icon: '🚪', text: 'Por el pasillo de seguridad' },
  loco: { name: 'A lo loco', num: 2, den: 5, icon: '💥', text: 'Volando la pared' },
}
export const routeMult = (route) => ROUTES[route].den / ROUTES[route].num
export const routeChance = (route) => ROUTES[route].num / ROUTES[route].den

// Plantas que desbloquea cada carta según su rareza.
export const RARITY_FLOORS = { comun: 1, rara: 2, epica: 3, mitica: 4, unica: 6 }
export const floorsFor = (rarities) => Math.min(MAX_FLOORS, BASE_FLOORS + rarities.reduce((sum, r) => sum + (RARITY_FLOORS[r] ?? 0), 0))

// Papel de cada carta en la banda (solo de adorno: depende de su id, así siempre es el mismo).
export const ROLES = ['Hacker', 'Músculo', 'Conductor', 'Cerrajero', 'Cerebro', 'Vigía']
export function roleOf(id) {
  let h = 0
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return ROLES[h % ROLES.length]
}

// Multiplicador del botín tras las rutas superadas (con la ventaja de la casa, redondeado a la centésima hacia abajo).
export function multOf(routes) {
  if (!routes.length) return 0
  const raw = routes.reduce((m, r) => m * routeMult(r), HOUSE)
  return Math.min(MAX_MULT, Math.floor(raw * 100) / 100)
}
export const payout = (bet, routes) => Math.floor(bet * multOf(routes))

// ¿Sale bien la ruta? rand(n): entero de 0 a n-1 (en el servidor, randomInt de node:crypto).
export const survives = (route, rand) => rand(ROUTES[route].den) < ROUTES[route].num

export const validBet = (bet) => Number.isInteger(bet) && bet >= MIN_BET && bet <= MAX_BET && bet % STEP === 0
export const validRoute = (route) => typeof route === 'string' && Object.hasOwn(ROUTES, route)
export const validCrew = (crew) =>
  Array.isArray(crew) && crew.length <= CREW_MAX && new Set(crew).size === crew.length && crew.every((id) => typeof id === 'string' && id.length <= 80)

// --- Ayudas de la pantalla ---
export const maxBetFor = (balance) => Math.min(MAX_BET, Math.floor(balance / STEP) * STEP)
export const clampBet = (bet, max) => Math.max(MIN_BET, Math.min(Math.max(max, MIN_BET), Math.round(bet / STEP) * STEP))
export const fmtMult = (m) => `×${m.toLocaleString('es-ES', { maximumFractionDigits: 2 })}`
