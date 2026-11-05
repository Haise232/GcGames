// Gacha de Juegos al estilo de Mudae, con personajes de anime. Cada carta tiene como mucho un dueño.
//   - La mesa: cada TABLE_PERIOD_MS sale sola una carta libre, hasta TABLE_MAX a la vista de todos, y cualquiera puede
//     cogerla: se la queda el primero, sin límite por persona.
//   - Tirar pagando: una tirada (ROLL_COST) o una premium (PREMIUM_COST: épica o legendaria) saca una carta libre y su
//     jugador decide si guardarla o descartarla; hasta decidirlo no puede volver a tirar.
// Todo se paga y se cobra con el saldo de la semana (cuenta en el Score): las tiradas y vender una carta tuya (SELL_RATE €
// por punto de valor, la mitad si la cogiste gratis de la mesa; la carta queda libre otra vez).
// Las cartas son bienes y no efectivo: Hacienda solo mira el saldo, así que guardar dinero en cartas lo esconde. Por eso
// una carta se vende casi por lo que costó sacarla (de media se pierde un 12 %), pero nunca por más: si tirar y vender
// diera dinero, sería dinero gratis.
// Las cartas sirven además de garantía cuando te quedas sin dinero: con menos de PAWN_LIMIT en el saldo puedes empeñar
// una carta tuya y el banco te presta al momento PAWN_RATE de lo que vale. La carta sigue siendo tuya pero no se puede
// vender ni fusionar; la recuperas devolviendo el préstamo más PAWN_FEE (el interés va a la jaula del bingo) antes de
// PAWN_MS. Si no, el banco se la queda y vuelve a estar libre para cualquiera (sweepPawns).
// (Hasta octubre de 2026 las cartas tenían poderes en los juegos; se quitaron porque casi nadie los usaba.)
// Las cartas vienen de gacha-catalogo.json (Season 4: personajes de anime, lo genera scripts/gacha/anime.mjs).
import { randomInt } from 'node:crypto'
import catalogo from './gacha-catalogo.json' with { type: 'json' }

const HOUR = 3600000
export const TABLE_PERIOD_MS = HOUR
export const TABLE_MAX = 5
// € por punto de valor al vender: común ≈ 1.750 €, legendaria ≈ 34.000 €. De media una tirada se vende por ≈ 3.440 € y
// una premium por ≈ 17.560 € (un 86 % y un 88 % de lo que cuestan). Sin la suerte del Admin Abuse en las tiradas de
// pago: con ella, tirar y vender saldría rentable.
export const SELL_RATE = 45
export const ROLL_COST = 4000
export const PREMIUM_COST = 20000
// Las cartas cogidas gratis de la mesa (origen «mesa») se venden y se empeñan por esta parte de su precio.
export const MESA_RATE = 0.5
// Precio de venta de una carta con dueño según de dónde salió.
export const priceOf = (id, origen) => Math.floor((cards.get(id)?.value ?? 0) * SELL_RATE * (origen === 'mesa' ? MESA_RATE : 1))

// Empeño: solo con menos de PAWN_LIMIT en el saldo (es para cuando te quedas sin dinero); te prestan el 70 % de lo que
// vale la carta y para recuperarla devuelves un 20 % más, en 3 días como mucho.
export const PAWN_LIMIT = 2000
export const PAWN_RATE = 0.7
export const PAWN_FEE = 0.2
export const PAWN_MS = 72 * HOUR
const PAWN_SWEEP_MS = 30000
const RARITY_ORDER = { unica: -1, mitica: 0, epica: 1, rara: 2, comun: 3 }
const FEED_SIZE = 30
const KEEP_DAYS = 7
// Probabilidad de cada rareza (en milésimas): la mítica, un 0,1 % en la mesa y las tiradas y un 0,5 % en las premium.
const WEIGHTS = {
  normal: [
    ['comun', 699],
    ['rara', 230],
    ['epica', 60],
    ['mitica', 10],
    ['unica', 1],
  ],
  premium: [
    ['epica', 750],
    ['mitica', 245],
    ['unica', 5],
  ],
}

