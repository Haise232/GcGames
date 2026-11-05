// La banca de Juegos: el master (usuarios.es_superadmin, solo hay uno) da dinero, manda mensajes a nombre de
// la banca y activa el Admin Abuse. Todo lo comprueba el servidor: el botón del navegador solo lo enseña.
//
// Mensajes (msg.t):
//   banca         cualquiera: tus avisos sin ver, el Admin Abuse activo, si el bote del bingo está abierto y si eres el master
//   banca_visto   cualquiera: { hasta } marca vistos tus avisos hasta ese id
//   banca_declarar cualquiera: { eleccion: 'pagar' | 'fraude' } contesta la declaración pendiente de Hacienda
//   banca_gente   master: jugadores a los que dar dinero o escribir
//   banca_dar     master: { para: id | 'todos', importe, texto? }
//   banca_mensaje master: { para: id | 'todos', texto }
//   banca_abuso   master: { modo: 'x2' | 'x3' | 'gratis' | null, ambito: 'todo' | 'poker', minutos }
//   banca_bote    master: sin más, el estado del bote del bingo; { minutos: 30 | 60 | 120 | 240 | null, una } lo abre
//                 (null: sin límite; una: se cierra en cuanto alguien se lo lleve) y { cerrar: true } lo cierra
//   banca_hacienda master: { pct, desde } redada de Hacienda a todos los que tengan «desde» o más (ver hacienda.mjs)
//   banca_cuentas master: sin más, las cuentas nuevas que esperan; { id, aceptar: true | false } acepta o rechaza una
//   banca_usuarios master: todas las cuentas con su email, estado y último acceso
//   banca_password master: { id } le pone una contraseña temporal (la devuelve una vez) y le obliga a cambiarla al entrar
//   banca_juegos  master: sin más, los juegos ocultos; { ocultos: [id…] } cambia cuáles se quitan del selector
//
// Juegos ocultos (juegos_meta.ocultos): el master quita juegos del selector para una temporada sin borrar nada (partidas,
// cartas, propiedades… siguen ahí) y los vuelve a poner cuando quiera. Llega a todos con el lobby (lobby.hidden).
//
// Admin Abuse (juegos_meta.abuso): x2 y x3 multiplican lo que ganas en una jugada (la banca paga la diferencia) y dan
// más suerte donde el sorteo es de cada uno (plinko, laberinto y cartones gratis en el bingo; en la rana no: devolvía
// más del 500 %; en el gacha tampoco: tirar y vender salía rentable); «gratis»
// devuelve lo que pierdes. Ámbito: todos los juegos o solo el póker.
// Lo que da la banca es saldo normal: cuenta en el Score.

import { randomInt } from 'node:crypto'

export const BANK_TOPIC = 'juegos-banca' // aviso de Realtime: «la banca tiene algo nuevo» (sin datos)
export const ABUSE_MODES = new Set(['x2', 'x3', 'gratis'])
export const ABUSE_MINUTES = [5, 10, 30, 60]
const MAX_GIFT = 1_000_000
const MAX_TEXT = 300
// Contraseñas temporales: fáciles de dictar (sin 0/O ni 1/l/I) y con 12 caracteres al azar (unos 70 bits).
const TEMP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
const TEMP_LENGTH = 12
const ABUSE_TTL_MS = 3000 // cada instancia de la función relee el Admin Abuse como mucho cada este rato
const MASTER_TTL_MS = 60000
const POT_TTL_MS = 3000 // como el Admin Abuse: el estado del bote se relee como mucho cada este rato
const HIDDEN_TTL_MS = 3000 // igual con los juegos ocultos

