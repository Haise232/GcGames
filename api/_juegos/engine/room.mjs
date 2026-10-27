// Copiado del proyecto de juegos (Rule) con scripts/export-topcode.mjs: no editar aquí.
// Una mesa de blackjack: asientos, fases, turnos y crupier. El servidor es la única autoridad.
import { createShoe, dealerMustDraw, handValue, isNatural, settleHand } from './blackjack-core.mjs'
import { realTimers, timerMethods } from './timers.mjs'

export const CHIPS = [50, 100, 500, 1000]
const CUT = 78
const BET_MS = 20000
const TURN_MS = 20000
const DEALER_MS = 900
const SETTLE_MS = 5000
const GRACE_MS = 60000
const EMPTY_MS = 5 * 60000
const SWEEP_MS = 5000

const total = (cards) => handValue(cards).total

// session: { id, token, name, ws, role, seat }. ws solo necesita readyState y send().
export class Room {
  constructor({ code, seats, accounts, randomInt, onClose, now = Date.now, label = null, persistent = false, timers = realTimers }) {
    this.game = 'blackjack'
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
    this.phase = 'betting'
    this.shoe = createShoe(randomInt)
    this.dealer = []
    this.revealed = false
    this.turn = null
    this.deadline = null
    this.span = 0
    this.round = 0
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

  // Quita al miembro del todo (salir de la sala). Si estaba en una ronda, su mano se planta sola.
  leave(session) {
    if (!this.members.delete(session.id)) return
    const seat = this.seatOf(session)
    if (seat) {
      if (this.phase === 'betting' || this.phase === 'settle') this.freeSeat(session.seat)
      else {
        seat.sid = null // la mano sigue viva y se resuelve sola; el asiento se libera al terminar
        if (this.phase === 'playing' && this.turn === session.seat) this.stand(session.seat)
      }
    }
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
    const acc = this.accounts.get(session.token)
    const bet = Math.min(CHIPS[1], acc.balance - (acc.balance % CHIPS[0]))
    this.seats[index] = { sid: session.id, token: session.token, name: session.name, avatar: session.avatar ?? null, bet, locked: false, cards: [], status: 'waiting', outcome: null, paid: 0, doubled: false, connected: true, dropAt: null }
    session.seat = index
    if (!silent) this.broadcast()
    return null
  }

  standUp(session) {
    const seat = this.seatOf(session)
    if (!seat) return 'BAD_PHASE'
    if (this.phase !== 'betting' && this.phase !== 'settle') return 'BAD_PHASE'
    this.freeSeat(session.seat)
    session.seat = null
    this.afterBetChange()
    this.broadcast()
    return null
  }

  freeSeat(index) {
    const seat = this.seats[index]
    if (!seat) return
    // Una apuesta ya descontada y sin repartir se devuelve.
    if (seat.locked && this.phase === 'betting') this.accounts.adjust(seat.token, seat.bet)
    this.seats[index] = null
    const owner = [...this.members.values()].find((m) => m.seat === index)
    if (owner) owner.seat = null
  }

  kick(session, index) {
    if (session.id !== this.hostId) return 'NOT_HOST'
    const seat = this.seats[index]
    if (!seat || seat.sid === session.id) return 'BAD_MESSAGE'
    if (this.phase !== 'betting' && this.phase !== 'settle') return 'BAD_PHASE'
    this.freeSeat(index)
    this.afterBetChange()
    this.broadcast()
    return null
  }

  // Cae el socket: el asiento se reserva un rato.
  disconnect(session) {
    const seat = this.seatOf(session)
    if (seat) {
      seat.connected = false
      seat.dropAt = this.now() + GRACE_MS
    }
    this.broadcast()
    // Si le tocaba jugar, no se espera al temporizador.
    if (seat && this.phase === 'playing' && this.turn === session.seat) this.stand(session.seat)
  }

  reconnect(session) {
    const seat = this.seatOf(session)
    if (seat) {
      seat.connected = true
      seat.dropAt = null
    }
    this.members.set(session.id, session)
    this.emptySince = null
    this.broadcast()
  }

  // --- apuestas ---

  bet(session, amount) {
    const seat = this.seatOf(session)
    if (!seat) return 'BAD_PHASE'
    if (this.phase !== 'betting' || seat.locked) return 'BAD_PHASE'
    if (!Number.isInteger(amount) || amount < 0 || amount % CHIPS[0] !== 0) return 'BAD_MESSAGE'
    if (amount > this.accounts.get(seat.token).balance) return 'INSUFFICIENT_FUNDS'
    seat.bet = amount
    this.broadcast()
    return null
  }

  ready(session) {
    const seat = this.seatOf(session)
    if (!seat || this.phase !== 'betting' || seat.locked) return 'BAD_PHASE'
    if (seat.bet <= 0) return 'BAD_MESSAGE'
    if (!this.lock(seat)) return 'INSUFFICIENT_FUNDS'
    this.afterBetChange()
    this.broadcast()
    return null
  }

  lock(seat) {
    if (seat.bet <= 0 || seat.bet > this.accounts.get(seat.token).balance) return false
    this.accounts.adjust(seat.token, -seat.bet)
    seat.locked = true
    return true
  }

  // Arranca la ronda cuando todos los sentados confirmaron; si no, arma el temporizador de apuestas.
  afterBetChange() {
    const sitting = this.seats.filter(Boolean)
    const locked = sitting.filter((s) => s.locked)
    if (locked.length === 0) {
      this.clearTimer()
      this.deadline = null
      return
    }
    if (locked.length === sitting.length) return this.deal()
    if (!this.pending) {
      this.span = BET_MS
      this.deadline = this.now() + BET_MS
      this.later('bets', BET_MS)
    }
  }

  // --- ronda ---

  deal() {
    this.clearTimer()
    // Quien no apostó mira la ronda.
    if (this.shoe.length < CUT) this.shoe = createShoe(this.randomInt)
    const draw = () => this.shoe.pop()
    const players = this.seats.filter((s) => s?.locked)
    for (const seat of players) seat.cards = [draw(), draw()]
    this.dealer = [draw(), draw()]
    this.revealed = false
    this.round++
    for (const seat of players) seat.status = isNatural(seat.cards) ? 'blackjack' : 'playing'
    if (isNatural(this.dealer) || players.every((s) => s.status === 'blackjack')) return this.startDealer()
    this.phase = 'playing'
    this.nextTurn(-1)
  }

  nextTurn(after) {
    const next = this.seats.findIndex((s, i) => i > after && s?.status === 'playing')
    if (next === -1) return this.startDealer()
    this.turn = next
    const seat = this.seats[next]
    if (!seat.connected || !seat.sid) return this.stand(next)
    this.span = TURN_MS
    this.deadline = this.now() + TURN_MS
    this.later('turn', TURN_MS, next)
  }

  action(session, kind) {
    const seat = this.seatOf(session)
    if (!seat || this.phase !== 'playing' || this.turn !== session.seat) return 'NOT_YOUR_TURN'
    if (kind === 'stand') this.stand(session.seat)
    else if (kind === 'hit') this.hit(session.seat)
    else if (kind === 'double') {
      if (seat.cards.length !== 2 || this.accounts.get(seat.token).balance < seat.bet) return 'INSUFFICIENT_FUNDS'
      this.accounts.adjust(seat.token, -seat.bet)
      seat.bet *= 2
      seat.doubled = true
      seat.cards.push(this.shoe.pop())
      this.finishHand(session.seat, true)
    } else return 'BAD_MESSAGE'
    this.broadcast()
    return null
  }

  hit(index) {
    const seat = this.seats[index]
    seat.cards.push(this.shoe.pop())
    this.finishHand(index, false)
  }

  finishHand(index, force) {
    const seat = this.seats[index]
    const value = total(seat.cards)
    if (value > 21) seat.status = 'bust'
    else if (force || value === 21) seat.status = 'stand'
    else {
      // Sigue jugando: se renueva el tiempo de turno.
      this.nextTurn(index - 1)
      return
    }
    this.nextTurn(index)
  }

  stand(index) {
    const seat = this.seats[index]
    if (seat?.status !== 'playing') return
    seat.status = 'stand'
    this.nextTurn(index)
  }

  startDealer() {
    this.clearTimer()
    this.phase = 'dealer'
    this.turn = null
    this.deadline = null
    this.stepDealer()
  }

  stepDealer() {
    this.later('dealer', DEALER_MS)
  }

  hands() {
    return this.seats.filter((s) => s?.locked).map((s) => s.cards)
  }

  settle() {
    for (const seat of this.seats) {
      if (!seat?.locked) continue
      const { outcome, paid } = settleHand(seat.cards, seat.bet, this.dealer)
      seat.outcome = outcome
      seat.paid = paid
      if (paid > 0) this.accounts.adjust(seat.token, paid)
    }
    this.phase = 'settle'
    this.span = SETTLE_MS
    this.deadline = this.now() + SETTLE_MS
    this.later('round', SETTLE_MS)
    this.broadcast()
  }

  newRound() {
    this.phase = 'betting'
    this.dealer = []
    this.revealed = false
    this.turn = null
    this.deadline = null
    for (let i = 0; i < this.seats.length; i++) {
      const seat = this.seats[i]
      if (!seat) continue
      // Sin dueño (salió en plena ronda) o fuera de línea pasado el plazo: se libera.
      if (!seat.sid || (!seat.connected && seat.dropAt < this.now())) {
        this.seats[i] = null
        continue
      }
      const balance = this.accounts.get(seat.token).balance
      Object.assign(seat, {
        cards: [],
        locked: false,
        status: 'waiting',
        outcome: null,
        paid: 0,
        doubled: false,
        bet: Math.min(seat.bet / (seat.doubled ? 2 : 1), balance - (balance % CHIPS[0])),
      })
    }
  }

  // Economía semanal: sin recargas. Quien se arruina espera al reinicio del domingo.
  rebuy() {
    return 'BROKE'
  }

  // Tras el reinicio semanal los saldos cambian: se recoloca la apuesta propuesta y se avisa a la mesa.
  refresh() {
    for (const seat of this.seats) {
      if (!seat || seat.locked) continue
      const balance = this.accounts.get(seat.token).balance
      seat.bet = Math.min(seat.bet || CHIPS[1], balance - (balance % CHIPS[0]))
    }
    this.broadcast()
  }

  // --- mantenimiento ---

  sweep() {
    const t = this.now()
    if (this.phase === 'betting') {
      let changed = false
      for (let i = 0; i < this.seats.length; i++) {
        const seat = this.seats[i]
        if (seat && !seat.connected && seat.dropAt < t) {
          this.freeSeat(i)
          changed = true
        }
      }
      if (changed) {
        this.afterBetChange()
        this.broadcast()
      }
    }
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

  // --- vista pública: nunca incluye el zapato, tokens ni la carta tapada ---

  view() {
    const hidden = this.dealer.length > 0 && !this.revealed
    const shown = hidden ? this.dealer.slice(0, 1) : this.dealer
    return {
      game: 'blackjack',
      code: this.code,
      label: this.label,
      hostId: this.hostId,
      phase: this.phase,
      round: this.round,
      shoe: this.shoe.length,
      dealer: hidden ? [...shown, null] : shown,
      dealerTotal: shown.length ? total(shown) : null,
      turn: this.turn,
      deadlineIn: this.deadline === null ? null : Math.max(0, this.deadline - this.now()),
      deadlineTotal: this.span,
      spectators: [...this.members.values()].filter((m) => m.seat === null).length,
      seats: this.seats.map((seat, index) =>
        seat
          ? {
              seat: index,
              id: seat.sid,
              name: seat.name,
              avatar: seat.avatar,
              balance: this.accounts.get(seat.token).balance,
              bet: seat.bet,
              locked: seat.locked,
              cards: seat.cards,
              total: seat.cards.length ? total(seat.cards) : null,
              status: seat.status,
              outcome: seat.outcome,
              paid: seat.paid,
              doubled: seat.doubled,
              connected: seat.connected,
            }
          : null,
      ),
    }
  }

  broadcast() {
    this.rev++
    const message = JSON.stringify({ t: 'state', rev: this.rev, state: this.view() })
    for (const member of this.members.values()) {
      if (member.ws?.readyState === 1) member.ws.send(message)
    }
  }
}

Object.assign(Room.prototype, timerMethods)

// Qué pasa cuando vence cada temporizador.
Room.prototype.onTimer = {
  // Se acabó el tiempo de apuestas: juega quien tenga fichas puestas.
  bets() {
    for (const seat of this.seats) if (seat && !seat.locked) this.lock(seat)
    if (this.seats.some((s) => s?.locked)) this.deal()
    else this.afterBetChange()
  },
  turn(index) {
    this.stand(index)
  },
  // El crupier destapa y roba a su ritmo, una carta cada vez.
  dealer() {
    if (!this.revealed) this.revealed = true
    else if (dealerMustDraw(this.hands(), this.dealer)) this.dealer.push(this.shoe.pop())
    else return this.settle()
    this.stepDealer()
  },
  round() {
    this.newRound()
  },
}