export const GACHA_ERRORS = {
  GACHA_TAKEN: '¡Tarde! Otra persona la cogió antes.',
  GACHA_OWNED: 'Esa carta ya tiene dueño.',
  GACHA_EMPTY: 'Todas las cartas tienen dueño: ahora mismo no queda ninguna libre. Vuelve cuando alguien venda alguna.',
  GACHA_FUNDS: 'No te llega el saldo de la semana.',
  GACHA_NOT_YOURS: 'Esa carta no es tuya.',
  GACHA_PENDING: 'Primero decide si guardas o descartas la carta que sacaste.',
  GACHA_NO_PENDING: 'No tienes ninguna carta por decidir.',
  GACHA_UPDATE: 'El gacha ha cambiado: recarga la página.',
  PAWN_RICH: `Solo se puede empeñar con menos de ${PAWN_LIMIT.toLocaleString('es-ES')} € en el saldo.`,
  PAWN_ALREADY: 'Esa carta ya está empeñada.',
  PAWN_NONE: 'Esa carta no está empeñada.',
  PAWN_LOCKED: 'Esa carta está empeñada: recupérala antes de venderla.',
}

const cards = new Map(catalogo.cartas.map((c) => [c.id, c]))
// Cartas de fusión (fusion: los ids de las dos que la forman): no salen en la mesa ni en las tiradas; quien junta las dos
// se la lleva al momento (fuse).
const FUSIONS = catalogo.cartas.filter((c) => c.fusion)
const drawable = catalogo.cartas.filter((c) => !c.fusion)
const partOf = new Map(FUSIONS.flatMap((f) => f.fusion.map((id) => [id, f])))
const byRarity = new Map()
for (const c of drawable) {
  if (!byRarity.has(c.rarity)) byRarity.set(c.rarity, [])
  byRarity.get(c.rarity).push(c)
}

// Probabilidad (en %) de que una tirada saque una carta concreta de esa rareza.
function chance(kind, rarity) {
  const weight = WEIGHTS[kind].find(([r]) => r === rarity)?.[1] ?? 0
  const total = WEIGHTS[kind].reduce((sum, [, w]) => sum + w, 0)
  return ((weight / total) * 100) / (byRarity.get(rarity)?.length ?? 1)
}

// Lo que se manda al navegador de una carta.
export function cardView(id) {
  const c = cards.get(id)
  if (!c) return null
  return {
    id: c.id,
    name: c.name,
    series: c.series,
    img: c.img,
    pos: c.pos ?? null,
    rarity: c.rarity,
    value: c.value,
    price: c.value * SELL_RATE,
    rank: c.rank,
    // Probabilidad (en %) de que te toque esta carta en una tirada normal y en una premium (0 en las de fusión).
    odds: c.fusion ? { normal: 0, premium: 0 } : { normal: chance('normal', c.rarity), premium: chance('premium', c.rarity) },
    // De fusión: las dos que la forman. Parte de una fusión: con cuál se junta y qué sale.
    fusion: c.fusion ? c.fusion.map((id) => cards.get(id).name) : null,
    fusesWith: partOf.has(c.id) ? { with: cards.get(partOf.get(c.id).fusion.find((id) => id !== c.id)).name, into: partOf.get(c.id).name } : null,
  }
}

function pick(list) {
  return list[randomInt(list.length)]
}

// Primero la rareza y después una carta libre de esa rareza. taken: cartas que no pueden salir (con dueño, en la mesa o
// pendientes de que alguien decida si se las queda).
function draw(premium, taken) {
  const weights = premium ? WEIGHTS.premium : WEIGHTS.normal
  let r = randomInt(weights.reduce((sum, [, w]) => sum + w, 0))
  const [rarity] = weights.find(([, w]) => (r -= w) < 0)
  const free = (list) => (taken ? list.filter((c) => !taken.has(c.id)) : list)
  let pool = free(byRarity.get(rarity) ?? [])
  // Si en esa rareza ya no queda nada libre, cualquier carta libre que no sea común (o cualquiera); la única solo sale
  // cuando toca su rareza. Si no queda ninguna libre, null: nunca se da una carta que ya tiene dueño (antes salía
  // «repetida», se cobraba y luego no se podía guardar).
  const rest = drawable.filter((c) => c.rarity !== 'unica')
  if (pool.length === 0) pool = free(rest.filter((c) => c.rarity !== 'comun'))
  if (pool.length === 0) pool = free(rest)
  return pool.length ? pick(pool) : null
}

