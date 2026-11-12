// Feria de las Islas: una partida de tablero para hasta feria.SEATS personas (reglas y motor en src/juegos/feria/feria.js).
// Hay una sola sala para todo el casino. Su estado entero va en una fila de juegos_rondas (juego «feria», ronda 0) y cada
// partida acabada deja su resumen en la ronda de su id. Nada tiene temporizador: el motor se pone al día con la hora de
// la primera petición que llega (advance), siempre con la fila bloqueada, así que dos peticiones a la vez no pisan nada.
// El azar (dados, papeletas, feriantes) sale de HMAC(secreto, partida, ronda): nadie puede saberlo de antemano.
// La inscripción se cobra al entrar en la sala (y se devuelve si sales antes de empezar). Al acabar se reparte el bote
// entre los tres primeros; lo que les tocaría a los feriantes de la casa no se paga, y si la casa sale ganando, va a la
// jaula del bingo.
//   feria   cualquiera: a «sync», «join», «leave», «take» (r: ronda; comprar o mejorar) o «tug» (r, n: tirones del duelo)
import * as feria from '../../src/juegos/feria/feria.js'
import { hmacStream, uniform } from './solo.mjs'
import { weekOf } from './engine/week.mjs'

export const FERIA_TOPIC = 'juegos-feria'
const HISTORY = 6

export const FERIA_ERRORS = {
  FERIA_RUNNING: 'La partida ya ha empezado: apúntate a la siguiente.',
  FERIA_FULL: 'La sala está llena: apúntate a la siguiente partida.',
  FERIA_IN: 'Ya estás en la sala.',
  FERIA_OUT: 'No estás en esta partida.',
  FERIA_NO_OFFER: 'Ahora no tienes nada que comprar.',
  FERIA_NO_CASH: 'No te llegan las perras.',
  FERIA_NO_DUEL: 'El duelo ya ha terminado.',
}

