// Bingo en vivo: una partida para todos cada bingo.ROUND_MS (reglas en src/juegos/bingo/bingo.js).
// Los cartones de cada uno se guardan en juegos_solo (juego «bingo»): { round, week, cards, prices, boosts, paid, last }
// (prices: lo que costó cada cartón; sin él, son de antes de los precios nuevos. boosts: el Admin Abuse activo al comprar
// cada cartón, 'x2' | 'x3' | 'gratis' o null; se aplica al pagar ese cartón aunque el evento ya haya acabado. free: los
// cartones que regaló el Admin Abuse ×2/×3, uno o dos más por cada uno comprado; juegan y cobran con su precio, pero no
// cuentan en lo apostado ni en el máximo). El orden de las
// bolas sale de HMAC(secreto, ronda), como la ruleta, y el servidor no lo suelta hasta que se cierra la venta; a partir de
// ahí ya no se puede hacer nada, así que da igual que la pantalla lo conozca antes de que salgan las bolas.
// El bote (la jaula) está en juegos_bingo: lo alimentan el 25 % de los cartones y lo que se pierde en el resto del casino
// (feed), y se lo lleva quien cante bingo con la bola bingo.POT_BALL o antes, o justo con la bola dorada (otra del mismo
// sorteo, una por partida), pero solo en las partidas que la banca deja (juegos_bingo.control, ver bingo.openingAt): el
// master abre el bote un rato o hasta que alguien se lo lleve, y mientras está cerrado la jaula solo crece.
// Se paga sin temporizador: la primera petición que llega después de la bola del bingo reparte los premios (settleDue).
//   bingo   cualquiera: a «sync» (ponerse al día) o «buy» (n cartones más de tipo kind para la partida en curso)
import { randomInt } from 'node:crypto'
import * as bingo from '../../src/juegos/bingo/bingo.js'
import { abuseExtra, abuseLuck, abuseOn } from './banca.mjs'
import { hmacStream, uniform } from './solo.mjs'
import { weekOf } from './engine/week.mjs'

const GRACE_MS = 600 // compras que salieron del navegador justo antes de cerrar la venta y llegan un poco tarde
const REVEAL_MS = bingo.BUY_MS + GRACE_MS + 400 // el orden de las bolas, ya sin compras posibles
const PAY_PAD_MS = 1200 // el pago, un poco después de que se vea la bola del bingo
const HISTORY = 10

export const BINGO_ERRORS = {
  BINGO_CLOSED: 'La venta de cartones está cerrada: compra para la siguiente partida.',
  BINGO_MAX: `Como mucho ${bingo.MAX_CARDS} cartones por partida.`,
}

const orders = new Map()

