// Subasta en vivo: una caja para todos cada auction.ROUND_MS (reglas en src/juegos/auction/auction.js).
// La caja (tipo y contenido) sale de HMAC(secreto, ronda), como la ruleta: el tipo se enseña desde el principio y el
// contenido no se suelta hasta que se cierran las pujas. Las pujas son a la vista (quién va primero y el historial) y cada
// puja en los últimos auction.SNIPE_MS retrasa el cierre. Las de cada uno van en juegos_solo (juego «auction»):
// { v, round, week, bid, at, lastAt, hist, boost, paid, last }: bid es tu puja total (sale del saldo; al subirla pagas
// la diferencia y al cerrar se devuelve a quien no gana), at la hora de tu primera puja (desempata), lastAt la de la
// última, hist tus pujas [[importe, hora]] para el historial y boost el Admin Abuse activo al pujar ('x2' | 'x3' |
// 'gratis' o null; se aplica al pagar aunque el evento ya acabara). Sin v: pujas de la versión anterior (rondas de 60 s
// y otras cajas), que se devuelven enteras.
// Se paga sin temporizador: la primera petición que llega tras el cierre reparte (settleDue). Lo que gana la casa (la puja
// ganadora menos lo que llevaba la caja) va a la jaula del bingo. Las últimas subastas quedan en juegos_rondas.
// Cada puja avisa por Realtime (TOPIC) para que todos vean al momento quién va primero.
//   auction   cualquiera: a «sync» o «bid» (amount: tu puja total en la ronda en curso; tiene que superar a la primera)
import * as auction from '../../src/juegos/auction/auction.js'
import { hmacStream, uniform } from './solo.mjs'
import { abuseExtra, abuseOn } from './banca.mjs'
import { weekOf } from './engine/week.mjs'

export const AUCTION_TOPIC = 'juegos-subasta'
const GRACE_MS = 400 // pujas que salieron del navegador justo antes del cierre y llegan un poco tarde
const REVEAL_PAD_MS = GRACE_MS + 200 // el contenido se enseña un poco después del cierre, ya sin pujas posibles
const HISTORY = 8
const FEED = 14 // pujas que se ven en el historial en directo
const OLD_ROUND_MS = 60000 // versión anterior: rondas de 60 s que cerraban a los 40 s
const OLD_CLOSE_MS = 40000

export const AUCTION_ERRORS = {
  AUCTION_CLOSED: 'Las pujas de esta caja ya están cerradas: puja por la siguiente.',
  AUCTION_LOW: 'Alguien ha pujado antes que tú: para ir primero tienes que pujar más.',
  AUCTION_LEADER: 'Ya vas primero: espera a que alguien te supere.',
}

const boxes = new Map()
// La caja de una ronda: { tier, prize } (prize: índice en auction.PRIZES).
export function boxOf(secret, round) {
  const hit = boxes.get(round)
  if (hit) return hit
  const rand = uniform(hmacStream(secret, `subasta2:${round}`))
  const box = auction.drawBox(rand(100), rand(1000))
  if (boxes.size > 2000) boxes.clear()
  boxes.set(round, box)
  return box
}

const isOld = (estado) => estado?.v !== auction.VERSION
// Cierre de una ronda a partir de sus pujas (filas de juegos_solo).
const closeOfRows = (round, rows) => auction.closeOf(round, Math.max(0, ...rows.map((r) => Number(r.estado.lastAt ?? 0))))
const toBid = (r) => ({ owner: r.usuario_id, name: r.nombre, avatar: r.avatar ?? null, amount: Number(r.estado.bid), at: Number(r.estado.at) })

