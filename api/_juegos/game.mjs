// Juegos sin servidor propio: cada petición carga la mesa de Postgres con bloqueo (FOR UPDATE),
// le aplica la acción con el mismo motor que la sección de juegos original y la guarda. Los temporizadores (turnos, crupier)
// quedan anotados en la mesa y los dispara la primera petición que llegue después de que venzan (los navegadores
// mandan «tick» a tiempo). Tras cada cambio se avisa por Supabase Realtime y cada jugador pide su propia vista:
// así nadie recibe las cartas tapadas de los demás.
import { randomInt } from 'node:crypto'
import { Room } from './engine/room.mjs'
import { PokerRoom } from './engine/poker-room.mjs'
import { ChessRoom } from './engine/chess-room.mjs'
import { storedTimers } from './engine/timers.mjs'
import { weekOf } from './engine/week.mjs'
import { PUBLIC_SEATS, GAMES, nextNumber, pickTable } from './engine/lobby.mjs'
import { CHESS_CHECK_SQL, SCHEMA_SQL } from './schema.mjs'
import { SOLO_GAMES, SOLO_PLAY, crashDue, crashView, crashWaitMs, raceDue, raceView, rouletteDue, rouletteView } from './solo.mjs'
import { GACHA_ERRORS, createGacha, priceOf } from './gacha.mjs'
import { BINGO_ERRORS, createBingo } from './bingo.mjs'
import { AUCTION_ERRORS, createAuction } from './subasta.mjs'
import { BRIDGE_ERRORS, createBridge } from './puente.mjs'
import { ELEVATOR_ERRORS, createElevator } from './ascensor.mjs'
import { PESCA_ERRORS, PESCA_TOPIC, createPesca } from './pesca.mjs'
import { FERIA_ERRORS, FERIA_TOPIC, createFeria } from './feria.mjs'
import { SOGA_ERRORS, SOGA_TOPIC, createSoga } from './soga.mjs'
import { INMO_ERRORS, createInmobiliaria } from './inmobiliaria.mjs'
import { SUIZA_ERRORS, createSuiza } from './suiza.mjs'
import { abuseExtra, abuseLuck, createBanca } from './banca.mjs'
import { createHacienda, jailedUntil } from './hacienda.mjs'
import { safeAvatar, shortName } from './engine/names.mjs'
import { PASE_ERRORS, PASE_SQL, createPase } from './pase.mjs'

const SOLO_CHECK_SQL = `
alter table public.juegos_solo drop constraint if exists juegos_solo_juego_check;
alter table public.juegos_solo add constraint juegos_solo_juego_check
  check (juego in ('roulette', 'blackjack', 'crash', 'frog', 'race', 'dungeon', 'bribe', 'wheel', 'bingo', 'tower', 'heist', 'auction', 'bridge', 'elevator', 'inmo', 'fish', 'dig', 'dive', 'regatta', 'hilo', 'pesca', 'trineo', 'taller', 'criaturas', 'soga'));
alter table public.juegos_rondas drop constraint if exists juegos_rondas_juego_check;
alter table public.juegos_rondas add constraint juegos_rondas_juego_check
  check (juego in ('auction', 'bridge', 'elevator', 'pesca', 'feria', 'soga'));
`

// Juegos de una sola jugada: se liquidan al momento y no guardan nada en juegos_solo.
const INSTANT = new Set(['plinko', 'loteria'])

// Lo que valía una partida de Tesoro en la Arena (retirada) con los hoyos ya cavados: las reglas de dig/arena.js de
// entonces (25 hoyos, la casa se queda el 4 %, tope ×250), para devolvérselo a quien la dejó a medias.
const ARENA_CRABS = { calma: 3, marea: 5, nido: 9, invasion: 15 }
function arenaWorth(estado) {
  const crabs = ARENA_CRABS[estado?.mode]
  const n = Array.isArray(estado?.dug) ? estado.dug.length : 0
  if (!crabs || n < 1) return 0
  let p = 1
  for (let i = 0; i < n; i++) p *= (25 - crabs - i) / (25 - i)
  return Math.floor(estado.bet * Math.min(250, Math.floor((0.96 / p) * 100) / 100))
}

export const STARTING_BALANCE = 15000 // Season 2
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const MAX_PUBLIC_PER_GAME = 6
const AWAY_MS = 45000 // sin noticias del navegador: se le da por desconectado
const GONE_MS = 3 * 60000 // y pasado este rato, fuera de la mesa
const SEEN_SAVE_MS = 15000 // el latido se guarda aunque la mesa no cambie, como mucho una vez cada este rato
const LOBBY_MEMO_MS = 3000
const SCORES_MEMO_MS = 10000
const ONLINE_MS = 150000 // más que el sondeo del lobby (60 s) con margen: si no, el contador de conectados parpadea
const TOUCH_S = 20
const CHAT_KEEP = 50
const CHAT_GAP_MS = 700
const CRASH_WAIT_MAX_MS = 20000 // el vuelo más largo del cohete dura 18 s
const CRASH_WAIT_PAD_MS = 25
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const MAX_SCORES = 200
const NO_DAYS = [null, null, null, null, null, null, null]
// Array de Postgres como texto ({NULL,9000,…}): igual con cualquier driver.
const pgArray = (values) => `{${values.map((v) => (Number.isFinite(v) ? Math.round(v) : 'NULL')).join(',')}}`
// Días de la semana leídos de la BD (según el driver, los vacíos llegan como null o como 'NULL').
const readDays = (dias) =>
  Array.from({ length: 7 }, (_, i) => {
    const value = Array.isArray(dias) ? dias[i] : null
    return value === null || value === undefined || value === 'NULL' ? null : Number(value)
  })

export const ERRORS = {
  BAD_MESSAGE: 'Mensaje no válido.',
  BAD_PHASE: 'No puedes hacer eso ahora.',
  NOT_YOUR_TURN: 'No es tu turno.',
  NO_COOKIES: 'No tienes galletas suficientes.',
  SWAP_CAP: 'Hoy ya has canjeado el máximo. Mañana más.',
  INSUFFICIENT_FUNDS: 'Saldo insuficiente.',
  BETS_CLOSED: 'No va más: las apuestas de esta ronda ya están cerradas. Apuesta en la siguiente.',
  LAUNCHED: 'El cohete ya despegó: apuesta en la siguiente ronda.',
  CRASHED: '¡Tarde! El cohete ya explotó.',
  SEAT_TAKEN: 'Ese asiento está ocupado.',
  NOT_HOST: 'Las mesas públicas no tienen anfitrión.',
  NOT_MASTER: 'Solo el master puede usar la banca.',
  HACIENDA_NONE: 'No tienes ninguna declaración pendiente con Hacienda.',
  JAILED: 'Estás en la cárcel por intentar sobornar a Hacienda. Hasta que te suelten solo puedes mirar.',
  ROOM_NOT_FOUND: 'Esa mesa ya no existe.',
  ROOM_FULL: 'Todas las mesas están llenas. Prueba a mirar.',
  RATE_LIMIT: 'Vas demasiado rápido.',
  ILLEGAL_MOVE: 'Ese movimiento no vale.',
  BUSY: 'La mesa está muy concurrida, inténtalo de nuevo.',
  HEIST_CREW: 'Alguna carta de tu banda ya no es tuya. Elige la banda otra vez.',
  BROKE: 'Te quedaste sin saldo esta semana: el domingo a las 23:59 todos vuelven a empezar con 15.000 €.',
  AUTH_REQUIRED: 'Inicia sesión para jugar.',
  AUTH_INVALID: 'Tu sesión caducó. Recarga la página.',
  AUTH_PENDING: 'Tu cuenta aún no está aprobada: el master tiene que aceptarla.',
  AUTH_PASSWORD: 'Antes de jugar, elige una contraseña nueva.',
  AUTH_DOWN: 'No se pudo comprobar tu sesión. Reintentando…',
  ...GACHA_ERRORS,
  ...BINGO_ERRORS,
  ...AUCTION_ERRORS,
  ...BRIDGE_ERRORS,
  ...ELEVATOR_ERRORS,
  ...PESCA_ERRORS,
  ...FERIA_ERRORS,
  ...SOGA_ERRORS,
  ...INMO_ERRORS,
  ...SUIZA_ERRORS,
  ...PASE_ERRORS,
}

export class JuegosError extends Error {
  constructor(code) {
    super(ERRORS[code] ?? code)
    this.code = code
  }
}

