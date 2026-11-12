// Feria de las Islas: reglas y motor de la partida, compartidos por la pantalla y el servidor (api/_juegos/feria.mjs).
// Una partida para hasta SEATS personas: ROUNDS rondas en las que todos tiran los dados a la vez y avanzan por el
// paseo de la feria (BOARD: 7 islas con 3 puestos cada una y, entre isla e isla, una casilla especial).
//   - Caes solo en un puesto libre: puedes comprarlo. Si es tuyo, puedes mejorarlo (más alquiler).
//   - Caéis varios en el mismo puesto libre: os lo jugáis al Tira y Afloja (quien más tire se lo queda gratis).
//   - Caes en el puesto de otro: le pagas el alquiler (el doble si tiene los tres de la isla).
// Todo el motor es puro: el estado entra y sale como un objeto (se guarda en una fila de la base de datos) y el azar
// llega de fuera (randOf(etiqueta) → rand(n)), así que el servidor puede ponerse al día de golpe aunque nadie pregunte.

export const VERSION = 1
export const ENTRY = 500 // inscripción, en euros del casino
export const SEATS = 10
export const MIN_PLAYERS = 4 // si al acabar la cuenta atrás hay menos, la casa pone feriantes (bots) hasta llegar
export const ROUNDS = 12
export const START_CASH = 1500 // perras de la partida (no son euros: solo cuentan para la clasificación final)
export const GO_BONUS = 200
export const BOTE_SEED = 300
export const BOTE_RESEED = 100
export const TAX = 100
export const MAX_LEVEL = 2
export const SHARES = [0.5, 0.3, 0.2] // reparto del bote entre los tres primeros

// Tiempos (ms).
export const LOBBY_MS = 40000 // cuenta atrás desde que entra el primero
export const FULL_MS = 4000 // con la sala llena, empieza enseguida
export const INTRO_MS = 3500 // «¡Empieza la feria!» antes de la primera tirada
export const MOVE_MS = 5200 // dados y fichas andando
export const DECIDE_MS = 8000 // comprar o mejorar
export const QUIET_MS = 3600 // ronda sin nada que decidir: lo justo para leer qué ha pasado
export const ROUND_PAD_MS = 800
export const DUEL_INTRO_MS = 2800
export const DUEL_MS = 10000
export const DUEL_SEND_MS = 1800 // margen para que lleguen los tirones de cada uno
export const DUEL_SHOW_MS = 3400
export const TAP_RATE = 12 // tirones por segundo que se cuentan como mucho
export const MAX_TAPS = (DUEL_MS / 1000) * TAP_RATE
export const GRACE_MS = 500

export const ISLANDS = [
  { id: 'hierro', name: 'El Hierro', color: '#4fc38a' },
  { id: 'gomera', name: 'La Gomera', color: '#35b6c9' },
  { id: 'palma', name: 'La Palma', color: '#5b8def' },
  { id: 'lanzarote', name: 'Lanzarote', color: '#e2674a' },
  { id: 'fuerteventura', name: 'Fuerteventura', color: '#e8b04a' },
  { id: 'canaria', name: 'Gran Canaria', color: '#d65aa0' },
  { id: 'tenerife', name: 'Tenerife', color: '#9b6cf0' },
]
// Nombres cortos: tienen que caber dentro de la casilla.
const STALLS = [
  ['Quesadilla', 'Piña', 'Vino'],
  ['Miel', 'Almogrote', 'Silbo'],
  ['Puros', 'Indianos', 'Bienmesabe'],
  ['Malvasía', 'Camellos', 'Jameos'],
  ['Majorero', 'Cometas', 'Surf'],
  ['Ron miel', 'Queso flor', 'Carnaval'],
  ['Mojo', 'Guachinche', 'Teleférico'],
]
// La casilla que va delante de cada isla.
const SPECIALS = ['salida', 'suerte', 'tasa', 'suerte', 'verbena', 'suerte', 'tasa']
export const SPECIAL_NAME = { salida: 'Muelle', suerte: 'Tómbola', tasa: 'Tasa', verbena: 'Verbena' }