export function createAuction({ db, now, secret, move, feed, abuse, ping = async () => {} }) {
  let nextCheck = 0

  const bidsOf = async (q, round, lock = false) =>
    (
      await q(
        `select s.usuario_id, s.estado, c.nombre, c.avatar from public.juegos_solo s join public.juegos_cuentas c on c.usuario_id = s.usuario_id
         where s.juego = 'auction' and s.estado->>'round' = $1 order by s.usuario_id${lock ? ' for update of s' : ''}`,
        [String(round)],
      )
    ).rows

  // Paga las rondas ya cerradas. Mientras no hay nada que pagar, como mucho una consulta por cierre y por instancia.
  async function settleDue() {
    const t = now()
    if (t < nextCheck) return
    const { rows } = await db.query(
      `select distinct (estado->>'round')::bigint as round, (estado->>'v') is null as old from public.juegos_solo
       where juego = 'auction' and estado->>'paid' = 'false'`,
    )
    let next = auction.closeOf(auction.roundOf(t)) + REVEAL_PAD_MS
    if (next <= t) next = auction.closeOf(auction.roundOf(t) + 1) + REVEAL_PAD_MS
    for (const { round, old } of rows.map((r) => ({ round: Number(r.round), old: r.old })).sort((a, b) => a.round - b.round)) {
      if (old) {
        if (t >= round * OLD_ROUND_MS + OLD_CLOSE_MS + REVEAL_PAD_MS) await refundOld(round)
        continue
      }
      const due = closeOfRows(round, await bidsOf((sql, params) => db.query(sql, params), round)) + REVEAL_PAD_MS
      if (t >= due) await pay(round)
      else next = Math.min(next, due)
    }
    nextCheck = next
  }

  // Pujas de la versión anterior: se devuelven enteras (sus cajas ya no existen).
  async function refundOld(round) {
    const week = weekOf(now()).key
    await db.tx(async (q) => {
      const rows = (await bidsOf(q, round, true)).filter((r) => r.estado.paid === false && isOld(r.estado))
      for (const r of rows) {
        const bid = Number(r.estado.bid ?? 0)
        if (bid > 0 && r.estado.week === week) await move(q, { [r.usuario_id]: bid })
        const last = { round, bid, won: false, refund: true, payout: bid, abuse: 0, net: 0 }
        await q(`update public.juegos_solo set estado = $3, actualizado = now() where usuario_id = $1 and juego = $2`, [r.usuario_id, 'auction', { ...r.estado, paid: true, last }])
      }
    })
  }

  async function pay(round) {
    const week = weekOf(now()).key
    await db.tx(async (q) => {
      const rows = (await bidsOf(q, round, true)).filter((r) => r.estado.paid === false && !isOld(r.estado))
      if (!rows.length) return
      // Pujas de otra semana: el saldo ya se reinició, no se devuelve ni se paga nada.
      const stale = rows.some((r) => r.estado.week !== week)
      const box = boxOf(secret, round)
      const bids = rows.map(toBid)
      const win = auction.winnerOf(bids)
      const prize = auction.prizeAmount(box.tier, box.prize)
      // Admin Abuse de quien gana: la banca multiplica lo ganado o le devuelve lo que pagó de más.
      const boost = rows.find((r) => r.usuario_id === win.owner)?.estado.boost ?? null
      const extra = boost ? abuseExtra({ modo: boost, ambito: 'todo' }, 'auction', prize - win.amount) : 0
      if (!stale) {
        const deltas = {}
        for (const b of bids) deltas[b.owner] = b === win ? prize + extra : b.amount
        const real = Object.fromEntries(Object.entries(deltas).filter(([, d]) => d > 0))
        if (Object.keys(real).length) await move(q, real)
        // Lo que gana la casa va a la jaula, aunque el Admin Abuse «gratis» se lo devuelva al ganador.
        if (win.amount > prize) await feed(q, win.amount - prize)
      }
      for (const r of rows) {
        const mine = bids.find((b) => b.owner === r.usuario_id)
        const won = mine === win
        const bonus = won ? extra : 0
        const last = { round, tier: box.tier, prize: box.prize, bid: mine.amount, won, payout: won ? prize : mine.amount, abuse: bonus, boost: won ? boost : null, net: won ? prize - mine.amount + bonus : 0 }
        await q(`update public.juegos_solo set estado = $3, actualizado = now() where usuario_id = $1 and juego = $2`, [r.usuario_id, 'auction', { ...r.estado, paid: true, last }])
      }
      const entry = {
        v: auction.VERSION,
        tier: box.tier,
        prize: box.prize,
        amount: prize,
        winner: { name: win.name, avatar: win.avatar ?? null, bid: win.amount },
        bids: bids.length,
        raises: rows.reduce((sum, r) => sum + (r.estado.hist?.length ?? 1), 0),
      }
      await q(`insert into public.juegos_rondas (juego, ronda, datos) values ('auction', $1, $2) on conflict (juego, ronda) do nothing`, [round, JSON.stringify(entry)])
    })
  }

  async function history() {
    const { rows } = await db.query(
      `select ronda, datos from public.juegos_rondas where juego = 'auction' and (datos->>'v')::int = $1 order by ronda desc limit ${HISTORY}`,
      [auction.VERSION],
    )
    return rows.map((r) => ({ round: Number(r.ronda), ...r.datos }))
  }

  async function savedOf(q, userId, lock = false) {
    return (await q(`select estado from public.juegos_solo where usuario_id = $1 and juego = 'auction'${lock ? ' for update' : ''}`, [userId])).rows[0]?.estado ?? null
  }

  // Pujar: amount es tu puja total en la ronda; tiene que superar a la primera (auction.nextBid) y se cobra la diferencia
  // con la que ya tenías. Devuelve un código de error o null.
  async function bid(user, amount) {
    if (!auction.validAmount(amount)) return 'BAD_MESSAGE'
    const t = now()
    const round = auction.roundOf(t)
    const box = boxOf(secret, round)
    const week = weekOf(t).key
    const ab = await abuse()
    const boost = abuseOn(ab, 'auction') ? ab.modo : null
    return db.tx(async (q) => {
      // Las pujas de una ronda, de una en una: así dos a la vez no pueden «superar» las dos a la misma primera.
      await q(`select pg_advisory_xact_lock(hashtext($1))`, [`subasta:${round}`])
      const rows = await bidsOf(q, round)
      const close = closeOfRows(round, rows)
      if (t >= close + GRACE_MS) return 'AUCTION_CLOSED'
      const top = auction.winnerOf(rows.map(toBid))
      if (top?.owner === user.id) return 'AUCTION_LEADER'
      if (amount < auction.nextBid(box.tier, top?.amount ?? 0)) return 'AUCTION_LOW'
      const saved = await savedOf(q, user.id, true)
      if (saved && saved.paid === false && saved.round !== round) return 'BUSY'
      const mine = saved?.round === round && !isOld(saved) ? saved : null
      const before = mine ? Number(mine.bid ?? 0) : 0
      if (!(await move(q, { [user.id]: -(amount - before) }, true))) return 'INSUFFICIENT_FUNDS'
      await q(
        `insert into public.juegos_solo (usuario_id, juego, estado) values ($1, 'auction', $2)
         on conflict (usuario_id, juego) do update set estado = excluded.estado, actualizado = now()`,
        [
          user.id,
          {
            v: auction.VERSION,
            round,
            week,
            bid: amount,
            at: mine ? Number(mine.at) : t,
            // Una puja que llega en el margen de después del cierre vale, pero no vuelve a alargar la subasta.
            lastAt: t < close ? t : close - auction.SNIPE_MS,
            hist: [...(mine?.hist ?? []), [amount, t]].slice(-10),
            boost: boost ?? mine?.boost ?? null,
            paid: false,
            last: saved?.last ?? null,
          },
        ],
      )
      return null
    })
  }

  // Lo que ve la pantalla: la caja, quién va primero, las últimas pujas, la hora de cierre (con prórroga) y, al cerrar,
  // qué llevaba y todas las pujas.
  async function view(userId, saved, balance) {
    const t = now()
    const round = auction.roundOf(t)
    const box = boxOf(secret, round)
    const [rows, past] = await Promise.all([bidsOf((sql, params) => db.query(sql, params), round), history()])
    const live = rows.filter((r) => !isOld(r.estado))
    const closesAt = closeOfRows(round, live)
    const revealed = t >= closesAt + REVEAL_PAD_MS
    const bids = live.map(toBid)
    const top = auction.winnerOf(bids)
    const person = (b) => b && { name: b.name, avatar: b.avatar, amount: b.amount, me: b.owner === userId }
    const feedList = live
      .flatMap((r) => (r.estado.hist ?? [[Number(r.estado.bid), Number(r.estado.at)]]).map(([amount, at]) => ({ name: r.nombre, avatar: r.avatar ?? null, amount, at, me: r.usuario_id === userId })))
      .sort((a, b) => b.at - a.at)
      .slice(0, FEED)
    const ranking = [...bids].sort((a, b) => b.amount - a.amount || a.at - b.at).map(person)
    const mine = saved?.round === round && !isOld(saved) ? saved : null
    return {
      now: t,
      round,
      phase: revealed ? 'reveal' : t >= closesAt ? 'closing' : 'bid',
      startsAt: round * auction.ROUND_MS,
      closesAt,
      extended: closesAt > round * auction.ROUND_MS + auction.BID_MS,
      nextRound: (round + 1) * auction.ROUND_MS,
      tier: box.tier,
      min: auction.minBid(box.tier),
      next: auction.nextBid(box.tier, top?.amount ?? 0),
      leader: person(top),
      bidders: bids.length,
      raises: live.reduce((sum, r) => sum + (r.estado.hist?.length ?? 1), 0),
      feed: feedList,
      ranking,
      bid: mine ? Number(mine.bid) : 0,
      result: revealed
        ? {
            prize: box.prize,
            amount: auction.prizeAmount(box.tier, box.prize),
            winner: top ? { name: top.name, avatar: top.avatar, bid: top.amount, me: top.owner === userId } : null,
            bids: ranking,
          }
        : null,
      history: past,
      last: saved?.last ?? null,
      balance,
    }
  }

  async function handle(user, msg, reply) {
    await settleDue()
    if (msg.a === 'bid') {
      const error = await bid(user, msg.amount)
      if (error) reply.error = { code: error }
      else await ping(AUCTION_TOPIC).catch(() => {})
    } else if (msg.a !== 'sync') {
      reply.error = { code: 'BAD_MESSAGE' }
    }
    const balance = Number((await db.query(`select saldo from public.juegos_cuentas where usuario_id = $1`, [user.id])).rows[0]?.saldo ?? 0)
    reply.me.balance = balance
    reply.auction = await view(user.id, await savedOf((sql, params) => db.query(sql, params), user.id), balance)
    return reply
  }

  // Reinicio del domingo: se borra el historial de subastas (las pujas se van con juegos_solo).
  const sweep = (q) => q(`delete from public.juegos_rondas where juego = 'auction'`)

  return { handle, settleDue, sweep }
}
