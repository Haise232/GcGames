// Tira y Afloja en vivo: una ronda para todos cada soga.ROUND_MS (reglas en src/juegos/soga/soga.js).
// Lo de cada uno va en juegos_solo (juego «soga»): { v, round, week, team, at, taps, paid, last }. taps es el total de
// tirones que mandó su navegador (nunca más de lo que da tiempo a tirar: soga.capAt). Mientras se tira, cada navegador
// enseña la cuerda con lo que se cuentan entre ellos por Realtime; lo que vale es lo que llega aquí.
// Se paga sin temporizador: la primera petición que llega cuando ya no puede entrar ningún tirón reparte (settleDue).
// Cada ronda repartida queda en juegos_rondas para el historial.
//   soga   cualquiera: a «sync», «join» (team: 'r' | 'b') o «pull» (n: tirones)
import * as soga from '../../src/juegos/soga/soga.js'
import { weekOf } from './engine/week.mjs'

export const SOGA_TOPIC = 'juegos-soga'
const JOIN_GRACE_MS = 500
const SEND_GRACE_MS = 2000 // margen para que lleguen los tirones al acabar
const PAY_PAD_MS = SEND_GRACE_MS + 400
const HISTORY = 8

export const SOGA_ERRORS = {
  SOGA_CLOSED: 'Los equipos de esta ronda ya están cerrados: apúntate a la siguiente.',
  SOGA_IN: 'Ya tienes equipo en esta ronda.',
  SOGA_OUT: 'No estás en esta ronda.',
}

