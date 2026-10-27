// Copiado del proyecto de juegos (Rule) con scripts/export-topcode.mjs: no editar aquí.
// Una mesa de Texas Hold'em sin límite: ciegas, calles, botes laterales y enfrentamiento. El servidor es la única autoridad.
// Las fichas de cada jugador son su saldo de la cuenta: cada apuesta se descuenta al ponerla y el bote se paga al final.
import { awardPots, bestHand, buildPots, createDeck } from './poker-core.mjs'
import { realTimers, timerMethods } from './timers.mjs'

// Con 10.000 € por semana, cada jugador empieza con 100 ciegas grandes.
export const SMALL_BLIND = 50
export const BIG_BLIND = 100
const START_MS = 3000
const TURN_MS = 25000
const STREET_MS = 900
const RUNOUT_MS = 1500
const SHOW_MS = 6500
const FOLD_WIN_MS = 3500
const GRACE_MS = 60000
const EMPTY_MS = 5 * 60000
const SWEEP_MS = 5000
const STREETS = ['preflop', 'flop', 'turn', 'river']

const emptyHand = () => ({
  inHand: false,
  cards: [],
  bet: 0, // en esta calle
  total: 0, // en toda la mano
  folded: false,
  allIn: false,
  acted: false,
  action: null,
  won: 0,
  handName: null,
  best: [],
})

// session: { id, token, name, ws, room, seat }. ws solo necesita readyState y send().
export class PokerRoom {
  constructor({ code, seats, accounts, randomInt, onClose, now = Date.now, label = null, persistent = false, timers = realTimers }) {
    this.game = 'poker'
    this.code = code
    // Las mesas públicas (con nombre) no tienen anfitrión; la principal de cada juego no se cierra nunca.
    this.label = label
    this.persistent = persistent
    this.accounts = accounts
    this.randomInt = randomInt
    this.onClose = onClose
    this.now = now
    this.seats = Array.from({ length: seats }, () => null)
    this.members = new Map()
    this.hostId = null
    this.phase = 'waiting' // waiting | preflop | flop | turn | river | showdown
    this.deck = []
    this.board = []
    this.button = -1
    this.sb = null
    this.bb = null
    this.turn = null
    this.currentBet = 0
    this.minRaise = BIG_BLIND
    this.hand = 0
    this.reveal = false // se enseñan las cartas de quien sigue en la mano
    this.result = null
    this.deadline = null
    this.span = 0
    this.rev = 0
    this.timers = timers
    this.timer = null
    this.pending = null
    this.emptySince = null
    if (timers.live) {
      this.sweeper = setInterval(() => this.sweep(), SWEEP_MS)
      this.sweeper.unref?.()
    }
  }

  live() {
    return STREETS.includes(this.phase)
  }

  balance(seat) {
    return this.accounts.get(seat.token)?.balance ?? 0
  }

  // --- miembros y asientos ---

  join(session, wantSeat) {
    this.members.set(session.id, session)
    this.emptySince = null
    session.room = this
    session.seat = null
    if (!this.hostId && !this.label) this.hostId = session.id
    if (wantSeat) this.sit(session, this.seats.findIndex((s) => !s), true)
    this.broadcast()
  }

  leave(session) {
    if (!this.members.delete(session.id)) return
    if (session.seat !== null) this.release(session.seat)
    session.room = null
    session.seat = null
    if (this.hostId === session.id) this.hostId = this.members.keys().next().value ?? null
    if (this.members.size === 0) this.emptySince = this.now()
    this.broadcast()
  }

  seatOf(session) {
    return session.seat === null ? null : this.seats[session.seat]
  }

  sit(session, index, silent = false) {
    if (!this.members.has(session.id)) return 'BAD_PHASE'
    if (session.seat !== null) return 'BAD_PHASE'
    if (!Number.isInteger(index) || index < 0 || index >= this.seats.length) return silent ? null : 'BAD_MESSAGE'
    if (this.seats[index]) return silent ? null : 'SEAT_TAKEN'
    this.seats[index] = { sid: session.id, token: session.token, name: session.name, avatar: session.avatar ?? null, connected: true, dropAt: null, ...emptyHand() }
    session.seat = index
    this.maybeStart()
    if (!silent) this.broadcast()
    return null
  }

  standUp(session) {
    if (!this.seatOf(session)) return 'BAD_PHASE'
    this.release(session.seat)
    session.seat = null
    this.broadcast()
    return null
  }

  kick(session, index) {
    if (session.id !== this.hostId) return 'NOT_HOST'
    const seat = this.seats[index]
    if (!seat || seat.sid === session.id) return 'BAD_MESSAGE'
    this.release(index)
    this.broadcast()
    return null
  }