// Blackjack de mesa. El motor (engine/room.mjs, copiado de Rule) bloquea al acabar el tiempo de apuestas la apuesta
// propuesta de todos los sentados, también de quien está ausente, que así seguía apostando ronda tras ronda sin estar.
// Aquí solo entra en la ronda quien sigue conectado; el ausente la mira hasta que vuelva o le saquen de la mesa.
class BlackjackRoom extends Room {
  // El motor lo llama también al levantarse (o echar a alguien) mientras se pagan las manos: ahí borraba el temporizador
  // de la ronda siguiente y la mesa se quedaba en «settle» para siempre, sin dejar apostar a nadie. Solo cuenta apostando.
  afterBetChange() {
    if (this.phase === 'betting') super.afterBetChange()
  }

  // Mesas que ya se quedaron atascadas así (en una fase de reparto o pago sin temporizador): se empieza ronda nueva.
  // Las apuestas de una mano a medias se devuelven.
  unstick() {
    if (this.phase === 'betting' || this.pending) return false
    for (const seat of this.seats) if (seat?.locked && this.phase !== 'settle') this.accounts.adjust(seat.token, seat.bet)
    this.newRound()
    this.broadcast()
    return true
  }
}
BlackjackRoom.prototype.onTimer = {
  ...Room.prototype.onTimer,
  bets() {
    for (const seat of this.seats) if (seat && !seat.locked && seat.connected && seat.sid) this.lock(seat)
    if (this.seats.some((s) => s?.locked)) this.deal()
    else this.afterBetChange()
  },
}
// Admin Abuse (banca.mjs): al pagar la ronda, la banca pone encima lo que toque. `abuse` lo deja withTable al abrir la mesa.
BlackjackRoom.prototype.settle = function settle() {
  Room.prototype.settle.call(this)
  // Lo que la mesa pierde contra la banca va a la jaula del bingo (withTable lo apunta al guardar; no se guarda en la mesa).
  // Se cuenta antes del Admin Abuse: con «gratis» la banca te lo devuelve, pero la jaula crece igual.
  for (const seat of this.seats) if (seat?.locked && seat.bet > seat.paid) this.lost = (this.lost ?? 0) + seat.bet - seat.paid
  let changed = false
  for (const seat of this.seats) {
    if (!seat?.locked) continue
    const extra = abuseExtra(this.abuse, 'blackjack', seat.paid - seat.bet)
    if (!extra) continue
    this.accounts.adjust(seat.token, extra)
    seat.paid += extra
    changed = true
  }
  if (changed) this.broadcast()
}

// Póker con Admin Abuse: tras repartir el bote, la banca multiplica lo ganado (o devuelve lo perdido) a cada uno.
class PokerTableRoom extends PokerRoom {
  pay(won, byFold, pots) {
    super.pay(won, byFold, pots)
    this.seats.forEach((seat, index) => {
      if (!seat?.inHand) return
      const extra = abuseExtra(this.abuse, 'poker', (won.get(index) ?? 0) - seat.total)
      if (!extra) return
      this.accounts.adjust(seat.token, extra)
      if (won.has(index)) {
        seat.won += extra
        const winner = this.result.winners.find((w) => w.seat === index)
        if (winner) winner.amount += extra
      }
    })
  }
}

// Ajedrez con Admin Abuse: al acabar la partida, la banca multiplica lo ganado (o devuelve lo perdido) a cada uno.
class ChessTableRoom extends ChessRoom {
  finish(winner, reason) {
    super.finish(winner, reason)
    this.seats.forEach((seat, index) => {
      if (!seat) return
      const extra = abuseExtra(this.abuse, 'chess', seat.won - this.stake)
      if (!extra) return
      this.accounts.adjust(seat.token, extra)
      seat.won += extra
      this.result.won[index] += extra
    })
  }
}

const ROOMS = { blackjack: BlackjackRoom, poker: PokerTableRoom, chess: ChessTableRoom }

// Al empezar ronda el motor libera el asiento de quien lleva un rato desconectado, pero no avisa a su sesión, que se queda
// creyendo que sigue sentada: al volver no la dejaba sentarse otra vez (el motor contesta BAD_PHASE). Se corrige al abrir.
function fixSeats(room) {
  if (room.game !== 'blackjack') return
  for (const m of room.members.values()) if (m.seat !== null && room.seats[m.seat]?.sid !== m.id) m.seat = null
}

const ROOM_STATIC = new Set(['accounts', 'randomInt', 'onClose', 'now', 'timers', 'timer', 'sweeper', 'members', 'abuse', 'lost'])

// --- saldos dentro de una transacción: el motor usa get/adjust como con el archivo de juegos original ---

class TxAccounts {
  constructor(rows, day) {
    this.day = day
    this.map = new Map(rows.map((r) => [r.usuario_id, { balance: Number(r.saldo), days: readDays(r.dias), played: r.jugado }]))
    this.dirty = new Set()
  }
  get(token) {
    return this.map.get(token)
  }
  adjust(token, delta) {
    const acc = this.map.get(token)
    if (!acc) return
    acc.balance += delta
    acc.days[this.day] = acc.balance
    acc.played = true
    this.dirty.add(token)
  }
}

// --- mesa <-> JSON ---

function serialize(room) {
  const data = {}
  for (const [key, value] of Object.entries(room)) if (!ROOM_STATIC.has(key)) data[key] = value
  const members = [...room.members.values()].map(({ id, token, name, avatar, seat, seen, away }) => ({ id, token, name, avatar, seat, seen, away }))
  return { room: data, members }
}

function restore(row, accounts, now) {
  const Kind = ROOMS[row.juego]
  const room = Object.create(Kind.prototype)
  Object.assign(room, row.estado.room, { accounts, randomInt, now, timers: storedTimers, timer: null, onClose: null })
  room.members = new Map()
  for (const m of row.estado.members) room.members.set(m.id, { ...m, ws: null, room })
  fixSeats(room)
  return room
}

function tokensOf(estado) {
  const tokens = new Set(estado.members.map((m) => m.token))
  for (const seat of estado.room.seats) if (seat) tokens.add(seat.token)
  return tokens
}

// Asientos tal y como los verá quien entre ahora: quien lleva más de GONE_MS sin dar señales sale al abrir la mesa
// (null) y quien lleva más de AWAY_MS se marca como ausente. Así el selector no muestra fantasmas.
function liveSeats(estado, now) {
  const seen = new Map(estado.members.map((m) => [m.id, m.seen]))
  return estado.room.seats.map((seat) => {
    if (!seat) return null
    const idle = seen.has(seat.sid) ? now - seen.get(seat.sid) : Infinity
    if (idle > GONE_MS) return null
    return { ...seat, away: idle > AWAY_MS }
  })
}

// Resumen de una mesa para el selector (sin abrirla).
function summary(row, now) {
  const { room, members } = row.estado
  const seated = liveSeats(row.estado, now).filter(Boolean)
  const present = seated.filter((seat) => !seat.away)
  return {
    code: row.codigo,
    game: row.juego,
    label: row.etiqueta,
    seats: room.seats.length,
    players: present.length,
    away: seated.length - present.length,
    spectators: members.filter((m) => m.seat === null && now - m.seen < AWAY_MS).length,
    people: present.map((seat) => ({ name: seat.name, avatar: seat.avatar ?? null })),
    phase: room.phase,
  }
}

function newCode(taken) {
  for (let i = 0; i < 50; i++) {
    const code = Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('')
    if (!taken.has(code)) return code
  }
  throw new JuegosError('ROOM_FULL')
}

const cleanText = (value) =>
  typeof value === 'string'
    ? [...value]
        .filter((ch) => ch >= ' ')
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200)
    : ''

// db: { query(sql, params), tx(fn) } · ping(topic) avisa por Realtime · now() reloj · secret: semilla de la ruleta en vivo
// Guarda el último resultado de fn durante ms (en la memoria de esta instancia). Se guarda el valor, no la promesa: en un
// Worker, una petición no puede quedarse esperando una consulta que lanzó otra.
function memo(ms, fn) {
  let cached = null
  return async () => {
    if (cached && Date.now() - cached.at < ms) return cached.value
    const value = await fn()
    cached = { at: Date.now(), value }
    return value
  }
}

