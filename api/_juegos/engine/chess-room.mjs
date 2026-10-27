// Motor de las mesas (blackjack, póker y ajedrez), compartido por las salas en vivo.
// Una mesa de ajedrez mágico para dos: se acuerda una apuesta, los dos la ponen al empezar y quien gana se lleva las dos.
// En tablas se devuelve cada una. Reloj de 5 minutos por jugador y 3 segundos más por jugada. El servidor es la única
// autoridad: comprueba cada movimiento con chess-core.mjs.
import { apply, findMove, initial, inCheck, keyOf, kingOf, outcome, cannotMate, sanOf, squareOf } from './chess-core.mjs'
import { realTimers, timerMethods } from './timers.mjs'

export const CLOCK_MS = 5 * 60000
export const INCREMENT_MS = 3000
export const MIN_STAKE = 0 // 0: partida amistosa
export const MAX_STAKE = 10000
export const STAKE_STEP = 100
export const DEFAULT_STAKE = 500
const START_MS = 3000
const OVER_MS = 12000
const GRACE_MS = 60000

export const validStake = (n) => Number.isInteger(n) && n >= MIN_STAKE && n <= MAX_STAKE && n % STAKE_STEP === 0

export class ChessRoom {
  constructor({ code, accounts, onClose, now = Date.now, label = null, persistent = false, timers = realTimers }) {
    this.game = 'chess'
    this.code = code
    this.label = label
    this.persistent = persistent
    this.accounts = accounts
    this.onClose = onClose
    this.now = now
    this.seats = [null, null]
    this.members = new Map()
    this.hostId = null
    this.phase = 'waiting' // waiting | playing | over
    this.stake = DEFAULT_STAKE
    this.white = 0 // asiento que lleva blancas; se alterna en cada partida
    this.match = 0
    this.pos = initial()
    this.keys = []
    this.moves = [] // { san, from, to, by: 'w' | 'b' }
    this.last = null // último movimiento, para animarlo: { from, to, rook, captured, capturedAt, promo }
    this.clocks = [CLOCK_MS, CLOCK_MS]
    this.turnStart = null
    this.turn = null
    this.drawOffer = null
    this.result = null
    this.deadline = null
    this.span = 0
    this.rev = 0
    this.timers = timers
    this.timer = null
    this.pending = null
    this.emptySince = null
  }

  balance(seat) {
    return this.accounts.get(seat.token)?.balance ?? 0
  }

  colorOf(index) {
    return index === this.white ? 'w' : 'b'
  }

  seatOfColor(color) {
    return color === 'w' ? this.white : 1 - this.white
  }

  // --- miembros y asientos ---

  join(session, wantSeat) {
    this.members.set(session.id, session)
    this.emptySince = null
    session.room = this
    session.seat = null
    if (wantSeat) this.sit(session, this.seats.findIndex((s) => !s), true)
    this.broadcast()
  }

