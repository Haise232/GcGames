// Juegos en solitario (ruleta, cohete, Plinko, la rana, la carrera de coches, la Torre, el Atraco, Pez Gordo y Tesoro en la Arena) con el saldo semanal: el servidor sortea
// con randomInt y aplica las mismas reglas puras que pinta la pantalla (src/juegos/*.js), así el
// navegador no puede elegir su resultado. Cada función devuelve { error } o el resultado con `delta`, lo que cambia
// el saldo, y `saved`, lo que hay que guardar para la siguiente jugada (racha y apuesta de la ruleta y del cohete).
import { createHmac } from 'node:crypto'
import * as roulette from '../../src/juegos/roulette/roulette.js'
import * as pez from '../../src/juegos/fish/pez.js'
import * as arena from '../../src/juegos/dig/arena.js'
import * as dive from '../../src/juegos/dive/dive.js'
import * as plinko from '../../src/juegos/plinko/plinko.js'
import * as crash from '../../src/juegos/crash/crash.js'
import * as frog from '../../src/juegos/frog/frog.js'
import * as race from '../../src/juegos/race/race.js'
import * as tower from '../../src/juegos/tower/tower.js'
import * as heist from '../../src/juegos/heist/heist.js'
import { cardView } from './gacha.mjs'

export const SOLO_GAMES = {
  solo_roulette: 'roulette',
  solo_fish: 'fish',
  solo_dig: 'dig',
  solo_dive: 'dive',
  solo_plinko: 'plinko',
  solo_crash: 'crash',
  solo_frog: 'frog',
  solo_race: 'race',
  solo_tower: 'tower',
  solo_heist: 'heist',
}

// --- Ruleta en vivo: una sola rueda para todos que gira cada ROUND_MS, como en un casino en directo. ---
// Cada ronda empieza en un múltiplo de ROUND_MS desde 1970: abre apuestas, «no va más», la bola gira y se ve el número.
// El número y los relámpago de la ronda salen de un HMAC con un secreto del servidor: todos ven el mismo, no hace falta
// guardar cada tirada y nadie puede calcularlo antes de tiempo. El servidor no lo revela hasta REVEAL_MS.
export const { ROUND_MS, BETS_MS, SPIN_MS } = roulette
const GRACE_MS = 600 // apuestas que salieron del navegador justo antes del «no va más» y llegan un poco tarde
const REVEAL_MS = BETS_MS + GRACE_MS
const HISTORY = 100
const draws = new Map()

export const roundOf = (t) => Math.floor(t / ROUND_MS)
const revealAt = (round) => round * ROUND_MS + REVEAL_MS

// Enteros de 32 bits uniformes a partir de HMAC(secreto, etiqueta, bloque): nadie sin el secreto puede adelantarlos.
export function hmacStream(secret, label) {
  let block = 0
  let bytes = Buffer.alloc(0)
  let pos = 0
  return () => {
    if (pos + 4 > bytes.length) {
      bytes = createHmac('sha256', secret).update(`${label}:${block++}`).digest()
      pos = 0
    }
    const value = bytes.readUInt32BE(pos)
    pos += 4
    return value
  }
}

// Sorteo de una ronda: enteros uniformes (rechazo) a partir de HMAC(secreto, ronda, bloque).
export function drawRound(secret, round) {
  const key = `${round}`
  const hit = draws.get(key)
  if (hit) return hit
  const next32 = hmacStream(secret, `ruleta:${round}`)
  const rand = (n) => {
    const limit = 2 ** 32 - (2 ** 32 % n)
    for (;;) {
      const value = next32()
      if (value < limit) return value % n
    }
  }
  const draw = { number: rand(roulette.WHEEL.length), lucky: roulette.pickLucky(rand) }
  if (draws.size > 5000) draws.clear()
  draws.set(key, draw)
  return draw
}

// Últimas tiradas ya reveladas, de la más reciente a la más antigua.
function history(secret, t) {
  const last = t >= revealAt(roundOf(t)) ? roundOf(t) : roundOf(t) - 1
  return { last, numbers: Array.from({ length: HISTORY }, (_, i) => drawRound(secret, last - i).number) }
}

// ¿Hay una apuesta guardada cuyo número ya se conoce? Entonces hay que pagarla antes de nada.
export const rouletteDue = (saved, t) => Boolean(saved?.bets?.length) && t >= revealAt(saved.round)

// Lo que ve la pantalla: reloj del servidor, ronda actual, tus fichas confirmadas y las últimas tiradas.
export function rouletteView(saved, balance, { now: t, secret }) {
  const round = roundOf(t)
  const revealed = t >= revealAt(round)
  const draw = revealed ? drawRound(secret, round) : null
  return {
    now: t,
    round,
    number: draw?.number ?? null,
    lucky: draw?.lucky ?? null,
    bets: saved?.round === round && !revealed ? (saved.bets ?? []) : [],
    streak: saved?.streak ?? 0,
    last: saved?.last ?? null,
    history: history(secret, t),
    balance,
  }
}

