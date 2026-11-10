// Pase de temporada, ahora el de la Season 5 («Pase de Navidad»): lo que da motivos para entrar cada día. No se reinicia el domingo, dura toda
// la temporada (una fila por jugador en juegos_pase; si «temporada» no es la actual, se empieza de cero).
//   - Experiencia (XP): cada jugada da PLAY_XP, hasta PLAY_CAP jugadas al día. Las misiones del día dan más.
//   - Misiones diarias: tres por persona y día (una general y dos de juegos concretos), las mismas todo el día. Salen de
//     un HMAC con el secreto del servidor, así que no hace falta guardarlas. Completar las tres da un bonus en € y XP.
//   - Racha: un regalo gratis una vez al día; si lo abres días seguidos, la racha sube y el regalo da más (hasta 7 días).
//   - Niveles: cada LEVEL_XP sube uno, hasta LEVELS. Cada nivel tiene un premio en € que hay que reclamar; los de cada
//     5 niveles son más gordos y dan un título que se ve en el Score.
// Los € van al saldo de la semana con move() (cuentan en el Score, como cualquier premio).
import { createHmac } from 'node:crypto'
import { weekOf } from './engine/week.mjs'

// Cambiar el id empieza el pase de cero para todos (las filas con otra temporada se reinician al leerlas).
export const SEASON = { id: 's5', name: 'Season 5 · Navidad', ends: Date.UTC(2027, 0, 10, 23, 59) }
export const LEVELS = 30
export const LEVEL_XP = 400
const PLAY_XP = 10
const PLAY_CAP = 30
const STREAK_XP = 50
const STREAK_EUR = 300 // por día de racha, hasta STREAK_MAX
const STREAK_MAX = 7
const BONUS_XP = 150
const BONUS_EUR = 1500

export const PASE_ERRORS = {
  PASE_CLAIMED: 'Ya has abierto el regalo de hoy. Vuelve mañana para seguir la racha.',
  PASE_LOCKED: 'Aún no has llegado a ese nivel.',
  PASE_NOTHING: 'No tienes premios por reclamar.',
}

// Títulos de los niveles redondos (y el de quien empieza).
const TITLES = [
  [30, 'Rey Mago'],
  [25, 'Papá Noel'],
  [20, 'Elfo mayor'],
  [15, 'Turronero'],
  [10, 'Pastorcillo'],
  [5, 'Duende'],
  [0, 'Recién llegado'],
]
export const titleOf = (level) => TITLES.find(([min]) => level >= min)[1]
export const levelOf = (xp) => Math.min(LEVELS, Math.floor(Math.max(0, xp) / LEVEL_XP))

const MILESTONE_EUR = { 5: 4000, 10: 6000, 15: 8000, 20: 10000, 25: 12000, 30: 20000 }
export const rewardOf = (level) => MILESTONE_EUR[level] ?? 500 + 50 * level