// Los juegos que se pueden quitar del selector (los ids de Juegos.jsx).
export const HIDEABLE = [
  'elevator', 'auction', 'roulette', 'crash', 'race', 'regatta',
  'fish', 'dig', 'dive', 'tower', 'heist', 'plinko', 'frog',
  'scratch', 'hilo', 'bola',
  'blackjack', 'poker', 'chess',
  'bingo', 'gacha', 'inmo', 'suiza',
]
const HIDEABLE_SET = new Set(HIDEABLE)
// La columna llegó después del esquema: en una base de datos de antes se añade la primera vez que hace falta.
const HIDDEN_SQL = `alter table public.juegos_meta add column if not exists ocultos jsonb not null default '[]'::jsonb`

// ¿Afecta el Admin Abuse a este juego? (póker, blackjack, roulette, crash, race, plinko, frog, dungeon, gacha, bingo,
// tower, heist, auction, bridge, elevator)
export const abuseOn = (abuse, game) => Boolean(abuse) && (abuse.ambito === 'todo' || game === 'poker')

// Lo que pone la banca encima de una jugada que acaba con `net` (ganancia neta; negativa si pierdes).
export function abuseExtra(abuse, game, net) {
  if (!abuseOn(abuse, game) || !Number.isFinite(net)) return 0
  if (abuse.modo === 'gratis') return net < 0 ? -net : 0
  const mult = abuse.modo === 'x3' ? 3 : 2
  return net > 0 ? Math.floor(net * (mult - 1)) : 0
}

// Suerte: 1, 2 o 3, en plinko, laberinto y bingo (ver solo.mjs y bingo.mjs).
export const abuseLuck = (abuse, game) => (abuseOn(abuse, game) && abuse.modo !== 'gratis' ? (abuse.modo === 'x3' ? 3 : 2) : 1)

const cleanText = (text) =>
  typeof text === 'string'
    ? text
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim()
        .slice(0, MAX_TEXT)
    : ''