// msg.a: «sync» (ponerse al día) o «bet» (tus fichas de esta ronda; una lista vacía las retira).
export function rouletteLive(msg, balance, saved, _rand, ctx) {
  const t = ctx.now
  let state = { streak: 0, ...(saved ?? {}) }
  let delta = 0
  let changed = false
  // 1. Se paga la apuesta de una ronda que ya tiene número (si es de otra semana, el saldo ya se reinició: se descarta).
  if (rouletteDue(state, t)) {
    const placed = state.bets
    if (state.week === ctx.week) {
      const { number, lucky } = drawRound(ctx.secret, state.round)
      const result = roulette.settle(placed, number, lucky, state.streak, state.floor)
      const stake = roulette.totalOf(placed)
      delta += result.payout + result.bonus
      state = { ...state, streak: result.streak, floor: result.floor, last: { round: state.round, number, stake, ...result } }
    }
    state = { ...state, bets: [] }
    changed = true
  }
  // 2. Fichas nuevas para la ronda en curso.
  if (msg.a === 'bet') {
    const round = roundOf(t)
    if (msg.round !== round || t >= round * ROUND_MS + BETS_MS + GRACE_MS) return { error: 'BETS_CLOSED' }
    const placed = Array.isArray(msg.bets) ? msg.bets : null
    if (!placed || (placed.length > 0 && !roulette.validBets(placed))) return { error: 'BAD_MESSAGE' }
    // Lo que ya tenías en esta ronda vuelve al saldo y se cobra la apuesta nueva entera.
    const before = state.round === round ? roulette.totalOf(state.bets ?? []) : 0
    const stake = roulette.totalOf(placed)
    if (stake - before > balance + delta) return { error: 'INSUFFICIENT_FUNDS' }
    delta += before - stake
    state = { ...state, round, week: ctx.week, bets: placed }
    changed = true
  } else if (msg.a !== 'sync') {
    return { error: 'BAD_MESSAGE' }
  }
  return {
    delta,
    played: changed,
    saved: changed ? state : null,
    result: rouletteView(state, balance + delta, ctx),
  }
}

// Con suerte del Admin Abuse (ctx.luck 2 o 3) se tiran tantas bolas y cae la que más paga.
export function plinkoDrop(msg, balance, _saved, rand, ctx) {
  if (!plinko.validBet(msg.bet) || !plinko.validRisk(msg.risk)) return { error: 'BAD_MESSAGE' }
  if (msg.bet > balance) return { error: 'INSUFFICIENT_FUNDS' }
  let path = plinko.dropPath(rand)
  for (let i = 1; i < (ctx.luck ?? 1); i++) {
    const other = plinko.dropPath(rand)
    if (plinko.payoutOf(msg.bet, msg.risk, plinko.slotOf(other)) > plinko.payoutOf(msg.bet, msg.risk, plinko.slotOf(path))) path = other
  }
  const slot = plinko.slotOf(path)
  const payout = plinko.payoutOf(msg.bet, msg.risk, slot)
  const delta = payout - msg.bet
  return { delta, played: true, saved: null, result: { path, slot, payout, balance: balance + delta } }
}

// --- Cohete en vivo: un multiplicador que sube para todos a la vez; quien retira antes de que explote, cobra. ---
// Como la ruleta: rondas fijas de crash.ROUND_MS y el punto de explosión sale de HMAC(secreto, ronda). El servidor no lo
// revela hasta que el cohete ha explotado, y para retirar usa su propio reloj.
const CRASH_HISTORY = 30
const crashDraws = new Map()

// Dónde explota la ronda y a qué hora (ms del reloj del servidor).
export function crashDraw(secret, round) {
  const hit = crashDraws.get(round)
  if (hit) return hit
  const mult = crash.crashFromUniform(hmacStream(secret, `cohete:${round}`)() / 2 ** 32)
  const draw = { crash: mult, at: round * crash.ROUND_MS + crash.BETS_MS + crash.msFor(mult) }
  if (crashDraws.size > 5000) crashDraws.clear()
  crashDraws.set(round, draw)
  return draw
}

// ¿Hay una apuesta guardada de una ronda que ya explotó? Entonces se liquida antes de nada (retiro automático o perdida).
export const crashDue = (saved, t, secret) => saved?.bet > 0 && t >= crashDraw(secret, saved.round).at

// Cuánto esperar desde `t` hasta la explosión de la ronda en curso (0 si ya explotó o aún no ha despegado).
export function crashWaitMs(secret, t) {
  const round = crash.phaseAt(t).round
  const flightStart = round * crash.ROUND_MS + crash.BETS_MS
  if (t < flightStart) return 0
  return Math.max(0, crashDraw(secret, round).at - t)
}

export function crashView(saved, balance, { now: t, secret }) {
  const round = crash.phaseAt(t).round
  const draw = crashDraw(secret, round)
  const exploded = t >= draw.at
  const mine = saved?.round === round
  const newest = exploded ? round : round - 1
  return {
    now: t,
    round,
    crash: exploded ? draw.crash : null,
    bet: mine ? (saved.bet ?? 0) : 0,
    auto: mine ? (saved.auto ?? null) : null,
    last: saved?.last ?? null,
    history: { last: newest, crashes: Array.from({ length: CRASH_HISTORY }, (_, i) => crashDraw(secret, newest - i).crash) },
    balance,
  }
}