// Misiones. kind: any (cualquier jugada), distinct (juegos distintos), win (jugadas ganadas) o game (un juego concreto).
const GENERAL = [
  { id: 'any20', kind: 'any', goal: 20, xp: 150, text: 'Haz 20 jugadas en cualquier juego' },
  { id: 'distinct3', kind: 'distinct', goal: 3, xp: 150, text: 'Juega a 3 juegos distintos' },
  { id: 'distinct5', kind: 'distinct', goal: 5, xp: 220, text: 'Juega a 5 juegos distintos' },
  { id: 'win5', kind: 'win', goal: 5, xp: 160, text: 'Gana 5 jugadas en solitario' },
]
const BY_GAME = [
  { id: 'roulette', goal: 5, xp: 110, text: 'Apuesta en 5 tiradas de la Ruleta' },
  { id: 'crash', goal: 5, xp: 110, text: 'Vuela en 5 cohetes' },
  { id: 'race', goal: 3, xp: 110, text: 'Apuesta en 3 carreras' },
  { id: 'regatta', goal: 3, xp: 110, text: 'Apuesta en 3 regatas' },
  { id: 'plinko', goal: 15, xp: 100, text: 'Suelta 15 bolas en el Plinko' },
  { id: 'frog', goal: 5, xp: 100, text: 'Juega 5 partidas a la Rana' },
  { id: 'fish', goal: 3, xp: 130, text: 'Juega 3 partidas a Pez Gordo' },
  { id: 'dig', goal: 4, xp: 120, text: 'Busca el tesoro 4 veces en la Arena' },
  { id: 'dive', goal: 3, xp: 120, text: 'Haz 3 inmersiones de apnea' },
  { id: 'pesca', goal: 2, xp: 140, text: 'Pesca en 2 Campeonatos de Pesca' },
  { id: 'hilo', goal: 4, xp: 120, text: 'Juega 4 partidas a Mayor o Menor' },
  { id: 'bola', goal: 6, xp: 110, text: 'Tira 6 bolas en la Bola Canaria' },
  { id: 'tower', goal: 3, xp: 120, text: 'Sube 3 veces a la Torre' },
  { id: 'heist', goal: 2, xp: 130, text: 'Da 2 golpes en el Atraco' },
  { id: 'bingo', goal: 2, xp: 120, text: 'Compra cartones en 2 partidas de Bingo' },
  { id: 'auction', goal: 3, xp: 120, text: 'Puja 3 veces en la Subasta' },
  { id: 'elevator', goal: 3, xp: 110, text: 'Sube 3 veces al Ascensor' },
  { id: 'blackjack', goal: 5, xp: 130, text: 'Juega 5 manos de Blackjack en la mesa' },
  { id: 'poker', goal: 12, xp: 140, text: 'Haz 12 jugadas en la mesa de Póker' },
  { id: 'chess', goal: 1, xp: 160, text: 'Juega una partida de Ajedrez' },
  { id: 'gacha', goal: 1, xp: 120, text: 'Tira una vez en el Gacha' },
].map((m) => ({ ...m, kind: 'game', game: m.id, id: `g-${m.id}` }))

const isoPlus = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
// Día de juego (el mismo corte que la semana: las 23:59 de Canarias), como «2026-11-04».
export function dayKey(t) {
  const week = weekOf(t)
  return isoPlus(week.key, week.day)
}

// Las tres misiones del día de una persona: una general y dos de juegos distintos, siempre las mismas ese día. Nunca de un
// juego que la banca ha quitado del selector (hidden: sus ids).
export function missionsFor(secret, userId, day, hidden = []) {
  const h = createHmac('sha256', secret).update(`pase:${SEASON.id}:${userId}:${day}`).digest()
  const general = GENERAL[h.readUInt32BE(0) % GENERAL.length]
  const open = BY_GAME.filter((m) => !hidden.includes(m.game))
  const pool = open.length >= 2 ? open : BY_GAME
  const first = h.readUInt32BE(4) % pool.length
  let second = h.readUInt32BE(8) % (pool.length - 1)
  if (second >= first) second++
  return [general, pool[first], pool[second]]
}

function progressOf(mission, st) {
  if (mission.kind === 'any') return st.jugadas
  if (mission.kind === 'distinct') return st.juegos.length
  return st.progreso[mission.id] ?? 0
}

// Fila de la BD a estado de trabajo, con la temporada y el día al día.
function fresh(row, day) {
  const st = {
    xp: 0,
    dia: day,
    jugadas: 0,
    juegos: [],
    progreso: {},
    hechas: [],
    bonus: false,
    racha: 0,
    rachaDia: null,
    reclamados: [],
  }
  if (!row || row.temporada !== SEASON.id) return st
  Object.assign(st, {
    xp: Number(row.xp),
    racha: row.racha,
    rachaDia: row.racha_dia,
    reclamados: row.reclamados ?? [],
  })
  if (row.dia === day) {
    Object.assign(st, { jugadas: row.jugadas, juegos: row.juegos ?? [], progreso: row.progreso ?? {}, hechas: row.hechas ?? [], bonus: row.bonus })
  }
  return st
}