  // Deja el asiento. En plena mano la suya se retira y el asiento se libera al terminar.
  release(index) {
    const seat = this.seats[index]
    if (!seat) return
    const owner = [...this.members.values()].find((m) => m.seat === index)
    if (owner) owner.seat = null
    if (!seat.inHand || this.phase === 'waiting') {
      this.seats[index] = null
      return
    }
    seat.sid = null
    seat.connected = false
    // Ya retirado, en el enfrentamiento o all-in (no tiene nada que decidir): la mano sigue su curso.
    if (!this.live() || seat.folded || seat.allIn) return
    seat.folded = true
    seat.action = 'Se retira'
    if (this.turn === index && this.deadline !== null) {
      seat.acted = true
      this.progress(index)
    } else this.checkLastStanding()
  }

  freeSeat(index) {
    const owner = [...this.members.values()].find((m) => m.seat === index)
    if (owner) owner.seat = null
    this.seats[index] = null
  }

  // Cae el socket: el asiento se reserva un rato y su turno sigue corriendo por si vuelve.
  disconnect(session) {
    const seat = this.seatOf(session)
    if (seat) {
      seat.connected = false
      seat.dropAt = this.now() + GRACE_MS
    }
    this.broadcast()
  }

  reconnect(session) {
    const seat = this.seatOf(session)
    if (seat) {
      seat.connected = true
      seat.dropAt = null
    }
    this.members.set(session.id, session)
    this.emptySince = null
    this.maybeStart()
    this.broadcast()
  }

  // Economía semanal: sin recargas. Quien se arruina espera al reinicio del domingo.
  rebuy() {
    return 'BROKE'
  }

  // Tras el reinicio semanal los saldos cambian: puede que ya haya dos jugadores con fichas.
  refresh() {
    this.maybeStart()
    this.broadcast()
  }

  // --- manos ---

  eligible(seat) {
    return Boolean(seat?.sid && seat.connected && this.balance(seat) >= BIG_BLIND)
  }

  // Con dos o más jugadores listos, la mano empieza tras una breve cuenta atrás.
  maybeStart() {
    if (this.phase !== 'waiting' || this.pending) return
    if (this.seats.filter((s) => this.eligible(s)).length < 2) return
    this.span = START_MS
    this.deadline = this.now() + START_MS
    this.later('start', START_MS)
  }

  // Siguiente asiento (en el sentido del juego) que cumple `test`.
  after(index, test) {
    const n = this.seats.length
    for (let k = 1; k <= n; k++) {
      const i = (index + k + n) % n
      if (test(this.seats[i], i)) return i
    }
    return null
  }

  startHand() {
    const players = this.seats.filter((s) => this.eligible(s))
    if (players.length < 2) {
      this.phase = 'waiting'
      return
    }
    this.hand++
    this.deck = createDeck(this.randomInt)
    this.board = []
    this.result = null
    this.reveal = false
    for (const seat of this.seats) if (seat) Object.assign(seat, emptyHand(), { inHand: this.eligible(seat) })
    const inHand = (s) => s?.inHand
    this.button = this.after(this.button, inHand)
    // Mano a mano, el botón pone la ciega pequeña y habla primero antes del flop.
    this.sb = players.length === 2 ? this.button : this.after(this.button, inHand)
    this.bb = this.after(this.sb, inHand)
    this.phase = 'preflop'
    this.post(this.sb, SMALL_BLIND, 'Ciega pequeña')
    this.post(this.bb, BIG_BLIND, 'Ciega grande')
    this.currentBet = BIG_BLIND
    this.minRaise = BIG_BLIND
    for (let round = 0; round < 2; round++) {
      let i = this.sb
      do {
        this.seats[i].cards.push(this.deck.pop())
        i = this.after(i, inHand)
      } while (i !== this.sb)
    }
    this.progress(this.bb)
  }

  post(index, amount, label) {
    const seat = this.seats[index]
    this.put(seat, Math.min(amount, this.balance(seat)))
    seat.action = label
  }

  put(seat, chips) {
    this.accounts.adjust(seat.token, -chips)
    seat.bet += chips
    seat.total += chips
    if (this.balance(seat) === 0) seat.allIn = true
  }

  actors() {
    return this.seats.filter((s) => s?.inHand && !s.folded && !s.allIn).length
  }

  // Quién habla después de `from`, o null si la calle está cerrada.
  nextToAct(from) {
    const alone = this.actors() <= 1
    return this.after(from, (s) => {
      if (!s?.inHand || s.folded || s.allIn) return false
      if (s.bet < this.currentBet) return true
      return !s.acted && !alone
    })
  }

  progress(from) {
    if (this.checkLastStanding()) return
    const next = this.nextToAct(from)
    if (next === null) return this.endStreet()
    this.setTurn(next)
  }