// msg.a: «sync» (ponerse al día), «bet» (bet y auto de esta ronda; bet 0 la retira) o «cashout» (retirar ya).
export function crashLive(msg, balance, saved, _rand, ctx) {
  const t = ctx.now
  let state = { ...(saved ?? {}) }
  let delta = 0
  let changed = false
  // 1. La apuesta de una ronda que ya explotó: cobra si tenía retiro automático por debajo de la explosión.
  if (crashDue(state, t, ctx.secret)) {
    if (state.week === ctx.week) {
      const { crash: at } = crashDraw(ctx.secret, state.round)
      const won = state.auto !== null && state.auto < at
      const paid = won ? crash.payout(state.bet, state.auto) : 0
      delta += paid
      state.last = { round: state.round, stake: state.bet, mult: won ? state.auto : null, auto: won, payout: paid, net: paid - state.bet }
    }
    state = { ...state, bet: 0, auto: null }
    changed = true
  }
  const { round, offset } = crash.phaseAt(t)
  if (msg.a === 'bet') {
    if (msg.round !== round || offset >= crash.BETS_MS + GRACE_MS) return { error: 'LAUNCHED' }
    const auto = msg.auto ?? null
    if (!crash.validBet(msg.bet) || !crash.validAuto(auto)) return { error: 'BAD_MESSAGE' }
    // Lo que ya tenías en esta ronda vuelve al saldo y se cobra la apuesta nueva entera.
    const before = state.round === round ? (state.bet ?? 0) : 0
    if (msg.bet === 0 && before === 0) return { delta, played: changed, saved: changed ? state : null, result: crashView(state, balance + delta, ctx) }
    if (msg.bet - before > balance + delta) return { error: 'INSUFFICIENT_FUNDS' }
    delta += before - msg.bet
    state = { ...state, round, week: ctx.week, bet: msg.bet, auto: msg.bet > 0 ? auto : null }
    changed = true
  } else if (msg.a === 'cashout') {
    // Llegó tarde: la apuesta de esta ronda ya se liquidó arriba porque el cohete explotó.
    if (changed && state.last?.round === round && msg.round === round) return { error: 'CRASHED' }
    if (msg.round !== round || state.round !== round || !(state.bet > 0) || state.week !== ctx.week) return { error: 'BAD_PHASE' }
    const flown = offset - crash.BETS_MS
    if (flown < 0) return { error: 'BAD_PHASE' }
    const draw = crashDraw(ctx.secret, round)
    if (t >= draw.at) return { error: 'CRASHED' }
    // Si el retiro automático ya se había alcanzado, manda él (se habría retirado antes).
    let mult = Math.min(crash.multiplierAt(flown), draw.crash - 1)
    if (state.auto !== null && state.auto <= mult) mult = state.auto
    const paid = crash.payout(state.bet, mult)
    delta += paid
    state = { ...state, bet: 0, auto: null, last: { round, stake: state.bet, mult, auto: false, payout: paid, net: paid - state.bet } }
    changed = true
  } else if (msg.a !== 'sync') {
    return { error: 'BAD_MESSAGE' }
  }
  return {
    delta,
    played: changed,
    saved: changed ? state : null,
    result: crashView(state, balance + delta, ctx),
  }
}

// --- Carrera de coches en vivo: una carrera para todos cada race.ROUND_MS; se apuesta al coche ganador. ---
// Como la ruleta: todo sale de HMAC(secreto, ronda). El servidor no suelta la carrera (quién gana y los tiempos) hasta que
// se cierran las apuestas, y entonces los navegadores la animan con las mismas reglas puras (race.js), así que todos ven lo mismo.
const RACE_HISTORY = 12
const raceDraws = new Map()

// Entero uniforme de 0 a n-1 a partir de un flujo de enteros de 32 bits (rechazo, sin sesgo).
export const uniform = (next32) => (n) => {
  const limit = 2 ** 32 - (2 ** 32 % n)
  for (;;) {
    const value = next32()
    if (value < limit) return value % n
  }
}