export function createSoga({ db, now, move }) {
  let nextCheck = 0
  const plain = (sql, params) => db.query(sql, params)
  const payAt = (round) => soga.pullEnd(round) + PAY_PAD_MS

  const rowsOf = async (q, round, lock = false) =>
    (
      await q(
        `select s.usuario_id, s.estado, c.nombre, c.avatar from public.juegos_solo s join public.juegos_cuentas c on c.usuario_id = s.usuario_id
         where s.juego = 'soga' and s.estado->>'round' = $1 order by s.usuario_id${lock ? ' for update of s' : ''}`,
        [String(round)],
      )
    ).rows
  const savedOf = async (q, userId, lock = false) =>
    (await q(`select estado from public.juegos_solo where usuario_id = $1 and juego = 'soga'${lock ? ' for update' : ''}`, [userId])).rows[0]?.estado ?? null
  const save = (q, userId, estado) =>
    q(
      `insert into public.juegos_solo (usuario_id, juego, estado) values ($1, 'soga', $2)
       on conflict (usuario_id, juego) do update set estado = excluded.estado, actualizado = now()`,
      [userId, estado],
    )

  async function settleDue() {
    const t = now()
    if (t < nextCheck) return
    const { rows } = await db.query(`select distinct (estado->>'round')::bigint as round from public.juegos_solo where juego = 'soga' and estado->>'paid' = 'false'`)
    for (const r of rows.map((row) => Number(row.round)).sort((a, b) => a - b)) if (t >= payAt(r)) await pay(r)
    const round = soga.roundOf(t)
    nextCheck = t < payAt(round) ? payAt(round) : payAt(round + 1)
  }

  async function pay(round) {
    const week = weekOf(now()).key
    await db.tx(async (q) => {
      await q(`select pg_advisory_xact_lock(hashtext($1))`, [`soga:${round}`])
      const rows = (await rowsOf(q, round, true)).filter((r) => r.estado.paid === false)
      if (!rows.length) return
      // Entradas de otra semana: el saldo ya se reinició, no se paga ni se devuelve nada.
      const stale = rows.some((r) => r.estado.week !== week)
      const members = rows.map((r) => ({ id: r.usuario_id, name: r.nombre, avatar: r.avatar ?? null, team: r.estado.team, taps: Number(r.estado.taps ?? 0) }))
      const out = soga.outcome(members)
      const paidOf = (m) => (out.refund ? soga.ENTRY : m.team === out.winner ? out.share : 0)
      if (!stale) {
        const deltas = Object.fromEntries(members.map((m) => [m.id, paidOf(m)]).filter(([, d]) => d > 0))
        if (Object.keys(deltas).length) await move(q, deltas)
      }
      for (const r of rows) {
        const m = members.find((x) => x.id === r.usuario_id)
        const payout = paidOf(m)
        const last = { round, team: m.team, taps: m.taps, winner: out.winner, refund: out.refund, payout, net: payout - soga.ENTRY }
        await save(q, r.usuario_id, { ...r.estado, paid: true, last })
      }
      const entry = { v: soga.VERSION, week, winner: out.winner, refund: out.refund, mean: out.mean, count: out.count, pot: out.pot, share: out.share, players: members.map((m) => ({ ...m, paid: paidOf(m) })) }
      await q(`insert into public.juegos_rondas (juego, ronda, datos) values ('soga', $1, $2) on conflict (juego, ronda) do nothing`, [round, JSON.stringify(entry)])
    })
  }

  async function join(user, team) {
    if (!soga.TEAMS.includes(team)) return 'BAD_MESSAGE'
    const t = now()
    const { round, joinEnd } = soga.phaseAt(t)
    if (t >= joinEnd + JOIN_GRACE_MS) return 'SOGA_CLOSED'
    const week = weekOf(t).key
    return db.tx(async (q) => {
      const saved = await savedOf(q, user.id, true)
      if (saved?.round === round) return 'SOGA_IN'
      if (saved && saved.paid === false) return 'BUSY'
      if (!(await move(q, { [user.id]: -soga.ENTRY }, true))) return 'INSUFFICIENT_FUNDS'
      await save(q, user.id, { v: soga.VERSION, round, week, team, at: t, taps: 0, paid: false, last: saved?.last ?? null })
      return null
    })
  }

  async function pull(user, n) {
    if (!Number.isSafeInteger(n) || n < 0) return 'BAD_MESSAGE'
    const t = now()
    const round = soga.roundOf(t)
    const start = soga.pullStart(round)
    const end = soga.pullEnd(round)
    if (t < start - JOIN_GRACE_MS || t >= end + SEND_GRACE_MS) return 'BAD_PHASE'
    return db.tx(async (q) => {
      const saved = await savedOf(q, user.id, true)
      if (!saved || saved.round !== round || saved.paid !== false) return 'SOGA_OUT'
      const cap = soga.capAt(Math.min(t, end) - start + JOIN_GRACE_MS)
      await save(q, user.id, { ...saved, taps: Math.max(Number(saved.taps ?? 0), Math.min(n, cap)) })
      return null
    })
  }

  async function history() {
    const { rows } = await db.query(`select ronda, datos from public.juegos_rondas where juego = 'soga' order by ronda desc limit ${HISTORY}`)
    return rows.map((r) => ({ round: Number(r.ronda), ...r.datos }))
  }

  async function view(userId, balance) {
    const t = now()
    const { round, phase } = soga.phaseAt(t)
    const [rows, past, saved] = await Promise.all([rowsOf(plain, round), history(), savedOf(plain, userId)])
    const strip = ({ id, ...p }) => ({ ...p, me: id === userId })
    const members = rows.map((r) => ({ name: r.nombre, avatar: r.avatar ?? null, team: r.estado.team, taps: phase === 'result' ? Number(r.estado.taps ?? 0) : 0, me: r.usuario_id === userId }))
    const mine = saved?.round === round ? saved : null
    const settled = past.find((h) => h.round === round)
    return {
      now: t,
      round,
      entry: soga.ENTRY,
      members,
      team: mine?.team ?? null,
      // El resultado de esta ronda, cuando ya está repartido.
      result: settled ? { ...settled, players: settled.players.map(strip) } : null,
      history: past.map((h) => ({ round: h.round, winner: h.winner, refund: h.refund, mean: h.mean, count: h.count, share: h.share })),
      last: saved?.last ?? null,
      balance,
    }
  }

  async function handle(user, msg, reply) {
    await settleDue()
    let changed = false
    let error = null
    if (msg.a === 'join') error = await join(user, msg.team)
    else if (msg.a === 'pull') error = await pull(user, msg.n)
    else if (msg.a !== 'sync') error = 'BAD_MESSAGE'
    if (error) reply.error = { code: error }
    else changed = msg.a === 'join'
    const balance = Number((await db.query(`select saldo from public.juegos_cuentas where usuario_id = $1`, [user.id])).rows[0]?.saldo ?? 0)
    reply.me.balance = balance
    reply.soga = await view(user.id, balance)
    return changed
  }

  // Reinicio del domingo: el historial se borra (lo de cada uno se va con juegos_solo).
  const sweep = (q) => q(`delete from public.juegos_rondas where juego = 'soga'`)

  return { handle, settleDue, sweep }
}