// Las 28 casillas, en el orden del paseo.
export const BOARD = ISLANDS.flatMap((island, k) => {
  const base = 120 + 50 * k
  return [
    { kind: SPECIALS[k], name: SPECIAL_NAME[SPECIALS[k]] },
    ...STALLS[k].map((name, j) => ({ kind: 'puesto', name, island: k, price: base + (j === 2 ? 20 : 0) })),
  ]
}).map((sq, i) => ({ ...sq, i }))
export const SIZE = BOARD.length
export const isStall = (sq) => BOARD[sq]?.kind === 'puesto'
export const stallsOf = (island) => BOARD.filter((s) => s.island === island).map((s) => s.i)

const RENT_MULT = [1, 2, 3.5]
export const upgradeCost = (sq) => Math.round(BOARD[sq].price / 2)
// Alquiler de un puesto: según su nivel, y el doble si su dueño tiene los tres de la isla.
export function rentOf(sq, level = 0, full = false) {
  return Math.round(BOARD[sq].price * 0.3 * RENT_MULT[level] * (full ? 2 : 1))
}
export const hasIsland = (owners, seat, island) => stallsOf(island).every((sq) => owners[sq] === seat)
// Lo que vale un puesto al final: lo que costó más lo invertido en mejoras.
export const stallWorth = (sq, level = 0) => BOARD[sq].price + level * upgradeCost(sq)

// Papeletas de la Tómbola. d: perras que ganas o pierdes; each: lo que te da (o das a) cada uno de los demás.
export const CARDS = [
  { text: 'Te toca el jamón de la rifa', d: 100 },
  { text: 'Ganas el concurso de disfraces', d: 200 },
  { text: 'Encuentras un billete en la arena', d: 60 },
  { text: 'Premio gordo de la tómbola', d: 300 },
  { text: 'Vendes todas las papeletas', d: 150 },
  { text: 'Es tu santo: cada uno te da 30', each: 30 },
  { text: 'Multa por aparcar la guagua en la plaza', d: -80 },
  { text: 'El alisio te vuela los billetes', d: -120 },
  { text: 'Calima: hoy no se vende nada', d: -60 },
  { text: 'Invitas a una ronda: das 25 a cada uno', each: -25 },
]

const BOT_NAMES = ['Chacho', 'Mencey', 'Guayota', 'Tara', 'Dácil', 'Bencomo', 'Gara', 'Jonay', 'Yaiza', 'Tenesor']

// ---------- Estado ----------
// { v, id, week, phase: 'lobby' | 'play' | 'done', openAt, startAt, players: [{ id, name, avatar, bot, cash, pos }],
//   owners: { casilla: asiento }, levels: { casilla: nivel }, bote, round, cur, endAt, result, paid }
export function newMatch(id, week) {
  return { v: VERSION, id, week, phase: 'lobby', openAt: null, startAt: null, players: [], owners: {}, levels: {}, bote: BOTE_SEED, round: -1, cur: null, endAt: null, result: null, paid: false }
}

const seatOf = (state, userId) => state.players.findIndex((p) => p.id === userId)

// Entrar en la sala (ya cobrada la inscripción). Devuelve un código de error o null.
export function addPlayer(state, user, t) {
  if (state.phase !== 'lobby') return 'FERIA_RUNNING'
  if (seatOf(state, user.id) >= 0) return 'FERIA_IN'
  if (state.players.length >= SEATS) return 'FERIA_FULL'
  state.players.push({ id: user.id, name: user.name, avatar: user.avatar ?? null, bot: false, cash: START_CASH, pos: 0 })
  if (state.players.length === 1) {
    state.openAt = t
    state.startAt = t + LOBBY_MS
  }
  if (state.players.length === SEATS) state.startAt = Math.min(state.startAt, t + FULL_MS)
  return null
}