// Sorteo de una carrera: orden de llegada (todos los órdenes son igual de probables), tiempos y ritmos.
export function raceDraw(secret, round) {
  const hit = raceDraws.get(round)
  if (hit) return hit
  const rand = uniform(hmacStream(secret, `carrera:${round}`))
  // Orden de llegada: una permutación al azar de los coches (Fisher-Yates), el primero es el ganador.
  const order = Array.from({ length: race.CARS }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = rand(i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  // Tiempos: el ganador tarda 12-13,5 s y el resto llega muy cerca; una de cada tres, foto finish entre los dos primeros.
  const finish = Array(race.CARS).fill(0)
  let time = 12000 + rand(1501)
  order.forEach((car, place) => {
    if (place === 1) time += rand(100) < 35 ? 20 + rand(131) : 150 + rand(551)
    else if (place > 1) time += 80 + rand(521)
    // El tope se escalona por puesto para que nunca haya dos coches con el mismo tiempo.
    finish[car] = Math.min(time, race.RACE_MAX_MS - 500 - (race.CARS - 1 - place) * 30)
  })
  // Ritmo de cada coche: cuatro armónicos con Σ j·|aj| ≤ 0,263 < 1/π, así que nunca va marcha atrás (ver race.progress).
  // Bastante amplitud para que haya muchos adelantamientos antes de la llegada.
  const swing = (limit) => (rand(2 * limit + 1) - limit) / 10000
  const wobble = finish.map(() => [swing(600), swing(400), swing(250), swing(120)])
  const draw = { winner: order[0], order, finish, wobble, end: Math.max(...finish) }
  if (raceDraws.size > 5000) raceDraws.clear()
  raceDraws.set(round, draw)
  return draw
}

// ¿Hay una apuesta guardada de una carrera que ya acabó? Entonces se paga antes de nada.
export const raceDue = (saved, t, secret) => Boolean(saved?.bets?.length) && t >= race.startOf(saved.round) + raceDraw(secret, saved.round).end

// Últimos ganadores de carreras ya terminadas, de la más reciente a la más antigua.
function raceHistory(secret, t) {
  const out = []
  for (let r = race.phaseAt(t).round; out.length < RACE_HISTORY && r >= 0; r--) {
    if (t >= race.startOf(r) + raceDraw(secret, r).end) out.push(raceDraw(secret, r).winner)
  }
  return out
}

export function raceView(saved, balance, { now: t, secret }) {
  const round = race.phaseAt(t).round
  const draw = raceDraw(secret, round)
  const revealed = t >= round * race.ROUND_MS + race.BETS_MS + GRACE_MS
  return {
    now: t,
    round,
    race: revealed ? { start: race.startOf(round), finish: draw.finish, wobble: draw.wobble, winner: draw.winner, order: draw.order } : null,
    bets: saved?.round === round ? (saved.bets ?? []) : [],
    seat: saved?.seatRound === round ? saved.seat : null,
    last: saved?.last ?? null,
    history: raceHistory(secret, t),
    balance,
  }
}

// msg.a: «sync» (ponerse al día), «bet» (tus apuestas de esta carrera, [{ kind, cars, amount }] (race.KINDS); una lista
// vacía las retira)
// o «seat» (pilotar un coche libre de esta carrera con tu nombre: car 0-5, o null para dejarlo; no cambia el pago).
export async function raceLive(msg, balance, saved, _rand, ctx) {
  const t = ctx.now
  let state = { ...(saved ?? {}) }
  let delta = 0
  let changed = false
  // 1. Se paga la apuesta de una carrera que ya acabó (si es de otra semana, el saldo ya se reinició: se descarta).
  if (raceDue(state, t, ctx.secret)) {
    const stake = state.bets.reduce((sum, b) => sum + (b.amount ?? 0), 0)
    if (state.week === ctx.week && state.v !== race.RULES) {
      // Apuesta hecha con unas reglas anteriores (cambiaron mientras la carrera estaba en juego): se devuelve.
      delta += stake
    } else if (state.week === ctx.week) {
      const draw = raceDraw(ctx.secret, state.round)
      // Cada apuesta cobra según su tipo y el orden de llegada.
      const paid = state.bets.map((b) => race.payoutOf(b, draw.order))
      const total = paid.reduce((sum, p) => sum + p, 0)
      delta += total
      state = { ...state, last: { round: state.round, winner: draw.winner, order: draw.order, stake, payout: total, net: total - stake, bets: state.bets, paid } }
    }
    state = { ...state, bets: [] }
    changed = true
  }
  const { round, offset } = race.phaseAt(t)
  if (msg.a === 'bet') {
    if (msg.round !== round || offset >= race.BETS_MS + GRACE_MS) return { error: 'BETS_CLOSED' }
    const placed = msg.bets
    if (!Array.isArray(placed) || (placed.length > 0 && !race.validBets(placed))) return { error: 'BAD_MESSAGE' }
    // Lo que ya tenías en esta carrera vuelve al saldo y se cobra la apuesta nueva entera.
    const before = state.round === round ? (state.bets ?? []).reduce((sum, b) => sum + (b.amount ?? 0), 0) : 0
    const stake = race.totalOf(placed)
    if (stake - before > balance + delta) return { error: 'INSUFFICIENT_FUNDS' }
    delta += before - stake
    state = { ...state, round, week: ctx.week, v: race.RULES, bets: placed.map(({ kind, cars, amount }) => ({ kind, cars: [...cars], amount })) }
    changed = true
  } else if (msg.a === 'seat') {
    if (msg.round !== round || offset >= race.BETS_MS) return { error: 'BETS_CLOSED' }
    const car = msg.car ?? null
    if (car !== null && !(Number.isInteger(car) && car >= 0 && car < race.CARS)) return { error: 'BAD_MESSAGE' }
    if (car !== null) {
      // Un solo piloto por coche: se cierra el paso a los demás con un candado de transacción mientras se mira.
      await ctx.q(`select pg_advisory_xact_lock(hashtext('juegos-carrera'))`)
      const { rows } = await ctx.q(
        `select 1 from public.juegos_solo where juego = 'race' and usuario_id <> $1 and estado->>'seatRound' = $2 and estado->>'seat' = $3`,
        [ctx.userId, String(round), String(car)],
      )
      if (rows.length) return { error: 'SEAT_TAKEN' }
    }
    state = { ...state, seat: car, seatRound: car === null ? null : round }
    changed = true
  } else if (msg.a !== 'sync') {
    return { error: 'BAD_MESSAGE' }
  }
  return { delta, played: changed, saved: changed ? state : null, result: raceView(state, balance + delta, ctx) }
}

// --- Rana: la apuesta queda en juego (ya salió del saldo) y en cada salto el jugador decide si salta o cobra. ---
// El servidor sortea cada salto con randomInt, así que la pantalla no puede adelantarse. saved: { bet, mult, week, last }
// con bet > 0 mientras hay una rana en marcha; last es la última partida liquidada (para el aviso y el gacha).
// Las partidas guardadas de antes pueden traer `police` (la policía del estanque, ya retirada): se ignora y se borra.
function frogView(state, balance, now, ev = null, to = null) {
  const live = state.bet > 0
  return { bet: live ? state.bet : 0, mult: live ? state.mult : 1, last: state.last ?? null, balance, ev, to, now }
}

// msg.a: «sync» (ponerse al día), «start» (bet), «jump» (saltar al siguiente nenúfar) o «cash» (cobrar ya).
// Sin ctx.luck: la suerte del Admin Abuse (varios intentos por salto) hacía que la rana devolviera más del 500 %.
// El ×2/×3 sobre lo ganado sí se aplica, como en el resto de juegos (game.mjs).
export function frogPlay(msg, balance, saved, rand, ctx) {
  // Una rana de otra semana ya no existe: el saldo se reinició.
  let state = saved && saved.week === ctx.week ? { ...saved } : { last: saved?.last ?? null }
  delete state.police
  const live = state.bet > 0
  const settle = (mult) => {
    const paid = frog.payout(state.bet, mult)
    state = { ...state, bet: 0, mult: 1, last: { round: ctx.now, stake: state.bet, mult, payout: paid, net: paid - state.bet } }
    return paid
  }
  if (msg.a === 'sync') return { delta: 0, played: false, saved: null, result: frogView(state, balance, ctx.now) }
  if (msg.a === 'start') {
    if (live) return { error: 'BAD_PHASE' }
    if (!frog.validBet(msg.bet)) return { error: 'BAD_MESSAGE' }
    if (msg.bet > balance) return { error: 'INSUFFICIENT_FUNDS' }
    state = { ...state, bet: msg.bet, mult: 1, week: ctx.week }
    return { delta: -msg.bet, played: true, saved: state, result: frogView(state, balance - msg.bet, ctx.now, 'start') }
  }
  if (!live) return { error: 'BAD_PHASE' }
  if (msg.a === 'cash') {
    const paid = settle(state.mult)
    return { delta: paid, played: true, saved: state, result: frogView(state, balance + paid, ctx.now, 'cash') }
  }
  if (msg.a !== 'jump') return { error: 'BAD_MESSAGE' }
  const to = state.mult + 1
  if (!frog.survives(state.mult, rand)) {
    settle(0)
    state.last.mult = to // el nenúfar al que no llegó
    return { delta: 0, played: true, saved: state, result: frogView(state, balance, ctx.now, 'fall', to) }
  }
  if (to >= frog.MAX_MULT) {
    const paid = settle(to)
    return { delta: paid, played: true, saved: state, result: frogView(state, balance + paid, ctx.now, 'top', to) }
  }
  state = { ...state, mult: to }
  return { delta: 0, played: true, saved: state, result: frogView(state, balance, ctx.now, 'jump', to) }
}

// --- Torre: como la rana, la apuesta ya salió del saldo y queda en juego. En cada piso el servidor sortea qué baldosas
// están rotas cuando eliges una (antes no existe, así que no se puede adivinar). saved: { bet, mode, floor, week, path,
// last, best } con bet > 0 mientras hay una torre en marcha; path son los pisos ya subidos ({ tile, broken }) y best, el
// mejor cobro del día ({ day, mult, payout, mode }) para la clasificación.
function towerView(state, balance, ev = null, step = null) {
  const live = state.bet > 0
  return {
    bet: live ? state.bet : 0,
    mode: live ? state.mode : null,
    floor: live ? state.floor : 0,
    path: live ? (state.path ?? []) : [],
    last: state.last ?? null,
    best: state.best ?? null,
    balance,
    ev,
    step,
  }
}

// msg.a: «sync», «start» (bet, mode), «pick» (tile: la baldosa que pisas en el piso siguiente) o «cash» (cobrar ya).
export function towerPlay(msg, balance, saved, rand, ctx) {
  let state = saved && saved.week === ctx.week ? { ...saved } : { last: saved?.last ?? null }
  if (state.best && state.best.day !== ctx.day) state.best = null
  const live = state.bet > 0
  const settle = (floor) => {
    const paid = tower.payout(state.bet, state.mode, floor)
    const mult = tower.multAt(state.mode, floor)
    const last = { round: ctx.now, stake: state.bet, mode: state.mode, floor, mult, payout: paid, net: paid - state.bet, path: state.path }
    if (paid > 0 && (!state.best || mult > state.best.mult)) state.best = { day: ctx.day, mult, payout: paid, mode: state.mode, floor }
    state = { ...state, bet: 0, floor: 0, path: [], last }
    return paid
  }
  if (msg.a === 'sync') return { delta: 0, played: false, saved: null, result: towerView(state, balance) }
  if (msg.a === 'start') {
    if (live) return { error: 'BAD_PHASE' }
    if (!tower.validBet(msg.bet) || !tower.validMode(msg.mode)) return { error: 'BAD_MESSAGE' }
    if (msg.bet > balance) return { error: 'INSUFFICIENT_FUNDS' }
    state = { ...state, bet: msg.bet, mode: msg.mode, floor: 0, path: [], week: ctx.week }
    return { delta: -msg.bet, played: true, saved: state, result: towerView(state, balance - msg.bet, 'start') }
  }
  if (!live) return { error: 'BAD_PHASE' }
  if (msg.a === 'cash') {
    if (state.floor < 1) return { error: 'BAD_PHASE' }
    const paid = settle(state.floor)
    return { delta: paid, played: true, saved: state, result: towerView(state, balance + paid, 'cash') }
  }
  if (msg.a !== 'pick' || !tower.validTile(state.mode, msg.tile)) return { error: 'BAD_MESSAGE' }
  // Con suerte del Admin Abuse (ctx.luck 2 o 3), el piso se sortea tantas veces y vale el primero que te deja pasar.
  let broken = tower.brokenTiles(state.mode, rand)
  for (let i = 1; i < (ctx.luck ?? 1) && broken.includes(msg.tile); i++) broken = tower.brokenTiles(state.mode, rand)
  const step = { tile: msg.tile, broken }
  state = { ...state, path: [...(state.path ?? []), step] }
  if (broken.includes(msg.tile)) {
    const floor = state.floor + 1
    settle(0)
    state.last.floor = floor // el piso en el que cayó
    return { delta: 0, played: true, saved: state, result: towerView(state, balance, 'fall', step) }
  }
  state = { ...state, floor: state.floor + 1 }
  if (state.floor >= tower.MODES[state.mode].floors) {
    const paid = settle(state.floor)
    return { delta: paid, played: true, saved: state, result: towerView(state, balance + paid, 'top', step) }
  }
  return { delta: 0, played: true, saved: state, result: towerView(state, balance, 'up', step) }
}

// --- Atraco: como la torre, pero en cada planta eliges la ruta (más riesgo, más botín) y tu banda de cartas del gacha
// decide hasta qué planta puedes bajar. saved: { bet, week, crew, floors, routes, path, last, best } con bet > 0 mientras
// hay un atraco en marcha; routes son las rutas superadas y path, todas las intentadas ({ route, ok }).
const crewCard = (id) => {
  const c = cardView(id)
  return c && { id: c.id, name: c.name, img: c.img, pos: c.pos, rarity: c.rarity, series: c.series, role: heist.roleOf(c.id) }
}

async function myCards(ctx) {
  const { rows } = await ctx.q(`select carta from public.juegos_gacha_cartas where usuario_id = $1`, [ctx.userId])
  return rows.map((r) => crewCard(r.carta)).filter(Boolean)
}

function heistView(state, balance, extra = {}) {
  const live = state.bet > 0
  return {
    bet: live ? state.bet : 0,
    crew: live ? (state.crew ?? []).map(crewCard).filter(Boolean) : [],
    floors: live ? state.floors : heist.BASE_FLOORS,
    routes: live ? (state.routes ?? []) : [],
    path: live ? (state.path ?? []) : [],
    last: state.last ?? null,
    best: state.best ?? null,
    balance,
    ev: null,
    ...extra,
  }
}

// msg.a: «sync» (con tus cartas para elegir banda), «start» (bet, crew: ids de tus cartas), «go» (route) o «cash».
export async function heistPlay(msg, balance, saved, rand, ctx) {
  let state = saved && saved.week === ctx.week ? { ...saved } : { last: saved?.last ?? null }
  if (state.best && state.best.day !== ctx.day) state.best = null
  const live = state.bet > 0
  const settle = (routes) => {
    const paid = heist.payout(state.bet, routes)
    const mult = heist.multOf(routes)
    const last = { round: ctx.now, stake: state.bet, floor: routes.length, mult, payout: paid, net: paid - state.bet, path: state.path, crew: state.crew }
    if (paid > 0 && (!state.best || mult > state.best.mult)) state.best = { day: ctx.day, mult, payout: paid, floor: routes.length }
    state = { ...state, bet: 0, routes: [], path: [], last }
    return paid
  }
  if (msg.a === 'sync') return { delta: 0, played: false, saved: null, result: heistView(state, balance, { cards: await myCards(ctx) }) }
  if (msg.a === 'start') {
    if (live) return { error: 'BAD_PHASE' }
    const crew = msg.crew ?? []
    if (!heist.validBet(msg.bet) || !heist.validCrew(crew)) return { error: 'BAD_MESSAGE' }
    if (msg.bet > balance) return { error: 'INSUFFICIENT_FUNDS' }
    // Solo cartas que son tuyas ahora mismo.
    const owned = crew.length
      ? (await ctx.q(`select carta from public.juegos_gacha_cartas where usuario_id = $1 and carta = any($2::text[])`, [ctx.userId, crew])).rows.map((r) => r.carta)
      : []
    if (owned.length !== crew.length) return { error: 'HEIST_CREW' }
    const floors = heist.floorsFor(crew.map((id) => cardView(id)?.rarity))
    state = { ...state, bet: msg.bet, week: ctx.week, crew, floors, routes: [], path: [] }
    return { delta: -msg.bet, played: true, saved: state, result: heistView(state, balance - msg.bet, { ev: 'start' }) }
  }
  if (!live) return { error: 'BAD_PHASE' }
  if (msg.a === 'cash') {
    if (!state.routes.length) return { error: 'BAD_PHASE' }
    const paid = settle(state.routes)
    return { delta: paid, played: true, saved: state, result: heistView(state, balance + paid, { ev: 'cash' }) }
  }
  if (msg.a !== 'go' || !heist.validRoute(msg.route)) return { error: 'BAD_MESSAGE' }
  // Con suerte del Admin Abuse (ctx.luck 2 o 3), la ruta tiene tantos intentos.
  let ok = false
  for (let i = 0; i < (ctx.luck ?? 1) && !ok; i++) ok = heist.survives(msg.route, rand)
  state = { ...state, path: [...state.path, { route: msg.route, ok }] }
  if (!ok) {
    const floor = state.routes.length + 1
    settle([])
    state.last.floor = floor // la planta en la que te pillaron
    state.last.caught = msg.route
    return { delta: 0, played: true, saved: state, result: heistView(state, balance, { ev: 'caught' }) }
  }
  const routes = [...state.routes, msg.route]
  state = { ...state, routes }
  if (routes.length >= state.floors || heist.multOf(routes) >= heist.MAX_MULT) {
    const paid = settle(routes)
    return { delta: paid, played: true, saved: state, result: heistView(state, balance + paid, { ev: 'escape' }) }
  }
  return { delta: 0, played: true, saved: state, result: heistView(state, balance, { ev: 'down' }) }
}

// --- Pez Gordo: la apuesta sale del saldo al empezar y la partida se juega en el navegador con una semilla que da el
// servidor. Al acabar (te comen, sales del agua o se acaba el tiempo) llegan tus movimientos y aquí se repite la
// partida entera (pez.simulate) para saber cuánto pesabas de verdad: el navegador no puede inventarse el resultado. No
// se admiten más pasos de los que han dado tiempo a jugarse desde que empezó. saved: { bet, seed, at, week, last, best }
// con bet > 0 mientras hay una partida en marcha; best es el mejor cobro del día (para la clasificación).
const FISH_GRACE_MS = 1500

function fishView(state, balance, extra = {}) {
  const live = state.bet > 0
  return { bet: live ? state.bet : 0, seed: live ? state.seed : null, at: live ? state.at : null, last: state.last ?? null, best: state.best ?? null, balance, ev: null, ...extra }
}

// msg.a: «sync», «start» (bet) o «end» (inputs: [[paso, dx, dy], …], tick: el paso en que acabó, cash: si saliste del
// agua; sin cash, te comieron).
export function fishPlay(msg, balance, saved, rand, ctx) {
  let state = saved && saved.week === ctx.week ? { ...saved } : { last: saved?.last ?? null }
  if (state.best && state.best.day !== ctx.day) state.best = null
  const live = state.bet > 0
  if (msg.a === 'sync') return { delta: 0, played: false, saved: null, result: fishView(state, balance, { now: ctx.now }) }
  if (msg.a === 'start') {
    if (live) return { error: 'BAD_PHASE' }
    if (!pez.validBet(msg.bet)) return { error: 'BAD_MESSAGE' }
    if (msg.bet > balance) return { error: 'INSUFFICIENT_FUNDS' }
    state = { ...state, bet: msg.bet, seed: rand(4294967296), at: ctx.now, week: ctx.week }
    return { delta: -msg.bet, played: true, saved: state, result: fishView(state, balance - msg.bet, { ev: 'start', now: ctx.now }) }
  }
  if (msg.a !== 'end') return { error: 'BAD_MESSAGE' }
  if (!live) return { error: 'BAD_PHASE' }
  const inputs = msg.inputs ?? []
  if (!pez.validInputs(inputs) || !Number.isSafeInteger(msg.tick) || msg.tick < 0) return { error: 'BAD_MESSAGE' }
  const allowed = Math.min(pez.MAX_TICKS, Math.floor((ctx.now - state.at + FISH_GRACE_MS) / pez.TICK_MS))
  const tick = Math.min(msg.tick, allowed)
  const run = pez.simulate(state.seed, inputs, tick)
  const out = run.alive && (msg.cash === true || run.tick >= pez.MAX_TICKS)
  const paid = out ? pez.payout(state.bet, run.mass) : 0
  const mult = out ? pez.multOf(run.mass) : 0
  const mass = Math.round(run.mass)
  if (paid > 0 && (!state.best || mult > state.best.mult)) state.best = { day: ctx.day, mult, payout: paid, mode: String(mass) }
  const last = { round: ctx.now, stake: state.bet, payout: paid, net: paid - state.bet, mult, mass, tick: run.tick, eatenBy: run.eatenBy }
  state = { ...state, bet: 0, seed: null, at: null, last }
  return { delta: paid, played: true, saved: state, result: fishView(state, balance + paid, { ev: out ? 'cash' : 'eaten' }) }
}

// --- Tesoro en la Arena: como la Torre, pero en una playa de 5×5. Cada hoyo se sortea al cavarlo (crabNext) y al acabar
// se reparten los cangrejos que faltaban entre los hoyos sin cavar para enseñarlos. saved: { bet, mode, week, dug, last,
// best } con bet > 0 mientras hay una partida en marcha; dug son los hoyos cavados (todos con tesoro).
function digView(state, balance, extra = {}) {
  const live = state.bet > 0
  return { bet: live ? state.bet : 0, mode: live ? state.mode : null, dug: live ? (state.dug ?? []) : [], last: state.last ?? null, best: state.best ?? null, balance, ev: null, ...extra }
}

// msg.a: «sync», «start» (bet, mode), «dig» (cell: de 0 a 24) o «cash».
export function digPlay(msg, balance, saved, rand, ctx) {
  let state = saved && saved.week === ctx.week ? { ...saved } : { last: saved?.last ?? null }
  if (state.best && state.best.day !== ctx.day) state.best = null
  const live = state.bet > 0
  const settle = (n, bitten) => {
    const paid = bitten === null ? arena.payout(state.bet, state.mode, n) : 0
    const mult = bitten === null ? arena.multAt(state.mode, n) : 0
    const crabs = arena.placeCrabs(state.mode, state.dug, bitten, rand)
    const last = { round: ctx.now, stake: state.bet, mode: state.mode, dug: state.dug, crabs, bitten, found: n, mult, payout: paid, net: paid - state.bet }
    if (paid > 0 && (!state.best || mult > state.best.mult)) state.best = { day: ctx.day, mult, payout: paid, mode: state.mode }
    state = { ...state, bet: 0, dug: [], last }
    return paid
  }
  if (msg.a === 'sync') return { delta: 0, played: false, saved: null, result: digView(state, balance) }
  if (msg.a === 'start') {
    if (live) return { error: 'BAD_PHASE' }
    if (!arena.validBet(msg.bet) || !arena.validMode(msg.mode)) return { error: 'BAD_MESSAGE' }
    if (msg.bet > balance) return { error: 'INSUFFICIENT_FUNDS' }
    state = { ...state, bet: msg.bet, mode: msg.mode, dug: [], week: ctx.week }
    return { delta: -msg.bet, played: true, saved: state, result: digView(state, balance - msg.bet, { ev: 'start' }) }
  }
  if (!live) return { error: 'BAD_PHASE' }
  if (msg.a === 'cash') {
    if (state.dug.length < 1) return { error: 'BAD_PHASE' }
    const paid = settle(state.dug.length, null)
    return { delta: paid, played: true, saved: state, result: digView(state, balance + paid, { ev: 'cash' }) }
  }
  if (msg.a !== 'dig' || !arena.validCell(msg.cell)) return { error: 'BAD_MESSAGE' }
  if (state.dug.includes(msg.cell)) return { error: 'BAD_MESSAGE' }
  // Con suerte del Admin Abuse (ctx.luck 2 o 3), el hoyo se sortea tantas veces y vale el primero sin cangrejo.
  let crab = arena.crabNext(state.mode, state.dug.length, rand)
  for (let i = 1; i < (ctx.luck ?? 1) && crab; i++) crab = arena.crabNext(state.mode, state.dug.length, rand)
  if (crab) {
    settle(state.dug.length, msg.cell)
    return { delta: 0, played: true, saved: state, result: digView(state, balance, { ev: 'crab', cell: msg.cell }) }
  }
  state = { ...state, dug: [...state.dug, msg.cell] }
  // Sin más tesoro que sacar o en el tope del premio: cobras solo.
  if (state.dug.length >= arena.maxDigs(state.mode)) {
    const paid = settle(state.dug.length, null)
    return { delta: paid, played: true, saved: state, result: digView(state, balance + paid, { ev: 'all', cell: msg.cell }) }
  }
  return { delta: 0, played: true, saved: state, result: digView(state, balance, { ev: 'loot', cell: msg.cell }) }
}

// --- Buceo de Perlas: bajas tramo a tramo abriendo ostras (dive.js). Cada tramo se sortea al bajarlo. saved: { bet, zone,
// week, depth, mult, pearls, last, best } con bet > 0 mientras hay una inmersión en marcha; pearls son las perlas de cada
// tramo (para pintarlas) y mult lo que llevas (con 4 decimales).
function diveView(state, balance, extra = {}) {
  const live = state.bet > 0
  return {
    bet: live ? state.bet : 0,
    zone: live ? state.zone : null,
    depth: live ? state.depth : 0,
    mult: live ? state.mult : 0,
    pearls: live ? (state.pearls ?? []) : [],
    last: state.last ?? null,
    best: state.best ?? null,
    balance,
    ev: null,
    ...extra,
  }
}

// msg.a: «sync», «start» (bet, zone), «dive» (bajar un tramo) o «cash» (subir y cobrar).
export function divePlay(msg, balance, saved, rand, ctx) {
  let state = saved && saved.week === ctx.week ? { ...saved } : { last: saved?.last ?? null }
  if (state.best && state.best.day !== ctx.day) state.best = null
  const live = state.bet > 0
  const settle = (lost) => {
    const paid = lost ? 0 : dive.payout(state.bet, state.mult)
    const mult = lost ? 0 : dive.shownMult(state.mult)
    const last = { round: ctx.now, stake: state.bet, zone: state.zone, depth: state.depth, pearls: state.pearls, lost, mult, payout: paid, net: paid - state.bet }
    if (paid > 0 && (!state.best || mult > state.best.mult)) state.best = { day: ctx.day, mult, payout: paid, mode: state.zone }
    state = { ...state, bet: 0, depth: 0, mult: 0, pearls: [], last }
    return paid
  }
  if (msg.a === 'sync') return { delta: 0, played: false, saved: null, result: diveView(state, balance) }
  if (msg.a === 'start') {
    if (live) return { error: 'BAD_PHASE' }
    if (!dive.validBet(msg.bet) || !dive.validZone(msg.zone)) return { error: 'BAD_MESSAGE' }
    if (msg.bet > balance) return { error: 'INSUFFICIENT_FUNDS' }
    state = { ...state, bet: msg.bet, zone: msg.zone, depth: 0, mult: 0, pearls: [], week: ctx.week }
    return { delta: -msg.bet, played: true, saved: state, result: diveView(state, balance - msg.bet, { ev: 'start' }) }
  }
  if (!live) return { error: 'BAD_PHASE' }
  if (msg.a === 'cash') {
    if (state.depth < 1) return { error: 'BAD_PHASE' }
    const paid = settle(false)
    return { delta: paid, played: true, saved: state, result: diveView(state, balance + paid, { ev: 'cash' }) }
  }
  if (msg.a !== 'dive') return { error: 'BAD_MESSAGE' }
  // Con suerte del Admin Abuse (ctx.luck 2 o 3), el tramo se sortea tantas veces y vale el primero sin tiburón ni ahogo.
  let kind = dive.diveRoll(state.zone, rand)
  for (let i = 1; i < (ctx.luck ?? 1) && dive.isLoss(kind); i++) kind = dive.diveRoll(state.zone, rand)
  if (dive.isLoss(kind)) {
    state = { ...state, depth: state.depth + 1, pearls: [...state.pearls, kind] }
    settle(true)
    return { delta: 0, played: true, saved: state, result: diveView(state, balance, { ev: kind }) }
  }
  state = { ...state, depth: state.depth + 1, mult: dive.nextMult(state.zone, state.mult, kind === 'black'), pearls: [...state.pearls, kind] }
  // Sin aire para otro tramo o en el tope del premio: subes y cobras solo.
  if (state.depth >= dive.MAX_DEPTH || state.mult >= dive.MAX_MULT) {
    const paid = settle(false)
    return { delta: paid, played: true, saved: state, result: diveView(state, balance + paid, { ev: 'top', kind }) }
  }
  return { delta: 0, played: true, saved: state, result: diveView(state, balance, { ev: 'pearl', kind }) }
}

export const SOLO_PLAY = { roulette: rouletteLive, fish: fishPlay, plinko: plinkoDrop, crash: crashLive, frog: frogPlay, race: raceLive, tower: towerPlay, heist: heistPlay, dig: digPlay, dive: divePlay }
