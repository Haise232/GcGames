// Puente de Cristal en vivo: una partida para todos cada bridge.ROUND_MS (reglas en src/juegos/bridge/bridge.js).
// Qué cristal aguanta en cada paso sale de HMAC(secreto, ronda), como la ruleta, y el servidor no lo suelta hasta que se
// acaba el tiempo de elegir ese paso; lo mismo con lo que eligen los demás, para que nadie copie. Si alguien no elige,
// vale el lado que le toca de HMAC(secreto, ronda, jugador). La partida de cada uno va en juegos_solo (juego «bridge»):
// { round, week, stake, picks, boost, paid, last } (boost: el Admin Abuse activo al entrar, que se aplica al pagar aunque
// el evento ya acabara). La entrada sale del saldo al entrar; al acabar de cruzar, la primera
// petición reparte el bote (settleDue). La parte de la casa va a la jaula del bingo y la partida queda en juegos_rondas.
//   bridge   cualquiera: a «sync», «join» (stake) o «pick» (step, side: 'L' | 'R')
import * as bridge from '../../src/juegos/bridge/bridge.js'
import { hmacStream } from './solo.mjs'
import { abuseExtra, abuseOn } from './banca.mjs'
import { weekOf } from './engine/week.mjs'

const GRACE_MS = 500 // lo que se admite tarde una entrada o una elección que salió a tiempo del navegador
const SHOW_PAD_MS = GRACE_MS + 100 // el cristal se enseña un poco después de cerrar la elección, ya sin elecciones posibles
const HISTORY = 6

export const BRIDGE_ERRORS = {
  BRIDGE_CLOSED: 'El puente ya ha empezado: entra en la siguiente partida.',
  BRIDGE_IN: 'Ya estás en esta partida.',
  BRIDGE_LATE: 'Ese paso ya se ha cerrado.',
  BRIDGE_OUT: 'Ya has caído: mira cómo acaban los demás.',
}

const bits = (secret, label) => {
  const value = hmacStream(secret, label)()
  return Array.from({ length: bridge.STEPS }, (_, k) => bridge.SIDES[(value >>> k) & 1])
}
const safes = new Map()
export function safeOf(secret, round) {
  const hit = safes.get(round)
  if (hit) return hit
  const safe = bits(secret, `puente:${round}`)
  if (safes.size > 2000) safes.clear()
  safes.set(round, safe)
  return safe
}
// Los lados que elige el puente por quien no elige.
const autoOf = (secret, round, owner) => bits(secret, `puente:${round}:${owner}`)
const picksOf = (secret, round, owner, picks) => {
  const auto = autoOf(secret, round, owner)
  return Array.from({ length: bridge.STEPS }, (_, k) => picks?.[k] ?? auto[k])
}
const shownAt = (round, k) => bridge.revealOf(round, k) + SHOW_PAD_MS
const shownSteps = (round, t) => {
  let n = 0
  while (n < bridge.STEPS && t >= shownAt(round, n)) n++
  return n
}
const payAt = (round) => bridge.crossEnd(round) + SHOW_PAD_MS