// Salir de la sala antes de que empiece (se devuelve la inscripción).
export function removePlayer(state, userId) {
  if (state.phase !== 'lobby') return 'FERIA_RUNNING'
  const seat = seatOf(state, userId)
  if (seat < 0) return 'FERIA_OUT'
  state.players.splice(seat, 1)
  if (!state.players.length) {
    state.openAt = null
    state.startAt = null
  }
  return null
}

// ¿Hay algo que hacer avanzar a la hora t?
export function due(state, t) {
  if (!state) return false
  if (state.phase === 'lobby') return state.players.length > 0 && t >= state.startAt
  if (state.phase !== 'play') return false
  const cur = state.cur
  return t >= cur.end || (cur.duels.length > 0 && !cur.resolved && t >= cur.resolveAt)
}

function pay(state, from, to, amount) {
  const paid = Math.max(0, Math.min(state.players[from].cash, amount))
  state.players[from].cash -= paid
  if (to !== null) state.players[to].cash += paid
  return paid
}

function beginRound(state, r, at, randOf) {
  const rand = randOf(`ronda:${r}`)
  const n = state.players.length
  const before = { cash: state.players.map((p) => p.cash), pos: state.players.map((p) => p.pos), owners: { ...state.owners }, levels: { ...state.levels }, bote: state.bote }
  const steps = state.players.map((p) => {
    const dice = [1 + rand(6), 1 + rand(6)]
    const from = p.pos
    const to = (from + dice[0] + dice[1]) % SIZE
    const lap = from + dice[0] + dice[1] >= SIZE
    p.pos = to
    if (lap) p.cash += GO_BONUS
    return { dice, from, to, lap, ev: null }
  })
  const offers = {}
  // Quién ha caído en cada puesto libre: uno solo puede comprar; varios se lo juegan.
  const landers = new Map()
  // El alquiler se paga a quien era el dueño al empezar la ronda, de asiento en asiento.
  const verbena = []
  steps.forEach((step, seat) => {
    const sq = BOARD[step.to]
    if (sq.kind === 'puesto') {
      const owner = before.owners[sq.i]
      if (owner === undefined) landers.set(sq.i, [...(landers.get(sq.i) ?? []), seat])
      else if (owner === seat) {
        const level = state.levels[sq.i] ?? 0
        if (level < MAX_LEVEL) {
          offers[seat] = { sq: sq.i, kind: 'up', cost: upgradeCost(sq.i), done: false }
          step.ev = { k: 'up' }
        } else step.ev = { k: 'home' }
      } else {
        const due = rentOf(sq.i, state.levels[sq.i] ?? 0, hasIsland(before.owners, owner, sq.island))
        step.ev = { k: 'rent', to: owner, due, amount: pay(state, seat, owner, due) }
      }
    } else if (sq.kind === 'suerte') {
      const card = rand(CARDS.length)
      const c = CARDS[card]
      let amount = 0
      if (c.each) {
        for (let other = 0; other < n; other++) {
          if (other === seat) continue
          amount += c.each > 0 ? pay(state, other, seat, c.each) : -pay(state, seat, other, -c.each)
        }
      } else if (c.d > 0) {
        state.players[seat].cash += c.d
        amount = c.d
      } else amount = -pay(state, seat, null, -c.d)
      step.ev = { k: 'card', card, amount }
    } else if (sq.kind === 'tasa') {
      const amount = pay(state, seat, null, TAX)
      state.bote += amount
      step.ev = { k: 'tax', amount }
    } else if (sq.kind === 'verbena') verbena.push(seat)
    else step.ev = { k: 'go' }
  })
  // La Verbena: el bote de la feria, a partes iguales entre quienes caen (con lo de las tasas de esta misma ronda).
  if (verbena.length) {
    const share = Math.floor(state.bote / verbena.length)
    for (const seat of verbena) {
      state.players[seat].cash += share
      steps[seat].ev = { k: 'bote', amount: share }
    }
    state.bote = BOTE_RESEED
  }
  const duels = []
  for (const [sq, seats] of landers) {
    if (seats.length === 1) {
      offers[seats[0]] = { sq, kind: 'buy', cost: BOARD[sq].price, done: false }
      steps[seats[0]].ev = { k: 'buy' }
    } else {
      for (const seat of seats) steps[seat].ev = { k: 'duel', i: duels.length }
      duels.push({ sq, seats, taps: {}, winner: null })
    }
  }
  // Los feriantes de la casa deciden al momento: compran si les llega y mejoran si les queda un colchón, y tiran de la cuerda a su ritmo.
  for (const [key, offer] of Object.entries(offers)) {
    const seat = Number(key)
    const p = state.players[seat]
    if (!p.bot) continue
    if (p.cash - offer.cost >= (offer.kind === 'buy' ? 0 : 150)) take(state, seat, offer)
  }
  for (const duel of duels) for (const seat of duel.seats) if (state.players[seat].bot) duel.taps[seat] = 50 + rand(36)
  const waiting = Object.entries(offers).some(([seat, o]) => !o.done && !state.players[seat].bot)
  const cur = { at, steps, offers, duels, before, resolved: duels.length === 0 }
  if (duels.length) {
    cur.duelAt = at + MOVE_MS + DUEL_INTRO_MS
    cur.duelEnd = cur.duelAt + DUEL_MS
    cur.resolveAt = cur.duelEnd + DUEL_SEND_MS
    cur.end = cur.resolveAt + DUEL_SHOW_MS
  } else cur.end = at + MOVE_MS + (waiting ? DECIDE_MS : QUIET_MS) + ROUND_PAD_MS
  state.round = r
  state.cur = cur
}

