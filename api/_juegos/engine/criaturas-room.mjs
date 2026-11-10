// Motor de las mesas en vivo: duelo de Criaturas de las Islas entre dos jugadores. Como en el ajedrez, se acuerda una
// apuesta, los dos la ponen al empezar y quien gana se lleva el bote (menos FEE, que va a la jaula del bingo); si
// empatan, cada uno recupera lo suyo. Cada uno trae las criaturas de su equipo (las PARTY primeras; si uno trae menos,
// los dos combaten con ese número) y todas luchan en su forma final al nivel DUEL_LEVEL: cuenta la estrategia.
//
// Turnos a la vez: los dos eligen (atacar o cambiar) y, cuando están las dos elecciones o se acaba TURN_MS, el turno
// se resuelve con duelTurn() de criaturas.js. Quien no elige pierde el turno; quien no elige IDLE_LIMIT turnos seguidos
// (o deja la mesa) pierde el duelo. El servidor es la única autoridad: sortea con su generador y nadie ve la elección
// del otro hasta que se resuelve.
import { DUEL_LEVEL, PARTY, alive, duelFighter, duelTurn, movesOf } from '../../../src/juegos/criaturas/criaturas.js'
import { realTimers, timerMethods } from './timers.mjs'

export const MIN_STAKE = 0 // 0: duelo amistoso
export const MAX_STAKE = 10000
export const STAKE_STEP = 100
export const DEFAULT_STAKE = 500
export const TURN_MS = 30000
export const FEE = 0.04
const IDLE_LIMIT = 3
const MAX_TURNS = 80 // si nadie gana antes, empate
const START_MS = 3000
const OVER_MS = 12000
const GRACE_MS = 60000

export const validStake = (n) => Number.isInteger(n) && n >= MIN_STAKE && n <= MAX_STAKE && n % STAKE_STEP === 0
const validTeam = (team) => Array.isArray(team) && team.length >= 1 && team.length <= PARTY && team.every((sp) => typeof sp === 'string')