  checkLastStanding() {
    const left = this.seats.filter((s) => s?.inHand && !s.folded)
    if (left.length !== 1) return false
    this.winByFold(left[0])
    return true
  }

  setTurn(index) {
    this.clearTimer()
    this.turn = index
    const seat = this.seats[index]
    if (!seat.sid) return this.autoAct(index)
    // Sin conexión: se le da poco margen.
    const ms = seat.connected ? TURN_MS : Math.min(TURN_MS, Math.max(0, seat.dropAt - this.now()), 8000)
    this.span = TURN_MS
    this.deadline = this.now() + ms
    this.later('turn', ms, index)
  }

  // Se acabó el tiempo: pasa si puede y, si no, se retira.
  autoAct(index) {
    this.apply(index, this.seats[index].bet >= this.currentBet ? 'check' : 'fold')
  }

  action(session, kind, amount) {
    if (!this.live() || session.seat === null || this.turn !== session.seat || this.deadline === null) return 'NOT_YOUR_TURN'
    const error = this.apply(session.seat, kind, amount)
    if (!error) this.broadcast()
    return error
  }

  // `amount` en una subida es el total que queda apostado en esta calle.
  apply(index, kind, amount) {
    const seat = this.seats[index]
    const stack = this.balance(seat)
    if (kind === 'fold') {
      seat.folded = true
      seat.action = 'Se retira'
    } else if (kind === 'check') {
      if (seat.bet < this.currentBet) return 'BAD_MESSAGE'
      seat.action = 'Pasa'
    } else if (kind === 'call') {
      const owed = Math.min(this.currentBet - seat.bet, stack)
      if (owed <= 0) return 'BAD_MESSAGE'
      this.put(seat, owed)
      seat.action = seat.allIn ? 'All-in' : 'Iguala'
    } else if (kind === 'raise') {
      const max = seat.bet + stack
      if (!Number.isInteger(amount) || amount <= this.currentBet) return 'BAD_MESSAGE'
      if (amount > max) return 'INSUFFICIENT_FUNDS'
      // Una subida menor que la mínima solo vale si es todo lo que le queda.
      if (amount < this.currentBet + this.minRaise && amount < max) return 'BAD_MESSAGE'
      const raise = amount - this.currentBet
      if (raise >= this.minRaise) {
        this.minRaise = raise
        for (const other of this.seats) if (other && other !== seat) other.acted = false
      }
      seat.action = this.currentBet === 0 ? 'Apuesta' : 'Sube'
      this.put(seat, amount - seat.bet)
      if (seat.allIn) seat.action = 'All-in'
      this.currentBet = amount
    } else return 'BAD_MESSAGE'
    seat.acted = true
    this.progress(index)
    return null
  }

  endStreet() {
    this.clearTimer()
    this.turn = null
    this.deadline = null
    if (this.phase === 'river') return this.showdown()
    // Si ya no queda quién apueste, se destapan las manos y el tablero sale solo.
    const runout = this.actors() < 2
    if (runout) this.reveal = true
    this.later('street', runout ? RUNOUT_MS : STREET_MS)
  }

  nextStreet() {
    this.phase = STREETS[STREETS.indexOf(this.phase) + 1]
    for (const seat of this.seats) {
      if (!seat?.inHand) continue
      seat.bet = 0
      seat.acted = false
      if (!seat.folded && !seat.allIn) seat.action = null
    }
    this.currentBet = 0
    this.minRaise = BIG_BLIND
    this.deck.pop() // quemada
    for (let i = 0; i < (this.phase === 'flop' ? 3 : 1); i++) this.board.push(this.deck.pop())
    if (this.actors() < 2) return this.endStreet()
    this.progress(this.button)
  }

  // Orden de reparto: empieza a la izquierda del botón.
  order() {
    const n = this.seats.length
    return Array.from({ length: n }, (_, k) => (this.button + 1 + k) % n)
  }

  showdown() {
    this.clearTimer()
    this.phase = 'showdown'
    this.turn = null
    this.deadline = null
    this.reveal = true
    const players = this.seats.map((seat, index) => ({ seat, index })).filter(({ seat }) => seat?.inHand)
    // La parte de una apuesta que nadie igualó vuelve a su dueño.
    const [top, second] = [...players].sort((a, b) => b.seat.total - a.seat.total)
    const excess = top.seat.total - second.seat.total
    if (excess > 0) {
      top.seat.total -= excess
      this.accounts.adjust(top.seat.token, excess)
    }
    const scores = new Map()
    for (const { seat, index } of players) {
      if (seat.folded) continue
      const best = bestHand([...seat.cards, ...this.board])
      seat.handName = best.name
      seat.best = best.cards.map((card) => card.id)
      scores.set(index, best.score)
    }
    const pots = buildPots(players.map(({ seat, index }) => ({ seat: index, amount: seat.total, live: !seat.folded })))
    this.pay(awardPots(pots, scores, this.order()), false, pots.length)
    this.schedule(SHOW_MS)
  }