function take(state, seat, offer) {
  const p = state.players[seat]
  if (p.cash < offer.cost) return false
  p.cash -= offer.cost
  if (offer.kind === 'buy') {
    state.owners[offer.sq] = seat
    state.levels[offer.sq] = 0
  } else state.levels[offer.sq] = (state.levels[offer.sq] ?? 0) + 1
  offer.done = true
  return true
}

function resolveDuels(state, randOf) {
  const rand = randOf(`duelo:${state.round}`)
  for (const duel of state.cur.duels) {
    const best = Math.max(...duel.seats.map((s) => duel.taps[s] ?? 0))
    const top = duel.seats.filter((s) => (duel.taps[s] ?? 0) === best)
    duel.winner = top[rand(top.length)]
    state.owners[duel.sq] = duel.winner
    state.levels[duel.sq] = 0
  }
  state.cur.resolved = true
}

export function worthOf(state, seat) {
  let worth = state.players[seat].cash
  for (const [sq, owner] of Object.entries(state.owners)) if (owner === seat) worth += stallWorth(Number(sq), state.levels[sq] ?? 0)
  return worth
}

// Clasificación: por patrimonio (perras + puestos); empatan por perras y luego por asiento.
export function standings(state) {
  return state.players
    .map((p, seat) => ({ seat, worth: worthOf(state, seat), cash: p.cash, stalls: Object.values(state.owners).filter((o) => o === seat).length }))
    .sort((a, b) => b.worth - a.worth || b.cash - a.cash || a.seat - b.seat)
}

export const potOf = (n) => n * ENTRY
// Premio de cada puesto (en euros): los tres primeros se reparten el bote.
export function prizesOf(n) {
  const pot = potOf(n)
  const prizes = SHARES.map((s) => Math.floor(pot * s))
  prizes[0] += pot - prizes.reduce((a, b) => a + b, 0)
  return prizes
}

function finish(state, at) {
  const prizes = prizesOf(state.players.length)
  state.phase = 'done'
  state.endAt = at
  state.result = standings(state).map((s, i) => ({ ...s, place: i + 1, prize: prizes[i] ?? 0 }))
}