export function createBanca({ db, ping, now, credit, pot, hacienda }) {
  let abuseCache = { at: -Infinity, value: null }
  let potCache = { at: -Infinity, value: null }
  let hiddenCache = { at: -Infinity, value: [] }

  async function readHidden() {
    try {
      return (await db.query(`select ocultos from public.juegos_meta where id = 1`)).rows[0]?.ocultos ?? []
    } catch (error) {
      if (error?.code !== '42703') throw error // 42703: aún no existe la columna
      await db.query(HIDDEN_SQL)
      return []
    }
  }

  // Los juegos ocultos (ids), con una caché corta: van en cada lobby.
  async function hidden() {
    const t = now()
    if (t - hiddenCache.at > HIDDEN_TTL_MS) {
      const list = await readHidden()
      hiddenCache = { at: t, value: Array.isArray(list) ? list.filter((id) => HIDEABLE_SET.has(id)) : [] }
    }
    return hiddenCache.value
  }

  // Sin consultar (para las misiones del pase, dentro de una transacción). handle() de game.mjs lo refresca.
  const hiddenNow = () => hiddenCache.value

  // El bote del bingo tal y como lo anuncia la banca a todos: abierto o no, desde y hasta cuándo y lo que hay en la jaula.
  async function potPublic() {
    const t = now()
    if (t - potCache.at > POT_TTL_MS) {
      const { abierto, desde, hasta, una, pot: amount } = await pot().potAdmin()
      potCache = { at: t, value: abierto ? { desde, hasta, una, pot: amount } : null }
    }
    const value = potCache.value
    return value && (value.hasta === null || value.hasta > t) ? value : null
  }
  const masters = new Map()

  // El Admin Abuse activo (o null), con una caché corta: lo miran todas las jugadas.
  async function abuse() {
    const t = now()
    if (t - abuseCache.at > ABUSE_TTL_MS) {
      const { rows } = await db.query(`select abuso from public.juegos_meta where id = 1`)
      abuseCache = { at: t, value: rows[0]?.abuso ?? null }
    }
    const value = abuseCache.value
    return value && value.hasta > t ? value : null
  }

  // El último Admin Abuse leído, sin consultar (para usarlo dentro de una transacción: una consulta aparte ahí podría
  // quedarse esperando por una conexión libre). handle() de game.mjs lo refresca con abuse() al empezar cada petición.
  function cached() {
    const value = abuseCache.value
    return value && value.hasta > now() ? value : null
  }

  async function isMaster(userId) {
    const hit = masters.get(userId)
    if (hit && hit.until > Date.now()) return hit.value
    const { rows } = await db.query(`select es_superadmin from public.usuarios where id = $1`, [userId])
    const value = rows[0]?.es_superadmin === true
    masters.set(userId, { value, until: Date.now() + MASTER_TTL_MS })
    return value
  }

  // Avisos sin ver: los tuyos y los de todos, de los últimos 2 días, como mucho 10.
  async function status(user) {
    const [vistos, ab, master, bote, fisco] = await Promise.all([
      db.query(`select ultimo from public.juegos_avisos_vistos where usuario_id = $1`, [user.id]),
      abuse(),
      isMaster(user.id),
      potPublic(),
      hacienda().pending(user.id),
    ])
    const after = Number(vistos.rows[0]?.ultimo ?? 0)
    const { rows } = await db.query(
      `select id, tipo, importe, texto, datos, usuario_id is null as todos from public.juegos_avisos
       where id > $2 and (usuario_id = $1 or usuario_id is null) and tipo <> 'hacienda_todos' and creado > now() - interval '2 days'
       order by id limit 10`,
      [user.id, after],
    )
    return {
      banca: {
        avisos: rows.map((r) => ({
          id: Number(r.id),
          tipo: r.tipo,
          importe: r.importe === null ? null : Number(r.importe),
          texto: r.texto,
          datos: r.datos ?? null,
          todos: r.todos,
        })),
        hacienda: fisco.declaracion,
        carcel: fisco.carcel,
        abuso: ab,
        boteAbierto: bote,
        master,
        ahora: now(),
      },
    }
  }

  async function seen(user, msg) {
    const hasta = Number(msg.hasta)
    if (!Number.isSafeInteger(hasta) || hasta <= 0) return { error: 'BAD_MESSAGE' }
    await db.query(
      `insert into public.juegos_avisos_vistos (usuario_id, ultimo) values ($1, $2)
       on conflict (usuario_id) do update set ultimo = greatest(juegos_avisos_vistos.ultimo, excluded.ultimo)`,
      [user.id, hasta],
    )
    return { banca: { visto: hasta } }
  }

  // Destinatarios: todos los aprobados o uno concreto (que tiene que existir y estar aprobado).
  async function recipients(q, para) {
    if (para === 'todos') {
      return (await q(`select id, nombre, avatar_url from public.usuarios where estado_acceso = 'aprobado'`)).rows
    }
    if (typeof para !== 'string' || !/^[0-9a-f-]{36}$/i.test(para)) return null
    const rows = (await q(`select id, nombre, avatar_url from public.usuarios where id = $1 and estado_acceso = 'aprobado'`, [para])).rows
    return rows.length ? rows : null
  }

  // Jugadores (para elegir a quién) y los últimos movimientos de la banca.
  async function people() {
    const [gente, hist] = await Promise.all([
      db.query(
        `select u.id, u.nombre as name, u.avatar_url as avatar, c.saldo as balance
         from public.usuarios u left join public.juegos_cuentas c on c.usuario_id = u.id
         where u.estado_acceso = 'aprobado' order by u.nombre`,
      ),
      db.query(
        `select a.id, a.tipo, a.importe, a.texto, extract(epoch from a.creado) * 1000 as at, u.nombre as name
         from public.juegos_avisos a left join public.usuarios u on u.id = coalesce(a.sujeto, a.usuario_id)
         where a.tipo <> 'hacienda' order by a.id desc limit 8`,
      ),
    ])
    return {
      banca: {
        gente: gente.rows.map((r) => ({ id: r.id, name: r.name, avatar: r.avatar ?? null, balance: r.balance === null ? null : Number(r.balance) })),
        historial: hist.rows.map((r) => ({
          id: Number(r.id),
          tipo: r.tipo,
          importe: r.importe === null ? null : Number(r.importe),
          texto: r.texto,
          at: Math.round(Number(r.at)),
          para: r.name ?? (r.tipo === 'hacienda_todos' ? r.texto : null), // null: para todos (en una redada, a cuántos)
        })),
      },
    }
  }

  async function give(user, msg) {
    const importe = Number(msg.importe)
    if (!Number.isSafeInteger(importe) || importe <= 0 || importe > MAX_GIFT) return { error: 'BAD_MESSAGE' }
    const texto = cleanText(msg.texto) || null
    const sent = await db.tx(async (q) => {
      const list = await recipients(q, msg.para)
      if (!list) return null
      await credit(q, list, importe)
      await q(`insert into public.juegos_avisos (usuario_id, tipo, importe, texto) values ($1, 'dinero', $2, $3)`, [msg.para === 'todos' ? null : list[0].id, importe, texto])
      return list.length
    })
    if (sent === null) return { error: 'BAD_MESSAGE' }
    await Promise.all([ping(BANK_TOPIC), ping('juegos-lobby')])
    return { banca: { hecho: 'dinero', personas: sent, importe } }
  }

  async function message(user, msg) {
    const texto = cleanText(msg.texto)
    if (!texto) return { error: 'BAD_MESSAGE' }
    const sent = await db.tx(async (q) => {
      const list = await recipients(q, msg.para)
      if (!list) return null
      await q(`insert into public.juegos_avisos (usuario_id, tipo, texto) values ($1, 'mensaje', $2)`, [msg.para === 'todos' ? null : list[0].id, texto])
      return list.length
    })
    if (sent === null) return { error: 'BAD_MESSAGE' }
    await ping(BANK_TOPIC)
    return { banca: { hecho: 'mensaje', personas: sent } }
  }

  async function setAbuse(user, msg) {
    let value = null
    if (msg.modo !== null) {
      if (!ABUSE_MODES.has(msg.modo)) return { error: 'BAD_MESSAGE' }
      if (msg.ambito !== 'todo' && msg.ambito !== 'poker') return { error: 'BAD_MESSAGE' }
      if (!ABUSE_MINUTES.includes(msg.minutos)) return { error: 'BAD_MESSAGE' }
      const t = now()
      value = { modo: msg.modo, ambito: msg.ambito, desde: t, hasta: t + msg.minutos * 60000 }
    }
    await db.query(`update public.juegos_meta set abuso = $1 where id = 1`, [value])
    abuseCache = { at: now(), value }
    await Promise.all([ping(BANK_TOPIC), ping('juegos-lobby')])
    return { banca: { abuso: value } }
  }

  // El bote del bingo: abrirlo o cerrarlo vale desde la próxima partida que cierre la venta.
  async function jackpot(user, msg) {
    if (msg.cerrar === true || 'minutos' in msg) {
      const state = await pot().setPot({ cerrar: msg.cerrar === true, minutos: msg.minutos, una: msg.una })
      if (!state) return { error: 'BAD_MESSAGE' }
      potCache = { at: -Infinity, value: null }
      await Promise.all([ping(BANK_TOPIC), ping('juegos-lobby')])
    }
    return { banca: { bote: await pot().potAdmin() } }
  }

  // Redada de Hacienda: un porcentaje del saldo de todos los que pasen de cierta cantidad, a la jaula del bingo.
  async function raid(user, msg) {
    const out = await hacienda().raid(msg.pct, msg.desde)
    if (!out) return { error: 'BAD_MESSAGE' }
    return { banca: { redada: out } }
  }

  async function declare(user, msg) {
    const out = await hacienda().decide(user, msg.eleccion)
    if (out.error) return out
    return { banca: { declaracion: out } }
  }

  // Quitar juegos del selector (o volver a ponerlos). Sin «ocultos», solo devuelve la lista.
  async function games(user, msg) {
    if (msg.ocultos !== undefined) {
      if (!Array.isArray(msg.ocultos) || !msg.ocultos.every((id) => HIDEABLE_SET.has(id))) return { error: 'BAD_MESSAGE' }
      const list = HIDEABLE.filter((id) => msg.ocultos.includes(id))
      await readHidden() // por si falta la columna
      await db.query(`update public.juegos_meta set ocultos = $1::jsonb where id = 1`, [JSON.stringify(list)])
      hiddenCache = { at: now(), value: list }
      await ping('juegos-lobby')
      return { banca: { ocultos: list } }
    }
    return { banca: { ocultos: await hidden() } }
  }

  // Cuentas nuevas: quien se registra queda «pendiente» hasta que el master la acepta (o la rechaza).
  async function accounts(user, msg) {
    if (msg.id !== undefined) {
      if (typeof msg.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(msg.id) || typeof msg.aceptar !== 'boolean') return { error: 'BAD_MESSAGE' }
      await db.query(`update public.usuarios set estado_acceso = $2 where id = $1 and estado_acceso = 'pendiente'`, [
        msg.id,
        msg.aceptar ? 'aprobado' : 'rechazado',
      ])
    }
    const { rows } = await db.query(
      `select id, nombre as name, email, extract(epoch from created_at) * 1000 as at from public.usuarios
       where estado_acceso = 'pendiente' order by created_at`,
    )
    return { banca: { pendientes: rows.map((r) => ({ id: r.id, name: r.name, email: r.email, at: Math.round(Number(r.at)) })) } }
  }

  async function users() {
    const { rows } = await db.query(`select * from public.juegos_usuarios_admin()`)
    return {
      banca: {
        usuarios: rows.map((r) => ({
          id: r.id,
          name: r.nombre,
          email: r.email,
          avatar: r.avatar_url ?? null,
          estado: r.estado_acceso,
          master: r.es_superadmin,
          temporal: r.debe_cambiar_password,
          creado: r.creado ? new Date(r.creado).getTime() : null,
          acceso: r.ultimo_acceso ? new Date(r.ultimo_acceso).getTime() : null,
        })),
      },
    }
  }

  // Contraseña temporal para quien la olvidó. Se genera aquí, se guarda solo su hash (Supabase Auth) y el master la ve
  // una vez para pasársela; al entrar con ella, la app obliga a elegir otra.
  async function tempPassword(user, msg) {
    if (typeof msg.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(msg.id) || msg.id === user.id) return { error: 'BAD_MESSAGE' }
    const temporal = Array.from({ length: TEMP_LENGTH }, () => TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]).join('')
    const { rows } = await db.query(`select public.juegos_password_temporal($1, $2) as ok`, [msg.id, temporal])
    if (!rows[0]?.ok) return { error: 'BAD_MESSAGE' }
    return { banca: { temporal, para: msg.id } }
  }

  const MASTER_ONLY = { banca_usuarios: users, banca_password: tempPassword, banca_cuentas: accounts, banca_gente: people, banca_dar: give, banca_mensaje: message, banca_abuso: setAbuse, banca_bote: jackpot, banca_hacienda: raid, banca_juegos: games }

  async function handle(user, msg) {
    if (msg.t === 'banca') return status(user)
    if (msg.t === 'banca_visto') return seen(user, msg)
    if (msg.t === 'banca_declarar') return declare(user, msg)
    const fn = MASTER_ONLY[msg.t]
    if (!fn) return { error: 'BAD_MESSAGE' }
    if (!(await isMaster(user.id))) return { error: 'NOT_MASTER' }
    return fn(user, msg)
  }

  // Limpieza: avisos de hace más de 7 días (se llama en el reinicio semanal).
  const sweep = (q) => q(`delete from public.juegos_avisos where creado < now() - interval '7 days'`)

  return { handle, abuse, cached, hidden, hiddenNow, sweep }
}