export function createPase({ db, now, secret, move, hidden = () => [] }) {
  async function load(q, userId, day) {
    const row = (await q(`select * from public.juegos_pase where usuario_id = $1 for update`, [userId])).rows[0]
    return fresh(row, day)
  }

  async function save(q, userId, st) {
    await q(
      `insert into public.juegos_pase (usuario_id, temporada, xp, dia, jugadas, juegos, progreso, hechas, bonus, racha, racha_dia, reclamados)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (usuario_id) do update set temporada = excluded.temporada, xp = excluded.xp, dia = excluded.dia,
         jugadas = excluded.jugadas, juegos = excluded.juegos, progreso = excluded.progreso, hechas = excluded.hechas,
         bonus = excluded.bonus, racha = excluded.racha, racha_dia = excluded.racha_dia, reclamados = excluded.reclamados,
         actualizado = now()`,
      [
        userId,
        SEASON.id,
        st.xp,
        st.dia,
        st.jugadas,
        JSON.stringify(st.juegos),
        JSON.stringify(st.progreso),
        JSON.stringify(st.hechas),
        st.bonus,
        st.racha,
        st.rachaDia,
        JSON.stringify(st.reclamados),
      ],
    )
  }

  function view(userId, st, day) {
    const level = levelOf(st.xp)
    const missions = missionsFor(secret, userId, day, hidden()).map((m) => ({
      id: m.id,
      text: m.text,
      game: m.game ?? null,
      goal: m.goal,
      xp: m.xp,
      progress: Math.min(m.goal, progressOf(m, st)),
      done: st.hechas.includes(m.id),
    }))
    const yesterday = isoPlus(day, -1)
    // La racha sigue viva si el último cofre fue hoy o ayer; si no, el próximo cofre empieza de 1.
    const alive = st.rachaDia === day || st.rachaDia === yesterday
    const streak = alive ? st.racha : 0
    const next = st.rachaDia === day ? null : Math.min(STREAK_MAX, streak + 1)
    return {
      season: SEASON,
      xp: st.xp,
      level,
      maxLevel: LEVELS,
      levelXp: level >= LEVELS ? LEVEL_XP : st.xp - level * LEVEL_XP,
      perLevel: LEVEL_XP,
      title: titleOf(level),
      missions,
      bonus: { done: st.bonus, xp: BONUS_XP, eur: BONUS_EUR },
      plays: { today: st.jugadas, cap: PLAY_CAP, xp: PLAY_XP },
      streak: { days: streak, claimed: st.rachaDia === day, next: next && { day: next, eur: STREAK_EUR * next, xp: STREAK_XP } },
      rewards: Array.from({ length: LEVELS }, (_, i) => {
        const n = i + 1
        const title = TITLES.find(([min]) => min === n)?.[1] ?? null
        return { level: n, eur: rewardOf(n), title, unlocked: n <= level, claimed: st.reclamados.includes(n) }
      }),
    }
  }

  // Una jugada hecha (ya guardada): suma XP y avanza las misiones. Devuelve lo que hay que celebrar en el navegador, o
  // null si no hubo nada. Va en su propia transacción: si falla, la jugada ya está hecha y solo se pierde la XP.
  async function record(userId, game, { win = false } = {}) {
    const day = dayKey(now())
    try {
      return await db.tx(async (q) => {
        const st = await load(q, userId, day)
        const before = levelOf(st.xp)
        let gained = st.jugadas < PLAY_CAP ? PLAY_XP : 0
        st.jugadas++
        if (!st.juegos.includes(game)) st.juegos.push(game)
        const done = []
        for (const m of missionsFor(secret, userId, day, hidden())) {
          if (st.hechas.includes(m.id)) continue
          if (m.kind === 'game' && m.game === game) st.progreso[m.id] = (st.progreso[m.id] ?? 0) + 1
          if (m.kind === 'win' && win) st.progreso[m.id] = (st.progreso[m.id] ?? 0) + 1
          if (progressOf(m, st) >= m.goal) {
            st.hechas.push(m.id)
            gained += m.xp
            done.push({ text: m.text, xp: m.xp })
          }
        }
        let bonus = null
        if (!st.bonus && st.hechas.length >= 3) {
          st.bonus = true
          gained += BONUS_XP
          await move(q, { [userId]: BONUS_EUR })
          bonus = { xp: BONUS_XP, eur: BONUS_EUR }
        }
        st.xp += gained
        await save(q, userId, st)
        const after = levelOf(st.xp)
        if (!done.length && !bonus && after === before) return { gained }
        return { gained, done, bonus, levelUp: after > before ? { level: after, title: titleOf(after), newTitle: titleOf(after) !== titleOf(before) } : null }
      })
    } catch (error) {
      console.error('pase:', error)
      return null
    }
  }

  // msg.a: estado | racha | reclamar { nivel? } (sin nivel, todos los que haya desbloqueados)
  async function handle(user, msg, reply) {
    const day = dayKey(now())
    let error = null
    const out = await db.tx(async (q) => {
      const st = await load(q, user.id, day)
      if (msg.a === 'racha') {
        if (st.rachaDia === day) error = 'PASE_CLAIMED'
        else {
          const streak = st.rachaDia === isoPlus(day, -1) ? Math.min(STREAK_MAX, st.racha + 1) : 1
          st.racha = streak
          st.rachaDia = day
          st.xp += STREAK_XP
          await move(q, { [user.id]: STREAK_EUR * streak })
          await save(q, user.id, st)
          reply.paseEvent = { gained: STREAK_XP, chest: { day: streak, eur: STREAK_EUR * streak } }
        }
      } else if (msg.a === 'reclamar') {
        const level = levelOf(st.xp)
        const wanted = msg.nivel === undefined ? Array.from({ length: level }, (_, i) => i + 1) : [msg.nivel]
        if (wanted.some((n) => !Number.isSafeInteger(n) || n < 1 || n > LEVELS)) error = 'BAD_MESSAGE'
        else if (wanted.some((n) => n > level)) error = 'PASE_LOCKED'
        else {
          const todo = wanted.filter((n) => !st.reclamados.includes(n))
          if (!todo.length) error = 'PASE_NOTHING'
          else {
            const eur = todo.reduce((sum, n) => sum + rewardOf(n), 0)
            st.reclamados.push(...todo)
            await move(q, { [user.id]: eur })
            await save(q, user.id, st)
            reply.paseEvent = { gained: 0, claimed: { levels: todo, eur } }
          }
        }
      } else if (msg.a !== 'estado') error = 'BAD_MESSAGE'
      return view(user.id, st, day)
    })
    reply.pase = out
    if (error) reply.error = { code: error }
  }

  // Nivel del pase de una lista de jugadores (para el Score).
  async function levels(ids) {
    if (!ids.length) return new Map()
    const { rows } = await db.query(`select usuario_id, xp from public.juegos_pase where usuario_id = any($1::uuid[]) and temporada = $2`, [ids, SEASON.id])
    return new Map(rows.map((r) => [r.usuario_id, levelOf(Number(r.xp))]))
  }

  return { handle, record, levels }
}

export const PASE_SQL = `
create table if not exists public.juegos_pase (
  usuario_id  uuid primary key references public.usuarios(id) on delete cascade,
  temporada   text not null,
  xp          integer not null default 0,
  dia         text,
  jugadas     integer not null default 0,
  juegos      jsonb not null default '[]'::jsonb,
  progreso    jsonb not null default '{}'::jsonb,
  hechas      jsonb not null default '[]'::jsonb,
  bonus       boolean not null default false,
  racha       integer not null default 0,
  racha_dia   text,
  reclamados  jsonb not null default '[]'::jsonb,
  actualizado timestamptz not null default now()
);
alter table public.juegos_pase enable row level security;
`
