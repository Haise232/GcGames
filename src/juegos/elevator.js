// Reglas puras del Ascensor (en vivo): las usan la pantalla y el servidor (api/_juegos/ascensor.mjs).
// Cada ROUND_MS hay un viaje para todos. Durante JOIN_MS pagas la entrada; después el ascensor sube con todos dentro y
// cada vez más deprisa: tarda travelMs(f) en llegar a la planta f y allí abre las puertas openMs(f), las dos cosas más
// cortas cuanto más arriba. Con las puertas abiertas puedes bajarte y cobrar tu entrada por el multiplicador de esa
// planta (MULTS), o dejar puesta una planta para bajarte solo. En un trayecto al azar se rompe el cable: quien sigue
// dentro lo pierde todo. Si llega a la azotea (FLOORS), cobran todos.
// Además, el último en bajarse antes de que caiga se lleva el bonus: un BONUS de todas las entradas del viaje.
// El cable solo se rompe mientras viaja (con las puertas cerradas): así el servidor puede enseñar la caída en cuanto
// nadie puede bajarse ya, sin que la pantalla vea llegar la cabina a una planta a la que no llegó.
// Los multiplicadores van en centésimas enteras (245 = 2,45×), como en el cohete.
export const ROUND_MS = 40000
export const JOIN_MS = 10000
export const FLOORS = 16 // la azotea
// Trayecto hasta la planta f: de 0,82 s a 0,65 s. No baja de ahí porque la pantalla pregunta al servidor si el cable
// aguantó a los 450 ms de salir y la cabina no llega a una planta sin esa respuesta.
export const travelMs = (f) => Math.max(650, 820 - (f - 1) * 12)
// Puertas abiertas en la planta f: de 1,1 s en la primera a 0,54 s en la 15. Arriba hay que decidirse rápido.
export const openMs = (f) => 1100 - (f - 1) * 40
// Momento de salida hacia cada planta, contado desde que sale de la planta baja (DEPART[1] = 0).
const DEPART = [0, 0]
for (let f = 1; f < FLOORS; f++) DEPART.push(DEPART[f] + travelMs(f) + openMs(f))
export const RIDE_MS = DEPART[FLOORS] + travelMs(FLOORS)
export const MIN_STAKE = 100
export const MAX_STAKE = 2000
export const STAKE_STEP = 100
// Retorno esperado de bajarse en cualquier planta (sin el bonus). Por debajo del 100 % para que el Score no se pueda
// «cultivar»; el bonus añade de media un BONUS más para el conjunto de los jugadores.
export const HOUSE = 0.92
export const BONUS = 0.03

// Multiplicador de cada planta (la 0 es la planta baja, donde se entra). Suave al principio y muy fuerte arriba.
export const MULTS = [100, 105, 115, 130, 150, 175, 205, 245, 295, 360, 450, 570, 730, 950, 1250, 1700, 2500]

export const validStake = (n) => Number.isInteger(n) && n >= MIN_STAKE && n <= MAX_STAKE && n % STAKE_STEP === 0
// Plantas en las que uno se puede bajar (a mano o con la bajada automática): de la 1 a la de debajo de la azotea.
export const validFloor = (f) => Number.isInteger(f) && f >= 1 && f < FLOORS

// Probabilidad de que el cable aguante hasta la planta f: HOUSE / multiplicador. Así, te bajes donde te bajes, de media
// recuperas el 92 % de la entrada.
export const survival = (f) => (f <= 0 ? 1 : Math.min(1, (HOUSE * 100) / MULTS[f]))

// Planta a la que el ascensor no llega (el cable se rompe yendo hacia ella) a partir de un número uniforme en [0, 1):
// la primera f con u ≥ survival(f). FLOORS + 1 si llega a la azotea. P(llegar a f) = survival(f) para cada planta.
export function crashFromUniform(u) {
  for (let f = 1; f <= FLOORS; f++) if (u >= survival(f)) return f
  return FLOORS + 1
}

export const rideStart = (round) => round * ROUND_MS + JOIN_MS
// Sale hacia la planta f (cierra las puertas de la f - 1).
export const departAt = (round, f) => rideStart(round) + DEPART[f]
// Llega a la planta f y abre las puertas.
export const arriveAt = (round, f) => departAt(round, f) + travelMs(f)
// Final del viaje: cuando se rompe el cable (al salir hacia la planta crash) o cuando llega a la azotea.
export const rideEnd = (round, crash) => (crash > FLOORS ? arriveAt(round, FLOORS) : departAt(round, crash))

// Fase según el reloj: «join» (se entra), «ride» (sube) o «after» (ya pasó el viaje más largo posible). En «ride»,
// floor es la última planta a la que ha llegado (0 al salir), open si tiene las puertas abiertas y pos su altura en
// plantas (con decimales mientras viaja). Si el cable se rompe antes, eso lo dice el servidor.
export function phaseAt(t) {
  const round = Math.floor(t / ROUND_MS)
  const offset = t - round * ROUND_MS
  if (offset < JOIN_MS) return { round, offset, phase: 'join', floor: 0, open: false, pos: 0 }
  const into = offset - JOIN_MS
  if (into >= RIDE_MS) return { round, offset, phase: 'after', floor: FLOORS, open: false, pos: FLOORS }
  let k = 0 // trayecto de la planta k a la k + 1
  while (k + 1 < FLOORS && into >= DEPART[k + 2]) k++
  const inStep = into - DEPART[k + 1]
  const travel = travelMs(k + 1)
  if (inStep < travel) return { round, offset, phase: 'ride', floor: k, open: false, pos: k + inStep / travel }
  return { round, offset, phase: 'ride', floor: k + 1, open: true, pos: k + 1 }
}

export const payout = (stake, f) => Math.floor((stake * MULTS[f]) / 100)

// Dónde se bajó de verdad un jugador: { exit, auto } de su partida y la planta del cable. Devuelve la planta o null si
// cayó con el ascensor.
export function exitOf(p, crash) {
  if (p.exit != null && p.exit < crash) return p.exit
  if (p.auto != null && p.auto < crash) return p.auto
  return crash > FLOORS ? FLOORS : null
}

// Reparto: players [{ owner, stake, exit, auto }] y la planta del cable. Devuelve { prizes { owner: € }, top (planta del
// último en bajar), bonus (lo que se reparte), winners (owners del bonus), house (lo que gana la casa), pot }.
export function settle(players, crash) {
  const pot = players.reduce((sum, p) => sum + p.stake, 0)
  const prizes = {}
  let top = null
  for (const p of players) {
    const f = exitOf(p, crash)
    if (f === null) continue
    prizes[p.owner] = payout(p.stake, f)
    if (top === null || f > top) top = f
  }
  const bonus = top === null ? 0 : Math.floor(pot * BONUS)
  const winners = top === null ? [] : players.filter((p) => exitOf(p, crash) === top)
  const weight = winners.reduce((sum, p) => sum + p.stake, 0)
  let paidBonus = 0
  for (const p of winners) {
    const share = Math.floor((bonus * p.stake) / weight)
    prizes[p.owner] += share
    paidBonus += share
  }
  const paid = Object.values(prizes).reduce((sum, n) => sum + n, 0)
  return { prizes, top, bonus: paidBonus, winners: winners.map((p) => p.owner), house: pot - paid, pot }
}

// «2,45×»
export const fmtMult = (mult) => `${(mult / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`
