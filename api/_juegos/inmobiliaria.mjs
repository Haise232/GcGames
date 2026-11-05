// Inmobiliaria: propiedades en un tablero para todos (reglas en src/juegos/inmo/inmo.js).
// Cada casilla con dueño es una fila de juegos_inmuebles: { casilla, usuario_id, nivel, invertido, invertido_semana,
// semana, cobrado (ms: hasta cuándo está cobrado el alquiler) }. Lo que pasa (compras, mejoras, ventas) queda en
// juegos_inmuebles_log para el canal. Comprar, mejorar y vender cobran antes el alquiler pendiente del jugador, porque
// cambian lo que rinde cada una de sus propiedades (el doble con todo el color).
// Las casillas que no son propiedades (Salida, Suerte, Caja de comunidad, Parking, Vete a la cárcel) se usan una vez al
// día: lo de cada jugador va en juegos_solo (juego «inmo»: { salida, suerte, caja, parking, trampa: el día en que las
// usó, carcel: hasta cuándo está preso }) y el bote del Parking, en juegos_inmo_bote.
//   inmo   cualquiera: a «estado», «comprar» { casilla }, «mejorar» { casilla }, «vender» { casilla }, «cobrar»,
//          «salida», «carta» { mazo: 'suerte' | 'caja' }, «parking» o «trampa»
import { randomInt } from 'node:crypto'
import * as inmo from '../../src/juegos/inmo/inmo.js'
import { WEEK_TZ, weekOf } from './engine/week.mjs'
import { TAX_STEP, taxRate, tramoOf } from './hacienda.mjs'

const TOPIC = 'juegos-inmo'
const LOG_SIZE = 25
const KEEP_DAYS = 7

export const INMO_ERRORS = {
  INMO_TAKEN: 'Esa propiedad ya tiene dueño.',
  INMO_NOT_YOURS: 'Esa propiedad no es tuya.',
  INMO_MAX: 'Ya tiene hotel: no se puede mejorar más.',
  INMO_NO_BUILD: 'En esta casilla no se puede construir.',
  INMO_FUNDS: 'No te llega el saldo de la semana.',
  INMO_LOCKED: 'Antes tienes que tener un planeta (para las estrellas) o una estrella (para las galaxias).',
  INMO_DONE: 'Eso ya lo has hecho hoy: vuelve mañana.',
  INMO_PARKING_LOW: `El bote del Parking aún no ha llegado a ${inmo.PARKING_MIN.toLocaleString('es-ES', { useGrouping: 'always' })} €.`,
}

// El día (en la hora de Canarias, como la semana): «2026-10-27».
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: WEEK_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const dayOf = (t) => dayFormat.format(new Date(t))