export function createJuegos({ db, ping = async () => {}, now = Date.now, secret = 'topcode-juegos' }) {
  let schemaReady = null
  let knownWeek = null
  // El bote del bingo (bingo se crea más abajo; la banca solo lo usa cuando llega una petición).
  const banca = createBanca({ db, ping, now, credit, pot: () => bingo, hacienda: () => hacienda })

  function ensureSchema() {
    schemaReady ??= (async () => {
      // La tabla más nueva: si falta, se ejecuta el esquema entero (es idempotente).
      // Cada consulta es un viaje a la base de datos y esto va antes de la primera respuesta de cada arranque: se mira
      // de una vez si queda algo que devolver y solo entonces se hacen las devoluciones (casi siempre no queda nada).
      const { rows } = await db.query(
        `select to_regclass('public.juegos_bingo') is not null as ok, to_regclass('public.juegos_duelos') is not null as duelos,
                to_regclass('public.juegos_pase') is not null as pase`,
      )
      if (!rows[0].ok) await db.query(SCHEMA_SQL)
      // El pase de la Season 4 llegó después: en una base de datos de antes se crea su tabla (supabase/migracion_juegos_pase.sql).
      if (!rows[0].pase) await db.query(PASE_SQL)
      const pending = (
        await db.query(
          `with meta as (insert into public.juegos_meta (id, semana) values (1, $1) on conflict (id) do nothing)
           select exists(select 1 from public.juegos_solo where juego in ('blackjack', 'bribe', 'wheel', 'dungeon', 'dig', 'dive', 'regatta')) as solo,
                  coalesce((select pg_get_constraintdef(oid) like '%''soga''%' from pg_constraint where conname = 'juegos_solo_juego_check'), true) as solo_check,
                  ${rows[0].duelos ? `exists(select 1 from public.juegos_duelos where estado = 'abierto')` : 'false'} as duelos,
                  exists(select 1 from public.juegos_solo where juego = 'criaturas' or (juego = 'taller' and estado ? 'units'))
                    or exists(select 1 from public.juegos_mesas where juego = 'criaturas') as s5_retirados`,
          [weekOf(now()).key],
        )
      ).rows[0]
      if (pending.solo) {
        await refundSoloBlackjack()
        await refundRetired('bribe', (estado) => (estado?.bet > 0 ? estado.bet : 0))
        await refundRetired('wheel', (estado) => (estado?.bets ?? []).reduce((sum, b) => sum + (b.amount ?? 0), 0))
        // El Laberinto se retiró en la Season 4 (lo sustituye Pez Gordo): se devuelve el botín de la partida a medias.
        await refundRetired('dungeon', (estado) => (estado?.bet > 0 ? Math.max(estado.bet, estado.pot ?? 0) : 0))
        // Tesoro en la Arena y Apnea se retiraron en la Season 5 (los sustituyen la Lotería y el Trineo). En la Arena se
        // devuelve lo que valían los hoyos ya cavados (como mínimo la apuesta); en la Apnea, la apuesta de la inmersión.
        await refundRetired('dig', (estado) => (estado?.bet > 0 ? Math.max(estado.bet, arenaWorth(estado)) : 0))
        await refundRetired('dive', (estado) => (estado?.bet > 0 && estado.start != null ? estado.bet : 0))
        // La Regata se retiró también en la Season 5 (dejó sitio al Taller): se devuelve lo apostado en
        // una regata que no llegó a pagarse.
        await refundRetired('regatta', (estado) => (estado?.bets ?? []).reduce((sum, b) => sum + (b.amount ?? 0), 0))
      }
      // Pez Gordo, el Trineo y el Taller guardan su partida en juegos_solo: en una base de datos de antes se amplía el
      // check (migracion_juegos_pez.sql, migracion_juegos_trineo.sql y migracion_juegos_taller_criaturas.sql).
      if (!pending.solo_check) await db.query(SOLO_CHECK_SQL)
      if (pending.duelos) await refundDuels()
      if (pending.s5_retirados) await retireS5()
    })().catch((error) => {
      schemaReady = null
      throw error
    })
    return schemaReady
  }

  // El blackjack en solitario ya no existe (lo sustituye Plinko): una mano que se quedó a medias ya no se puede terminar,
  // así que se devuelve lo apostado en ella y se borra. Las partidas de semanas pasadas ya las borró el reinicio, y tras
  // la primera vez no queda ninguna fila: en cada arranque es una consulta que no encuentra nada.
  async function refundSoloBlackjack() {
    await db.tx(async (q) => {
      const { rows } = await q(`select usuario_id, estado from public.juegos_solo where juego = 'blackjack' for update`)
      for (const { usuario_id: id, estado } of rows) {
        const stake = estado?.phase && estado.phase !== 'idle' ? (estado.hands ?? []).reduce((sum, hand) => sum + (hand.bet ?? 0), 0) : 0
        if (stake > 0) await q(`update public.juegos_cuentas set saldo = saldo + $2 where usuario_id = $1`, [id, stake])
      }
      if (rows.length) await q(`delete from public.juegos_solo where juego = 'blackjack'`)
    })
  }

  // Criaturas de las Islas (y su mesa de duelos) se retiraron, y el Taller de Papá Noel pasó de invertir saldo a ser un
  // tycoon con galletas. Al arrancar: se devuelve la apuesta de un combate de Criaturas a medias, la de un duelo en
  // marcha a cada uno, y lo invertido esta semana en el Taller viejo (lo ya recogido se queda); y se borra lo viejo.
  async function retireS5() {
    const week = weekOf(now()).key
    await refundRetired('criaturas', (estado) => (estado?.battle?.bet > 0 && estado.battle.week === week ? estado.battle.bet : 0))
    await db.tx(async (q) => {
      const old = (await q(`select usuario_id, estado from public.juegos_solo where juego = 'taller' and estado ? 'units' for update`)).rows
      for (const { usuario_id: id, estado } of old) {
        const back = estado.week === week ? Math.max(0, Number(estado.invested) || 0) : 0
        if (back > 0) await q(`update public.juegos_cuentas set saldo = saldo + $2 where usuario_id = $1`, [id, back])
      }
      if (old.length) await q(`delete from public.juegos_solo where juego = 'taller' and estado ? 'units'`)
      const tables = (await q(`select codigo, estado from public.juegos_mesas where juego = 'criaturas' for update`)).rows
      for (const { codigo, estado } of tables) {
        const room = estado.room
        if (room.phase === 'playing' && room.stake > 0) {
          for (const seat of room.seats) if (seat) await q(`update public.juegos_cuentas set saldo = saldo + $2 where usuario_id = $1`, [seat.token, room.stake])
        }
        await q(`update public.juegos_cuentas set mesa = null where mesa = $1`, [codigo])
        await q(`delete from public.juegos_mesas where codigo = $1`, [codigo])
      }
    })
  }

  // Un juego en solitario que se retiró (Sobornos y la Rueda): a quien tenía una partida a medias se le
  // devuelve lo apostado y se borra. Tras la primera vez no queda ninguna fila.
  async function refundRetired(game, stakeOf) {
    await db.tx(async (q) => {
      const { rows } = await q(`select usuario_id, estado from public.juegos_solo where juego = $1 for update`, [game])
      for (const { usuario_id: id, estado } of rows) {
        const stake = stakeOf(estado)
        if (stake > 0) await q(`update public.juegos_cuentas set saldo = saldo + $2 where usuario_id = $1`, [id, stake])
      }
      if (rows.length) await q(`delete from public.juegos_solo where juego = $1`, [game])
    })
  }

  // Los Duelos se retiraron (los sustituye el Ascensor): los retos que seguían abiertos tenían la apuesta de quien retó
  // retenida, así que se cancelan y se le devuelve. La tabla juegos_duelos se queda con el historial. Tras la primera
  // vez no queda ningún reto abierto: en cada arranque es una consulta que no encuentra nada.
  async function refundDuels() {
    const { rows } = await db.query(`select to_regclass('public.juegos_duelos') is not null as ok`)
    if (!rows[0].ok) return
    await db.tx(async (q) => {
      const open = (await q(`update public.juegos_duelos set estado = 'cancelado', jugado = now() where estado = 'abierto' returning reta, apuesta`)).rows
      for (const r of open) await q(`update public.juegos_cuentas set saldo = saldo + $2 where usuario_id = $1`, [r.reta, Number(r.apuesta)])
    })
  }

  // Domingo 23:59: se guarda el podio y todos vuelven a 15.000 €.
  async function rollover(week) {
    if (knownWeek === week.key) return
    const { rows } = await db.query(`select semana from public.juegos_meta where id = 1`)
    if (rows[0]?.semana !== week.key) {
      await db.tx(async (q) => {
        const meta = (await q(`select semana, semana_pasada from public.juegos_meta where id = 1 for update`)).rows[0]
        if (meta.semana === week.key) return
        const podium = (
          await q(`select nombre as name, avatar, saldo as balance from public.juegos_cuentas where jugado order by saldo desc, nombre limit 3`)
        ).rows
        const lastWeek = podium.length ? { week: meta.semana, podium } : meta.semana_pasada
        await q(`update public.juegos_meta set semana = $1, semana_pasada = $2 where id = 1`, [week.key, lastWeek])
        await q(`update public.juegos_cuentas set saldo = $1, dias = $2::bigint[], jugado = false, hacienda = '{}'::jsonb`, [STARTING_BALANCE, pgArray(NO_DAYS)])
        await q(`delete from public.juegos_chat where creado < now() - interval '7 days'`)
        // El Taller (tycoon) dura toda la temporada: su fila se queda.
        await q(`delete from public.juegos_solo where juego <> 'taller'`)
        await banca.sweep(q)
        await bingo.sweep(q)
        await auction.sweep(q)
        await glass.sweep(q)
        await lift.sweep(q)
        await fishing.sweep(q)
        await fair.sweep(q)
        await rope.sweep(q)
      })
      await ping('juegos-lobby')
    }
    knownWeek = week.key
  }

  // Cuenta del jugador. «visto» (para el contador de conectados) se escribe como mucho cada TOUCH_S. Una lectura ligera
  // basta casi siempre; solo se escribe si la cuenta es nueva, pasaron TOUCH_S o cambió el nombre o el avatar.
  async function touchAccount(user) {
    const { rows } = await db.query(
      `select saldo, mesa, hacienda, nombre, avatar, visto < now() - make_interval(secs => $2::int) as viejo
       from public.juegos_cuentas where usuario_id = $1`,
      [user.id, TOUCH_S],
    )
    const row = rows[0]
    if (row && !row.viejo && row.nombre === user.name && (row.avatar ?? null) === (user.avatar ?? null)) return { saldo: row.saldo, mesa: row.mesa, hacienda: row.hacienda }
    const written = await db.query(
      `insert into public.juegos_cuentas (usuario_id, nombre, avatar) values ($1, $2, $3)
       on conflict (usuario_id) do update set nombre = excluded.nombre, avatar = excluded.avatar, visto = now()
       returning saldo, mesa, hacienda`,
      [user.id, user.name, user.avatar],
    )
    return written.rows[0]
  }

  // Lo que el selector enseña de una mesa, como texto para comparar antes y después de una jugada.
  function lobbyKey(code, row, estado, t) {
    return JSON.stringify(summary({ codigo: code, juego: row.juego, etiqueta: row.etiqueta, estado }, t))
  }

  // Abre la mesa con bloqueo, aplica fn(room, session) y la guarda si cambió algo.
  async function withTable(code, user, fn) {
    const t = now()
    const week = weekOf(t)
    const abuse = await banca.abuse()
    const outcome = await db.tx(async (q) => {
      const row = (await q(`select * from public.juegos_mesas where codigo = $1 for update`, [code])).rows[0]
      if (!row) throw new JuegosError('ROOM_NOT_FOUND')
      const lobbyBefore = lobbyKey(code, row, row.estado, t) // antes de restaurar: el motor puede tocar los asientos en su sitio
      const tokens = tokensOf(row.estado)
      tokens.add(user.id)
      const accRows = (
        await q(`select usuario_id, saldo, dias, jugado from public.juegos_cuentas where usuario_id = any($1::uuid[]) order by usuario_id for update`, [[...tokens]])
      ).rows
      const accounts = new TxAccounts(accRows, week.day)
      const room = restore(row, accounts, () => now())
      room.abuse = abuse
      const revBefore = room.rev
      let presence = false

      // Presencia: quien no da señales se marca ausente y, pasado un rato, sale de la mesa.
      const gone = []
      for (const member of [...room.members.values()]) {
        if (member.id === user.id) continue
        const idle = t - member.seen
        if (idle > GONE_MS) {
          room.leave(member)
          gone.push(member.id)
          presence = true
        } else if (idle > AWAY_MS && !member.away) {
          member.away = true
          room.disconnect(member)
          presence = true
        }
      }

      let session = room.members.get(user.id)
      // Latido: si lo guardado ya es viejo se escribe aunque no cambie nada más, para que quien espera solo no
      // parezca ausente cuando llegue otra persona.
      const touch = Boolean(session && t - session.seen > SEEN_SAVE_MS)
      if (session) {
        Object.assign(session, { name: user.name, avatar: user.avatar, seen: t })
        if (session.away) {
          session.away = false
          room.reconnect(session)
        }
      } else {
        session = { id: user.id, token: user.id, name: user.name, avatar: user.avatar, ws: null, room: null, seat: null, seen: t, away: false }
      }
      const wasIn = room.members.has(user.id)
      room.wake()
      room.unstick?.()
      fixSeats(room) // el wake() puede haber empezado una ronda nueva y liberado asientos
      const error = fn(room, session) ?? null
      if (room.lost > 0) await bingo.feed(q, room.lost)

      const changed = room.rev !== revBefore || presence
      let saved = null
      if (changed || touch) {
        saved = serialize(room)
        await q(`update public.juegos_mesas set estado = $2, version = version + 1, actualizado = now() where codigo = $1`, [code, saved])
        for (const token of accounts.dirty) {
          const acc = accounts.get(token)
          await q(`update public.juegos_cuentas set saldo = $2, dias = $3::bigint[], jugado = $4 where usuario_id = $1`, [token, acc.balance, pgArray(acc.days), acc.played])
        }
      }
      if (gone.length) await q(`update public.juegos_cuentas set mesa = null where usuario_id = any($1::uuid[]) and mesa = $2`, [gone, code])
      const inRoom = room.members.has(user.id)
      if (inRoom !== wasIn) await q(`update public.juegos_cuentas set mesa = $2 where usuario_id = $1`, [user.id, inRoom ? code : null])
      // Mesas extra vacías: se borran (la «Mesa 1» de cada juego se queda siempre).
      let deleted = false
      if (!row.persistente && room.members.size === 0 && room.seats.every((s) => !s)) {
        await q(`delete from public.juegos_mesas where codigo = $1`, [code])
        deleted = true
      }
      // El selector solo muestra asientos, presencia, fase y mirones: si eso no cambió no hace falta avisarle.
      const lobbyChanged = deleted || (saved !== null && lobbyKey(code, row, saved, t) !== lobbyBefore)
      return { error, changed, lobbyChanged, code, balance: accounts.get(user.id)?.balance, view: inRoom ? viewFor(room, user.id) : null }
    })
    // Ya con el commit hecho se avisa, sin esperar: quien llama lo espera (outcome.sent) junto a sus otras consultas.
    // Nunca rechaza: si el aviso falla, los clientes se ponen al día con su latido.
    if (outcome.changed) {
      outcome.sent = Promise.all([ping(`juegos-mesa-${code}`), outcome.lobbyChanged ? ping('juegos-lobby') : null]).catch(() => {})
    }
    return outcome
  }

  // Vista sin bloquear la mesa, para los latidos y los «tick» que llegan cuando no hay nada que hacer. Devuelve null
  // si hay que abrirla con bloqueo: un temporizador vencido, alguien a quien marcar como ausente o sacar, tu propio
  // latido por guardar, o si no estás en la mesa.
  async function peekTable(code, user) {
    const t = now()
    const row = (await db.query(`select * from public.juegos_mesas where codigo = $1`, [code])).rows[0]
    if (!row) return null
    const me = row.estado.members.find((m) => m.id === user.id)
    if (!me || me.away || t - me.seen > SEEN_SAVE_MS) return null
    if (row.estado.room.pending && row.estado.room.pending.at <= t) return null
    for (const m of row.estado.members) {
      const idle = t - m.seen
      if (m.id !== user.id && (idle > GONE_MS || (idle > AWAY_MS && !m.away))) return null
    }
    const tokens = [...tokensOf(row.estado)]
    const accRows = (await db.query(`select usuario_id, saldo, dias, jugado from public.juegos_cuentas where usuario_id = any($1::uuid[])`, [tokens])).rows
    const accounts = new TxAccounts(accRows, weekOf(t).day)
    const room = restore(row, accounts, () => now())
    return { error: null, changed: false, balance: accounts.get(user.id)?.balance, view: viewFor(room, user.id) }
  }

  function viewFor(room, userId) {
    const state = room.view(userId)
    // Cuándo hay que volver a llamar para que avance un temporizador (crupier, turnos, cuenta atrás…).
    state.wakeIn = room.pending ? Math.max(0, room.pending.at - now()) : null
    return state
  }

  async function chatSince(code, after) {
    if (!code) return []
    const { rows } = await db.query(
      `select id, usuario_id as "from", nombre as name, avatar, texto as text, extract(epoch from creado) * 1000 as at
       from public.juegos_chat where mesa = $1 and id > $2 order by id desc limit $3`,
      [code, Number(after) || 0, CHAT_KEEP],
    )
    return rows.reverse().map((r) => ({ ...r, id: Number(r.id), at: Number(r.at) }))
  }

  // Lo del selector que es igual para todos (mesas, conectados, bingo) se guarda LOBBY_MEMO_MS en esta instancia: es la
  // petición que más se repite y leer el estado de todas las mesas es lo que más CPU gasta (en el Worker se paga).
  const sharedLobby = memo(LOBBY_MEMO_MS, async () => {
    const t = now()
    await bingo.settleDue()
    await glass.settleDue() // partidas del Puente (retirado) que quedaran por pagar
    const [tables, online, jackpot] = await Promise.all([
      db.query(`select codigo, juego, etiqueta, numero, estado from public.juegos_mesas order by juego, numero`),
      db.query(`select count(*)::int as n from public.juegos_cuentas where visto > now() - make_interval(secs => $1::int)`, [ONLINE_MS / 1000]),
      bingo.summary(),
    ])
    return { tables: tables.rows.map((row) => summary(row, t)), online: online.rows[0].n, resetAt: weekOf(t).resetAt, bingo: jackpot, hidden: await banca.hidden() }
  })

  async function lobby(user) {
    const [shared, acc] = await Promise.all([
      sharedLobby(),
      db.query(`select saldo from public.juegos_cuentas where usuario_id = $1`, [user.id]),
    ])
    return { ...shared, balance: acc.rows[0]?.saldo ?? STARTING_BALANCE }
  }

  // Lo que tiene cada uno fuera del saldo (Hacienda no lo ve): las cartas (lo que darían al venderlas; las empeñadas,
  // menos lo que hay que devolver), lo invertido en la Inmobiliaria y la cuenta en Suiza.
  async function assetsOf(ids) {
    const out = new Map(ids.map((id) => [id, { cards: 0, inmo: 0, suiza: 0 }]))
    if (!ids.length) return out
    const [cards, estate, swiss] = await Promise.all([
      db.query(`select usuario_id, carta, origen, empeno from public.juegos_gacha_cartas where usuario_id = any($1::uuid[])`, [ids]),
      db.query(`select usuario_id, sum(invertido)::bigint as total from public.juegos_inmuebles where usuario_id = any($1::uuid[]) group by usuario_id`, [ids]),
      db.query(`select usuario_id, saldo from public.juegos_suiza where usuario_id = any($1::uuid[])`, [ids]),
    ])
    for (const r of cards.rows) out.get(r.usuario_id).cards += Math.max(0, priceOf(r.carta, r.origen) - Number(r.empeno?.devolver ?? 0))
    for (const r of estate.rows) out.get(r.usuario_id).inmo = Number(r.total)
    for (const r of swiss.rows) out.get(r.usuario_id).suiza = Number(r.saldo)
    return out
  }

  // La clasificación es la misma para todos (solo cambia quién eres): se guarda SCORES_MEMO_MS en esta instancia.
  const sharedScores = memo(SCORES_MEMO_MS, () => rankings())

  async function scores(user) {
    const out = await sharedScores()
    return { ...out, players: out.players.map(({ id, ...p }) => ({ ...p, me: id === user.id })) }
  }

  async function rankings() {
    const week = weekOf(now())
    const [rows, meta] = await Promise.all([
      db.query(
        `select usuario_id, nombre as name, avatar, saldo as balance, dias from public.juegos_cuentas
         where jugado order by saldo desc, nombre limit $1`,
        [MAX_SCORES],
      ),
      db.query(`select semana_pasada from public.juegos_meta where id = 1`),
    ])
    const ids = rows.rows.map((r) => r.usuario_id)
    const [assets, passLevels] = await Promise.all([assetsOf(ids), pase.levels(ids)])
    const players = rows.rows.map((r, i) => {
      let last = STARTING_BALANCE
      const days = readDays(r.dias).map((value, d) => {
        if (d > week.day) return null
        if (value !== null) last = value
        return last
      })
      return { id: r.usuario_id, rank: i + 1, name: r.name, avatar: r.avatar, balance: r.balance, days, assets: assets.get(r.usuario_id), pase: passLevels.get(r.usuario_id) ?? 0 }
    })
    return {
      week: { key: week.key, day: week.day, resetAt: week.resetAt },
      starting: STARTING_BALANCE,
      players,
      lastWeek: meta.rows[0]?.semana_pasada ?? null,
    }
  }

  // Elige mesa pública (o la crea) y entra.
  async function joinPublic(user, msg, current) {
    if (!GAMES.includes(msg.game)) throw new JuegosError('BAD_MESSAGE')
    const left = current ? await withTable(current, user, (room, session) => room.leave(session)).catch(() => null) : null
    try {
      const outcome = await joinTarget(user, msg)
      if (left?.sent) outcome.sent = Promise.all([left.sent, outcome.sent])
      return outcome
    } catch (error) {
      await left?.sent
      throw error
    }
  }

  async function joinTarget(user, msg) {
    const play = msg.as !== 'spectator'
    const all = (await db.query(`select codigo, juego, numero, estado from public.juegos_mesas`)).rows
    const t = now()
    // Los asientos de quien ya se fue cuentan como libres (salen de la mesa al entrar).
    const tables = all
      .filter((r) => r.juego === msg.game)
      .map((r) => ({ code: r.codigo, number: r.numero, seats: liveSeats(r.estado, t) }))
    let target = typeof msg.code === 'string' ? tables.find((r) => r.code === msg.code) : null
    if (target && play && !target.seats.some((s) => !s)) target = null
    target ??= pickTable(tables, play)
    if (!target && play) {
      // Todas llenas: se abre otra mesa («Mesa 2», «Mesa 3»…).
      if (tables.length >= MAX_PUBLIC_PER_GAME) throw new JuegosError('ROOM_FULL')
      const number = nextNumber(tables)
      target = { code: (await createTable(msg.game, number, new Set(all.map((r) => r.codigo)))) ?? null }
      if (!target.code) throw new JuegosError('BUSY')
    }
    if (!target) throw new JuegosError('ROOM_FULL')
    return withTable(target.code, user, (room, session) => room.join(session, play))
  }

  // Inserta una mesa pública vacía. Si otra petición creó ya ese número a la vez, no hace nada (índice único).
  async function createTable(game, number, taken) {
    const code = newCode(taken)
    const Kind = ROOMS[game]
    const label = `Mesa ${number}`
    const room = new Kind({ code, seats: PUBLIC_SEATS[game], accounts: new TxAccounts([], 0), randomInt, now: () => now(), label, persistent: number === 1, timers: storedTimers })
    room.number = number
    const { rows } = await db.query(
      `insert into public.juegos_mesas (codigo, juego, etiqueta, numero, persistente, estado) values ($1, $2, $3, $4, $5, $6)
       on conflict do nothing returning codigo`,
      [code, game, label, number, number === 1, serialize(room)],
    )
    return rows[0]?.codigo ?? null
  }

  // Devuelve un código de error o null. El límite de ritmo se mide con el reloj de la base de datos.
  async function postChat(user, code, text) {
    const clean = cleanText(text)
    if (!clean) return 'BAD_MESSAGE'
    const { rows } = await db.query(
      `select exists (select 1 from public.juegos_chat where usuario_id = $1 and creado > now() - make_interval(secs => $2::float)) as busy`,
      [user.id, CHAT_GAP_MS / 1000],
    )
    if (rows[0].busy) return 'RATE_LIMIT'
    await db.query(`insert into public.juegos_chat (mesa, usuario_id, nombre, avatar, texto) values ($1, $2, $3, $4, $5)`, [code, user.id, user.name, user.avatar, clean])
    // Aviso propio del chat: los demás piden solo los mensajes nuevos, no la mesa entera.
    await ping(`juegos-mesa-${code}`, 'chat')
    return null
  }

  // Lo apostado y lo ganado (o perdido) en la jugada que acaba de liquidarse, o null si no se liquidó ninguna.
  // Plinko y la Bola se liquidan en cada jugada; los demás, cuando aparece un «last» de otra ronda o partida.
  function settlementOf(game, msg, saved, out) {
    if (INSTANT.has(game)) return { stake: out.stake ?? msg.bet, net: out.delta }
    const last = out.saved?.last
    if (!last || last.round === saved?.last?.round) return null
    return { stake: last.stake, net: last.net }
  }

  // Una jugada en solitario: se bloquea tu cuenta, se sortea en el servidor y se guarda el saldo (cuenta en el Score).
  async function playSolo(user, msg) {
    const game = SOLO_GAMES[msg.t]
    const abuse = await banca.abuse()
    const t = now()
    const week = weekOf(t)
    const ctx = { now: t, secret, week: week.key, day: `${week.key}:${week.day}`, userId: user.id, luck: abuseLuck(abuse, game) }
    return db.tx(async (q) => {
      ctx.q = q // la carrera mira quién pilota cada coche dentro de la misma transacción
      const accRows = (await q(`select usuario_id, saldo, dias, jugado from public.juegos_cuentas where usuario_id = $1 for update`, [user.id])).rows
      const accounts = new TxAccounts(accRows, week.day)
      const balance = accounts.get(user.id).balance
      // Plinko y la Bola no guardan nada entre jugadas.
      const saved =
        INSTANT.has(game)
          ? null
          : ((await q(`select estado from public.juegos_solo where usuario_id = $1 and juego = $2 for update`, [user.id, game])).rows[0]?.estado ?? null)
      const out = await SOLO_PLAY[game](msg, balance, saved, randomInt, ctx)
      if (out.error) return out
      // Al liquidarse una jugada: el Admin Abuse y la jaula del bingo.
      const settled = settlementOf(game, msg, saved, out)
      if (settled) {
        // Admin Abuse: la banca multiplica lo ganado o devuelve lo perdido en esta jugada.
        const extra = abuseExtra(abuse, game, settled.net)
        if (extra) {
          out.delta += extra
          out.abuse = { modo: abuse.modo, extra }
        }
        // Lo que se pierde contra el casino va a la jaula del bingo. El Admin Abuse no lo resta: con «gratis» la banca
        // te devuelve lo perdido, pero la jaula crece igual.
        await bingo.feed(q, -settled.net)
        out.settled = settled
      }
      // Toda jugada cuenta para el Score, también la que te deja igual (entras en la clasificación y se anota el día).
      if (out.played || out.delta) accounts.adjust(user.id, out.delta)
      for (const token of accounts.dirty) {
        const acc = accounts.get(token)
        await q(`update public.juegos_cuentas set saldo = $2, dias = $3::bigint[], jugado = $4 where usuario_id = $1`, [token, acc.balance, pgArray(acc.days), acc.played])
      }
      if (out.saved) {
        await q(
          `insert into public.juegos_solo (usuario_id, juego, estado) values ($1, $2, $3)
           on conflict (usuario_id, juego) do update set estado = excluded.estado, actualizado = now()`,
          [user.id, game, out.saved],
        )
      }
      return out
    })
  }

  // Dinero de la banca a una lista de usuarios ({ id, nombre, avatar_url }), dentro de su transacción. Crea la cuenta de
  // Juegos si alguien aún no tiene. Cuenta en el Score como cualquier saldo, pero no apunta a nadie como «ha jugado».
  async function credit(q, list, amount) {
    const week = weekOf(now())
    for (const u of list) {
      await q(`insert into public.juegos_cuentas (usuario_id, nombre, avatar) values ($1, $2, $3) on conflict (usuario_id) do nothing`, [
        u.id,
        shortName(u.nombre) || 'Jugador',
        safeAvatar(u.avatar_url),
      ])
    }
    const ids = list.map((u) => u.id)
    const rows = (await q(`select usuario_id, saldo, dias, jugado from public.juegos_cuentas where usuario_id = any($1::uuid[]) order by usuario_id for update`, [ids])).rows
    const accounts = new TxAccounts(rows, week.day)
    for (const id of ids) {
      const acc = accounts.get(id)
      const played = acc.played
      accounts.adjust(id, amount)
      acc.played = played
      await q(`update public.juegos_cuentas set saldo = $2, dias = $3::bigint[] where usuario_id = $1`, [id, acc.balance, pgArray(acc.days)])
    }
  }

  // Mueve saldo de varias cuentas dentro de una transacción ({ id: delta }), con el registro del día (cuenta en el Score).
  // Con check, no mueve nada si a alguien no le llega para lo que se le quita, y devuelve false.
  async function move(q, deltas, check = false) {
    const ids = Object.keys(deltas)
    const week = weekOf(now())
    const rows = (await q(`select usuario_id, saldo, dias, jugado from public.juegos_cuentas where usuario_id = any($1::uuid[]) order by usuario_id for update`, [ids])).rows
    const accounts = new TxAccounts(rows, week.day)
    if (check && ids.some((id) => !accounts.get(id) || accounts.get(id).balance + deltas[id] < 0)) return false
    for (const id of ids) {
      if (!accounts.get(id)) continue
      accounts.adjust(id, deltas[id])
      const acc = accounts.get(id)
      await q(`update public.juegos_cuentas set saldo = $2, dias = $3::bigint[], jugado = $4 where usuario_id = $1`, [id, acc.balance, pgArray(acc.days), acc.played])
    }
    return true
  }
  const bingo = createBingo({ db, now, secret, move, abuse: () => banca.abuse() })
  const auction = createAuction({ db, now, secret, move, feed: (q, amount) => bingo.feed(q, amount), abuse: () => banca.abuse(), ping })
  const glass = createBridge({ db, now, secret, move, feed: (q, amount) => bingo.feed(q, amount), abuse: () => banca.abuse() })
  const lift = createElevator({ db, now, secret, move, feed: (q, amount) => bingo.feed(q, amount), abuse: () => banca.abuse() })
  const fishing = createPesca({ db, now, secret, move })
  const fair = createFeria({ db, now, secret, move, feed: (q, amount) => bingo.feed(q, amount) })
  const rope = createSoga({ db, now, move })
  const estate = createInmobiliaria({ db, now, move, ping })
  const swiss = createSuiza({ db, now, move, feed: (q, amount) => bingo.feed(q, amount) })
  const hacienda = createHacienda({ db, now, secret, move, feed: (q, amount) => bingo.feed(q, amount), ping })

  // Cobro del gacha dentro de su transacción, con el mismo registro que las jugadas (cuenta en el Score).
  // Devuelve el saldo nuevo, o null si no llega.
  async function charge(q, userId, amount) {
    // Sin Admin Abuse: con «gratis» el gacha no cobraba, y como las cartas se venden casi por lo que cuestan, tirar y
    // vender (o empeñar y recuperar gratis) era dinero infinito.
    const week = weekOf(now())
    const rows = (await q(`select usuario_id, saldo, dias, jugado from public.juegos_cuentas where usuario_id = $1 for update`, [userId])).rows
    const accounts = new TxAccounts(rows, week.day)
    if (!accounts.get(userId) || accounts.get(userId).balance < amount) return null
    accounts.adjust(userId, -amount)
    const acc = accounts.get(userId)
    await q(`update public.juegos_cuentas set saldo = $2, dias = $3::bigint[], jugado = $4 where usuario_id = $1`, [userId, acc.balance, pgArray(acc.days), acc.played])
    return acc.balance
  }
  const pase = createPase({ db, now, secret, move, hidden: () => banca.hiddenNow() })
  const gacha = createGacha({ db, ping, now, charge, jaula: (q, amount) => bingo.feed(q, amount) })

  // Jugadores con apuesta en una ronda de la ruleta o el cohete en vivo (la ronda se queda anotada aunque ya se haya pagado).
  async function soloPlayers(game, round) {
    const { rows } = await db.query(
      `select count(*)::int as n from public.juegos_solo where juego = $2 and estado->>'round' = $1
         and (jsonb_array_length(coalesce(estado->'bets', '[]'::jsonb)) > 0 or coalesce((estado->>'bet')::bigint, 0) > 0
              or estado->'last'->>'round' = $1)`,
      [String(round), game],
    )
    return rows[0].n
  }

  // Clasificación del día de la Torre o del Atraco: el mejor cobro de cada uno hoy (se guarda en su partida).
  async function dayRanking(game, userId) {
    const week = weekOf(now())
    const { rows } = await db.query(
      `select c.nombre as name, c.avatar, (s.estado->'best'->>'mult')::float as mult, (s.estado->'best'->>'payout')::bigint as payout,
              s.estado->'best'->>'mode' as mode, s.usuario_id = $2 as me
       from public.juegos_solo s join public.juegos_cuentas c on c.usuario_id = s.usuario_id
       where s.juego = $3 and s.estado->'best'->>'day' = $1
       order by mult desc, payout desc limit 5`,
      [`${week.key}:${week.day}`, userId, game],
    )
    return rows.map((r) => ({ name: r.name, avatar: r.avatar ?? null, mult: r.mult, payout: Number(r.payout), mode: r.mode, me: r.me }))
  }

  // Pilotos de una carrera: quién lleva cada coche (los demás los lleva la IA).
  async function raceSeats(round) {
    const { rows } = await db.query(
      `select (s.estado->>'seat')::int as car, c.nombre as name, c.avatar
       from public.juegos_solo s join public.juegos_cuentas c on c.usuario_id = s.usuario_id
       where s.juego = 'race' and s.estado->>'seatRound' = $1 and s.estado->>'seat' is not null`,
      [String(round)],
    )
    return rows.map((r) => ({ car: r.car, name: r.name, avatar: r.avatar ?? null }))
  }

  // Quién ganó en una ronda ya jugada de la ruleta o el cohete (para anunciarlo a todos), de más a menos.
  async function soloWinners(game, round, userId) {
    const { rows } = await db.query(
      `select c.nombre as name, (s.estado->'last'->>'net')::bigint as amount, (s.estado->'last'->>'mult')::int as mult,
              s.usuario_id = $2 as me
       from public.juegos_solo s join public.juegos_cuentas c on c.usuario_id = s.usuario_id
       where s.juego = $3 and s.estado->'last'->>'round' = $1 and (s.estado->'last'->>'net')::bigint > 0
       order by amount desc limit 5`,
      [String(round), userId, game],
    )
    return rows.map((r) => ({ name: r.name, amount: Number(r.amount), mult: r.mult, me: r.me }))
  }

  // Ruleta y cohete en vivo: ponerse al día («sync») no bloquea nada si no hay apuesta que pagar; lo demás pasa por playSolo.
  const LIVE_SOLO = {
    solo_roulette: { game: 'roulette', due: rouletteDue, view: rouletteView },
    solo_crash: { game: 'crash', due: (saved, t) => crashDue(saved, t, secret), view: crashView },
    solo_race: { game: 'race', due: (saved, t) => raceDue(saved, t, secret), view: raceView },
  }

  // Acciones que se aplican a la mesa en la que estás.
  const TABLE_ACTIONS = {
    view: () => null,
    tick: () => null,
    sit: (room, s, msg) => room.sit(s, msg.seat),
    stand_up: (room, s) => room.standUp(s),
    bet: (room, s, msg) => (room.bet ? room.bet(s, msg.amount) : 'BAD_MESSAGE'),
    ready: (room, s) => (room.ready ? room.ready(s) : 'BAD_MESSAGE'),
    action: (room, s, msg) => room.action(s, msg.kind, msg.amount),
    move: (room, s, msg) => (room.move ? room.move(s, msg.from, msg.to, msg.promo) : 'BAD_MESSAGE'),
    rebuy: () => 'BROKE',
    kick: () => 'NOT_HOST',
    leave_room: (room, s) => room.leave(s),
  }

  // Jugadores de la ronda y, si se piden, ganadores de una ronda ya jugada.
  async function liveExtras(game, msg, reply) {
    reply.solo.players = await soloPlayers(game, reply.solo.round)
    if (game === 'race') reply.solo.seats = await raceSeats(reply.solo.round)
    if (Number.isSafeInteger(msg.winners)) reply.solo.winners = await soloWinners(game, msg.winners, reply.me.id)
  }

  // Lo que se puede hacer desde la cárcel: mirar, hablar y levantarse de la mesa.
  const JAIL_FREE = new Set(['hello', 'lobby', 'scores', 'chat', 'chat_poll', 'view', 'tick', 'leave_room', 'stand_up'])
  const JAIL_FREE_ACTIONS = new Set(['sync', 'wait', 'estado', 'coleccion', 'ranking', 'cartas', 'lista', 'cancelar'])
  const jailFree = (msg) => JAIL_FREE.has(msg.t) || JAIL_FREE_ACTIONS.has(msg.a)

  // Punto de entrada: una petición del navegador. Devuelve lo que el cliente debe actualizar.
  async function handle(user, msg) {
    if (!msg || typeof msg.t !== 'string') throw new JuegosError('BAD_MESSAGE')
    await warm()
    // Deja leídos el Admin Abuse y los juegos ocultos para lo que los mira dentro de una transacción (gacha, pase).
    await Promise.all([banca.abuse(), banca.hidden()])
    // La banca (avisos y panel del master) va aparte: no toca la cuenta ni cuenta como actividad en las mesas.
    if (msg.t.startsWith('banca')) {
      const out = await banca.handle(user, msg)
      if (out.error) throw new JuegosError(out.error)
      return out
    }
    const account = await touchAccount(user)
    // Hacienda pasa antes de la jugada: la declaración al llegar a un tramo nuevo o una inspección sorpresa.
    const taxed = await hacienda.check(user, account)
    if (taxed !== null) account.saldo = taxed
    // En la cárcel (soborno a Hacienda que salió mal) solo se puede mirar: nada que mueva dinero ni te siente en una mesa.
    if (jailedUntil(account.hacienda, now()) && !jailFree(msg)) throw new JuegosError('JAILED')
    const me = { id: user.id, name: user.name, avatar: user.avatar, balance: account.saldo, auth: true, privateRooms: false }
    const reply = { me }

    const tableReply = async (outcome, code) => {
      reply.state = outcome.view
      if (outcome.error) reply.error = { code: outcome.error, message: ERRORS[outcome.error] ?? 'Error.' }
      // Chat y aviso de Realtime a la vez. «noChat» (solo en «view») lo manda el cliente al reaccionar a un «cambio»:
      // el chat tiene su propio aviso y su latido. Sin la bandera, el comportamiento de siempre.
      const wantChat = Boolean(outcome.view) && !(msg.t === 'view' && msg.noChat === true)
      const [chat] = await Promise.all([wantChat ? chatSince(code, msg.chatAfter) : null, outcome.sent])
      if (wantChat) reply.chat = chat
      if (outcome.balance !== undefined) me.balance = outcome.balance
      return reply
    }

    switch (msg.t) {
      case 'hello':
        if (account.mesa) {
          try {
            return await tableReply(await withTable(account.mesa, user, () => null), account.mesa)
          } catch (error) {
            if (!(error instanceof JuegosError)) throw error
            await db.query(`update public.juegos_cuentas set mesa = null where usuario_id = $1`, [user.id])
          }
        }
        reply.state = null
        reply.lobby = await lobby(user)
        return reply
      case 'lobby':
        // { scores: true }: el sondeo del selector trae también el Score, en la misma petición.
        ;[reply.lobby, reply.scores] = await Promise.all([lobby(user), msg.scores === true ? scores(user) : undefined])
        if (reply.scores === undefined) delete reply.scores
        return reply
      case 'scores':
        reply.scores = await scores(user)
        return reply
      case 'join_public': {
        const outcome = await joinPublic(user, msg, account.mesa)
        return tableReply(outcome, outcome.code)
      }
      case 'chat': {
        if (!account.mesa) throw new JuegosError('BAD_PHASE')
        const error = await postChat(user, account.mesa, msg.text)
        reply.chat = await chatSince(account.mesa, msg.chatAfter)
        if (error) reply.error = { code: error, message: ERRORS[error] }
        return reply
      }
      case 'solo_roulette':
      case 'solo_crash':
      case 'solo_race': {
        const live = LIVE_SOLO[msg.t]
        let play = msg
        // Espera larga del cohete: se responde justo cuando explota (sin tocar la BD mientras tanto), así cada
        // navegador hace una petición por vuelo en vez de preguntar cada poco si ya explotó.
        if (msg.t === 'solo_crash' && msg.a === 'wait') {
          const wait = Math.min(crashWaitMs(secret, now()), CRASH_WAIT_MAX_MS)
          if (wait > 0) await sleep(wait + CRASH_WAIT_PAD_MS)
          play = { ...msg, a: 'sync' }
        }
        if (play.a === 'sync') {
          const saved = (await db.query(`select estado from public.juegos_solo where usuario_id = $1 and juego = $2`, [user.id, live.game])).rows[0]?.estado
          const t = now()
          if (!live.due(saved, t)) {
            reply.solo = live.view(saved, account.saldo, { now: t, secret })
            await liveExtras(live.game, msg, reply)
            return reply
          }
        }
        const out = await playSolo(user, play)
        if (out.error) reply.error = { code: out.error, message: ERRORS[out.error] }
        else reply.solo = out.result
        if (out.abuse) reply.abuse = out.abuse
        if (out.settled) reply.paseEvent = await pase.record(user.id, live.game, { win: out.settled.net > 0 })
        me.balance = (await db.query(`select saldo from public.juegos_cuentas where usuario_id = $1`, [user.id])).rows[0].saldo
        if (reply.solo) await liveExtras(live.game, msg, reply)
        return reply
      }
      case 'solo_fish':
      case 'solo_loteria':
      case 'solo_trineo':
      case 'solo_taller':
      case 'solo_plinko':
      case 'solo_hilo':
      case 'solo_frog':
      case 'solo_tower':
      case 'solo_heist': {
        const out = await playSolo(user, msg)
        if (out.error) reply.error = { code: out.error, message: ERRORS[out.error] }
        else reply.solo = out.result
        if (out.settled) reply.paseEvent = await pase.record(user.id, SOLO_GAMES[msg.t], { win: out.settled.net > 0 })
        // El Taller no tiene jugadas que se liquiden: para el pase cuenta cada vez que canjeas galletas.
        else if (out.swap) reply.paseEvent = await pase.record(user.id, 'taller', { win: true })
        if (['solo_tower', 'solo_heist', 'solo_fish', 'solo_trineo'].includes(msg.t) && reply.solo) reply.solo.ranking = await dayRanking(SOLO_GAMES[msg.t], user.id)
        if (out.abuse) reply.abuse = out.abuse
        me.balance = (await db.query(`select saldo from public.juegos_cuentas where usuario_id = $1`, [user.id])).rows[0].saldo
        return reply
      }
      case 'bingo': {
        await bingo.handle(user, msg, reply)
        if (reply.error) reply.error.message = ERRORS[reply.error.code] ?? 'Error.'
        else if (msg.a === 'buy') reply.paseEvent = await pase.record(user.id, 'bingo')
        return reply
      }
      case 'bridge': {
        // El Puente de Cristal se retiró en la Season 4: ya no se puede entrar, pero las partidas que quedaran se pagan.
        if (msg.a === 'join') throw new JuegosError('BAD_MESSAGE')
        await glass.handle(user, msg, reply)
        if (reply.error) reply.error.message = ERRORS[reply.error.code] ?? 'Error.'
        else if (msg.a === 'join') reply.paseEvent = await pase.record(user.id, 'bridge')
        return reply
      }
      case 'auction': {
        await auction.handle(user, msg, reply)
        if (reply.error) reply.error.message = ERRORS[reply.error.code] ?? 'Error.'
        else if (msg.a === 'bid') reply.paseEvent = await pase.record(user.id, 'auction')
        return reply
      }
      case 'elevator': {
        await lift.handle(user, msg, reply)
        if (reply.error) reply.error.message = ERRORS[reply.error.code] ?? 'Error.'
        else if (msg.a === 'join') reply.paseEvent = await pase.record(user.id, 'elevator')
        return reply
      }
      case 'pesca': {
        const changed = await fishing.handle(user, msg, reply)
        if (reply.error) reply.error.message = ERRORS[reply.error.code] ?? 'Error.'
        else if (msg.a === 'join') reply.paseEvent = await pase.record(user.id, 'pesca')
        if (changed) await ping(PESCA_TOPIC).catch(() => {})
        return reply
      }
      case 'feria': {
        const changed = await fair.handle(user, msg, reply)
        if (reply.error) reply.error.message = ERRORS[reply.error.code] ?? 'Error.'
        else if (msg.a === 'join') reply.paseEvent = await pase.record(user.id, 'feria')
        if (changed) await ping(FERIA_TOPIC).catch(() => {})
        return reply
      }
      case 'soga': {
        const changed = await rope.handle(user, msg, reply)
        if (reply.error) reply.error.message = ERRORS[reply.error.code] ?? 'Error.'
        else if (msg.a === 'join') reply.paseEvent = await pase.record(user.id, 'soga')
        if (changed) await ping(SOGA_TOPIC).catch(() => {})
        return reply
      }
      case 'inmo': {
        await estate.handle(user, msg, reply)
        if (reply.error) reply.error.message = ERRORS[reply.error.code] ?? 'Error.'
        me.balance = (await db.query(`select saldo from public.juegos_cuentas where usuario_id = $1`, [user.id])).rows[0].saldo
        return reply
      }
      case 'suiza': {
        await swiss.handle(user, msg, reply)
        if (reply.error) reply.error.message = ERRORS[reply.error.code] ?? 'Error.'
        me.balance = (await db.query(`select saldo from public.juegos_cuentas where usuario_id = $1`, [user.id])).rows[0].saldo
        return reply
      }
      case 'gacha': {
        const out = await gacha.handle(user, msg)
        if (out.error) {
          reply.error = { code: out.error, message: ERRORS[out.error] ?? 'Error.' }
          delete out.error
        }
        reply.gacha = out
        if (msg.a === 'tirar' && out.result && !reply.error) reply.paseEvent = await pase.record(user.id, 'gacha')
        if (out.result || reply.error) me.balance = (await db.query(`select saldo from public.juegos_cuentas where usuario_id = $1`, [user.id])).rows[0].saldo
        return reply
      }
      case 'pase': {
        await pase.handle(user, msg, reply)
        if (reply.error) reply.error.message = PASE_ERRORS[reply.error.code] ?? ERRORS[reply.error.code] ?? 'Error.'
        if (msg.a !== 'estado') me.balance = (await db.query(`select saldo from public.juegos_cuentas where usuario_id = $1`, [user.id])).rows[0].saldo
        return reply
      }
      case 'chat_poll':
        reply.chat = await chatSince(account.mesa, msg.chatAfter)
        return reply
      default: {
        const action = Object.hasOwn(TABLE_ACTIONS, msg.t) ? TABLE_ACTIONS[msg.t] : null
        if (!action) throw new JuegosError('BAD_MESSAGE')
        if (!account.mesa) {
          reply.state = null
          if (msg.t !== 'leave_room' && msg.t !== 'view' && msg.t !== 'tick') reply.error = { code: 'BAD_PHASE', message: ERRORS.BAD_PHASE }
          reply.lobby = await lobby(user)
          return reply
        }
        const quiet = msg.t === 'view' || msg.t === 'tick'
        const outcome = (quiet && (await peekTable(account.mesa, user))) || (await withTable(account.mesa, user, (room, session) => action(room, session, msg)))
        // Pase: una mano de blackjack o una partida de ajedrez (al confirmar «listo») o una jugada de póker.
        const tableGame = outcome.view?.game
        const counts = (msg.t === 'ready' && (tableGame === 'blackjack' || tableGame === 'chess')) || (msg.t === 'action' && tableGame === 'poker')
        if (counts && !outcome.error) reply.paseEvent = await pase.record(user.id, tableGame)
        if (msg.t === 'leave_room') {
          reply.state = null
          ;[reply.lobby] = await Promise.all([lobby(user), outcome.sent])
          return reply
        }
        return tableReply(outcome, account.mesa)
      }
    }
  }

  // La «Mesa 1» de cada juego existe siempre.
  let tablesReady = false
  async function ensurePublicTables() {
    if (tablesReady) return
    const { rows } = await db.query(`select juego, codigo from public.juegos_mesas where persistente`)
    // El ajedrez llegó después: en una base de datos de antes, el check de juegos_mesas aún no lo admite
    // (supabase/migracion_juegos_ajedrez.sql). Solo pasa la primera vez, cuando falta su «Mesa 1».
    if (!rows.some((r) => r.juego === 'chess')) await db.query(CHESS_CHECK_SQL)
    for (const game of GAMES) {
      if (!rows.some((r) => r.juego === game)) await createTable(game, 1, new Set(rows.map((r) => r.codigo)))
    }
    tablesReady = true
  }

  // Arranque (esquema, semana, «Mesa 1»): cacheado por instancia. La función de Vercel lo lanza a la vez que la
  // comprobación del usuario; en caliente no hace ninguna consulta.
  async function warm() {
    await ensureSchema()
    await Promise.all([rollover(weekOf(now())), ensurePublicTables()])
  }

  return { warm, handle }
}