export function createBridge({ db, now, secret, move, feed, abuse }) {
  let nextCheck = 0

  const rowsOf = async (q, round, lock = false) =>
    (
      await q(
        `select s.usuario_id, s.estado, c.nombre, c.avatar from public.juegos_solo s join public.juegos_cuentas c on c.usuario_id = s.usuario_id
         where s.juego = 'bridge' and s.estado->>'round' = $1 order by s.usuario_id${lock ? ' for update of s' : ''}`,
        [String(round)],
      )
    ).rows

  async function settleDue() {
    const t = now()
    if (t < nextCheck) return
    const { rows } = await db.query(
      `select distinct (estado->>'round')::bigint as round from public.juegos_solo where juego = 'bridge' and estado->>'paid' = 'false'`,
    )
    for (const r of rows.map((row) => Number(row.round)).sort((a, b) => a - b)) if (t >= payAt(r)) await pay(r)
    const { round } = bridge.phaseAt(t)
    nextCheck = t < payAt(round) ? payAt(round) : payAt(round + 1)
  }

  async function pay(round) {
    const week = weekOf(now()).key
    const safe = safeOf(secret, round)
    await db.tx(async (q) => {
      const rows = (await rowsOf(q, round, true)).filter((r) => r.estado.paid === false)
      if (!rows.length) return
      const stale = rows.some((r) => r.estado.week !== week)
      const players = rows.map((r) => ({
        owner: r.usuario_id,
        name: r.nombre,
        avatar: r.avatar ?? null,
        stake: Number(r.estado.stake),
        reached: bridge.reachedOf(picksOf(secret, round, r.usuario_id, r.estado.picks), safe),
      }))
      const out = bridge.settle(players)
      // Admin Abuse de cada uno (el de cuando entró): la banca multiplica lo ganado o devuelve lo perdido.
      const extras = {}
      for (const r of rows) {
        const boost = r.estado.boost ?? null
        const p = players.find((x) => x.owner === r.usuario_id)
        if (boost) extras[p.owner] = abuseExtra({ modo: boost, ambito: 'todo' }, 'bridge', (out.prizes[p.owner] ?? 0) - p.stake)
      }
      if (!stale) {
        const real = Object.fromEntries(
          players.map((p) => [p.owner, (out.prizes[p.owner] ?? 0) + (extras[p.owner] ?? 0)]).filter(([, d]) => d > 0),
        )
        if (Object.keys(real).length) await move(q, real)
        // La parte de la casa va a la jaula entera, aunque el Admin Abuse «gratis» devuelva entradas.
        if (out.house > 0) await feed(q, out.house)
      }
      for (const r of rows) {
        const p = players.find((x) => x.owner === r.usuario_id)
        const payout = out.prizes[p.owner] ?? 0
        const bonus = extras[p.owner] ?? 0
        const last = { round, stake: p.stake, reached: p.reached, won: out.winners.includes(p.owner), refund: out.refund, payout, abuse: bonus, boost: r.estado.boost ?? null, net: payout + bonus - p.stake }
        await q(`update public.juegos_solo set estado = $3, actualizado = now() where usuario_id = $1 and juego = $2`, [r.usuario_id, 'bridge', { ...r.estado, paid: true, last }])
      }
      const entry = {
        players: players.length,
        pot: out.pot,
        best: out.best,
        refund: out.refund,
        winners: players.filter((p) => out.winners.includes(p.owner)).map((p) => ({ name: p.name, avatar: p.avatar, prize: out.prizes[p.owner] })),
      }
      await q(`insert into public.juegos_rondas (juego, ronda, datos) values ('bridge', $1, $2) on conflict (juego, ronda) do nothing`, [round, JSON.stringify(entry)])
    })
  }

  async function history() {
    const { rows } = await db.query(`select ronda, datos from public.juegos_rondas where juego = 'bridge' order by ronda desc limit ${HISTORY}`)
    return rows.map((r) => ({ round: Number(r.ronda), ...r.datos }))
  }

  async function savedOf(q, userId, lock = false) {
    return (await q(`select estado from public.juegos_solo where usuario_id = $1 and juego = 'bridge'${lock ? ' for update' : ''}`, [userId])).rows[0]?.estado ?? null
  }

  async function join(user, stake) {
    if (!bridge.validStake(stake)) return 'BAD_MESSAGE'
    const t = now()
    const { round, offset } = bridge.phaseAt(t)
    if (offset >= bridge.JOIN_MS + GRACE_MS) return 'BRIDGE_CLOSED'
    const week = weekOf(t).key
    const ab = await abuse()
    const boost = abuseOn(ab, 'bridge') ? ab.modo : null
    return db.tx(async (q) => {
      const saved = await savedOf(q, user.id, true)
      if (saved && saved.paid === false && saved.round !== round) return 'BUSY'
      if (saved?.round === round) return 'BRIDGE_IN'
      if (!(await move(q, { [user.id]: -stake }, true))) return 'INSUFFICIENT_FUNDS'
      await q(
        `insert into public.juegos_solo (usuario_id, juego, estado) values ($1, 'bridge', $2)
         on conflict (usuario_id, juego) do update set estado = excluded.estado, actualizado = now()`,
        [user.id, { round, week, stake, picks: Array(bridge.STEPS).fill(null), boost, paid: false, last: saved?.last ?? null }],
      )
      return null
    })
  }

  async function pick(user, step, side) {
    if (!Number.isInteger(step) || step < 0 || step >= bridge.STEPS || !bridge.validSide(side)) return 'BAD_MESSAGE'
    const t = now()
    const { round } = bridge.phaseAt(t)
    if (t < bridge.stepStart(round, step) || t >= bridge.revealOf(round, step) + GRACE_MS) return 'BRIDGE_LATE'
    return db.tx(async (q) => {
      const saved = await savedOf(q, user.id, true)
      if (saved?.round !== round) return 'BAD_PHASE'
      const picks = picksOf(secret, round, user.id, saved.picks)
      if (bridge.reachedOf(picks, safeOf(secret, round), step) < step) return 'BRIDGE_OUT'
      const next = [...(saved.picks ?? Array(bridge.STEPS).fill(null))]
      next[step] = side
      await q(`update public.juegos_solo set estado = $2, actualizado = now() where usuario_id = $1 and juego = 'bridge'`, [user.id, { ...saved, picks: next }])
      return null
    })
  }

  // Lo que ve la pantalla: quién cruza, los cristales y elecciones ya enseñados, tus elecciones y, al acabar, el reparto.
  async function view(userId, saved, balance) {
    const t = now()
    const { round, phase, step, pick: picking } = bridge.phaseAt(t)
    const shown = shownSteps(round, t)
    const safe = safeOf(secret, round)
    const [rows, past] = await Promise.all([rowsOf((sql, params) => db.query(sql, params), round), history()])
    const players = rows.map((r) => {
      const all = picksOf(secret, round, r.usuario_id, r.estado.picks)
      const reached = bridge.reachedOf(all, safe, shown)
      const me = r.usuario_id === userId
      return {
        name: r.nombre,
        avatar: r.avatar ?? null,
        stake: Number(r.estado.stake),
        me,
        // Lo elegido solo hasta donde ya se ha enseñado (lo tuyo, entero, pero sin decir qué lados son tuyos por defecto).
        picks: all.slice(0, Math.min(shown, reached + 1)),
        reached,
        fell: reached < shown,
        // ¿Ya ha elegido en el paso en curso? (sin decir qué)
        ready: phase === 'cross' && picking && r.estado.picks?.[step] != null,
      }
    })
    const mine = saved?.round === round ? saved : null
    const done = t >= payAt(round)
    return {
      now: t,
      round,
      phase,
      step,
      picking,
      shown,
      safe: safe.slice(0, shown),
      players,
      pot: players.reduce((sum, p) => sum + p.stake, 0),
      joined: Boolean(mine),
      picks: mine ? (mine.picks ?? []) : [],
      result: done && players.length ? past.find((h) => h.round === round) ?? null : null,
      history: past,
      last: saved?.last ?? null,
      balance,
    }
  }

  async function handle(user, msg, reply) {
    await settleDue()
    let error = null
    if (msg.a === 'join') error = await join(user, msg.stake)
    else if (msg.a === 'pick') error = await pick(user, msg.step, msg.side)
    else if (msg.a !== 'sync') error = 'BAD_MESSAGE'
    if (error) reply.error = { code: error }
    const balance = Number((await db.query(`select saldo from public.juegos_cuentas where usuario_id = $1`, [user.id])).rows[0]?.saldo ?? 0)
    reply.me.balance = balance
    reply.bridge = await view(user.id, await savedOf((sql, params) => db.query(sql, params), user.id), balance)
    return reply
  }

  const sweep = (q) => q(`delete from public.juegos_rondas where juego = 'bridge'`)

  return { handle, settleDue, sweep }
}
