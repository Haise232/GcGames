// Ascensor en vivo: un viaje para todos cada elevator.ROUND_MS (reglas en src/juegos/elevator/elevator.js).
// La planta en la que se rompe el cable sale de HMAC(secreto, ronda), como la ruleta, y el servidor no la suelta hasta
// que se rompe y ya nadie puede bajarse (puertas cerradas y pasado EXIT_GRACE_MS): mientras tanto la pantalla solo sabe
// en qué planta va (por el reloj) y quién se ha bajado ya. Las bajadas automáticas de los demás no se enseñan hasta que
// llega su planta, para que nadie las copie.
// La partida de cada uno va en juegos_solo (juego «elevator»): { round, week, stake, auto, exit, boost, paid, last }
// (exit: la planta en la que se bajó a mano; auto: la de la bajada automática; boost: el Admin Abuse activo al entrar,
// que se aplica al pagar aunque el evento ya acabara). La entrada sale del saldo al entrar; al acabar el viaje, la
// primera petición paga (settleDue). Lo que gana la casa va a la jaula del bingo y el viaje queda en juegos_rondas.
// Sin suerte del Admin Abuse: varios intentos por planta harían que el ascensor devolviera más de lo que entra (pasó
// con la rana).
//   elevator   cualquiera: a «sync», «join» (stake, auto), «exit» (bajarse ya) o «auto» (floor o null)
import * as elevator from '../../src/juegos/elevator/elevator.js'
import { hmacStream } from './solo.mjs'
import { abuseExtra, abuseOn } from './banca.mjs'
import { weekOf } from './engine/week.mjs'

const GRACE_MS = 500 // lo que se admite tarde una entrada que salió a tiempo del navegador
const EXIT_GRACE_MS = 300 // lo mismo para bajarse: vale si las puertas estaban abiertas hace este rato
const REVEAL_PAD_MS = EXIT_GRACE_MS + 100 // la caída se enseña cuando ya no vale ninguna bajada
const PAY_PAD_MS = 600 // el pago, un poco después de que se vea la caída o la azotea
const HISTORY = 8

export const ELEVATOR_ERRORS = {
  ELEVATOR_CLOSED: 'El ascensor ya ha salido: entra en el siguiente viaje.',
  ELEVATOR_IN: 'Ya estás en este viaje.',
  ELEVATOR_OUT: 'Ya te has bajado (o el ascensor ya ha caído).',
  ELEVATOR_GROUND: 'Espera a que llegue a la primera planta para bajarte.',
  ELEVATOR_CLOSED_DOORS: 'Las puertas están cerradas: bájate en la siguiente planta.',
}

// Planta del cable de cada viaje (caché: se pide en cada vista).
const crashes = new Map()
export function crashOf(secret, round) {
  const hit = crashes.get(round)
  if (hit) return hit
  const u = hmacStream(secret, `ascensor:${round}`)() / 2 ** 32
  const crash = elevator.crashFromUniform(u)
  if (crashes.size > 2000) crashes.clear()
  crashes.set(round, crash)
  return crash
}