  winByFold(winner) {
    this.clearTimer()
    this.phase = 'showdown'
    this.turn = null
    this.deadline = null
    this.reveal = false
    const pot = this.seats.reduce((sum, s) => sum + (s?.inHand ? s.total : 0), 0)
    this.pay(new Map([[this.seats.indexOf(winner), pot]]), true, 1)
    this.schedule(FOLD_WIN_MS)
  }

  pay(won, byFold, pots) {
    // Todo lo apostado pasa al bote.
    for (const seat of this.seats) if (seat) seat.bet = 0
    const winners = []
    for (const [index, amount] of won) {
      const seat = this.seats[index]
      seat.won = amount
      this.accounts.adjust(seat.token, amount)
      winners.push({ seat: index, name: seat.name, amount, hand: byFold ? null : seat.handName, best: byFold ? [] : seat.best })
    }
    winners.sort((a, b) => b.amount - a.amount)
    this.result = { byFold, winners, pots }
  }

  schedule(ms) {
    this.span = ms
    this.deadline = null
    this.later('finish', ms)
  }

  finishHand() {
    for (let i = 0; i < this.seats.length; i++) {
      const seat = this.seats[i]
      if (!seat) continue
      // Sin dueño (se fue en plena mano) o fuera de línea pasado el plazo: se libera.
      if (!seat.sid || (!seat.connected && seat.dropAt < this.now())) {
        this.freeSeat(i)
        continue
      }
      Object.assign(seat, emptyHand())
    }
    this.phase = 'waiting'
    this.board = []
    this.result = null
    this.reveal = false
    this.turn = null
    this.currentBet = 0
    this.maybeStart()
  }

  // --- mantenimiento ---

  sweep() {
    const t = this.now()
    let changed = false
    for (let i = 0; i < this.seats.length; i++) {
      const seat = this.seats[i]
      if (seat && !seat.inHand && !seat.connected && seat.dropAt < t) {
        this.freeSeat(i)
        changed = true
      }
    }
    if (changed) this.broadcast()
    const anyone = [...this.members.values()].some((m) => m.ws?.readyState === 1)
    if (anyone) this.emptySince = null
    else this.emptySince ??= t
    if (!this.persistent && this.emptySince !== null && t - this.emptySince > EMPTY_MS) this.close()
  }

  close() {
    clearInterval(this.sweeper)
    this.clearTimer()
    this.onClose?.(this)
  }


  // --- vista: cada miembro solo ve sus propias cartas (y las de todos al enseñarlas) ---

  view(viewerId) {
    return {
      game: 'poker',
      code: this.code,
      label: this.label,
      hostId: this.hostId,
      phase: this.phase,
      hand: this.hand,
      blinds: { small: SMALL_BLIND, big: BIG_BLIND },
      board: this.board,
      button: this.button,
      sb: this.sb,
      bb: this.bb,
      turn: this.turn,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      pot: this.seats.reduce((sum, s) => sum + (s?.inHand ? s.total - s.bet : 0), 0),
      result: this.result,
      deadlineIn: this.deadline === null ? null : Math.max(0, this.deadline - this.now()),
      deadlineTotal: this.span,
      spectators: [...this.members.values()].filter((m) => m.seat === null).length,
      seats: this.seats.map((seat, index) => {
        if (!seat) return null
        const open = seat.sid === viewerId || (this.reveal && seat.inHand && !seat.folded)
        return {
          seat: index,
          id: seat.sid,
          name: seat.name,
          avatar: seat.avatar,
          balance: this.balance(seat),
          inHand: seat.inHand,
          cards: open ? seat.cards : seat.cards.map(() => null),
          bet: seat.bet,
          total: seat.total,
          folded: seat.folded,
          allIn: seat.allIn,
          action: seat.action,
          won: seat.won,
          handName: open ? seat.handName : null,
          connected: seat.connected,
        }
      }),
    }
  }

  broadcast() {
    this.rev++
    for (const member of this.members.values()) {
      if (member.ws?.readyState === 1) member.ws.send(JSON.stringify({ t: 'state', rev: this.rev, state: this.view(member.id) }))
    }
  }
}

Object.assign(PokerRoom.prototype, timerMethods)

// Qué pasa cuando vence cada temporizador.
PokerRoom.prototype.onTimer = {
  start() {
    this.deadline = null
    this.startHand()
  },
  turn(index) {
    this.autoAct(index)
  },
  street() {
    this.nextStreet()
  },
  finish() {
    this.finishHand()
  },
}