// Las 90 bolas de una partida en el orden en que salen (todos los órdenes igual de probables).
export function orderOf(secret, round) {
  const hit = orders.get(round)
  if (hit) return hit
  const rand = uniform(hmacStream(secret, `bingo:${round}`))
  const order = Array.from({ length: bingo.BALLS }, (_, i) => i + 1)
  for (let i = order.length - 1; i > 0; i--) {
    const j = rand(i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  if (orders.size > 2000) orders.clear()
  orders.set(round, order)
  return order
}

const goldens = new Map()

// La bola dorada de una partida: un número del 1 al 90, de un sorteo aparte (no depende del orden de las bolas).
export function goldenOf(secret, round) {
  const hit = goldens.get(round)
  if (hit) return hit
  const golden = 1 + uniform(hmacStream(secret, `bingo-oro:${round}`))(bingo.BALLS)
  if (goldens.size > 2000) goldens.clear()
  goldens.set(round, golden)
  return golden
}

const revealAt = (round) => bingo.startOf(round) + REVEAL_MS
const boostOf = (saved, i) => saved?.boosts?.[i] ?? null
const freeOf = (saved, i) => Boolean(saved?.free?.[i])
// Lo que costó de verdad un cartón (0 si fue regalo).
const stakeOf = (saved, i) => (freeOf(saved, i) ? 0 : bingo.priceOf(saved, i))

export function createBingo({ db, now, secret, move, abuse }) {
  // Partidas ya cerradas (sus cartones no cambian): cartones, reparto y nombres, para no volver a calcularlo en cada vista.
  const rounds = new Map()
  let nextCheck = 0 // antes de esta hora no hay nada que pagar (en esta instancia)

  // Todos los cartones de una partida, en un orden fijo: [{ owner, name, cells, price }].
  async function cardsOf(q, round, lock = false) {
    const { rows } = await q(
      `select s.usuario_id, s.estado, c.nombre from public.juegos_solo s join public.juegos_cuentas c on c.usuario_id = s.usuario_id
       where s.juego = 'bingo' and s.estado->>'round' = $1 order by s.usuario_id${lock ? ' for update of s' : ''}`,
      [String(round)],
    )
    const cards = rows.flatMap((r) =>
      (r.estado.cards ?? []).map((cells, i) => ({
        owner: r.usuario_id,
        name: r.nombre,
        cells,
        price: bingo.priceOf(r.estado, i),
        stake: stakeOf(r.estado, i),
        boost: boostOf(r.estado, i),
      })),
    )
    return { rows, cards }
  }

  // Reparto de una partida cerrada (sin el bote, que se mira al pagar): bolas de la línea y del bingo y quién gana.
  async function outcomeOf(round) {
    const hit = rounds.get(round)
    if (hit) return hit
    const { cards } = await cardsOf((sql, params) => db.query(sql, params), round)
    const golden = goldenOf(secret, round)
    // Con la jaula a 0 el reparto no da bote; aquí solo importa si la partida lo da (early o golden) y quién gana.
    const result = bingo.settle(cards, orderOf(secret, round), 0, golden)
    const winners = (list, key) =>
      list.map((i) => ({ name: cards[i].name, owner: cards[i].owner, amount: result.prizes[i][key] }))
    const outcome = {
      sold: result.sold,
      cards: cards.length,
      players: new Set(cards.map((c) => c.owner)).size,
      lineBall: result.lineBall,
      bingoBall: result.bingoBall,
      line: winners(result.line, 'line'),
      bingo: winners(result.bingo, 'bingo'),
      golden,
      goldenHit: result.golden,
      jackpot: result.early || result.golden,
    }
    if (rounds.size > 50) rounds.clear()
    rounds.set(round, outcome)
    return outcome
  }

  // Lo que el resto del casino pierde va a la jaula (dentro de la transacción de esa jugada).
  async function feed(q, amount) {
    if (amount > 0) await q(`update public.juegos_bingo set bote = bote + $1 where id = 1`, [Math.round(amount)])
  }

  async function potRow() {
    const { rows } = await db.query(`select bote, historial, control from public.juegos_bingo where id = 1`)
    return { pot: Number(rows[0]?.bote ?? 0), history: rows[0]?.historial ?? [], control: rows[0]?.control ?? [] }
  }

  // Lo que la pantalla enseña del bote: si ahora está abierto y hasta cuándo.
  const potState = (control, t) => {
    const open = bingo.openingAt(control, t)
    return { abierto: Boolean(open), desde: open?.desde ?? null, hasta: open?.hasta ?? null, una: Boolean(open?.una) }
  }

  // Paga las partidas cuya bola del bingo ya salió. Barato: en cada instancia mira la base de datos como mucho una vez
  // por partida (al cerrarse la venta) y cuando toca pagar.
  async function settleDue() {
    const t = now()
    if (t < nextCheck) return
    const { round, phase } = bingo.phaseAt(t)
    let next = phase === 'buy' ? revealAt(round) : revealAt(round + 1)
    const { rows } = await db.query(
      `select distinct (estado->>'round')::bigint as round from public.juegos_solo where juego = 'bingo' and estado->>'paid' = 'false'`,
    )
    for (const r of rows.map((row) => Number(row.round)).sort((a, b) => a - b)) {
      if (t < revealAt(r)) continue
      const outcome = await outcomeOf(r)
      const due = outcome.bingoBall === null ? revealAt(r) : bingo.ballAt(r, outcome.bingoBall) + PAY_PAD_MS
      if (t >= due) await pay(r)
      else next = Math.min(next, due)
    }
    nextCheck = next
  }

  async function pay(round) {
    const week = weekOf(now()).key
    await db.tx(async (q) => {
      const row = (await q(`select bote, control from public.juegos_bingo where id = 1 for update`)).rows[0]
      const pot = Number(row?.bote ?? 0)
      const control = row?.control ?? []
      // ¿Se cerró la venta de esta partida con el bote abierto? Si no, juega con la jaula a 0 y la jaula sigue entera.
      const opening = bingo.openingAt(control, revealAt(round))
      const { rows, cards } = await cardsOf(q, round, true)
      const open = rows.filter((r) => r.estado.paid === false)
      if (!open.length) return
      // Cartones de otra semana: el saldo ya se reinició, no se paga nada.
      const stale = open.some((r) => r.estado.week !== week)
      const result = bingo.settle(stale ? [] : cards, orderOf(secret, round), opening ? pot : 0, goldenOf(secret, round))
      const potAfter = result.potAfter + (opening ? 0 : pot)
      const won = new Map()
      cards.forEach((c, i) => {
        const p = result.prizes[i]
        if (!p) return
        const mine = won.get(c.owner) ?? { line: 0, bingo: 0, pot: 0, abuse: 0 }
        mine.line += p.line
        mine.bingo += p.bingo
        mine.pot += p.pot
        // Admin Abuse del cartón: la banca multiplica lo que gana o le devuelve lo que costó (no sale de la jaula).
        if (c.boost) mine.abuse += abuseExtra({ modo: c.boost, ambito: 'todo' }, 'bingo', p.line + p.bingo + p.pot - c.stake)
        won.set(c.owner, mine)
      })
      const deltas = {}
      for (const [owner, p] of won) if (p.line + p.bingo + p.pot + p.abuse > 0) deltas[owner] = p.line + p.bingo + p.pot + p.abuse
      if (Object.keys(deltas).length) await move(q, deltas)
      for (const r of open) {
        const p = won.get(r.usuario_id) ?? { line: 0, bingo: 0, pot: 0, abuse: 0 }
        const stake = (r.estado.cards ?? []).reduce((sum, _, i) => sum + stakeOf(r.estado, i), 0)
        const payout = p.line + p.bingo + p.pot // solo premios; lo del Admin Abuse va aparte, en abuse
        const boost = (r.estado.boosts ?? []).find(Boolean) ?? null
        const last = { round, cards: r.estado.cards?.length ?? 0, stake, ...p, boost, payout, net: payout + p.abuse - stake, lineBall: result.lineBall, bingoBall: result.bingoBall }
        await q(`update public.juegos_solo set estado = $3, actualizado = now() where usuario_id = $1 and juego = $2`, [
          r.usuario_id,
          'bingo',
          { ...r.estado, paid: true, last },
        ])
      }
      const names = (list) => [...new Set(list.map((i) => cards[i].name))]
      const entry = {
        round,
        sold: result.sold,
        lineBall: result.lineBall,
        bingoBall: result.bingoBall,
        line: names(result.line),
        bingo: names(result.bingo),
        jackpot: result.prizes.reduce((sum, p) => sum + p.pot, 0), // lo que salió de la jaula
        golden: result.jackpot && result.golden,
      }
      // Apertura de «una vez»: con este bote se cierra, también para las partidas que vengan detrás.
      const closed =
        result.jackpot && opening?.una
          ? control.map((o) => (o === opening ? { ...o, hasta: Math.min(o.hasta ?? Infinity, revealAt(round) + 1) } : o))
          : control
      await q(
        `update public.juegos_bingo set bote = $1, historial = (jsonb_build_array($2::jsonb) || historial) - ${HISTORY}, control = $3 where id = 1`,
        [potAfter, JSON.stringify(entry), JSON.stringify(closed)],
      )
    })
  }

  // Lo que ve la pantalla del bingo.
  async function view(userId, saved, balance) {
    const t = now()
    const { round, phase, drawn } = bingo.phaseAt(t)
    const [{ pot, history, control }, counts] = await Promise.all([
      potRow(),
      t < revealAt(round)
        ? db.query(
            `select count(*)::int as players, coalesce(sum(jsonb_array_length(estado->'cards')), 0)::int as cards
             from public.juegos_solo where juego = 'bingo' and estado->>'round' = $1`,
            [String(round)],
          )
        : null,
    ])
    const outcome = t >= revealAt(round) ? await outcomeOf(round) : null
    const mine = saved?.round === round ? (saved.cards ?? []) : []
    const prices = mine.map((_, i) => bingo.priceOf(saved, i))
    const free = mine.map((_, i) => freeOf(saved, i))
    return {
      now: t,
      round,
      phase,
      drawn: drawn ?? 0,
      pot,
      bote: potState(control, t),
      potOpen: Boolean(bingo.openingAt(control, revealAt(round))), // ¿esta partida puede dar bote?
      cards: mine,
      prices,
      free,
      players: outcome ? outcome.players : counts.rows[0].players,
      sold: outcome ? outcome.cards : counts.rows[0].cards,
      draw: outcome
        ? {
            order: orderOf(secret, round),
            lineBall: outcome.lineBall,
            bingoBall: outcome.bingoBall,
            line: outcome.line.map(({ name, amount, owner }) => ({ name, amount, me: owner === userId })),
            bingo: outcome.bingo.map(({ name, amount, owner }) => ({ name, amount, me: owner === userId })),
            jackpot: outcome.jackpot && Boolean(bingo.openingAt(control, revealAt(round))),
            golden: outcome.golden,
            goldenHit: outcome.goldenHit,
          }
        : null,
      last: saved?.last ?? null,
      history,
      balance,
    }
  }

  async function savedOf(q, userId, lock = false) {
    return (await q(`select estado from public.juegos_solo where usuario_id = $1 and juego = 'bingo'${lock ? ' for update' : ''}`, [userId])).rows[0]?.estado ?? null
  }

  async function balanceOf(userId) {
    return Number((await db.query(`select saldo from public.juegos_cuentas where usuario_id = $1`, [userId])).rows[0]?.saldo ?? 0)
  }

  // Compra de n cartones más de un tipo (bingo.KINDS) para la partida en curso. Devuelve un código de error o null.
  async function buy(user, n, kind) {
    if (!Number.isInteger(n) || n < 1 || n > bingo.MAX_CARDS || !Object.hasOwn(bingo.KINDS, kind)) return 'BAD_MESSAGE'
    const price = bingo.KINDS[kind].price
    const t = now()
    const { round, offset } = bingo.phaseAt(t)
    if (offset >= bingo.BUY_MS + GRACE_MS) return 'BINGO_CLOSED'
    const week = weekOf(t).key
    const ab = await abuse()
    const boost = abuseOn(ab, 'bingo') ? ab.modo : null
    const gifts = n * (abuseLuck(ab, 'bingo') - 1)
    return db.tx(async (q) => {
      const saved = await savedOf(q, user.id, true)
      // Unos cartones de una partida anterior sin pagar no se pisan (settleDue los paga antes de llegar aquí).
      if (saved && saved.paid === false && saved.round !== round) return 'BUSY'
      const have = saved?.round === round ? (saved.cards ?? []) : []
      const bought = have.filter((_, i) => !freeOf(saved, i)).length
      if (bought + n > bingo.MAX_CARDS) return 'BINGO_MAX'
      const cost = n * price
      if (!(await move(q, { [user.id]: -cost }, true))) return 'INSUFFICIENT_FUNDS'
      const cards = [...have, ...Array.from({ length: n + gifts }, () => bingo.makeCard(randomInt))]
      const prices = [...have.map((_, i) => bingo.priceOf(saved, i)), ...Array(n + gifts).fill(price)]
      const boosts = [...have.map((_, i) => boostOf(saved, i)), ...Array(n + gifts).fill(boost)]
      const free = [...have.map((_, i) => freeOf(saved, i)), ...Array(n).fill(false), ...Array(gifts).fill(true)]
      await feed(q, (cost * bingo.POT_PCT) / 100)
      await q(
        `insert into public.juegos_solo (usuario_id, juego, estado) values ($1, 'bingo', $2)
         on conflict (usuario_id, juego) do update set estado = excluded.estado, actualizado = now()`,
        [user.id, { round, week, cards, prices, boosts, free, paid: false, last: saved?.last ?? null }],
      )
      return null
    })
  }

  async function handle(user, msg, reply) {
    await settleDue()
    if (msg.a === 'buy') {
      const error = await buy(user, msg.n, msg.kind ?? 'simple')
      if (error) reply.error = { code: error }
    } else if (msg.a !== 'sync') {
      reply.error = { code: 'BAD_MESSAGE' }
    }
    const balance = await balanceOf(user.id)
    reply.me.balance = balance
    const saved = await savedOf((sql, params) => db.query(sql, params), user.id)
    reply.bingo = await view(user.id, saved, balance)
    return reply
  }

  // Para el menú: lo que hay en la jaula y el último bote que salió.
  async function summary() {
    const { pot, history, control } = await potRow()
    const t = now()
    const { round, phase } = bingo.phaseAt(t)
    return { pot, bote: potState(control, t), round, phase, next: phase === 'buy' ? bingo.drawStart(round) : bingo.startOf(round + 1), lastJackpot: history.find((h) => h.jackpot > 0) ?? null }
  }

  // Reinicio del domingo: los saldos vuelven a 15.000 € y la jaula se vacía con ellos.
  const sweep = (q) => q(`update public.juegos_bingo set bote = 0`)

  // Banca: abre el bote (minutos: uno de bingo.POT_OPEN_MINUTES, null = sin límite; una: se cierra tras el primer bote)
  // o lo cierra (minutos undefined y cerrar). Cerrar no toca las partidas cuya venta ya se cerró.
  async function setPot(msg) {
    const t = now()
    if (!msg.cerrar && !bingo.POT_OPEN_MINUTES.includes(msg.minutos)) return null
    return db.tx(async (q) => {
      const control = (await q(`select control from public.juegos_bingo where id = 1 for update`)).rows[0]?.control ?? []
      // La apertura en curso termina ahora (y deja de ser «en curso» aunque se abra otra justo después).
      let next = control.map((o) => (bingo.openingAt([o], t) ? { ...o, hasta: t } : o))
      if (!msg.cerrar) next = [{ desde: t, hasta: msg.minutos === null ? null : t + msg.minutos * 60000, una: msg.una !== false }, ...next]
      next = next.slice(0, bingo.MAX_OPENINGS)
      await q(`update public.juegos_bingo set control = $1 where id = 1`, [JSON.stringify(next)])
      return potState(next, t)
    })
  }

  // Para el panel de la banca: el estado del bote, lo que hay en la jaula y los últimos botes que salieron.
  async function potAdmin() {
    const { pot, history, control } = await potRow()
    const t = now()
    return { ...potState(control, t), pot, botes: history.filter((h) => h.jackpot > 0).slice(0, 5), ahora: t }
  }

  return { handle, feed, settleDue, summary, sweep, setPot, potAdmin }
}