export function createElevator({ db, now, secret, move, feed, abuse }) {
  let nextCheck = 0
  const endOf = (round) => elevator.rideEnd(round, crashOf(secret, round))
  const payAt = (round) => endOf(round) + REVEAL_PAD_MS + PAY_PAD_MS

  const rowsOf = async (q, round, lock = false) =>
    (
      await q(
        `select s.usuario_id, s.estado, c.nombre, c.avatar from public.juegos_solo s join public.juegos_cuentas c on c.usuario_id = s.usuario_id
         where s.juego = 'elevator' and s.estado->>'round' = $1 order by s.usuario_id${lock ? ' for update of s' : ''}`,
        [String(round)],
      )
    ).rows

  async function settleDue() {
    const t = now()
    if (t < nextCheck) return
    const { rows } = await db.query(
      `select distinct (estado->>'round')::bigint as round from public.juegos_solo where juego = 'elevator' and estado->>'paid' = 'false'`,
    )
    for (const r of rows.map((row) => Number(row.round)).sort((a, b) => a - b)) if (t >= payAt(r)) await pay(r)
    const { round } = elevator.phaseAt(t)
    nextCheck = t < payAt(round) ? payAt(round) : payAt(round + 1)
  }

  async function pay(round) {
    const week = weekOf(now()).key
    const crash = crashOf(secret, round)
    await db.tx(async (q) => {
      const rows = (await rowsOf(q, round, true)).filter((r) => r.estado.paid === false)
      if (!rows.length) return
      const stale = rows.some((r) => r.estado.week !== week)
      const players = rows.map((r) => ({
        owner: r.usuario_id,
        name: r.nombre,
        avatar: r.avatar ?? null,
        stake: Number(r.estado.stake),
        exit: r.estado.exit ?? null,
        auto: r.estado.auto ?? null,
      }))
      const out = elevator.settle(players, crash)
      // Admin Abuse de cada uno (el de cuando entró): la banca multiplica lo ganado o devuelve lo perdido.
      const extras = {}
      for (const r of rows) {
        const boost = r.estado.boost ?? null
        if (boost) extras[r.usuario_id] = abuseExtra({ modo: boost, ambito: 'todo' }, 'elevator', (out.prizes[r.usuario_id] ?? 0) - Number(r.estado.stake))
      }
      // Viaje de otra semana: el saldo ya se reinició, no se paga nada.
      if (!stale) {
        const real = Object.fromEntries(
          players.map((p) => [p.owner, (out.prizes[p.owner] ?? 0) + (extras[p.owner] ?? 0)]).filter(([, d]) => d > 0),
        )
        if (Object.keys(real).length) await move(q, real)
        // Lo que gana la casa va a la jaula entero, aunque el Admin Abuse «gratis» devuelva entradas.
        if (out.house > 0) await feed(q, out.house)
      }
      for (const p of players) {
        const payout = out.prizes[p.owner] ?? 0
        const bonus = extras[p.owner] ?? 0
        const r = rows.find((x) => x.usuario_id === p.owner)
        const last = {
          round,
          stake: p.stake,
          floor: elevator.exitOf(p, crash),
          crash,
          top: out.winners.includes(p.owner),
          payout,
          abuse: bonus,
          boost: r.estado.boost ?? null,
          net: payout + bonus - p.stake,
        }
        await q(`update public.juegos_solo set estado = $3, actualizado = now() where usuario_id = $1 and juego = $2`, [p.owner, 'elevator', { ...r.estado, paid: true, last }])
      }
      const entry = {
        players: players.length,
        pot: out.pot,
        crash,
        top: out.top,
        bonus: out.bonus,
        winners: players.filter((p) => out.winners.includes(p.owner)).map((p) => ({ name: p.name, avatar: p.avatar, prize: out.prizes[p.owner] })),
      }
      await q(`insert into public.juegos_rondas (juego, ronda, datos) values ('elevator', $1, $2) on conflict (juego, ronda) do nothing`, [round, JSON.stringify(entry)])
    })
  }

  async function history() {
    const { rows } = await db.query(`select ronda, datos from public.juegos_rondas where juego = 'elevator' order by ronda desc limit ${HISTORY}`)
    return rows.map((r) => ({ round: Number(r.ronda), ...r.datos }))
  }

  async function savedOf(q, userId, lock = false) {
    return (await q(`select estado from public.juegos_solo where usuario_id = $1 and juego = 'elevator'${lock ? ' for update' : ''}`, [userId])).rows[0]?.estado ?? null
  }

  const saveState = (q, userId, estado) =>
    q(`update public.juegos_solo set estado = $2, actualizado = now() where usuario_id = $1 and juego = 'elevator'`, [userId, estado])

  async function join(user, stake, auto) {
    if (!elevator.validStake(stake) || (auto != null && !elevator.validFloor(auto))) return 'BAD_MESSAGE'
    const t = now()
    const { round, offset } = elevator.phaseAt(t)
    if (offset >= elevator.JOIN_MS + GRACE_MS) return 'ELEVATOR_CLOSED'
    const week = weekOf(t).key
    const ab = await abuse()
    const boost = abuseOn(ab, 'elevator') ? ab.modo : null
    return db.tx(async (q) => {
      const saved = await savedOf(q, user.id, true)
      if (saved && saved.paid === false && saved.round !== round) return 'BUSY'
      if (saved?.round === round) return 'ELEVATOR_IN'
      if (!(await move(q, { [user.id]: -stake }, true))) return 'INSUFFICIENT_FUNDS'
      await q(
        `insert into public.juegos_solo (usuario_id, juego, estado) values ($1, 'elevator', $2)
         on conflict (usuario_id, juego) do update set estado = excluded.estado, actualizado = now()`,
        [user.id, { round, week, stake, auto: auto ?? null, exit: null, boost, paid: false, last: saved?.last ?? null }],
      )
      return null
    })
  }

  // Bajarse ya: con las puertas abiertas (o abiertas hace menos de EXIT_GRACE_MS, por lo que tarda la petición) en una
  // planta a la que el ascensor llegó de verdad.
  async function exit(user) {
    const t = now()
    const nowAt = elevator.phaseAt(t)
    if (nowAt.phase === 'join') return 'ELEVATOR_GROUND'
    const before = elevator.phaseAt(t - EXIT_GRACE_MS)
    const at = nowAt.open ? nowAt : before.open && before.round === nowAt.round ? before : null
    if (!at) return nowAt.phase === 'ride' && nowAt.floor === 0 ? 'ELEVATOR_GROUND' : 'ELEVATOR_CLOSED_DOORS'
    const { round, floor } = at
    if (floor >= crashOf(secret, round) || floor >= elevator.FLOORS) return 'ELEVATOR_OUT'
    return db.tx(async (q) => {
      const saved = await savedOf(q, user.id, true)
      if (saved?.round !== round) return 'BAD_PHASE'
      if (saved.exit != null || (saved.auto != null && saved.auto <= floor)) return 'ELEVATOR_OUT'
      await saveState(q, user.id, { ...saved, exit: floor })
      return null
    })
  }

  // Cambiar la bajada automática (o quitarla): solo a una planta a la que aún no ha llegado.
  async function setAuto(user, auto) {
    if (auto != null && !elevator.validFloor(auto)) return 'BAD_MESSAGE'
    const t = now()
    const { round, phase, floor: passed } = elevator.phaseAt(t)
    if (phase === 'after' || t >= endOf(round)) return 'ELEVATOR_OUT'
    // passed: la última planta a la que llegó; su bajada automática ya pasó, así que la nueva tiene que ser más arriba.
    return db.tx(async (q) => {
      const saved = await savedOf(q, user.id, true)
      if (saved?.round !== round) return 'BAD_PHASE'
      if (saved.exit != null || (saved.auto != null && saved.auto <= passed)) return 'ELEVATOR_OUT'
      if (auto != null && auto <= passed) return 'BAD_MESSAGE'
      await saveState(q, user.id, { ...saved, auto: auto ?? null })
      return null
    })
  }

  // Lo que ve la pantalla: planta, quién va dentro y quién se ha bajado (y dónde), tu partida y, al acabar, el reparto.
  async function view(userId, saved, balance) {
    const t = now()
    const { round, phase: clockPhase, floor: clockFloor } = elevator.phaseAt(t)
    const crash = crashOf(secret, round)
    const end = elevator.rideEnd(round, crash)
    const done = clockPhase !== 'join' && t >= end + REVEAL_PAD_MS
    const phase = clockPhase === 'join' ? 'join' : done ? 'done' : 'ride'
    // Última planta a la que llegó de verdad (sin pasar de la de debajo del cable mientras no se enseña la caída).
    const floor = Math.min(clockFloor, crash > elevator.FLOORS ? elevator.FLOORS : crash - 1)
    const [rows, past] = await Promise.all([rowsOf((sql, params) => db.query(sql, params), round), history()])
    const players = rows.map((r) => {
      const me = r.usuario_id === userId
      const p = { exit: r.estado.exit ?? null, auto: r.estado.auto ?? null }
      // Bajada visible: la de a mano en cuanto se hace; la automática, cuando el ascensor llega a su planta.
      let out = p.exit
      if (out == null && p.auto != null && p.auto <= floor && p.auto < crash) out = p.auto
      if (done) out = elevator.exitOf(p, crash)
      return {
        name: r.nombre,
        avatar: r.avatar ?? null,
        stake: Number(r.estado.stake),
        me,
        out: out ?? null,
        fell: done && out == null,
      }
    })
    const mine = saved?.round === round ? saved : null
    const pot = players.reduce((sum, p) => sum + p.stake, 0)
    return {
      now: t,
      round,
      phase,
      floor,
      crash: done ? crash : null,
      players,
      pot,
      bonus: Math.floor(pot * elevator.BONUS),
      joined: Boolean(mine),
      mine: mine ? { stake: mine.stake, auto: mine.auto ?? null, exit: mine.exit ?? null } : null,
      result: t >= end + REVEAL_PAD_MS + PAY_PAD_MS && players.length ? past.find((h) => h.round === round) ?? null : null,
      history: past,
      last: saved?.last ?? null,
      balance,
    }
  }

  async function handle(user, msg, reply) {
    await settleDue()
    let error = null
    if (msg.a === 'join') error = await join(user, msg.stake, msg.auto ?? null)
    else if (msg.a === 'exit') error = await exit(user)
    else if (msg.a === 'auto') error = await setAuto(user, msg.floor ?? null)
    else if (msg.a !== 'sync') error = 'BAD_MESSAGE'
    if (error) reply.error = { code: error }
    const balance = Number((await db.query(`select saldo from public.juegos_cuentas where usuario_id = $1`, [user.id])).rows[0]?.saldo ?? 0)
    reply.me.balance = balance
    reply.elevator = await view(user.id, await savedOf((sql, params) => db.query(sql, params), user.id), balance)
    return reply
  }

  const sweep = (q) => q(`delete from public.juegos_rondas where juego = 'elevator'`)

  return { handle, settleDue, sweep }
}