// Periodo de la mesa: sale una carta en cada uno.
const periodOf = (t) => Math.floor(t / TABLE_PERIOD_MS)
const ms = (value) => (value instanceof Date ? value.getTime() : Number(value))

// db: { query, tx } · ping(topic, event) avisa por Realtime · charge(q, userId, amount): cobra del saldo de la semana
// (o paga, si amount es negativo) dentro de la transacción y devuelve el saldo nuevo, o null si no llega · jaula(q, €):
// a la jaula del bingo.
export function createGacha({ db, ping, now, charge, jaula = async () => {} }) {
  // Estado del jugador, bloqueado para la transacción.
  async function player(q, userId) {
    await q(`insert into public.juegos_gacha_jugadores (usuario_id) values ($1) on conflict (usuario_id) do nothing`, [userId])
    const row = (await q(`select pendiente, pendiente_premium, forzada from public.juegos_gacha_jugadores where usuario_id = $1 for update`, [userId])).rows[0]
    return { pending: row.pendiente, pendingPremium: row.pendiente_premium, forced: row.forzada }
  }

  // Cartas que no pueden salir: con dueño, en la mesa o pendientes de decisión.
  async function takenCards(q) {
    const { rows } = await q(
      `select carta from public.juegos_gacha_cartas union select carta from public.juegos_gacha_mesa
       union select pendiente from public.juegos_gacha_jugadores where pendiente is not null`,
    )
    return new Set(rows.map((r) => r.carta))
  }

  async function log(q, type, userId, cardId, premium, t) {
    const { rows } = await q(
      `insert into public.juegos_gacha_tiradas (tipo, usuario_id, carta, premium, creada) values ($1, $2, $3, $4, to_timestamp($5 / 1000.0)) returning id`,
      [type, userId, cardId, premium, t],
    )
    if (Number(rows[0].id) % 50 === 0) await q(`delete from public.juegos_gacha_tiradas where creada < now() - make_interval(days => $1)`, [KEEP_DAYS])
  }

  // Si con la carta que acaba de conseguir ya tiene las dos de una fusión (y la fusión no tiene dueño), las pierde
  // (vuelven a quedar libres) y se lleva la de fusión. Devuelve esa carta o null.
  async function fuse(q, userId, cardId, t) {
    const f = partOf.get(cardId)
    if (!f) return null
    const { rows } = await q(`select carta from public.juegos_gacha_cartas where usuario_id = $1 and carta = any($2) and empeno is null for update`, [userId, f.fusion])
    if (rows.length < f.fusion.length) return null
    const got = await q(`insert into public.juegos_gacha_cartas (carta, usuario_id) values ($1, $2) on conflict (carta) do nothing returning carta`, [f.id, userId])
    if (got.rows.length === 0) return null
    await q(`delete from public.juegos_gacha_cartas where usuario_id = $1 and carta = any($2)`, [userId, f.fusion])
    await log(q, 'fusion', userId, f.id, false, t)
    return cardView(f.id)
  }

  // Repone la mesa: una carta por cada periodo que pasó desde la última vez, sin pasar de TABLE_MAX. La primera vez sale
  // una. Cada instancia recuerda el último periodo que comprobó, así que casi siempre no consulta nada.
  let checkedPeriod = null
  async function refill(t) {
    const period = periodOf(t)
    if (checkedPeriod === period) return
    const added = await db.tx(async (q) => {
      await q(`insert into public.juegos_gacha_estado (id, periodo) values (1, $1) on conflict (id) do nothing`, [period - 1])
      const last = Number((await q(`select periodo from public.juegos_gacha_estado where id = 1 for update`)).rows[0].periodo)
      if (last >= period) return 0
      const open = (await q(`select count(*)::int as n from public.juegos_gacha_mesa`)).rows[0].n
      const count = Math.min(period - last, TABLE_MAX - open)
      const taken = await takenCards(q)
      for (let i = 0; i < count; i++) {
        const card = draw(false, taken)
        if (!card) break // no queda ninguna carta libre para la mesa
        taken.add(card.id)
        await q(`insert into public.juegos_gacha_mesa (carta, periodo, creada) values ($1, $2, to_timestamp($3 / 1000.0))`, [card.id, period, t])
        await log(q, 'mesa', null, card.id, false, t)
      }
      await q(`update public.juegos_gacha_estado set periodo = $1 where id = 1`, [period])
      return count
    })
    checkedPeriod = period
    if (added > 0) await ping('juegos-gacha', 'tirada')
  }

  // Sin bloqueo: para pintar la pantalla.
  async function readState(userId, t) {
    const [row, owned, table] = await Promise.all([
      db.query(`select pendiente, pendiente_premium from public.juegos_gacha_jugadores where usuario_id = $1`, [userId]).then((r) => r.rows[0]),
      db.query(`select count(*)::int as n from public.juegos_gacha_cartas where usuario_id = $1`, [userId]).then((r) => r.rows[0].n),
      db.query(`select id, carta, creada from public.juegos_gacha_mesa order by id`).then((r) => r.rows),
    ])
    const full = table.length >= TABLE_MAX
    return {
      now: t,
      table: table
        .map((r) => ({ id: Number(r.id), card: cardView(r.carta) && { ...cardView(r.carta), price: priceOf(r.carta, 'mesa') }, at: ms(r.creada) }))
        .filter((x) => x.card),
      tableMax: TABLE_MAX,
      nextDropAt: full ? 0 : (periodOf(t) + 1) * TABLE_PERIOD_MS,
      pending: row?.pendiente ? { card: cardView(row.pendiente), premium: row.pendiente_premium } : null,
      owned,
      prices: { roll: ROLL_COST, premium: PREMIUM_COST, sellRate: SELL_RATE },
      pawn: { limit: PAWN_LIMIT, rate: PAWN_RATE, fee: PAWN_FEE, ms: PAWN_MS },
    }
  }

  // El canal: lo último que ha pasado (salió en la mesa, alguien la cogió, alguien la sacó pagando y se la quedó).
  async function feed(userId) {
    const { rows } = await db.query(
      `select t.id, t.tipo, t.usuario_id, t.carta, t.premium, t.creada, u.nombre, u.avatar
       from public.juegos_gacha_tiradas t left join public.juegos_cuentas u on u.usuario_id = t.usuario_id
       order by t.id desc limit $1`,
      [FEED_SIZE],
    )
    return rows
      .map((r) => {
        const card = cardView(r.carta)
        if (!card) return null
        const by = r.usuario_id ? { id: r.usuario_id, name: r.nombre ?? '¿?', avatar: r.avatar ?? null, me: r.usuario_id === userId } : null
        return { id: Number(r.id), type: r.tipo, card, by, premium: r.premium, at: ms(r.creada) }
      })
      .filter(Boolean)
  }

  // Tirar pagando: sale una carta libre y queda pendiente hasta que decidas si la guardas.
  async function roll(user, msg, t) {
    if (msg.pago !== true) return { error: 'GACHA_UPDATE' }
    const premium = msg.premium === true
    return db.tx(async (q) => {
      const st = await player(q, user.id)
      if (st.pending) return { error: 'GACHA_PENDING' }
      // Primero la carta y después el cobro: si no queda ninguna libre, no se cobra.
      // forzada: carta que el master dejó preparada para la próxima tirada de pago de esta persona (una sola vez, y
      // solo si sigue libre).
      const taken = await takenCards(q)
      const forced = st.forced && cards.has(st.forced) && !cards.get(st.forced).fusion && !taken.has(st.forced) ? cards.get(st.forced) : null
      const card = forced ?? draw(premium, taken)
      if (st.forced) await q(`update public.juegos_gacha_jugadores set forzada = null where usuario_id = $1`, [user.id])
      if (!card) return { error: 'GACHA_EMPTY' }
      if ((await charge(q, user.id, premium ? PREMIUM_COST : ROLL_COST)) === null) return { error: 'GACHA_FUNDS' }
      await q(`update public.juegos_gacha_jugadores set pendiente = $2, pendiente_premium = $3 where usuario_id = $1`, [user.id, card.id, premium])
      return { result: { card: cardView(card.id), premium } }
    })
  }

  // Guardar (va a tu biblioteca) o descartar (queda libre) la carta que sacaste pagando.
  async function decide(user, msg, t) {
    const out = await db.tx(async (q) => {
      const st = await player(q, user.id)
      if (!st.pending) return { error: 'GACHA_NO_PENDING' }
      await q(`update public.juegos_gacha_jugadores set pendiente = null, pendiente_premium = false where usuario_id = $1`, [user.id])
      if (msg.keep !== true) return { result: { kept: false, card: cardView(st.pending) } }
      const got = await q(`insert into public.juegos_gacha_cartas (carta, usuario_id) values ($1, $2) on conflict (carta) do nothing returning carta`, [st.pending, user.id])
      if (got.rows.length === 0) return { error: 'GACHA_OWNED' }
      await log(q, 'guardada', user.id, st.pending, st.pendingPremium, t)
      return { result: { kept: true, card: cardView(st.pending), fused: await fuse(q, user.id, st.pending, t) } }
    })
    if (out.result?.kept) await ping('juegos-gacha', 'tirada')
    return out
  }

  // Coger una carta de la mesa: el primero que llega se la queda (sin límite por persona).
  async function take(user, msg, t) {
    if (!Number.isSafeInteger(msg.id)) return { error: 'BAD_MESSAGE' }
    const out = await db.tx(async (q) => {
      const row = (await q(`select carta from public.juegos_gacha_mesa where id = $1 for update`, [msg.id])).rows[0]
      if (!row) return { error: 'GACHA_TAKEN' }
      const got = await q(
        `insert into public.juegos_gacha_cartas (carta, usuario_id, origen) values ($1, $2, 'mesa') on conflict (carta) do nothing returning carta`,
        [row.carta, user.id],
      )
      if (got.rows.length === 0) return { error: 'GACHA_OWNED' }
      await q(`delete from public.juegos_gacha_mesa where id = $1`, [msg.id])
      await log(q, 'cogida', user.id, row.carta, false, t)
      return { result: { card: { ...cardView(row.carta), price: priceOf(row.carta, 'mesa') }, fused: await fuse(q, user.id, row.carta, t) } }
    })
    if (!out.error) await ping('juegos-gacha', 'tirada')
    return out
  }

  // Vender una carta tuya: el dinero va a tu saldo de la semana y la carta vuelve a poder salir para cualquiera.
  async function sell(user, msg) {
    const card = cardView(msg.card)
    if (!card) return { error: 'BAD_MESSAGE' }
    const out = await db.tx(async (q) => {
      // Primero la cuenta y después la carta, en el mismo orden que la tirada premium (así no se bloquean entre sí).
      await q(`select 1 from public.juegos_cuentas where usuario_id = $1 for update`, [user.id])
      const row = (await q(`select empeno, origen from public.juegos_gacha_cartas where carta = $1 and usuario_id = $2 for update`, [card.id, user.id])).rows[0]
      if (!row) return { error: 'GACHA_NOT_YOURS' }
      if (row.empeno) return { error: 'PAWN_LOCKED' }
      const price = priceOf(card.id, row.origen)
      await q(`delete from public.juegos_gacha_cartas where carta = $1`, [card.id])
      await charge(q, user.id, -price)
      return { result: { sold: card.id, earned: price } }
    })
    if (!out.error) await ping('juegos-gacha', 'tirada')
    return out
  }

  // Colección de alguien (la tuya si no se dice de quién), de la carta más valiosa a la que menos.
  async function collection(user, msg) {
    const who = typeof msg.user === 'string' && /^[0-9a-f-]{36}$/.test(msg.user) ? msg.user : user.id
    const [owned, account] = await Promise.all([
      db.query(`select carta, reclamada, empeno, origen from public.juegos_gacha_cartas where usuario_id = $1`, [who]),
      db.query(`select nombre, avatar from public.juegos_cuentas where usuario_id = $1`, [who]),
    ])
    const list = owned.rows
      .map((r) => ({ ...cardView(r.carta), price: priceOf(r.carta, r.origen), free: r.origen === 'mesa', claimedAt: ms(r.reclamada), pawn: r.empeno ?? null }))
      .filter((c) => c.id)
      .sort((a, b) => b.value - a.value || a.rank - b.rank)
    return {
      user: { id: who, name: account.rows[0]?.nombre ?? '¿?', avatar: account.rows[0]?.avatar ?? null, me: who === user.id },
      cards: list,
      worth: list.reduce((sum, c) => sum + c.price, 0),
    }
  }

  // Todos los que tienen cartas, de la colección que más vale a la que menos.
  async function ranking(user) {
    const { rows } = await db.query(
      `select c.usuario_id, array_agg(c.carta) as cartas, array_agg(c.origen) as origenes, a.nombre, a.avatar
       from public.juegos_gacha_cartas c left join public.juegos_cuentas a on a.usuario_id = c.usuario_id
       group by c.usuario_id, a.nombre, a.avatar`,
    )
    return rows
      .map((r) => {
        const owned = r.cartas.map((id, i) => cardView(id) && { ...cardView(id), price: priceOf(id, r.origenes[i]) }).filter(Boolean)
        const best = [...owned].sort((a, b) => b.value - a.value)[0] ?? null
        return {
          id: r.usuario_id,
          name: r.nombre ?? '¿?',
          avatar: r.avatar ?? null,
          me: r.usuario_id === user.id,
          count: owned.length,
          worth: owned.reduce((sum, c) => sum + c.price, 0),
          rarities: Object.fromEntries(Object.keys(RARITY_ORDER).map((r) => [r, owned.filter((c) => c.rarity === r).length])),
          best,
        }
      })
      .sort((a, b) => b.worth - a.worth)
  }

  // Todas las cartas (también las de fusión, con probabilidad 0), con su probabilidad en cada tipo de tirada y quién la tiene.
  async function cardList(user) {
    const { rows } = await db.query(
      `select c.carta, c.usuario_id, a.nombre, a.avatar from public.juegos_gacha_cartas c left join public.juegos_cuentas a on a.usuario_id = c.usuario_id`,
    )
    const owners = new Map(rows.map((r) => [r.carta, { id: r.usuario_id, name: r.nombre ?? '¿?', avatar: r.avatar ?? null, me: r.usuario_id === user.id }]))
    return catalogo.cartas
      .map((c) => ({ ...cardView(c.id), ...(c.fusion ? { normal: 0, premium: 0 } : { normal: chance('normal', c.rarity), premium: chance('premium', c.rarity) }), owner: owners.get(c.id) ?? null }))
      .sort((a, b) => b.value - a.value || a.rank - b.rank)
  }

  // Empeñar una carta tuya: el banco te presta PAWN_RATE de lo que vale (solo si te quedas sin dinero).
  async function pawn(user, msg, t) {
    const card = cardView(msg.card)
    if (!card) return { error: 'BAD_MESSAGE' }
    const out = await db.tx(async (q) => {
      // Primero la cuenta y después la carta, como al vender.
      const saldo = Number((await q(`select saldo from public.juegos_cuentas where usuario_id = $1 for update`, [user.id])).rows[0]?.saldo ?? 0)
      const row = (await q(`select empeno, origen from public.juegos_gacha_cartas where carta = $1 and usuario_id = $2 for update`, [card.id, user.id])).rows[0]
      if (!row) return { error: 'GACHA_NOT_YOURS' }
      if (row.empeno) return { error: 'PAWN_ALREADY' }
      if (saldo >= PAWN_LIMIT) return { error: 'PAWN_RICH' }
      const loan = Math.floor(priceOf(card.id, row.origen) * PAWN_RATE)
      const debt = Math.ceil(loan * (1 + PAWN_FEE))
      const due = t + PAWN_MS
      await q(`update public.juegos_gacha_cartas set empeno = $2 where carta = $1`, [card.id, { prestamo: loan, devolver: debt, vence: due }])
      await charge(q, user.id, -loan)
      await log(q, 'empenada', user.id, card.id, false, t)
      return { result: { pawned: card.id, loan, debt, due } }
    })
    if (!out.error) await ping('juegos-gacha', 'tirada')
    return out
  }

  // Recuperar una carta empeñada: se devuelve el préstamo con el interés, que va a la jaula del bingo.
  async function redeem(user, msg, t) {
    const card = cardView(msg.card)
    if (!card) return { error: 'BAD_MESSAGE' }
    const out = await db.tx(async (q) => {
      await q(`select 1 from public.juegos_cuentas where usuario_id = $1 for update`, [user.id])
      const row = (await q(`select empeno from public.juegos_gacha_cartas where carta = $1 and usuario_id = $2 for update`, [card.id, user.id])).rows[0]
      if (!row) return { error: 'GACHA_NOT_YOURS' }
      if (!row.empeno) return { error: 'PAWN_NONE' }
      const { prestamo: loan, devolver: debt } = row.empeno
      if ((await charge(q, user.id, debt)) === null) return { error: 'GACHA_FUNDS' }
      await q(`update public.juegos_gacha_cartas set empeno = null where carta = $1`, [card.id])
      await jaula(q, debt - loan)
      await log(q, 'recuperada', user.id, card.id, false, t)
      return { result: { redeemed: card.id, paid: debt } }
    })
    if (!out.error) await ping('juegos-gacha', 'tirada')
    return out
  }

  // Empeños vencidos: el banco se queda la carta y vuelve a estar libre. Cada instancia lo mira como mucho cada
  // PAWN_SWEEP_MS (una consulta que casi nunca encuentra nada).
  let nextSweep = 0
  async function sweepPawns(t) {
    if (t < nextSweep) return
    nextSweep = t + PAWN_SWEEP_MS
    const lost = await db.tx(async (q) => {
      const { rows } = await q(
        `delete from public.juegos_gacha_cartas where empeno is not null and (empeno->>'vence')::bigint <= $1 returning carta, usuario_id`,
        [t],
      )
      for (const r of rows) await log(q, 'embargada', r.usuario_id, r.carta, false, t)
      return rows.length
    })
    if (lost > 0) await ping('juegos-gacha', 'tirada')
  }

  const ACTIONS = { tirar: roll, decidir: decide, coger: take, vender: sell, empenar: pawn, recuperar: redeem }

  // msg.a: estado | tirar { pago, premium } | decidir { keep } | coger { id } | vender { card }
  //        | empenar { card } | recuperar { card } | coleccion { user } | ranking | cartas
  async function handle(user, msg) {
    const t = now()
    const reply = {}
    await refill(t)
    await sweepPawns(t)
    if (msg.a === 'coleccion') reply.collection = await collection(user, msg)
    else if (msg.a === 'ranking') reply.ranking = await ranking(user)
    else if (msg.a === 'cartas') reply.cards = await cardList(user)
    else if (Object.hasOwn(ACTIONS, msg.a)) {
      const out = await ACTIONS[msg.a](user, msg, t)
      if (out.error) reply.error = out.error
      else reply.result = out.result
    } else if (msg.a !== 'estado') reply.error = 'BAD_MESSAGE'
    const [state, list] = await Promise.all([readState(user.id, now()), feed(user.id)])
    reply.state = state
    reply.feed = list
    return reply
  }

  return { handle }
}