export class CriaturasRoom {
  constructor({ code, accounts, onClose, now = Date.now, label = null, persistent = false, timers = realTimers, randomInt = (n) => Math.floor(Math.random() * n) }) {
    this.game = 'criaturas'
    this.code = code
    this.label = label
    this.persistent = persistent
    this.accounts = accounts
    this.onClose = onClose
    this.now = now
    this.randomInt = randomInt
    this.seats = [null, null]
    this.members = new Map()
    this.hostId = null
    this.phase = 'waiting' // waiting | playing | over
    this.stake = DEFAULT_STAKE
    this.match = 0
    this.sides = null // [{ team, a, need }, …] durante el duelo
    this.acts = [null, null] // lo que ha elegido cada uno este turno (secreto hasta resolverlo)
    this.turn = 0
    this.lastLog = null // { turn, log } del último turno resuelto, para animarlo
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

  // --- miembros y asientos (como en el ajedrez) ---

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
    this.seats[index] = { sid: session.id, token: session.token, name: session.name, avatar: session.avatar ?? null, connected: true, dropAt: null, ready: false, won: 0, team: [], idle: 0 }
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

  // Quien deja el asiento en pleno duelo lo abandona: gana el otro.
  release(index) {
    const seat = this.seats[index]
    if (!seat) return
    const owner = [...this.members.values()].find((m) => m.seat === index)
    if (owner) owner.seat = null
    if (this.phase === 'playing') this.finish(1 - index, 'abandono')
    this.seats[index] = null
    this.unready()
  }

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

  // --- la apuesta y el «listo» (team: las especies de tu equipo, que pone el servidor al leer tu partida) ---

  bet(session, amount, team) {
    const seat = this.seatOf(session)
    if (!seat || this.phase !== 'waiting') return 'BAD_PHASE'
    if (!validStake(amount)) return 'BAD_MESSAGE'
    if (!validTeam(team)) return 'NO_TEAM'
    if (this.balance(seat) < amount) return 'INSUFFICIENT_FUNDS'
    if (amount !== this.stake) {
      this.stake = amount
      this.unready()
    }
    seat.team = team
    seat.ready = true
    this.maybeStart()
    this.broadcast()
    return null
  }

  ready(session, team) {
    const seat = this.seatOf(session)
    if (!seat || this.phase !== 'waiting') return 'BAD_PHASE'
    if (!seat.ready) {
      if (!validTeam(team)) return 'NO_TEAM'
      if (this.balance(seat) < this.stake) return 'INSUFFICIENT_FUNDS'
      seat.team = team
    }
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
    const short = this.seats.filter((s) => this.balance(s) < this.stake)
    if (short.length) {
      for (const s of short) s.ready = false
      return
    }
    for (const s of this.seats) {
      this.accounts.adjust(s.token, -this.stake)
      s.won = 0
      s.idle = 0
    }
    const n = Math.min(a.team.length, b.team.length)
    this.sides = this.seats.map((s) => ({ team: s.team.slice(0, n).map(duelFighter), a: 0, need: false }))
    this.match++
    this.phase = 'playing'
    this.turn = 0
    this.lastLog = null
    this.result = null
    this.startTurn()
  }

  startTurn() {
    this.clearTimer()
    this.turn++
    this.acts = [null, null]
    this.span = TURN_MS
    this.deadline = this.now() + TURN_MS
    this.later('turn', TURN_MS, this.turn)
  }

  // Quién tiene que elegir este turno: los dos, o solo quien tiene que sacar otra criatura.
  mustAct(index) {
    if (!this.sides) return false
    return this.sides.some((s) => s.need) ? this.sides[index].need : true
  }

  // --- jugadas: { kind: 'move', move } | { kind: 'switch', to } | { kind: 'resign' } ---

  duel(session, msg) {
    const index = session.seat
    if (this.phase !== 'playing' || index === null || !this.seats[index]) return 'BAD_PHASE'
    if (msg.kind === 'resign') {
      this.finish(1 - index, 'rendicion')
      this.broadcast()
      return null
    }
    if (!this.mustAct(index)) return 'NOT_YOUR_TURN'
    const side = this.sides[index]
    const me = side.team[side.a]
    let act
    if (msg.kind === 'move' && typeof msg.move === 'string' && !side.need && movesOf(me.sp, me.lvl).includes(msg.move)) act = { kind: 'move', move: msg.move }
    else if (msg.kind === 'switch' && Number.isInteger(msg.to) && msg.to !== side.a && side.team[msg.to]?.hp > 0) act = { kind: 'switch', to: msg.to }
    else return 'BAD_MESSAGE'
    this.acts[index] = act
    this.seats[index].idle = 0
    if ([0, 1].every((i) => !this.mustAct(i) || this.acts[i])) this.resolve()
    this.broadcast()
    return null
  }

  resolve() {
    // Quien tenía que elegir y no eligió suma un turno perdido; a los IDLE_LIMIT, pierde el duelo.
    for (const i of [0, 1]) {
      if (this.mustAct(i) && !this.acts[i]) {
        this.seats[i].idle = (this.seats[i].idle ?? 0) + 1
        if (this.seats[i].idle >= IDLE_LIMIT) return this.finish(1 - i, 'ausente')
      }
    }
    const r = duelTurn({ sides: this.sides }, this.acts, (n) => this.randomInt(n))
    this.sides = r.duel.sides
    this.lastLog = { turn: this.turn, log: r.log }
    if (r.end !== null) return this.finish(r.end, 'ko')
    if (this.turn >= MAX_TURNS) return this.finish(null, 'turnos')
    this.startTurn()
  }

  // winner: asiento que gana, o null si empatan.
  finish(winner, reason) {
    this.clearTimer()
    this.phase = 'over'
    const pot = this.stake * 2
    const fee = winner === null ? 0 : Math.floor(pot * FEE)
    this.lost = (this.lost ?? 0) + fee // a la jaula del bingo (game.mjs)
    this.seats.forEach((seat, i) => {
      if (!seat) return
      seat.ready = false
      seat.won = winner === null ? this.stake : i === winner ? pot - fee : 0
      if (seat.won) this.accounts.adjust(seat.token, seat.won)
    })
    this.result = { winner, reason, pot, fee, names: this.seats.map((s) => s?.name ?? null), won: this.seats.map((s) => s?.won ?? 0) }
    this.span = OVER_MS
    this.deadline = null
    this.later('reset', OVER_MS)
  }

  reset() {
    this.phase = 'waiting'
    this.sides = null
    this.acts = [null, null]
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

  // --- vista: todos ven las criaturas y la vida; de las elecciones del turno, solo si ya eligió cada uno ---

  view() {
    return {
      game: 'criaturas',
      code: this.code,
      label: this.label,
      hostId: null,
      phase: this.phase,
      match: this.match,
      stake: this.stake,
      limits: { min: MIN_STAKE, max: MAX_STAKE, step: STAKE_STEP, turn: TURN_MS, fee: FEE, level: DUEL_LEVEL, party: PARTY },
      turn: this.turn,
      sides: this.sides,
      chosen: this.acts.map(Boolean),
      must: [0, 1].map((i) => this.phase === 'playing' && this.mustAct(i)),
      lastLog: this.lastLog,
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
          ready: seat.ready,
          team: seat.team,
          idle: seat.idle ?? 0,
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

Object.assign(CriaturasRoom.prototype, timerMethods)

CriaturasRoom.prototype.onTimer = {
  start() {
    this.start()
  },
  turn(turn) {
    if (this.phase === 'playing' && this.turn === turn) this.resolve()
  },
  reset() {
    this.reset()
  },
}