// Pone la partida al día a la hora t: empieza cuando acaba la cuenta atrás, resuelve los duelos y pasa de ronda. Aunque
// nadie pregunte durante un rato, las rondas se encadenan con sus horas exactas. Devuelve { changed, finished }.
export function advance(state, t, randOf) {
  let changed = false
  let finished = false
  if (state.phase === 'lobby' && state.players.length > 0 && t >= state.startAt) {
    const rand = randOf('feriantes')
    const names = BOT_NAMES.filter((name) => !state.players.some((p) => p.name === name))
    while (state.players.length < MIN_PLAYERS) {
      const name = names.splice(rand(names.length), 1)[0]
      state.players.push({ id: null, name, avatar: null, bot: true, cash: START_CASH, pos: 0 })
    }
    state.phase = 'play'
    beginRound(state, 0, state.startAt + INTRO_MS, randOf)
    changed = true
  }
  while (state.phase === 'play') {
    const cur = state.cur
    if (!cur.resolved && t >= cur.resolveAt) {
      resolveDuels(state, randOf)
      changed = true
    }
    if (t < cur.end) break
    if (state.round + 1 < ROUNDS) beginRound(state, state.round + 1, cur.end, randOf)
    else {
      finish(state, cur.end)
      finished = true
    }
    changed = true
  }
  return { changed, finished }
}

// Comprar el puesto en el que has caído (o mejorarlo, si es tuyo).
export function accept(state, userId, t) {
  if (state.phase !== 'play') return 'BAD_PHASE'
  const seat = seatOf(state, userId)
  if (seat < 0) return 'FERIA_OUT'
  const cur = state.cur
  const offer = cur.offers[seat]
  if (!offer || offer.done) return 'FERIA_NO_OFFER'
  if (t < cur.at + MOVE_MS - GRACE_MS || t >= cur.end + GRACE_MS) return 'BAD_PHASE'
  return take(state, seat, offer) ? null : 'FERIA_NO_CASH'
}

// Tirones de un duelo: se apunta el total (lo máximo que se ha podido tirar hasta ese momento).
export function tug(state, userId, n, t) {
  if (state.phase !== 'play') return 'BAD_PHASE'
  const seat = seatOf(state, userId)
  if (seat < 0) return 'FERIA_OUT'
  const cur = state.cur
  const duel = cur.duels.find((d) => d.seats.includes(seat))
  if (!duel || cur.resolved) return 'FERIA_NO_DUEL'
  if (!Number.isSafeInteger(n) || n < 0) return 'BAD_MESSAGE'
  if (t < cur.duelAt - GRACE_MS || t >= cur.resolveAt) return 'FERIA_NO_DUEL'
  const cap = Math.ceil(((Math.min(t, cur.duelEnd) - cur.duelAt + GRACE_MS) / 1000) * TAP_RATE)
  duel.taps[seat] = Math.max(duel.taps[seat] ?? 0, Math.min(n, cap, MAX_TAPS))
  return null
}

// ---------- Tablero (pantalla) ----------
// Centro de cada casilla sobre un óvalo, repartidas a la misma distancia unas de otras. La Salida, abajo en el centro,
// y se avanza en el sentido de las agujas del reloj.
export function layout(w, h, pad) {
  const rx = w / 2 - pad
  const ry = h / 2 - pad
  const N = 720
  const pts = []
  let total = 0
  for (let k = 0; k <= N; k++) {
    const a = Math.PI / 2 + (k / N) * Math.PI * 2
    const x = w / 2 + rx * Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** 0.62
    const y = h / 2 + ry * Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** 0.62
    if (k > 0) total += Math.hypot(x - pts[k - 1].x, y - pts[k - 1].y)
    pts.push({ x, y, d: total })
  }
  let k = 0
  return BOARD.map((_, i) => {
    const target = (i / SIZE) * total
    while (k < N && pts[k + 1].d < target) k++
    const a = pts[k]
    const b = pts[Math.min(N, k + 1)]
    const f = b.d > a.d ? (target - a.d) / (b.d - a.d) : 0
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
  })
}