export function createFeria({ db, now, secret, move, feed }) {
  const randOf = (state) => (label) => uniform(hmacStream(secret, `feria:${state.id}:${label}`))
  const plain = (sql, params) => db.query(sql, params)

  async function load(q, lock = false) {
    const row = (await q(`select datos from public.juegos_rondas where juego = 'feria' and ronda = 0${lock ? ' for update' : ''}`)).rows[0]
    return row?.datos?.v === feria.VERSION ? row.datos : null
  }
  const save = (q, state) =>
    q(
      `insert into public.juegos_rondas (juego, ronda, datos) values ('feria', 0, $1)
       on conflict (juego, ronda) do update set datos = excluded.datos, creado = now()`,
      [JSON.stringify(state)],
    )

  // Reparto al acabar: los premios de las personas al saldo, el resumen al historial.
  async function settle(q, state) {
    const stale = state.week !== weekOf(now()).key
    const deltas = {}
    let humans = 0
    let paid = 0
    for (const r of state.result) {
      const p = state.players[r.seat]
      if (p.bot) continue
      humans++
      if (r.prize > 0) {
        deltas[p.id] = r.prize
        paid += r.prize
      }
    }
    if (!stale) {
      if (Object.keys(deltas).length) await move(q, deltas)
      const house = humans * feria.ENTRY - paid
      if (house > 0) await feed(q, house)
    }
    state.paid = true
    const entry = {
      v: feria.VERSION,
      at: state.endAt,
      n: state.players.length,
      pot: feria.potOf(state.players.length),
      players: state.result.map((r) => {
        const p = state.players[r.seat]
        return { id: p.id, name: p.name, avatar: p.avatar, bot: p.bot, place: r.place, worth: r.worth, stalls: r.stalls, prize: r.prize }
      }),
    }
    await q(`insert into public.juegos_rondas (juego, ronda, datos) values ('feria', $1, $2) on conflict (juego, ronda) do nothing`, [state.id, JSON.stringify(entry)])
  }

  // Con la fila bloqueada: pone la partida al día, aplica la acción (fn devuelve un código de error o null) y guarda.
  async function withState(fn) {
    return db.tx(async (q) => {
      await q(`insert into public.juegos_rondas (juego, ronda, datos) values ('feria', 0, '{}'::jsonb) on conflict (juego, ronda) do nothing`)
      let state = await load(q, true)
      const t = now()
      let dirty = false
      if (state) {
        const out = feria.advance(state, t, randOf(state))
        if (out.finished) await settle(q, state)
        dirty = out.changed
      }
      const res = fn ? await fn(q, state, t) : { error: null }
      if (res.state) state = res.state
      if (state && (dirty || !res.error)) await save(q, state)
      return { error: res.error ?? null, changed: dirty || (Boolean(fn) && !res.error) }
    })
  }

  async function join(user) {
    return withState(async (q, current, t) => {
      // Sin sala, o con la partida anterior ya acabada: se abre una nueva.
      const state = !current || current.phase === 'done' ? feria.newMatch(t, weekOf(t).key) : current
      if (state.phase !== 'lobby') return { error: 'FERIA_RUNNING' }
      if (state.players.some((p) => p.id === user.id)) return { error: 'FERIA_IN' }
      if (state.players.length >= feria.SEATS) return { error: 'FERIA_FULL' }
      if (!(await move(q, { [user.id]: -feria.ENTRY }, true))) return { error: 'INSUFFICIENT_FUNDS' }
      return { error: feria.addPlayer(state, user, t), state }
    })
  }

  async function leave(user) {
    return withState(async (q, state) => {
      if (!state) return { error: 'FERIA_OUT' }
      const error = feria.removePlayer(state, user.id)
      if (!error && state.week === weekOf(now()).key) await move(q, { [user.id]: feria.ENTRY })
      return { error }
    })
  }

  // Comprar y tirar llevan la ronda (r) en la que se pulsó: si llegan con la ronda ya cambiada, no valen para la nueva.
  const act = (round, fn) => withState(async (_q, state, t) => ({ error: !state ? 'FERIA_OUT' : state.round !== round ? 'BAD_PHASE' : fn(state, t) }))

  async function history() {
    const { rows } = await db.query(`select ronda, datos from public.juegos_rondas where juego = 'feria' and ronda > 0 order by ronda desc limit ${HISTORY}`)
    return rows.filter((r) => r.datos.v === feria.VERSION).map((r) => r.datos)
  }

  // Lo que ve la pantalla: la partida entera sin los ids de nadie (tu asiento va en «seat»).
  async function view(userId, balance) {
    const [state, past] = await Promise.all([load(plain), history()])
    const t = now()
    const strip = (list) => list.map(({ id, ...p }) => ({ ...p, me: id === userId }))
    const base = { now: t, entry: feria.ENTRY, balance, history: past.map((m) => ({ ...m, players: strip(m.players) })) }
    if (!state) return { ...base, phase: 'lobby', id: null, players: [], seat: -1, startAt: null }
    const seat = state.players.findIndex((p) => p.id === userId)
    const players = state.players.map((p, i) => ({ name: p.name, avatar: p.avatar, bot: p.bot, cash: p.cash, pos: p.pos, worth: feria.worthOf(state, i) }))
    return {
      ...base,
      id: state.id,
      phase: state.phase,
      seat,
      players,
      startAt: state.startAt,
      owners: state.owners,
      levels: state.levels,
      bote: state.bote,
      round: state.round,
      cur: state.cur,
      endAt: state.endAt,
      result: state.result,
      pot: feria.potOf(Math.max(state.players.length, state.phase === 'lobby' ? feria.MIN_PLAYERS : 0)),
    }
  }

  async function handle(user, msg, reply) {
    let out = { error: null, changed: false }
    if (msg.a === 'join') out = await join(user)
    else if (msg.a === 'leave') out = await leave(user)
    else if (msg.a === 'take') out = await act(msg.r, (state, t) => feria.accept(state, user.id, t))
    else if (msg.a === 'tug') out = await act(msg.r, (state, t) => feria.tug(state, user.id, msg.n, t))
    else if (msg.a !== 'sync') out.error = 'BAD_MESSAGE'
    // Ponerse al día sin acción: solo se bloquea la fila si de verdad toca avanzar.
    else if (feria.due(await load(plain), now())) out = await withState(null)
    if (out.error) reply.error = { code: out.error }
    const balance = Number((await db.query(`select saldo from public.juegos_cuentas where usuario_id = $1`, [user.id])).rows[0]?.saldo ?? 0)
    reply.me.balance = balance
    reply.feria = await view(user.id, balance)
    return out.changed
  }

  // Reinicio del domingo: la sala y el historial se borran (los saldos vuelven a empezar).
  const sweep = (q) => q(`delete from public.juegos_rondas where juego = 'feria'`)

  return { handle, sweep }
}