  leave(session) {
    if (!this.members.delete(session.id)) return
    if (session.seat !== null) this.release(session.seat)
    session.room = null
    session.seat = null
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
    this.seats[index] = { sid: session.id, token: session.token, name: session.name, avatar: session.avatar ?? null, connected: true, dropAt: null, ready: false, won: 0 }
    session.seat = index
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

  // Quien deja el asiento en plena partida la abandona: gana el otro.
  release(index) {
    const seat = this.seats[index]
    if (!seat) return
    const owner = [...this.members.values()].find((m) => m.seat === index)
    if (owner) owner.seat = null
    if (this.phase === 'playing') this.finish(1 - index, 'abandono')
    this.seats[index] = null
    this.unready()
  }

  // Cae la conexión: en la espera deja de estar listo; en la partida su reloj sigue corriendo.
  disconnect(session) {
    const seat = this.seatOf(session)
    if (seat) {
      seat.connected = false
      seat.dropAt = this.now() + GRACE_MS
      if (this.phase === 'waiting') this.unready()
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
    this.broadcast()
  }

  refresh() {
    this.broadcast()
  }

  // --- la apuesta y el «listo» ---

  // Proponer otra apuesta: quien la propone queda listo y el otro tiene que aceptarla.
  bet(session, amount) {
    const seat = this.seatOf(session)
    if (!seat || this.phase !== 'waiting') return 'BAD_PHASE'
    if (!validStake(amount)) return 'BAD_MESSAGE'
    if (this.balance(seat) < amount) return 'INSUFFICIENT_FUNDS'
    if (amount !== this.stake) {
      this.stake = amount
      this.unready()
    }
    seat.ready = true
    this.maybeStart()
    this.broadcast()
    return null
  }

  // Listo / ya no: con los dos listos, la partida empieza tras una breve cuenta atrás.
  ready(session) {
    const seat = this.seatOf(session)
    if (!seat || this.phase !== 'waiting') return 'BAD_PHASE'
    if (!seat.ready && this.balance(seat) < this.stake) return 'INSUFFICIENT_FUNDS'
    seat.ready = !seat.ready
    if (!seat.ready) this.cancelStart()
    this.maybeStart()
    this.broadcast()
    return null
  }

  unready() {
    for (const seat of this.seats) if (seat) seat.ready = false
    this.cancelStart()
  }

  cancelStart() {
    if (this.phase !== 'waiting' || this.pending?.name !== 'start') return
    this.clearTimer()
    this.deadline = null
  }

  maybeStart() {
    if (this.phase !== 'waiting' || this.pending) return
    if (!this.seats.every((s) => s?.ready && s.connected && s.sid)) return
    this.span = START_MS
    this.deadline = this.now() + START_MS
    this.later('start', START_MS)
  }

  start() {
    this.deadline = null
    const [a, b] = this.seats
    if (!a?.ready || !b?.ready || !a.connected || !b.connected) return this.unready()
    // Alguien ya no llega a la apuesta (gastó en otro juego): deja de estar listo.
    const short = this.seats.filter((s) => this.balance(s) < this.stake)
    if (short.length) {
      for (const s of short) s.ready = false
      return
    }
    for (const s of this.seats) {
      this.accounts.adjust(s.token, -this.stake)
      s.won = 0
    }
    this.match++
    this.phase = 'playing'
    this.pos = initial()
    this.keys = [keyOf(this.pos)]
    this.moves = []
    this.last = null
    this.result = null
    this.drawOffer = null
    this.clocks = [CLOCK_MS, CLOCK_MS]
    this.startTurn(this.white)
  }

  startTurn(index) {
    this.clearTimer()
    this.turn = index
    this.turnStart = this.now()
    this.span = CLOCK_MS
    this.deadline = this.now() + this.clocks[index]
    this.later('flag', this.clocks[index], index)
  }

  // Lo que le queda en el reloj a cada uno ahora mismo.
  clocksNow() {
    if (this.phase !== 'playing' || this.turn === null) return [...this.clocks]
    const out = [...this.clocks]
    out[this.turn] = Math.max(0, out[this.turn] - (this.now() - this.turnStart))
    return out
  }

  // --- jugadas ---

  move(session, from, to, promo) {
    const index = session.seat
    if (this.phase !== 'playing' || index === null || index !== this.turn) return 'NOT_YOUR_TURN'
    const a = squareOf(from)
    const b = squareOf(to)
    if (a < 0 || b < 0 || (promo !== undefined && promo !== null && !'qrbn'.includes(promo))) return 'BAD_MESSAGE'
    const m = findMove(this.pos, a, b, promo || undefined)
    if (!m) return 'ILLEGAL_MOVE'
    const left = this.clocksNow()[index]
    if (left <= 0) {
      this.flag(index)
      this.broadcast()
      return null
    }
    const san = sanOf(this.pos, m)
    const by = this.pos.turn
    const done = apply(this.pos, m)
    this.pos = done.pos
    this.keys = this.pos.half === 0 ? [keyOf(this.pos)] : [...this.keys, keyOf(this.pos)]
    this.moves.push({ san, from, to, by })
    this.last = { from: a, to: b, rook: done.rook, captured: done.captured, capturedAt: done.capturedAt, promo: m.promo ?? null, ply: this.moves.length }
    this.clocks[index] = left + INCREMENT_MS
    // Mover rechaza las tablas que te ofrecían.
    this.drawOffer = null
    const end = outcome(this.pos, this.keys)
    if (end) this.finish(end.winner === null ? null : this.seatOfColor(end.winner), end.reason)
    else this.startTurn(1 - index)
    this.broadcast()
    return null
  }

  // kind: 'resign' (rendirse), 'draw' (ofrecer o aceptar tablas) o 'decline' (rechazarlas).
  action(session, kind) {
    const index = session.seat
    if (this.phase !== 'playing' || index === null || !this.seats[index]) return 'BAD_PHASE'
    if (kind === 'resign') this.finish(1 - index, 'rendicion')
    else if (kind === 'draw') {
      if (this.drawOffer === 1 - index) this.finish(null, 'acuerdo')
      else this.drawOffer = index
    } else if (kind === 'decline') {
      if (this.drawOffer !== 1 - index) return 'BAD_PHASE'
      this.drawOffer = null
    } else return 'BAD_MESSAGE'
    this.broadcast()
    return null
  }

  // Se le acabó el tiempo. Si al otro solo le queda el rey (o una pieza menor), no puede ganar: tablas.
  flag(index) {
    this.clocks[index] = 0
    const rival = 1 - index
    if (cannotMate(this.pos.board, this.colorOf(rival))) this.finish(null, 'tiempo')
    else this.finish(rival, 'tiempo')
  }

  // winner: asiento que gana, o null en tablas.
  finish(winner, reason) {
    this.clocks = this.clocksNow()
    this.clearTimer()
    this.phase = 'over'
    this.turn = null
    this.turnStart = null
    this.drawOffer = null
    const pot = this.stake * 2
    this.seats.forEach((seat, i) => {
      if (!seat) return
      seat.ready = false
      seat.won = winner === null ? this.stake : i === winner ? pot : 0
      if (seat.won) this.accounts.adjust(seat.token, seat.won)
    })
    // Quien ya se levantó no está en el asiento, pero su apuesta cuenta igual (la pierde).
    this.result = {
      winner,
      color: winner === null ? null : this.colorOf(winner),
      reason,
      pot,
      names: this.seats.map((s) => s?.name ?? null),
      won: this.seats.map((s) => s?.won ?? 0),
    }
    this.span = OVER_MS
    this.deadline = null
    this.later('reset', OVER_MS)
  }

  reset() {
    this.phase = 'waiting'
    this.white = 1 - this.white
    this.drawOffer = null
    for (let i = 0; i < this.seats.length; i++) {
      const seat = this.seats[i]
      if (!seat) continue
      seat.ready = false
      seat.won = 0
      if (!seat.sid || (!seat.connected && seat.dropAt < this.now())) {
        const owner = [...this.members.values()].find((m) => m.seat === i)
        if (owner) owner.seat = null
        this.seats[i] = null
      }
    }
  }

  // --- vista: en el ajedrez no hay nada oculto, todos ven lo mismo ---

  view() {
    const playing = this.phase === 'playing'
    return {
      game: 'chess',
      code: this.code,
      label: this.label,
      hostId: null,
      phase: this.phase,
      match: this.match,
      stake: this.stake,
      limits: { min: MIN_STAKE, max: MAX_STAKE, step: STAKE_STEP, clock: CLOCK_MS, increment: INCREMENT_MS },
      white: this.white,
      turn: this.turn,
      board: this.pos.board,
      castle: this.pos.castle,
      ep: this.pos.ep,
      toMove: this.pos.turn,
      half: this.pos.half,
      check: playing || this.result?.reason === 'mate' ? (inCheck(this.pos) ? kingOf(this.pos.board, this.pos.turn) : null) : null,
      moves: this.moves,
      last: this.last,
      clocks: this.clocksNow(),
      drawOffer: this.drawOffer,
      result: this.result,
      deadlineIn: this.deadline === null ? null : Math.max(0, this.deadline - this.now()),
      deadlineTotal: this.span,
      spectators: [...this.members.values()].filter((m) => m.seat === null).length,
      seats: this.seats.map((seat, index) => {
        if (!seat) return null
        return {
          seat: index,
          id: seat.sid,
          name: seat.name,
          avatar: seat.avatar,
          balance: this.balance(seat),
          color: this.colorOf(index),
          ready: seat.ready,
          won: seat.won,
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

Object.assign(ChessRoom.prototype, timerMethods)

// Qué pasa cuando vence cada temporizador.
ChessRoom.prototype.onTimer = {
  start() {
    this.start()
  },
  flag(index) {
    if (this.phase === 'playing' && this.turn === index) this.flag(index)
  },
  reset() {
    this.reset()
  },
}