export function createInmobiliaria({ db, now, move, ping }) {
  // Las propiedades de alguien, bloqueadas, con lo que rinde cada una por hora.
  async function holdings(q, userId) {
    const rows = (await q(`select * from public.juegos_inmuebles where usuario_id = $1 order by casilla for update`, [userId])).rows
    const perGroup = {}
    for (const r of rows) perGroup[inmo.cellOf(r.casilla).group] = (perGroup[inmo.cellOf(r.casilla).group] ?? 0) + 1
    return rows.map((r) => ({ ...r, perHour: inmo.rentPerHour(Number(r.invertido), inmo.cellOf(r.casilla).group, perGroup[inmo.cellOf(r.casilla).group]) }))
  }

  // Pasa al saldo el alquiler acumulado de todas sus propiedades. Devuelve lo cobrado.
  async function collect(q, userId, t) {
    const rows = await holdings(q, userId)
    const total = rows.reduce((sum, r) => sum + inmo.accrued(r.perHour, Number(r.cobrado), t), 0)
    // greatest: en la cárcel «cobrado» va por delante del reloj y no hay que adelantarlo.
    if (rows.length) await q(`update public.juegos_inmuebles set cobrado = greatest(cobrado, $2) where usuario_id = $1`, [userId, t])
    if (total > 0) await move(q, { [userId]: total })
    return total
  }

  async function log(q, userId, casilla, tipo, importe) {
    const { rows } = await q(`insert into public.juegos_inmuebles_log (usuario_id, casilla, tipo, importe) values ($1, $2, $3, $4) returning id`, [
      userId,
      casilla,
      tipo,
      importe,
    ])
    if (Number(rows[0].id) % 50 === 0) await q(`delete from public.juegos_inmuebles_log where creado < now() - make_interval(days => $1)`, [KEEP_DAYS])
  }

  // Primero la cuenta (como en el resto de juegos) y después las propiedades, para no bloquearse entre peticiones.
  const lockAccount = (q, userId) => q(`select saldo from public.juegos_cuentas where usuario_id = $1 for update`, [userId])

  async function buy(user, msg, t, week) {
    if (!inmo.isProperty(msg.casilla)) return { error: 'BAD_MESSAGE' }
    const cell = inmo.cellOf(msg.casilla)
    return db.tx(async (q) => {
      await lockAccount(q, user.id)
      const rent = await collect(q, user.id, t)
      // Las estrellas piden un planeta y las galaxias, una estrella.
      const need = inmo.REQUIRES[cell.kind]
      if (need) {
        const ids = inmo.SPACE.filter((c) => c.kind === need).map((c) => c.i)
        const has = (await q(`select 1 from public.juegos_inmuebles where usuario_id = $1 and casilla = any($2::int[]) limit 1`, [user.id, ids])).rows.length
        if (!has) return { error: 'INMO_LOCKED' }
      }
      const got = await q(
        `insert into public.juegos_inmuebles (casilla, usuario_id, nivel, invertido, invertido_semana, semana, cobrado)
         values ($1, $2, 0, $3, $3, $4, $5) on conflict (casilla) do nothing returning casilla`,
        [cell.i, user.id, cell.price, week, Math.max(t, (await readState(q, user.id)).carcel ?? 0)],
      )
      if (got.rows.length === 0) return { error: 'INMO_TAKEN' }
      if (!(await move(q, { [user.id]: -cell.price }, true))) throw new InmoAbort('INMO_FUNDS')
      await log(q, user.id, cell.i, 'compra', cell.price)
      return { result: { bought: cell.i, paid: cell.price, rent } }
    }).catch(abort)
  }

  async function upgrade(user, msg, t, week) {
    if (!inmo.isProperty(msg.casilla)) return { error: 'BAD_MESSAGE' }
    return db.tx(async (q) => {
      await lockAccount(q, user.id)
      const rent = await collect(q, user.id, t)
      const row = (await q(`select * from public.juegos_inmuebles where casilla = $1 and usuario_id = $2 for update`, [msg.casilla, user.id])).rows[0]
      if (!row) return { error: 'INMO_NOT_YOURS' }
      if (inmo.cellOf(msg.casilla).kind !== 'calle') return { error: 'INMO_NO_BUILD' }
      const cost = inmo.upgradeCost(msg.casilla, row.nivel)
      if (cost === null) return { error: 'INMO_MAX' }
      if (!(await move(q, { [user.id]: -cost }, true))) return { error: 'INMO_FUNDS' }
      // Lo invertido esta semana empieza de cero si la fila era de otra semana.
      const thisWeek = (row.semana === week ? Number(row.invertido_semana) : 0) + cost
      await q(`update public.juegos_inmuebles set nivel = nivel + 1, invertido = invertido + $2, invertido_semana = $3, semana = $4 where casilla = $1`, [
        msg.casilla,
        cost,
        thisWeek,
        week,
      ])
      await log(q, user.id, msg.casilla, row.nivel + 1 >= inmo.MAX_LEVEL ? 'hotel' : 'casa', cost)
      return { result: { upgraded: msg.casilla, level: row.nivel + 1, paid: cost, rent } }
    })
  }

  async function sell(user, msg, t, week) {
    if (!inmo.isProperty(msg.casilla)) return { error: 'BAD_MESSAGE' }
    return db.tx(async (q) => {
      await lockAccount(q, user.id)
      const rent = await collect(q, user.id, t)
      const row = (await q(`delete from public.juegos_inmuebles where casilla = $1 and usuario_id = $2 returning *`, [msg.casilla, user.id])).rows[0]
      if (!row) return { error: 'INMO_NOT_YOURS' }
      const value = inmo.saleValue({ invested: Number(row.invertido), investedWeek: Number(row.invertido_semana), week: row.semana }, week)
      if (value > 0) await move(q, { [user.id]: value })
      // Un poco de lo que se queda el banco va al bote del Parking.
      await feedParking(q, Math.floor((Number(row.invertido) - value) * inmo.PARKING_CUT))
      await log(q, user.id, msg.casilla, 'venta', value)
      return { result: { sold: msg.casilla, earned: value, rent } }
    })
  }

  async function cash(user, msg, t) {
    return db.tx(async (q) => {
      await lockAccount(q, user.id)
      return { result: { collected: await collect(q, user.id, t) } }
    })
  }

  // ----- Las casillas de un día -----
  async function readState(q, userId) {
    const row = (await q(`select estado from public.juegos_solo where usuario_id = $1 and juego = 'inmo' for update`, [userId])).rows[0]
    return row?.estado ?? {}
  }
  const saveState = (q, userId, state) =>
    q(
      `insert into public.juegos_solo (usuario_id, juego, estado) values ($1, 'inmo', $2)
       on conflict (usuario_id, juego) do update set estado = excluded.estado, actualizado = now()`,
      [userId, state],
    )
  const feedParking = async (q, amount) => {
    if (amount > 0) await q(`insert into public.juegos_inmo_bote (id, bote) values (1, $1) on conflict (id) do update set bote = juegos_inmo_bote.bote + $1`, [amount])
  }
  // Paga lo que pueda (no deja el saldo en negativo) y lo manda al Parking. Devuelve lo pagado.
  async function pay(q, userId, amount) {
    const saldo = Number((await q(`select saldo from public.juegos_cuentas where usuario_id = $1`, [userId])).rows[0]?.saldo ?? 0)
    const paid = Math.max(0, Math.min(amount, saldo))
    if (paid > 0) {
      await move(q, { [userId]: -paid })
      await feedParking(q, paid)
    }
    return paid
  }
  // A la cárcel: se cobra lo acumulado y las propiedades no dan alquiler hasta que salga.
  async function jail(q, userId, t, state) {
    await collect(q, userId, t)
    const until = t + inmo.JAIL_MS
    await q(`update public.juegos_inmuebles set cobrado = greatest(cobrado, $2) where usuario_id = $1`, [userId, until])
    state.carcel = until
    return until
  }
  // Una casilla de una vez al día: comprueba que no se haya usado hoy, hace lo suyo y lo apunta.
  function daily(key, casilla, fn) {
    return (user, msg, t) =>
      db.tx(async (q) => {
        await lockAccount(q, user.id)
        const state = await readState(q, user.id)
        const k = typeof key === 'function' ? key(msg) : key
        if (!k) return { error: 'BAD_MESSAGE' }
        const day = dayOf(t)
        if (state[k] === day) return { error: 'INMO_DONE' }
        const out = await fn(q, user, msg, t, state)
        if (out.error) return out
        state[k] = day
        await saveState(q, user.id, state)
        await log(q, user.id, typeof casilla === 'function' ? casilla(msg) : casilla, out.tipo ?? k, out.amount ?? 0)
        return { result: out }
      })
  }

  const salida = daily('salida', 0, async (q, user) => {
    await move(q, { [user.id]: inmo.SALIDA_BONUS })
    return { amount: inmo.SALIDA_BONUS }
  })

  const DECKS = { suerte: 7, caja: 2 }
  const card = daily(
    (msg) => (Object.hasOwn(DECKS, msg.mazo) ? msg.mazo : null),
    (msg) => DECKS[msg.mazo],
    async (q, user, msg, t, state) => {
      const deck = inmo.CARDS[msg.mazo]
      const c = deck[randomInt(deck.length)]
      const gain = async (n) => {
        if (n > 0) await move(q, { [user.id]: n })
        return n
      }
      let amount = 0
      let until = null
      if (c.effect === 'cobra') amount = await gain(c.amount)
      else if (c.effect === 'paga') amount = -(await pay(q, user.id, c.amount)) || 0
      else if (c.effect === 'porpropiedad') {
        const n = (await q(`select count(*)::int n from public.juegos_inmuebles where usuario_id = $1`, [user.id])).rows[0].n
        amount = await gain(Math.max(c.min, n * c.amount))
      } else if (c.effect === 'alquiler') {
        // Sin propiedades, 300 € de consolación.
        const perHour = (await holdings(q, user.id)).reduce((sum, r) => sum + r.perHour, 0)
        amount = await gain(Math.max(300, perHour * c.hours))
      } else if (c.effect === 'reparaciones') {
        const rows = (await q(`select nivel from public.juegos_inmuebles where usuario_id = $1`, [user.id])).rows
        const cost = rows.reduce((sum, r) => sum + (r.nivel >= inmo.MAX_LEVEL ? c.hotel : r.nivel * c.house), 0)
        amount = -(await pay(q, user.id, cost)) || 0
      } else if (c.effect === 'carcel') until = await jail(q, user.id, t, state)
      else if (c.effect === 'casa') {
        // La calle más barata con sitio. La casa regalada cuenta como inversión antigua (se vende al 25 %).
        const rows = (await q(`select casilla, nivel from public.juegos_inmuebles where usuario_id = $1 and nivel < $2 for update`, [user.id, inmo.MAX_LEVEL])).rows
        const street = rows
          .filter((r) => inmo.cellOf(r.casilla).kind === 'calle')
          .sort((a, b) => inmo.cellOf(a.casilla).price - inmo.cellOf(b.casilla).price)[0]
        if (street) {
          await collect(q, user.id, t)
          const house = inmo.upgradeCost(street.casilla, street.nivel)
          await q(`update public.juegos_inmuebles set nivel = nivel + 1, invertido = invertido + $2 where casilla = $1`, [street.casilla, house])
          return { card: c.id, mazo: msg.mazo, amount: 0, casa: street.casilla, tipo: msg.mazo }
        }
        amount = await gain(c.amount)
      }
      return { card: c.id, mazo: msg.mazo, amount, until, tipo: msg.mazo }
    },
  )

  const parking = daily('parking', 20, async (q, user) => {
    const bote = Number((await q(`select bote from public.juegos_inmo_bote where id = 1 for update`)).rows[0]?.bote ?? 0)
    if (bote < inmo.PARKING_MIN) return { error: 'INMO_PARKING_LOW' }
    await q(`update public.juegos_inmo_bote set bote = 0 where id = 1`)
    await move(q, { [user.id]: bote })
    return { amount: bote }
  })

  const trap = daily('trampa', 30, async (q, user, msg, t, state) => {
    if (randomInt(2) === 0) {
      await move(q, { [user.id]: inmo.TRAP_WIN })
      return { amount: inmo.TRAP_WIN, escaped: true }
    }
    return { amount: 0, until: await jail(q, user.id, t, state), tipo: 'carcel' }
  })

  // Lo que se ve en las casillas especiales: el bote, quién está preso, lo que has usado hoy y lo de Hacienda.
  async function boardInfo(userId, t) {
    const [bote, jailed, me] = await Promise.all([
      db.query(`select bote from public.juegos_inmo_bote where id = 1`),
      db.query(
        `select c.nombre, c.avatar, (c.hacienda->>'carcel')::bigint as hasta, 'hacienda' as por from public.juegos_cuentas c
          where (c.hacienda->>'carcel')::bigint > $1
         union all
         select c.nombre, c.avatar, (s.estado->>'carcel')::bigint, 'inmo' from public.juegos_solo s
           join public.juegos_cuentas c on c.usuario_id = s.usuario_id
          where s.juego = 'inmo' and (s.estado->>'carcel')::bigint > $1
         order by 3 desc limit 20`,
        [t],
      ),
      db.query(
        `select c.saldo, c.hacienda, s.estado from public.juegos_cuentas c
           left join public.juegos_solo s on s.usuario_id = c.usuario_id and s.juego = 'inmo'
          where c.usuario_id = $1`,
        [userId],
      ),
    ])
    const row = me.rows[0] ?? {}
    const state = row.estado ?? {}
    const day = dayOf(t)
    const saldo = Number(row.saldo ?? 0)
    const tramo = Math.max(tramoOf(saldo), row.hacienda?.tramo ?? 0) + 1
    return {
      bote: Number(bote.rows[0]?.bote ?? 0),
      used: Object.fromEntries(['salida', 'suerte', 'caja', 'parking', 'trampa'].map((k) => [k, state[k] === day])),
      carcel: state.carcel > t ? state.carcel : null,
      jailed: jailed.rows.map((r) => ({ name: r.nombre ?? '¿?', avatar: r.avatar ?? null, until: Number(r.hasta), why: r.por })),
      hacienda: { pending: Boolean(row.hacienda?.pend), nextAt: tramo * TAX_STEP, nextRate: taxRate(tramo) },
    }
  }

  // El tablero entero, para todos igual salvo lo que es tuyo (lo que te dan al venderla).
  async function view(userId, t, week) {
    const [owned, logRows] = await Promise.all([
      db.query(
        `select i.*, c.nombre, c.avatar from public.juegos_inmuebles i left join public.juegos_cuentas c on c.usuario_id = i.usuario_id order by i.casilla`,
      ),
      db.query(
        `select l.id, l.usuario_id, l.casilla, l.tipo, l.importe, l.creado, c.nombre, c.avatar
         from public.juegos_inmuebles_log l left join public.juegos_cuentas c on c.usuario_id = l.usuario_id
         order by l.id desc limit $1`,
        [LOG_SIZE],
      ),
    ])
    const groups = {}
    for (const r of owned.rows) {
      const key = `${r.usuario_id}:${inmo.cellOf(r.casilla).group}`
      groups[key] = (groups[key] ?? 0) + 1
    }
    const owners = new Map()
    const cells = owned.rows.map((r) => {
      const group = inmo.cellOf(r.casilla).group
      const me = r.usuario_id === userId
      const invested = Number(r.invertido)
      const perHour = inmo.rentPerHour(invested, group, groups[`${r.usuario_id}:${group}`])
      const o = owners.get(r.usuario_id) ?? { id: r.usuario_id, name: r.nombre ?? '¿?', avatar: r.avatar ?? null, me, count: 0, worth: 0, perHour: 0 }
      o.count++
      o.worth += invested
      o.perHour += perHour
      owners.set(r.usuario_id, o)
      return {
        casilla: r.casilla,
        owner: { id: r.usuario_id, name: r.nombre ?? '¿?', avatar: r.avatar ?? null, me },
        level: r.nivel,
        invested,
        perHour,
        full: inmo.groupMult(group, groups[`${r.usuario_id}:${group}`]) > 1,
        // Solo para el dueño: desde cuándo acumula alquiler y lo que le dan si la vende.
        since: me ? Number(r.cobrado) : null,
        sale: me ? inmo.saleValue({ invested, investedWeek: Number(r.invertido_semana), week: r.semana }, week) : null,
      }
    })
    return {
      now: t,
      cells,
      ranking: [...owners.values()].sort((a, b) => b.worth - a.worth),
      log: logRows.rows.map((r) => ({
        id: Number(r.id),
        casilla: r.casilla,
        type: r.tipo,
        amount: Number(r.importe),
        at: new Date(r.creado).getTime(),
        by: { id: r.usuario_id, name: r.nombre ?? '¿?', avatar: r.avatar ?? null, me: r.usuario_id === userId },
      })),
    }
  }

  const ACTIONS = { comprar: buy, mejorar: upgrade, vender: sell, cobrar: cash, salida, carta: card, parking, trampa: trap }

  async function handle(user, msg, reply) {
    const t = now()
    const week = weekOf(t).key
    if (Object.hasOwn(ACTIONS, msg.a)) {
      const out = await ACTIONS[msg.a](user, msg, t, week)
      if (out.error) reply.error = { code: out.error }
      else {
        reply.result = out.result
        await ping(TOPIC, 'cambio')
      }
    } else if (msg.a !== 'estado') reply.error = { code: 'BAD_MESSAGE' }
    const t2 = now()
    const [board, extra] = await Promise.all([view(user.id, t2, week), boardInfo(user.id, t2)])
    reply.inmo = { ...board, board: extra }
  }

  return { handle }
}

// Para deshacer la compra (la fila ya insertada) si al final no llega el saldo: la excepción tira la transacción.
class InmoAbort extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}
function abort(error) {
  if (error instanceof InmoAbort) return { error: error.code }
  throw error
}
